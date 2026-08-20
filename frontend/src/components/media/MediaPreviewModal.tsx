// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useCallback } from 'react';
import { X, Star, Calendar, Film, Tv, Play, ChevronDown, ChevronRight, Loader2, Download, CheckCircle, AlertCircle, RotateCcw } from 'lucide-react';
import { cn, formatTitleWithYear } from '@/lib/utils';
import { mediaApi, mediaApiBase } from '@/services/media/api';
import { useI18n } from '@/i18n';
import PosterImage from './PosterImage';

interface MediaPreviewItem {
  _id?: string;
  id?: number;
  tmdbId?: number;
  title: string;
  year: number;
  poster?: string;
  backdrop?: string;
  overview?: string;
  rating?: number;
  genres?: string[];
  seasons?: number;
  status?: string;
  runtime?: number;
  type?: 'movie' | 'series';
}

interface MediaPreviewModalProps {
  item: MediaPreviewItem;
  isMovie: boolean;
  onClose: () => void;
  onPlay?: () => void;
  onAdd?: () => void;
  onRetry?: () => void;
  onDelete?: () => void;
  added?: boolean;
  onPlayEpisode?: (mediaId: string, streamPath: string, title: string, seasonNumber: number, episodeNumber: number) => void;
  watchPercentage?: number;
}

const STATUS_LABEL_KEY: Record<string, string> = {
  available: 'media.available',
  downloading: 'media.downloading',
  error: 'media.error',
  pending: 'media.pending',
};

