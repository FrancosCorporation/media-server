// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useCallback, useEffect, useRef } from 'react';
import MediaLayout from '@/components/media/MediaLayout';
import MediaCard from '@/components/media/MediaCard';
import MediaPreviewModal from '@/components/media/MediaPreviewModal';
import MediaPlayerOverlay from '@/components/media/MediaPlayerOverlay';
import { mediaApi } from '@/services/media/api';
import { getCached, setCache } from '@/services/media/cache';
import { Search as SearchIcon, Loader2, X, Clock, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { useMediaToast } from '@/components/media/MediaToast';
import { useI18n } from '@/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/hooks/useDebounce';

const CACHE_KEY_MOVIES = 'media_movies';
const CACHE_KEY_SERIES = 'media_series';
const CACHE_TTL = 5 * 60 * 1000;

interface SearchResult {
  id: number;
  title: string;
  year: number;
  poster?: string;
  overview?: string;
  rating?: number;
  genres?: string[];
  seasons?: number;
  type: 'movie' | 'series';
}

export default function Search() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [playingMedia, setPlayingMedia] = useState<{ id: string; type: 'movie' | 'series' } | null>(null);
  const [movieIds, setMovieIds] = useState<Set<number>>(new Set());
  const [seriesIds, setSeriesIds] = useState<Set<number>>(new Set());
  const [movieIdMap, setMovieIdMap] = useState<Map<number, string>>(new Map());
  const [seriesIdMap, setSeriesIdMap] = useState<Map<number, string>>(new Map());
  const [movieLibItems, setMovieLibItems] = useState<Map<number, any>>(new Map());
  const [seriesLibItems, setSeriesLibItems] = useState<Map<number, any>>(new Map());
  const { history, addToHistory, clearHistory, removeFromHistory } = useSearchHistory();
  const debouncedQuery = useDebouncedValue(query, 400);
  const lastSearchedRef = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const toast = useMediaToast();
  const { t } = useI18n();

  const applyLibraryData = useCallback((mMovies: any[], mSeries: any[]) => {
    setMovieIds(new Set(mMovies.map((m: any) => m.tmdbId)));
    setSeriesIds(new Set(mSeries.map((s: any) => s.tvdbId)));
    const mmap = new Map<number, string>();
    const mlib = new Map<number, any>();
    mMovies.forEach((m: any) => { if (m.tmdbId) { mmap.set(m.tmdbId, m._id); mlib.set(m.tmdbId, m); } });
    setMovieIdMap(mmap);
    setMovieLibItems(mlib);
    const smap = new Map<number, string>();
    const slib = new Map<number, any>();
    mSeries.forEach((s: any) => { if (s.tvdbId) { smap.set(s.tvdbId, s._id); slib.set(s.tvdbId, s); } });
    setSeriesIdMap(smap);
    setSeriesLibItems(slib);
  }, []);

  const fetchLibrary = useCallback(async () => {
    const cachedMovies = getCached<any[]>(CACHE_KEY_MOVIES, CACHE_TTL);
    const cachedSeries = getCached<any[]>(CACHE_KEY_SERIES, CACHE_TTL);
    const mMovies = cachedMovies || [];
    const mSeries = cachedSeries || [];

    if (!cachedMovies || !cachedSeries) {
      try {
        const [moviesRes, seriesRes] = await Promise.all([
          mediaApi.getMovies().catch(() => ({ movies: [] })),
          mediaApi.getSeries().catch(() => ({ series: [] })),
        ]);
        const freshMovies = moviesRes.movies || [];
        const freshSeries = seriesRes.series || [];
        setCache(CACHE_KEY_MOVIES, freshMovies);
        setCache(CACHE_KEY_SERIES, freshSeries);
        applyLibraryData(freshMovies, freshSeries);
        return;
      } catch {
        // library unavailable, keep buttons visible
      }
    }
    applyLibraryData(mMovies, mSeries);
  }, []);

  useEffect(() => { fetchLibrary(); }, [fetchLibrary]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    const trimmed = q.trim();
    if (trimmed === lastSearchedRef.current) return;
    lastSearchedRef.current = trimmed;
    setLoading(true);
    setSearched(true);
    setShowSuggestions(false);
    addToHistory(trimmed);
    try {
      const data = await mediaApi.searchAll(trimmed);
      const movies = (data.movies || []).map((m: any) => ({ ...m, type: 'movie' as const }));
      const series = (data.series || []).map((s: any) => ({ ...s, type: 'series' as const }));
      setResults([...movies, ...series]);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [addToHistory]);

  useEffect(() => {
    const dq = debouncedQuery.trim();
    if (dq) doSearch(dq);
  }, [debouncedQuery, doSearch]);

  const handleSearch = useCallback(async () => { await doSearch(query); }, [query, doSearch]);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearched(false);
    inputRef.current?.focus();
  }, []);

  const handleAddMovie = async (movie: SearchResult) => {
    try {
      await mediaApi.addMovie(movie.id, movie.title, movie.year, {
        poster: movie.poster, overview: movie.overview, genres: movie.genres, rating: movie.rating, originalTitle: (movie as any).originalTitle,
      });
      toast.success(t('search.movieAdded'), `${movie.title} (${movie.year}) - ${t('search.movieAddedDesc')}`);
      setMovieIds(prev => new Set(prev).add(movie.id));
    } catch (err: unknown) {
      toast.error(t('search.errorAdding'), err instanceof Error ? err.message : t('search.tryAgain'));
    }
  };

  const handleAddSeries = async (serie: SearchResult) => {
    try {
      await mediaApi.addSeries((serie as any).tvdbId || 0, serie.title, serie.year, {
        poster: serie.poster, overview: serie.overview, genres: serie.genres, rating: serie.rating, seasons: serie.seasons,
        tmdbId: (serie as any).tmdbId, originalTitle: (serie as any).originalTitle,
      });
      toast.success(t('search.seriesAdded'), `${serie.title} (${serie.year}) - ${t('search.seriesAddedDesc')}`);
      setSeriesIds(prev => new Set(prev).add(serie.id));
    } catch (err: unknown) {
      toast.error(t('search.errorAdding'), err instanceof Error ? err.message : t('search.tryAgain'));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  const filteredHistory = query.trim()
    ? history.filter((h) => h.toLowerCase().includes(query.toLowerCase()))
    : history;

  const movies = results.filter(r => r.type === 'movie');
  const series = results.filter(r => r.type === 'series');

  return (
    <MediaLayout>
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">{t('search.title')}</h1>
          <p className="text-gray-400 text-sm mt-1">{t('search.subtitle')}</p>
        </div>

        <div className="flex gap-2 max-w-2xl">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              placeholder={t('search.placeholder')}
              className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white placeholder:text-gray-500 outline-none focus:border-sky-500/50 transition-all text-sm"
            />
            {query && (
              <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            )}

            {showSuggestions && filteredHistory.length > 0 && (
              <div ref={suggestionsRef} className="absolute z-50 top-full mt-2 left-0 right-0 rounded-xl bg-[#1a1a1a] border border-white/10 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                  <span className="text-xs text-gray-500">{t('search.history')}</span>
                  <button onClick={clearHistory} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                    {t('search.clearHistory')}
                  </button>
                </div>
                {filteredHistory.map((h) => (
                  <div
                    key={h}
                    onClick={() => { setQuery(h); setShowSuggestions(false); doSearch(h); }}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/5 transition-colors group"
                  >
                    <Clock className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <span className="text-sm text-gray-300 flex-1 truncate">{h}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFromHistory(h); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('nav.search')}
          </button>
        </div>

        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[2/3] w-full rounded-xl" />
                <Skeleton className="h-3 w-3/4 rounded" />
              </div>
            ))}
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">{t('search.noResults')}</p>
            <p className="text-gray-500 text-sm mt-1">{t('search.noResultsDesc')}</p>
          </div>
        )}

        {movies.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">{t('search.moviesSection')} ({movies.length})</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {movies.map((movie) => {
                const alreadyAdded = movieIds.has(movie.id);
                return (
                  <MediaCard
                    key={`movie-${movie.id}`}
                    title={movie.title}
                    year={movie.year}
                    poster={movie.poster}
                    overview={movie.overview}
                    rating={movie.rating}
                    genres={movie.genres}
                    mediaType="movie"
                    tmdbId={movie.id}
                    onAdd={alreadyAdded ? undefined : () => handleAddMovie(movie)}
                    status={alreadyAdded ? 'available' : undefined}
                    onClick={() => setPreview(movieLibItems.has(movie.id) ? { ...movie, ...movieLibItems.get(movie.id) } : movie)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {series.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">{t('search.seriesSection')} ({series.length})</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {series.map((s) => {
                const alreadyAdded = seriesIds.has(s.id);
                return (
                  <MediaCard
                    key={`series-${s.id}`}
                    title={s.title}
                    year={s.year}
                    poster={s.poster}
                    overview={s.overview}
                    rating={s.rating}
                    genres={s.genres}
                    seasons={s.seasons}
                    mediaType="series"
                    tmdbId={(s as any).tmdbId || s.id}
                    onAdd={alreadyAdded ? undefined : () => handleAddSeries(s)}
                    status={alreadyAdded ? 'available' : undefined}
                    onClick={() => setPreview(seriesLibItems.has(s.id) ? { ...s, ...seriesLibItems.get(s.id) } : s)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {!searched && !loading && (
          <div className="text-center py-20">
            <SearchIcon className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">{t('search.typePlaceholder')}</p>
            <p className="text-gray-500 text-sm mt-1">{t('search.resultsWillAppear')}</p>
          </div>
        )}
      </div>

      {preview && (
        <MediaPreviewModal
          item={preview}
          isMovie={preview.type === 'movie'}
          onClose={() => setPreview(null)}
          added={preview.type === 'movie' ? movieIds.has(preview.id) : seriesIds.has(preview.id)}
          onAdd={preview.type === 'movie'
            ? (movieIds.has(preview.id) ? undefined : () => handleAddMovie(preview))
            : (seriesIds.has(preview.id) ? undefined : () => handleAddSeries(preview))}
          onPlay={(preview.type === 'movie' && movieIds.has(preview.id)) || (preview.type === 'series' && seriesIds.has(preview.id)) ? () => { const mongoId = preview.type === 'movie' ? movieIdMap.get(preview.id) : seriesIdMap.get(preview.id); if (mongoId) { setPreview(null); setPlayingMedia({ id: mongoId, type: preview.type === 'movie' ? 'movie' : 'series' }); } } : undefined}
        />
      )}

      {playingMedia && (
        <MediaPlayerOverlay
          mediaId={playingMedia.id}
          mediaType={playingMedia.type}
          onClose={() => setPlayingMedia(null)}
        />
      )}
    </MediaLayout>
  );
}
