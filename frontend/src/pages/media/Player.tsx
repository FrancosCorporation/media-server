// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import MediaLayout from '@/components/media/MediaLayout';
import VideoPlayer from '@/components/media/VideoPlayer';
import { mediaApi } from '@/services/media/api';
import { ArrowLeft, FileVideo, AlertCircle, FolderOpen } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/i18n';

const MEDIA_API = import.meta.env.VITE_MEDIA_API_URL || '/dolfimflix/api';

export default function MediaPlayer() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [media, setMedia] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<'720p' | '1080p'>('1080p');
  const [transcode, setTranscode] = useState(false);
  const [savedProgress, setSavedProgress] = useState<number>(0);
  const [initialDuration, setInitialDuration] = useState<number>(0);
  const [libraryOrder, setLibraryOrder] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [playSpeed, setPlaySpeed] = useState(1);
  const isSeries = media?.type === 'series';

  // Busca a ordem da biblioteca para navegação prev/next
  useEffect(() => {
    mediaApi.getLibrary()
      .then(({ movies, series }: any) => {
        const all = [...(movies || []), ...(series || [])].map((m: any) => m._id);
        setLibraryOrder(all);
        const idx = all.indexOf(id!);
        setCurrentIndex(idx >= 0 ? idx : 0);
      })
      .catch(() => {});
  }, [id]);

  const handleNext = useCallback(() => {
    if (currentIndex < libraryOrder.length - 1) {
      const nextId = libraryOrder[currentIndex + 1];
      navigate(`/dolfimflix/watch/${nextId}`);
    }
  }, [currentIndex, libraryOrder, navigate]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      const prevId = libraryOrder[currentIndex - 1];
      navigate(`/dolfimflix/watch/${prevId}`);
    }
  }, [currentIndex, libraryOrder, navigate]);

  const handleAutoPlayNext = useCallback(() => {
    if (isSeries) handleNext();
  }, [isSeries, handleNext]);

  const buildStreamUrl = useCallback((mediaItem: any, q: '720p' | '1080p', forceTranscode: boolean): string => {
    const token = localStorage.getItem('media_token') || '';
    const tokenParam = `token=${encodeURIComponent(token)}`;

    if (mediaItem.path) {
      if (forceTranscode) {
        return `${MEDIA_API}/stream/${encodeURIComponent(mediaItem.path)}?quality=${q}&transcode=true&${tokenParam}`;
      }
      return `${MEDIA_API}/stream/${encodeURIComponent(mediaItem.path)}?quality=${q}&${tokenParam}`;
    }

    if (mediaItem.type === 'movie') {
      const query = `${mediaItem.title} ${mediaItem.year}`;
      if (forceTranscode) {
        return `${MEDIA_API}/stream/${encodeURIComponent(query)}?quality=${q}&transcode=true&${tokenParam}`;
      }
      return `${MEDIA_API}/stream/${encodeURIComponent(query)}?quality=${q}&${tokenParam}`;
    }

    return '';
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    const qParam = searchParams.get('quality');
    if (qParam === '720p' || qParam === '1080p') setQuality(qParam);

    Promise.allSettled([
      mediaApi.getMovie(id),
      mediaApi.getSerie(id),
    ]).then(([movieResult, seriesResult]) => {
      if (movieResult.status === 'fulfilled' && movieResult.value?.movie) {
        const movie = movieResult.value.movie;
        setMedia({ ...movie, type: 'movie' });
        if (movie.path) {
          fetch(`${MEDIA_API}/stream/duration/${encodeURIComponent(movie.path)}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('media_token') || ''}` }
          })
            .then(r => r.json())
            .then(data => data.duration && setInitialDuration(data.duration))
            .catch(() => {});
        }
      } else if (seriesResult.status === 'fulfilled' && seriesResult.value?.series) {
        const series = seriesResult.value.series;
        setMedia({ ...series, type: 'series' });
        if (series.path) {
          fetch(`${MEDIA_API}/stream/duration/${encodeURIComponent(series.path)}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('media_token') || ''}` }
          })
            .then(r => r.json())
            .then(data => data.duration && setInitialDuration(data.duration))
            .catch(() => {});
        }
      } else {
        setError(t('mediaPlayer.mediaNotFound'));
      }
    }).catch(() => setError(t('mediaPlayer.mediaNotFound')))
      .finally(() => setLoading(false));
  }, [id, searchParams, t]);

  useEffect(() => {
    if (!id) return;
    mediaApi.getWatchProgressForMedia(id)
      .then(({ progress }) => {
        if (progress && !progress.completed) {
          setSavedProgress(progress.currentTime || 0);
        }
      })
      .catch(() => {});
  }, [id]);

  const handleSaveProgress = useCallback((currentTime: number, duration: number) => {
    if (id && media) {
      mediaApi.saveWatchProgress({
        mediaId: id,
        mediaType: media.type,
        currentTime,
        duration,
      }).catch(() => {});
    }
  }, [id, media]);

  const videoSrc = media ? buildStreamUrl(media, quality, transcode) : '';

  const toggleQuality = () => {
    setQuality((prev) => prev === '1080p' ? '720p' : '1080p');
  };

  const toggleTranscode = () => {
    setTranscode((prev) => !prev);
  };

  if (loading) {
    return (
      <MediaLayout>
        <div className="min-h-[60vh] space-y-4">
          <Skeleton className="aspect-video w-full rounded-2xl" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-1/3 rounded" />
            <Skeleton className="h-3 w-1/4 rounded" />
          </div>
        </div>
      </MediaLayout>
    );
  }

  if (error || !media) {
    return (
      <MediaLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <p className="text-gray-400">{error || t('mediaPlayer.mediaNotFound')}</p>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {t('common.back')}
          </button>
        </div>
      </MediaLayout>
    );
  }

  return (
    <MediaLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {t('common.back')}
          </button>

          <div className="flex items-center gap-2">
            {videoSrc && (
              <>
                <button
                  onClick={toggleTranscode}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    transcode
                      ? 'bg-sky-600 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                  title={t('player.forceTranscode')}
                >
                  <FileVideo className="w-3.5 h-3.5 inline mr-1" />
                  {transcode ? t('player.transcoding') : t('player.direct')}
                </button>
                <button
                  onClick={toggleQuality}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-gray-300 hover:bg-white/20 transition-all"
                >
                  {quality}
                </button>
              </>
            )}
          </div>
        </div>

        {videoSrc ? (
          <VideoPlayer
            src={videoSrc}
            title={media.title}
            poster={media.poster}
            mediaId={id}
            mediaType={media.type}
            initialTime={savedProgress}
            initialDuration={initialDuration}
            onProgressSave={handleSaveProgress}
            onBack={() => navigate(-1)}
            onNext={libraryOrder.length > 1 ? handleNext : undefined}
            onPrev={libraryOrder.length > 1 ? handlePrev : undefined}
            hasNext={currentIndex < libraryOrder.length - 1}
            hasPrev={currentIndex > 0}
            speed={playSpeed}
            onSpeedChange={setPlaySpeed}
            onEnded={isSeries ? handleAutoPlayNext : undefined}
          />
        ) : (
          <div className="aspect-video bg-[#1a1a1a] rounded-xl flex flex-col items-center justify-center gap-3">
            <FolderOpen className="w-12 h-12 text-gray-600" />
            <p className="text-gray-400">
              {media.status === 'downloading'
                ? t('mediaPlayer.downloadInProgress')
                : media.status === 'pending'
                  ? t('mediaPlayer.mediaPending')
                  : t('mediaPlayer.videoNotAvailable')}
            </p>
            {media.status === 'downloading' && media.downloadProgress != null && (
              <div className="w-64">
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min(media.downloadProgress, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 text-center mt-1">
                  {media.downloadProgress.toFixed(1)}%
                </p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-white">{media.title}</h1>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            {media.year && <span>{media.year}</span>}
            {media.rating > 0 && <span>★ {media.rating.toFixed(1)}</span>}
            {media.type === 'series' && media.seasons && (
              <span>{media.seasons === 1 ? t('player.season', { count: media.seasons }) : t('player.seasons', { count: media.seasons })}</span>
            )}
            {media.status && (
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                media.status === 'available' ? 'bg-green-500/20 text-green-400' :
                media.status === 'downloading' ? 'bg-yellow-500/20 text-yellow-400' :
                media.status === 'error' ? 'bg-red-500/20 text-red-400' :
                'bg-blue-500/20 text-blue-400'
              }`}>
                {media.status === 'available' ? t('player.statusAvailable') :
                 media.status === 'downloading' ? t('player.statusDownloading') :
                 media.status === 'error' ? t('player.statusError') : t('player.statusPending')}
              </span>
            )}
          </div>
          {media.overview && (
            <p className="text-sm text-gray-300 leading-relaxed max-w-3xl">{media.overview}</p>
          )}
        </div>
      </div>
    </MediaLayout>
  );
}
