// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useEffect, useState } from 'react';
import MediaLayout from '@/components/media/MediaLayout';
import MediaCard from '@/components/media/MediaCard';
import MediaPreviewModal from '@/components/media/MediaPreviewModal';
import MediaPlayerOverlay from '@/components/media/MediaPlayerOverlay';
import { mediaApi } from '@/services/media/api';
import { getCached, setCache, invalidateCache } from '@/services/media/cache';
import {
  Film, Tv, Download, Library, TrendingUp, ArrowRight,
  Search, Play, Sparkles, Clock, Star
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useMediaToast } from '@/components/media/MediaToast';
import { useI18n } from '@/i18n';

const CACHE_KEY = 'dashboard_recommendations';
const CACHE_TTL = 5 * 60 * 1000;

export default function MediaDashboard() {
  const navigate = useNavigate();
  const toast = useMediaToast();
  const { t } = useI18n();
  const [recent, setRecent] = useState<any[]>(() => getCached<{ recent: any[] }>(CACHE_KEY, CACHE_TTL)?.recent || []);
  const [highlights, setHighlights] = useState<any[]>(() => getCached<{ highlights: any[] }>(CACHE_KEY, CACHE_TTL)?.highlights || []);
  const [recommended, setRecommended] = useState<any[]>(() => getCached<{ recommended: any[] }>(CACHE_KEY, CACHE_TTL)?.recommended || []);
  const [stats, setStats] = useState(() => getCached<{ stats: { movies: number; series: number; downloads: number } }>(CACHE_KEY, CACHE_TTL)?.stats || { movies: 0, series: 0, downloads: 0 });
  const [trending, setTrending] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [libraryItems, setLibraryItems] = useState<Set<number>>(new Set());
  const [addingIds, setAddingIds] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [playingMedia, setPlayingMedia] = useState<{ id: string; type: 'movie' | 'series' } | null>(null);

  const STATS = [
    { labelKey: 'dashboard.movies', icon: Film, color: 'text-sky-400', bg: 'bg-sky-500/10', path: '/dolfimflix/biblioteca' },
    { labelKey: 'dashboard.series', icon: Tv, color: 'text-blue-400', bg: 'bg-blue-500/10', path: '/dolfimflix/biblioteca' },
    { labelKey: 'dashboard.downloads', icon: Download, color: 'text-green-400', bg: 'bg-green-500/10', path: '/dolfimflix/downloads' },
    { labelKey: 'dashboard.library', icon: Library, color: 'text-purple-400', bg: 'bg-purple-500/10', path: '/dolfimflix/biblioteca' },
  ];

  useEffect(() => {
    // Always invalidate cache on mount to show fresh data
    invalidateCache(CACHE_KEY);
    const cached = getCached<any>(CACHE_KEY, CACHE_TTL);
    if (cached) {
      setLoading(false);
      return;
    }

    setLoading(true);
    mediaApi.getRecommendations()
      .then((data) => {
        setRecent(data.recent || []);
        setHighlights(data.highlights || []);
        setRecommended(data.recommended || []);
        setStats(data.stats || { movies: 0, series: 0, downloads: 0 });
        setCache(CACHE_KEY, data);
      })
      .catch(() => {
        Promise.all([
          mediaApi.getLibrary().catch(() => ({ movies: [], series: [] })),
          mediaApi.getDownloads().catch(() => ({ downloads: [] })),
        ]).then(([lib, dl]) => {
          const all = [...(lib.movies || []), ...(lib.series || [])]
            .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
          setRecent(all.slice(0, 8));
          setStats({
            movies: lib.movies?.length || 0,
            series: lib.series?.length || 0,
            downloads: dl.downloads?.length || 0,
          });
        });
      })
      .finally(() => setLoading(false));

    // Busca tendências de streaming (Regra 3.1 do Regras_dolfimflix.md)
    mediaApi.getTrending()
      .then((data) => setTrending(data.trending || []))
      .catch(() => {});
  }, []);

  const refreshLibrary = async () => {
    try {
      const lib = await mediaApi.getLibrary();
      const ids = new Set<number>();
      [...(lib.movies || []), ...(lib.series || [])].forEach((item: any) => {
        if (item.tmdbId) ids.add(item.tmdbId);
      });
      setLibraryItems(ids);
    } catch { /* ignore */ }
  };

  useEffect(() => { refreshLibrary(); }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate('/dolfimflix/buscar?q=' + encodeURIComponent(searchQuery.trim()));
    }
  };

  const featured = highlights[0] || recent[0] || null;
  const statValues = [stats.movies, stats.series, stats.downloads, stats.movies + stats.series];
  const sectionBg = 'bg-white/[0.03] border border-white/[0.06] rounded-2xl';

  return (
    <MediaLayout>
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-10">

        {/* Hero */}
        {featured ? (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 min-h-[280px] md:min-h-[340px] flex items-end">
            {featured.backdrop && (
              <img src={featured.backdrop} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/60 to-transparent" />
            <div className="relative z-10 p-6 md:p-10 w-full">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-sky-600 text-white">{t('dashboard.featured')}</span>
                  {featured.rating > 0 && <span className="text-xs text-yellow-400">★ {featured.rating.toFixed(1)}</span>}
                  <span className="text-xs text-gray-400">{featured.year}</span>
                </div>
                <h2 className="text-2xl md:text-4xl font-bold text-white mb-2">{featured.title}</h2>
                <p className="text-sm text-gray-300 line-clamp-2 mb-4 max-w-xl">{featured.overview}</p>
                <div className="flex items-center gap-3">
                  <Link to="/dolfimflix/biblioteca" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition-all">
                    <Play className="w-4 h-4" /> {t('dashboard.viewInLibrary')}
                  </Link>
                  <Link to="/dolfimflix/buscar" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-all">
                    {t('dashboard.searchMore')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-900/30 via-gray-900 to-gray-800 min-h-[240px] md:min-h-[280px] flex items-center justify-center">
            <div className="relative z-10 text-center px-6">
              <Film className="w-12 h-12 text-sky-500 mx-auto mb-4" />
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">{t('dashboard.welcome')}</h2>
              <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
                {t('dashboard.welcomeDesc')}
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link to="/dolfimflix/buscar" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition-all">
                  <Search className="w-4 h-4" /> {t('dashboard.searchMovies')}
                </Link>
                <Link to="/dolfimflix/buscar" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-all">
                  <Search className="w-4 h-4" /> {t('dashboard.searchSeries')}
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t('dashboard.searchPlaceholder')}
            className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-white/[0.06] border border-white/[0.1] text-white placeholder:text-gray-500 outline-none focus:border-sky-500/50 transition-all text-sm"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {STATS.map((stat, i) => (
            <Link key={stat.labelKey} to={stat.path}
              className={cn('rounded-2xl border p-5 transition-all hover:scale-[1.02]', stat.bg, 'border-white/[0.06] hover:border-white/[0.15]')}
            >
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', stat.bg)}>
                <stat.icon className={cn('w-5 h-5', stat.color)} />
              </div>
              <p className="text-2xl font-bold text-white">{statValues[i]}</p>
              <p className="text-sm text-gray-400">{t(stat.labelKey)}</p>
            </Link>
          ))}
        </div>

        {/* Em Alta dos Streaming (TMDB Trending) — Regra 3.1 */}
        {trending.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-2xl">🔥</span> Em Alta nos Streaming
              </h2>
              <Link to="/dolfimflix/buscar" className="text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1">
                {t('dashboard.seeAll')} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {trending.map((item: any, i: number) => (
                <MediaCard
                  key={`${item.tmdbId}-${i}`}
                  title={item.title}
                  year={item.year}
                  poster={item.poster}
                  overview={item.overview}
                  rating={item.rating}
                  genres={item.genres}
                  mediaType={item.mediaType === 'tv' ? 'series' : 'movie'}
                  tmdbId={item.tmdbId}
                  onClick={() => setPreview(item)}
                  onAdd={!libraryItems.has(item.tmdbId) ? () => {
                    const isSeries = item.mediaType === 'tv';
                    if (isSeries) {
                      mediaApi.addSeries(0, item.title, item.year || 0, { tmdbId: item.tmdbId, poster: item.poster, overview: item.overview, genres: item.genres, rating: item.rating }).then(() => {
                        toast.success(t('dashboard.seriesAdded'), `${item.title} ${t('dashboard.seriesAddedDesc')}`);
                        setLibraryItems(prev => new Set(prev).add(item.tmdbId));
                      }).catch(() => {});
                    } else {
                      mediaApi.addMovie(item.tmdbId, item.title, item.year || 0, { poster: item.poster, overview: item.overview, genres: item.genres, rating: item.rating }).then(() => {
                        toast.success(t('dashboard.movieAdded'), `${item.title} ${t('dashboard.movieAddedDesc')}`);
                        setLibraryItems(prev => new Set(prev).add(item.tmdbId));
                      }).catch(() => {});
                    }
                  } : undefined}
                  added={libraryItems.has(item.tmdbId)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Em Alta (Highlights) */}
        {highlights.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-sky-400" /> {t('dashboard.trending')}
              </h2>
              <Link to="/dolfimflix/biblioteca" className="text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1">
                {t('dashboard.seeAll')} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {highlights.map((item: any) => (
                <MediaCard
                  key={item._id}
                  title={item.title}
                  year={item.year}
                  poster={item.poster}
                  overview={item.overview}
                  rating={item.rating}
                  genres={item.genres}
                  seasons={item.seasons}
                  status={item.status}
                  mediaId={item._id}
                  tmdbId={item.tmdbId}
                  mediaType={item.seasons !== undefined ? 'series' : 'movie'}
                  onClick={() => setPreview(item)}
                  onPlay={item.status === 'available' ? () => { setPreview(null); setPlayingMedia({ id: item._id, type: item.seasons !== undefined ? 'series' : 'movie' }); } : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {/* Recomendados para Você */}
        {recommended.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" /> {t('dashboard.recommended')}
              </h2>
              <Link to="/dolfimflix/buscar" className="text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1">
                {t('dashboard.searchMore')} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {recommended.map((item: any, i: number) => (
                <MediaCard
                  key={item.id || i}
                  title={item.title}
                  year={item.year}
                  poster={item.poster}
                  overview={item.overview}
                  rating={item.rating}
                  genres={item.genres}
                  mediaId={item._id}
                  tmdbId={item.tmdbId || item.id}
                  mediaType={item.seasons !== undefined ? 'series' : 'movie'}
                   onClick={() => setPreview(item)}
                   added={libraryItems.has(item.id)}
                   adding={addingIds.has(item.id)}
                   onAdd={libraryItems.has(item.id) ? undefined : () => {
                     setAddingIds(prev => new Set(prev).add(item.id));
                     mediaApi.addMovie(item.id, item.title, item.year, {
                       poster: item.poster, overview: item.overview,
                       genres: item.genres, rating: item.rating,
                     }).then(() => {
                       toast.success(t('dashboard.movieAdded'), `${item.title} ${t('dashboard.movieAddedDesc')}`);
                       setLibraryItems(prev => new Set(prev).add(item.id));
                     })
                     .catch((err: any) => {
                       if (err?.message?.includes('409') || err?.message?.includes('já adicionado')) {
                         toast.info(t('dashboard.alreadyAdded'), `${item.title} ${t('dashboard.alreadyInLibrary')}`);
                         setLibraryItems(prev => new Set(prev).add(item.id));
                       } else {
                         toast.error(t('dashboard.errorAdding'), err instanceof Error ? err.message : t('dashboard.tryAgain'));
                       }
                     })
                     .finally(() => setAddingIds(prev => { const s = new Set(prev); s.delete(item.id); return s; }));
                   }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Adicionados Recentemente */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-green-400" /> {t('dashboard.recentlyAdded')}
            </h2>
            <Link to="/dolfimflix/biblioteca" className="text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1">
              {t('dashboard.seeAll')} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recent.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {recent.map((item) => (
                <MediaCard
                  key={item._id}
                  title={item.title}
                  year={item.year}
                  poster={item.poster}
                  overview={item.overview}
                  rating={item.rating}
                  genres={item.genres}
                  status={item.status}
                  seasons={item.seasons}
                  mediaId={item._id}
                  tmdbId={item.tmdbId}
                  mediaType={item.seasons !== undefined ? 'series' : 'movie'}
                  onClick={() => setPreview(item)}
                  onPlay={item.status === 'available' ? () => { setPreview(null); setPlayingMedia({ id: item._id, type: item.seasons !== undefined ? 'series' : 'movie' }); } : undefined}
                />
              ))}
            </div>
          ) : (
            <div className={cn('text-center py-16', sectionBg)}>
              <TrendingUp className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg mb-2">{t('dashboard.noContent')}</p>
              <p className="text-gray-500 text-sm mb-4">{t('dashboard.noContentDesc')}</p>
              <Link to="/dolfimflix/buscar" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition-all">
                {t('dashboard.searchMovies')} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </section>
      </div>

      {preview && (
        <MediaPreviewModal
          item={preview}
          isMovie={preview.seasons === undefined}
          onClose={() => setPreview(null)}
          onPlay={preview.status === 'available' ? () => { setPreview(null); setPlayingMedia({ id: preview._id, type: preview.seasons !== undefined ? 'series' : 'movie' }); } : undefined}
          added={libraryItems.has(preview.id)}
          onAdd={!preview._id && preview.id && !libraryItems.has(preview.id) ? () => {
            const isSeries = preview.seasons !== undefined;
            setAddingIds(prev => new Set(prev).add(preview.id));
            if (isSeries) {
              mediaApi.addSeries(0, preview.title, preview.year || 0, {
                tmdbId: preview.id,
                poster: preview.poster, overview: preview.overview,
                genres: preview.genres, rating: preview.rating,
              }).then(() => {
                toast.success(t('dashboard.seriesAdded'), `${preview.title} ${t('dashboard.seriesAddedDesc')}`);
                setLibraryItems(prev => new Set(prev).add(preview.id));
                setPreview(null);
              })
              .catch((err: any) => {
                if (err?.message?.includes('409') || err?.message?.includes('já adicionado')) {
                  toast.info(t('dashboard.alreadyAdded'), `${preview.title} ${t('dashboard.alreadyInLibrary')}`);
                  setLibraryItems(prev => new Set(prev).add(preview.id));
                  setPreview(null);
                } else {
                  toast.error(t('dashboard.errorAdding'), err instanceof Error ? err.message : t('dashboard.tryAgain'));
                }
              })
              .finally(() => setAddingIds(prev => { const s = new Set(prev); s.delete(preview.id); return s; }));
            } else {
              mediaApi.addMovie(preview.id, preview.title, preview.year, {
                poster: preview.poster, overview: preview.overview,
                genres: preview.genres, rating: preview.rating,
              }).then(() => {
                toast.success(t('dashboard.movieAdded'), `${preview.title} ${t('dashboard.movieAddedDesc')}`);
                setLibraryItems(prev => new Set(prev).add(preview.id));
                setPreview(null);
              })
              .catch((err: any) => {
                if (err?.message?.includes('409') || err?.message?.includes('já adicionado')) {
                  toast.info(t('dashboard.alreadyAdded'), `${preview.title} ${t('dashboard.alreadyInLibrary')}`);
                  setLibraryItems(prev => new Set(prev).add(preview.id));
                  setPreview(null);
                } else {
                  toast.error(t('dashboard.errorAdding'), err instanceof Error ? err.message : t('dashboard.tryAgain'));
                }
              })
              .finally(() => setAddingIds(prev => { const s = new Set(prev); s.delete(preview.id); return s; }));
            }
          } : undefined}
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
