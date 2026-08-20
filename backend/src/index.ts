// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { connectDatabase } from './config/database';
import { QBittorrentService } from './services/QBittorrentService';
import { RadarrService } from './services/RadarrService';
import { seedAdmin } from './config/seed';
import { Download } from './models/Download';
import { Movie } from './models/Movie';
import { Series } from './models/Series';
import { WatchProgress } from './models/WatchProgress';
import { AutoPipelineService } from './services/AutoPipelineService';
import { MetadataService } from './services/MetadataService';
import { CoverCacheService } from './services/CoverCacheService';
import { ConversionQueueService } from './services/ConversionQueueService';
import { MediaPostProcessorService } from './services/MediaPostProcessorService';
import { createDownloadIfUnique } from './utils/dedupe';
import { MediaScannerService } from './services/MediaScannerService';
import { PendingRetryService } from './services/PendingRetryService';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { normalizeTitleForMatch, extractSeasonNumber } from './utils/mediaOrganizer';
import { MIN_SPAM_SIZE_BYTES, isLikelySpam } from './utils/constants';

import axios from 'axios';

import authRoutes from './routes/auth';
import movieRoutes from './routes/movies';
import seriesRoutes from './routes/series';
import downloadRoutes from './routes/downloads';
import libraryRoutes from './routes/library';
import settingsRoutes from './routes/settings';
import usersRoutes from './routes/users';
import recommendationsRoutes from './routes/recommendations';
import qbittorrentRoutes from './routes/qbittorrent';
import translateRoutes from './routes/translate';
import streamRoutes from './routes/stream';
import searchRoutes from './routes/search';
import watchProgressRoutes from './routes/watchProgress';
import coversRoutes from './routes/covers';
import devicesRoutes from './routes/devices';
import posterRoutes from './routes/poster';
import trendingRoutes from './routes/trending';
import debugRoutes from './routes/debug';
import { authenticateToken } from './middleware/auth';
import { invalidateRecommendationsCache } from './routes/recommendations';
import { applyTorrentStatus, STALL_TIMEOUT_MS } from './utils/downloadStatus';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';

const COMPONENT = 'Server';
const PORT = parseInt(process.env.API_PORT || '4000', 10);

const MEDIA_ROOTS = ['/media/movies', '/media/series', '/downloads', '/media/transcode'];

function fileSizeOf(filePath: string): number | undefined {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return undefined;
  }
}

function findVideoFileByTitle(root: string, title: string, year?: number): string | null {
  const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanTitle.length < 3) return null;

  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dirName = entry.name.toLowerCase();
      if (!dirName.includes(cleanTitle)) continue;

      if (year && !dirName.includes(year.toString())) continue;

      const dirPath = path.join(root, entry.name);
      const videoFiles: string[] = [];

      function findVideos(dir: string, depth = 0) {
        if (depth > 4) return;
        try {
          const items = fs.readdirSync(dir, { withFileTypes: true });
          for (const item of items) {
            const fullPath = path.join(dir, item.name);
            if (item.isFile() && ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.ts', '.rmvb', '.flv'].includes(path.extname(item.name).toLowerCase())) {
               // Ignora arquivos temporários de conversão (.tmp_*.mp4) e arquivos ocultos
               if (item.name.startsWith('.')) continue;
               const spamCheck = isLikelySpam(item.name, title, fileSizeOf(fullPath));
               if (!spamCheck.spam) videoFiles.push(fullPath);
            } else if (item.isDirectory()) {
              findVideos(fullPath, depth + 1);
            }
          }
        } catch { /* ignore */ }
      }

      findVideos(dirPath);
      if (videoFiles.length > 0) {
        return videoFiles[0];
      }
    }
  } catch { /* ignore */ }
  return null;
}

function getRelativePath(fullPath: string): string | null {
  for (const root of MEDIA_ROOTS) {
    if (fullPath.startsWith(root)) {
      const relative = path.relative(root, fullPath);
      return relative.replace(/\\/g, '/');
    }
  }
  return null;
}

async function updateMediaPath(mediaId: string, mediaType: 'movie' | 'series', title: string, year?: number) {
  try {
    for (const root of MEDIA_ROOTS) {
      const fullPath = findVideoFileByTitle(root, title, year);
      if (fullPath) {
        const relativePath = getRelativePath(fullPath);
        if (relativePath) {
          if (mediaType === 'movie') {
            await Movie.findByIdAndUpdate(mediaId, { path: relativePath });
          } else {
            await Series.findByIdAndUpdate(mediaId, { path: relativePath });
          }
          logger.info(COMPONENT, `Updated ${mediaType} path: ${relativePath}`);
          return;
        }
      }
    }
    logger.warn(COMPONENT, `Could not find file on disk for ${mediaType}: ${title}`);
  } catch (err: any) {
    logger.warn(COMPONENT, `Failed to update ${mediaType} path: ${err.message}`);
  }
}

