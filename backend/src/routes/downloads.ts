// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { Download } from '../models/Download';
import { Movie } from '../models/Movie';
import { Series } from '../models/Series';
import { QBittorrentService } from '../services/QBittorrentService';
import { MetadataService } from '../services/MetadataService';
import { fixPosterUrl } from '../utils/poster';
import { logger } from '../utils/logger';
import { findTorrent } from '../utils/torrentMatcher';
import { STATE_LABELS, applyTorrentStatus } from '../utils/downloadStatus';
import { normalizeTitleForMatch, cleanTorrentName } from '../utils/mediaOrganizer';
import type { AuthRequest } from '../types';

const COMPONENT = 'DownloadsRoute';

const router = Router();
router.use(authenticateToken);

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const torrents = await QBittorrentService.getTorrents();
    const downloads = await Download.find().sort({ addedAt: -1 });

    // Map downloads by hash for quick lookup
    const downloadsByHash = new Map<string, any>();
    for (const dl of downloads) {
      if (dl.hash) downloadsByHash.set(dl.hash.toLowerCase(), dl);
    }

    // First, merge existing downloads with torrents
    const merged = downloads.map((dl) => {
      const hash = dl.hash;
      let t = hash ? torrents.find((tr: any) => tr.hash?.toLowerCase() === hash.toLowerCase()) : undefined;
      if (!t) t = findTorrent(torrents, { hash, title: dl.title });

      if (!t && hash) {
        dl.status = 'error';
        (dl as any).torrentState = 'missing';
        (dl as any).torrentStateLabel = 'Download perdido no servidor — reenvie';
        dl.save().catch((err) =>
          logger.warn(COMPONENT, 'Failed to save orphan download', { error: err.message })
        );
      }

      if (t) {
        if ((!hash || hash.toLowerCase() !== String(t.hash || '').toLowerCase()) && t.hash) {
          dl.hash = t.hash;
          downloadsByHash.set(String(t.hash).toLowerCase(), dl);
          dl.save().catch((err) =>
            logger.warn(COMPONENT, 'Failed to backfill download hash', { error: err.message })
          );
        }
        const res = applyTorrentStatus(dl, t);
        (dl as any).torrentState = res.torrentState;
        (dl as any).torrentStateLabel = res.torrentStateLabel;
        dl.save().catch((err) =>
          logger.warn(COMPONENT, 'Failed to save download', { error: err.message })
        );
      }
      return dl;
    });

    // Now add torrents that have no Download document
    for (const t of torrents) {
      const hash = t.hash?.toLowerCase();
      if (hash && !downloadsByHash.has(hash)) {
        // Clean torrent name for matching and display
        const cleanedName = cleanTorrentName(t.name);
        const normalizedCleaned = normalizeTitleForMatch(cleanedName);
        
        // Try to find associated media (movie/series) by title
        let mediaId: string | undefined;
        let mediaType: 'movie' | 'series' | undefined;
        try {
          // First try exact match with cleaned name
          const movie = await Movie.findOne({ title: { $regex: new RegExp(`^${cleanedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
          if (movie) { mediaId = movie._id.toString(); mediaType = 'movie'; }
          else {
            const series = await Series.findOne({ title: { $regex: new RegExp(`^${cleanedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
            if (series) { mediaId = series._id.toString(); mediaType = 'series'; }
          }
// If no exact match, try fuzzy matching by normalized cleaned title
          if (!mediaId) {
            const series = await Series.find({}).then(seriesList =>
              seriesList.find(s => normalizedCleaned.includes(normalizeTitleForMatch(s.title)))
            );
            if (series) { mediaId = series._id.toString(); mediaType = 'series'; }
            else {
              const movie = await Movie.find({}).then(movieList =>
                movieList.find(m => normalizedCleaned.includes(normalizeTitleForMatch(m.title)))
              );
              if (movie) { mediaId = movie._id.toString(); mediaType = 'movie'; }
            }
          }
        } catch { /* ignore */ }

        const displayTitle = cleanedName || t.name || 'Download sem título';
        const synthetic = {
          _id: hash,
          title: displayTitle,
          hash: t.hash,
          progress: t.progress,
          speed: t.speed,
          seeds: t.seeds,
          peers: t.peers,
          size: t.size,
          downloaded: t.downloaded,
          state: t.state,
          torrentState: t.state,
          torrentStateLabel: STATE_LABELS[t.state] || STATE_LABELS.unknown,
          status: mapTorrentStateToStatus(t.state),
          mediaId,
          mediaType,
          addedAt: new Date(),
          updatedAt: new Date(),
        };
        merged.push(synthetic as any);
        downloadsByHash.set(hash, synthetic); // prevent duplicate
      }
    }

    // Serializa e inclui o torrentState e hash em cada item
    const result = await Promise.all(merged.map(async (dl: any) => {
      const obj = dl.toObject ? dl.toObject() : { ...dl };
      const state = (dl as any).torrentState;
      if (state) {
        (obj as any).torrentState = state;
        (obj as any).torrentStateLabel =
          (dl as any).torrentStateLabel || STATE_LABELS[state] || STATE_LABELS.unknown;
      }
      if (dl.hash) {
        (obj as any).hash = dl.hash;
      }
      // Busca capa da mídia associada (ou TMDB) quando o download não tem poster
      if (!obj.poster) {
        obj.poster = await MetadataService.getDownloadPoster({
          mediaId: obj.mediaId,
          mediaType: obj.mediaType,
          title: obj.title,
          poster: obj.poster,
        });
      }
      // Aplica proxy cover URL ao poster do download
      if (obj.poster) {
        obj.poster = fixPosterUrl(obj.poster, obj.mediaType === 'series' ? 'series' : 'movie');
      }
      return obj;
    }));

    res.json({ downloads: result });
  } catch (err) {
    logger.error(COMPONENT, 'List error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao listar downloads' });
  }
});

