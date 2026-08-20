// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Movie } from '../models/Movie';
import { Series } from '../models/Series';
import { TMDBService } from './TMDBService';
import { OMDBService } from './OMDBService';
import { logger } from '../utils/logger';

const COMPONENT = 'Metadata';

/**
 * Enriquecimento de metadados via TMDB.
 *
 * Problema resolvido: itens importados pelo scanner do disco (ou adicionados sem
 * lookup completo) ficam sem capa, sinopse, gêneros e nota. Este serviço busca
 * os dados no TMDB (pelo tmdbId) e persiste no MongoDB, para que capas apareçam
 * no Início, Assistir, Biblioteca e Downloads.
 *
 * O cache em memória evita repetir chamadas ao TMDB dentro de um curto período.
 */

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h
const enrichedCache = new Map<string, number>(); // key -> last attempt timestamp

function cacheKey(type: 'movie' | 'series', tmdbId: number): string {
  return `${type}:${tmdbId}`;
}

function recentlyTried(key: string): boolean {
  const last = enrichedCache.get(key);
  return last !== undefined && Date.now() - last < CACHE_TTL;
}

function isEnriched(item: any): boolean {
  return !!(item?.poster && item?.overview);
}

/**
 * Enriquece um filme com dados do TMDB (capa, backdrop, sinopse, gêneros, nota).
 * Retorna o objeto atualizado. Persiste no banco em background (não bloqueia).
 */
export async function enrichMovie(movie: any): Promise<any> {
  const tmdbId = movie?.tmdbId;
  if (!tmdbId) {
    // Sem tmdbId: tenta enriquecer via busca por título
    return enrichMovieBySearch(movie);
  }
  if (isEnriched(movie)) return movie;

  const key = cacheKey('movie', tmdbId);
  if (recentlyTried(key)) return movie;
  enrichedCache.set(key, Date.now());

  try {
    const details = await TMDBService.getMovieDetails(tmdbId);
    if (!details) return movie;

    const poster = details.posterPath ? TMDBService.getPosterUrl(details.posterPath) : movie.poster;
    const backdrop = details.backdropPath ? TMDBService.getBackdropUrl(details.backdropPath) : movie.backdrop;

    const enriched = {
      ...movie,
      poster: poster || movie.poster || '',
      backdrop: backdrop || movie.backdrop,
      overview: details.overview || movie.overview || '',
      genres: details.genres?.length ? details.genres : movie.genres || [],
      rating: details.rating || movie.rating || 0,
      year: details.year || movie.year,
    };

    if (movie._id) {
      Movie.findByIdAndUpdate(movie._id, {
        tmdbId: movie.tmdbId || undefined,
        poster: enriched.poster,
        backdrop: enriched.backdrop,
        overview: enriched.overview,
        genres: enriched.genres,
        rating: enriched.rating,
        year: enriched.year,
        updatedAt: new Date(),
      }, { runValidators: false }).catch(() => {});
    }

    return enriched;
  } catch (err: any) {
    logger.warn(COMPONENT, `TMDB enrichment failed for movie "${movie.title}": ${err.message}`);
    return movie;
  }
}

/**
 * Enriquece um filme forçando fallback OMDB se TMDB vier incompleto.
 * Versão leve para busca: usa dados do search result + OMDB fallback, sem chamar getMovieDetails (lento).
 */
export async function enrichMovieFull(movie: any): Promise<any> {
  const tmdbId = movie?.tmdbId;
  if (!tmdbId) return enrichMovieBySearch(movie);

  // Usa dados já vindos do search result (overview, genres, rating, poster, year)
  let overview = movie.overview || '';
  let genres = movie.genres || [];
  let rating = movie.rating || 0;
  let poster = movie.poster || '';
  let backdrop = movie.backdrop || '';
  let year = movie.year;

  // Se dados do search estão incompletos, tenta OMDB direto (sem getMovieDetails que trava)
  const needsOMDB = !overview || !genres?.length || !rating || !poster;
  if (needsOMDB) {
    try {
      const omdb = await OMDBService.searchMovieByTitle(movie.title, movie.year);
      if (omdb) {
        const mapped = OMDBService.mapOMDBToMovie(omdb);
        overview = overview || mapped.overview;
        genres = genres.length ? genres : mapped.genres;
        rating = rating || mapped.rating;
        poster = poster || mapped.poster;
        backdrop = backdrop || mapped.backdrop;
        year = year || mapped.year;
      }
    } catch { /* OMDB failed */ }
  }

  const enriched = {
    ...movie,
    poster: poster || '',
    backdrop: backdrop || '',
    overview: overview || '',
    genres: genres || [],
    rating: rating || 0,
    year: year || movie.year,
  };

  if (movie._id) {
    Movie.findByIdAndUpdate(movie._id, {
      tmdbId: movie.tmdbId || undefined,
      imdbId: enriched.imdbId || movie.imdbId,
      poster: enriched.poster,
      backdrop: enriched.backdrop,
      overview: enriched.overview,
      genres: enriched.genres,
      rating: enriched.rating,
      year: enriched.year,
      updatedAt: new Date(),
    }, { runValidators: false }).catch(() => {});
  }

  return enriched;
}

