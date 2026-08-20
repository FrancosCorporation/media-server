// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { WatchProgress } from '../models/WatchProgress';
import type { AuthRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const progresses = await WatchProgress.find({ userId }).sort({ lastWatched: -1 });
    res.json({ progresses });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:mediaId', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { mediaId } = req.params;
    const { seasonNumber, episodeNumber } = req.query;

    // Para séries, busca progresso por temporada/episódio
    const filter: Record<string, any> = { userId, mediaId };
    if (seasonNumber != null) filter.seasonNumber = parseInt(seasonNumber as string);
    if (episodeNumber != null) filter.episodeNumber = parseInt(episodeNumber as string);

    const progress = await WatchProgress.findOne(filter);
    res.json({ progress: progress || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { mediaId, mediaType, currentTime, duration, seasonNumber, episodeNumber } = req.body;

    if (!mediaId || !mediaType) {
      res.status(400).json({ error: 'mediaId and mediaType are required' });
      return;
    }

    // Calcula percentage e completed aqui (findOneAndUpdate não aciona pre('save'))
    const ct = currentTime || 0;
    const dur = duration || 0;
    const percentage = dur > 0 ? Math.min(100, (ct / dur) * 100) : 0;

    const update: Record<string, any> = {
      currentTime: ct,
      duration: dur,
      percentage,
      completed: percentage >= 90,
      lastWatched: new Date(),
    };

    // Para séries, inclui identificação do episódio no filtro
    const filter: Record<string, any> = { userId, mediaId };
    if (mediaType === 'series' && seasonNumber != null && episodeNumber != null) {
      filter.seasonNumber = seasonNumber;
      filter.episodeNumber = episodeNumber;
      update.seasonNumber = seasonNumber;
      update.episodeNumber = episodeNumber;
    }

    const progress = await WatchProgress.findOneAndUpdate(
      filter,
      { $set: update, $setOnInsert: { mediaType } },
      { upsert: true, new: true }
    );

    res.json({ progress });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:mediaId', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { mediaId } = req.params;
    const { seasonNumber, episodeNumber } = req.query;

    const filter: Record<string, any> = { userId, mediaId };
    if (seasonNumber != null && episodeNumber != null) {
      filter.seasonNumber = parseInt(seasonNumber as string);
      filter.episodeNumber = parseInt(episodeNumber as string);
    }

    await WatchProgress.findOneAndDelete(filter);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
