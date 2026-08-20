// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { Movie } from '../models/Movie';
import { Series } from '../models/Series';
import { fixPosters } from '../utils/poster';
import { MetadataService } from '../services/MetadataService';
import { MediaScannerService } from '../services/MediaScannerService';
import { logger } from '../utils/logger';
import type { AuthRequest } from '../types';

const router = Router();
const COMPONENT = 'LibraryRoute';
router.use(authenticateToken);

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const movies = await Movie.find({ status: 'available' }).sort({ addedAt: -1 });
    const series = await Series.find({ status: 'available' }).sort({ addedAt: -1 });
    const [enrichedMovies, enrichedSeries] = await Promise.all([
      MetadataService.enrichMovies(movies.map(m => m.toObject())),
      MetadataService.enrichSeriesItems(series.map(s => s.toObject())),
    ]);
    res.json({
      movies: fixPosters(enrichedMovies, 'movie'),
      series: fixPosters(enrichedSeries, 'series'),
    });
  } catch {
    res.status(500).json({ error: 'Erro ao carregar biblioteca' });
  }
});

/**
 * POST /api/library/scan
 * Escaneia as pastas /media/movies e /media/series e importa
 * mídias existentes no disco que ainda não estão na biblioteca.
 */
router.post('/scan', async (_req: AuthRequest, res: Response) => {
  try {
    logger.info(COMPONENT, 'Manual scan triggered');
    
    // Roda em background para não travar a resposta
    const scanPromise = MediaScannerService.scanAllMedia();
    
    // Aguarda até 30s pelo scan
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Scan timeout')), 30000)
    );

    const result = await Promise.race([scanPromise, timeoutPromise]) as any;
    
    logger.info(COMPONENT, `Scan result: ${result.moviesImported} movies, ${result.seriesImported} series`);
    
    res.json({
      success: true,
      ...result,
      message: `Importados ${result.moviesImported} filmes e ${result.seriesImported} séries do disco`,
    });
  } catch (err: any) {
    // Se deu timeout, retorna o que conseguiu até agora
    if (err.message === 'Scan timeout') {
      res.json({
        success: true,
        partial: true,
        message: 'Scan ainda em execução em background. Recarregue a página para ver resultados.',
      });
      // Continua rodando em background
      MediaScannerService.scanAllMedia().catch(e =>
        logger.error(COMPONENT, 'Background scan error', { error: e.message })
      );
      return;
    }
    logger.error(COMPONENT, 'Scan error', { error: err.message });
    res.status(500).json({ error: 'Erro ao escanear mídias' });
  }
});

export default router;
