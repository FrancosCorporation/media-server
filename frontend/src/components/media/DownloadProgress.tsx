// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React from 'react';
import { cn } from '@/lib/utils';
import type { DownloadStatus } from '@/types/media';
import { useI18n } from '@/i18n';
import { Play, Trash2, RefreshCw } from 'lucide-react';
import PosterImage from './PosterImage';

interface DownloadProgressProps {
  title: string;
  poster?: string;
  posterFallback?: string;
  status: DownloadStatus;
  progress?: number;
  speed?: number;
  eta?: number;
  seeds?: number;
  peers?: number;
  quality?: string;
  torrentState?: string;
  torrentStateLabel?: string;
  size?: number;
  sizeFormatted?: string;
  mediaId?: string;
  tmdbId?: number;
  mediaType?: 'movie' | 'series';
  onWatch?: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
}

function formatSpeed(bytesPerSec?: number): string {
  if (!bytesPerSec) return '—';
  if (bytesPerSec > 1e6) return `${(bytesPerSec / 1e6).toFixed(1)} MB/s`;
  if (bytesPerSec > 1e3) return `${(bytesPerSec / 1e3).toFixed(1)} KB/s`;
  return `${bytesPerSec.toFixed(0)} B/s`;
}

function formatETA(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  if (seconds > 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds > 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export default function DownloadProgress({
  title, poster, posterFallback, status, progress,
  torrentState, torrentStateLabel,
  onWatch, onDelete, onRetry,
  mediaId, mediaType, tmdbId,
}: DownloadProgressProps) {
  const { t } = useI18n();
  const safeMediaId = mediaId;
  const safeMediaType = mediaType;
  const progressValue = progress ?? 0;
  const isComplete = status === 'complete';
  const isQueued = status === 'queued';
  const isDownloading = status === 'downloading';
  const isError = status === 'error';

  // Sem fontes: travado em stalledDL → mensagem amigável
  const waitingForSources = isDownloading && torrentState === 'stalledDL';

  return (
    <div className={cn(
      'flex items-center gap-4 p-4 rounded-xl border transition-all',
      isComplete ? 'bg-green-500/5 border-green-500/20' :
      isError ? 'bg-red-500/5 border-red-500/20' :
      isQueued ? 'bg-blue-500/5 border-blue-500/20' :
      'bg-white/[0.03] border-white/[0.08]'
    )}>
      <PosterImage
        src={poster}
        fallbackSrc={posterFallback}
        mediaId={safeMediaId}
        tmdbId={tmdbId}
        mediaType={safeMediaType}
        alt=""
        containerClassName="w-20 h-28 rounded-lg shrink-0"
      />
      <div className="flex-1 min-w-0 px-2">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-semibold text-white truncate" title={title}>{title}</h4>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2 flex-wrap">
          {isDownloading && (
            <>
              {waitingForSources ? (
                <span className="font-medium text-yellow-400">{t('downloadStatus.waitingSeeds')}</span>
              ) : torrentState === 'metaDL' ? (
                <span className="font-medium text-blue-400">{t('downloadStatus.downloadingMetadata')}</span>
              ) : (
                <span className="font-medium text-sky-400">{t('downloadStatus.downloading')}</span>
              )}
            </>
          )}
          {isComplete && <span className="text-green-400 font-medium">{t('downloadStatus.completed')}</span>}
          {isQueued && <span className="text-blue-400 font-medium">{t('downloadStatus.inQueue')}</span>}
          {isError && (
            <span className="text-red-400 font-medium">
              {torrentStateLabel ||
                (torrentState === 'noSeeds'
                  ? t('downloadStatus.noSeeds')
                  : torrentState === 'missing'
                    ? t('downloadStatus.missing')
                    : t('downloadStatus.downloadError'))}
            </span>
          )}
        </div>

        {!isComplete && (
          <div className="w-full flex flex-col gap-1">
            <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isQueued ? 'bg-blue-400' : isError ? 'bg-red-500' : 'bg-sky-600'
                )}
                style={{ width: `${isQueued ? 0 : Math.min(progressValue, 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 text-right">
              {isQueued ? t('downloadStatus.waiting') : `${progressValue.toFixed(0)}%`}
            </span>
          </div>
        )}
      </div>

      {/* Ações */}
      {isComplete && onWatch && (
        <button
          onClick={onWatch}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-all shrink-0 shadow-lg shadow-sky-600/20"
        >
          <Play className="w-4 h-4 fill-white" />
          {t('media.play')}
        </button>
      )}
      {isError && onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-500 text-white text-sm font-semibold transition-all shrink-0 shadow-lg shadow-red-600/20"
        >
          <RefreshCw className="w-4 h-4" />
          {t('downloadStatus.retry')}
        </button>
      )}
      {onDelete && !isComplete && (
        <button
          onClick={onDelete}
          className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
          aria-label={t('library.remove')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}