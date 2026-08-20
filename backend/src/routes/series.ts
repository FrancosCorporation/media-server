// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Response } from 'express';
import fs from 'fs';
import { existsSync, unlinkSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { WatchProgress } from '../models/WatchProgress';
import { authenticateToken } from '../middleware/auth';
import { Series } from '../models/Series';
import { Download } from '../models/Download';
import { SearchHistory } from '../models/SearchHistory';
import { SonarrService } from '../services/SonarrService';
import { JellyfinService } from '../services/JellyfinService';
import { TMDBService } from '../services/TMDBService';
import { MetadataService } from '../services/MetadataService';
import { GapAnalysisService } from '../services/GapAnalysisService';
import { AutoPipelineService } from '../services/AutoPipelineService';
import { QBittorrentService } from '../services/QBittorrentService';
import { logger } from '../utils/logger';
import { fixPosterUrl, fixPosters } from '../utils/poster';
import { findExistingByTitleYear } from '../utils/dedupe';
import { invalidateRecommendationsCache } from './recommendations';
import type { AuthRequest } from '../types';

const router = Router();
const COMPONENT = 'SeriesRoute';

const SERIES_ROOT = '/media/series';
const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.ts', '.rmvb', '.flv'];

const PROPAGANDA_KEYWORDS = ['bludv', 'sample', 'trailer', 'propaganda', 'preview', 'ad-', 'ad_', 'advert', 'promo'];
const MIN_EPISODE_MB = 100;

function isPropagandaFile(filePath: string): boolean {
  const name = path.basename(filePath).toLowerCase();
  if (/[st]\d{1,2}[. _-]*e\d{1,2}/.test(name)) return false;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < MIN_EPISODE_MB * 1024 * 1024) return true;
    // Arquivos > 500MB são conteúdo real mesmo que o nome contenha palavra-chave de propaganda
    if (stat.size > 500 * 1024 * 1024) return false;
  } catch { return true; }
  if (PROPAGANDA_KEYWORDS.some((kw) => name.includes(kw))) return true;
  return false;
}

function buildSeasonPatterns(seasonStr: string, episode: number): RegExp[] {
  const epStr = String(episode).padStart(2, '0');
  const season = parseInt(seasonStr, 10);
  return [
    new RegExp(`[st]${seasonStr}[. _-]*e${epStr}`, 'i'),
    new RegExp(`[st]${seasonStr}[. _-]*e${episode}(?![0-9])`, 'i'),
    new RegExp(`(?:^|[^0-9])${season}[xX]${epStr}(?:[^0-9]|$)`, 'i'),
    new RegExp(`(?:^|[^0-9])${season}[xX]${episode}(?![0-9])`, 'i'),
  ];
}

function matchEpisodeFile(files: string[], seasonStr: string, episode: number, totalEpisodes: number): string | null {
  const patterns = buildSeasonPatterns(seasonStr, episode);
  for (const re of patterns) {
    const found = files.find((f) => re.test(path.basename(f)));
    if (found) return found;
  }

  const numFile = files.find((f) => {
    const m = path.basename(f).match(/^(\d{1,2})[.\s_-]/);
    return m && parseInt(m[1], 10) === episode;
  });
  if (numFile) return numFile;

  if (files.length === 1 && !/[st]\d{1,2}[. _-]*e\d{1,2}/i.test(path.basename(files[0]))) {
    return files[0];
  }

  return null;
}

function findVideoFiles(dir: string, depth = 0): string[] {
  if (depth > 6) return [];
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && VIDEO_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
        if (!isPropagandaFile(fullPath)) results.push(fullPath);
      } else if (entry.isDirectory()) {
        results.push(...findVideoFiles(fullPath, depth + 1));
      }
    }
  } catch { /* ignore permission errors */ }
  return results;
}

