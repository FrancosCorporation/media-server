// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useMemo } from 'react';
import { cn, formatTitleWithYear } from '@/lib/utils';
import { Star, Download, CheckCircle, AlertCircle, Loader2, Trash2, Play, Clock } from 'lucide-react';
import type { MediaStatus } from '@/types/media';
import { useI18n } from '@/i18n';
import { mediaApiBase } from '@/services/media/api';
import PosterImage from './PosterImage';

interface MediaCardProps {
  title: string;
  year: number;
  poster?: string;
  overview?: string;
  rating?: number;
  status?: MediaStatus;
  genres?: string[];
  seasons?: number;
  mediaType?: string;
  /** Mongo _id da mídia (para fallback de capa via backend) */
  mediaId?: string;
  /** tmdbId da mídia (para fallback de capa via TMDB) */
  tmdbId?: number;
  downloadProgress?: number;
  downloadSpeed?: number;
  downloadEta?: number;
  size?: number;
  sizeFormatted?: string;
  watchPercentage?: number;
  onClick?: () => void;
  onAdd?: () => void;
  onDelete?: () => void;
  onPlay?: () => void;
  selected?: boolean;
  onSelect?: () => void;
  added?: boolean;
  adding?: boolean;
  showOverview?: boolean;
  className?: string;
}

const STATUS_META: Record<MediaStatus, { icon: React.ElementType; className: string }> = {
  available: { icon: CheckCircle, className: 'text-green-400' },
  downloading: { icon: Loader2, className: 'text-yellow-400' },
  error: { icon: AlertCircle, className: 'text-red-400' },
  pending: { icon: Download, className: 'text-blue-400' },
};

const STATUS_LABEL_KEY: Record<MediaStatus, string> = {
  available: 'media.available',
  downloading: 'media.downloading',
  error: 'media.error',
  pending: 'media.pending',
};

