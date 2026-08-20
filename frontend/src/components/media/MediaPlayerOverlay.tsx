// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useEffect, useState, useCallback, useRef } from 'react';
import VideoPlayer from './VideoPlayer';
import { mediaApi, getValidToken } from '@/services/media/api';
import { ArrowLeft, Loader2, AlertCircle, FolderOpen, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

const MEDIA_API = import.meta.env.VITE_MEDIA_API_URL || '/dolfimflix/api';

interface MediaPlayerOverlayProps {
  mediaId?: string;
  mediaType?: 'movie' | 'series';
  filePath?: string;
  fileTitle?: string;
  episodeStreamPath?: string;
  episodeTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export default function MediaPlayerOverlay({ mediaId, mediaType, filePath, fileTitle, episodeStreamPath, episodeTitle, seasonNumber, episodeNumber, onClose, onNext, onPrev, hasNext = false, hasPrev = false }: MediaPlayerOverlayProps) {
  const [media, setMedia] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<'720p' | '1080p'>('1080p');
  const [transcode, setTranscode] = useState(false);
  const [savedProgress, setSavedProgress] = useState<number>(0);
  const [mediaDuration, setMediaDuration] = useState<number>(0);
  const [scanning, setScanning] = useState(false);
  const [resolvedEpisode, setResolvedEpisode] = useState<{ streamPath: string; title: string; seasonNumber: number; episodeNumber: number } | null>(null);
  const { t } = useI18n();

  const progressSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaTypeRef = useRef<'movie' | 'series'>('movie');

  const buildStreamUrl = useCallback((mediaItem: any, q: '720p' | '1080p', forceTranscode: boolean): string => {
    const token = localStorage.getItem('media_token') || '';
    const tokenParam = `token=${encodeURIComponent(token)}`;

    if (mediaItem.path) {
      // Detect if path already contains stream prefix to avoid double encoding
      const path = mediaItem.path.startsWith('/api/stream/') || mediaItem.path.startsWith('/media-api/stream/')
        ? mediaItem.path.replace(/^\/media-api/, '').replace(/^\/api/, '')
        : mediaItem.path;
      const streamPath = path.startsWith('/stream/') ? path : `/stream/${encodeURIComponent(path)}`;
      const baseUrl = `${MEDIA_API}${streamPath}`;
      
      if (forceTranscode) {
        return `${baseUrl}?quality=${q}&transcode=true&${tokenParam}`;
      }
      return `${baseUrl}?quality=${q}&${tokenParam}`;
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
    if (episodeStreamPath) {
      setMedia({ title: episodeTitle || t('mediaPlayer.episode'), type: 'series' });
      mediaTypeRef.current = 'series';
      setLoading(false);
      return;
    }

    if (filePath) {
      setMedia({ title: fileTitle || filePath, path: filePath, type: 'movie' });
      mediaTypeRef.current = 'movie';
      setLoading(false);
      return;
    }

    if (!mediaId) return;
    setLoading(true);

    (async () => {
      // Se mediaType foi explicitamente definido, usar apenas esse tipo
      if (mediaType === 'movie') {
        try {
          const movieRes = await mediaApi.getMovie(mediaId);
          if (movieRes?.movie) {
            setMedia({ ...movieRes.movie, type: 'movie' });
            mediaTypeRef.current = 'movie';
            return;
          }
        } catch { /* not a movie */ }
        setError(t('mediaPlayer.mediaNotFound'));
        return;
      }

      if (mediaType === 'series') {
        try {
          const seriesRes = await mediaApi.getSerie(mediaId);
          if (seriesRes?.series) {
            const series = seriesRes.series;
            setMedia({ ...series, type: 'series' });
            mediaTypeRef.current = 'series';
            if (!episodeStreamPath) {
              try {
                const { episodes } = await mediaApi.getSeasonEpisodes(mediaId, 1, series.title);
                const pilot = episodes.find((e: any) => e.episodeNumber === 1) || episodes[0];
                if (pilot?.streamPath) {
                  setResolvedEpisode({
                    streamPath: pilot.streamPath,
                    title: pilot.name || t('mediaPlayer.episode'),
                    seasonNumber: 1,
                    episodeNumber: pilot.episodeNumber || 1,
                  });
                }
              } catch { /* keep series playback fallback */ }
            }
            return;
          }
        } catch { /* not a series */ }
        setError(t('mediaPlayer.mediaNotFound'));
        return;
      }

      // Se mediaType não foi definido, tentar movie primeiro
      try {
        const movieRes = await mediaApi.getMovie(mediaId);
        if (movieRes?.movie) {
          setMedia({ ...movieRes.movie, type: 'movie' });
          mediaTypeRef.current = 'movie';
          return;
        }
      } catch { /* not a movie */ }

      // Só tentar série se não for movie
      try {
        const seriesRes = await mediaApi.getSerie(mediaId);
        if (seriesRes?.series) {
          const series = seriesRes.series;
          setMedia({ ...series, type: 'series' });
          mediaTypeRef.current = 'series';
          if (!episodeStreamPath) {
            try {
              const { episodes } = await mediaApi.getSeasonEpisodes(mediaId, 1, series.title);
              const pilot = episodes.find((e: any) => e.episodeNumber === 1) || episodes[0];
              if (pilot?.streamPath) {
                setResolvedEpisode({
                  streamPath: pilot.streamPath,
                  title: pilot.name || t('mediaPlayer.episode'),
                  seasonNumber: 1,
                  episodeNumber: pilot.episodeNumber || 1,
                });
              }
            } catch { /* keep series playback fallback */ }
          }
          return;
        }
      } catch { /* not a series */ }

      setError(t('mediaPlayer.mediaNotFound'));
    })().finally(() => setLoading(false));
  }, [mediaId, episodeStreamPath, episodeTitle, mediaType, t]);

  useEffect(() => {
    if (!mediaId) return;

    mediaApi.getWatchProgressForMedia(mediaId, resolvedEpisode?.seasonNumber ?? seasonNumber, resolvedEpisode?.episodeNumber ?? episodeNumber)
      .then(({ progress }) => {
        if (progress && !progress.completed) {
          setSavedProgress(progress.currentTime || 0);
        }
      })
      .catch(() => {});
  }, [mediaId, seasonNumber, episodeNumber, resolvedEpisode]);

  // Fetch duration via ffprobe so transcoded streams show total time immediately
  useEffect(() => {
    if (!media) return;
    const token = localStorage.getItem('media_token') || '';
    let path = '';
    if (media.path) {
      path = media.path;
    } else if (media.type === 'movie') {
      path = `${media.title} ${media.year}`;
    }
    if (!path) return;

    fetch(`${MEDIA_API}/stream/duration/${encodeURIComponent(path)}?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => { if (d.duration > 0) setMediaDuration(d.duration); })
      .catch(() => {});
  }, [media]);

  useEffect(() => {
    if (!mediaId || !media) return;

    return () => {
      const videoEl = document.querySelector('video');
      if (videoEl && videoEl.currentTime > 0) {
        // 使用mediaDuration而非videoEl.duration，避免HLS分段duration错误
        const dur = mediaDuration > 0 ? mediaDuration : videoEl.duration;
        if (dur > 0) {
          handleSaveProgress(videoEl.currentTime, dur);
        }
      }
    };
  }, [mediaId, media, seasonNumber, episodeNumber]);

  const handleVideoEnded = useCallback(() => {
    if (mediaId) {
      mediaApi.deleteWatchProgress(mediaId, seasonNumber, episodeNumber).catch(() => {});
    }
  }, [mediaId, seasonNumber, episodeNumber]);

  const handleSaveProgress = useCallback((currentTime: number, duration: number) => {
    if (mediaId) {
      mediaApi.saveWatchProgress({
        mediaId,
        mediaType: mediaTypeRef.current,
        currentTime,
        duration,
        seasonNumber: resolvedEpisode?.seasonNumber ?? seasonNumber,
        episodeNumber: resolvedEpisode?.episodeNumber ?? episodeNumber,
      }).catch(() => {});
    }
  }, [mediaId, seasonNumber, episodeNumber, resolvedEpisode]);

  const handleRescan = useCallback(async () => {
    setScanning(true);
    try {
      const token = localStorage.getItem('media_token') || '';
      await fetch('/api/library/scan', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      }).then(r => r.json());
      setError(null);
      setLoading(true);
      if (mediaId) {
        Promise.allSettled([
          mediaApi.getMovie(mediaId),
          mediaApi.getSerie(mediaId),
        ]).then(([movieResult, seriesResult]) => {
          if (movieResult.status === 'fulfilled' && movieResult.value?.movie) {
            setMedia({ ...movieResult.value.movie, type: 'movie' });
            mediaTypeRef.current = 'movie';
          } else if (seriesResult.status === 'fulfilled' && seriesResult.value?.series) {
            setMedia({ ...seriesResult.value.series, type: 'series' });
            mediaTypeRef.current = 'series';
          } else {
            setError(t('mediaPlayer.mediaNotFound'));
          }
        }).catch(() => setError(t('mediaPlayer.mediaNotFound')))
          .finally(() => setLoading(false));
      }
    } catch {
      setError(t('mediaPlayer.mediaNotFound'));
      setScanning(false);
    }
  }, [mediaId, seasonNumber, episodeNumber, t]);

  const videoSrc = (() => {
    const resolvedStreamPath = resolvedEpisode?.streamPath || episodeStreamPath;
    if (resolvedStreamPath) {
      const token = localStorage.getItem('media_token') || '';
      // Detect if path already contains stream prefix to avoid double encoding
      const path = resolvedStreamPath.startsWith('/api/stream/') || resolvedStreamPath.startsWith('/media-api/stream/')
        ? resolvedStreamPath.replace(/^\/media-api/, '').replace(/^\/api/, '')
        : resolvedStreamPath;
      const streamPath = path.startsWith('/stream/') ? path : `/stream/${encodeURIComponent(path)}`;
      const baseUrl = `${MEDIA_API}${streamPath}`;
      
      if (transcode) {
        return `${baseUrl}?quality=${quality}&transcode=true&token=${encodeURIComponent(token)}`;
      }
      return `${baseUrl}?quality=${quality}&token=${encodeURIComponent(token)}`;
    }
    return media ? buildStreamUrl(media, quality, transcode) : '';
  })();

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const videoEl = document.querySelector('video');
        if (videoEl && videoEl.currentTime > 0) {
          const dur = mediaDuration > 0 ? mediaDuration : videoEl.duration;
          if (dur > 0) {
            handleSaveProgress(videoEl.currentTime, dur);
          }
        }
        onClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose, handleSaveProgress]);

  // Save progress when user closes tab or navigates away
  useEffect(() => {
    const handleBeforeUnload = () => {
      const videoEl = document.querySelector('video');
      if (videoEl && videoEl.currentTime > 0) {
        const dur = mediaDuration > 0 ? mediaDuration : videoEl.duration;
        if (dur > 0) {
          handleSaveProgress(videoEl.currentTime, dur);
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleSaveProgress]);

  return (
    <div className="fixed inset-0 z-[100] bg-black group" onClick={(e) => e.stopPropagation()}>
      {loading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
          <Loader2 className="w-10 h-10 animate-spin text-sky-400" />
          <p className="text-gray-400 text-sm mt-4">{t('mediaPlayer.loading')}</p>
        </div>
       ) : error || !media ? (
         <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-4">
           <AlertCircle className="w-12 h-12 text-red-400" />
           <p className="text-gray-400">{error || t('mediaPlayer.mediaNotFound')}</p>
           <div className="flex items-center gap-3">
             <button
               onClick={onClose}
               className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
             >
               <ArrowLeft className="w-4 h-4" /> {t('common.back')}
             </button>
           </div>
         </div>
       ) : videoSrc ? (
        <div className="absolute inset-0">
            <VideoPlayer
              src={videoSrc}
              title={episodeTitle || resolvedEpisode?.title || media.title}
              poster={media.poster}
              mediaId={media?._id || mediaId}
              mediaType={mediaTypeRef.current}
              onEnded={handleVideoEnded}
              initialTime={savedProgress}
              initialDuration={mediaDuration}
              onProgressSave={handleSaveProgress}
              onBack={onClose}
              onNext={hasNext ? onNext : undefined}
              onPrev={hasPrev ? onPrev : undefined}
              hasNext={hasNext}
              hasPrev={hasPrev}
              speed={1}
              onSpeedChange={() => {}}
            />
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-3">
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
    </div>
  );
}