// Resolve o diretório da série preferindo o que realmente tem conteúdo
// (corrige casos em que series.path aponta para pasta vazia/migrada).
function resolveSeriesDirWithContent(series: any): string | null {
  const candidates: string[] = [];

  if (series.path) {
    const firstSegment = series.path.split('/')[0];
    if (firstSegment) candidates.push(path.join(SERIES_ROOT, firstSegment));
  }
  const titleBase = series.title || series.canonicalTitle;
  if (titleBase) {
    candidates.push(path.join(SERIES_ROOT, titleBase));
    const simplified = titleBase.split(':')[0].trim();
    if (simplified && simplified !== titleBase) candidates.push(path.join(SERIES_ROOT, simplified));
  }

  const unique = [...new Set(candidates)];
  for (const c of unique) {
    if (fs.existsSync(c) && findVideoFiles(c).length > 0) return c;
  }
  for (const c of unique) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

router.use(authenticateToken);

/**
 * GET /api/series/search?q=...
 * Busca séries no Sonarr (TVDB) e/ou TMDB.
 * Retorna resultados unificados com tmdbId para identidade canônica.
 */
router.get('/search', async (req: AuthRequest, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim().slice(0, 200);
    if (!q) return res.status(400).json({ error: 'Parâmetro "q" obrigatório' });
    if (/[<>"';&]/.test(q)) return res.status(400).json({ error: 'Caracteres inválidos na busca' });

    // Busca em paralelo: TMDB (títulos/sinopses pt-BR) e Sonarr (IDs tvdb)
    const [tmdbResults, sonarrResults] = await Promise.allSettled([
      TMDBService.searchSeries(q),
      SonarrService.searchSeries(q),
    ]);

    const tmdb = tmdbResults.status === 'fulfilled' ? tmdbResults.value : [];
    const sonarr = sonarrResults.status === 'fulfilled' ? sonarrResults.value : [];

    // Índice Sonarr por tmdbId (para anexar tvdbId sem trocar o título exibido)
    const sonarrByTmdbId = new Map<number, any>();
    for (const s of sonarr) {
      if (s.tmdbId) sonarrByTmdbId.set(s.tmdbId, s);
    }

    // Base SEMPRE do TMDB: título e sinopse em pt-BR, originalTitle em inglês para uso interno
    const merged = tmdb.map((t: any) => {
      const sMatch = sonarrByTmdbId.get(t.tmdbId);
      const posterUrl = TMDBService.getPosterUrl(t.posterPath);
      return {
        id: sMatch?.tvdbId || t.tmdbId,
        tvdbId: sMatch?.tvdbId || null,
        tmdbId: t.tmdbId,
        title: t.name,
        originalTitle: t.originalName,
        canonicalTitle: t.name,
        year: t.year,
        overview: t.overview,
        poster: posterUrl || (sMatch?.poster ?? null),
        backdrop: TMDBService.getBackdropUrl(t.backdropPath) || (sMatch?.backdrop ?? null),
        genres: t.genres,
        rating: t.rating,
        seasons: t.totalSeasons,
        totalSeasons: t.totalSeasons,
        totalEpisodes: t.totalEpisodes,
      };
    });

    // Resultados do Sonarr sem correspondência TMDB (fallback caso TMDB esteja indisponível)
    for (const s of sonarr) {
      if (!merged.find((m: any) => m.tmdbId === s.tmdbId)) {
        merged.push({
          ...s,
          id: s.tvdbId,
          tvdbId: s.tvdbId,
          tmdbId: s.tmdbId || null,
          title: s.title,
          originalTitle: s.title,
          canonicalTitle: s.title,
        });
      }
    }

    SearchHistory.create({
      userId: req.user?._id || 'anonymous',
      query: q,
      mediaType: 'series',
    }).catch(() => {});

    res.json({ results: merged });
  } catch (err) {
    logger.error(COMPONENT, 'Search error', { error: err instanceof Error ? err.message : String(err) });
    res.status(502).json({ error: 'Erro ao buscar séries.' });
  }
});

/**
 * GET /api/series/gap-analysis/:id
 * Analisa lacunas: o que está no disco vs o que deveria existir (TMDB).
 */
router.get('/gap-analysis/:id', async (req: AuthRequest, res: Response) => {
  try {
    const series = await Series.findById(req.params.id);
    if (!series) return res.status(404).json({ error: 'Série não encontrada' });

    const tmdbId = series.tmdbId || null;
    const analysis = await GapAnalysisService.analyzeSeriesGaps(series.title, tmdbId);

    res.json({ analysis });
  } catch (err) {
    logger.error(COMPONENT, 'Gap analysis error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao analisar lacunas' });
  }
});

/**
 * POST /api/series/organize/:id
 * Organiza arquivos existentes de uma série na estrutura Jellyfin.
 */
router.post('/organize/:id', async (req: AuthRequest, res: Response) => {
  try {
    const series = await Series.findById(req.params.id);
    if (!series) return res.status(404).json({ error: 'Série não encontrada' });

    const basePath = req.body.basePath || '/media/series';
    const organized = GapAnalysisService.organizeExistingFiles(series.title, basePath);

    res.json({
      organized,
      count: organized.length,
      message: `${organized.length} arquivos organizados na estrutura Jellyfin`,
    });
  } catch (err) {
    logger.error(COMPONENT, 'Organize error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao organizar arquivos' });
  }
});

