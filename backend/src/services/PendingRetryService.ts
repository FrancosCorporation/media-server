// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Movie } from '../models/Movie';
import { Download } from '../models/Download';
import { RadarrService } from './RadarrService';
import { ApacheTorrentService } from './ApacheTorrentService';
import { RedeCanaisService } from './RedeCanaisService';
import { createDownloadIfUnique } from '../utils/dedupe';
import { logger } from '../utils/logger';

const COMPONENT = 'PendingRetry';

// Backoff: só tenta de novo itens que seguem pendentes há pelo menos 30 minutos
const RETRY_BACKOFF_MS = 30 * 60 * 1000;
// Máximo de filmes por rodada (evita sobrecarregar Radarr/qBittorrent de uma vez)
const MAX_PER_RUN = 3;
// Janela de espera após o addMovie antes de checar a fila do Radarr
const QUEUE_CHECK_MS = 10 * 1000;

let running = false;

async function isInRadarrQueue(radarrMovieId: number): Promise<boolean> {
  const { default: axios } = await import('axios');
  const { RadarrService } = await import('./RadarrService');
  const config = await RadarrService.getRadarrConfig();
  const { data: queue } = await axios.get(
    `${config.url}/api/v3/queue`,
    { headers: { 'X-Api-Key': config.apiKey }, timeout: 10000 }
  );
  return (queue.records || []).some((r: any) => r.movie?.id === radarrMovieId);
}

/**
 * Tenta baixar um filme em status 'pending' usando SOMENTE fontes PT-BR:
 * 1. Radarr (addMovie + grab manual estrito — barrar EN na origem)
 * 2. ApacheTorrent (fallback — magnet PT-BR filtrado)
 * 3. RedeCanais (fallback — HLS 100% BR)
 * Se nenhuma fonte PT-BR existir, mantém 'pending' (com backoff via updatedAt).
 */
async function attemptMovie(movie: any): Promise<void> {
  const searchTitle = movie.originalTitle || movie.title;
  logger.info(COMPONENT, `Tentando re-buscar pendente: "${movie.title}" (tmdb ${movie.tmdbId})`);

  movie.status = 'downloading';
  movie.updatedAt = new Date();
  await movie.save();

  try {
    // 1. Radarr — adiciona SEM search automático (searchForMovie=false) para não grabar EN;
    //    o grab manual abaixo usa a whitelist estrita PT-BR.
    let radarrMovie: any;
    try {
      radarrMovie = await RadarrService.addMovie(movie.tmdbId, movie.title, movie.year);
    } catch (err: any) {
      logger.warn(COMPONENT, `addMovie falhou para "${movie.title}": ${err.message}`);
      movie.status = 'pending';
      await movie.save();
      return;
    }
    movie.radarrId = radarrMovie.id;
    movie.quality = radarrMovie.qualityProfileId?.toString();
    await movie.save();

    await createDownloadIfUnique({
      mediaId: movie._id.toString(),
      mediaType: 'movie',
      title: movie.title,
      poster: movie.poster || '',
      status: 'downloading',
    }).catch(() => {});

    // 2. Espera a janela do Radarr e checa a fila (grab do addMovie/automático)
    await new Promise((r) => setTimeout(r, QUEUE_CHECK_MS));
    let grabbed = false;
    try {
      grabbed = await isInRadarrQueue(movie.radarrId);
    } catch (err: any) {
      logger.warn(COMPONENT, `Queue check falhou para "${movie.title}": ${err.message}`);
    }

    if (!grabbed) {
      // 3. Grab manual estrito PT-BR (RadarrService rejeita release EN na origem)
      const result = await RadarrService.manualGrab(movie.radarrId, 3072, searchTitle, movie.year);
      if (result.grabbed) {
        grabbed = true;
        logger.info(COMPONENT, `Grab manual PT-BR OK: ${result.title} (${result.sizeMB}MB)`);
      } else {
        logger.warn(COMPONENT, `Grab manual sem release PT-BR para "${movie.title}": ${result.error}`);
      }
    }

    // 4. Fallback ApacheTorrent — magnet PT-BR filtrado
    if (!grabbed) {
      try {
        const brResults = await ApacheTorrentService.searchBR(searchTitle);
        if (brResults.length > 0) {
          const batch = await ApacheTorrentService.addAllMagnets(brResults, '/media/movies', movie.year, undefined, searchTitle);
          logger.info(COMPONENT, `ApacheTorrent batch: ${batch.added} magnets PT-BR adicionados para "${movie.title}"`);
          grabbed = batch.added > 0;
        } else {
          logger.warn(COMPONENT, `ApacheTorrent: nenhum magnet PT-BR para "${movie.title}"`);
        }
      } catch (err: any) {
        logger.warn(COMPONENT, `ApacheTorrent fallback erro: ${err.message}`);
      }
    }

    // 5. Fallback RedeCanais — fonte 100% BR
    if (!grabbed) {
      try {
        const videoSources = await RedeCanaisService.searchBR(searchTitle);
        if (videoSources.length > 0) {
          const best = videoSources.find((s: any) => s.quality === '1080p' || s.quality === 'Original' || s.quality === '720p') || videoSources[0];
          logger.info(COMPONENT, `RedeCanais source encontrado: [${best.quality}] ${best.type}`);
          if (best.type === 'hls') {
            await RedeCanaisService.downloadHLS(best.url, '/media/movies', best.title);
          } else {
            const { execSync } = require('child_process');
            const safeName = best.title.replace(/[^a-zA-Z0-9\s\-_.]/g, '').trim();
            execSync(`curl -L -o "/media/movies/${safeName}.mp4" "${best.url}"`, { timeout: 600000 });
          }
          grabbed = true;
        }
      } catch (err: any) {
        logger.warn(COMPONENT, `RedeCanais fallback erro: ${err.message}`);
      }
    }

    if (!grabbed) {
      // Nenhuma fonte PT-BR disponível — volta para a fila de pendentes (backoff)
      logger.warn(COMPONENT, `Nenhuma fonte PT-BR disponível para "${movie.title}" — mantendo pendente`);
      movie.status = 'pending';
      await movie.save();
      await Download.findOneAndUpdate(
        { mediaId: movie._id.toString(), mediaType: 'movie' },
        { status: 'error' },
        { new: true }
      ).catch(() => {});
    }
  } catch (err: any) {
    logger.warn(COMPONENT, `attemptMovie erro para "${movie.title}": ${err.message}`);
    movie.status = 'pending';
    movie.updatedAt = new Date();
    await movie.save();
  }
}

async function checkPending(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const cutoff = new Date(Date.now() - RETRY_BACKOFF_MS);
    const pendentes = await Movie.find({ status: 'pending', updatedAt: { $lte: cutoff } })
      .sort({ updatedAt: 1 })
      .limit(MAX_PER_RUN);
    if (pendentes.length === 0) return;
    logger.info(COMPONENT, `${pendentes.length} filme(s) pendente(s) prontos para nova busca`);
    for (const movie of pendentes) {
      await attemptMovie(movie);
    }
  } catch (err: any) {
    logger.warn(COMPONENT, `checkPending erro: ${err.message}`);
  } finally {
    running = false;
  }
}

export const PendingRetryService = {
  checkPending,
  attemptMovie,
  start(intervalHours: number) {
    const intervalMs = intervalHours * 60 * 60 * 1000;
    setInterval(() => {
      checkPending().catch((err) => logger.warn(COMPONENT, `scheduled checkPending erro: ${err.message}`));
    }, intervalMs);
    logger.info(COMPONENT, `PendingRetryService ativo — nova busca de pendentes a cada ${intervalHours}h`);
  },
};
