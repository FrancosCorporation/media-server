// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useEffect, useState, useCallback } from 'react';
import MediaLayout from '@/components/media/MediaLayout';
import MediaCard from '@/components/media/MediaCard';
import MediaPreviewModal from '@/components/media/MediaPreviewModal';
import MediaPlayerOverlay from '@/components/media/MediaPlayerOverlay';
import { useMediaToast } from '@/components/media/MediaToast';
import { mediaApi } from '@/services/media/api';
import { getCached, setCache, invalidateCache } from '@/services/media/cache';
import { Film, Tv, Play, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

type Tab = 'continue' | 'notWatched';

const CACHE_KEY_MOVIES = 'media_movies';
const CACHE_KEY_SERIES = 'media_series';
const CACHE_KEY_PROGRESS = 'media_progress';
const CACHE_TTL = 5 * 60 * 1000;

export default function Watch() {
  const { t } = useI18n();
  const toast = useMediaToast();
  const [activeTab, setActiveTab] = useState<Tab>('continue');
  const [movies, setMovies] = useState<any[]>(() => {
    const cached = getCached<any[]>(CACHE_KEY_MOVIES, CACHE_TTL);
    return cached || [];
  });
  const [series, setSeries] = useState<any[]>(() => {
    const cached = getCached<any[]>(CACHE_KEY_SERIES, CACHE_TTL);
    return cached || [];
  });
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ item: any; isMovie: boolean } | null>(null);
  const [playingMedia, setPlayingMedia] = useState<{ id: string; type: 'movie' | 'series' } | null>(null);
  const [playingFile, setPlayingFile] = useState<{ path: string; title: string } | null>(null);
  const [playingEpisode, setPlayingEpisode] = useState<{ mediaId: string; streamPath: string; title: string; seasonNumber: number; episodeNumber: number } | null>(null);
  const [watchProgresses, setWatchProgresses] = useState<Map<string, any>>(() => {
    const cached = getCached<Map<string, any>>(CACHE_KEY_PROGRESS, CACHE_TTL);
    return cached || new Map();
  });

  const fetchData = useCallback(() => {
    const cachedMovies = getCached<any[]>(CACHE_KEY_MOVIES, CACHE_TTL);
    const cachedSeries = getCached<any[]>(CACHE_KEY_SERIES, CACHE_TTL);
    if (cachedMovies && cachedSeries) {
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

  useEffect(() => { fetchData(); }, [fetchData]);

  const allMedia = [...movies, ...series];

  const continueWatching = allMedia
    .filter((m: any) => m.watchPercentage != null && m.watchPercentage > 0 && m.watchPercentage < 90)
    .sort((a: any, b: any) => {
      const pa = watchProgresses.get(a._id);
      const pb = watchProgresses.get(b._id);
      return new Date(pb?.lastWatched || 0).getTime() - new Date(pa?.lastWatched || 0).getTime();
    });

  const continueIds = new Set(continueWatching.map((m: any) => m._id));
  const notWatched = allMedia.filter((m: any) => !continueIds.has(m._id));

  const handlePlay = (item: any) => {
    setPreview(null);
    if (item._id?.length === 24) {
      setPlayingMedia({ id: item._id, type: item.seasons === undefined ? 'movie' : 'series' });
    } else if (item.path) {
      setPlayingFile({ path: item.path, title: item.title });
    }
  };

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
      invalidateCache();
      fetchData();
      toast.success(t('media.retryStarted'));
    } catch (err: unknown) {
      toast.error(t('media.retryError'), err instanceof Error ? err.message : t('dashboard.tryAgain'));
    }
  };

  const display = activeTab === 'continue' ? continueWatching : notWatched;

  return (
    <MediaLayout>
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">{t('watch.title')}</h1>
          <p className="text-gray-400 text-sm mt-1">{t('watch.subtitle')}</p>
        </div>

        <div className="flex gap-2 border-b border-white/10 pb-px">
          <button
            onClick={() => setActiveTab('continue')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px',
              activeTab === 'continue'
                ? 'text-sky-400 border-b-2 border-sky-400 bg-white/[0.03]'
                : 'text-gray-500 hover:text-gray-300'
            )}
          >
            <Clock className="w-4 h-4" />
            {t('watch.continueWatching')}
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full',
              activeTab === 'continue' ? 'bg-sky-500/20 text-sky-300' : 'bg-white/10 text-gray-500'
            )}>
              {continueWatching.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('notWatched')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px',
              activeTab === 'notWatched'
                ? 'text-green-400 border-b-2 border-green-400 bg-white/[0.03]'
                : 'text-gray-500 hover:text-gray-300'
            )}
          >
            <Play className="w-4 h-4" />
            {t('watch.notWatched')}
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full',
              activeTab === 'notWatched' ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-gray-500'
            )}>
              {notWatched.length}
            </span>
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

        {!loading && display.length > 0 && (
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
                  mediaType={item.tmdbId ? 'series' : (item.seasons === undefined ? 'movie' : 'series')}
                  mediaId={item._id}
                  tmdbId={item.tmdbId}
                  downloadProgress={item.downloadProgress}
                  downloadSpeed={item.downloadSpeed}
                  size={item.size}
                  sizeFormatted={item.sizeFormatted}
                  downloadEta={item.downloadEta}
                  watchPercentage={item.watchPercentage}
                  onClick={() => setPreview({ item, isMovie: item.seasons === undefined })}
                  onPlay={item.status === 'available' ? () => handlePlay(item) : undefined}
                />
              </div>
            ))}
          </div>
        )}

        {!loading && display.length === 0 && (
          <div className="text-center py-20">
            <Play className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400 text-lg mb-1">
              {activeTab === 'continue' ? t('watch.nothingContinue') : t('watch.nothingAvailable')}
            </p>
            <p className="text-gray-500 text-sm">
              {activeTab === 'continue' ? t('watch.nothingContinueDesc') : t('watch.nothingAvailableDesc')}
            </p>
          </div>
        )}
      </div>

      {preview && (
        <MediaPreviewModal
          item={preview.item}
          isMovie={!preview.item.tmdbId && preview.item.seasons === undefined}
          onClose={() => setPreview(null)}
          onPlay={preview.item.status === 'available' ? () => handlePlay(preview.item) : undefined}
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