/**
 * POST /api/series/pipeline/:id
 * Roda o pipeline completo automático para uma série existente.
 * Útil para re-processar séries que já estão no sistema.
 */
router.post('/pipeline/:id', async (req: AuthRequest, res: Response) => {
  try {
    const series = await Series.findById(req.params.id);
    if (!series) return res.status(404).json({ error: 'Série não encontrada' });

    // Roda em background para não bloquear a resposta
    AutoPipelineService.runSeriesPipeline(series._id.toString()).catch((err) => {
      logger.error(COMPONENT, `Pipeline failed for ${series.title}: ${err.message}`);
    });

    res.json({ message: 'Pipeline iniciado em background', seriesId: series._id });
  } catch (err) {
    logger.error(COMPONENT, 'Pipeline trigger error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao iniciar pipeline' });
  }
});

/**
 * POST /api/series
 * Adiciona uma série. Pipeline 100% automático:
 * 1. Resolve identidade canônica via TMDB
 * 2. Envia para Sonarr (se tiver tvdbId)
 * 3. Gap analysis automática
 * 4. Download de todas as temporadas faltantes
 * 5. Organização na estrutura Jellyfin
 * 6. Refresh da biblioteca Jellyfin
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    let { tvdbId, tmdbId } = req.body;
    const { title: reqTitle, year, poster, overview, genres, rating, seasons } = req.body;
    if (!tvdbId && !tmdbId) return res.status(400).json({ error: 'tvdbId ou tmdbId obrigatório' });

    // Verifica duplicata por qualquer um dos IDs (tvdbId OU tmdbId)
    const orConditions = [];
    if (tvdbId) orConditions.push({ tvdbId });
    if (tmdbId) orConditions.push({ tmdbId });
    let existing = orConditions.length > 0 ? await Series.findOne({ $or: orConditions }) : null;
    // Dedup estrita adicional: Título + Ano normalizados (cobre séries sem IDs)
    if (!existing) {
      existing = await findExistingByTitleYear(Series, reqTitle, year);
    }
    if (existing) {
      // SOBRESCRITA DE REGISTROS CORROMPIDOS: error/failed (ou pending órfão sem
      // arquivo e sem torrent ativo) NUNCA bloqueiam a re-adição — remove o registro
      // antigo, limpa rastros e prossegue com a criação de um novo registro zerado.
      const corruptStatuses = new Set(['error', 'failed']);
      let hasActiveTorrent = false;
      try {
        if (QBittorrentService.isConnected) {
          const torrents = await QBittorrentService.getTorrents();
          const seriesNorm = (existing.originalTitle || existing.canonicalTitle || existing.title)
            .toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
          hasActiveTorrent = (torrents || []).some((t: any) => {
            if (['error', 'missingFiles', 'stalledUP', 'queuedUP', 'pausedUP'].includes(t.state)) return false;
            const tNorm = (t.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
            return tNorm === seriesNorm;
          });
        }
      } catch { /* qBittorrent indisponível */ }

      const isCorrupt = corruptStatuses.has(existing.status);
      const isOrphanPending = existing.status === 'pending' && !hasActiveTorrent;

      if (isCorrupt || isOrphanPending) {
        logger.warn(COMPONENT, `HARD RESET: "${existing.title}" (status=${existing.status}) — removendo série corrompida/órfã para re-adição`);
        if (existing.sonarrId) {
          await SonarrService.deleteSeries(existing.sonarrId, false).catch((err) =>
            logger.warn(COMPONENT, `Hard reset: falha ao remover do Sonarr: ${err.message}`)
          );
        }
        await Download.deleteMany({ mediaId: existing._id.toString() });
        await Series.findByIdAndDelete(existing._id);
        invalidateRecommendationsCache();
      } else {
        return res.status(409).json({ error: 'Série já adicionada', series: existing });
      }
    }

    // Se tem tmdbId, busca título canônico
    // title = nome pt-BR (exibição); originalTitle/canonicalTitle = nome original EN (pasta/torrent)
    let title = reqTitle;
    let canonicalTitle = reqTitle;
    let originalTitle = reqTitle;
    let totalSeasons = seasons || 1;
    let totalEpisodes = 0;

    if (tmdbId) {
      try {
        const tmdbData = await TMDBService.getSeriesDetails(tmdbId);
        if (tmdbData) {
          title = tmdbData.name;
          originalTitle = tmdbData.originalName || title;
          canonicalTitle = originalTitle;
          totalSeasons = tmdbData.totalSeasons || seasons || 1;
          totalEpisodes = tmdbData.totalEpisodes || 0;
        }
        // Resolve tvdbId via TMDB external_ids (importante quando a busca foi em português)
        if (!tvdbId) {
          const ext = await TMDBService.getExternalIds(tmdbId);
          if (ext?.tvdbId) tvdbId = ext.tvdbId;
        }
      } catch (err: any) {
        logger.warn(COMPONENT, `TMDB lookup failed during add: ${err.message}`);
      }
    }

    const series = await Series.create({
      tvdbId: tvdbId || 0,
      tmdbId: tmdbId || undefined,
      title,
      canonicalTitle,
      originalTitle,
      year,
      status: 'pending',
      poster: poster || '',
      overview: overview || '',
      genres: genres || [],
      rating: rating || 0,
      seasons: totalSeasons,
      totalEpisodes,
    });
    // Home (recomendações) reflete a nova adição imediatamente
    invalidateRecommendationsCache();

    logger.info(COMPONENT, `Series created: "${canonicalTitle}" (id: ${series._id})`);

    // PIPELINE AUTOMÁTICO em background
    // Não bloqueia a resposta — o usuário já vê a série na lista
    AutoPipelineService.runSeriesPipeline(series._id.toString(), { basePath: '/media/series' })
      .then((result) => {
        logger.info(COMPONENT, `Pipeline complete for "${canonicalTitle}": ${result.message}`);
      })
      .catch((err) => {
        logger.error(COMPONENT, `Pipeline failed for "${canonicalTitle}": ${err.message}`);
        // Marca como erro apenas se nenhum download foi iniciado
        Series.findByIdAndUpdate(series._id, { status: 'error' }).catch(() => {});
      });

    res.status(201).json({
      series,
      message: 'Série adicionada. Download e organização iniciados automaticamente.',
    });
  } catch (err) {
    logger.error(COMPONENT, 'Add error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao adicionar série' });
  }
});

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const items = await Series.find({ status: { $ne: 'error' } }).sort({ addedAt: -1 });
    const enriched = await MetadataService.enrichSeriesItems(items.map(s => s.toObject()));
    res.json({ series: fixPosters(enriched, 'series') });
  } catch {
    res.status(500).json({ error: 'Erro ao listar séries' });
  }
});

