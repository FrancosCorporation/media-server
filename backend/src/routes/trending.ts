// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Rota GET /api/trending — retorna títulos em alta de APIs públicas (TMDB).
import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { TrendingScraperService } from '../services/TrendingScraperService';
import { logger } from '../utils/logger';
import type { AuthRequest } from '../types';

const router = Router();
const COMPONENT = 'TrendingRoute';
router.use(authenticateToken);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const trending = await TrendingScraperService.getTrending();
    res.json({ trending });
  } catch (err: any) {
    logger.error(COMPONENT, `Trending error: ${err.message}`);
    res.status(500).json({ error: 'Erro ao carregar tendências' });
  }
});

router.post('/invalidate', async (_req: AuthRequest, res: Response) => {
  TrendingScraperService.invalidateCache();
  res.json({ success: true });
});

export default router;
