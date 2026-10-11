// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth';
import { StreamingService } from '../services/StreamingService';
import { logger } from '../utils/logger';
import { Movie } from '../models/Movie';
import { Series } from '../models/Series';
import type { AuthRequest } from '../types';
import { getLocalStreamBaseURL } from '../utils/network';
import { isSpamFileName } from '../utils/constants';
import { PlaybackRegistry } from '../services/PlaybackRegistry';
import { applyStreamCorsHeaders } from '../utils/corsPolicy';

const COMPONENT = 'StreamRoute';
const router = Router();

// CORS headers específicos para streaming de vídeo (Range requests)
// DEVE estar ANTES do authenticateToken para permitir preflight requests
router.use((req, res, next) => {
  if (!applyStreamCorsHeaders(req, res)) return res.sendStatus(403);
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// DLNA Allowlist Middleware - Bypass autenticação para dispositivos DLNA conhecidos
// DEVE estar ANTES da autenticação por token
import { dlnaAllowlist } from '../services/DlnaAllowlist';
router.use(dlnaAllowlist.middleware());

// Stream-specific auth: accepts token from Authorization header OR query param
// (the <video> element can't send custom headers)
router.use((req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token && req.query.token) {
    token = String(req.query.token);
  }
  if (!token) {
    res.status(401).json({ error: 'Token de autenticação necessário' });
    return;
  }
  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET;
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
});

const MEDIA_ROOTS = ['/media/servidor/Backup/media', '/media/movies', '/media/series', '/downloads', '/media/transcode'];

function resolveMediaPath(relativePath: string): string | null {
  const decoded = decodeURIComponent(relativePath);

  // Suporte legado: DB antigo armazenava path absoluto (/media/movies/...).
  // Se o decoded já é absoluto e existe, retornar direto (evita duplicação de prefixo).
  if (decoded.startsWith('/')) {
    const absCandidate = path.resolve(decoded);
    // Valida que está dentro de MEDIA_ROOTS para segurança
    const insideRoot = MEDIA_ROOTS.some((root) => absCandidate.startsWith(path.resolve(root)));
    if (insideRoot && fs.existsSync(absCandidate)) {
      try {
        const stat = fs.statSync(absCandidate);
        if (stat.isFile() && isSpamFileName(path.basename(absCandidate), stat.size)) {
          logger.warn(COMPONENT, `Blocked spam file path (absolute): ${absCandidate}`);
        } else {
          return absCandidate;
        }
      } catch { /* ignore */ }
    }
  }

  const safePath = decoded.replace(/\.\.\//g, '').replace(/\.\./g, '').replace(/^\/+/, '');

  for (const root of MEDIA_ROOTS) {
    const candidate = path.join(root, safePath);
    if (fs.existsSync(candidate)) {
      const resolved = path.resolve(candidate);
      const resolvedRoot = path.resolve(root);
      if (resolved.startsWith(resolvedRoot)) {
        // Guarda anti-propaganda: nega arquivos spam (ex: BLUDV.mp4 de 32MB
        // que o banco aponta) — o fallback por título (que filtra) assume.
        try {
          const stat = fs.statSync(resolved);
          if (stat.isFile() && isSpamFileName(path.basename(resolved), stat.size)) {
            logger.warn(COMPONENT, `Blocked spam file path: ${resolved}`);
            continue;
          }
        } catch { /* ignore */ }
        return resolved;
      }
    }
  }
  return null;
}

function findVideoFileByTitle(title: string, year?: number): string | null {
  const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanTitle.length < 3) return null;

  for (const root of MEDIA_ROOTS) {
    if (!fs.existsSync(root)) continue;

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
                const name = item.name.toLowerCase();
                const isRealEpisode = /[st]\d{1,2}[. _-]*e\d{1,2}/.test(name);
                const isPropaganda = !isRealEpisode && ['bludv', 'sample', 'trailer', 'propaganda', 'preview', 'promo', 'ad-', 'ad_'].some((kw) => name.includes(kw));
                let tooSmall = false;
                try {
                  const size = fs.statSync(fullPath).size;
                  // Em /downloads (parcial/sequencial) permite 30MB para play antecipado; finalizados exigem 100MB para filtrar propaganda
                  const isPartialRoot = dirPath.startsWith('/downloads');
                  const minSize = isPartialRoot ? 30 * 1024 * 1024 : 100 * 1024 * 1024;
                  tooSmall = size < minSize;
                } catch {
                  tooSmall = true;
                }
                if (!isPropaganda && !tooSmall) videoFiles.push(fullPath);
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
  }

  return null;
}

function firstRealVideoInDir(dir: string): string | null {
  const all: string[] = [];
  const isPartialRoot = dir.startsWith('/downloads');
  const minSize = isPartialRoot ? 30 * 1024 * 1024 : 100 * 1024 * 1024;
  function walk(d: string, depth = 0) {
    if (depth > 6) return;
    try {
      const items = fs.readdirSync(d, { withFileTypes: true });
      for (const item of items) {
        const full = path.join(d, item.name);
        if (item.isFile() && ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.ts', '.rmvb', '.flv'].includes(path.extname(item.name).toLowerCase())) {
          const name = item.name.toLowerCase();
          const isRealEpisode = /[st]\d{1,2}[. _-]*e\d{1,2}/.test(name);
          const isPropaganda = !isRealEpisode && ['bludv', 'sample', 'trailer', 'propaganda', 'preview', 'promo', 'ad-', 'ad_'].some((kw) => name.includes(kw));
          let tooSmall = false;
          try {
            tooSmall = fs.statSync(full).size < minSize;
          } catch {
            tooSmall = true;
          }
          if (!isPropaganda && !tooSmall) all.push(full);
        } else if (item.isDirectory()) {
          walk(full, depth + 1);
        }
      }
    } catch { /* ignore */ }
  }
  walk(dir);
  return all.length > 0 ? all[0] : null;
}

/**
 * POST /api/stream/heartbeat
 * O frontend pinga enquanto o player está aberto (a cada 30s). Mantém a
 * sessão ativa e bloqueia a troca física do arquivo em exibição.
 * Body: { path: "<caminho relativo ou absoluto em exibição>" }
 */
router.post('/heartbeat', (req: AuthRequest, res: Response) => {
  const p = String((req.body as any)?.path || '');
  if (!p) return res.json({ ok: false });
  const resolved = resolveMediaPath(p);
  if (resolved) PlaybackRegistry.touch(resolved);
  res.json({ ok: true });
});

router.get('/duration/*', async (req: AuthRequest, res: Response) => {
  try {
    const fileSubPath = req.params[0] || '';
    let filePath = resolveMediaPath(fileSubPath);

    if (!filePath) {
      const pathTitle = decodeURIComponent(fileSubPath);
      const yearMatch = pathTitle.match(/\b(19|20)\d{2}\b/);
      const year = yearMatch ? parseInt(yearMatch[0]) : undefined;
      const cleanTitle = pathTitle.replace(/\b(19|20)\d{2}\b/, '').trim();
      filePath = findVideoFileByTitle(cleanTitle, year);
    }

    if (!filePath) {
      res.status(404).json({ error: 'Arquivo não encontrado', duration: 0 });
      return;
    }

    const { execFile } = require('child_process');
    const ffprobePath = 'ffprobe';
    execFile(ffprobePath, [
      '-v', 'quiet', '-print_format', 'json', '-show_format',
      filePath
    ], { timeout: 10000 }, (err: any, stdout: string) => {
      if (err) {
        logger.error(COMPONENT, 'ffprobe failed', { error: err.message, filePath });
        res.json({ duration: 0 });
        return;
      }
      try {
        const data = JSON.parse(stdout);
        const duration = parseFloat(data.format?.duration || '0');
        res.json({ duration: Math.floor(duration) });
      } catch {
        res.json({ duration: 0 });
      }
    });
  } catch (err: any) {
    logger.error(COMPONENT, 'Duration probe error', { error: err.message });
    res.json({ duration: 0 });
  }
});

// GET /api/stream/url/:mediaId - Returns the local stream URL for DLNA casting
router.get('/url/:mediaId', async (req: AuthRequest, res: Response) => {
  try {
    const { mediaId } = req.params;
    const { type, title } = req.query; // type: 'movie' | 'series'
    
    let filePath: string | null = null;
    let mediaTitle = String(title || 'Media');
    
    if (type === 'movie') {
      const movie = await Movie.findById(mediaId);
      if (movie) {
        mediaTitle = movie.title;
        if (movie.path) {
          filePath = movie.path;
        } else if (movie.tmdbId) {
          filePath = findVideoFileByTitle(movie.title, movie.year);
        }
      }
    } else if (type === 'series') {
      const series = await Series.findById(mediaId);
      if (series) {
        mediaTitle = series.title;
        if (series.path) {
          filePath = series.path;
        } else if (series.tvdbId) {
          filePath = findVideoFileByTitle(series.title, series.year);
        }
      }
    } else {
      // Try both
      const movie = await Movie.findById(mediaId);
      if (movie) {
        mediaTitle = movie.title;
        filePath = movie.path || (movie.tmdbId ? findVideoFileByTitle(movie.title, movie.year) : null);
      } else {
        const series = await Series.findById(mediaId);
        if (series) {
          mediaTitle = series.title;
          filePath = series.path || (series.tvdbId ? findVideoFileByTitle(series.title, series.year) : null);
        }
      }
    }
    
    if (!filePath) {
      res.status(404).json({ error: 'Mídia não encontrada ou sem arquivo no disco' });
      return;
    }

    // Guarda anti-propaganda (casting direto do path do banco)
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile() && isSpamFileName(path.basename(filePath), stat.size)) {
        logger.warn(COMPONENT, `Blocked spam file for casting: ${filePath}`);
        res.status(404).json({ error: 'Arquivo de propaganda — escolha um episódio válido' });
        return;
      }
    } catch { /* ignore */ }

    // Get relative path from media roots
    let relativePath: string | null = null;
    for (const root of MEDIA_ROOTS) {
      if (filePath.startsWith(root)) {
        relativePath = path.relative(root, filePath).replace(/\\/g, '/');
        break;
      }
    }
    
    if (!relativePath) {
      res.status(404).json({ error: 'Arquivo fora das pastas de mídia configuradas' });
      return;
    }
    
    // Build local stream URL with token
    const token = req.headers['authorization']?.startsWith('Bearer ') 
      ? req.headers['authorization'].slice(7) 
      : (req.query.token as string || '');
    
    const streamURL = `${getLocalStreamBaseURL()}/api/stream/${encodeURIComponent(relativePath)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    
    res.json({
      streamURL,
      mediaTitle,
      filePath: relativePath,
    });
  } catch (err: any) {
    logger.error(COMPONENT, 'Get stream URL error', { error: err.message });
    res.status(500).json({ error: 'Erro ao gerar URL de stream' });
  }
});

// GET /api/stream/frame - Extrai um frame do vídeo num timestamp dado
router.get('/frame', async (req: AuthRequest, res: Response) => {
  try {
    const { path: pathParam, time } = req.query;
    if (!pathParam || typeof pathParam !== 'string') {
      return res.status(400).json({ error: 'Parâmetro "path" obrigatório' });
    }
    const t = parseFloat(String(time || '0'));
    if (isNaN(t) || t < 0) {
      return res.status(400).json({ error: 'Parâmetro "time" inválido' });
    }

    const filePath = resolveMediaPath(pathParam);
    if (!filePath) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    const frame = await StreamingService.extractFrame(filePath, t);
    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=60',
    });
    res.send(frame);
  } catch (err: any) {
    logger.error(COMPONENT, 'Frame extraction error', { error: err.message });
    res.status(500).json({ error: 'Erro ao extrair frame' });
  }
});

router.get('/*', async (req: AuthRequest, res: Response) => {
  try {
    const fileSubPath = req.params[0] || req.path.replace(/^\/api\/stream\/?/, '');
    let filePath = resolveMediaPath(fileSubPath);

    // Fallback: if path not found, try to find by title from database
    if (!filePath) {
      // Extract potential title from the path (e.g., "The Matrix 1999")
      const pathTitle = decodeURIComponent(fileSubPath);
      const yearMatch = pathTitle.match(/\b(19|20)\d{2}\b/);
      const year = yearMatch ? parseInt(yearMatch[0]) : undefined;
      const cleanTitle = pathTitle.replace(/\b(19|20)\d{2}\b/, '').trim();

      filePath = findVideoFileByTitle(cleanTitle, year);
    }

    if (!filePath) {
      res.status(404).json({ error: 'Arquivo não encontrado' });
      return;
    }

    // Se o caminho resolvido é um diretório (ex: raiz de série), toca o 1º episódio real
    try {
      if (fs.statSync(filePath).isDirectory()) {
        const firstEpisode = firstRealVideoInDir(filePath);
        if (firstEpisode) {
          filePath = firstEpisode;
        } else {
          res.status(404).json({ error: 'Nenhum episódio encontrado neste diretório' });
          return;
        }
      }
    } catch { /* não é diretório */ }

    const forceTranscode = req.query.transcode === 'true' || req.query.transcode === '1';
    const quality = req.query.quality === '720p' ? '720p' : '1080p';
    const range = req.headers.range;
    const seekStart = req.query.start ? parseFloat(String(req.query.start)) : undefined;
    const allowDirect = req.query.direct === '1' || req.query.allowPartial === '1';

    // REGRA DE OURO: registra sessão ativa — a troca "convertido → original"
    // fica bloqueada enquanto este arquivo estiver sendo assistido.
    PlaybackRegistry.touch(filePath);
    res.on('close', () => {
      // Stream encerrou (fim/stop/skip). O grace de 5min começa a contar daqui.
      PlaybackRegistry.release(filePath);
    });

    logger.info(COMPONENT, `Stream requested: ${fileSubPath} (transcode: ${forceTranscode}, quality: ${quality}, direct: ${allowDirect}${seekStart ? `, seek: ${seekStart}s` : ''})`);

    await StreamingService.streamVideo(filePath, range, res, forceTranscode, quality, seekStart, allowDirect as any)
      .catch((err: any) => {
        // Evita unhandled rejection (ex.: ENOENT entre existsSync e statSync)
        logger.warn(COMPONENT, 'streamVideo falhou', { error: err.message });
        if (!res.headersSent) res.status(404).json({ error: 'Arquivo indisponível' });
      });
  } catch (err: any) {
    logger.error(COMPONENT, 'Stream error', { error: err.message });
    res.status(500).json({ error: 'Erro ao processar stream' });
  }
});

export default router;
