// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { Movie } from '../models/Movie';
import { Download } from '../models/Download';
import { SearchHistory } from '../models/SearchHistory';
import { RadarrService } from '../services/RadarrService';
import { TMDBService } from '../services/TMDBService';
import { OMDBService } from '../services/OMDBService';
import { MetadataService } from '../services/MetadataService';
import { JellyfinService } from '../services/JellyfinService';
import { QBittorrentService } from '../services/QBittorrentService';
import { fixPosterUrl, fixPosters } from '../utils/poster';
import { createDownloadIfUnique, findExistingByTitleYear } from '../utils/dedupe';
import { invalidateRecommendationsCache } from './recommendations';
import type { AuthRequest } from '../types';
import { logger } from '../utils/logger';
import { existsSync, unlinkSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { WatchProgress } from '../models/WatchProgress';

const router = Router();
const COMPONENT = 'MoviesRoute';

const MEDIA_ROOTS = ['/media/servidor/Backup', '/media/movies', '/media/series', '/downloads'];

router.use(authenticateToken);

router.get('/search', async (req: AuthRequest, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim().slice(0, 200);
    if (!q) return res.status(400).json({ error: 'Parâmetro "q" obrigatório' });
    if (/[<>"';&]/.test(q)) return res.status(400).json({ error: 'Caracteres inválidos na busca' });

    // Busca em paralelo: TMDB (títulos/sinopses pt-BR) e Radarr (IDs)
    const [tmdbResults, radarrResults] = await Promise.allSettled([
      TMDBService.searchMovies(q),
      RadarrService.searchMovie(q),
    ]);

    const tmdb = tmdbResults.status === 'fulfilled' ? tmdbResults.value : [];
    const radarr = radarrResults.status === 'fulfilled' ? radarrResults.value : [];

    const radarrByTmdbId = new Map<number, any>();
    for (const r of radarr) {
      if (r.id) radarrByTmdbId.set(r.id, r);
    }

    // Base SEMPRE do TMDB: título/sinopse em pt-BR, originalTitle em inglês para uso interno
    const results = tmdb.map((m: any) => {
      const rMatch = radarrByTmdbId.get(m.tmdbId);
      const posterUrl = TMDBService.getPosterUrl(m.posterPath);
      return {
        id: m.tmdbId,
        tmdbId: m.tmdbId,
        title: m.title,
        originalTitle: m.originalTitle,
        year: m.year,
        overview: m.overview,
        poster: posterUrl || (rMatch?.poster ?? null),
        backdrop: TMDBService.getBackdropUrl(m.backdropPath) || (rMatch?.backdrop ?? null),
        genres: m.genres,
        rating: m.rating,
      };
    });

    // Resultados do Radarr sem correspondência TMDB (fallback caso TMDB esteja indisponível)
    for (const r of radarr) {
      if (!results.find((m: any) => m.tmdbId === r.id)) {
        results.push({ ...r, tmdbId: r.id, originalTitle: r.title });
      }
    }

    // Fallback OMDB DIRETO quando TMDB/Radarr não retornam NADA (título só existe no OMDB).
    // REGRA global: qualquer busca de filme sem resultado tenta o OMDB antes de responder vazio.
    if (results.length === 0) {
      try {
        const omdbMovie = await OMDBService.searchMovieByTitle(q);
        if (omdbMovie) {
          const mapped = OMDBService.mapOMDBToMovie(omdbMovie) as Record<string, any>;
          results.push({
            id: undefined,
            tmdbId: undefined,
            imdbId: mapped.imdbId as string | undefined,
            title: mapped.title,
            originalTitle: mapped.originalTitle,
            year: mapped.year,
            overview: mapped.overview,
            poster: mapped.poster || '',
            backdrop: '',
            genres: mapped.genres,
            rating: mapped.rating,
          } as any);
        }
      } catch { /* OMDB falhou */ }
    }

    // Enriquece resultados com dados faltantes (overview, genres, rating, poster) via TMDB/OMDB
    const enrichedResults = await Promise.all(
      results.map(async (m: any) => {
        const needsEnrichment = !m.overview || !m.genres?.length || !m.rating || !m.poster;
        if (needsEnrichment && m.tmdbId) {
          try {
            const enriched = await MetadataService.enrichMovieFull({ ...m, tmdbId: m.tmdbId });
            return {
              ...m,
              overview: enriched.overview || m.overview,
              genres: enriched.genres?.length ? enriched.genres : m.genres,
              rating: enriched.rating || m.rating,
              poster: enriched.poster || m.poster,
              backdrop: enriched.backdrop || m.backdrop,
            };
          } catch { /* ignore enrichment errors */ }
        }
        return m;
      })
    );

    SearchHistory.create({
      userId: req.user?._id || 'anonymous',
      query: q,
      mediaType: 'movie',
    }).catch(() => {});
    res.json({ results: enrichedResults });
  } catch (err) {
    logger.error(COMPONENT, 'Search error', { error: err instanceof Error ? err.message : String(err) });
    res.status(502).json({ error: 'Erro ao buscar filmes. Verifique a conexão com Radarr.' });
  }
});

/**
 * Estados que são considerados "corrompidos" — um registro nesse estado NUNCA
 * bloqueia a re-adição. Ao tentar adicionar de novo, fazemos um Hard Reset:
 * apagamos o registro antigo (e rastros no disco/qBittorrent/Radarr), inserimos
 * um novo registro zerado e injetamos novamente na pipeline.
 */
const CORRUPT_STATUSES = new Set(['error', 'failed', 'failedRetry']);

/**
 * Faz o Hard Reset de um registro corrompido: remove rastros no qBittorrent,
 * Radarr, Downloads e por fim o próprio registro de Movie.
 * Retorna true quando o registro antigo foi removido (e a adição pode prosseguir).
 */
async function hardResetMovie(existing: any): Promise<void> {
  const movieNorm = (existing.originalTitle || existing.title).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
  logger.warn(COMPONENT, `HARD RESET: "${existing.title}" (tmdbId=${existing.tmdbId}, status=${existing.status}) — removendo registro corrompido/órfão para re-adição`);

  // 1. Remove torrents correspondentes do qBittorrent (se conectado)
  try {
    if (QBittorrentService.isConnected) {
      const torrents = await QBittorrentService.getTorrents();
      for (const t of torrents || []) {
        const tNorm = (t.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
        if (tNorm === movieNorm) {
          logger.info(COMPONENT, `Hard reset: removendo torrent antigo do qBittorrent: "${t.name}"`);
          await QBittorrentService.deleteTorrent(t.hash, false).catch((err: any) =>
            logger.warn(COMPONENT, `Hard reset: falha ao remover torrent "${t.name}": ${err.message}`)
          );
        }
      }
    }
  } catch (err: any) {
    logger.warn(COMPONENT, `Hard reset: qBittorrent indisponível, pulando limpeza de torrents: ${err.message}`);
  }

  // 2. Remove do Radarr (se registrado)
  if (existing.radarrId) {
    await RadarrService.deleteMovie(existing.radarrId, false).catch((err: any) =>
      logger.warn(COMPONENT, `Hard reset: falha ao remover do Radarr: ${err.message}`)
    );
  }

  // 3. Remove downloads associados + o próprio registro
  await Download.deleteMany({ mediaId: existing._id.toString() });
  await Movie.findByIdAndDelete(existing._id);
  invalidateRecommendationsCache();
  logger.info(COMPONENT, `Hard reset concluído para "${existing.title}" — novo registro será criado`);
}

/**
 * Injeta o filme recém-criado na pipeline de download (Radarr → grab manual →
 * fallback ApacheTorrent/RedeCanais). Qualquer falha deixa o filme em 'pending'
 * para o PendingRetryService tentar novamente mais tarde.
 */
async function runMoviePipeline(movie: any, searchTitle: string): Promise<void> {
  try {
    logger.info(COMPONENT, `Pipeline iniciada para "${movie.title}" (tmdbId=${movie.tmdbId})`);
    const radarrMovie = await RadarrService.addMovie(movie.tmdbId, movie.title, movie.year);
    movie.radarrId = radarrMovie.id;
    movie.status = 'downloading';
    movie.quality = radarrMovie.qualityProfileId?.toString();
    await movie.save();

    await createDownloadIfUnique({
      mediaId: movie._id.toString(),
      mediaType: 'movie',
      title: movie.title,
      poster: movie.poster,
      status: 'downloading',
    });

    // Fallback: se o Radarr não grabou automaticamente em 10s, faz grab manual
    setTimeout(async () => {
      try {
        const radarrConfig = await RadarrService.getRadarrConfig();
        const { data: queue } = await import('axios').then(ax => ax.default.get(
          `${radarrConfig.url}/api/v3/queue`,
          { headers: { 'X-Api-Key': radarrConfig.apiKey }, timeout: 10000 }
        ));
        const inQueue = (queue.records || []).some((r: any) => r.movie?.id === radarrMovie.id);
        if (!inQueue && movie.status === 'downloading') {
          logger.info(COMPONENT, `Movie ${movie.title} not in queue, attempting manual grab`);
          const result = await RadarrService.manualGrab(radarrMovie.id, 3072, searchTitle, movie.year);
          if (result.grabbed) {
            logger.info(COMPONENT, `Manual grab succeeded: ${result.title} (${result.sizeMB}MB)`);
          } else {
            logger.warn(COMPONENT, `Manual grab failed: ${result.error}`);
            // Fallback: busca magnet PT-BR via todos os indexadores (Prowlarr, Jackett, BeTor, etc.)
            let fallbackOk = false;
            try {
              const { BRTorrentAggregator } = require('../services/BRTorrentAggregator');
              const brResults = await BRTorrentAggregator.searchAll(searchTitle);
              if (brResults.length > 0) {
                const batch = await BRTorrentAggregator.searchAndAddMagnet(searchTitle, '/media/movies', movie.year, false);
                logger.info(COMPONENT, `BRTorrentAggregator batch: ${batch.added} magnets added for ${movie.title}`);
                if (batch.added > 0) {
                  fallbackOk = true;
                } else {
                  logger.warn(COMPONENT, `BRTorrentAggregator: nenhum magnet PT-BR com seed real para ${movie.title} — NÃO baixando versão EN`);
                }
              } else {
                logger.warn(COMPONENT, `BRTorrentAggregator: nenhum resultado PT-BR para ${movie.title}`);
              }
            } catch (err: any) {
              logger.warn(COMPONENT, `BRTorrentAggregator fallback error: ${err.message}`);
            }

            if (!fallbackOk) {
              // Fallback 2: tenta RedeCanais (filmtyp/vidmoly) — fonte 100% BR
              try {
                const { RedeCanaisService } = require('../services/RedeCanaisService');
                const videoSources = await RedeCanaisService.searchBR(searchTitle);
                if (videoSources.length > 0) {
                  const best = videoSources.find((s: any) => s.quality === '1080p' || s.quality === 'Original' || s.quality === '720p') || videoSources[0];
                  logger.info(COMPONENT, `RedeCanais source found: [${best.quality}] ${best.type}`);
                  if (best.type === 'hls') {
                    await RedeCanaisService.downloadHLS(best.url, '/media/movies', best.title);
                  } else {
                    const { execSync } = require('child_process');
                    const safeName = best.title.replace(/[^a-zA-Z0-9\s\-_.]/g, '').trim();
                    execSync(`curl -L -o "/media/movies/${safeName}.mp4" "${best.url}"`, { timeout: 600000 });
                    logger.info(COMPONENT, `Downloaded MP4: ${safeName}.mp4`);
                  }
                  fallbackOk = true;
                }
              } catch (err: any) {
                logger.warn(COMPONENT, `RedeCanais fallback error: ${err.message}`);
              }
            }

            if (!fallbackOk) {
              // Nenhuma fonte PT-BR disponível: volta para a fila de pendentes
              logger.warn(COMPONENT, `Nenhuma fonte PT-BR disponível para "${movie.title}" — retornando à fila de pendentes`);
              movie.status = 'pending';
              await movie.save();
              await Download.findOneAndUpdate(
                { mediaId: movie._id.toString(), mediaType: 'movie' },
                { status: 'failed' },
                { new: true }
              ).catch(() => {});
            }
          }
        }
      } catch (err: any) {
        logger.warn(COMPONENT, `Queue check failed: ${err.message}`);
      }
    }, 10000);
  } catch (err: any) {
    // DEBUG do caso "Matrix": log robusto com o motivo real da falha
    const statusCode = err?.response?.status;
    const responseBody = err?.response?.data;
    logger.error(COMPONENT, 'Pipeline falhou — adicionando logs de diagnóstico', {
      title: movie.title,
      tmdbId: movie.tmdbId,
      error: err.message,
      statusCode,
      responseBody: responseBody !== undefined ? JSON.stringify(responseBody).slice(0, 500) : undefined,
      qbittorrentConnected: QBittorrentService.isConnected,
      qbittorrentUrl: process.env.QBITTORRENT_URL || 'http://qbittorrent:8082',
      radarrUrl: process.env.RADARR_URL || 'http://radarr:7878',
      radarrApiKeySet: !!(process.env.RADARR_API_KEY),
      statusFinal: movie.status,
    });
    // Radarr indisponível (401/502) NÃO deve marcar como error — mantém pending
    // para que o PendingRetryService tente novamente mais tarde.
    if (movie.status !== 'error') {
      movie.status = 'pending';
      await movie.save().catch(() => {});
    }
  }
}

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { tmdbId, title, year, poster, overview, genres, rating, originalTitle } = req.body;
    if (!title) return res.status(400).json({ error: 'title obrigatório' });

    // Dedup estrita: 1) por tmdbId (quando disponível); 2) por Título + Ano
    // normalizados (cobre buscas sem tmdbId, ex.: fallback OMDB).
    let existing = tmdbId ? await Movie.findOne({ tmdbId }) : null;
    if (!existing) {
      existing = await findExistingByTitleYear(Movie, title, year);
    }
    // Fallback adicional: busca fuzzy por título normalizado (captura "The Matrix" vs "Matrix")
    if (!existing && !tmdbId) {
      const normTitle = (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      if (normTitle.length >= 2) {
        existing = await Movie.findOne({
          year: year || { $exists: true },
          status: { $ne: 'error' },
          $or: [
            { title: { $regex: new RegExp(normTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } },
            { originalTitle: { $regex: new RegExp(normTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } },
          ],
        });
        if (existing) {
          logger.info(COMPONENT, `Fuzzy title match: "${title}" → "${existing.title}" (tmdbId=${existing.tmdbId})`);
        }
      }
    }
    if (existing) {
      // ── SOBRESCRITA DE REGISTROS CORROMPIDOS (Upsert / Hard Reset) ──
      // Se o registro está em error/failed, OU é um pending órfão (sem arquivo
      // no disco e sem torrent ativo no qBittorrent), NUNCA bloqueia a ação:
      // remove o registro antigo, limpa rastros e prossegue com a criação de
      // um novo registro zerado + re-injeção na pipeline.
      const hasFileOnDisk = existing.path
        ? existsSync(existing.path)
        : MEDIA_ROOTS.some((root) => {
            const candidate = path.join(root, path.basename(existing.title) + (existing.year ? ` ${existing.year}` : ''));
            return existsSync(candidate);
          });

      // Verifica torrent ativo no qBittorrent. SE o serviço NÃO estiver conectado,
      // não conseguimos confirmar a existência de torrent — nesse caso SÓ deixamos
      // passar se o registro estiver explicitamente corrompido (error/failed).
      let hasActiveTorrent = false;
      const qbitConnected = QBittorrentService.isConnected;
      try {
        const torrents = await QBittorrentService.getTorrents();
        if (qbitConnected && torrents.length > 0) {
          const movieNorm = (existing.originalTitle || existing.title).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
          hasActiveTorrent = torrents.some((t: any) => {
            if (['error', 'missingFiles', 'stalledUP', 'queuedUP', 'pausedUP'].includes(t.state)) return false;
            const tNorm = (t.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
            return tNorm === movieNorm;
          });
        }
      } catch { /* qBittorrent indisponível */ }

      const isCorrupt = CORRUPT_STATUSES.has(existing.status);
      const isOrphanPending = existing.status === 'pending' && !hasFileOnDisk && !hasActiveTorrent;

      if (isCorrupt || isOrphanPending) {
        // Hard Reset: deleta o registro antigo, limpa rastros, insere novo registro zerado
        await hardResetMovie(existing);
      } else {
        if (!hasFileOnDisk && !qbitConnected) {
          logger.warn(COMPONENT, `Movie "${existing.title}" (tmdbId=${tmdbId}) has no file on disk but qBittorrent unavailable — keeping record (conservative).`);
        }
        return res.status(409).json({ error: 'Filme já adicionado', movie: existing });
      }
    }

    const movie = await Movie.create({
      tmdbId, title, year,
      status: 'pending',
      poster: poster || '',
      overview: overview || '',
      genres: genres || [],
      rating: rating || 0,
      originalTitle: originalTitle || undefined,
    });
    // Home (recomendações) reflete a nova adição imediatamente
    invalidateRecommendationsCache();

    // Título original (EN) é usado para buscas de torrent; title (pt-BR) apenas para exibição
    const searchTitle = movie.originalTitle || movie.title;

    // Envia para a pipeline em background
    runMoviePipeline(movie, searchTitle);

    res.status(201).json({ movie });
  } catch (err) {
    logger.error(COMPONENT, 'Add error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao adicionar filme' });
  }
});

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const movies = await Movie.find({ status: { $ne: 'error' } }).sort({ addedAt: -1 });
    const movieIds = movies.map(m => m._id.toString());

    // Busca downloads associados para incluir progresso
    const downloads = await Download.find({ mediaId: { $in: movieIds }, mediaType: 'movie' });
    const downloadMap = new Map(downloads.map(d => [d.mediaId, d]));

    // Enriquece com metadados TMDB (capas/sinopse/gêneros) quando faltam
    const enriched = await MetadataService.enrichMovies(movies.map(m => m.toObject()));

    const result = enriched.map(obj => {
      const dl = downloadMap.get(obj._id.toString());
      if (dl && obj.status === 'downloading') {
        obj.downloadProgress = dl.progress;
        obj.downloadSpeed = dl.speed;
        obj.downloadEta = dl.eta;
        obj.downloadStatus = dl.status;
      }
      return obj;
    });

    res.json({ movies: fixPosters(result, 'movie') });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar filmes' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: 'Filme não encontrado' });
    const enriched = await MetadataService.enrichMovie(movie.toObject());
    enriched.poster = fixPosterUrl(enriched.poster, 'movie');
    res.json({ movie: enriched });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar filme' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: 'Filme não encontrado' });

    logger.info(COMPONENT, `Cascade delete movie: ${movie.title} (id: ${movie._id})`);

    // 1. Deleta do Radarr COM deleteFiles=true (remove do disco + qBittorrent)
    if (movie.radarrId) {
      await RadarrService.deleteMovie(movie.radarrId, true).catch((err) =>
        logger.warn(COMPONENT, 'Radarr delete failed', { error: err.message, radarrId: movie.radarrId })
      );
    } else if (movie.tmdbId) {
      const found = await RadarrService.lookupByTmdbId(movie.tmdbId);
      if (found?.id) {
        await RadarrService.deleteMovie(found.id, true).catch((err) =>
          logger.warn(COMPONENT, 'Radarr delete failed (by tmdbId)', { error: err.message, radarrId: found.id })
        );
      }
    }

    // 2. Remove torrents associados do qBittorrent (caso não tenha radarrId)
    if (!movie.radarrId) {
      const downloads = await Download.find({ mediaId: req.params.id });
      for (const dl of downloads) {
        if (dl.hash) {
          await QBittorrentService.deleteTorrent(dl.hash, true).catch((err) =>
            logger.warn(COMPONENT, 'qBittorrent delete failed', { error: err.message, hash: dl.hash })
          );
        }
      }
    }

    // 3. Remove arquivos do disco diretamente (fallback quando Radarr não existe)
    if (movie.path) {
      for (const root of ['/media/movies', '/media/series', '/downloads', '/media/transcode']) {
        const fullPath = path.join(root, movie.path);
        try {
          if (existsSync(fullPath)) {
            const stat = statSync(fullPath);
            if (stat.isFile()) {
              unlinkSync(fullPath);
              logger.info(COMPONENT, `Deleted file: ${fullPath}`);
            } else if (stat.isDirectory()) {
              // Deleta todo o conteúdo do diretório recursivamente
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
    await Movie.findByIdAndDelete(req.params.id);
    invalidateRecommendationsCache();

    // 7. Solicita refresh da biblioteca no Jellyfin (não bloqueia a resposta)
    JellyfinService.refreshLibrary('movies').catch(() => {});

    logger.info(COMPONENT, `Movie cascade deleted: ${movie.title}`);
    res.json({ success: true, message: 'Filme removido de todos os sistemas' });
  } catch (err) {
    logger.error(COMPONENT, 'Delete error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao remover filme' });
  }
});

/**
 * POST /api/movies/:id/retry
 * Re-injeta um filme em estado error/failed/pending na pipeline.
 * Usado pelo botão "Tentar Novamente" da aba Downloads.
 */
router.post('/:id/retry', async (req: AuthRequest, res: Response) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: 'Filme não encontrado' });

    if (!CORRUPT_STATUSES.has(movie.status as string) && movie.status !== 'pending') {
      return res.status(409).json({ error: 'Filme não está em estado de erro/pendente — nada a retry' });
    }

    // Limpa downloads associados e rastros no qBittorrent/Radarr
    await Download.deleteMany({ mediaId: movie._id.toString() });
    await hardResetMovie(movie);

    // Cria um novo registro zerado e re-injeta na pipeline
    const fresh = await Movie.create({
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      status: 'pending',
      poster: movie.poster || '',
      overview: movie.overview || '',
      genres: movie.genres || [],
      rating: movie.rating || 0,
      originalTitle: movie.originalTitle || undefined,
    });
    invalidateRecommendationsCache();

    const searchTitle = fresh.originalTitle || fresh.title;
    runMoviePipeline(fresh, searchTitle);

    logger.info(COMPONENT, `Retry iniciado para "${movie.title}" (id: ${fresh._id})`);
    res.json({ success: true, movie: fresh, message: 'Download reiniciado' });
  } catch (err) {
    logger.error(COMPONENT, 'Retry error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao reiniciar download' });
  }
});

/**
 * POST /api/movies/:id/grab
 * Faz grab manual de um release 1080p para o filme.
 * Útil quando o Radarr não grabou automaticamente.
 */
router.post('/:id/grab', async (req: AuthRequest, res: Response) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: 'Filme não encontrado' });
    if (!movie.radarrId) return res.status(400).json({ error: 'Filme não está no Radarr' });

    const maxSizeMB = req.body.maxSizeMB || 3072;
    const result = await RadarrService.manualGrab(movie.radarrId, maxSizeMB, movie.title);

    if (result.grabbed) {
      res.json({ success: true, title: result.title, sizeMB: result.sizeMB });
    } else {
      res.status(404).json({ success: false, error: result.error });
    }
  } catch (err) {
    logger.error(COMPONENT, 'Grab error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao fazer grab manual' });
  }
});

export default router;
