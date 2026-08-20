// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { handleAuthFailure } from '../../lib/mediaSession';

const MEDIA_API = import.meta.env.VITE_MEDIA_API_URL || '/media-api';

/** Valida se o token é um JWT válido (3 partes base64url separadas por ponto). */
function isValidJWT(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  return parts.every(p => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));
}

/** Obtém token válido do localStorage, removendo se inválido. */
export function getValidToken(): string | null {
  const token = localStorage.getItem('media_token');
  if (!token) return null;
  if (!isValidJWT(token)) {
    console.warn('[mediaApi] Token inválido detectado (formato JWT incorreto), removendo:', token.substring(0, 50) + '...');
    localStorage.removeItem('media_token');
    return null;
  }
  return token;
}

/** Base da API de mídia — usada para montar URLs (ex: fallback de capas). */
export const mediaApiBase = MEDIA_API;

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = getValidToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...opts.headers,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${MEDIA_API}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    const errorMsg = data.error || `HTTP ${res.status}`;
    handleAuthFailure(res.status, errorMsg);
    throw new Error(errorMsg);
  }

  return res.json();
}

async function requestOptional<T>(path: string): Promise<T | null> {
  const token = getValidToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${MEDIA_API}${path}`, { headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      handleAuthFailure(res.status, data.error);
      return null;
    }
    return res.json();
  } catch {
    return null;
  }
}

export const mediaApi = {
  login: (username: string, password: string) =>
    request<{ token: string; user: { _id: string; username: string; role: string } }>('/auth/login', {
      method: 'POST',
      body: { username, password },
    }),

  register: (username: string, email: string, password: string) =>
    request<{ token: string; user: { _id: string; username: string; role: string } }>('/auth/register', {
      method: 'POST',
      body: { username, email, password },
    }),

  searchAll: (query: string) =>
    request<{ movies: any[]; series: any[] }>(`/search?q=${encodeURIComponent(query)}`),

  searchMovies: (query: string) =>
    request<{ results: any[] }>(`/movies/search?q=${encodeURIComponent(query)}`),

  addMovie: (tmdbId: number, title: string, year: number, extras?: { poster?: string; overview?: string; genres?: string[]; rating?: number; originalTitle?: string }) =>
    request<{ movie: any }>('/movies', {
      method: 'POST',
      body: { tmdbId, title, year, ...extras },
    }),

  getMovies: () => request<{ movies: any[] }>('/movies'),

  getMovie: (id: string) => request<{ movie: any }>(`/movies/${id}`),

  deleteMovie: (id: string) =>
    request<{ success: boolean }>(`/movies/${id}`, { method: 'DELETE' }),

  grabMovie: (id: string, maxSizeMB = 4096) =>
    request<{ success: boolean; title?: string; sizeMB?: number }>(`/movies/${id}/grab`, {
      method: 'POST',
      body: { maxSizeMB },
    }),

  searchSeries: (query: string) =>
    request<{ results: any[] }>(`/series/search?q=${encodeURIComponent(query)}`),

  addSeries: (tvdbId: number, title: string, year: number, extras?: { poster?: string; overview?: string; genres?: string[]; rating?: number; seasons?: number; tmdbId?: number; originalTitle?: string }) =>
    request<{ series: any }>('/series', {
      method: 'POST',
      body: { tvdbId, title, year, ...extras },
    }),

  deleteDownload: (id: string) =>
    request<{ success: boolean }>(`/downloads/${id}`, { method: 'DELETE' }),

  retryMovie: (id: string) =>
    request<{ success: boolean; movie?: any; message?: string }>(`/movies/${id}/retry`, {
      method: 'POST',
      body: {},
    }),

  retrySeries: (id: string) =>
    request<{ message?: string; seriesId?: string }>(`/series/pipeline/${id}`, {
      method: 'POST',
      body: {},
    }),

  getSeries: () => request<{ series: any[] }>('/series'),

  getSerie: (id: string) => requestOptional<{ series: any }>(`/series/${id}`),

  deleteSeries: (id: string) =>
    request<{ success: boolean }>(`/series/${id}`, { method: 'DELETE' }),

  getDownloads: () => request<{ downloads: any[] }>('/downloads'),

  getLibrary: () => request<{ movies: any[]; series: any[] }>('/library'),

  getLibraryFilesystem: () =>
    request<{ movies: any[]; series: any[]; total: number }>('/library/filesystem'),

  getSettings: () => request<{ settings: any }>('/settings'),

  updateSettings: (settings: any) =>
    request<{ settings: any }>('/settings', {
      method: 'PUT',
      body: settings,
    }),

  getUsers: () => request<{ users: any[] }>('/users'),

  createUser: (data: { username: string; email: string; password: string; role: string }) =>
    request<{ user: any }>('/users', { method: 'POST', body: data }),

  deleteUser: (id: string) =>
    request<{ success: boolean }>(`/users/${id}`, { method: 'DELETE' }),

  getQbittorrentStatus: () =>
    request<{ connected: boolean; message: string; version?: string; configuredUrl: string }>('/qbittorrent/status'),

  testQbittorrent: () =>
    request<{ success: boolean; message: string; torrentCount?: number }>('/qbittorrent/test', { method: 'POST' }),

  getRecommendations: () =>
    request<{ recent: any[]; highlights: any[]; recommended: any[]; stats: { movies: number; series: number; downloads: number } }>('/recommendations'),

  translate: (text: string, from = 'en', to = 'pt-BR') =>
    request<{ translated: string; from: string; to: string }>('/translate', {
      method: 'POST',
      body: { text, from, to },
    }),

  translateMedia: (item: any, to = 'pt-BR') =>
    request<{ item: any }>('/translate/media', {
      method: 'POST',
      body: { item, to },
    }),

  translateBatch: (texts: string[], from = 'en', to = 'pt-BR') =>
    request<{ translated: string[]; from: string; to: string }>('/translate/batch', {
      method: 'POST',
      body: { texts, from, to },
    }),

  // Watch Progress
  getWatchProgress: () =>
    request<{ progresses: any[] }>('/watch-progress'),

  getWatchProgressForMedia: (mediaId: string, seasonNumber?: number, episodeNumber?: number) => {
    let url = `/watch-progress/${mediaId}`;
    const params = new URLSearchParams();
    if (seasonNumber != null) params.set('seasonNumber', String(seasonNumber));
    if (episodeNumber != null) params.set('episodeNumber', String(episodeNumber));
    const qs = params.toString();
    if (qs) url += `?${qs}`;
    return request<{ progress: any }>(url);
  },

  saveWatchProgress: (data: { mediaId: string; mediaType: string; currentTime: number; duration: number; seasonNumber?: number; episodeNumber?: number }) =>
    request<{ progress: any }>('/watch-progress', {
      method: 'POST',
      body: data,
    }),

  deleteWatchProgress: (mediaId: string, seasonNumber?: number, episodeNumber?: number) => {
    let url = `/watch-progress/${mediaId}`;
    const params = new URLSearchParams();
    if (seasonNumber != null) params.set('seasonNumber', String(seasonNumber));
    if (episodeNumber != null) params.set('episodeNumber', String(episodeNumber));
    const qs = params.toString();
    if (qs) url += `?${qs}`;
    return request<{ success: boolean }>(url, { method: 'DELETE' });
  },

  // Series Episodes
  getSeasonEpisodes: (seriesId: string, seasonNumber: number, title?: string) => {
    let url = `/series/${seriesId}/seasons/${seasonNumber}/episodes`;
    if (title) url += `?title=${encodeURIComponent(title)}`;
    return request<{ episodes: any[] }>(url)
      .then(data => ({
        episodes: data.episodes || [],
      }));
  },

  // ── Trending ─────────────────────────────────────────────────────────
  getTrending: () =>
    request<{ trending: any[] }>('/trending'),

  invalidateTrendingCache: () =>
    request<{ success: boolean }>('/trending/invalidate', { method: 'POST' }),

  // ── Debug / Manutenção ───────────────────────────────────────────────────
  /** Relatório de sincronização (duplicatas, capas HTTP, status real) */
  verifySync: (titles?: string[]) =>
    request<{ generatedAt: string; titles: any[] }>(
      `/debug/verify-sync${titles && titles.length ? `?titles=${encodeURIComponent(titles.join(','))}` : ''}`
    ),

  /** Deduplica filmes/séries por tmdbId (dryRun default para inspeção) */
  runDeduplication: (dryRun = true) =>
    request<{ dryRun: boolean; removedMovies: number; removedSeries: number; movies: any[]; series: any[] }>(
      '/debug/maintenance/deduplicate',
      { method: 'POST', body: { dryRun } }
    ),

  /** Remove registros "available" sem arquivo físico (dryRun default) */
  runOrphanCleanup: (dryRun = true) =>
    request<{ dryRun: boolean; removedMovies: number; removedSeries: number; movies: any[]; series: any[] }>(
      '/debug/maintenance/cleanup-orphans',
      { method: 'POST', body: { dryRun } }
    ),

};