export default function MediaPreviewModal({ item, isMovie, onClose, onPlay, onAdd, onRetry, onDelete, added, onPlayEpisode, watchPercentage }: MediaPreviewModalProps) {
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [seasonEpisodes, setSeasonEpisodes] = useState<Map<number, any[]>>(new Map());
  const [loadingEpisodes, setLoadingEpisodes] = useState<number | null>(null);
  const { t, translateGenre } = useI18n();

  const seriesId = item._id || item.id || item.tmdbId;

  const fetchEpisodes = useCallback(async (seasonNumber: number) => {
    if (seasonEpisodes.has(seasonNumber) || !seriesId) return;
    setLoadingEpisodes(seasonNumber);
    try {
      const data = await mediaApi.getSeasonEpisodes(String(seriesId), seasonNumber, item.title);
      setSeasonEpisodes(prev => new Map(prev).set(seasonNumber, data.episodes || []));
    } catch {
      setSeasonEpisodes(prev => new Map(prev).set(seasonNumber, []));
    } finally {
      setLoadingEpisodes(null);
    }
  }, [seriesId, seasonEpisodes, item.title]);

  const toggleSeason = useCallback((season: number) => {
    if (expandedSeason === season) {
      setExpandedSeason(null);
    } else {
      setExpandedSeason(season);
      fetchEpisodes(season);
    }
  }, [expandedSeason, fetchEpisodes]);

  const isAvailable = item.status === 'available';
  const statusLabel = item.status ? t(STATUS_LABEL_KEY[item.status] || 'media.pending') : '';

  const backdropSrc = item.backdrop || item.poster;

  // Fallback de capa: resolve via backend (TMDB) quando o poster está vazio/quebrado
  // Passa tanto _id (MongoDB ObjectId) quanto tmdbId para o PosterImage tentar ambos na cadeia.
  const posterFallback = (() => {
    const isValidMongoId = item._id && /^[a-f0-9]{24}$/i.test(item._id);
    const id = isValidMongoId ? item._id : (item.tmdbId || item.id);
    return id ? `${mediaApiBase}/poster/${isMovie ? 'movie' : 'series'}/${id}` : undefined;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho com backdrop — fixo */}
        {backdropSrc && (
          <div className="relative h-40 sm:h-52 shrink-0 overflow-hidden">
            <img
              src={backdropSrc}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/60 to-transparent" />
          </div>
        )}
        {!backdropSrc && (
          <div className="relative h-32 shrink-0 overflow-hidden bg-white/5 flex items-center justify-center">
            <Film className="w-10 h-10 text-gray-600" />
          </div>
        )}

        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors z-10"
          aria-label={t('common.close')}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto">
          <div className={cn('p-5 sm:p-6', !backdropSrc && 'pt-5')}>
            <div className="flex gap-5">
              {/* Poster — proporção fixa 2/3 para nunca esticar */}
              <div className="w-24 sm:w-28 shrink-0 -mt-16 relative z-10 self-start">
                <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-lg border border-white/10">
                  <PosterImage
                    src={item.poster}
                    fallbackSrc={posterFallback}
                    mediaId={item._id}
                    tmdbId={item.tmdbId}
                    mediaType={isMovie ? 'movie' : 'series'}
                    alt={item.title}
                    containerClassName="w-full h-full"
                  />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-white leading-tight">{formatTitleWithYear(item.title, item.year)}</h2>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                      {item.runtime && (
                        <span className="flex items-center gap-1">
                          <span>{item.runtime} {t('common.min')}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        {isMovie ? <Film className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
                        {isMovie ? t('media.movie') : t('media.series')}
                      </span>
                    </div>
                  </div>
                  {item.rating && item.rating > 0 && (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yellow-500/10 shrink-0">
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      <span className="text-sm font-semibold text-yellow-500">{item.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                {item.genres && item.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {item.genres.map((g) => (
                      <span key={g} className="px-2.5 py-1 rounded-full text-xs bg-white/5 text-gray-300">
                        {translateGenre(g)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Status + ações */}
                <div className="mt-4 flex gap-3 flex-wrap items-center">
                  {isAvailable && onPlay && (
                    <button
                      onClick={onPlay}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-all shadow-lg shadow-sky-600/20"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      {watchPercentage != null && watchPercentage > 0 ? t('media.continuePercent', { percent: Math.round(watchPercentage) }) : t('media.play')}
                    </button>
                  )}
                  {onAdd && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onAdd(); }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-all border border-white/10"
                    >
                      <Download className="w-4 h-4" /> {t('media.addToLibrary')}
                    </button>
                  )}
                  {added && (
                    <button
                      disabled
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-500/20 text-green-400 text-sm font-medium border border-green-500/30 cursor-default"
                    >
                      <CheckCircle className="w-4 h-4" /> {t('media.added')}
                    </button>
                  )}
                  {onRetry && !isAvailable && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onRetry(); }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 text-sm font-medium border border-amber-600/30 transition-all"
                    >
                      <RotateCcw className="w-4 h-4" /> {t('media.retry')}
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(); }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium border border-red-500/20 transition-all"
                    >
                      {t('library.remove')}
                    </button>
                  )}
                </div>

                {item.status && (
                  <div className={cn('mt-3 flex items-center gap-2 text-sm', isAvailable ? 'text-green-400' : item.status === 'error' ? 'text-red-400' : item.status === 'downloading' ? 'text-yellow-400' : 'text-blue-400')}>
                    {item.status === 'downloading' ? <Loader2 className="w-4 h-4 animate-spin" /> : item.status === 'error' ? <AlertCircle className="w-4 h-4" /> : item.status === 'available' ? <CheckCircle className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                    <span className="capitalize">{statusLabel}</span>
                  </div>
                )}

                {!isMovie && item.seasons !== undefined && item.seasons > 0 && (
                  <p className="text-sm text-gray-400 mt-2">
                    {item.seasons} {item.seasons !== 1 ? t('media.seasons') : t('media.season')}
                  </p>
                )}

                {item.overview && (
                  <p className="text-sm text-gray-300 leading-relaxed mt-3">
                    {item.overview}
                  </p>
                )}

                {/* Seasons & Episodes para séries — sempre visíveis */}
                {!isMovie && item.seasons && item.seasons > 0 && (
                  <div className="mt-5 pt-4 border-t border-white/10 space-y-1">
                    <p className="text-xs text-gray-500 mb-2">{t('media.seasonAndEpisodes')}</p>
                    {Array.from({ length: item.seasons }, (_, i) => i + 1).map((season) => (
                      <div key={season}>
                        <button
                          onClick={() => toggleSeason(season)}
                          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-white/5 transition-colors"
                        >
                          {expandedSeason === season ? (
                            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <Tv className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          <span>{t('media.season')} {season}</span>
                        </button>
                        {expandedSeason === season && (
                          <div className="ml-8 space-y-0.5">
                            {loadingEpisodes === season ? (
                              <div className="flex items-center gap-2 px-3 py-2">
                                <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                                <span className="text-xs text-gray-500">{t('media.loading')}</span>
                              </div>
                            ) : (seasonEpisodes.get(season) || []).length > 0 ? (
                              <>
                                {!isAvailable && (
                                  <p className="text-xs text-yellow-400/80 px-3 py-1.5">
                                    {t('media.episodesAfterDownload')}
                                  </p>
                                )}
                                {seasonEpisodes.get(season)!.map((ep: any) => (
                                  <button
                                    key={ep.episodeNumber}
                                    disabled={!isAvailable}
                                    onClick={() => isAvailable && onPlayEpisode && seriesId && onPlayEpisode(
                                      String(seriesId),
                                      ep.streamPath || `/api/stream/series/${seriesId}/S${String(season).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`,
                                      `S${String(season).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} - ${ep.name || ''}`,
                                      season,
                                      ep.episodeNumber
                                    )}
                                    className={cn(
                                      'flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-gray-400 transition-colors',
                                      isAvailable ? 'hover:text-white hover:bg-white/5 cursor-pointer' : 'opacity-60 cursor-not-allowed'
                                    )}
                                  >
                                    <Play className={cn('w-3 h-3 shrink-0', isAvailable ? '' : 'text-gray-600')} />
                                    <span>S{String(season).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}</span>
                                    {ep.name && <span className="truncate">{ep.name}</span>}
                                  </button>
                                ))}
                              </>
                            ) : (
                              <p className="text-xs text-gray-600 px-3 py-2">{t('media.noEpisodes')}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}