/**
 * Enriquece uma série com dados do TMDB (capa, backdrop, sinopse, gêneros, nota).
 * Retorna o objeto atualizado. Persiste no banco em background (não bloqueia).
 */
export async function enrichSeries(series: any): Promise<any> {
  const tmdbId = series?.tmdbId;
  if (!tmdbId) return series;
  if (isEnriched(series)) return series;

  const key = cacheKey('series', tmdbId);
  if (recentlyTried(key)) return series;
  enrichedCache.set(key, Date.now());

  try {
    const details = await TMDBService.getSeriesDetails(tmdbId);
    if (!details) return series;

    const poster = details.posterPath ? TMDBService.getPosterUrl(details.posterPath) : series.poster;
    const backdrop = details.backdropPath ? TMDBService.getBackdropUrl(details.backdropPath) : series.backdrop;

    const enriched = {
      ...series,
      poster: poster || series.poster || '',
      backdrop: backdrop || series.backdrop,
      overview: details.overview || series.overview || '',
      genres: details.genres?.length ? details.genres : series.genres || [],
      rating: details.rating || series.rating || 0,
      year: details.year || series.year,
      seasons: details.totalSeasons || series.seasons,
    };

    if (series._id) {
      Series.findByIdAndUpdate(series._id, {
        tmdbId: series.tmdbId || undefined,
        poster: enriched.poster,
        backdrop: enriched.backdrop,
        overview: enriched.overview,
        genres: enriched.genres,
        rating: enriched.rating,
        year: enriched.year,
        seasons: enriched.seasons,
        updatedAt: new Date(),
      }, { runValidators: false }).catch(() => {});
    }

    return enriched;
  } catch (err: any) {
    logger.warn(COMPONENT, `TMDB enrichment failed for series "${series.title}": ${err.message}`);
    return series;
  }
}

/** Enriquece uma lista de filmes em paralelo. */
export async function enrichMovies(items: any[]): Promise<any[]> {
  return Promise.all(items.map((m) => enrichMovie(m)));
}

/** Enriquece uma lista de séries em paralelo. */
export async function enrichSeriesItems(items: any[]): Promise<any[]> {
  return Promise.all(items.map((s) => enrichSeries(s)));
}

/**
 * Busca a capa de um download usando a mídia associada (Movie/Series).
 * Se a mídia ainda não tem capa, tenta enriquecê-la primeiro.
 * Retorna a URL de capa (raw, sem proxy — o chamador aplica fixPosterUrl).
 */
export async function getDownloadPoster(dl: { mediaId?: string; mediaType?: string; title?: string; poster?: string }): Promise<string> {
  if (dl.poster) return dl.poster;

  const mediaId = dl.mediaId;
  if (mediaId) {
    try {
      if (dl.mediaType === 'movie') {
        const movie = await Movie.findById(mediaId);
        if (movie) {
          const enriched = await enrichMovie(movie.toObject());
          return enriched?.poster || '';
        }
      } else if (dl.mediaType === 'series') {
        const series = await Series.findById(mediaId);
        if (series) {
          const enriched = await enrichSeries(series.toObject());
          return enriched?.poster || '';
        }
      }
    } catch { /* fall through to title search */ }
  }

  // Fallback: busca por título no TMDB
  if (dl.title) {
    const baseTitle = (dl.title || '').split(' - ')[0].split('-')[0].trim();
    try {
      const type = dl.mediaType === 'movie' ? 'movie' : 'series';
      const results = type === 'movie'
        ? await TMDBService.searchMovies(baseTitle)
        : await TMDBService.searchSeries(baseTitle);
      const first = results[0];
      if (first && (first as any).posterPath) {
        const url = TMDBService.getPosterUrl((first as any).posterPath);
        if (url) return url;
      }
    } catch { /* ignore */ }
  }

  return '';
}

