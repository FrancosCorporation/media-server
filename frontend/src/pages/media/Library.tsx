// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useEffect, useState, useCallback, useRef } from 'react';
import MediaLayout from '@/components/media/MediaLayout';
import MediaCard from '@/components/media/MediaCard';
import MediaPreviewModal from '@/components/media/MediaPreviewModal';
import MediaPlayerOverlay from '@/components/media/MediaPlayerOverlay';
import { mediaApi } from '@/services/media/api';
import { getCached, setCache, invalidateCache } from '@/services/media/cache';
import { Film, Tv, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useMediaToast } from '@/components/media/MediaToast';
import { useI18n } from '@/i18n';

type Tab = 'all' | 'movies' | 'series';

const CACHE_KEY_MOVIES = 'media_movies';
const CACHE_KEY_SERIES = 'media_series';
const CACHE_KEY_PROGRESS = 'media_progress';
const CACHE_TTL = 5 * 60 * 1000;

export default function MediaLibrary() {
  const toast = useMediaToast();
  const { t } = useI18n();
  const [movies, setMovies] = useState<any[]>(() => getCached<any[]>(CACHE_KEY_MOVIES, CACHE_TTL) || []);
  const [series, setSeries] = useState<any[]>(() => getCached<any[]>(CACHE_KEY_SERIES, CACHE_TTL) || []);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [watchProgresses, setWatchProgresses] = useState<Map<string, any>>(() => getCached<Map<string, any>>(CACHE_KEY_PROGRESS, CACHE_TTL) || new Map());

  const fetchLibrary = useCallback(() => {
    const cachedMovies = getCached<any[]>(CACHE_KEY_MOVIES, CACHE_TTL);
    const cachedSeries = getCached<any[]>(CACHE_KEY_SERIES, CACHE_TTL);
    if (cachedMovies && cachedSeries) {
      setMovies(cachedMovies);
      setSeries(cachedSeries);
      const cachedProgress = getCached<Map<string, any>>(CACHE_KEY_PROGRESS, CACHE_TTL);
      if (cachedProgress) setWatchProgresses(cachedProgress);
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([
      mediaApi.getMovies().catch(() => ({ movies: [] })),
      mediaApi.getSeries().catch(() => ({ series: [] })),
      mediaApi.getWatchProgress().catch(() => ({ progresses: [] })),
    ])
      .then(([moviesRes, seriesRes, progressRes]) => {
        const progressMap = new Map<string, any>();
        (progressRes.progresses || []).forEach((p: any) => { if (p?.mediaId) progressMap.set(p.mediaId, p); });
        setWatchProgresses(progressMap);
        setCache(CACHE_KEY_PROGRESS, progressMap);

        const allMovies = (moviesRes.movies || []).map((m: any) => ({
          ...m,
          watchPercentage: progressMap.get(m._id)?.percentage,
        }));
        const allSeries = (seriesRes.series || []).map((s: any) => ({
          ...s,
          watchPercentage: progressMap.get(s._id)?.percentage,
        }));
        setMovies(allMovies);
        setSeries(allSeries);
        setCache(CACHE_KEY_MOVIES, allMovies);
        setCache(CACHE_KEY_SERIES, allSeries);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  useEffect(() => {
    const fetchLibRef = fetchLibrary;
    const apiBase = import.meta.env.VITE_MEDIA_API_URL || '/dolfimflix/api';
    const wsBase = import.meta.env.VITE_MEDIA_WS_URL || (
      apiBase.startsWith('http')
        ? apiBase.replace(/^http/, 'ws').replace(/\/api$/, '/ws')
        : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
    );

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;
    let ws: WebSocket | null = null;

    function connectWS() {
      if (destroyed) return;
      try {
        ws = new WebSocket(wsBase);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!destroyed) setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'download_update' && data.torrents) {
              invalidateCache(CACHE_KEY_MOVIES);
              invalidateCache(CACHE_KEY_SERIES);
              fetchLibRef();
            }
          } catch { /* ignore */ }
        };

        ws.onclose = () => {
          if (destroyed) return;
          setWsConnected(false);
          reconnectTimer = setTimeout(connectWS, 5000);
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        if (!destroyed) {
          reconnectTimer = setTimeout(connectWS, 5000);
        }
      }
    }

    connectWS();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
      wsRef.current = null;
    };
  }, []);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ item: any; isMovie: boolean } | null>(null);
  const [playingMedia, setPlayingMedia] = useState<{ id: string; type: 'movie' | 'series' } | null>(null);
  const [playingFile, setPlayingFile] = useState<{ path: string; title: string } | null>(null);
  const [playingEpisode, setPlayingEpisode] = useState<{ mediaId: string; streamPath: string; title: string; seasonNumber: number; episodeNumber: number } | null>(null);

  const handleDelete = useCallback(async (id: string, type: 'movie' | 'series') => {
    try {
      if (type === 'movie') {
        await mediaApi.deleteMovie(id);
        setMovies((prev) => prev.filter((m) => m._id !== id));
      } else {
        await mediaApi.deleteSeries(id);
        setSeries((prev) => prev.filter((s) => s._id !== id));
      }
      invalidateCache(type === 'movie' ? CACHE_KEY_MOVIES : CACHE_KEY_SERIES);
    } catch (err: unknown) {
      toast.error(t('dashboard.errorAdding'), err instanceof Error ? err.message : t('dashboard.tryAgain'));
    }
  }, [t]);

  const handleDeleteSelected = useCallback(async () => {
    if (selected.size === 0) return;
    const msg = selected.size === 1
      ? t('library.removeOneConfirm')
      : t('library.removeSelectedConfirm', { count: selected.size });
    if (!window.confirm(msg)) return;
    for (const id of selected) {
      const isMovie = movies.some((m) => m._id === id);
      await handleDelete(id, isMovie ? 'movie' : 'series');
    }
    setSelected(new Set());
  }, [selected, movies, handleDelete, t]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handlePlayEpisode = (mediaId: string, streamPath: string, title: string, seasonNumber: number, episodeNumber: number) => {
    setPlayingEpisode({ mediaId, streamPath, title, seasonNumber, episodeNumber });
    setPreview(null);
  };

  const handleRetry = async (item: any) => {
    const isSeries = item.seasons !== undefined;
    try {
      if (isSeries) {
        await mediaApi.retrySeries(item._id);
      } else {
        await mediaApi.retryMovie(item._id);
      }
      setPreview(null);
      invalidateCache(isSeries ? CACHE_KEY_SERIES : CACHE_KEY_MOVIES);
      fetchLibrary();
      toast.success(t('media.retryStarted'));
    } catch (err: unknown) {
      toast.error(t('media.retryError'), err instanceof Error ? err.message : t('dashboard.tryAgain'));
    }
  };

  const TABS: { id: Tab; labelKey: string; icon: React.ElementType; count: number }[] = [
    { id: 'all', labelKey: 'library.all', icon: Film, count: movies.length + series.length },
    { id: 'movies', labelKey: 'library.movies', icon: Film, count: movies.length },
    { id: 'series', labelKey: 'library.series', icon: Tv, count: series.length },
  ];

  const display = tab === 'all' ? [...movies, ...series] : tab === 'movies' ? movies : series;

  return (
    <MediaLayout>
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">{t('library.title')}</h1>
            <p className="text-gray-400 text-sm mt-1">{t('library.subtitle', { count: movies.length + series.length })}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('w-2 h-2 rounded-full', wsConnected ? 'bg-green-500' : 'bg-yellow-500')} />
            <span className="text-xs text-gray-500">
              {wsConnected ? t('library.realTime') : t('library.updating')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                tab === tabItem.id ? 'bg-sky-600 text-white' : 'bg-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.1]'
              )}
            >
              <tabItem.icon className="w-4 h-4" />
              {t(tabItem.labelKey)} ({tabItem.count})
            </button>
          ))}
          <div className="flex-1" />
          {selected.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              {t('library.remove')} {selected.size > 1 ? `(${selected.size})` : ''}
            </button>
          )}
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

        {!loading && display.length === 0 && (
          <div className="text-center py-20">
            <Film className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400 text-lg mb-1">{t('library.empty')}</p>
            <p className="text-gray-500 text-sm">{t('library.emptyDesc')}</p>
          </div>
        )}

        {display.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {display.map((item: any) => (
              <div key={item._id} className="h-full">
                <MediaCard
                  title={item.title}
                  year={item.year}
                  poster={item.poster}
                  rating={item.rating}
                  status={item.status}
                  genres={item.genres}
                  seasons={item.seasons}
                  mediaType={item.seasons === undefined ? 'movie' : 'series'}
                  mediaId={item._id}
                  tmdbId={item.tmdbId}
                  downloadProgress={item.downloadProgress}
                  downloadSpeed={item.downloadSpeed}
                  size={item.size}
                  sizeFormatted={item.sizeFormatted}
                  downloadEta={item.downloadEta}
                  watchPercentage={item.watchPercentage}
                  selected={selected.has(item._id)}
                  onSelect={() => toggleSelect(item._id)}
                  onDelete={item._id?.length === 24 ? () => handleDelete(item._id, item.seasons !== undefined ? 'series' : 'movie') : undefined}
                  onClick={() => setPreview({ item, isMovie: item.seasons === undefined })}
                  onPlay={item.status === 'available' ? () => {
                    setPreview(null);
                    if (item._id?.length === 24) {
                      setPlayingMedia({ id: item._id, type: item.seasons === undefined ? 'movie' : 'series' });
                    } else if (item.path) {
                      setPlayingFile({ path: item.path, title: item.title });
                    }
                  } : undefined}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {preview && (
        <MediaPreviewModal
          item={preview.item}
          isMovie={preview.isMovie}
          onClose={() => setPreview(null)}
          onPlay={preview.item.status === 'available' ? () => {
            setPreview(null);
            if (preview.item._id?.length === 24) {
              setPlayingMedia({ id: preview.item._id, type: preview.item.seasons === undefined ? 'movie' : 'series' });
            } else if (preview.item.path) {
              setPlayingFile({ path: preview.item.path, title: preview.item.title });
            }
          } : undefined}
          onPlayEpisode={handlePlayEpisode}
          onRetry={preview.item.status === 'error' ? () => handleRetry(preview.item) : undefined}
          watchPercentage={watchProgresses.get(preview.item._id)?.percentage}
        />
      )}

      {playingMedia && (
        <MediaPlayerOverlay
          mediaId={playingMedia.id}
          mediaType={playingMedia.type}
          onClose={() => setPlayingMedia(null)}
        />
      )}

      {playingFile && (
        <MediaPlayerOverlay
          filePath={playingFile.path}
          fileTitle={playingFile.title}
          onClose={() => setPlayingFile(null)}
        />
      )}

      {playingEpisode && (
        <MediaPlayerOverlay
          mediaId={playingEpisode.mediaId}
          episodeStreamPath={playingEpisode.streamPath}
          episodeTitle={playingEpisode.title}
          seasonNumber={playingEpisode.seasonNumber}
          episodeNumber={playingEpisode.episodeNumber}
          onClose={() => setPlayingEpisode(null)}
        />
      )}
    </MediaLayout>
  );
}