/**
 * GET /api/series/:id/seasons/:seasonNumber/episodes
 * Retorna episódios de uma temporada via TMDB.
 */
router.get('/:id/seasons/:seasonNumber/episodes', async (req: AuthRequest, res: Response) => {
  try {
    const series = await Series.findById(req.params.id);
    if (!series) return res.status(404).json({ error: 'Série não encontrada' });
    if (!series.tmdbId) return res.status(400).json({ error: 'Série não tem tmdbId' });

    const seasonNumber = parseInt(req.params.seasonNumber);
    if (isNaN(seasonNumber) || seasonNumber < 1) {
      return res.status(400).json({ error: 'seasonNumber inválido' });
    }

    const episodes = await TMDBService.getSeasonEpisodes(series.tmdbId, seasonNumber);

    // Resolve o arquivo real de cada episódio para permitir streaming direto
    const seriesDir = resolveSeriesDirWithContent(series);
    if (seriesDir) {
      // Lista todos os arquivos de vídeo da temporada uma única vez
      const seasonStr = String(seasonNumber).padStart(2, '0');
      const seasonCandidates = [
        path.join(seriesDir, `Season ${seasonStr}`),
        path.join(seriesDir, `Season ${seasonNumber}`),
        path.join(seriesDir, `Temporada ${seasonNumber}`),
        path.join(seriesDir, `S${seasonStr}`),
        path.join(seriesDir, `season ${seasonStr}`),
      ];
      let seasonFiles: string[] = [];
      for (const sd of seasonCandidates) {
        if (fs.existsSync(sd)) {
          seasonFiles = findVideoFiles(sd);
          break;
        }
      }
      // Fallback: se não achou pasta de temporada (arquivos importados flat
      // pelo Sonarr ou com nomes de release), varre toda a árvore da série.
      if (seasonFiles.length === 0) {
        seasonFiles = findVideoFiles(seriesDir);
      }
      if (seasonFiles.length > 0) {
        for (const ep of episodes) {
          try {
            const match = matchEpisodeFile(seasonFiles, seasonStr, ep.episodeNumber, episodes.length);
            if (match) {
              const rel = path.relative(SERIES_ROOT, match).replace(/\\/g, '/');
              (ep as any).streamPath = rel;
            }
          } catch { /* keep streamPath undefined */ }
        }
      }
    }

    res.json({ episodes });
  } catch (err) {
    logger.error(COMPONENT, 'Get episodes error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao buscar episódios' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const serie = await Series.findById(req.params.id);
    if (!serie) return res.status(404).json({ error: 'Série não encontrada' });
    const enriched = await MetadataService.enrichSeries(serie.toObject());
    enriched.poster = fixPosterUrl(enriched.poster, 'series');
    res.json({ series: enriched });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar série' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const series = await Series.findById(req.params.id);
    if (!series) return res.status(404).json({ error: 'Série não encontrada' });

    logger.info(COMPONENT, `Cascade delete series: ${series.title} (id: ${series._id})`);

    // 1. Deleta do Sonarr COM deleteFiles=true (remove do disco)
    if (series.sonarrId) {
      await SonarrService.deleteSeries(series.sonarrId, true).catch((err) =>
        logger.warn(COMPONENT, 'Sonarr delete failed', { error: err.message, sonarrId: series.sonarrId })
      );
    }

    // 2. Remove torrents associados do qBittorrent
    const downloads = await Download.find({ mediaId: req.params.id });
    for (const dl of downloads) {
      if (dl.hash) {
        await QBittorrentService.deleteTorrent(dl.hash, true).catch((err) =>
          logger.warn(COMPONENT, 'qBittorrent delete failed', { error: err.message, hash: dl.hash })
        );
      }
    }

    // 3. Remove arquivos do disco diretamente (fallback quando Sonarr não existe)
    if (series.path) {
      for (const root of ['/media/movies', '/media/series', '/downloads', '/media/transcode']) {
        const fullPath = path.join(root, series.path);
        try {
          if (existsSync(fullPath)) {
            const stat = statSync(fullPath);
            if (stat.isFile()) {
              unlinkSync(fullPath);
              logger.info(COMPONENT, `Deleted file: ${fullPath}`);
            } else if (stat.isDirectory()) {
              const deleteDir = (dir: string) => {
                for (const entry of readdirSync(dir)) {
                  const entryPath = path.join(dir, entry);
                  const s = statSync(entryPath);
                  if (s.isDirectory()) deleteDir(entryPath);
                  else unlinkSync(entryPath);
                }
                require('fs').rmdirSync(dir);
              };
              deleteDir(fullPath);
              logger.info(COMPONENT, `Deleted directory: ${fullPath}`);
            }
          }
        } catch (err: any) {
          logger.warn(COMPONENT, `Failed to delete disk file: ${fullPath}`, { error: err.message });
        }
      }
    }

    // 4. Remove downloads associados do MongoDB
    await Download.deleteMany({ mediaId: req.params.id });

    // 5. Remove watch progress
    await WatchProgress.deleteMany({ mediaId: req.params.id });

    // 6. Remove do MongoDB
    await Series.findByIdAndDelete(req.params.id);
    invalidateRecommendationsCache();

    // 7. Solicita refresh da biblioteca no Jellyfin
    JellyfinService.refreshLibrary('series').catch(() => {});

    logger.info(COMPONENT, `Series cascade deleted: ${series.title}`);
    res.json({ success: true, message: 'Série removida de todos os sistemas' });
  } catch (err) {
    logger.error(COMPONENT, 'Delete error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao remover série' });
  }
});

export default router;