export default function MediaCard({
  title,
  year,
  poster,
  overview,
  rating,
  status,
  genres,
  seasons,
  mediaType,
  mediaId,
  tmdbId,
  downloadProgress,
  downloadSpeed,
  downloadEta,
  watchPercentage,
  onClick,
  onAdd,
  onDelete,
  onPlay,
  selected,
  onSelect,
  added,
  adding,
  showOverview = false,
  className,
}: MediaCardProps) {
  const { t, translateGenre } = useI18n();

  const StatusMeta = status ? STATUS_META[status] : null;
  const StatusIcon = StatusMeta?.icon;
  const statusLabel = status && STATUS_LABEL_KEY[status] ? t(STATUS_LABEL_KEY[status]) : '';

  const handleCardClick = () => {
    onClick?.();
  };

  const clickable = !!onClick;

  // Always show genres (max 3)
  const visibleGenres = genres?.slice(0, 3).map((g) => translateGenre(g)) || [];

  // Duration from watchPercentage if available (approx)
  const isSeries = mediaType === 'series' || (seasons && seasons > 0);

  // Fallback automático de capa: se a primária 404, tenta /poster/:type/:id no backend
  // (resolve direto no TMDB pelo tmdbId e persiste a capa corrigida).
  // Passa tanto mediaId (MongoDB _id) quanto tmdbId para o PosterImage tentar ambos na cadeia.
  const posterFallback = useMemo(() => {
    const type = mediaType === 'movie' || mediaType === 'series'
      ? mediaType
      : isSeries ? 'series' : 'movie';
    const isValidMongoId = mediaId && /^[a-f0-9]{24}$/i.test(mediaId);
    const id = isValidMongoId ? mediaId : (tmdbId ? String(tmdbId) : undefined);
    return id && type ? `${mediaApiBase}/poster/${type}/${id}` : undefined;
  }, [mediaId, tmdbId, mediaType, isSeries]);

  return (
    <div
      className={cn(
        'group relative rounded-xl overflow-hidden transition-all duration-300 flex flex-col',
        'bg-[#1a1a1a] border border-white/5 hover:border-white/20',
        clickable ? 'hover:scale-[1.02] hover:shadow-2xl hover:shadow-sky-600/10' : '',
        clickable ? 'cursor-pointer hover:z-10' : '',
        'h-full',
        className
      )}
    >
      {/* Área clicável: poster + informações (exceto botões) */}
      <div onClick={clickable ? handleCardClick : undefined} className="flex-1 flex flex-col min-h-0">
        <div className="aspect-[2/3] overflow-hidden relative flex-shrink-0">
          <PosterImage
            src={poster}
            fallbackSrc={posterFallback}
            mediaId={mediaId}
            tmdbId={tmdbId}
            mediaType={isSeries ? 'series' : 'movie'}
            title={title}
            alt={title}
            containerClassName="w-full h-full"
          />
          {/* Gradiente escuro no poster para legibilidade do texto/ícones */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          
          {/* Checkbox de seleção (Biblioteca) — substitui o status */}
          {onSelect ? (
            <div
              onClick={(e) => { e.stopPropagation(); onSelect(); }}
              className={cn(
                'absolute top-2 left-2 z-20 w-5 h-5 rounded border-2 transition-all cursor-pointer flex items-center justify-center',
                selected
                  ? 'bg-sky-500 border-sky-500'
                  : 'border-white/40 hover:border-white/70 bg-black/30'
              )}
            >
              {selected && (
                <svg className="w-full h-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          ) : StatusIcon ? (
            <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/80 backdrop-blur-sm border border-white/10 text-xs font-medium">
              <StatusIcon className={cn('w-3 h-3', StatusMeta.className)} />
              <span className="capitalize">{statusLabel}</span>
            </div>
          ) : null}

          {/* Rating badge (top-right) */}
          {rating && rating > 0 && (
            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/80 backdrop-blur-sm border border-white/10 text-xs font-medium text-yellow-400">
              <Star className="w-3 h-3 fill-current" />
              <span>{rating.toFixed(1)}</span>
            </div>
          )}

          {/* Progresso de download overlay */}
          {status === 'downloading' && typeof downloadProgress === 'number' && (
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
              <div
                className="h-full bg-sky-500 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, downloadProgress))}%` }}
              />
            </div>
          )}

          {/* Watch progress ring (bottom-left, when available) */}
          {watchPercentage !== undefined && watchPercentage > 0 && status === 'available' && (
            <div className="absolute bottom-2 left-2">
              <svg className="w-10 h-10 transform -rotate-90" viewBox="0 0 40 40">
                <circle
                  cx="20"
                  cy="20"
                  r="18"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="3"
                />
                <circle
                  cx="20"
                  cy="20"
                  r="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 18}
                  strokeDashoffset={2 * Math.PI * 18 * (1 - watchPercentage / 100)}
                  className="text-green-400 transition-all duration-300"
                  style={{ filter: 'drop-shadow(0 0 4px rgba(34, 197, 94, 0.5))' }}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                {Math.round(watchPercentage)}%
              </span>
            </div>
          )}

          {/* Play button — bottom right, only on hover, only if available */}
          {onPlay && status === 'available' && (
            <button
              onClick={(e) => { e.stopPropagation(); onPlay(); }}
              className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-sky-600 hover:border-sky-500 text-white"
              aria-label={t('media.play')}
            >
              <Play className="w-5 h-5 ml-1" />
            </button>
          )}

          {/* Badge de série (bottom-left, quando não tem watch progress) */}
          {isSeries && watchPercentage === undefined && !onPlay && seasons && (
            <div className="absolute bottom-2 left-2 px-2 py-1 rounded-full bg-black/80 backdrop-blur-sm border border-white/10 text-xs font-medium text-white">
              <span>{seasons} {t('media.seasons')}</span>
            </div>
          )}
        </div>

        {/* Info section — altura fixa para uniformidade */}
        <div className="p-3 flex flex-col gap-1.5 min-h-[120px] flex-1">
          {/* Título + Ano */}
          <div className="flex items-start justify-between gap-2 min-h-[40px]">
            <h3 className="font-semibold text-white text-sm leading-tight line-clamp-2 flex-1 pr-2">
              {formatTitleWithYear(title, year)}
            </h3>
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                aria-label={t('media.remove')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Gêneros */}
          {visibleGenres.length > 0 && (
            <div className="flex flex-wrap gap-1 min-h-[20px]">
              {visibleGenres.map((g, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-[10px] font-medium rounded bg-white/5 border border-white/10 text-gray-300 line-clamp-1"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Overview opcional */}
          {showOverview && overview && (
            <p className="text-[11px] text-gray-400 line-clamp-3 leading-relaxed mt-auto">
              {overview}
            </p>
          )}

          {/* Meta info (progresso de download / progresso assistido) */}
          {(status === 'downloading' || (status === 'available' && watchPercentage !== undefined)) && (
            <div className="flex items-center justify-between text-[11px] text-gray-500 mt-auto pt-1 border-t border-white/5">
              {status === 'downloading' && typeof downloadProgress === 'number' && (
                <>
                  <span className="flex items-center gap-1 text-sky-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {Math.round(downloadProgress)}%
                  </span>
                  {downloadSpeed && (
                    <span className="flex items-center gap-1">
                      {(downloadSpeed / 1024 / 1024).toFixed(1)} MB/s
                    </span>
                  )}
                  {downloadEta && downloadEta > 0 && (
                    <span className="flex items-center gap-1">
                      {downloadEta > 3600
                        ? `${Math.floor(downloadEta / 3600)}h ${Math.floor((downloadEta % 3600) / 60)}m`
                        : `${Math.floor(downloadEta / 60)}m`}
                    </span>
                  )}
                </>
              )}
              {status === 'available' && watchPercentage !== undefined && (
                <span className="flex items-center gap-1 text-green-400">
                  <Clock className="w-3 h-3" />
                  {Math.round(watchPercentage)}%
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Botão "Adicionar" (apenas quando não adicionado) — fixo na base */}
      {onAdd && !added && !adding && (
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          className="w-full px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-none transition-colors border-t border-white/5 flex-shrink-0"
        >
          {t('media.add')}
        </button>
      )}

      {/* Estado "Adicionando" */}
      {onAdd && adding && (
        <div className="w-full px-3 py-2 bg-yellow-600/20 text-yellow-400 text-sm font-medium border-t border-white/5 flex items-center justify-center gap-2 flex-shrink-0">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('media.adding')}
        </div>
      )}

      {/* Estado "Adicionado" */}
      {onAdd && added && !adding && (
        <div className="w-full px-3 py-2 bg-green-600/20 text-green-400 text-sm font-medium border-t border-white/5 flex items-center justify-center gap-2 flex-shrink-0">
          <CheckCircle className="w-4 h-4" />
          {t('media.added')}
        </div>
      )}
    </div>
  );
}