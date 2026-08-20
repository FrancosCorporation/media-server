// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Response } from 'express';
import path from 'path';
import { authenticateToken } from '../middleware/auth';
import { discoverDLNADevices, playOnDLNA, type DLNADevice } from '../services/DLNAService';
import { discoverAirPlayDevices, playOnAirPlay, type AirPlayDevice } from '../services/AirPlayService';
import { logger } from '../utils/logger';
import type { AuthRequest } from '../types';
import { getLocalStreamBaseURL, buildStreamURL, buildMPEGTSURL } from '../utils/network';
import { Movie } from '../models/Movie';
import { Series } from '../models/Series';
import { dlnaAllowlist } from '../services/DlnaAllowlist';

const COMPONENT = 'DevicesRoute';
const router = Router();

router.use(authenticateToken);

// Cache de dispositivos descobertos
let cachedDLNA: DLNADevice[] = [];
let cachedAirPlay: AirPlayDevice[] = [];
let lastDiscovery = 0;
const CACHE_TTL = 15000; // 15s

async function resolveMediaPathFromId(mediaId: string, mediaType?: string): Promise<string | null> {
  if (mediaType === 'movie') {
    const movie = await Movie.findById(mediaId);
    if (!movie?.path) return null;
    // Convert relative path to absolute
    return movie.path.startsWith('/') ? movie.path : `/media/movies/${movie.path}`;
  }
  if (mediaType === 'series') {
    const series = await Series.findById(mediaId);
    if (!series?.path) return null;
    return series.path.startsWith('/') ? series.path : `/media/series/${series.path}`;
  }
  // Try both
  const movie = await Movie.findById(mediaId);
  if (movie?.path) return movie.path.startsWith('/') ? movie.path : `/media/movies/${movie.path}`;
  const series = await Series.findById(mediaId);
  if (series?.path) return series.path.startsWith('/') ? series.path : `/media/series/${series.path}`;
  return null;
}

// GET /api/devices/discover - Descobre todos os dispositivos na rede
router.get('/discover', async (_req: AuthRequest, res: Response) => {
  try {
    const now = Date.now();
    const forceRefresh = _req.query.refresh === 'true';

    if (!forceRefresh && now - lastDiscovery < CACHE_TTL) {
      res.json({ dlna: cachedDLNA, airplay: cachedAirPlay, cached: true });
      return;
    }

    logger.info(COMPONENT, 'Discovering network devices (DLNA + AirPlay)...');

    const [dlnaDevices, airplayDevices] = await Promise.allSettled([
      discoverDLNADevices(),
      discoverAirPlayDevices(),
    ]);

    const dlna = dlnaDevices.status === 'fulfilled' ? dlnaDevices.value : [];
    const airplay = airplayDevices.status === 'fulfilled' ? airplayDevices.value : [];

    // Registrar IPs dos dispositivos DLNA na allowlist para bypass de auth no stream
    for (const device of dlna) {
      dlnaAllowlist.add(device.ip, device);
    }

    cachedDLNA = dlna;
    cachedAirPlay = airplay;
    lastDiscovery = now;

    logger.info(COMPONENT, `Discovery complete: ${dlna.length} DLNA, ${airplay.length} AirPlay`);

    res.json({
      dlna: dlna.map(d => ({
        id: d.uuid,
        name: d.name,
        manufacturer: d.manufacturer,
        model: d.model,
        ip: d.ip,
        protocol: 'dlna' as const,
      })),
      airplay: airplay.map(d => ({
        id: d.id || `${d.ip}:${d.port}`,
        name: d.name,
        manufacturer: d.modelName || 'Apple',
        model: d.modelName || 'AirPlay',
        ip: d.ip,
        protocol: 'airplay' as const,
      })),
    });
  } catch (err: any) {
    logger.error(COMPONENT, 'Device discovery error', { error: err.message });
    res.status(500).json({ error: 'Erro ao descobrir dispositivos na rede' });
  }
});

// POST /api/devices/play - Envia mídia para um dispositivo
router.post('/play', async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId, protocol, mediaUrl, title, mediaId, mediaType } = req.body;

    if (!deviceId || !protocol || (!mediaUrl && !mediaId)) {
      return res.status(400).json({ error: 'deviceId, protocol e (mediaUrl ou mediaId) são obrigatórios' });
    }

    logger.info(COMPONENT, `Sending media to ${protocol} device: ${deviceId}`);

    let finalMediaUrl = mediaUrl;

    // If mediaId is provided instead of mediaUrl, look up the file path and build local stream URL
    if (!finalMediaUrl && mediaId) {
      const token = req.headers['authorization']?.startsWith('Bearer ') 
        ? req.headers['authorization'].slice(7) 
        : '';
      const filePath = await resolveMediaPathFromId(mediaId, mediaType);
      if (!filePath) {
        return res.status(404).json({ error: 'Mídia não encontrada ou sem arquivo no disco' });
      }
      // Get relative path from media roots
      const MEDIA_ROOTS = ['/media/movies', '/media/series', '/downloads'];
      let relativePath: string | null = null;
      for (const root of MEDIA_ROOTS) {
        if (filePath.startsWith(root)) {
          relativePath = path.relative(root, filePath).replace(/\\/g, '/');
          break;
        }
      }
      if (!relativePath) {
        return res.status(404).json({ error: 'Arquivo fora das pastas de mídia configuradas' });
      }
      // Use MPEG-TS for DLNA (better TV compatibility), HLS for others
      if (protocol === 'dlna') {
        finalMediaUrl = buildMPEGTSURL(relativePath, '1080p', token, true); // forDlna = true
      } else {
        finalMediaUrl = buildStreamURL(relativePath, token);
      }
      logger.info(COMPONENT, `Built local stream URL: ${finalMediaUrl}`);
    }

    if (protocol === 'dlna') {
      const device = cachedDLNA.find(d => d.uuid === deviceId);
      if (!device) {
        return res.status(404).json({ error: 'Dispositivo DLNA não encontrado. Tente descobrir novamente.' });
      }
      const success = await playOnDLNA(device, finalMediaUrl, title);
      if (success) {
        res.json({ success: true, message: `Reproduzindo em ${device.name}` });
      } else {
        res.status(500).json({ error: 'Falha ao enviar mídia para o dispositivo DLNA' });
      }
    } else if (protocol === 'airplay') {
      const device = cachedAirPlay.find(d => (d.id || `${d.ip}:${d.port}`) === deviceId);
      if (!device) {
        return res.status(404).json({ error: 'Dispositivo AirPlay não encontrado. Tente descobrir novamente.' });
      }
      const success = await playOnAirPlay(device, finalMediaUrl, title);
      if (success) {
        res.json({ success: true, message: `Reproduzindo em ${device.name}` });
      } else {
        res.status(500).json({ error: 'Falha ao enviar mídia para o dispositivo AirPlay' });
      }
    } else {
      return res.status(400).json({ error: `Protocolo não suportado: ${protocol}` });
    }
  } catch (err: any) {
    logger.error(COMPONENT, 'Play error', { error: err.message });
    res.status(500).json({ error: 'Erro ao enviar mídia para o dispositivo' });
  }
});

export default router;
