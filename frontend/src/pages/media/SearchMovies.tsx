// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useCallback, useEffect, useRef } from 'react';
import MediaLayout from '@/components/media/MediaLayout';
import MediaCard from '@/components/media/MediaCard';
import MediaPreviewModal from '@/components/media/MediaPreviewModal';
import MediaPlayerOverlay from '@/components/media/MediaPlayerOverlay';
import { mediaApi } from '@/services/media/api';
import { Search, Loader2, X, Clock, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { useMediaToast } from '@/components/media/MediaToast';
import { useI18n } from '@/i18n';

export default function SearchMovies() {
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [playingMediaId, setPlayingMediaId] = useState<string | null>(null);
  const [libraryIds, setLibraryIds] = useState<Set<number>>(new Set());
  const [idMap, setIdMap] = useState<Map<number, string>>(new Map());
  const [libItems, setLibItems] = useState<Map<number, any>>(new Map());
  const { history, addToHistory, clearHistory, removeFromHistory } = useSearchHistory();
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const toast = useMediaToast();

  const fetchLibrary = useCallback(async () => {
    try {
      const data = await mediaApi.getMovies();
      const mMovies = data.movies || [];
      setLibraryIds(new Set(mMovies.map((m: any) => m.tmdbId)));
      const mmap = new Map<number, string>();
      const mlib = new Map<number, any>();
      mMovies.forEach((m: any) => { if (m.tmdbId) { mmap.set(m.tmdbId, m._id); mlib.set(m.tmdbId, m); } });
      setIdMap(mmap);
      setLibItems(mlib);
    } catch {
      // library indisponível, mantém botão visível
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      doSearch(q);
    }
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
    setLoading(true);
    setSearched(true);
    setShowSuggestions(false);
    addToHistory(q.trim());
    try {
      const data = await mediaApi.searchMovies(q.trim());
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [addToHistory]);

  const handleSearch = useCallback(async () => {
    await doSearch(query);
  }, [query, doSearch]);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearched(false);
    inputRef.current?.focus();
  }, []);

  const handleAdd = async (tmdbId: number, title: string, year: number, extras?: { poster?: string; overview?: string; genres?: string[]; rating?: number; originalTitle?: string }) => {
    try {
      await mediaApi.addMovie(tmdbId, title, year, extras);
      toast.success(t('searchMovies.movieAdded'), `${title} (${year}) ${t('searchMovies.movieAddedDesc')}`);
      await fetchLibrary();
    } catch (err: unknown) {
      toast.error(t('searchMovies.errorAdding'), err instanceof Error ? err.message : t('searchMovies.tryAgain'));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const filteredHistory = query.trim()
    ? history.filter((h) => h.toLowerCase().includes(query.toLowerCase()))
    : history;

  return (
    <MediaLayout>
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">{t('searchMovies.title')}</h1>
          <p className="text-gray-400 text-sm mt-1">{t('searchMovies.subtitle')}</p>
        </div>

        <div className="flex gap-2 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              placeholder={t('searchMovies.placeholder')}
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
                  <span className="text-xs text-gray-500">{t('searchMovies.history')}</span>
                  <button onClick={clearHistory} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                    {t('searchMovies.clearHistory')}
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
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.search')}
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">{t('searchMovies.noResults')}</p>
            <p className="text-gray-500 text-sm mt-1">{t('searchMovies.noResultsDesc')}</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {results.map((movie: any) => {
              const alreadyAdded = libraryIds.has(movie.id);
              return (
                <MediaCard
                  key={movie.id}
                  title={movie.title}
                  year={movie.year}
                  poster={movie.poster}
                  overview={movie.overview}
                  rating={movie.rating}
                  genres={movie.genres}
                  mediaType="movie"
                  tmdbId={movie.id}
                  onAdd={alreadyAdded ? undefined : () => handleAdd(movie.id, movie.title, movie.year, { poster: movie.poster, overview: movie.overview, genres: movie.genres, rating: movie.rating, originalTitle: movie.originalTitle })}
                  status={alreadyAdded ? 'available' : undefined}
                  onClick={() => setPreview(libItems.has(movie.id) ? { ...movie, ...libItems.get(movie.id) } : movie)}
                />
              );
            })}
          </div>
        )}

        {!searched && !loading && (
          <div className="text-center py-20">
            <Search className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">{t('searchMovies.typePlaceholder')}</p>
            <p className="text-gray-500 text-sm mt-1">{t('searchMovies.resultsWillAppear')}</p>
          </div>
        )}
      </div>

      {preview && (
        <MediaPreviewModal
          item={preview}
          isMovie={true}
          onClose={() => setPreview(null)}
          added={libraryIds.has(preview.id)}
          onAdd={libraryIds.has(preview.id) ? undefined : () => handleAdd(preview.id, preview.title, preview.year, { poster: preview.poster, overview: preview.overview, genres: preview.genres, rating: preview.rating, originalTitle: preview.originalTitle })}
          onPlay={libraryIds.has(preview.id) ? () => { const mongoId = idMap.get(preview.id); if (mongoId) { setPreview(null); setPlayingMediaId(mongoId); } } : undefined}
        />
      )}

      {playingMediaId && (
        <MediaPlayerOverlay
          mediaId={playingMediaId}
          mediaType="movie"
          onClose={() => setPlayingMediaId(null)}
        />
      )}
    </MediaLayout>
  );
}
