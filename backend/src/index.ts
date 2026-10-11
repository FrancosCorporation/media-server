// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFile, type ChildProcess } from 'child_process';
import { rateLimit } from 'express-rate-limit';
import { connectDatabase } from './config/database';
import { QBittorrentService } from './services/QBittorrentService';
import { RadarrService } from './services/RadarrService';
import { seedAdmin } from './config/seed';
import { Download } from './models/Download';
import { Movie } from './models/Movie';
import { Series } from './models/Series';
import { WatchProgress } from './models/WatchProgress';
import { AutoPipelineService } from './services/AutoPipelineService';
import { FailedSourceStore } from './services/FailedSourceStore';
import { MetadataService } from './services/MetadataService';
import { CoverCacheService } from './services/CoverCacheService';
import { ConversionQueueService } from './services/ConversionQueueService';
import { MediaPostProcessorService } from './services/MediaPostProcessorService';
import { MediaDedupeService } from './services/MediaDedupeService';
import { TorrentValidationService } from './services/TorrentValidationService';
import { ApacheTorrentService } from './services/ApacheTorrentService';
import { createDownloadIfUnique } from './utils/dedupe';
import { MediaScannerService } from './services/MediaScannerService';
import { PendingRetryService } from './services/PendingRetryService';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { normalizeTitleForMatch, extractSeasonNumber } from './utils/mediaOrganizer';
import { MIN_SPAM_SIZE_BYTES, isLikelySpam, isMaliciousFileName, isJunkFileName, isSpamFileName } from './utils/constants';

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
import devicesRoutes from './routes/devices';
import posterRoutes from './routes/poster';
import trendingRoutes from './routes/trending';
import debugRoutes from './routes/debug';
import { authenticateToken } from './middleware/auth';
import { requireAdmin } from './middleware/auth';
import { invalidateRecommendationsCache } from './routes/recommendations';
import { applyTorrentStatus, STALL_TIMEOUT_MS } from './utils/downloadStatus';
import { FRONTEND_ORIGINS } from './utils/corsPolicy';
import {
  buildServiceUrl,
  detectRasterImageType,
  extractSafeImagePath,
  sanitizeImagePath,
} from './utils/proxySecurity';
import { Settings } from './models/Settings';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';

const COMPONENT = 'Server';
const PORT = parseInt(process.env.API_PORT || '4000', 10);

const MEDIA_ROOTS = ['/media/movies', '/media/series', '/downloads', '/media/transcode'];

