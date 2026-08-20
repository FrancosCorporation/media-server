// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// TrendingScraperService — Busca títulos "Em Alta" de APIs públicas de streaming.
//
// Fonte primária: TMDB (popular movies + popular series) — API pública gratuita.
// Fonte secundária (planejada): scraping de Netflix/Prime quando disponível via
// APIs não-oficiais ou RSS feeds. Por enquanto, TMDB é a fonte confiável.
//
// As tendências são cacheadas por 6h para não sobrecarregar a API do TMDB.

import axios from 'axios';
import { logger } from '../utils/logger';

const COMPONENT = 'TrendingScraper';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h
let cache: { data: any; timestamp: number } | null = null;

const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
  10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
  10767: 'Talk', 10768: 'War & Politics',
};

interface TmdbItem {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  vote_average?: number;
  genre_ids?: number[];
  media_type?: 'movie' | 'tv';
  first_air_date?: string;
  release_date?: string;
}

function mapItem(item: TmdbItem): any {
  const title = item.title || item.name || 'Unknown';
  const date = item.release_date || item.first_air_date || '';
  const year = date ? parseInt(date.slice(0, 4), 10) : undefined;
  const genres = (item.genre_ids || []).slice(0, 3).map(id => TMDB_GENRE_MAP[id] || String(id));
  return {
    tmdbId: item.id,
    mediaType: item.media_type || (String(item.name).length > 0 ? 'tv' : 'movie'),
    title,
    originalTitle: title,
    year,
    poster: item.poster_path ? `${TMDB_IMG_BASE}${item.poster_path}` : '',
    backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : '',
    overview: item.overview || '',
    rating: item.vote_average || 0,
    genres,
    source: 'tmdb_trending',
  };
}

async function fetchTrending(): Promise<any[]> {
  if (!TMDB_API_KEY) {
    logger.warn(COMPONENT, 'TMDB_API_KEY não configurada — tendências desativadas');
    return [];
  }

  const [moviesRes, seriesRes] = await Promise.allSettled([
    axios.get(`${TMDB_BASE}/trending/movie/week`, {
      params: { api_key: TMDB_API_KEY },
      timeout: 15000,
    }),
    axios.get(`${TMDB_BASE}/trending/tv/week`, {
      params: { api_key: TMDB_API_KEY },
      timeout: 15000,
    }),
  ]);

  const movies = moviesRes.status === 'fulfilled'
    ? (moviesRes.value.data.results as TmdbItem[] | undefined)?.map(mapItem) || []
    : [];
  const series = seriesRes.status === 'fulfilled'
    ? (seriesRes.value.data.results as TmdbItem[] | undefined)?.map(mapItem) || []
    : [];

  // Mescla e limita a 20 itens (10 filmes + 10 séries)
  return [...movies.slice(0, 10), ...series.slice(0, 10)];
}

/**
 * Retorna tendências cacheadas. Se cache expirado, refetch em background.
 */
export const TrendingScraperService = {
  async getTrending(): Promise<any[]> {
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
      return cache.data;
    }

    logger.info(COMPONENT, 'Fetching trending (cache miss)');
    try {
      const data = await fetchTrending();
      cache = { data, timestamp: Date.now() };
      return data;
    } catch (err: any) {
      logger.error(COMPONENT, `Failed to fetch trending: ${err.message}`);
      // Retorna cache antigo se disponível mesmo expirado
      return cache?.data || [];
    }
  },

  /** Força invalidação do cache (chamado quando usuário atualiza a página). */
  invalidateCache(): void {
    cache = null;
  },
};
