// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import axios from 'axios';
import { CachedCover, type CachedCoverDocument } from '../models/CachedCover';
import { Movie } from '../models/Movie';
import { Series } from '../models/Series';
import { logger } from '../utils/logger';

const COMPONENT = 'CoverCache';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function getRadarrCoverUrl(radarrId: number): Promise<string | null> {
  try {
    const baseUrl = process.env.RADARR_URL || 'http://radarr:7878';
    const apiKey = process.env.RADARR_API_KEY || '';
    const { data } = await axios.get(`${baseUrl}/api/v3/movie/${radarrId}`, {
      headers: { 'X-Api-Key': apiKey },
      timeout: 10000,
    });
    if (data.images?.length > 0) {
      const cover = data.images.find((img: any) => img.coverType === 'poster') || data.images[0];
      if (cover?.remoteUrl) return cover.remoteUrl;
      if (cover?.url) {
        const path = cover.url.replace(/^https?:\/\/[^/]+/, '');
        return `/media-api/radarr-cover${path}`;
      }
    }
    return null;
  } catch (err: any) {
    logger.warn(COMPONENT, `Radarr cover fetch failed for id ${radarrId}: ${err.message}`);
    return null;
  }
}

async function getSonarrCoverUrl(sonarrId: number): Promise<string | null> {
  try {
    const baseUrl = process.env.SONARR_URL || 'http://sonarr:8989';
    const apiKey = process.env.SONARR_API_KEY || '';
    const { data } = await axios.get(`${baseUrl}/api/v3/series/${sonarrId}`, {
      headers: { 'X-Api-Key': apiKey },
      timeout: 10000,
    });
    if (data.images?.length > 0) {
      const cover = data.images.find((img: any) => img.coverType === 'poster') || data.images[0];
      if (cover?.remoteUrl) return cover.remoteUrl;
      if (cover?.url) {
        const path = cover.url.replace(/^https?:\/\/[^/]+/, '');
        return `/media-api/sonarr-cover${path}`;
      }
    }
    return null;
  } catch (err: any) {
    logger.warn(COMPONENT, `Sonarr cover fetch failed for id ${sonarrId}: ${err.message}`);
    return null;
  }
}

async function cacheMovieCover(movie: any): Promise<void> {
  let poster = movie.poster;
  let source: 'tmdb' | 'radarr' | 'sonarr' | 'hdrtorrent' = 'tmdb';

  if (movie.radarrId) {
    const radarrCover = await getRadarrCoverUrl(movie.radarrId);
    if (radarrCover) {
      poster = radarrCover;
      source = 'radarr';
    }
  }

  if (!poster && movie.tmdbId) {
    const tmdbCover = await getTmdbPoster(movie.tmdbId, 'movie');
    if (tmdbCover) {
      poster = tmdbCover;
      source = 'tmdb';
    }
  }

  if (!poster) return;

  await CachedCover.findOneAndUpdate(
    { mediaId: movie._id.toString(), mediaType: 'movie' },
    {
      mediaId: movie._id.toString(),
      mediaType: 'movie',
      title: movie.title,
      poster,
      backdrop: movie.backdrop,
      source,
      lastUpdated: new Date(),
    },
    { upsert: true }
  );
}

async function cacheSeriesCover(series: any): Promise<void> {
  let poster = series.poster;
  let source: 'tmdb' | 'radarr' | 'sonarr' | 'hdrtorrent' = 'tmdb';

  if (series.sonarrId) {
    const sonarrCover = await getSonarrCoverUrl(series.sonarrId);
    if (sonarrCover) {
      poster = sonarrCover;
      source = 'sonarr';
    }
  }

  if (!poster && series.tmdbId) {
    const tmdbCover = await getTmdbPoster(series.tmdbId, 'tv');
    if (tmdbCover) {
      poster = tmdbCover;
      source = 'tmdb';
    }
  }

  if (!poster) return;

  await CachedCover.findOneAndUpdate(
    { mediaId: series._id.toString(), mediaType: 'series' },
    {
      mediaId: series._id.toString(),
      mediaType: 'series',
      title: series.title,
      poster,
      backdrop: series.backdrop,
      source,
      lastUpdated: new Date(),
    },
    { upsert: true }
  );
}

async function getTmdbPoster(tmdbId: number, type: 'movie' | 'tv'): Promise<string | null> {
  try {
    const { Settings } = await import('../models/Settings');
    const s = await Settings.findOne();
    const apiKey = s?.tmdbApiKey || process.env.TMDB_API_KEY;
    if (!apiKey) return null;

    const { data } = await axios.get(`https://api.themoviedb.org/3/${type}/${tmdbId}`, {
      params: { api_key: apiKey, language: 'pt-BR' },
      timeout: 10000,
    });
    if (data.poster_path) {
      return `https://image.tmdb.org/t/p/w500${data.poster_path}`;
    }
    return null;
  } catch {
    return null;
  }
}

async function getCachedCover(mediaId: string, mediaType: 'movie' | 'series'): Promise<CachedCoverDocument | null> {
  return CachedCover.findOne({ mediaId, mediaType });
}

async function syncAllCovers(): Promise<{ updated: number; errors: number }> {
  logger.info(COMPONENT, 'Starting full cover cache sync');
  let updated = 0;
  let errors = 0;

  const movies = await Movie.find({ status: { $in: ['available', 'downloading'] } });
  for (const movie of movies) {
    try {
      await cacheMovieCover(movie);
      updated++;
    } catch (err: any) {
      logger.warn(COMPONENT, `Failed to cache cover for movie "${movie.title}": ${err.message}`);
      errors++;
    }
  }

  const series = await Series.find({ status: { $in: ['available', 'downloading'] } });
  for (const s of series) {
    try {
      await cacheSeriesCover(s);
      updated++;
    } catch (err: any) {
      logger.warn(COMPONENT, `Failed to cache cover for series "${s.title}": ${err.message}`);
      errors++;
    }
  }

  logger.info(COMPONENT, `Cover cache sync complete: ${updated} updated, ${errors} errors`);
  return { updated, errors };
}

export const CoverCacheService = {
  getCachedCover,
  cacheMovieCover,
  cacheSeriesCover,
  syncAllCovers,
};