/**
 * Resolve a MELHOR capa disponível para uma mídia, tentando por ordem:
 * 1. Capa atual do banco (se for URL externa/CDN válida — TMDB)
 * 2. TMDB pelo tmdbId (quando a capa atual é proxy Radarr/Sonarr ou vazia)
 * 3. Busca por título no TMDB
 *
 * Usado pelo endpoint de fallback de capas (GET /api/poster/:mediaType/:id),
 * chamado pelo frontend quando a capa primária retorna 404.
 *
 * @param id Mongo _id (24 hex) OU tmdbId numérico
 * @returns URL da capa (raw, sem proxy — o chamador aplica fixPosterUrl) ou ''
 */
export async function resolvePosterUrl(mediaType: 'movie' | 'series', id: string): Promise<string> {
  const isMongoId = /^[a-f0-9]{24}$/i.test(id);
  const numId = parseInt(id, 10);

  let doc: any = null;
  if (isMongoId) {
    doc = mediaType === 'movie' ? await Movie.findById(id) : await Series.findById(id);
  } else if (!isNaN(numId) && numId > 0) {
    doc = mediaType === 'movie'
      ? await Movie.findOne({ tmdbId: numId })
      : await Series.findOne({ tmdbId: numId });
  }

  // Não está no banco — busca direto no TMDB pelo tmdbId
  if (!doc && !isNaN(numId) && numId > 0) {
    const details = mediaType === 'movie'
      ? await TMDBService.getMovieDetails(numId)
      : await TMDBService.getSeriesDetails(numId);
    return details?.posterPath ? TMDBService.getPosterUrl(details.posterPath) || '' : '';
  }

  if (!doc && isMongoId) {
    const altCollection = mediaType === 'movie' ? Series : Movie;
    doc = await (altCollection as any).findById(id);
  }

  if (!doc) return '';

  const obj = doc.toObject();
  const current = obj.poster || '';

  // Capa atual já é externa/CDN (TMDB, fanart, etc.) — não é proxy quebrado
  const isLocalProxy =
    current.startsWith('/media-api/radarr-cover') || current.startsWith('/api/radarr-cover') ||
    current.startsWith('/media-api/sonarr-cover') || current.startsWith('/api/sonarr-cover') ||
    current.includes('MediaCover');
  if (current && !isLocalProxy) return current;

  // Tenta resolver no TMDB pelo tmdbId e PERSISTE a capa corrigida no banco
  const tryResolve = async (tmdbId?: number): Promise<string> => {
    if (!tmdbId) return '';
    try {
      const details = mediaType === 'movie'
        ? await TMDBService.getMovieDetails(tmdbId)
        : await TMDBService.getSeriesDetails(tmdbId);
      const url = details?.posterPath ? TMDBService.getPosterUrl(details.posterPath) : '';
      if (url) {
        const upd: any = mediaType === 'movie' ? Movie.findByIdAndUpdate : Series.findByIdAndUpdate;
        upd(doc._id, { poster: url, updatedAt: new Date() }).catch(() => {});
      }
      return url || '';
    } catch {
      return '';
    }
  };

  if (obj.tmdbId) {
    const resolved = await tryResolve(obj.tmdbId);
    if (resolved) return resolved;
  }

  // Fallback final: busca por título no TMDB (limpa tokens de qualidade)
  if (obj.title) {
    try {
      const cleanTitle = obj.title
        .replace(/\s+(WEB.?DL|BRRip|BDRip|HDRip|DVDRip|HDTV|WEBRip|BluRay|Remux|x264|x265|HEVC|AAC|DD5\.1|DTS|720p|1080p|2160p|4K|HDR|WEB.?DL|WEBDL)/gi, '')
        .replace(/\s+\[.*?\]/g, '')
        .replace(/\s+\(.*?\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const results = mediaType === 'movie'
        ? await TMDBService.searchMovies(cleanTitle)
        : await TMDBService.searchSeries(cleanTitle);
      const first = results[0];
      if (first && (first as any).tmdbId) {
        const resolved = await tryResolve((first as any).tmdbId);
        if (resolved) return resolved;
      }
    } catch { /* ignore */ }
  }

  return current || '';
}

/** Sincroniza metadados de todos os filmes e séries no banco (startup/manutenção). */
export async function syncAllMetadata(): Promise<{ movies: number; series: number; errors: number }> {
  logger.info(COMPONENT, 'Starting full metadata sync (TMDB)');
  let movies = 0;
  let series = 0;
  let errors = 0;

  const movieDocs = await Movie.find({ tmdbId: { $exists: true } });
  for (const m of movieDocs) {
    try {
      const enriched = await enrichMovie(m.toObject());
      if (enriched?.poster) movies++;
    } catch {
      errors++;
    }
  }

  const seriesDocs = await Series.find({ tmdbId: { $exists: true } });
  for (const s of seriesDocs) {
    try {
      const enriched = await enrichSeries(s.toObject());
      if (enriched?.poster) series++;
    } catch {
      errors++;
    }
  }

  logger.info(COMPONENT, `Metadata sync complete: ${movies} movies, ${series} series, ${errors} errors`);
  return { movies, series, errors };
}

/**
 * Enriquece um item SEM tmdbId via busca por título (e ano, quando disponível).
 * Usado pelo scanner do disco: itens novos ganham capa/sinopse/gêneros/nota.
 * Tenta TMDB primeiro; se não achar, cai no OMDB.
 */
export async function enrichBySearch(item: any, type: 'movie' | 'series'): Promise<any> {
  if (item?.tmdbId) return type === 'movie' ? enrichMovie(item) : enrichSeries(item);
  const title = item?.title;
  if (!title) return item;

  // 1. TMDB
  try {
    const results = type === 'movie'
      ? await TMDBService.searchMovies(title)
      : await TMDBService.searchSeries(title);

    let match: any = results[0];
    if (match && item.year) {
      const byYear = results.find((r: any) => r.year && Math.abs(r.year - item.year) <= 1);
      if (byYear) match = byYear;
    }
    if (match && match.tmdbId) {
      const withId = { ...item, tmdbId: match.tmdbId };
      return type === 'movie' ? enrichMovie(withId) : enrichSeries(withId);
    }
  } catch (err: any) {
    logger.warn(COMPONENT, `TMDB search enrichment failed for "${item.title}": ${err.message}`);
  }

  // 2. Fallback OMDB (apenas filmes por enquanto)
  if (type === 'movie') {
    try {
      const omdb = await OMDBService.searchMovieByTitle(title, item.year);
      if (omdb) {
        const mapped = OMDBService.mapOMDBToMovie(omdb);
        
        // 2a. Se OMDB retornou IMDB ID, tenta achar no TMDB via IMDB ID (match exato)
        let tmdbMatch = null;
        if (mapped.imdbId && mapped.imdbId !== 'N/A') {
          try {
            tmdbMatch = await TMDBService.findByImdbId(mapped.imdbId);
          } catch (e: any) {
            logger.warn(COMPONENT, `TMDB findByImdbId failed for "${title}": ${e.message}`);
          }
        }
        
        // Se achou no TMDB via IMDB ID, enriquece com dados do TMDB
        if (tmdbMatch && tmdbMatch.tmdbId) {
          const withId = { ...item, tmdbId: tmdbMatch.tmdbId };
          return enrichMovie(withId);
        }
        
        // Senão, usa dados do OMDB (sem poster confiável).
        // REGRA: nunca sobrescreve campos já preenchidos (ex: poster de outra fonte).
        const enriched = {
          ...item,
          tmdbId: undefined,
          imdbId: mapped.imdbId,
          title: mapped.title,
          originalTitle: mapped.originalTitle,
          year: mapped.year,
          overview: item.overview || mapped.overview,
          poster: item.poster || '', // preserva poster existente
          backdrop: item.backdrop || '',
          genres: mapped.genres,
          rating: item.rating || mapped.rating,
        };
        if (item._id) {
          const { Movie } = await import('../models/Movie');
          Movie.findByIdAndUpdate(item._id, {
            imdbId: enriched.imdbId,
            title: enriched.title,
            originalTitle: enriched.originalTitle,
            year: enriched.year,
            overview: enriched.overview,
            poster: enriched.poster,
            backdrop: enriched.backdrop,
            genres: enriched.genres,
            rating: enriched.rating,
            updatedAt: new Date(),
          }, { runValidators: false }).catch(() => {});
        }
        return enriched;
      }
    } catch (err: any) {
      logger.warn(COMPONENT, `OMDB fallback failed for "${item.title}": ${err.message}`);
    }
  }

  return item;
}

export async function enrichMovieBySearch(item: any): Promise<any> {
  return enrichBySearch(item, 'movie');
}

export async function enrichSeriesBySearch(item: any): Promise<any> {
  return enrichBySearch(item, 'series');
}

export const MetadataService = {
  enrichMovie,
  enrichMovieFull,
  enrichSeries,
  enrichMovies,
  enrichSeriesItems,
  enrichBySearch,
  enrichMovieBySearch,
  enrichSeriesBySearch,
  getDownloadPoster,
  resolvePosterUrl,
  syncAllMetadata,
};