// Tracking de torrents já validados pelo "Teste do Pedacinho" (evita re-validar)
const validatedTorrents = new Set<string>();
// Caches por torrent: evita re-escanear arquivos/refazer varredura de disco a
// cada ciclo de 3s quando o download já está complete (spam de I/O e log).
const malwareScannedTorrents = new Set<string>();
const junkCleanedTorrents = new Set<string>();
// Mídias cujas releases perdedoras já foram removidas (evita re-processar por ciclo)
const losersCleanedMedia = new Set<string>();
const activeTmdbFetches = new Set<ChildProcess>();

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
  // Normalizador de nomes de release: separadores (. _ -) viram espaço para casar
  // "spider-man.brand.new.day" com "Spider-Man: Brand New Day"
  const norm = (s: string) => s.toLowerCase().replace(/[.\-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const normTitle = norm(title);

  // ── FIX ("Could not find file on disk" em loop) ─────────────────────────
  // A pasta no disco raramente contém o ANO para SÉRIES (ex: "Reacher/" para
  // série de 2022). Exigir o ano no nome da pasta fazia o matcher pular a
  // pasta certa e logar "Could not find file on disk" para sempre (a cada
  // ciclo do broadcast). Ano agora é PREFERÊNCIA, não filtro: tenta com ano
  // primeiro; se nada, repete sem o filtro de ano.
  const search = (requireYear: boolean): string | null => {
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      // ── Arquivos DIRETO na raiz (qBittorrent salva filmes sem subpasta) ──
      // Ex: "/media/movies/Spider-Man.Brand.New.Day.2026.1080p.CAMRip.Dublado.V.5.mkv"
      let bestRootFile: string | null = null;
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.ts', '.rmvb', '.flv'].includes(path.extname(entry.name).toLowerCase())) continue;
        if (entry.name.startsWith('.')) continue;
        if (entry.name.startsWith('.tmp_')) continue;
        const nName = norm(entry.name);
        if (!nName.includes(normTitle)) continue;
        if (requireYear && year && !nName.includes(String(year))) continue;
        const fp = path.join(root, entry.name);
        const spamCheck = isLikelySpam(entry.name, title, fileSizeOf(fp));
        if (spamCheck.spam) continue;
        if (!bestRootFile) bestRootFile = fp; // primeiro match; ano já filtrado se exigido
      }
      if (bestRootFile) return bestRootFile;

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          // Compara as DUAS pontas normalizadas ("Tom.and.Jerry" ↔ "Tom & Jerry"):
          // antes comparava nome cru com string alfanumérica e nunca casava pasta.
          const nDir = norm(entry.name);
          if (!nDir.includes(normTitle)) continue;

          if (requireYear && year && !nDir.includes(year.toString())) continue;

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
    };

  // 1ª passada: com ano (mais preciso quando a pasta o inclui); 2ª: sem ano
  return search(true) || search(false);
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

async function updateMediaPath(mediaId: string, mediaType: 'movie' | 'series', title: string, year?: number, altTitles?: Array<string | undefined>) {
  try {
    // ── FIX (log spam a cada ciclo + path apontando para EPISÓDIO falso) ────
    // Séries: NUNCA salvar path de ARQUIVO — o campo deve apontar para a PASTA
    // da série (ex: "Reacher"). Caso real: a cada ciclo do broadcast o path da
    // série era sobrescrito com "Reacher/Season 01/Reacher - S01E00_dup.mp4"
    // (episódio falso S01E00 + promo 1XBET na mesma temporada).
    if (mediaType === 'series') {
      // Usa TODAS as variações de título (PT exibição + originalTitle/canonical)
      // porque a pasta no disco costuma vir no idioma original do release
      // (ex.: série "A Casa do Dragão" → pasta "House of the Dragon").
      const cleanList = [title, ...(altTitles || [])]
        .filter((t): t is string => !!t)
        .map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ''))
        .filter((c) => c.length >= 3);
      for (const root of MEDIA_ROOTS) {
        if (root !== '/media/series') continue;
        try {
          const entries = fs.readdirSync(root, { withFileTypes: true });
          const dir = entries.find((e) => e.isDirectory() && cleanList.some((c) => e.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(c)));
          if (dir) {
            const rel = path.join(dir.name).replace(/\\/g, '/');
            const seriesDoc = await Series.findById(mediaId);
            if (seriesDoc && seriesDoc.path === rel) return; // já correto — sem log spam
            await Series.findByIdAndUpdate(mediaId, { path: rel });
            logger.info(COMPONENT, `Updated series path (directory): ${rel}`);
            return;
          }
          // Episódios soltos na raiz (/media/series/The.Last.of.Us.S01E01...)
          const loose = entries.find((e) => e.isFile() &&
            ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.ts'].includes(path.extname(e.name).toLowerCase()) &&
            cleanList.some((c) => e.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(c)));
          if (loose) {
            const rel = path.join(loose.name).replace(/\\/g, '/');
            const seriesDoc = await Series.findById(mediaId);
            if (seriesDoc && seriesDoc.path === rel) return;
            await Series.findByIdAndUpdate(mediaId, { path: rel });
            logger.info(COMPONENT, `Updated series path (loose episode): ${rel}`);
            return;
          }
        } catch { /* continue */ }
      }
      return; // série: nunca cai no fluxo de arquivo abaixo
    }

    // Tenta o título PT e também originalTitle/canonicalTitle (release EN
    // baixado para filme com título PT — ex.: "Cidade de Deus" x "City of God").
    const searchTitles = [title, ...(altTitles || [])].filter((t): t is string => !!t && t.length >= 3);
    for (const root of MEDIA_ROOTS) {
      let fullPath: string | null = null;
      for (const t of searchTitles) {
        fullPath = findVideoFileByTitle(root, t, year);
        if (fullPath) break;
      }
      if (fullPath) {
        // Guarda anti-propaganda: nunca apontar path para spam/promo
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile() && isSpamFileName(path.basename(fullPath), stat.size)) {
            logger.warn(COMPONENT, `Skipping spam file for ${mediaType} path: ${fullPath}`);
            continue;
          }
        } catch { /* ignore */ }
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
    origin(origin, callback) {
      if (!origin || !FRONTEND_ORIGINS.has(origin)) return callback(null, false);
      callback(null, origin);
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));
  morgan.token('safe-url', (req) => (req.url || '').split(/[?#]/, 1)[0].slice(0, 512));
  app.use(morgan(':remote-addr :method :safe-url :status :res[content-length] - :response-time ms'));

  if (FRONTEND_ORIGINS.size === 0) {
    logger.warn(COMPONENT, 'FRONTEND_URL(S) não configurada; CORS cross-origin ficará fechado');
  }

  const imageProxyRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Limite de requisições de imagem atingido. Tente novamente em um minuto.' },
  });

  // Proxy de imagens do TMDB — evita CORS do image.tmdb.org.
  // O CDN (BunnyCDN) é intermitente nesta rede; o fetch é feito num processo filho
  // (tmdb-fetch.js) e os bytes são mantidos em cache em disco (ver TMDB_IMAGE_CACHE_DIR).

  // Cache local em disco dos bytes das imagens: o CDN do TMDB (BunnyCDN) é intermitente
  // nesta rede, então depois de baixar UMA vez a capa fica disponível para sempre,
  // mesmo com o CDN fora. Mantido em volume persistente (TMDB_IMAGE_CACHE_DIR).
  const TMDB_IMAGE_CACHE_DIR = path.resolve(
    process.env.TMDB_IMAGE_CACHE_DIR || '/app/cache/tmdb-images',
  );
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const DEFAULT_CACHE_MAX_BYTES = 5 * 1024 * 1024 * 1024;
  const DEFAULT_CACHE_MIN_FREE_BYTES = 512 * 1024 * 1024;
  const DEFAULT_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

  function cacheSetting(name: string, fallback: number, minimum: number, maximum: number): number {
    const rawValue = process.env[name];
    const value = rawValue ? Number(rawValue) : fallback;
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      logger.warn(COMPONENT, `${name} inválido; usando limite padrão`);
      return fallback;
    }
    return value;
  }

  const TMDB_IMAGE_CACHE_MAX_BYTES = cacheSetting(
    'TMDB_IMAGE_CACHE_MAX_BYTES', DEFAULT_CACHE_MAX_BYTES, 10 * 1024 * 1024, 50 * 1024 * 1024 * 1024,
  );
  const TMDB_IMAGE_CACHE_MIN_FREE_BYTES = cacheSetting(
    'TMDB_IMAGE_CACHE_MIN_FREE_BYTES', DEFAULT_CACHE_MIN_FREE_BYTES, 0, 10 * 1024 * 1024 * 1024,
  );
  const TMDB_IMAGE_CACHE_TTL_MS = cacheSetting(
    'TMDB_IMAGE_CACHE_TTL_MS', DEFAULT_CACHE_TTL_MS, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000,
  );
  const imageCacheEntries = new Map<string, { size: number; modifiedAt: number }>();
  let imageCacheBytes = 0;
  let imageCacheInitialized = false;

  function cacheFilePath(imagePath: string): string {
    const digest = crypto.createHash('sha256').update(imagePath).digest('hex');
    return path.join(TMDB_IMAGE_CACHE_DIR, `${digest}.img`);
  }

  function removeImageCacheFile(file: string): void {
    const existing = imageCacheEntries.get(file);
    if (existing) {
      imageCacheBytes = Math.max(0, imageCacheBytes - existing.size);
      imageCacheEntries.delete(file);
    }
    try { fs.unlinkSync(file); } catch { /* arquivo já removido ou cache read-only */ }
  }

  function rememberImageCacheFile(file: string, size: number, modifiedAt: number): void {
    const previous = imageCacheEntries.get(file);
    if (previous) imageCacheBytes = Math.max(0, imageCacheBytes - previous.size);
    imageCacheEntries.set(file, { size, modifiedAt });
    imageCacheBytes += size;
  }

  function initializeImageCache(): void {
    if (imageCacheInitialized) return;
    imageCacheInitialized = true;
    try {
      fs.mkdirSync(TMDB_IMAGE_CACHE_DIR, { recursive: true });
      const now = Date.now();
      for (const entry of fs.readdirSync(TMDB_IMAGE_CACHE_DIR, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const file = path.join(TMDB_IMAGE_CACHE_DIR, entry.name);
        if (/^[a-f0-9]{40}\.[a-z0-9]{1,8}$/i.test(entry.name)) {
          removeImageCacheFile(file); // remove cache legado com extensão baseada na URL
          continue;
        }
        if (!/^[a-f0-9]{64}\.img$/i.test(entry.name)) continue;
        try {
          const stat = fs.statSync(file);
          if (stat.size > MAX_IMAGE_BYTES || now - stat.mtimeMs > TMDB_IMAGE_CACHE_TTL_MS) {
            removeImageCacheFile(file);
          } else {
            rememberImageCacheFile(file, stat.size, stat.mtimeMs);
          }
        } catch { /* ignora entrada removida durante a leitura */ }
      }
      trimImageCache(0);
    } catch (error) {
      logger.warn(COMPONENT, 'Cache de imagens indisponível; servindo imagens sem persistir', {
        errorCode: (error as NodeJS.ErrnoException).code,
      });
    }
  }

  function trimImageCache(requiredBytes: number): boolean {
    const expiredBefore = Date.now() - TMDB_IMAGE_CACHE_TTL_MS;
    for (const [file, entry] of imageCacheEntries) {
      if (entry.modifiedAt < expiredBefore) removeImageCacheFile(file);
    }

    while (imageCacheBytes + requiredBytes > TMDB_IMAGE_CACHE_MAX_BYTES) {
      const oldest = [...imageCacheEntries.entries()].sort((a, b) => a[1].modifiedAt - b[1].modifiedAt)[0];
      if (!oldest) return false;
      removeImageCacheFile(oldest[0]);
    }
    return true;
  }

  function loadCachedImage(file: string): Buffer | null {
    initializeImageCache();
    try {
      const stat = fs.statSync(file);
      if (stat.size <= 0 || stat.size > MAX_IMAGE_BYTES || Date.now() - stat.mtimeMs > TMDB_IMAGE_CACHE_TTL_MS) {
        removeImageCacheFile(file);
        return null;
      }
      const bytes = fs.readFileSync(file);
      if (!detectRasterImageType(bytes)) {
        removeImageCacheFile(file);
        return null;
      }
      rememberImageCacheFile(file, stat.size, stat.mtimeMs);
      return bytes;
    } catch {
      return null;
    }
  }

  function writeCachedImage(file: string, bytes: Buffer): boolean {
    const imageType = detectRasterImageType(bytes);
    if (!imageType || bytes.length > MAX_IMAGE_BYTES) return false;
    initializeImageCache();
    try {
      if (!trimImageCache(bytes.length)) return false;
      const statfs = fs.statfsSync(TMDB_IMAGE_CACHE_DIR);
      const freeBytes = statfs.bavail * statfs.bsize;
      if (freeBytes - bytes.length < TMDB_IMAGE_CACHE_MIN_FREE_BYTES) {
        logger.warn(COMPONENT, 'Cache de imagens ignorado para preservar espaço livre em disco');
        return false;
      }
      fs.writeFileSync(file, bytes, { mode: 0o600 });
      const stat = fs.statSync(file);
      rememberImageCacheFile(file, stat.size, stat.mtimeMs);
      return true;
    } catch (error) {
      logger.warn(COMPONENT, 'Falha ao persistir imagem no cache', {
        errorCode: (error as NodeJS.ErrnoException).code,
      });
      return false;
    }
  }

  function sendRasterImage(res: express.Response, bytes: Buffer): express.Response | null {
    const imageType = detectRasterImageType(bytes);
    if (!imageType) return null;
    res.set({
      'Content-Type': imageType.contentType,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.send(bytes);
  }

  // Fetch dos bytes da imagem via processo filho (node tmdb-fetch.js): o processo
  // principal NÃO consegue completar TLS para os edges do BunnyCDN (rede intermitente),
  // mas um processo novo responde em <1s. Resultado testado múltiplas vezes.
  // Definido fora da rota para ser reutilizado no pré-aquecimento de cache no startup.
  const TMDB_FETCH_SCRIPT = path.resolve(__dirname, '..', 'tmdb-fetch.js');
  async function fetchTmdbImageBytes(subPath: string, signal?: AbortSignal): Promise<Buffer> {
    const safePath = sanitizeImagePath(subPath, 'tmdb');
    if (!safePath) throw new Error('Caminho de imagem TMDB inválido');
    const data = await new Promise<Buffer>((resolve, reject) => {
      let child: ChildProcess;
      child = execFile(
        'node',
        [TMDB_FETCH_SCRIPT, safePath],
        {
          timeout: 45000,
          maxBuffer: MAX_IMAGE_BYTES,
          encoding: 'buffer' as BufferEncoding,
          signal,
        },
        (error, stdout) => {
          activeTmdbFetches.delete(child);
          if (error) return reject(error);
          const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || '');
          if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
            return reject(new Error('Resposta TMDB vazia ou acima do limite'));
          }
          resolve(bytes);
        },
      );
      activeTmdbFetches.add(child);
      child.once('close', () => activeTmdbFetches.delete(child));
    });
    if (!detectRasterImageType(data)) throw new Error('Resposta TMDB não contém imagem raster válida');
    return data;
  }

  app.get('/api/tmdb-image/*', imageProxyRateLimit, async (req, res) => {
    const imagePath = extractSafeImagePath(req.originalUrl, '/api/tmdb-image', 'tmdb');
    if (!imagePath) return res.status(400).json({ error: 'Caminho de imagem inválido' });

    const cacheFile = cacheFilePath(imagePath);
    const cachedImage = loadCachedImage(cacheFile);
    if (cachedImage) return sendRasterImage(res, cachedImage);

    const abortController = new AbortController();
    res.once('close', () => {
      if (!res.writableEnded) abortController.abort();
    });

    try {
      const bytes = await fetchTmdbImageBytes(imagePath, abortController.signal);
      writeCachedImage(cacheFile, bytes);
      logger.info('TMDBImage', 'Imagem carregada', { imagePath, bytes: bytes.length });
      const sent = sendRasterImage(res, bytes);
      if (!sent) return res.status(502).json({ error: 'Resposta de imagem inválida' });
      return sent;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      logger.warn('TMDBImage', 'Proxy de imagem indisponível', { errorCode: code || 'UPSTREAM_ERROR' });
      const fallback = loadCachedImage(cacheFile);
      if (fallback) return sendRasterImage(res, fallback);
      return res.status(502).json({ error: 'Não foi possível carregar a imagem' });
    }
  });

  let upstreamHealthCache: { checkedAt: number; radarr: boolean; sonarr: boolean } | null = null;
  let upstreamHealthPromise: Promise<{ radarr: boolean; sonarr: boolean }> | null = null;
  async function checkArrService(url: string, apiKey: string): Promise<boolean> {
    if (!apiKey) return false;
    try {
      const target = buildServiceUrl(url, '/api/v3/system/status');
      const response = await axios.get(target.toString(), {
        headers: { 'X-Api-Key': apiKey },
        timeout: 2000,
        maxRedirects: 0,
        validateStatus: () => true,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async function checkUpstreams(): Promise<{ radarr: boolean; sonarr: boolean }> {
    if (upstreamHealthCache && Date.now() - upstreamHealthCache.checkedAt < 30_000) {
      return { radarr: upstreamHealthCache.radarr, sonarr: upstreamHealthCache.sonarr };
    }
    if (upstreamHealthPromise) return upstreamHealthPromise;

    upstreamHealthPromise = (async () => {
      try {
        const [radarrConfig, settings] = await Promise.all([
          RadarrService.getRadarrConfig(),
          Settings.findOne().lean(),
        ]);
        const sonarrUrl = settings?.sonarrUrl || process.env.SONARR_URL || 'http://sonarr:8989';
        const sonarrApiKey = settings?.sonarrApiKey || process.env.SONARR_API_KEY || '';
        const [radarr, sonarr] = await Promise.all([
          checkArrService(radarrConfig.url, radarrConfig.apiKey),
          checkArrService(sonarrUrl, sonarrApiKey),
        ]);
        upstreamHealthCache = { checkedAt: Date.now(), radarr, sonarr };
        return { radarr, sonarr };
      } catch {
        upstreamHealthCache = { checkedAt: Date.now(), radarr: false, sonarr: false };
        return { radarr: false, sonarr: false };
      } finally {
        upstreamHealthPromise = null;
      }
    })();

    return upstreamHealthPromise;
  }

  // Health check (também em /api/health — Caddy/monitoração e deploy.sh usam esse path)
  const healthHandler = async (_req: any, res: any) => {
    const database = mongoose.connection.readyState === 1;
    const upstreams = await checkUpstreams();
    const ready = database && upstreams.radarr && upstreams.sonarr;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'degraded',
      dependencies: {
        database: database ? 'ok' : 'unavailable',
        radarr: upstreams.radarr ? 'ok' : 'unavailable',
        sonarr: upstreams.sonarr ? 'ok' : 'unavailable',
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  };
  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // Health de entrega: % de mídias 'available' com arquivo realmente no disco
  // e compatível com o player web (meta: 100%). Usado em smoke test/monitoramento.
  // P6.5: além da presença, reporta compatibilidade de codec (série com .mkv/
  // .avi/.ts no diretório = ainda não 100% playable) e o backlog de conversão.
  app.get('/health/delivery', authenticateToken, requireAdmin, async (_req, res) => {
    try {
      const resolveOnDisk = (rel?: string): boolean => {
        if (!rel) return false;
        for (const root of MEDIA_ROOTS) {
          try { if (fs.existsSync(path.join(root, String(rel)))) return true; } catch { /* continue */ }
        }
        return false;
      };
      // Varredura barata (sem ffprobe): qualquer .mkv/.avi/.ts na árvore da
      // série sinaliza arquivo ainda não convertido para play web.
      const INCOMPAT_EXTS = ['.mkv', '.avi', '.ts'];
      const dirHasIncompatibleExt = (dir: string): boolean => {
        const stack = [dir];
        while (stack.length) {
          const cur = stack.pop()!;
          let entries: string[];
          try { entries = fs.readdirSync(cur); } catch { continue; }
          for (const e of entries) {
            if (e.startsWith('.') || e.includes('.tmp_')) continue;
            const full = path.join(cur, e);
            let st: any;
            try { st = fs.statSync(full); } catch { continue; }
            if (st.isDirectory()) { stack.push(full); continue; }
            if (INCOMPAT_EXTS.includes(path.extname(e).toLowerCase())) return true;
          }
        }
        return false;
      };
      const BAD_CONV = new Set(['pending', 'queued', 'running', 'failed']);
      const [movies, allSeries] = await Promise.all([
        Movie.find({ status: 'available' }, { title: 1, path: 1, conversionStatus: 1 }).lean(),
        Series.find({ status: 'available' }, { title: 1, path: 1, conversionStatus: 1 }).lean(),
      ]);
      const total = movies.length + allSeries.length;
      const missing: Array<{ type: string; title: string; path?: string }> = [];
      const pendingConversion: Array<{ type: string; title: string; reason: string }> = [];
      // Arquivos em fila de conversão (por caminho absoluto) = com certeza não
      // playable ainda. Cobre também .mp4 incompatíveis (ex.: H.264+AC3) que a
      // heurística por extensão não vê.
      const convPaths = MediaPostProcessorService.getQueueStats().paths;
      const inConvQueue = (absPath: string): boolean => convPaths.some((p) => p === absPath);
      for (const m of movies as any[]) {
        if (!resolveOnDisk(m.path)) { missing.push({ type: 'movie', title: m.title, path: m.path }); continue; }
        if (BAD_CONV.has(String(m.conversionStatus || '')) || (m.path && inConvQueue(path.join(MEDIA_ROOTS[0], String(m.path))))) {
          pendingConversion.push({ type: 'movie', title: m.title, reason: `conversão ${m.conversionStatus || 'na fila'}` });
        }
      }
      for (const s of allSeries as any[]) {
        if (!resolveOnDisk(s.path)) { missing.push({ type: 'series', title: s.title, path: s.path }); continue; }
        const seriesRoot = String(s.path || '').split('/')[0];
        let incompatible = false;
        for (const root of MEDIA_ROOTS) {
          const dirCand = path.join(root, seriesRoot);
          try { if (fs.statSync(dirCand).isDirectory()) { incompatible = dirHasIncompatibleExt(dirCand); break; } } catch { /* continue */ }
        }
        // Fila de conversão (por diretório da série) OR extensão incompatível.
        const inQueue = convPaths.some((p) => p.startsWith('/') && p.includes(`/${seriesRoot}/`));
        if (inQueue) pendingConversion.push({ type: 'series', title: s.title, reason: 'episódio(s) na fila de conversão' });
        else if (incompatible) pendingConversion.push({ type: 'series', title: s.title, reason: 'arquivo(s) não convertido(s) (.mkv/.avi/.ts)' });
        else if (BAD_CONV.has(String(s.conversionStatus || ''))) pendingConversion.push({ type: 'series', title: s.title, reason: `conversão ${s.conversionStatus}` });
      }
      const withFile = total - missing.length;
      const percent = total === 0 ? 100 : Math.round((withFile / total) * 100);
      const playable = total - missing.length - pendingConversion.length;
      const playablePercent = total === 0 ? 100 : Math.round((playable / total) * 100);
      const conversionQueue = MediaPostProcessorService.getQueueStats();
      const ok = percent === 100 && playablePercent === 100;
      res.status(ok ? 200 : 503).json({
        status: ok ? 'ok' : 'degraded',
        total, withFile, percent,
        playablePercent, playable,
        pendingConversion,
        conversionQueue,
        missing,
      });
    } catch (err: any) {
      res.status(500).json({ status: 'error', error: err.message });
    }
  });

  // Health check with MongoDB pool status
  app.get('/health/db', authenticateToken, requireAdmin, async (_req, res) => {
    try {
      const conn = mongoose.connection as any;
      const pool = conn.client?.s?.pool;
      res.json({
        status: 'ok',
        readyState: conn.readyState,
        host: conn.host,
        port: conn.port,
        name: conn.name,
        pool: pool ? {
          maxPoolSize: pool.maxPoolSize,
          minPoolSize: pool.minPoolSize,
          available: pool.available,
          pending: pool.pending,
          inUse: pool.inUse,
          total: pool.available + pool.inUse + pool.pending
        } : null,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, timestamp: new Date().toISOString() });
    }
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
  app.get('/api/omdb-image/*', imageProxyRateLimit, async (req, res) => {
    const imagePath = extractSafeImagePath(req.originalUrl, '/api/omdb-image', 'omdb');
    if (!imagePath) return res.status(400).json({ error: 'Caminho de imagem inválido' });

    try {
      const target = `https://m.media-amazon.com/images${imagePath}`;

      const response = await axios.get(target, {
        responseType: 'arraybuffer',
        maxContentLength: MAX_IMAGE_BYTES,
        timeout: 15000,
        maxRedirects: 0,
        validateStatus: () => true,
      }).catch(async (err: any) => {
        if (['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNABORTED'].includes(err.code)) {
          logger.warn('OMDBImage', `Transient error ${err.code}, retrying`);
          return axios.get(target, {
            responseType: 'arraybuffer',
            maxContentLength: MAX_IMAGE_BYTES,
            timeout: 15000,
            maxRedirects: 0,
            validateStatus: () => true,
          });
        }
        throw err;
      });

      if (response.status < 200 || response.status >= 300) {
        return res.status(response.status === 404 ? 404 : 502).json({ error: 'Imagem não encontrada' });
      }

      const bytes = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
      const sent = sendRasterImage(res, bytes);
      if (!sent) return res.status(502).json({ error: 'Resposta de imagem inválida' });
      return sent;
    } catch (error) {
      logger.warn('OMDBImage', 'Proxy de imagem indisponível', {
        errorCode: (error as NodeJS.ErrnoException).code || 'UPSTREAM_ERROR',
      });
      return res.status(502).json({ error: 'Não foi possível carregar a imagem' });
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
  app.use('/api/poster', imageProxyRateLimit, posterRoutes); // Fallback público de capas
  app.use('/api/debug', debugRoutes);      // Manutenção/deduplicação/verify-sync (admin)
  app.use('/api/trending', trendingRoutes); // Tendências de streaming (TMDB)

  app.get('/api/docs.json', authenticateToken, (_req, res) => {
    res.json(swaggerSpec);
  });

  // Swagger UI — documentação interativa da API
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customCssUrl: '',
      explorer: true,
    }));
  } else {
    app.use('/api/docs', (_req, res) => res.status(404).json({ error: 'Documentação indisponível' }));
  }

  async function proxyManagedCover(
    serviceName: 'Radarr' | 'Sonarr',
    routePrefix: string,
    baseUrl: string,
    apiKey: string,
    req: express.Request,
    res: express.Response,
  ): Promise<express.Response> {
    const coverPath = extractSafeImagePath(req.originalUrl, routePrefix, 'media-cover');
    if (!coverPath) return res.status(400).json({ error: 'Caminho de capa inválido' });
    if (!apiKey) return res.status(503).json({ error: `Proxy ${serviceName} indisponível` });

    try {
      const target = buildServiceUrl(baseUrl, coverPath);
      const response = await axios.get(target.toString(), {
        headers: { 'X-Api-Key': apiKey },
        responseType: 'arraybuffer',
        maxContentLength: MAX_IMAGE_BYTES,
        timeout: 15000,
        maxRedirects: 0,
        validateStatus: () => true,
      });

      if (response.status === 404) return res.status(404).send('Not Found');
      if (response.status < 200 || response.status >= 300) {
        logger.warn(`${serviceName}Cover`, 'Serviço de capas retornou status de erro', {
          status: response.status,
          coverPath,
        });
        return res.status(502).json({ error: `Proxy ${serviceName} indisponível` });
      }

      const bytes = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
      const imageType = detectRasterImageType(bytes);
      if (!imageType) return res.status(502).json({ error: 'Resposta de imagem inválida' });

      logger.info(`${serviceName}Cover`, 'Capa carregada', { coverPath, bytes: bytes.length });
      res.set({
        'Content-Type': imageType.contentType,
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.send(bytes);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const timedOut = code === 'ECONNABORTED' || code === 'ETIMEDOUT';
      logger.error(`${serviceName}Cover`, 'Proxy de capa indisponível', {
        errorCode: code || 'UPSTREAM_ERROR',
      });
      return res.status(timedOut ? 504 : 502).json({
        error: timedOut ? 'Tempo limite ao carregar capa' : `Proxy ${serviceName} indisponível`,
      });
    }
  }

  // Proxy de capas do Radarr — serve /MediaCover/ diretamente de http://radarr:7878
  app.get('/api/radarr-cover/*', imageProxyRateLimit, async (req, res) => {
    try {
      const radarrConfig = await RadarrService.getRadarrConfig();
      return await proxyManagedCover(
        'Radarr', '/api/radarr-cover', radarrConfig.url, radarrConfig.apiKey, req, res,
      );
    } catch (error) {
      logger.error('RadarrCover', 'Configuração do proxy indisponível', {
        errorCode: (error as NodeJS.ErrnoException).code || 'CONFIG_ERROR',
      });
      return res.status(503).json({ error: 'Proxy Radarr indisponível' });
    }
  });

  // Proxy de capas do Sonarr — serve /MediaCover/ diretamente de http://sonarr:8989
  app.get('/api/sonarr-cover/*', imageProxyRateLimit, async (req, res) => {
    try {
      const settings = await Settings.findOne().lean();
      const baseUrl = settings?.sonarrUrl || process.env.SONARR_URL || 'http://sonarr:8989';
      const apiKey = settings?.sonarrApiKey || process.env.SONARR_API_KEY || '';
      return await proxyManagedCover('Sonarr', '/api/sonarr-cover', baseUrl, apiKey, req, res);
    } catch (error) {
      logger.error('SonarrCover', 'Configuração do proxy indisponível', {
        errorCode: (error as NodeJS.ErrnoException).code || 'CONFIG_ERROR',
      });
      return res.status(503).json({ error: 'Proxy Sonarr indisponível' });
    }
  });

  // ─── Cached Cover endpoint — serve capas do DB em vez de proxy a cada request ──
  app.get('/api/covers/:mediaType/:mediaId', imageProxyRateLimit, async (req, res) => {
    try {
      const { mediaType, mediaId } = req.params;
      if (mediaType !== 'movie' && mediaType !== 'series') {
        return res.status(400).json({ error: 'mediaType must be "movie" or "series"' });
      }

      const cover = await CoverCacheService.getCachedCover(mediaId, mediaType);
      if (!cover?.poster) {
        return res.status(404).json({ error: 'Cover not cached' });
      }

      const posterUrl = String(cover.poster);

      // External poster URLs are redirected only to the fixed raster-image proxies.
      // This endpoint never fetches a database URL, which prevents SSRF.
      if (posterUrl.startsWith('/api/radarr-cover/') || posterUrl.startsWith('/media-api/radarr-cover/')) {
        const prefix = posterUrl.startsWith('/api/') ? '/api/radarr-cover/' : '/media-api/radarr-cover/';
        const safePath = sanitizeImagePath(posterUrl.slice(prefix.length), 'media-cover');
        if (!safePath) return res.status(404).json({ error: 'Capa inválida' });
        return res.redirect(302, `/media-api/radarr-cover${safePath}`);
      }
      if (posterUrl.startsWith('/api/sonarr-cover/') || posterUrl.startsWith('/media-api/sonarr-cover/')) {
        const prefix = posterUrl.startsWith('/api/') ? '/api/sonarr-cover/' : '/media-api/sonarr-cover/';
        const safePath = sanitizeImagePath(posterUrl.slice(prefix.length), 'media-cover');
        if (!safePath) return res.status(404).json({ error: 'Capa inválida' });
        return res.redirect(302, `/media-api/sonarr-cover${safePath}`);
      }

      let parsed: URL;
      try {
        parsed = new URL(posterUrl);
      } catch {
        return res.status(404).json({ error: 'Capa inválida' });
      }
      if (
        parsed.protocol !== 'https:' ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      ) {
        return res.status(404).json({ error: 'Capa inválida' });
      }

      if (parsed.hostname === 'image.tmdb.org' && parsed.pathname.startsWith('/t/p/')) {
        const safePath = sanitizeImagePath(parsed.pathname.slice('/t/p/'.length), 'tmdb');
        if (safePath) return res.redirect(302, `/media-api/tmdb-image${safePath}`);
      }
      if (parsed.hostname === 'm.media-amazon.com' && parsed.pathname.startsWith('/images/')) {
        const safePath = sanitizeImagePath(parsed.pathname.slice('/images/'.length), 'omdb');
        if (safePath) return res.redirect(302, `/media-api/omdb-image${safePath}`);
      }

      return res.status(404).json({ error: 'Origem de capa não permitida' });
    } catch (error) {
      logger.warn('CoverCache', 'Falha ao servir capa em cache', {
        errorCode: (error as NodeJS.ErrnoException).code || 'CACHE_ERROR',
      });
      return res.status(502).json({ error: 'Não foi possível carregar a capa' });
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
  let lastTorrentCount = -1;
  let lastStuckSignature = '';
  const broadcastInterval = setInterval(async () => {
    try {
      const torrents = await QBittorrentService.getTorrents();

      // Log apenas quando a quantidade de torrents muda (evita spam a cada 3s)
      if (torrents.length !== lastTorrentCount) {
        lastTorrentCount = torrents.length;
        logger.info(COMPONENT, `qBittorrent: ${torrents.length} torrent(s) no cliente`);
      }

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

      // Detectar torrents presos em "queued" sem seeds/peers por muito tempo.
      // Loga apenas quando o CONJUNTO muda (antes logava a cada 3s = spam).
      const queuedTorrents = torrents.filter((t: any) => 
        ['queuedDL', 'queued', 'stalledDL'].includes(t.state) && 
        (t.seeds || 0) === 0 && 
        (t.peers || 0) === 0
      );
      const stuckSignature = queuedTorrents.map((t: any) => t.hash).sort().join(',');
      if (queuedTorrents.length > 0 && stuckSignature !== lastStuckSignature) {
        lastStuckSignature = stuckSignature;
        logger.warn(COMPONENT, `Torrents stuck in queued without seeds/peers`, {
          stuck: queuedTorrents.map((t: any) => ({ name: t.name, state: t.state, seeds: t.seeds, peers: t.peers, eta: t.eta }))
        });
      } else if (queuedTorrents.length === 0) {
        lastStuckSignature = '';
      }

      // ── Teste do Pedacinho: validar torrents parcialmente baixados ──────
      // Quando um torrent atinge ~20MB, pausa, roda ffprobe e decide se continua.
      for (const t of torrents) {
        if (!t.hash) continue;
        if (TorrentValidationService.needsValidation(t.downloaded || 0, t.size || 0, t.state)) {
          // Verificar se já foi validado neste ciclo
          if (!validatedTorrents.has(t.hash)) {
            validatedTorrents.add(t.hash);
            const dl = await Download.findOne({ hash: t.hash });
            if (dl) {
              const savePath = t.name ? `/media/${dl.mediaType === 'series' ? 'series' : 'movies'}` : '/downloads';
              TorrentValidationService.validatePartialDownload(t.hash, savePath, t.name || 'unknown')
                .then(async (result) => {
                  if (!result.valid) {
                    logger.error(COMPONENT, `[TESTE PEDACINHO] Torrent corrompido detectado: "${t.name}" — ${result.reason}`);

                    // Tentar próximo candidato da ranked list
                    const nextCandidate = ApacheTorrentService.getNextCandidateForRetry(t.hash);
                    if (nextCandidate) {
                      logger.info(COMPONENT, `[TESTE PEDACINHO] Tentando próximo candidato: "${nextCandidate.name}" (hash: ${nextCandidate.hash})`);
                      // Retomar o próximo candidato (já está pausado no qBittorrent)
                      await QBittorrentService.resumeTorrent(nextCandidate.hash);
                      // Atualizar o hash do download
                      dl.hash = nextCandidate.hash;
                      dl.status = 'downloading';
                      await dl.save().catch(() => {});
                      downloadEvents.push({
                        _id: dl._id.toString(),
                        status: 'downloading',
                        torrentState: 'downloading',
                        torrentStateLabel: `Retry: ${nextCandidate.name}`,
                      });
                    } else {
                      // Não há mais candidatos → marcar como erro
                      logger.error(COMPONENT, `[TESTE PEDACINHO] Sem mais candidatos para retry: "${t.name}"`);
                      dl.status = 'error';
                      await dl.save().catch(() => {});
                      if (dl.mediaType === 'movie') {
                        await Movie.findByIdAndUpdate(dl.mediaId, { status: 'error' });
                      } else {
                        await Series.findByIdAndUpdate(dl.mediaId, { status: 'error' });
                      }
                      invalidateRecommendationsCache();
                      downloadEvents.push({
                        _id: dl._id.toString(),
                        status: 'error',
                        torrentState: 'error',
                        torrentStateLabel: 'Todos os torrents corrompidos (ffprobe falhou)',
                      });
                    }
                  }
                })
                .catch((err) => {
                  logger.warn(COMPONENT, `[TESTE PEDACINHO] Erro na validação: ${err.message}`);
                });
            }
          }
        }
        // Limpar do tracking quando o download sair da faixa de validação
        if (t.downloaded > 500 * 1024 * 1024) {
          validatedTorrents.delete(t.hash);
        }
      }

      // Atualiza status de Movie/Series quando download é concluído
      const completedStates = ['uploading', 'stalledUP', 'pausedUP'];
      for (const t of torrents) {
        if (t.progress >= 100 || completedStates.includes(t.state)) {
          try {
            // Match por hash (case-insensitive) e fallback por título/originalTitle.
            // O fallback cobre Download sem hash OU com hash obsoleto — caso real:
            // release EN "Inception..." x Download PT "A Origem".
            const completedDl = await findDownloadForTorrent(t);
            if (completedDl && t.hash && String(completedDl.hash || '').toLowerCase() !== String(t.hash).toLowerCase()) {
              completedDl.hash = t.hash;
              await completedDl.save().catch(() => {});
            }
            if (completedDl) {
              // ── DEFESA ANTI-MALWARE ──────────────────────────────────
              // Escaneia os arquivos do torrent procurando executáveis.
              // Bloqueia ANTES de marcar mídia como available. Caso real:
              // "Reacher/Ted Lasso .exe" (ago/2026) — mesmo payload 962MB.
              // Cache por hash: o scan só precisa rodar uma vez por torrent.
              try {
                if (!(t.hash && malwareScannedTorrents.has(t.hash))) {
                  const tFiles: Array<{ name: string }> = t.hash
                    ? await QBittorrentService.getTorrentFiles(t.hash).catch(() => [])
                    : [];
                  if (t.hash && tFiles.length > 0) malwareScannedTorrents.add(t.hash);
                  const nameCandidates = tFiles.length > 0 ? tFiles.map(f => f.name) : [t.name];
                  const badFile = nameCandidates
                    .map(n => isMaliciousFileName(n))
                    .find(r => r.malicious);
                  if (badFile) {
                    logger.error(COMPONENT, `[ANTI-MALWARE] Executável detectado (${badFile.reason}) em "${t.name}" — removendo torrent+dados`);
                    if (t.hash) await QBittorrentService.deleteTorrent(t.hash, true).catch(() => {});
                    completedDl.status = 'error';
                    // Erro definitivo: re-baixar o MESMO release sempre reencontra o
                    // executável — não deixa o auto-retry re-adicionar em loop.
                    completedDl.terminalError = true;
                    await completedDl.save();
                    if (completedDl.mediaType === 'movie') {
                      await Movie.findByIdAndUpdate(completedDl.mediaId, { status: 'error' });
                    } else {
                      await Series.findByIdAndUpdate(completedDl.mediaId, { status: 'error' });
                    }
                    invalidateRecommendationsCache();
                    continue;
                  }
                }
              } catch (scanErr: any) {
                logger.warn(COMPONENT, `[ANTI-MALWARE] Scan falhou para "${t.name}": ${scanErr.message}`);
              }
              // ── LIMPEZA DE LIXO/PROPAGANDA ────────────────────────────
              // Releases BR embrulham .url (ex: "BAIXAR FILMES E SERIES
              // EXCLUSIVOS.url" → comando1.com), .txt, .nfo, .png etc.
              // Esses arquivos NUNCA são mídia: desmarca no qBittorrent
              // (não baixa) e remove do disco o que já foi baixado.
              if (t.hash && !junkCleanedTorrents.has(t.hash)) {
                try {
                  const qbFiles = await QBittorrentService.getTorrentFiles(t.hash).catch(() => []);
                  const junkFiles = (qbFiles as Array<{ name: string }>).filter(f => isJunkFileName(f.name));
                  if (junkFiles.length > 0) {
                    await QBittorrentService.excludeJunkFiles(t.hash).catch(() => {});
                    for (const jf of junkFiles) {
                      for (const root of MEDIA_ROOTS) {
                        const junkPath = path.join(root, String(jf.name));
                        try {
                          if (fs.existsSync(junkPath)) {
                            fs.unlinkSync(junkPath);
                            logger.info(COMPONENT, `[JUNK] Arquivo de propaganda removido: ${junkPath}`);
                          }
                        } catch { /* continue */ }
                      }
                    }
                  }
                  junkCleanedTorrents.add(t.hash);
                } catch { /* continue */ }
              }
              // Se o download já está complete mas o movie/series ainda não, atualiza
              if (completedDl.status === 'complete' && t.progress >= 100) {
                // ── FIX (ressurreição de conteúdo deletado / "Rick and Morty") ──
                // REGRA: Mongo é a fonte da verdade. Se o Movie/Series NÃO existe
                // mais (delete em cascata), o Download correspondente é um fantasma
                // — NUNCA recriar o registro a partir dele (antes isso ressuscitava
                // conteúdo que o dono deletou). Remove o download fantasma e segue.
                let mediaExists: any = completedDl.mediaType === 'movie'
                  ? await Movie.findById(completedDl.mediaId)
                  : await Series.findById(completedDl.mediaId);
                if (!mediaExists) {
                  logger.warn(COMPONENT, `[GHOST] Download complete sem mídia no banco (deletada?) — removendo download fantasma: "${completedDl.title}" (${completedDl.mediaType})`);
                  await Download.findByIdAndDelete(completedDl._id).catch(() => {});
                  continue;
                }
                if (completedDl.mediaType === 'movie') {
                  await Movie.findByIdAndUpdate(completedDl.mediaId, { status: 'available' });
                } else {
                  await Series.findByIdAndUpdate(completedDl.mediaId, { status: 'available' });
                }
                // Só re-varre o disco se o path ainda não aponta um arquivo
                // existente — antes rodava updateMediaPath a cada 3s (spam de I/O).
                const currentPath = mediaExists?.path;
                let pathOk = false;
                if (currentPath) {
                  for (const root of MEDIA_ROOTS) {
                    try { if (fs.existsSync(path.join(root, String(currentPath)))) { pathOk = true; break; } } catch { /* continue */ }
                  }
                }
                if (!pathOk) {
                  if (completedDl.mediaType === 'movie') {
                    await updateMediaPath(completedDl.mediaId, 'movie', completedDl.title, mediaExists?.year, [mediaExists?.originalTitle]);
                  } else {
                    await updateMediaPath(completedDl.mediaId, 'series', completedDl.title, mediaExists?.year, [mediaExists?.canonicalTitle, mediaExists?.originalTitle]);
                  }
                }
                // Limpa releases PERDEDORAS do mesmo filme (outras cópias baixadas
                // para avaliação que ficaram completo/pausadas ocupando disco).
                // Só para FILMES — episódios de série são downloads legítimos.
                if (completedDl.mediaType === 'movie' && t.hash && !losersCleanedMedia.has(completedDl.mediaId)) {
                  losersCleanedMedia.add(completedDl.mediaId);
                  const mediaTitles = [completedDl.title, mediaExists?.originalTitle].filter((x): x is string => !!x);
                  for (const other of torrents) {
                    if (!other.hash || String(other.hash).toLowerCase() === String(t.hash).toLowerCase()) continue;
                    if (!mediaTitles.some((ti) => findTorrentByTitle([other], ti))) continue;
                    const ym = String(other.name || '').match(/\b(19\d{2}|20\d{2})\b/);
                    if (ym && mediaExists?.year && Number(ym[1]) !== Number(mediaExists.year)) continue;
                    logger.info(COMPONENT, `[LIMPEZA] Removendo release extra do mesmo filme: "${String(other.name || other.hash).slice(0, 60)}"`);
                    await QBittorrentService.deleteTorrent(other.hash, true).catch(() => {});
                  }
                }
                invalidateRecommendationsCache();
                // Post-processing: trigger conversion check only if not already done/running/queued
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
                      // Skip if already converted or in queue.
                      // 1) Fila em memória (ConversionQueueService) — MÁXIMA prioridade;
                      // 2) conversionStatus persistido no Movie/Series — SEM isso o skip
                      //    ignorava o "done" gravado pelo MediaPostProcessor e re-agendava
                      //    o pós-download a cada ciclo do broadcast (loop infinito de probe).
                      // 'failed' também é terminal: sem isso o broadcast re-agendava
                      // a conversão a cada ciclo (loop de re-encode); o catch-up
                      // periódico ainda dá até 3 tentativas controladas.
                      if (media.conversionStatus === 'done' || media.conversionStatus === 'failed') return;
                      const convStatus = ConversionQueueService.getStatus(mediaId);
                      if (convStatus.conversionStatus === 'done' || convStatus.conversionStatus === 'running' || convStatus.conversionStatus === 'queued') {
                        return; // Already processed or in progress
                      }
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
                        const altTitles = [title, media?.originalTitle, media?.canonicalTitle]
                          .filter((x): x is string => !!x);
                        for (const root of MEDIA_ROOTS) {
                          for (const ti of altTitles) {
                            fullPath = findVideoFileByTitle(root, ti, media?.year);
                            if (fullPath) break;
                          }
                          if (fullPath) break;
                        }
                      }
                      if (fullPath) {
                        // Conversão pós-download é para FILME (arquivo único).
                        // SÉRIE tem path = pasta raiz: o fallback findVideoFileByTitle
                        // pegava um arquivo arbitrário (ex.: stub parcial de episódio)
                        // e enfileirava a cada ciclo do broadcast. Séries são cobertas
                        // pelo catch-up periódico (processDirectoryIncompatibleOnly).
                        if (mediaType === 'movie') {
                          await MediaPostProcessorService.process(fullPath, mediaId, mediaType);
                        }
                      }
                    } catch (err: any) {
                      logger.warn(COMPONENT, `Post-download conversion failed for ${title}: ${err.message}`);
                    }
                  })();
                }, 8000);
                continue;
              }
              // Gate anti-spam por tamanho (regra §4).
              // FIX (The Middle): a regra vale para FILMES — episódios individuais
              // de série legítimos têm 70-350MB (HDTV SD) e eram deletados como
              // "propaganda" ao completar, abrindo buracos na temporada.
              if (completedDl.mediaType === 'movie' && t.size && t.size < MIN_SPAM_SIZE_BYTES) {
                logger.warn(COMPONENT, `Filme muito pequeno (${Math.round(t.size / 1024 / 1024)}MB < ${(MIN_SPAM_SIZE_BYTES / 1024 / 1024)}MB) — provável propaganda/spam, removendo: ${t.name}`);
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
                await updateMediaPath(completedDl.mediaId, 'movie', completedDl.title, movie?.year, [movie?.originalTitle]);
              } else {
                await Series.findByIdAndUpdate(completedDl.mediaId, { status: 'available' });
                const series = await Series.findById(completedDl.mediaId);
                await updateMediaPath(completedDl.mediaId, 'series', completedDl.title, series?.year, [series?.canonicalTitle, series?.originalTitle]);
                AutoPipelineService.onDownloadComplete(
                  completedDl.mediaId,
                  completedDl.mediaType,
                  completedDl.title
                ).catch((err) => {
                  logger.warn(COMPONENT, `Post-download pipeline failed: ${err.message}`);
                });
              }
              logger.info(COMPONENT, `Download completed: ${t.name} (hash: ${t.hash})`);
              // Post-processing já é feito pelo primeiro setTimeout acima (P6 ZERO DELAY)

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

  /**
   * Encontra o Download correspondente a um torrent do qBittorrent.
   * 1) hash exato (case-insensitive); 2) fallback por título do Download e
   * originalTitle/canonicalTitle da mídia (cobre release EN x título PT e
   * hash obsoleto/ausente). Candidatos são poucos (coleção pequena).
   */
  async function findDownloadForTorrent(t: any): Promise<any | null> {
    if (t?.hash) {
      const safeHash = String(t.hash).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const byHash = await Download.findOne({ hash: { $regex: new RegExp(`^${safeHash}$`, 'i') } });
      if (byHash) return byHash;
    }
    const candidates = await Download.find({});
    for (const dl of candidates) {
      const titles: string[] = [dl.title];
      let media: any = null;
      try {
        media = dl.mediaType === 'movie'
          ? await Movie.findById(dl.mediaId)
          : await Series.findById(dl.mediaId);
        for (const alt of [media?.originalTitle, media?.canonicalTitle]) {
          if (alt && !titles.includes(alt)) titles.push(alt);
        }
      } catch { /* ignore */ }
      // Salvaguardas contra falso-positivo: filme nunca casa torrent de
      // temporada; ano do torrent (quando presente) tem que bater com o da mídia.
      const tName = String(t.name || '');
      if (dl.mediaType === 'movie' && extractSeasonNumber(normalizeTitleForMatch(tName)) !== null) continue;
      const torrentYear = tName.match(/\b(19\d{2}|20\d{2})\b/);
      if (media?.year && torrentYear && Number(torrentYear[1]) !== Number(media.year)) continue;
      if (titles.some((ti) => findTorrentByTitle([t], ti))) return dl;
    }
    return null;
  }

  // ── Auto-retry: downloads que falharam são re-ativados automaticamente ────
  // Roda a cada 5 min. Se o arquivo não existe no disco → hard reset + re-pipeline.
  // Se o arquivo EXISTE → post-processa (foi baixado mas algo deu errado).
  const retryInFlight = new Set<string>(); // evita retry duplicado no mesmo ciclo

  async function autoRetryErrorDownloads() {
    const errorDownloads = await Download.find({ status: { $in: ['error', 'failed'] }, terminalError: { $ne: true } });
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

      // Verificar se o arquivo existe em disco — e se é um VÍDEO VÁLIDO.
      // Regra de Ouro: arquivo corrompido/fake (ex: CAMRip 4GB com header inválido)
      // NUNCA pode ser marcado complete — o player quebraria no play.
      const p = (mediaDoc as any).path;
      let fileOnDisk = false;
      if (p) {
        for (const root of MEDIA_ROOTS) {
          const full = path.join(root, String(p));
          try {
            if (fs.existsSync(full) && fs.statSync(full).isFile()) {
              const { isValidVideoFile, deleteInvalidFile } = await import('./utils/videoValidation');
              if (await isValidVideoFile(full)) {
                fileOnDisk = true;
              } else {
                logger.warn(COMPONENT, `Auto-retry: "${dl.title}" arquivo inválido/corrompido em ${full} — removendo e re-pipelando`);
                deleteInvalidFile(full, COMPONENT, (c, m) => logger.warn(c, m));
                await Movie.findByIdAndUpdate(dl.mediaId, { status: 'pending', $unset: { path: '' }, lastRetryAt: null });
                await dl.updateOne({ status: 'pending' });
              }
              break;
            }
          } catch { /* continue */ }
        }
      }

      if (fileOnDisk) {
        // Arquivo existe e É VÍDEO VÁLIDO → atualizar status para complete
        logger.info(COMPONENT, `Auto-retry: "${dl.title}" arquivo válido em disco (${p}) → marking complete`);
        try {
          dl.status = 'complete';
          await dl.save();
          if (dl.mediaType === 'movie') {
            await Movie.findByIdAndUpdate(dl.mediaId, { status: 'available', path: p });
          } else {
            await Series.findByIdAndUpdate(dl.mediaId, { status: 'available', path: p });
          }
          invalidateRecommendationsCache();
        } catch (err: any) {
          logger.warn(COMPONENT, `Auto-retry post-process failed: ${err.message}`);
        }
        continue;
      }

      // Arquivo NÃO existe → re-pipeline com BACKOFF exponencial.
      // Antes o backoff era calculado e nunca usado → re-download a cada 5min.
      const prevRetries = ((mediaDoc as any).retryCount || 0);
      const backoffMs = Math.min(5 * 60 * 1000 * Math.pow(2, prevRetries), 60 * 60 * 1000); // 5→10→20→40→60min
      const lastAttemptMs = (mediaDoc as any).lastRetryAt ? new Date((mediaDoc as any).lastRetryAt).getTime() : 0;
      if (lastAttemptMs && Date.now() - lastAttemptMs < backoffMs) {
        continue; // backoff ainda vigente — evita loop de re-download a cada ciclo
      }
      retryInFlight.add(dl._id.toString());
      const retryCount = prevRetries + 1;

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
          await Series.findByIdAndUpdate(mediaDoc._id, { retryCount, lastRetryAt: new Date() }).catch(() => {});
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

    const toDelete: typeof items = [];

    for (const item of items) {
      const p = (item.doc as any).path;
      // Verificar se o arquivo existe em algum root
      const fileExists = p ? MEDIA_ROOTS.some(root => {
        const full = path.join(root, p);
        try { return fs.existsSync(full); } catch { return false; }
      }) : false;
      if (!fileExists) {
        // ANTES de deletar (permanente): procura no disco por título/originalTitle.
        // Sem isso, uma mídia em erro cujo path ficou null (ex.: download em
        // andamento marcado como erro) era apagada mesmo com arquivos no disco.
        try {
          const doc: any = item.doc;
          let recovered: string | null = null;
          if (item.type === 'movie') {
            recovered = await MediaScannerService.findExistingMovieOnDisk(doc.originalTitle || doc.title, doc.year)
              || (doc.originalTitle ? await MediaScannerService.findExistingMovieOnDisk(doc.title, doc.year) : null);
            if (recovered) await Movie.findByIdAndUpdate(doc._id, { path: recovered, status: 'pending' }).catch(() => {});
          } else {
            for (const t of [doc.canonicalTitle, doc.originalTitle, doc.title]) {
              if (!t) continue;
              recovered = await MediaScannerService.findExistingSeriesOnDisk(t);
              if (recovered) break;
            }
            if (recovered) await Series.findByIdAndUpdate(doc._id, { path: recovered, status: 'pending' }).catch(() => {});
          }
          if (recovered) {
            logger.warn(COMPONENT, `Cascade skip: "${doc.title}" encontrado no disco (${recovered}) — mantido e devolvido para pending`);
            continue;
          }
        } catch { /* segue para delete */ }
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

  // ── Higiene de torrents e downloads fantasmas (auto-cura) ───────────────────
  // Roda no startup e a cada 5 min. Resolve sozinho os casos que antes exigiam
  // intervenção manual:
  //  1. Magnets presos em metaDL/forcedMetaDL (0 seeds, 0 bytes, >15min) → apaga
  //     e devolve a mídia para 'pending' (PendingRetry/reconcile re-buscam fonte).
  //  2. Torrents em missingFiles/error (arquivos sumiram do disco) → apaga do
  //     qBit e reconcilia a mídia: arquivo no disco → mantém available; senão → pending.
  //  3. Downloads ativos (downloading/queued) cujo torrent sumiu do qBit há
  //     >8min → fantasma ("diz que baixa e não baixa"): arquivo no disco →
  //     complete; senão → pending para re-busca.
  const META_STALL_MS = 15 * 60 * 1000;
  const GHOST_DOWNLOAD_MS = 8 * 60 * 1000;

  async function torrentAndDownloadHygiene() {
    try {
      const torrents = await QBittorrentService.getTorrents().catch(() => []);
      if (torrents.length === 0) return;
      const torrentByHash = new Map(torrents.map((t: any) => [String(t.hash || '').toLowerCase(), t]));
      const now = Date.now();

      // 1. Magnets presos em metaDL (nunca resolveram metadata)
      for (const t of torrents) {
        if (!t.hash) continue;
        // Fontes raras marcadas como "keep" aguardam peers — mas não para
        // sempre: após 24h sem nenhum progresso, libera a limpeza.
        if (String((t as any).tags || '').split(',').map((x: string) => x.trim()).includes('keep')) {
          const ageSecK = t.addedOn ? (Date.now() / 1000 - t.addedOn) : 0;
          if (ageSecK < 24 * 3600) continue;
        }
        const isMetaStuck = ['metaDL', 'forcedMetaDL'].includes(t.state) &&
          (t.seeds || 0) === 0 && (t.speed || 0) === 0 && (t.progress || 0) === 0;
        if (!isMetaStuck) continue;
        const age = t.addedOn ? now - t.addedOn * 1000 : now;
        if (age < META_STALL_MS) continue;
        logger.warn(COMPONENT, `[HIGIENE] Magnet preso em ${t.state} há ${Math.round(age / 60000)}min — removendo e devolvendo para re-busca: ${(t.name || t.hash).substring(0, 60)}`);
        await QBittorrentService.deleteTorrent(t.hash, true).catch(() => {});
        // Fonte comprovadamente morta (metadata nunca resolveu = sem peers):
        // entra na blacklist por 48h — o ranking deixaria o pipeline
        // re-adicionar este MESMO cadáver a cada ciclo (loop infinito).
        await FailedSourceStore.recordFailure(t.hash, String(t.name || ''), 'metaDL-stuck');
        const dl = await Download.findOne({ hash: t.hash });
        if (dl) {
          const mediaDoc = dl.mediaType === 'movie'
            ? await Movie.findById(dl.mediaId)
            : await Series.findById(dl.mediaId);
          // Série já 'available' (parcial): o gap-retry a cada 10min re-busca os
          // episódios faltantes — NÃO rebaixa a série inteira para 'pending'.
          if (dl.mediaType === 'series' && mediaDoc?.status === 'available') {
            await Download.deleteOne({ _id: dl._id }).catch(() => {});
          } else {
            dl.status = 'pending';
            dl.stalledSince = undefined;
            // Hash do torrent morto NÃO pode ficar no Download: sem limpá-lo, o
            // sync exigiria esse hash para sempre e o registro nunca reconcilia.
            dl.hash = undefined as any;
            await dl.save().catch(() => {});
            await Download.updateOne({ _id: dl._id }, { $unset: { hash: '', stalledSince: '' } }).catch(() => {});
            if (dl.mediaType === 'movie') await Movie.findByIdAndUpdate(dl.mediaId, { status: 'pending' }).catch(() => {});
            else await Series.findByIdAndUpdate(dl.mediaId, { status: 'pending' }).catch(() => {});
            invalidateRecommendationsCache();
          }
        }
      }

      // 1b. Torrents em stalledDL/queuedDL com 0 seeds, quase nada baixado e
      //     mais de 24h: a fonte morreu de vez. Antes só valia para "keep";
      //     não-keep ficavam eternamente na UI (ex.: S05E22 DIMENSION 3.5d
      //     "Aguardando fontes"). 24h sem nenhum peer = cadáver, keep ou não.
      for (const t of torrents) {
        if (!t.hash) continue;
        if (!['stalledDL', 'queuedDL', 'forcedDL', 'pausedDL'].includes(t.state)) continue;
        if ((t.seeds || 0) > 0 || (t.speed || 0) > 0 || (t.progress || 0) >= 5) continue;
        const age = t.addedOn ? now - t.addedOn * 1000 : now;
        if (age < 24 * 3600 * 1000) continue;
        logger.warn(COMPONENT, `[HIGIENE] Fonte morta há ${Math.round(age / 3600000)}h (${t.state}, 0 seeds, ${(t.progress || 0).toFixed(1)}%) — removendo e liberando o episódio: ${(t.name || t.hash).substring(0, 60)}`);
        // Só existe parcial inútil (<5%): apagar com arquivos é seguro.
        await QBittorrentService.deleteTorrent(t.hash, true).catch(() => {});
        await FailedSourceStore.recordFailure(t.hash, String(t.name || ''), 'keep-dead');
        const dl = await Download.findOne({ hash: t.hash });
        if (dl) {
          const mediaDoc = dl.mediaType === 'movie'
            ? await Movie.findById(dl.mediaId)
            : await Series.findById(dl.mediaId);
          if (dl.mediaType === 'series' && mediaDoc?.status === 'available') {
            await Download.deleteOne({ _id: dl._id }).catch(() => {});
          } else {
            dl.status = 'pending';
            dl.stalledSince = undefined;
            dl.hash = undefined as any;
            await dl.save().catch(() => {});
            await Download.updateOne({ _id: dl._id }, { $unset: { hash: '', stalledSince: '' } }).catch(() => {});
            if (dl.mediaType === 'movie') await Movie.findByIdAndUpdate(dl.mediaId, { status: 'pending' }).catch(() => {});
            else await Series.findByIdAndUpdate(dl.mediaId, { status: 'pending' }).catch(() => {});
          }
          invalidateRecommendationsCache();
        }
      }

      // 2. Torrents em missingFiles/error (conteúdo já não existe)
      for (const t of torrents) {
        if (!t.hash) continue;
        if (!['missingFiles', 'error'].includes(t.state)) continue;
        // Fonte rara marcada como "keep": só preserva enquanto AINDA pode
        // servir — torrent novo (<24h) e mídia com gaps. missingFiles de
        // mídia JÁ disponível (ou >24h) é cadáver: removendo. Sem isso a UI
        // ficava com cards de erro eternos ("Arquivos faltando" de TLOU,
        // Divertida Mente 2, S04/S05 DIMENSION, i_c packs).
        const isKeep = String((t as any).tags || '').split(',').map((x: string) => x.trim()).includes('keep');
        const ageMs = t.addedOn ? now - t.addedOn * 1000 : 0;
        const dlForKeep = await Download.findOne({ hash: t.hash });
        let mediaAvailable = false;
        if (dlForKeep) {
          const mdKeep = dlForKeep.mediaType === 'movie'
            ? await Movie.findById(dlForKeep.mediaId)
            : await Series.findById(dlForKeep.mediaId);
          mediaAvailable = (mdKeep as any)?.status === 'available';
        }
        if (isKeep && ageMs < 24 * 3600 * 1000 && !mediaAvailable) continue;
        const dl = dlForKeep;
        let onDisk = false;
        let mediaDoc: any = null;
        if (dl) {
          mediaDoc = dl.mediaType === 'movie'
            ? await Movie.findById(dl.mediaId)
            : await Series.findById(dl.mediaId);
          const p = (mediaDoc as any)?.path;
          if (p) {
            for (const root of MEDIA_ROOTS) {
              try { if (fs.existsSync(path.join(root, String(p)))) { onDisk = true; break; } } catch { /* continue */ }
            }
          }
        }
        logger.warn(COMPONENT, `[HIGIENE] Torrent sem arquivos (${t.state}) — removendo registro${onDisk ? ' (mantendo arquivos no disco)' : ''}: ${(t.name || t.hash).substring(0, 60)}`);
        // NUNCA apagar arquivos se a mídia já existe no disco: rename/organize
        // pode ter movido o payload e deleteFiles=true destruía o conteúdo.
        await QBittorrentService.deleteTorrent(t.hash, !onDisk).catch(() => {});
        // Fonte que NUNCA entregou nada (missingFiles sem conteúdo no disco):
        // blacklist 48h — sem isso o pipeline re-adiciona o mesmo cadáver a
        // cada ciclo. onDisk = pack consumido com sucesso pelo organizer:
        // NÃO blacklistar (a fonte é boa, só foi movida/renameada).
        if (!onDisk) {
          await FailedSourceStore.recordFailure(t.hash, String(t.name || ''), 'missing-files');
        }
        if (dl) {
          if (onDisk) {
            dl.status = 'complete';
            dl.progress = 100;
          } else if (dl.mediaType === 'series' && mediaDoc?.status === 'available') {
            // Série parcial 'available': gap-retry re-busca os faltantes
            await Download.deleteOne({ _id: dl._id }).catch(() => {});
          } else {
            dl.status = 'pending';
            dl.stalledSince = undefined;
            dl.hash = undefined as any;
            if (dl.mediaType === 'movie') await Movie.findByIdAndUpdate(dl.mediaId, { status: 'pending' }).catch(() => {});
            else await Series.findByIdAndUpdate(dl.mediaId, { status: 'pending' }).catch(() => {});
          }
          await dl.save().catch(() => {});
          if (dl.status === 'pending') {
            await Download.updateOne({ _id: dl._id }, { $unset: { hash: '', stalledSince: '' } }).catch(() => {});
          }
          invalidateRecommendationsCache();
        }
      }

      // 3. Downloads ativos cujo torrent sumiu do qBittorrent
      const ghostCandidates = await Download.find({ status: { $in: ['downloading', 'queued'] } });
      for (const dl of ghostCandidates) {
        if (dl.hash && torrentByHash.has(String(dl.hash).toLowerCase())) continue;
        if (!dl.hash) {
          const matched = torrents.some((t: any) => findTorrentByTitle([t], dl.title));
          if (matched) continue;
        }
        const mediaDoc = dl.mediaType === 'movie'
          ? await Movie.findById(dl.mediaId)
          : await Series.findById(dl.mediaId);
        if (!mediaDoc) {
          await Download.findByIdAndDelete(dl._id).catch(() => {});
          continue;
        }
        // Relógio do fantasma: primeira rodada marca; depois de GHOST_DOWNLOAD_MS vira pendência
        if (!dl.stalledSince) {
          dl.stalledSince = new Date();
          await dl.save().catch(() => {});
          continue;
        }
        if (now - new Date(dl.stalledSince).getTime() < GHOST_DOWNLOAD_MS) continue;

        const p = (mediaDoc as any).path;
        let onDisk = false;
        if (p) {
          for (const root of MEDIA_ROOTS) {
            try { if (fs.existsSync(path.join(root, String(p)))) { onDisk = true; break; } } catch { /* continue */ }
          }
        }
        if (onDisk) {
          logger.info(COMPONENT, `[HIGIENE] Download ativo sem torrent mas arquivo no disco — marcando complete: "${dl.title}"`);
          dl.status = 'complete';
          dl.progress = 100;
          dl.stalledSince = undefined;
          await dl.save().catch(() => {});
          if (dl.mediaType === 'movie') await Movie.findByIdAndUpdate(dl.mediaId, { status: 'available' }).catch(() => {});
          else await Series.findByIdAndUpdate(dl.mediaId, { status: 'available' }).catch(() => {});
          invalidateRecommendationsCache();
          // P4.2: para SÉRIES, limpar também os downloads companheiros da mesma
          // série que ficaram presos em 'queued/downloading' sem torrent (a
          // temporada complete já cobre o que eles prometiam) — senão a UI mostra
          // "baixando" eterno para temporada que já está no disco.
          if (dl.mediaType === 'series') {
            const siblings = await Download.find({
              mediaId: dl.mediaId,
              mediaType: 'series',
              _id: { $ne: dl._id },
              status: { $in: ['queued', 'downloading'] },
            });
            for (const sib of siblings) {
              if (sib.hash && torrentByHash.has(String(sib.hash).toLowerCase())) continue;
              sib.status = 'complete';
              sib.progress = 100;
              sib.stalledSince = undefined;
              await sib.save().catch(() => {});
              logger.info(COMPONENT, `[HIGIENE] Download companheiro da série marcado complete (arquivo já no disco): "${sib.title}"`);
            }
          }
        } else {
          // Devolver para pending APENAS na transição real (queued/downloading →
          // pending). Re-salvar um registro que JÁ é pending renovaria o updatedAt
          // a cada ciclo de 5min e mataria o backoff do PendingRetry — os filmes
          // nunca seriam re-tentados (starvation: Spider-Man/Tom & Jerry nem começavam).
          if (dl.status !== 'pending') {
            logger.warn(COMPONENT, `[HIGIENE] Download fantasma ("${dl.title}" sem torrent e sem arquivo) — devolvendo para pending`);
            dl.status = 'pending';
            dl.stalledSince = undefined;
            dl.hash = undefined as any;
            await dl.save().catch(() => {});
            await Download.updateOne({ _id: dl._id }, { $unset: { hash: '', stalledSince: '' } }).catch(() => {});
          }
          if (dl.mediaType === 'movie') {
            await Movie.updateOne({ _id: dl.mediaId, status: { $ne: 'pending' } }, { status: 'pending' }).catch(() => {});
          } else {
            await Series.updateOne({ _id: dl.mediaId, status: { $ne: 'pending' } }, { status: 'pending' }).catch(() => {});
          }
          invalidateRecommendationsCache();
        }
      }

      // 4. Downloads pending órfãos (mídia deletada) — fantasma que ficaria na UI
      //    para sempre (ex.: série Reacher deletada em cascata, Download ficou).
      const pendingGhosts = await Download.find({ status: 'pending' });
      for (const dl of pendingGhosts) {
        const media: any = dl.mediaType === 'movie'
          ? await Movie.findById(dl.mediaId).select('_id')
          : await Series.findById(dl.mediaId).select('_id');
        if (!media) {
          logger.warn(COMPONENT, `[HIGIENE] Download pendente sem mídia (fantasma) — removendo: "${dl.title}" (${dl.mediaType})`);
          await Download.findByIdAndDelete(dl._id).catch(() => {});
        } else if (dl.stalledSince) {
          // Estado zumbi: pending não tem relógio de stall — limpa resíduo.
          await Download.updateOne({ _id: dl._id }, { $unset: { stalledSince: '' } }).catch(() => {});
        }
      }

      // 5. Torrents órfãos completos e antigos (>7d) sem Download e sem mídia
      //    correspondente — losers de avaliação e releases abandonados que ficam
      //    seedando/ocupando disco para sempre (caso real: 3 CAMRips Spider-Man).
      //    Segurança: só remove quando NINGUÉM no banco reivindica o torrent.
      const orphanCutoffSec = (Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000;
      const allMovies = await Movie.find({}, { title: 1, originalTitle: 1 }).lean();
      const allSeries = await Series.find({}, { title: 1, canonicalTitle: 1, originalTitle: 1 }).lean();
      for (const t of torrents) {
        if (!t.hash) continue;
        const isComplete = (t.progress || 0) >= 100 ||
          ['uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP'].includes(t.state);
        if (!isComplete || (t.addedOn || 0) > orphanCutoffSec) continue;
        const dlMatch = await findDownloadForTorrent(t).catch(() => null);
        if (dlMatch) continue;
        const mediaMatch = [...allMovies, ...allSeries].some((m: any) =>
          findTorrentByTitle([t], m.title) ||
          (m.originalTitle && findTorrentByTitle([t], m.originalTitle)) ||
          (m.canonicalTitle && findTorrentByTitle([t], m.canonicalTitle))
        );
        if (mediaMatch) continue;
        logger.warn(COMPONENT, `[HIGIENE] Torrent órfão completo há >7d sem Download nem mídia — removendo: "${(t.name || t.hash).substring(0, 70)}"`);
        await QBittorrentService.deleteTorrent(t.hash, true).catch(() => {});
      }
    } catch (err: any) {
      logger.warn(COMPONENT, `[HIGIENE] Falha na rotina de higiene: ${err.message}`);
    }
  }

  // ── Limpeza de lixo de disco (auto-cura do armazenamento) ────────────────
  // Roda no startup e a cada 6h. Remove:
  //  1. Temporários de conversão abandonados (.tmp_*.mp4 com >24h de idade) —
  //     ffmpeg morreu no meio / rename falhou → deixa o temp órfão no disco.
  //  2. Duplicatas "_dup" (ex.: "Reacher - S02E01_dup.mkv") quando existe um
  //     arquivo equivalente de MESMO tamanho ao lado — 2 cópias do mesmo ep.
  //     (caso real: ~30GB de _dup em Reacher S02/S03/S04, disco apertado).
  async function cleanupDiskClutter() {
    const CLUTTER_ROOTS = ['/media/movies', '/media/series'];
    let freedBytes = 0;
    let removed = 0;
    const now = Date.now();
    const walk = (dir: string): void => {
      let entries: fs.Dirent[] = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const de of entries) {
        if (de.name.startsWith('.') && !de.name.startsWith('.tmp_')) continue;
        const full = path.join(dir, de.name);
        if (de.isDirectory()) { walk(full); continue; }
        if (!de.isFile()) continue;
        try {
          const st = fs.statSync(full);
          // 1) Temp de conversão órfão (>24h sem toque)
          if (de.name.startsWith('.tmp_') && de.name.endsWith('.mp4')) {
            if (now - st.mtimeMs > 24 * 60 * 60 * 1000) {
              fs.unlinkSync(full);
              freedBytes += st.size; removed++;
              logger.info(COMPONENT, `[CLUTTER] Temp de conversão órfão removido: ${full} (${(st.size / 1073741824).toFixed(2)}GB)`);
            }
            continue;
          }
          // 2) Duplicata "_dup" com equivalente de mesmo tamanho ao lado
          const dupMatch = de.name.match(/^(.*)_dup(\.[^.]+)$/);
          if (dupMatch) {
            const orig = path.join(dir, `${dupMatch[1]}${dupMatch[2]}`);
            if (fs.existsSync(orig)) {
              const stOrig = fs.statSync(orig);
              if (stOrig.size === st.size) {
                fs.unlinkSync(full);
                freedBytes += st.size; removed++;
                logger.info(COMPONENT, `[CLUTTER] Duplicata "_dup" removida (mesmo tamanho do original): ${full} (${(st.size / 1073741824).toFixed(2)}GB)`);
              }
            }
          }
        } catch { /* continue */ }
      }
    };
    for (const root of CLUTTER_ROOTS) walk(root);
    if (removed > 0) {
      logger.info(COMPONENT, `[CLUTTER] ${removed} arquivos removidos, ${(freedBytes / 1073741824).toFixed(2)}GB liberados`);
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

        // 1. Status travados em 'downloading' sem download ativo → 'pending'
        //    (NÃO 'error': uma série/filme recém-adicionado sem fonte ainda deve
        //    ser re-tentado — e 'error' sem arquivo é apagado pelo cascade no boot).
        const stalledMovies = await Movie.find({ status: 'downloading' });
        const stalledSeries = await Series.find({ status: 'downloading' });
        const activeDownloads = await Download.find({ status: { $in: ['downloading', 'queued'] } });
        const activeByMediaId = new Set(activeDownloads.map(d => d.mediaId.toString()));

        let fixed = 0;
        for (const m of stalledMovies) {
          if (!activeByMediaId.has(m._id.toString())) {
            await Movie.findByIdAndUpdate(m._id, { status: 'pending' });
            fixed++;
          }
        }
        for (const s of stalledSeries) {
          if (!activeByMediaId.has(s._id.toString())) {
            await Series.findByIdAndUpdate(s._id, { status: 'pending' });
            fixed++;
          }
        }
        if (fixed > 0) logger.info(COMPONENT, `Startup: ${fixed} items with stale 'downloading' status returned to 'pending'`);

        // 2. FIX ("baixou mas não consta em Downloads"): registros 'complete'
        // NÃO são mais deletados. A limpeza antiga (>24h) apagava o histórico do
        // card logo após a conclusão — o usuário via a mídia no catálogo mas a
        // aba Downloads ficava vazia. O card complete é o comprovante do
        // download (Regras §4: mantém o registro no banco). A limpeza de disco
        // continua por conta da regra de Auto-Limpeza de arquivos assistidos.

        // 2.1. FIX ("baixou mas não consta em Downloads"): backfill idempotente.
        // Mídia 'available' cujo registro Download foi perdido (limpeza antiga,
        // import direto, scan) ganha um card histórico 'complete' — a aba
        // Downloads passa a refletir TUDO que já foi baixado, não só o pendente.
        try {
          const mediaIdsWithDownload = new Set(
            (await Download.find({}, { mediaId: 1 }).lean()).map((d: any) => String(d.mediaId))
          );
          const [availMovies, availSeries] = await Promise.all([
            Movie.find({ status: 'available' }).lean(),
            Series.find({ status: 'available' }).lean(),
          ]);
          const missingMovies = availMovies.filter((m: any) => !mediaIdsWithDownload.has(String(m._id)));
          const missingSeries = availSeries.filter((s: any) => !mediaIdsWithDownload.has(String(s._id)));
          if (missingMovies.length > 0 || missingSeries.length > 0) {
            const docs = [
              ...missingMovies.map((m: any) => ({
                mediaId: String(m._id),
                mediaType: 'movie' as const,
                title: m.title,
                poster: m.poster || '',
                status: 'complete' as const,
                progress: 100,
                conversionStatus: (m as any).conversionStatus || 'none',
              })),
              ...missingSeries.map((s: any) => ({
                mediaId: String(s._id),
                mediaType: 'series' as const,
                title: s.title,
                poster: s.poster || '',
                status: 'complete' as const,
                progress: 100,
                conversionStatus: (s as any).conversionStatus || 'none',
              })),
            ];
            await Download.insertMany(docs, { ordered: false });
            logger.info(COMPONENT, `Startup: backfill de ${docs.length} card(s) de download para mídia disponível sem registro`);
          }
        } catch (err: any) {
          logger.warn(COMPONENT, `Backfill de downloads falhou (seguindo): ${err.message}`);
        }

        // 3. Sync de metadados (capas/sinopse/gêneros) para itens sem poster
        const result = await MetadataService.syncAllMetadata();
        logger.info(COMPONENT, `Metadata sync: ${result.movies} movies, ${result.series} series enriched`);

        // 4. Auto-cascade-delete: remove mídia sem conteúdo em disco
        await cascadeDeleteErrorMedia();

        // 4.1. Merge de duplicatas: remove filmes/séries com mesmo tmdbId ou título+ano
        const mergedMovies = await MediaScannerService.mergeDuplicateMovies();
        const mergedSeries = await MediaScannerService.mergeDuplicateSeries();
        if (mergedMovies > 0 || mergedSeries > 0) {
          logger.info(COMPONENT, `Startup dedup: ${mergedMovies} movies merged, ${mergedSeries} series merged`);
        }

        // 4.5. Catch-up: pós-conversão para mídias disponíveis com arquivos incompatíveis.
        // Roda no boot E a cada 15min — arquivos organizados APÓS o boot (torrents
        // que completam depois) precisam entrar na fila de conversão também.
        const runCatchUpPostProcessing = async () => {
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
              // Filme: enfileira somente se o arquivo for INCOMPATÍVEL (prova por
              // ffprobe), ignorando conversionStatus stale ('done' de arquivo antigo
              // não deve impedir a conversão de um arquivo re-baixado).
              try {
                const queued = await MediaPostProcessorService.processDirectoryIncompatibleOnly(path.dirname(fp), m._id.toString(), 'movie');
                if (queued > 0) {
                  logger.info(COMPONENT, `Catch-up: ${m.title} — arquivo incompatível enfileirado`);
                  converted += queued;
                }
              } catch {}
            }
            for (const s of availableSeries) {
              const p = (s as any).path;
              if (!p) continue;
              // Série: varre o diretório raiz da série (todas as temporadas/episódios).
              // IGNORA conversionStatus stale ('done' de conversão antiga de 1 arquivo
              // não deve pular episódios novos incompatíveis).
              const seriesRoot = p.split('/')[0];
              let queuedHere = 0;
              for (const root of MEDIA_ROOTS) {
                const dirCand = path.join(root, seriesRoot);
                try {
                  if (fs.existsSync(dirCand) && fs.statSync(dirCand).isDirectory()) {
                    queuedHere += await MediaPostProcessorService.processDirectoryIncompatibleOnly(dirCand, s._id.toString(), 'series');
                  }
                } catch {}
              }
              if (queuedHere > 0) {
                logger.info(COMPONENT, `Catch-up: ${s.title} — ${queuedHere} episódios incompatíveis enfileirados`);
                converted += queuedHere;
              }
            }
            if (converted > 0) logger.info(COMPONENT, `Catch-up post-processing: ${converted} incompatible files queued`);
            else logger.info(COMPONENT, `Catch-up post-processing: all files compatible or already queued`);
          } catch (err: any) {
            logger.warn(COMPONENT, `Catch-up post-processing failed: ${err.message}`);
          }
        };
        runCatchUpPostProcessing();
        setInterval(runCatchUpPostProcessing, 15 * 60 * 1000);

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

        // 5.1. Higiene de torrents presos / downloads fantasmas (5min interval)
        torrentAndDownloadHygiene().catch((err) =>
          logger.warn(COMPONENT, `Startup torrent hygiene failed: ${err.message}`)
        );
        setInterval(() => {
          torrentAndDownloadHygiene().catch((err) =>
            logger.warn(COMPONENT, `Scheduled torrent hygiene failed: ${err.message}`)
          );
        }, 5 * 60 * 1000);
        logger.info(COMPONENT, 'Higiene de torrents ativa — magnets presos e fantasmas resolvidos a cada 5min');

        // 5.2. Limpeza de lixo de disco (_dup, .tmp_ órfãos) — 6h interval
        cleanupDiskClutter().catch((err) =>
          logger.warn(COMPONENT, `Startup disk clutter cleanup failed: ${err.message}`)
        );
        setInterval(() => {
          cleanupDiskClutter().catch((err) =>
            logger.warn(COMPONENT, `Scheduled disk clutter cleanup failed: ${err.message}`)
          );
        }, 6 * 60 * 60 * 1000);
        logger.info(COMPONENT, 'Limpeza de disco ativa — duplicatas e temporários órfãos removidos a cada 6h');

        // 5.3. Deduplicação de mídia (REGRA: sem episódio/filme duplicado) —
        // consolida pastas da mesma série, mantém 1 cópia por SxxExx e remove
        // torrents redundantes. Boot + 6h.
        MediaDedupeService.dedupeAll().catch((err) =>
          logger.warn(COMPONENT, `Startup media dedupe failed: ${err.message}`)
        );
        setInterval(() => {
          MediaDedupeService.dedupeAll().catch((err) =>
            logger.warn(COMPONENT, `Scheduled media dedupe failed: ${err.message}`)
          );
        }, 1 * 60 * 60 * 1000);
        logger.info(COMPONENT, 'Deduplicação de mídia ativa — 1 cópia por episódio/filme (boot + 1h)');

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
              const subPath = sanitizeImagePath(`/${m[1]}`, 'tmdb');
              if (!subPath) continue;
              const cacheFile = cacheFilePath(subPath);
              if (loadCachedImage(cacheFile)) continue;
              jobs.push({ subPath, cacheFile });
            }
            if (jobs.length === 0) {
              logger.info(COMPONENT, 'TMDB image cache warm: nada a fazer (todas já em cache)');
              return;
            }
            const deadline = Date.now() + 10 * 60 * 1000;
            while (jobs.length > 0 && Date.now() < deadline) {
              const failed: typeof jobs = [];
              for (const job of jobs) {
                if (loadCachedImage(job.cacheFile)) continue;
                try {
                  const bytes = await fetchTmdbImageBytes(job.subPath);
                  if (writeCachedImage(job.cacheFile, bytes)) {
                    logger.info(COMPONENT, `TMDB image cached: ${job.subPath}`);
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

      // Gap retry a cada 10min: re-tenta temporadas/episódios incompletos de
      // séries 'available' — novas releases PT-BR são capturadas rápido.
      AutoPipelineService.retryAvailableSeriesGaps().catch((err: unknown) =>
        logger.warn(COMPONENT, `retryAvailableSeriesGaps startup falhou: ${(err as Error).message}`)
      );
      setInterval(() => {
        AutoPipelineService.retryAvailableSeriesGaps().catch((err: unknown) =>
          logger.warn(COMPONENT, `retryAvailableSeriesGaps scheduled falhou: ${(err as Error).message}`)
        );
      }, 10 * 60 * 1000);
      logger.info(COMPONENT, 'retryAvailableSeriesGaps ativo — rodando a cada 10min');
    }).catch((err: unknown) => {
      logger.warn(COMPONENT, `reconcilePendingSeries import falhou: ${(err as Error).message}`);
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(COMPONENT, `${signal} received — shutting down`);
    clearInterval(broadcastInterval);
    for (const child of activeTmdbFetches) child.kill('SIGTERM');
    const forceKillChildren = setTimeout(() => {
      for (const child of activeTmdbFetches) child.kill('SIGKILL');
    }, 1500);
    forceKillChildren.unref();
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
