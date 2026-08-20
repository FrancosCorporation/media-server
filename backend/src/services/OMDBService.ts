// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import axios from 'axios';
import { logger } from '../utils/logger';

const COMPONENT = 'OMDBService';
const BASE_URL = 'http://www.omdbapi.com/';

let apiKeyCache: string | null = null;
let apiKeyCacheTime = 0;
const API_KEY_CACHE_TTL = 60_000;

async function getApiKey(): Promise<string | null> {
  if (apiKeyCache !== null && Date.now() - apiKeyCacheTime < API_KEY_CACHE_TTL) {
    return apiKeyCache;
  }
  apiKeyCache = process.env.OMDB_API_KEY || null;
  apiKeyCacheTime = Date.now();
  return apiKeyCache;
}

export interface OMDBMovieResult {
  Title: string;
  Year: string;
  Rated: string;
  Released: string;
  Runtime: string;
  Genre: string;
  Director: string;
  Writer: string;
  Actors: string;
  Plot: string;
  Language: string;
  Country: string;
  Awards: string;
  Poster: string;
  Ratings: Array<{ Source: string; Value: string }>;
  Metascore: string;
  imdbRating: string;
  imdbVotes: string;
  imdbID: string;
  Type: string;
  DVD: string;
  BoxOffice: string;
  Production: string;
  Website: string;
  Response: 'True' | 'False';
  Error?: string;
}

async function omdbGet(params: Record<string, string>): Promise<OMDBMovieResult | null> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    logger.warn(COMPONENT, 'OMDB API key not configured');
    return null;
  }

  try {
    const response = await axios.get(BASE_URL, {
      params: { ...params, apikey: apiKey },
      timeout: 8000,
    });
    const data = response.data as OMDBMovieResult;
    if (data.Response === 'False') {
      logger.info(COMPONENT, `OMDB search failed: ${data.Error}`);
      return null;
    }
    return data;
  } catch (err: any) {
    logger.warn(COMPONENT, `OMDB request error: ${err.message}`);
    return null;
  }
}

export async function searchMovieByTitle(title: string, year?: number): Promise<OMDBMovieResult | null> {
  const params: Record<string, string> = { t: title, type: 'movie', plot: 'full' };
  if (year) params.y = String(year);
  return omdbGet(params);
}

export async function searchMovieByImdbId(imdbId: string): Promise<OMDBMovieResult | null> {
  return omdbGet({ i: imdbId, plot: 'full' });
}

function normalizeGenres(genreStr: string): string[] {
  return genreStr.split(',').map(g => g.trim()).filter(Boolean);
}

function extractRating(ratings: OMDBMovieResult['Ratings']): number {
  for (const r of ratings) {
    if (r.Source === 'Internet Movie Database') {
      const match = r.Value.match(/([\d.]+)\/10/);
      if (match) return parseFloat(match[1]);
    }
  }
  return 0;
}

export function mapOMDBToMovie(omdb: OMDBMovieResult): {
  tmdbId?: number;
  imdbId: string;
  title: string;
  originalTitle: string;
  year: number;
  overview: string;
  poster: string;
  backdrop: string;
  genres: string[];
  rating: number;
} {
  const year = parseInt(omdb.Year) || 0;
  return {
    imdbId: omdb.imdbID,
    title: omdb.Title,
    originalTitle: omdb.Title,
    year,
    overview: omdb.Plot || '',
    poster: omdb.Poster && omdb.Poster !== 'N/A' ? omdb.Poster : '',
    backdrop: '',
    genres: normalizeGenres(omdb.Genre),
    rating: extractRating(omdb.Ratings),
  };
}

export const OMDBService = {
  searchMovieByTitle,
  searchMovieByImdbId,
  mapOMDBToMovie,
};