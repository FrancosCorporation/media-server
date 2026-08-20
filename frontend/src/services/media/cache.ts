// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const store = new Map<string, CacheEntry<any>>();

export function getCached<T>(key: string, ttl = DEFAULT_TTL): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttl) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T): void {
  store.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(key?: string): void {
  if (key) {
    store.delete(key);
  } else {
    store.clear();
  }
}

export const CACHE_KEYS = {
  RECOMMENDATIONS: 'recommendations',
  MOVIES: 'movies',
  SERIES: 'series',
  LIBRARY: 'library',
  DOWNLOADS: 'downloads',
  WATCH_PROGRESS: 'watch_progress',
} as const;