function mapTorrentStateToStatus(state: string): string {
  switch (state) {
    case 'downloading':
    case 'metaDL':
    case 'checkingDL':
    case 'forcedDL':
    case 'stalledDL':
    case 'queuedDL':
      return 'downloading';
    case 'uploading':
    case 'stalledUP':
    case 'queuedUP':
    case 'forcedUP':
      return 'seeding';
    case 'pausedDL':
    case 'pausedUP':
      return 'paused';
    case 'error':
    case 'missingFiles':
      return 'error';
    default:
      return 'unknown';
  }
}

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Encontra o download para saber o hash do torrent
    const download = await Download.findById(req.params.id);
    if (download?.hash) {
      // Remove do qBittorrent com os arquivos
      await QBittorrentService.deleteTorrent(download.hash, true).catch((err) =>
        logger.warn(COMPONENT, 'qBittorrent delete failed', { error: err.message, hash: download.hash })
      );
    }
    // Remove do MongoDB
    await Download.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Erro ao remover download' });
  }
});

// POST /api/downloads/cleanup — remove torrents com missingFiles do qBittorrent E do MongoDB
router.post('/cleanup', async (_req: AuthRequest, res: Response) => {
  try {
    const torrents = await QBittorrentService.getTorrents();
    const missing = torrents.filter((t: any) => t.state === 'missingFiles');
    const hashes = new Set(missing.map((t: any) => t.hash?.toLowerCase()));

    // Remove do MongoDB (downloads e downloads sintéticos)
    await Download.deleteMany({ hash: { $in: Array.from(hashes) } });
    // Também remove downloads com status error e sem hash (ósrfãos)
    await Download.deleteMany({ status: 'error', hash: null });
    await Download.deleteMany({ status: 'error', hash: '' });

    // Remove do qBittorrent com os arquivos
    for (const t of missing) {
      await QBittorrentService.deleteTorrent(t.hash, true).catch((err) =>
        logger.warn(COMPONENT, 'qBittorrent delete failed', { error: err.message, hash: t.hash })
      );
    }

    res.json({ deleted: missing.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