async function main() {
  await connectDatabase();
  await seedAdmin();

  const app = express();
  const server = http.createServer(app);

  // Security & parsing
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(morgan('short'));

  // Proxy de imagens do TMDB — evita CORS do image.tmdb.org.
  // O CDN (BunnyCDN) é intermitente nesta rede; o fetch é feito num processo filho
  // (tmdb-fetch.js) e os bytes são mantidos em cache em disco (ver TMDB_IMAGE_CACHE_DIR).

  // Cache local em disco dos bytes das imagens: o CDN do TMDB (BunnyCDN) é intermitente
  // nesta rede, então depois de baixar UMA vez a capa fica disponível para sempre,
  // mesmo com o CDN fora. Mantido em volume persistente (TMDB_IMAGE_CACHE_DIR).
  const TMDB_IMAGE_CACHE_DIR = process.env.TMDB_IMAGE_CACHE_DIR || '/app/cache/tmdb-images';
  function cacheFilePath(imagePath: string): string {
    const ext = (imagePath.match(/\.([^.]+)$/)?.[1] || 'jpg').toLowerCase();
    return path.join(TMDB_IMAGE_CACHE_DIR, `${crypto.createHash('sha1').update(imagePath).digest('hex')}.${ext}`);
  }
  function contentTypeFor(imagePath: string): string {
    const ext = (imagePath.match(/\.([^.]+)$/)?.[1] || 'jpg').toLowerCase();
    const map: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
    return map[ext] || 'image/jpeg';
  }
  function serveImageFile(res: any, file: string, imagePath: string) {
    res.set('Content-Type', contentTypeFor(imagePath));
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');
    return res.send(fs.readFileSync(file));
  }

  // Fetch dos bytes da imagem via processo filho (node tmdb-fetch.js): o processo
  // principal NÃO consegue completar TLS para os edges do BunnyCDN (rede intermitente),
  // mas um processo novo responde em <1s. Resultado testado múltiplas vezes.
  // Definido fora da rota para ser reutilizado no pré-aquecimento de cache no startup.
  const TMDB_FETCH_SCRIPT = path.resolve(__dirname, '..', 'tmdb-fetch.js');
  async function fetchTmdbImageBytes(subPath: string): Promise<{ status: number; headers: Record<string, string>; data: Buffer }> {
    const data: Buffer = await new Promise((resolve, reject) => {
      execFile('node', [TMDB_FETCH_SCRIPT, subPath], { timeout: 45000, maxBuffer: 5 * 1024 * 1024, encoding: 'buffer' as BufferEncoding }, (err, stdout) => {
        if (err) return reject(err);
        const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || '');
        if (buf.length === 0) return reject(new Error('tmdb-fetch retornou vazio'));
        resolve(buf);
      });
    });
    logger.info('TMDBImage', 'Child fetch OK', { subPath, bytes: data.length });
    return { status: 200, headers: { 'content-type': contentTypeFor(subPath) }, data };
  }

  app.get('/api/tmdb-image/*', async (req, res) => {
    const imagePath = req.path.replace('/api/tmdb-image', '');
    const target = `https://image.tmdb.org/t/p${imagePath}`;

    // Cache headers (1 day) — evita refetches
    const cached = req.headers['if-none-match'];
    if (cached) {
      res.set('Cache-Control', 'public, max-age=86400');
      return res.status(304).end();
    }

    // Já temos no disco? Serve direto — imune à flakiness do CDN.
    const cacheFile = cacheFilePath(imagePath);
    if (fs.existsSync(cacheFile)) {
      return serveImageFile(res, cacheFile, imagePath);
    }

    try {
      logger.info('TMDBImage', `Proxying TMDB image`, { target });

      const nativeResult = await fetchTmdbImageBytes(imagePath);
      if (nativeResult.status >= 400) {
        logger.warn('TMDBImage', `TMDB returned ${nativeResult.status}, returning error`);
        return res.status(nativeResult.status).json({ error: 'Image not found' });
      }

      // Grava no disco: próxima vez não depende do CDN (intermitente nesta rede)
      try {
        fs.mkdirSync(TMDB_IMAGE_CACHE_DIR, { recursive: true });
        fs.writeFileSync(cacheFile, nativeResult.data);
      } catch (cacheErr: any) {
        logger.warn('TMDBImage', `Cache write failed: ${cacheErr.message}`, { target });
      }

      return serveImageFile(res, cacheFile, imagePath);
    } catch (err: any) {
      logger.error('TMDBImage', 'Proxy failed (all methods)', { error: err.message, errorCode: err.code, target });
      // NÃO redirect — retorna erro para frontend lidar. Se já havia cache (write falhou/race),
      // entrega o cache mesmo assim.
      if (fs.existsSync(cacheFile)) {
        return serveImageFile(res, cacheFile, imagePath);
      }
      res.status(502).json({ error: 'Failed to proxy image' });
    }
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  // P6: status da conversão pós-download (o player consulta após receber 202)
  app.get('/api/conversion/:mediaId', authenticateToken, async (req: any, res: any) => {
    try {
      const mediaId = req.params.mediaId;
      const inMem = ConversionQueueService.getStatus(mediaId);
      let status = inMem;
      if (inMem.conversionStatus === 'none') {
        const dl = await Download.findOne({ mediaId }).sort({ createdAt: -1 });
        if (dl) {
          status = {
            conversionStatus: dl.conversionStatus || 'none',
            progress: dl.conversionProgress || 0,
          };
        }
      }
      res.json(status);
    } catch (err: any) {
      logger.warn(COMPONENT, `Conversion status error: ${err.message}`);
      res.json({ conversionStatus: 'none', progress: 0 });
    }
  });

  // Proxy de imagens do OMDB (m.media-amazon.com) — URLs são time-limited/CDN-protegidas
  app.get('/api/omdb-image/*', async (req, res) => {
    try {
      const imagePath = req.path.replace('/api/omdb-image', '');
      const target = `https://m.media-amazon.com/images${imagePath}`;

      const response = await axios.get(target, {
        responseType: 'stream',
        timeout: 15000,
        validateStatus: () => true,
      }).catch(async (err: any) => {
        if (['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNABORTED'].includes(err.code)) {
          logger.warn('OMDBImage', `Transient error ${err.code}, retrying`, { target });
          return axios.get(target, {
            responseType: 'stream',
            timeout: 15000,
            validateStatus: () => true,
          });
        }
        throw err;
      });

      if (response.status >= 400) {
        return res.status(response.status).json({ error: 'Image not found' });
      }

      const ct = response.headers['content-type'];
      if (ct) res.set('Content-Type', Array.isArray(ct) ? ct[0] : String(ct));
      res.set('Cache-Control', 'public, max-age=86400');
      res.set('Access-Control-Allow-Origin', '*');
      response.data.pipe(res);
    } catch (err: any) {
      logger.warn('OMDBImage', 'Proxy failed', { error: err.message, errorCode: err.code });
      res.status(502).json({ error: 'Failed to proxy image' });
    }
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/movies', movieRoutes);
  app.use('/api/series', seriesRoutes);
  app.use('/api/downloads', downloadRoutes);
  app.use('/api/library', libraryRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/recommendations', recommendationsRoutes);
  app.use('/api/qbittorrent', qbittorrentRoutes);
  app.use('/api/translate', translateRoutes);
  app.use('/api/stream', streamRoutes);
  // coversRoutes removed — cover proxy handlers are defined inline below (lines 160+ and 233+)
  app.use('/api/search', searchRoutes);
  app.use('/api/watch-progress', watchProgressRoutes);
  app.use('/api/devices', devicesRoutes);  // Added devices route
  app.use('/api/poster', posterRoutes);    // Fallback de capas (resolve via TMDB)
  app.use('/api/debug', debugRoutes);      // Manutenção/deduplicação/verify-sync (admin)
  app.use('/api/trending', trendingRoutes); // Tendências de streaming (TMDB)

  // Swagger UI — documentação interativa da API
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customCssUrl: '',
    explorer: true,
  }));
  app.get('/api/docs.json', (_req, res) => {
    res.json(swaggerSpec);
  });

  // Proxy de capas do Radarr — serve /MediaCover/ diretamente de http://radarr:7878
  app.get('/api/radarr-cover/*', async (req, res) => {
    try {
      const radarrConfig = await RadarrService.getRadarrConfig();
      const baseUrl = radarrConfig.url;
      const apiKey = radarrConfig.apiKey;
      const coverPath = req.path.replace('/api/radarr-cover', '').replace(/MediaCoverProxy/g, 'MediaCover');
      const hasQuery = coverPath.includes('?');
      const target = `${baseUrl}${coverPath}${hasQuery ? '&' : '?'}apikey=${apiKey}`;
      logger.info('RadarrCover', `Proxying cover request`, {
        target,
        radarrUrl: baseUrl,
        extractedPath: coverPath,
        userAgent: req.headers['user-agent']?.substring(0, 50),
      });

      const headers: Record<string, string> = {};
      if (apiKey) headers['X-Api-Key'] = apiKey;

      const response = await axios.get(target, {
        headers,
        responseType: 'stream',
        timeout: 15000,
        validateStatus: () => true, // don't throw for 4xx/5xx
      });

      logger.info('RadarrCover', `Radarr responded`, {
        target,
        status: response.status,
        contentType: response.headers['content-type'],
        contentLength: response.headers['content-length'],
      });

      // Pass through the actual status code from Radarr
      // IMPORTANT: For 404, pass through so frontend can fallback to /api/poster/:mediaType/:id (TMDB)
      if (response.status >= 400) {
        if (response.status === 404) {
          res.status(404).send('Not Found');
          return;
        }
        res.status(response.status).json({
          error: `Radarr returned ${response.status} for ${coverPath}`,
        });
        return;
      }

      const ct = response.headers['content-type'];
      const resolvedCt = Array.isArray(ct) ? ct[0] : String(ct);
      if (resolvedCt === 'text/html') {
        const ext = coverPath.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
        const map: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
        res.set('Content-Type', map[ext || ''] || resolvedCt);
      } else if (ct) {
        res.set('Content-Type', resolvedCt);
      }
      response.data.pipe(res);
    } catch (err: any) {
      const isConnectionError = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND';
      const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');

      logger.error('RadarrCover', 'Proxy failed', {
        error: err.message,
        errorCode: err.code,
        radarrUrl: process.env.RADARR_URL || 'http://radarr:7878',
        requestPath: req.path,
        isConnectionError,
        isTimeout,
      });

      if (isConnectionError) {
        res.status(502).json({ error: 'Radarr service unavailable. Check RADARR_URL config.' });
      } else if (isTimeout) {
        res.status(504).json({ error: 'Radarr request timed out.' });
      } else {
        res.status(502).json({ error: 'Failed to proxy cover from Radarr.' });
      }
    }
  });

  // Proxy de capas do Sonarr — serve /MediaCover/ diretamente de http://sonarr:8989
  app.get('/api/sonarr-cover/*', async (req, res) => {
    try {
      const baseUrl = process.env.SONARR_URL || 'http://sonarr:8989';
      const apiKey = process.env.SONARR_API_KEY || '';
      const coverPath = req.path.replace('/api/sonarr-cover', '');
  const hasQuery = coverPath.includes('?');
      const target = `${baseUrl}${coverPath}${hasQuery ? '&' : '?'}apikey=${apiKey}`;
      logger.info('SonarrCover', `Proxying cover request`, {
        target,
        sonarrUrl: baseUrl,
        extractedPath: coverPath,
      });

      const headers: Record<string, string> = {};
      if (apiKey) headers['X-Api-Key'] = apiKey;

      const response = await axios.get(target, {
        headers,
        responseType: 'stream',
        timeout: 15000,
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        if (response.status === 404) {
          res.status(404).send('Not Found');
          return;
        }
        res.status(response.status).json({
          error: `Sonarr returned ${response.status} for ${coverPath}`,
        });
        return;
      }

      const ct = response.headers['content-type'];
      const resolvedCt = Array.isArray(ct) ? ct[0] : String(ct);
      if (resolvedCt === 'text/html') {
        const ext = coverPath.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
        const map: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
        res.set('Content-Type', map[ext || ''] || resolvedCt);
      } else if (ct) {
        res.set('Content-Type', resolvedCt);
      }
      response.data.pipe(res);
    } catch (err: any) {
      const isConnectionError = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND';
      const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');

      logger.error('SonarrCover', 'Proxy failed', {
        error: err.message,
        errorCode: err.code,
        sonarrUrl: process.env.SONARR_URL || 'http://sonarr:8989',
        requestPath: req.path,
        isConnectionError,
        isTimeout,
      });

      if (isConnectionError) {
        res.status(502).json({ error: 'Sonarr service unavailable. Check SONARR_URL config.' });
      } else if (isTimeout) {
        res.status(504).json({ error: 'Sonarr request timed out.' });
      } else {
        res.status(502).json({ error: 'Failed to proxy cover from Sonarr.' });
      }
    }
  });

  // ─── Cached Cover endpoint — serve capas do DB em vez de proxy a cada request ──
  app.get('/api/covers/:mediaType/:mediaId', async (req, res) => {
    try {
      const { mediaType, mediaId } = req.params;
      if (mediaType !== 'movie' && mediaType !== 'series') {
        return res.status(400).json({ error: 'mediaType must be "movie" or "series"' });
      }

      const cover = await CoverCacheService.getCachedCover(mediaId, mediaType);
      if (!cover?.poster) {
        return res.status(404).json({ error: 'Cover not cached' });
      }

      const posterUrl = cover.poster;

      // TMDB CDN URLs — fetch and stream
      if (posterUrl.startsWith('https://image.tmdb.org/')) {
        const response = await axios.get(posterUrl, {
          responseType: 'stream',
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        const ct = response.headers['content-type'];
        const resolvedCt = Array.isArray(ct) ? ct[0] : String(ct);
        if (resolvedCt === 'text/html') {
          const ext = posterUrl.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
          const map: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
          res.set('Content-Type', map[ext || ''] || resolvedCt);
        } else if (ct) {
          res.set('Content-Type', resolvedCt);
        }
        res.set('Cache-Control', 'public, max-age=86400');
        response.data.pipe(res);
        return;
      }

      // Local proxy URLs (radarr-cover, sonarr-cover) — redirect
      if (posterUrl.startsWith('/api/radarr-cover/') || posterUrl.startsWith('/api/sonarr-cover/')) {
        res.redirect(302, posterUrl);
        return;
      }

      // External URLs — proxy
      if (posterUrl.startsWith('http')) {
        const response = await axios.get(posterUrl, {
          responseType: 'stream',
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        const ct = response.headers['content-type'];
        const resolvedCt = Array.isArray(ct) ? ct[0] : String(ct);
        if (resolvedCt === 'text/html') {
          const ext = posterUrl.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
          const map: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
          res.set('Content-Type', map[ext || ''] || resolvedCt);
        } else if (ct) {
          res.set('Content-Type', resolvedCt);
        }
        res.set('Cache-Control', 'public, max-age=86400');
        response.data.pipe(res);
        return;
      }

      res.status(404).json({ error: 'Invalid poster URL in cache' });
    } catch (err: any) {
      logger.warn('CoverCache', `Failed to serve cached cover: ${err.message}`);
      res.status(502).json({ error: 'Failed to serve cover' });
    }
  });

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  // WebSocket for real-time download updates
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    logger.info(COMPONENT, `WS client connected (${clients.size} total)`);

    ws.on('close', () => {
      clients.delete(ws);
      logger.info(COMPONENT, `WS client disconnected (${clients.size} total)`);
    });

    ws.on('error', (err) => {
      logger.error(COMPONENT, 'WS error', { error: err.message });
      clients.delete(ws);
    });
  });

  // Broadcast download updates every 3 seconds
  const broadcastInterval = setInterval(async () => {
    try {
      const torrents = await QBittorrentService.getTorrents();

      // Log detalhado dos torrents para debug
      logger.info(COMPONENT, `WS Broadcast: ${torrents.length} torrents`, {
        torrents: torrents.map((t: any) => ({
          hash: t.hash?.substring(0, 8),
          name: t.name?.substring(0, 50),
          progress: t.progress?.toFixed(1),
          state: t.state,
          seeds: t.seeds,
          peers: t.peers,
          speed: t.speed,
          eta: t.eta
        }))
      });

      // Backfill: downloads sem hash tentam encontrar o hash pelo nome
      const downloadsWithoutHash = await Download.find({ hash: { $exists: false }, status: { $in: ['downloading', 'queued'] } });
      for (const dl of downloadsWithoutHash) {
        const matched = findTorrentByTitle(torrents, dl.title);
        if (matched) {
          dl.hash = matched.hash;
          await dl.save().catch(() => {});
          logger.info(COMPONENT, `Hash backfilled for download: ${dl.title} → ${matched.hash}`);
        }
      }

      // Eventos enviados ao frontend junto com os torrents (ex: timeout sem fontes)
      const downloadEvents: any[] = [];

      // Atualiza progresso de downloads em andamento no banco
      // + TIME-OUT para torrents travados em "Aguardando fontes" (sem seeds)
      const activeDownloads = await Download.find({ status: { $in: ['downloading', 'queued'] } });
      for (const dl of activeDownloads) {
        const t = dl.hash
          ? torrents.find((tr: any) => tr.hash === dl.hash)
          : findTorrentByTitle(torrents, dl.title);
        if (t) {
          const res = applyTorrentStatus(dl, t);
          await dl.save().catch(() => {});
          // Notifica o frontend quando o download vira erro por falta de fontes
          if (res.timedOut) {
            downloadEvents.push({
              _id: dl._id.toString(),
              status: 'error',
              torrentState: res.torrentState,
              torrentStateLabel: res.torrentStateLabel,
            });
            logger.warn(COMPONENT, `Download sem fontes por ${STALL_TIMEOUT_MS / 60000}min → erro: ${dl.title}`);
          }
        }
      }

      // Detectar torrents presos em "queued" sem seeds/peers por muito tempo
      const queuedTorrents = torrents.filter((t: any) => 
        ['queuedDL', 'queued', 'stalledDL'].includes(t.state) && 
        (t.seeds || 0) === 0 && 
        (t.peers || 0) === 0
      );
      if (queuedTorrents.length > 0) {
        logger.warn(COMPONENT, `Torrents stuck in queued without seeds/peers`, {
          stuck: queuedTorrents.map((t: any) => ({ name: t.name, state: t.state, seeds: t.seeds, peers: t.peers, eta: t.eta }))
        });
      }

      // Atualiza status de Movie/Series quando download é concluído
      const completedStates = ['uploading', 'stalledUP', 'pausedUP'];
      for (const t of torrents) {
        if (t.progress >= 100 || completedStates.includes(t.state)) {
          try {
            // Match por hash primeiro (mais preciso), depois por nome (fallback)
            let completedDl = t.hash
              ? await Download.findOne({ hash: t.hash })
              : null;
            if (!completedDl) {
              // Fallback por nome fuzzy (normaliza "Temporada 1" ↔ "S01")
              const candidates = await Download.find({ hash: { $exists: false } });
              for (const dl of candidates) {
                if (findTorrentByTitle([t], dl.title)) {
                  completedDl = dl;
                  if (t.hash) completedDl.hash = t.hash;
                  break;
                }
              }
            }
            if (completedDl) {
              // Se o download já está complete mas o movie/series ainda não, atualiza
              if (completedDl.status === 'complete' && t.progress >= 100) {
                if (completedDl.mediaType === 'movie') {
                  let movie = await Movie.findById(completedDl.mediaId);
                  if (!movie) {
                    movie = await Movie.create({
                      _id: completedDl.mediaId,
                      title: completedDl.title,
                      status: 'available',
                      poster: completedDl.poster || '',
                    });
                    logger.info(COMPONENT, `Created missing movie for download: ${completedDl.title}`);
                  } else {
                    await Movie.findByIdAndUpdate(completedDl.mediaId, { status: 'available' });
                  }
                  await updateMediaPath(completedDl.mediaId, 'movie', completedDl.title, movie?.year);
                } else {
                  let series = await Series.findById(completedDl.mediaId);
                  if (!series) {
                    series = await Series.create({
                      _id: completedDl.mediaId,
                      title: completedDl.title,
                      status: 'available',
                      poster: completedDl.poster || '',
                    });
                    logger.info(COMPONENT, `Created missing series for download: ${completedDl.title}`);
                  } else {
                    await Series.findByIdAndUpdate(completedDl.mediaId, { status: 'available' });
                  }
                  await updateMediaPath(completedDl.mediaId, 'series', completedDl.title, series?.year);
                }
                invalidateRecommendationsCache();
                // Post-processing: always trigger conversion check, even for already-complete downloads
                setTimeout(() => {
                  const mediaType = completedDl!.mediaType;
                  const mediaId = completedDl!.mediaId;
                  const title = completedDl!.title;
                  (async () => {
                    try {
                      let media: any = null;
                      if (mediaType === 'movie') media = await Movie.findById(mediaId);
                      else media = await Series.findById(mediaId);
                      if (!media) return;
                      let fullPath: string | null = null;
                      if (media.path) {
                        for (const root of MEDIA_ROOTS) {
                          const candidate = path.join(root, String(media.path));
                          try {
                            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                              fullPath = candidate;
                              break;
                            }
                          } catch { /* continue */ }
                        }
                      }
                      if (!fullPath) {
                        for (const root of MEDIA_ROOTS) {
                          fullPath = findVideoFileByTitle(root, title, media?.year);
                          if (fullPath) break;
                        }
                      }
                      if (fullPath) {
                        await MediaPostProcessorService.process(fullPath, mediaId, mediaType);
                      }
                    } catch (err: any) {
                      logger.warn(COMPONENT, `Post-download conversion failed for ${title}: ${err.message}`);
                    }
                  })();
                }, 8000);
                continue;
              }
              // Verificar tamanho mínimo (abaixo de 300MB provavelmente é propaganda/spam)
              if (t.size && t.size < MIN_SPAM_SIZE_BYTES) {
                logger.warn(COMPONENT, `Download muito pequeno (${Math.round(t.size / 1024 / 1024)}MB), removendo: ${t.name}`);
                // Deletar torrent e arquivos do qBittorrent
                if (t.hash) {
                  QBittorrentService.deleteTorrent(t.hash, true).catch(() => {});
                }
                // Marcar como erro no banco
                completedDl.status = 'error';
                await completedDl.save();
                // Atualizar Movie/Series como erro também
                if (completedDl.mediaType === 'movie') {
                  await Movie.findByIdAndUpdate(completedDl.mediaId, { status: 'error' });
                } else {
                  await Series.findByIdAndUpdate(completedDl.mediaId, { status: 'error' });
                }
                invalidateRecommendationsCache();
               continue;
               }

              const spamCheck = isLikelySpam(t.name, completedDl.title, t.size);
              if (spamCheck.spam) {
                logger.warn(COMPONENT, `Download flagged as spam/propaganda (${spamCheck.reason}): ${t.name}`);
                if (t.hash) {
                  QBittorrentService.deleteTorrent(t.hash, true).catch(() => {});
                }
                completedDl.status = 'error';
                await completedDl.save();
                if (completedDl.mediaType === 'movie') {
                  await Movie.findByIdAndUpdate(completedDl.mediaId, { status: 'error' });
                } else {
                  await Series.findByIdAndUpdate(completedDl.mediaId, { status: 'error' });
                }
                invalidateRecommendationsCache();
                continue;
              }

              completedDl.status = 'complete';
              completedDl.progress = 100;
              await completedDl.save();
              invalidateRecommendationsCache();
              if (completedDl.mediaType === 'movie') {
                await Movie.findByIdAndUpdate(completedDl.mediaId, { status: 'available' });
                const movie = await Movie.findById(completedDl.mediaId);
                await updateMediaPath(completedDl.mediaId, 'movie', completedDl.title, movie?.year);
              } else {
                await Series.findByIdAndUpdate(completedDl.mediaId, { status: 'available' });
                const series = await Series.findById(completedDl.mediaId);
                await updateMediaPath(completedDl.mediaId, 'series', completedDl.title, series?.year);
                AutoPipelineService.onDownloadComplete(
                  completedDl.mediaId,
                  completedDl.mediaType,
                  completedDl.title
                ).catch((err) => {
                  logger.warn(COMPONENT, `Post-download pipeline failed: ${err.message}`);
                });
              }
              logger.info(COMPONENT, `Download completed: ${t.name} (hash: ${t.hash})`);
              
              // P6 ( ZERO DELAY): pré-conversão do arquivo para H.264/AAC/MP4
              // em background assim que o download termina. O arquivo é
              // convertido ATOMICAMENTE (temp→rename) no mesmo diretório e o
              // DB é atualizado. Assim o usuário só precisa clicar Play.
              setTimeout(() => {
                const mediaType = completedDl!.mediaType;
                const mediaId = completedDl!.mediaId;
                const title = completedDl!.title;
                (async () => {
                  try {
                    let media: any = null;
                    if (mediaType === 'movie') media = await Movie.findById(mediaId);
                    else media = await Series.findById(mediaId);
                    if (!media) return;

                    let fullPath: string | null = null;
                    if (media.path) {
                      for (const root of MEDIA_ROOTS) {
                        const candidate = path.join(root, String(media.path));
                        try {
                          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                            fullPath = candidate;
                            break;
                          }
                        } catch { /* continue */ }
                      }
                    }
                    if (!fullPath) {
                      for (const root of MEDIA_ROOTS) {
                        fullPath = findVideoFileByTitle(root, title, media?.year);
                        if (fullPath) break;
                      }
                    }

                    if (fullPath) {
                      await MediaPostProcessorService.process(fullPath, mediaId, mediaType);
                    } else {
                      logger.warn(COMPONENT, `Post-download: could not find file for ${title}`);
                    }
                  } catch (err: any) {
                    logger.warn(COMPONENT, `Post-download conversion error: ${err.message}`);
                  }
                })();
              }, 8000); // espera 8s para garantir que o arquivo foi totalmente escrito e finalizado

              // Trigger library scan to sync DB with disk after download completes
              MediaScannerService.scanLibrary().catch((err) => {
                logger.warn(COMPONENT, `Post-download scan failed: ${err.message}`);
              });
              MediaScannerService.scanDownloads().catch((err) => {
                logger.warn(COMPONENT, `Post-download downloads scan failed: ${err.message}`);
              });
            }
          } catch { /* ignore per-item error */ }
        }
      }

      if (clients.size === 0) return;
      const msg = JSON.stringify({ type: 'download_update', torrents, downloadEvents, timestamp: Date.now() });
      const data = Buffer.from(msg);
      for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      }
    } catch {
      // qBittorrent may be offline — skip this cycle
    }
  }, 3000);

  function findTorrentByTitle(torrents: any[], title: string): any | undefined {
    const normalized = normalizeTitleForMatch(title);
    const titleLen = normalized.length;
    const titleSeason = extractSeasonNumber(normalized);

    let bestMatch: any = null;
    let bestScore = -1;

    for (const tr of torrents) {
      const tn = normalizeTitleForMatch(tr.name);
      const torrentSeason = extractSeasonNumber(tn);

      // Se ambos têm temporada e são diferentes, NUNCA casa
      // (ex: "Ted Lasso - Temporada 1" não pode casar com "Ted Lasso S02")
      if (titleSeason !== null && torrentSeason !== null && titleSeason !== torrentSeason) {
        continue;
      }

      let score = 0;

      // Exact match gets highest score
      if (tn === normalized) { score = 1000; }
      // Torrent name starts with the title — prefer shorter names (closer to exact)
      else if (tn.startsWith(normalized)) { score = 800 - Math.min(tn.length - titleLen, 500); }
      // Title is contained in torrent name
      else if (tn.includes(normalized)) { score = 600 - Math.min(tn.length - titleLen, 400); }
      // Word-level match (70% threshold)
      else {
        const words = normalized.split(' ').filter((w: string) => w.length > 2);
        if (words.length > 0) {
          const matchCount = words.filter((w: string) => tn.includes(w)).length;
          if (matchCount / words.length >= 0.7) { score = 400 + (matchCount / words.length) * 100 - Math.min(tn.length, 300); }
        }
      }

      // Bônus quando a temporada bate explicitamente (ex: "s1" nos dois)
      // Só concede o bônus se já houve relevância de título (evita casar "House S2"
      // com qualquer torrent da mesma temporada de outra série)
      if (score > 0 && titleSeason !== null && torrentSeason !== null && titleSeason === torrentSeason) {
        score += 100;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = tr;
      }
    }

    return bestScore > 0 ? bestMatch : undefined;
  }

  // ── Auto-retry: downloads que falharam são re-ativados automaticamente ────
  // Roda a cada 5 min. Se o arquivo não existe no disco → hard reset + re-pipeline.
  // Se o arquivo EXISTE → post-processa (foi baixado mas algo deu errado).
  const MEDIA_ROOTS = ['/media/movies', '/media/series', '/downloads', '/media/transcode'];
  const retryInFlight = new Set<string>(); // evita retry duplicado no mesmo ciclo

  async function autoRetryErrorDownloads() {
    const errorDownloads = await Download.find({ status: { $in: ['error', 'failed'] } });
    if (errorDownloads.length === 0) return;

    const torrents = await QBittorrentService.getTorrents().catch(() => []);
    const torrentMap = new Map<string, any>();
    for (const t of torrents) {
      if (t.hash) torrentMap.set(t.hash.toLowerCase(), t);
    }

    for (const dl of errorDownloads) {
      if (retryInFlight.has(dl._id.toString())) continue;

      // Se o torrent ainda existe no qBittorrent e está ativo, não re-ativa
      if (dl.hash && torrentMap.has(dl.hash.toLowerCase())) {
        const t = torrentMap.get(dl.hash.toLowerCase());
        if (['downloading', 'forcedDL', 'metaDL', 'forcedMetaDL', 'queuedDL'].includes(t.state)) {
          continue; // torrent ainda ativo, só precisa de tempo
        }
      }

      const mediaDoc = dl.mediaType === 'movie'
        ? await Movie.findById(dl.mediaId)
        : await Series.findById(dl.mediaId);
      if (!mediaDoc) continue;

      // Verificar se o arquivo existe em disco
      const p = (mediaDoc as any).path;
      let fileOnDisk = false;
      if (p) {
        for (const root of MEDIA_ROOTS) {
          const full = path.join(root, String(p));
          try {
            if (fs.existsSync(full) && fs.statSync(full).isFile()) {
              fileOnDisk = true;
              break;
            }
          } catch { /* continue */ }
        }
      }

      if (fileOnDisk) {
        // Arquivo existe → atualizar status para complete
        logger.info(COMPONENT, `Auto-retry: "${dl.title}" file exists on disk (${p}) → marking complete`);
        try {
          dl.status = 'complete';
          await dl.save();
          if (dl.mediaType === 'movie') {
            await Movie.findByIdAndUpdate(dl.mediaId, { status: 'complete', path: p });
          } else {
            await Series.findByIdAndUpdate(dl.mediaId, { status: 'complete', path: p });
          }
          invalidateRecommendationsCache();
        } catch (err: any) {
          logger.warn(COMPONENT, `Auto-retry post-process failed: ${err.message}`);
        }
        continue;
      }

      // Arquivo NÃO existe → hard reset + re-pipeline
      retryInFlight.add(dl._id.toString());
      const retryCount = ((mediaDoc as any).retryCount || 0) + 1;
      const backoffMs = Math.min(5 * 60 * 1000 * Math.pow(2, retryCount - 1), 60 * 60 * 1000); // 5min→10min→20min→40min→60min max

      logger.info(COMPONENT, `Auto-retry #${retryCount}: "${dl.title}" (${dl.mediaType}) — re-triggering pipeline`);

      try {
        // Limpar download antigo
        if (dl.hash) {
          await QBittorrentService.deleteTorrent(dl.hash, true).catch(() => {});
        }
        await Download.findByIdAndDelete(dl._id);

        if (dl.mediaType === 'movie') {
          const movie = mediaDoc as any;
          // Hard reset: remover do Radarr e DB
          if (movie.radarrId) {
            await RadarrService.deleteMovie(movie.radarrId, false).catch(() => {});
          }
          // Re-criar registro limpo
          const newMovie = await Movie.create({
            tmdbId: movie.tmdbId,
            title: movie.title,
            originalTitle: movie.originalTitle,
            year: movie.year,
            poster: movie.poster,
            backdrop: movie.backdrop,
            overview: movie.overview,
            status: 'downloading',
            retryCount,
            lastRetryAt: new Date(),
          });

          await createDownloadIfUnique({
            mediaId: newMovie._id.toString(),
            mediaType: 'movie',
            title: newMovie.title,
            poster: newMovie.poster,
            status: 'downloading',
          });

          // Deletar o registro antigo
          await Movie.findByIdAndDelete(movie._id);

          // Rodar pipeline (Radarr → ApacheTorrent → RedeCanais)
          const { ApacheTorrentService } = require('./services/ApacheTorrentService');
          const searchTitle = movie.originalTitle || movie.title;

          try {
            const radarrMovie = await RadarrService.addMovie(movie.tmdbId, movie.title, movie.year);
            newMovie.radarrId = radarrMovie.id;
            newMovie.quality = radarrMovie.qualityProfileId?.toString();
            await newMovie.save();
            logger.info(COMPONENT, `Auto-retry: "${movie.title}" re-added to Radarr (id=${radarrMovie.id})`);

            // Fallback check after 15s
            setTimeout(async () => {
              try {
                const radarrConfig = await RadarrService.getRadarrConfig();
                const { data: queue } = await import('axios').then(ax => ax.default.get(
                  `${radarrConfig.url}/api/v3/queue`,
                  { headers: { 'X-Api-Key': radarrConfig.apiKey }, timeout: 10000 }
                ));
                const inQueue = (queue.records || []).some((r: any) => r.movie?.id === radarrMovie.id);
                if (!inQueue) {
                  const grabResult = await RadarrService.manualGrab(radarrMovie.id, 3072, searchTitle, movie.year);
                  if (grabResult.grabbed) {
                    logger.info(COMPONENT, `Auto-retry: manual grab succeeded for "${movie.title}"`);
                  } else {
                    // ApacheTorrent fallback
                    const brResults = await ApacheTorrentService.searchBR(searchTitle);
                    if (brResults.length > 0) {
                      const batch = await ApacheTorrentService.addAllMagnets(brResults, '/media/movies', movie.year, undefined, searchTitle);
                      if (batch.added > 0) {
                        logger.info(COMPONENT, `Auto-retry: ApacheTorrent fallback added ${batch.added} magnets for "${movie.title}"`);
                      } else {
                        // Mark as pending for PendingRetryService
                        await Movie.findByIdAndUpdate(newMovie._id, { status: 'pending' });
                        await Download.findOneAndUpdate({ mediaId: newMovie._id.toString() }, { status: 'failed' }).catch(() => {});
                        logger.warn(COMPONENT, `Auto-retry: no PT-BR source for "${movie.title}" → pending`);
                      }
                    } else {
                      await Movie.findByIdAndUpdate(newMovie._id, { status: 'pending' });
                      await Download.findOneAndUpdate({ mediaId: newMovie._id.toString() }, { status: 'failed' }).catch(() => {});
                    }
                  }
                }
              } catch (err: any) {
                logger.warn(COMPONENT, `Auto-retry queue check failed: ${err.message}`);
              }
            }, 15000);
          } catch (err: any) {
            logger.warn(COMPONENT, `Auto-retry Radarr re-add failed: ${err.message}`);
            await Movie.findByIdAndUpdate(newMovie._id, { status: 'pending' });
          }
        } else {
          // Series: usar AutoPipelineService
          const { AutoPipelineService } = require('./services/AutoPipelineService');
          await AutoPipelineService.runSeriesPipeline(mediaDoc._id.toString()).catch((err: any) => {
            logger.warn(COMPONENT, `Auto-retry series pipeline failed: ${err.message}`);
          });
        }
      } catch (err: any) {
        logger.warn(COMPONENT, `Auto-retry failed for "${dl.title}": ${err.message}`);
      } finally {
        retryInFlight.delete(dl._id.toString());
      }
    }
  }

  // ── Auto-cascade-delete: mídia sem conteúdo em disco é removida de tudo ─────
  // Roda no startup e a cada 24h em background.
  // SÓ deleta quando o arquivo NÃO existe mais em disco (não apenas status error).
  async function cascadeDeleteErrorMedia() {
    const CORRUPT = ['error', 'failed'];
    const errorMovies = await Movie.find({ status: { $in: CORRUPT } });
    const errorSeries = await Series.find({ status: { $in: CORRUPT } });
    const items = [
      ...errorMovies.map(m => ({ doc: m, type: 'movie' as const })),
      ...errorSeries.map(s => ({ doc: s, type: 'series' as const })),
    ];
    if (items.length === 0) return;

    // Verificar quais realmente não têm arquivo em disco
    const MEDIA_ROOTS = ['/media/movies', '/media/series', '/downloads', '/media/transcode'];
    const toDelete: typeof items = [];

    for (const item of items) {
      const p = (item.doc as any).path;
      if (!p) {
        // Sem path → nunca teve conteúdo → deletar
        toDelete.push(item);
        continue;
      }
      // Verificar se o arquivo existe em algum root
      const fileExists = MEDIA_ROOTS.some(root => {
        const full = path.join(root, p);
        try { return fs.existsSync(full); } catch { return false; }
      });
      if (!fileExists) {
        toDelete.push(item);
      } else {
        logger.info(COMPONENT, `Cascade skip: "${item.doc.title}" has file on disk (${p}) — retrying download`);
      }
    }

    if (toDelete.length === 0) return;
    logger.info(COMPONENT, `Cascade cleanup: ${toDelete.length} items without disk content`);

    for (const { doc, type } of toDelete) {
      const title = doc.title || 'Unknown';
      try {
        // 1. Radarr/Sonarr
        if (type === 'movie' && (doc as any).radarrId) {
          const { RadarrService } = require('./services/RadarrService');
          await RadarrService.deleteMovie((doc as any).radarrId, true).catch(() => {});
        }
        // 2. qBittorrent por hash dos downloads
        const downloads = await Download.find({ mediaId: doc._id });
        for (const dl of downloads) {
          if (dl.hash) {
            await QBittorrentService.deleteTorrent(dl.hash, true).catch(() => {});
          }
        }
        // 3. Disco (limpa qualquer resquício)
        if ((doc as any).path) {
          for (const root of MEDIA_ROOTS) {
            const full = path.join(root, (doc as any).path);
            try {
              if (fs.existsSync(full)) {
                const st = fs.statSync(full);
                if (st.isFile()) fs.unlinkSync(full);
                else if (st.isDirectory()) fs.rmSync(full, { recursive: true });
              }
            } catch {}
          }
        }
        // 4. MongoDB
        await Download.deleteMany({ mediaId: doc._id });
        await WatchProgress.deleteMany({ mediaId: doc._id });
        if (type === 'movie') await Movie.findByIdAndDelete(doc._id);
        else await Series.findByIdAndDelete(doc._id);

        invalidateRecommendationsCache();
        logger.info(COMPONENT, `Cascade deleted: "${title}" (${type})`);
      } catch (err: any) {
        logger.warn(COMPONENT, `Cascade delete failed for "${title}": ${err.message}`);
      }
    }
  }

  server.listen(PORT, () => {
    logger.info(COMPONENT, `Media API running on port ${PORT}`);
    logger.info(COMPONENT, `WebSocket available at /ws`);

    // Reconciliação de status + sync de metadados no startup
    (async () => {
      try {
        // 0. Inicia a fila de conversão pós-download (P6) e retoma pendentes
        await ConversionQueueService.ensureStarted();

        // 1. Status travados → 'error' (filmes/séries em 'downloading' sem download ativo).
        //    'pending' NÃO é travado: pendentes legítimos não têm download ativo ainda
        //    (são retomados pelo PendingRetryService).
        const stalledMovies = await Movie.find({ status: 'downloading' });
        const stalledSeries = await Series.find({ status: 'downloading' });
        const activeDownloads = await Download.find({ status: { $in: ['downloading', 'queued'] } });
        const activeByMediaId = new Set(activeDownloads.map(d => d.mediaId.toString()));

        let fixed = 0;
        for (const m of stalledMovies) {
          if (!activeByMediaId.has(m._id.toString())) {
            await Movie.findByIdAndUpdate(m._id, { status: 'error' });
            fixed++;
          }
        }
        for (const s of stalledSeries) {
          if (!activeByMediaId.has(s._id.toString())) {
            await Series.findByIdAndUpdate(s._id, { status: 'error' });
            fixed++;
          }
        }
        if (fixed > 0) logger.info(COMPONENT, `Startup: ${fixed} items with stale 'downloading' status fixed to 'error'`);

        // 2. Limpeza de downloads completos >24h (mantém apenas últimos para histórico)
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const oldComplete = await Download.find({ status: 'complete', updatedAt: { $lt: cutoff } });
        if (oldComplete.length > 0) {
          await Download.deleteMany({ _id: { $in: oldComplete.map(d => d._id) } });
          logger.info(COMPONENT, `Startup: ${oldComplete.length} old completed downloads removed`);
        }

        // 3. Sync de metadados (capas/sinopse/gêneros) para itens sem poster
        const result = await MetadataService.syncAllMetadata();
        logger.info(COMPONENT, `Metadata sync: ${result.movies} movies, ${result.series} series enriched`);

        // 4. Auto-cascade-delete: remove mídia sem conteúdo em disco
        await cascadeDeleteErrorMedia();

        // 4.5. Catch-up: pós-conversão para mídias disponíveis com arquivos incompatíveis.
        //      O container pode ter reiniciado durante o download (status travado em 'downloading')
        //      e o post-processing nunca disparou. Aqui detectamos filmes/séries 'available' cujo
        //      arquivo no disco ainda é MKV/AC3/HEVC e rodamos a conversão.
        (async () => {
          try {
            const availableMovies = await Movie.find({ status: 'available' });
            const availableSeries = await Series.find({ status: 'available' });
            let converted = 0;
            for (const m of availableMovies) {
              const p = (m as any).path;
              if (!p) continue;
              let fp: string | null = null;
              for (const root of MEDIA_ROOTS) {
                const cand = path.join(root, p);
                try { if (fs.existsSync(cand) && fs.statSync(cand).isFile()) { fp = cand; break; } } catch {}
              }
              if (!fp) continue;
              try {
                const { spawnSync } = require('child_process');
                const r = spawnSync('/usr/lib/jellyfin-ffmpeg/ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', fp], { timeout: 10000, encoding: 'utf8' });
                if (r.status === 0) {
                  const d = JSON.parse(r.stdout);
                  const a = (d.streams?.find((s: any) => s.codec_type === 'audio')?.codec_name || '').toLowerCase();
                  if (a && !['aac', 'mp3', 'opus'].includes(a)) {
                    logger.info(COMPONENT, `Catch-up post-process: ${m.title} (audio=${a})`);
                    await MediaPostProcessorService.process(fp, m._id.toString(), 'movie');
                    converted++;
                  }
                }
              } catch {}
            }
            for (const s of availableSeries) {
              const p = (s as any).path;
              if (!p) continue;
              let fp: string | null = null;
              for (const root of MEDIA_ROOTS) {
                const cand = path.join(root, p);
                try { if (fs.existsSync(cand) && fs.statSync(cand).isFile()) { fp = cand; break; } } catch {}
              }
              if (!fp) continue;
              try {
                const { spawnSync } = require('child_process');
                const r = spawnSync('/usr/lib/jellyfin-ffmpeg/ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', fp], { timeout: 10000, encoding: 'utf8' });
                if (r.status === 0) {
                  const d = JSON.parse(r.stdout);
                  const a = (d.streams?.find((s: any) => s.codec_type === 'audio')?.codec_name || '').toLowerCase();
                  if (a && !['aac', 'mp3', 'opus'].includes(a)) {
                    logger.info(COMPONENT, `Catch-up post-process: ${s.title} (audio=${a})`);
                    await MediaPostProcessorService.process(fp, s._id.toString(), 'series');
                    converted++;
                  }
                }
              } catch {}
            }
            if (converted > 0) logger.info(COMPONENT, `Catch-up post-processing: ${converted} incompatible files converted`);
          } catch (err: any) {
            logger.warn(COMPONENT, `Catch-up post-processing failed: ${err.message}`);
          }
        })();

        // 5. Auto-retry: downloads que falharam são re-ativados (5min interval)
        autoRetryErrorDownloads().catch((err) =>
          logger.warn(COMPONENT, `Startup auto-retry failed: ${err.message}`)
        );
        setInterval(() => {
          autoRetryErrorDownloads().catch((err) =>
            logger.warn(COMPONENT, `Scheduled auto-retry failed: ${err.message}`)
          );
        }, 5 * 60 * 1000);
        logger.info(COMPONENT, 'Auto-retry downloads ativo — rodando a cada 5min');

        // 4. Configurar limites do qBittorrent para maximizar paralelismo
        try {
          await QBittorrentService.configureActiveLimits(25, 20);
          logger.info(COMPONENT, 'qBittorrent active limits configured: max_active_torrents=25, max_active_downloads=20');
        } catch (err: any) {
          logger.warn(COMPONENT, `Failed to configure qBittorrent limits: ${err.message}`);
        }

        // 5. Pré-aquecer o cache de imagens TMDB em disco (CDN é intermitente nesta rede).
        // Roda em background com retries: se pegar o CDN "fora", tenta de novo até pegar uma janela boa.
        (async () => {
          try {
            const posterItems = [
              ...(await Movie.find({ poster: { $exists: true, $ne: '' } }, { poster: 1 })),
              ...(await Series.find({ poster: { $exists: true, $ne: '' } }, { poster: 1 })),
            ];
            let jobs: { subPath: string; cacheFile: string }[] = [];
            for (const item of posterItems) {
              const m = String(item.poster || '').match(/image\.tmdb\.org\/t\/p\/(.+)$/);
              if (!m) continue;
              const subPath = `/${m[1]}`;
              if (fs.existsSync(cacheFilePath(subPath))) continue;
              jobs.push({ subPath, cacheFile: cacheFilePath(subPath) });
            }
            if (jobs.length === 0) {
              logger.info(COMPONENT, 'TMDB image cache warm: nada a fazer (todas já em cache)');
              return;
            }
            const deadline = Date.now() + 10 * 60 * 1000;
            while (jobs.length > 0 && Date.now() < deadline) {
              const failed: typeof jobs = [];
              for (const job of jobs) {
                if (fs.existsSync(job.cacheFile)) continue;
                try {
                  const r = await fetchTmdbImageBytes(job.subPath);
                  if (r.status < 400 && r.data.length > 0) {
                    fs.mkdirSync(TMDB_IMAGE_CACHE_DIR, { recursive: true });
                    fs.writeFileSync(job.cacheFile, r.data);
                    logger.info(COMPONENT, `TMDB image cached: ${job.subPath}`);
                  } else {
                    failed.push(job);
                  }
                } catch {
                  failed.push(job);
                }
              }
              const cachedNow = jobs.length - failed.length;
              if (failed.length > 0) {
                logger.warn(COMPONENT, `TMDB image cache warm: ${cachedNow}/${jobs.length} nesta rodada, retentando ${failed.length} em 15s`);
                jobs = failed;
                await new Promise((r) => setTimeout(r, 15000));
              } else {
                jobs = [];
              }
            }
            logger.info(COMPONENT, `TMDB image cache warm: concluído${jobs.length > 0 ? ` (${jobs.length} ainda pendentes após timeout)` : ''}`);
          } catch (warmErr: any) {
            logger.warn(COMPONENT, `TMDB image cache warm failed: ${warmErr.message}`);
          }
        })();
      } catch (err: any) {
        logger.warn(COMPONENT, `Startup reconciliation/sync error: ${err.message}`);
      }
    })();

    // Cover cache sync: roda a cada 12 horas
    const COVER_SYNC_INTERVAL = 12 * 60 * 60 * 1000;
    setInterval(() => {
      CoverCacheService.syncAllCovers().catch((err) => {
        logger.warn(COMPONENT, `Cover cache sync failed: ${err.message}`);
      });
    }, COVER_SYNC_INTERVAL);
    // Sync initial na startup (em background, não bloqueia)
    CoverCacheService.syncAllCovers().catch(() => {});

    // Auto-cascade-delete: roda a cada 24h em background
    const CASCADE_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;
    setInterval(() => {
      cascadeDeleteErrorMedia().catch((err) => {
        logger.warn(COMPONENT, `24h cascade cleanup failed: ${err.message}`);
      });
    }, CASCADE_CLEANUP_INTERVAL);

    // Start automatic library scanner (runs immediately on startup, then every 24h)
    MediaScannerService.start(24);

    // Auto-cleanup: remove arquivos locais de mídias 100% assistidas há >30 dias
    // (regra 4 — Auto-Limpeza do Regras_dolfimflix.md)
    import('./services/MaintenanceService').then(({ MaintenanceService }) => {
      MaintenanceService.startCleanup(30);
      logger.info(COMPONENT, 'Auto-cleanup ativo — remove arquivos assistidos há >30 dias');
    }).catch((err: unknown) => {
      logger.warn(COMPONENT, `Auto-cleanup init falhou: ${(err as Error).message}`);
    });

    // Nova busca automática de itens 'pending' (roda imediatamente e a cada hora)
    PendingRetryService.start(1);

    // Reconciliação de séries 'pending' sem hash ativo no qBittorrent
    // (evita que séries fiquem presas em pending indefinidamente)
    import('./services/AutoPipelineService').then(({ AutoPipelineService }) => {
      AutoPipelineService.reconcilePendingSeries().catch((err: unknown) =>
        logger.warn(COMPONENT, `reconcilePendingSeries startup falhou: ${(err as Error).message}`)
      );
      setInterval(() => {
        AutoPipelineService.reconcilePendingSeries().catch((err: unknown) =>
          logger.warn(COMPONENT, `reconcilePendingSeries scheduled falhou: ${(err as Error).message}`)
        );
      }, 60 * 60 * 1000);
      logger.info(COMPONENT, 'reconcilePendingSeries ativo — rodando a cada 1h');
    }).catch((err: unknown) => {
      logger.warn(COMPONENT, `reconcilePendingSeries import falhou: ${(err as Error).message}`);
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(COMPONENT, `${signal} received — shutting down`);
    clearInterval(broadcastInterval);
    wss.close();
    server.close(() => {
      logger.info(COMPONENT, 'Server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error(COMPONENT, 'Fatal startup error', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
