// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import axios from 'axios';
import { logger } from '../utils/logger';

const COMPONENT = 'TMDBService';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

let apiKeyCache: string | null = null;
let apiKeyCacheTime = 0;
const API_KEY_CACHE_TTL = 60_000;

async function getApiKey(): Promise<string | null> {
  if (apiKeyCache !== null && Date.now() - apiKeyCacheTime < API_KEY_CACHE_TTL) {
    return apiKeyCache;
  }
  const { Settings } = await import('../models/Settings');
  const s = await Settings.findOne();
  apiKeyCache = s?.tmdbApiKey || process.env.TMDB_API_KEY || null;
  apiKeyCacheTime = Date.now();
  return apiKeyCache;
}

async function tmdbGet(endpoint: string, params: Record<string, string> = {}, retries = 2): Promise<any> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    logger.warn(COMPONENT, 'TMDB API key not configured');
    return null;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data } = await axios.get(`${BASE_URL}${endpoint}`, {
        params: { api_key: apiKey, language: 'pt-BR', ...params },
        timeout: 10000,
      });
      return data;
    } catch (err: any) {
      if (err.response?.status === 404) {
        return null;
      }
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        logger.warn(COMPONENT, `TMDB request failed after ${retries + 1} attempts: ${err.message}`);
        return null;
      }
      // Exponential backoff: 500ms, 1500ms
      const delay = 500 * Math.pow(3, attempt);
      logger.warn(COMPONENT, `TMDB request attempt ${attempt + 1} failed, retrying in ${delay}ms: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return null;
}

export interface TMDBSeriesResult {
  tmdbId: number;
  name: string;           // Título canônico (inglês)
  originalName: string;   // Título original
  year: number;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  genres: string[];
  rating: number;
  seasons: TMDBSeason[];
  totalSeasons: number;
  totalEpisodes: number;
}

export interface TMDBSeason {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
}

export interface TMDBMovieResult {
  tmdbId: number;
  title: string;
  originalTitle: string;
  year: number;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  genres: string[];
  rating: number;
}

export interface TMDBEpisode {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  airDate: string | null;
}

/**
 * Busca séries no TMDB por título.
 * Retorna resultados com IDs canônicos, seasons e metadados completos.
 */
export async function searchSeries(query: string): Promise<TMDBSeriesResult[]> {
  const data = await tmdbGet('/search/tv', { query });
  if (!data?.results) return [];

  return data.results.slice(0, 10).map((s: any) => ({
    tmdbId: s.id,
    name: s.name,
    originalName: s.original_name,
    year: s.first_air_date ? parseInt(s.first_air_date.substring(0, 4)) : 0,
    overview: s.overview || '',
    posterPath: s.poster_path,
    backdropPath: s.backdrop_path,
    genres: [], // Precisa de chamada separada
    rating: s.vote_average || 0,
    seasons: [],
    totalSeasons: s.number_of_seasons || 0,
    totalEpisodes: s.number_of_episodes || 0,
  }));
}

/**
 * Busca detalhes completos de uma série (incluindo temporadas/episódios).
 */
export async function getSeriesDetails(tmdbId: number): Promise<TMDBSeriesResult | null> {
  const data = await tmdbGet(`/tv/${tmdbId}`);
  if (!data) return null;

  return {
    tmdbId: data.id,
    name: data.name,
    originalName: data.original_name,
    year: data.first_air_date ? parseInt(data.first_air_date.substring(0, 4)) : 0,
    overview: data.overview || '',
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    genres: (data.genres || []).map((g: any) => g.name),
    rating: data.vote_average || 0,
    seasons: (data.seasons || [])
      .filter((s: any) => s.season_number > 0) // Exclui especials (season 0)
      .map((s: any) => ({
        seasonNumber: s.season_number,
        name: s.name,
        episodeCount: s.episode_count,
        airDate: s.air_date,
      })),
    totalSeasons: data.number_of_seasons || 0,
    totalEpisodes: data.number_of_episodes || 0,
  };
}

/**
 * Busca detalhes completos de um filme (incluindo gêneros, sinopse e nota).
 */
export async function getMovieDetails(tmdbId: number): Promise<TMDBMovieResult | null> {
  const data = await tmdbGet(`/movie/${tmdbId}`);
  if (!data) return null;

  return {
    tmdbId: data.id,
    title: data.title,
    originalTitle: data.original_title,
    year: data.release_date ? parseInt(data.release_date.substring(0, 4)) : 0,
    overview: data.overview || '',
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    genres: (data.genres || []).map((g: any) => g.name),
    rating: data.vote_average || 0,
  };
}

/**
 * Busca episódios de uma temporada específica.
 */
export async function getSeasonEpisodes(tmdbId: number, seasonNumber: number): Promise<TMDBEpisode[]> {
  const data = await tmdbGet(`/tv/${tmdbId}/season/${seasonNumber}`);
  if (!data?.episodes) return [];

  return data.episodes.map((e: any) => ({
    seasonNumber: e.season_number,
    episodeNumber: e.episode_number,
    name: e.name,
    airDate: e.air_date,
  }));
}

/**
 * Busca filmes no TMDB por título.
 */
export async function searchMovies(query: string, year?: number): Promise<TMDBMovieResult[]> {
  const params: Record<string, string> = { query };
  if (year) params.year = String(year);
  const data = await tmdbGet('/search/movie', params);
  if (!data?.results) return [];

  return data.results.slice(0, 10).map((m: any) => ({
    tmdbId: m.id,
    title: m.title,
    originalTitle: m.original_title,
    year: m.release_date ? parseInt(m.release_date.substring(0, 4)) : 0,
    overview: m.overview || '',
    posterPath: m.poster_path,
    backdropPath: m.backdrop_path,
    genres: [],
    rating: m.vote_average || 0,
  }));
}

/**
 * Retorna URL do poster.
 */
export function getPosterUrl(posterPath: string | null, size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500'): string | null {
  if (!posterPath) return null;
  return `${IMAGE_BASE}/${size}${posterPath}`;
}

/**
 * Retorna URL do backdrop.
 */
export function getBackdropUrl(backdropPath: string | null, size: 'w300' | 'w780' | 'w1280' | 'original' = 'w1280'): string | null {
  if (!backdropPath) return null;
  return `${IMAGE_BASE}/${size}${backdropPath}`;
}

/**
 * Busca o tvdbId de uma série via external_ids do TMDB.
 * Usado quando o tvdbId não foi resolvido (ex.: busca em português).
 */
export async function getExternalIds(tmdbId: number): Promise<{ tvdbId: number | null; imdbId: string | null } | null> {
  const data = await tmdbGet(`/tv/${tmdbId}/external_ids`);
  if (!data) return null;
  return {
    tvdbId: data.tvdb_id || null,
    imdbId: data.imdb_id || null,
  };
}

/**
 * Busca filme/série no TMDB via IMDB ID (exato).
 * Usa endpoint /find/{imdb_id} com external_source=imdb_id.
 * Depois busca detalhes completos via /movie/{id} ou /tv/{id}.
 */
export async function findByImdbId(imdbId: string): Promise<{ tmdbId: number; type: 'movie' | 'tv'; title: string; overview: string; posterPath: string | null; year: number } | null> {
  const data = await tmdbGet(`/find/${imdbId}`, { external_source: 'imdb_id' });
  if (!data) return null;
  
  // Prioriza movie, depois tv
  const movie = data.movie_results?.[0];
  const tv = data.tv_results?.[0];
  const result = movie || tv;
  
  if (!result) return null;
  
  // Busca detalhes completos (overview, poster, etc.)
  let fullDetails = null;
  if (movie) {
    fullDetails = await tmdbGet(`/movie/${result.id}`, { append_to_response: 'external_ids' });
  } else if (tv) {
    fullDetails = await tmdbGet(`/tv/${result.id}`, { append_to_response: 'external_ids' });
  }
  
  const details = fullDetails || result;
  
  return {
    tmdbId: details.id,
    type: movie ? 'movie' : 'tv',
    title: movie ? details.title : details.name,
    overview: details.overview || '',
    posterPath: details.poster_path || null,
    year: movie 
      ? (details.release_date ? parseInt(details.release_date.substring(0, 4)) : 0)
      : (details.first_air_date ? parseInt(details.first_air_date.substring(0, 4)) : 0),
  };
}

export const TMDBService = {
  searchSeries,
  getSeriesDetails,
  getSeasonEpisodes,
  searchMovies,
  getMovieDetails,
  getExternalIds,
  findByImdbId,
  getPosterUrl,
  getBackdropUrl,
};
