// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { TranslationService } from '../services/TranslationService';
import { logger } from '../utils/logger';
import type { AuthRequest } from '../types';

const COMPONENT = 'TranslateRoute';
const router = Router();
router.use(authenticateToken);

/**
 * POST /api/translate
 * Traduz texto de um idioma para outro.
 * Body: { text: string, from?: string, to?: string }
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { text, from = 'en', to = 'pt-BR' } = req.body;
    if (!text) return res.status(400).json({ error: 'Campo "text" obrigatório' });

    const translated = await TranslationService.translate(text, from, to);
    res.json({ translated, from, to });
  } catch (err) {
    logger.error(COMPONENT, 'Translation error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao traduzir texto' });
  }
});

/**
 * POST /api/translate/media
 * Traduz um objeto de mídia (overview + genres).
 * Body: { item: MediaItem, to?: string }
 */
router.post('/media', async (req: AuthRequest, res: Response) => {
  try {
    const { item, to = 'pt-BR' } = req.body;
    if (!item) return res.status(400).json({ error: 'Campo "item" obrigatório' });

    const translated = await TranslationService.translateMediaItem(item, to);
    res.json({ item: translated });
  } catch (err) {
    logger.error(COMPONENT, 'Media translation error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao traduzir mídia' });
  }
});

/**
 * POST /api/translate/batch
 * Traduz múltiplos textos de uma vez.
 * Body: { texts: string[], from?: string, to?: string }
 */
router.post('/batch', async (req: AuthRequest, res: Response) => {
  try {
    const { texts, from = 'en', to = 'pt-BR' } = req.body;
    if (!texts || !Array.isArray(texts)) return res.status(400).json({ error: 'Campo "texts" (array) obrigatório' });

    const translated = await TranslationService.translateBatch(texts, from, to);
    res.json({ translated, from, to });
  } catch (err) {
    logger.error(COMPONENT, 'Batch translation error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao traduzir textos' });
  }
});

export default router;
