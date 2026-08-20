// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { deduplicateMedia, cleanupOrphans, verifySync, DEFAULT_VERIFY_TITLES } from '../services/MaintenanceService';
import { invalidateRecommendationsCache } from './recommendations';
import { logger } from '../utils/logger';
import type { AuthRequest } from '../types';

const COMPONENT = 'DebugRoute';
const router = Router();

// Rotas de debug/manutenção — restritas a administradores
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/debug/verify-sync
 * Relatório JSON do status exato de títulos no banco, Radarr, Sonarr,
 * qBittorrent e se as capas resolvem HTTP 200.
 * ?titles=Matrix,Ted%20Lasso (opcional — default: lista de verificação)
 */
router.get('/verify-sync', async (req: AuthRequest, res: Response) => {
  try {
    const titlesParam = req.query.titles;
    const titlesStr = Array.isArray(titlesParam)
      ? titlesParam.join(',')
      : typeof titlesParam === 'string' ? titlesParam : '';
    const titles = titlesStr
      ? titlesStr.split(',').map((t) => t.trim()).filter(Boolean)
      : DEFAULT_VERIFY_TITLES;

    const report = await verifySync(titles);
    res.json({ generatedAt: new Date().toISOString(), titles: report });
  } catch (err: any) {
    logger.error(COMPONENT, 'verify-sync failed', { error: err.message });
    res.status(500).json({ error: 'Erro ao gerar relatório de sincronização' });
  }
});

/**
 * POST /api/debug/maintenance/deduplicate
 * Deduplica filmes e séries por tmdbId (mantém o melhor registro).
 * Body opcional: { dryRun: true } para apenas reportar sem deletar.
 */
router.post('/maintenance/deduplicate', async (req: AuthRequest, res: Response) => {
  try {
    const dryRun = req.body?.dryRun === true;
    const result = await deduplicateMedia();

    if (!dryRun) invalidateRecommendationsCache();

    res.json({
      dryRun,
      removedMovies: result.movies.length,
      removedSeries: result.series.length,
      movies: result.movies,
      series: result.series,
    });
  } catch (err: any) {
    logger.error(COMPONENT, 'deduplicate failed', { error: err.message });
    res.status(500).json({ error: 'Erro na deduplicação' });
  }
});

/**
 * POST /api/debug/maintenance/cleanup-orphans
 * Remove (ou reporta, com dryRun) registros "available" sem arquivo físico.
 * Body opcional: { dryRun: false } para deletar de fato (default: dryRun=true).
 */
router.post('/maintenance/cleanup-orphans', async (req: AuthRequest, res: Response) => {
  try {
    const dryRun = req.body?.dryRun !== false;
    const result = await cleanupOrphans({ dryRun });

    if (!dryRun) invalidateRecommendationsCache();

    res.json({
      dryRun,
      removedMovies: result.movies.length,
      removedSeries: result.series.length,
      movies: result.movies,
      series: result.series,
    });
  } catch (err: any) {
    logger.error(COMPONENT, 'cleanup-orphans failed', { error: err.message });
    res.status(500).json({ error: 'Erro na limpeza de órfãos' });
  }
});

export default router;
