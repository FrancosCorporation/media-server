// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import MediaLayout from '@/components/media/MediaLayout';
import DownloadProgress from '@/components/media/DownloadProgress';
import MediaPlayerOverlay from '@/components/media/MediaPlayerOverlay';
import PosterImage from '@/components/media/PosterImage';
import { mediaApi, mediaApiBase } from '@/services/media/api';
import { getCached, setCache, invalidateCache } from '@/services/media/cache';
import { Download, WifiOff, Play, CheckCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

function baseTitle(title: string): string {
  return (title || '')
    .split(' - Temporada')[0]
    .split(' – Temporada')[0]
    .split(' - S')[0]
    .split(' – S')[0]
    .trim();
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSeasonNumber(title: string, torrentName?: string): number {
  // Try from torrent name first (more reliable: "Ted.Lasso.S03E02" → 3)
  const sources = [torrentName || '', title || ''];
  for (const src of sources) {
    if (!src) continue;
    // S01E01 / s01e01 patterns
    const seMatch = src.match(/\b[Ss](\d{1,2})[Ee]\d{1,3}\b/);
    if (seMatch) return parseInt(seMatch[1], 10);
    // "Season 01" / "Temporada 1" patterns
    const seasonMatch = src.match(/\b[Ss]eason[\s._-]*(\d{1,2})\b/i)
      || src.match(/\b[Tt]emporada[\s._-]*(\d{1,2})\b/i);
    if (seasonMatch) return parseInt(seasonMatch[1], 10);
    // Standalone "S01" / "S02" patterns (without E)
    const sOnlyMatch = src.match(/\b[Ss](\d{1,2})\b/);
    if (sOnlyMatch) return parseInt(sOnlyMatch[1], 10);
  }
  return 1; // Default to season 1
}

function findTorrent(torrents: any[], dl: any): any | undefined {
  if (dl.hash) {
    const dlHash = String(dl.hash).toLowerCase();
    const byHash = torrents.find((tr: any) => String(tr.hash || '').toLowerCase() === dlHash);
    if (byHash) return byHash;
  }

  const normalizedTitle = normalizeName(dl.title || '');
  const titleWords = normalizedTitle.split(' ').filter((w: string) => w.length > 2);

  return torrents.find((tr: any) => {
    const normalizedTorrentName = normalizeName(tr.name || '');
    if (normalizedTorrentName.includes(normalizedTitle)) return true;
    if (titleWords.length > 1) {
      const matchCount = titleWords.filter((w: string) => normalizedTorrentName.includes(w)).length;
      if (matchCount / titleWords.length >= 0.7) return true;
    }
    return false;
  });
}

function deduplicateDownloads(downloads: any[]): any[] {
  const seen = new Map<string, any>();
  for (const dl of downloads) {
    const idKey = String(dl._id || '');
    const hashKey = String(dl.hash || '').toLowerCase();
    const compositeKey = idKey || hashKey || `${dl.title}-${dl.mediaId}-${dl.mediaType}`;
    if (!seen.has(compositeKey)) {
      seen.set(compositeKey, dl);
    }
  }
  return Array.from(seen.values());
}

function getUniqueKey(dl: any, index: number): string {
  const idKey = String(dl._id || '');
  const hashKey = String(dl.hash || '').toLowerCase();
  return idKey || hashKey || `${dl.title}-${dl.mediaId}-${dl.mediaType}-${index}`;
}

const CACHE_KEY = 'media_downloads';
const CACHE_TTL = 2 * 60 * 1000;

export default function MediaDownloads() {
  const { t } = useI18n();
  const [downloads, setDownloads] = useState<any[]>(() => getCached<any[]>(CACHE_KEY, CACHE_TTL) || []);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [playingMedia, setPlayingMedia] = useState<{ mediaId: string; mediaType: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 15;
  const BASE_RECONNECT_DELAY = 2000;

  const fetchDownloads = useCallback(async () => {
    try {
      const data = await mediaApi.getDownloads();
      if (mountedRef.current) {
        const list = deduplicateDownloads(data.downloads || []);
        setDownloads(list);
        setCache(CACHE_KEY, list);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Always invalidate cache on mount to show fresh data
    invalidateCache(CACHE_KEY);
    const cached = getCached<any[]>(CACHE_KEY, CACHE_TTL);
    if (cached) {
      setDownloads(deduplicateDownloads(cached));
      setLoading(false);
    }

    fetchDownloads().finally(() => {
      if (mountedRef.current) setLoading(false);
    });

    const apiBase = import.meta.env.VITE_MEDIA_API_URL || '/dolfimflix/api';
    const wsBase = import.meta.env.VITE_MEDIA_WS_URL || (() => {
      // If VITE_MEDIA_API_URL is a full URL (e.g., https://host/media-api)
      if (apiBase.startsWith('http')) {
        const url = new URL(apiBase);
        // WebSocket is at /ws on the same host
        url.protocol = url.protocol.replace('http', 'ws');
        url.pathname = '/ws';
        return url.toString();
      }
      // Relative path - use current host with /ws
      return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    })();

    function clearReconnectTimer() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function startPolling() {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchDownloads, 5000);
      }
    }

    function connectWS() {
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        console.warn('[Downloads] Max reconnect attempts reached');
        return;
      }
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }
      reconnectAttemptsRef.current += 1;
      clearReconnectTimer();
      try {
        if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
          wsRef.current.close();
        }

        const ws = new WebSocket(wsBase);

        ws.onopen = () => {
          setWsConnected(true);
          reconnectAttemptsRef.current = 0; // reset on successful connection
          clearReconnectTimer();
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'download_update') {
              // Eventos vindos do backend (ex: timeout "sem fontes" → status error)
              if (data.downloadEvents?.length) {
                setDownloads((prev) =>
                  prev.map((dl) => {
                    const ev = data.downloadEvents.find((e: any) => e._id === dl._id);
                    return ev ? { ...dl, ...ev } : dl;
                  })
                );
              }
              if (data.torrents) {
                const completedStates = ['uploading', 'stalledUP', 'pausedUP'];
                const queuedStates = ['queuedDL', 'queued', 'pausedDL'];
                const errorStates = ['error', 'missingFiles', 'unknown'];

                setDownloads((prev) =>
                  prev.map((dl) => {
                    const t = findTorrent(data.torrents, dl)
                    if (t) {
                      // Preserva o status 'error' definido pelo backend (ex: sem fontes,
                      // torrent perdido) — mas RECUPERA para 'downloading' se o torrent
                      // voltar a ter atividade (seeds/velocidade/progresso).
                      let newStatus = dl.status;
                      if (t.progress >= 100 || completedStates.includes(t.state)) {
                        newStatus = 'complete';
                      } else if (errorStates.includes(t.state)) {
                        newStatus = 'error';
                      } else if (dl.status === 'error' && (t.seeds > 0 || t.speed > 0 || t.progress > 0)) {
                        newStatus = 'downloading';
                      } else if (queuedStates.includes(t.state) && dl.status !== 'error') {
                        newStatus = 'queued';
                      } else if (dl.status !== 'error') {
                        newStatus = 'downloading';
                      }
                      return {
                        ...dl,
                        hash: t.hash || dl.hash,
                        progress: t.progress,
                        speed: t.speed,
                        eta: t.eta,
                        seeds: t.seeds,
                        peers: t.peers,
                        state: t.state,
                        torrentState: t.state,
                        torrentName: t.name || dl.torrentName,
                        status: newStatus,
                      };
                    }
                    return dl;
                  })
                );
              } else if (data.download) {
                setDownloads((prev) => {
                  const incoming = data.download;
                  const byId = incoming._id
                    ? prev.findIndex((d: any) => d._id === incoming._id)
                    : -1;
                  const byHash = incoming.hash
                    ? prev.findIndex((d: any) => String(d.hash || '').toLowerCase() === String(incoming.hash).toLowerCase())
                    : -1;
                  const index = byId >= 0 ? byId : byHash >= 0 ? byHash : -1;

                  if (index >= 0) {
                    const next = [...prev];
                    next[index] = { ...next[index], ...incoming };
                    return next;
                  }

                  return deduplicateDownloads([incoming, ...prev]);
                });
              }
            }
          } catch { /* JSON parse error */ }
        };

        ws.onclose = () => {
          setWsConnected(false);
          startPolling();
          if (mountedRef.current) {
            clearReconnectTimer();
            if (wsRef.current === ws) {
              const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(1.5, reconnectAttemptsRef.current), 30000);
              reconnectTimerRef.current = setTimeout(connectWS, delay);
            }
          }
        };

        ws.onerror = () => {
          setWsConnected(false);
          ws.close();
        };
        wsRef.current = ws;
      } catch {
        startPolling();
        if (mountedRef.current) {
          clearReconnectTimer();
          const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(1.5, reconnectAttemptsRef.current), 30000);
          reconnectTimerRef.current = setTimeout(connectWS, delay);
        }
      }
    }

    connectWS();

    return () => {
      mountedRef.current = false;
      const ws = wsRef.current;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }
      clearReconnectTimer();
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [fetchDownloads]);

  const activeDownloads = downloads.filter((d) => d.status === 'downloading' || d.status === 'queued' || d.status === 'error');
  const completedDownloads = downloads.filter((d) => d.status === 'complete');

  // Agrupa downloads ativos por mediaId — uma entrada por série/filme
  const activeGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const dl of activeDownloads) {
      const key = dl.mediaId || dl._id || `${dl.title}-${dl.mediaType}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(dl);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      const downloading = items.filter((i) => i.status === 'downloading');
      const avgProgress = items.length > 0
        ? items.reduce((sum, i) => sum + (i.progress || 0), 0) / items.length
        : 0;
      const hasError = items.some((i) => i.status === 'error');
      const hasQueued = items.some((i) => i.status === 'queued');
      const overallStatus = hasError ? 'error' : hasQueued ? 'queued' : 'downloading';

      // Find worst torrentState for display
      const worstState = items.find((i) => i.torrentState === 'stalledDL')?.torrentState
        || items.find((i) => i.torrentState === 'metaDL')?.torrentState
        || (downloading.length > 0 ? 'downloading' : 'queued');

      // Per-season progress (só para series)
      const mediaType = items[0].mediaType;
      let seasons: { season: number; progress: number; total: number; downloading: number }[] = [];
      if (mediaType === 'series') {
        const seasonMap = new Map<number, { progress: number; total: number; downloading: number }>();
        for (const item of items) {
          const season = extractSeasonNumber(item.title, item.torrentName || item.state);
          if (!seasonMap.has(season)) seasonMap.set(season, { progress: 0, total: 0, downloading: 0 });
          const s = seasonMap.get(season)!;
          s.total += 1;
          s.progress += item.progress || 0;
          if (item.status === 'downloading') s.downloading += 1;
        }
        seasons = Array.from(seasonMap.entries())
          .map(([season, data]) => ({
            season,
            progress: data.total > 0 ? Math.round((data.progress / data.total) * 10) / 10 : 0,
            total: data.total,
            downloading: data.downloading,
          }))
          .sort((a, b) => a.season - b.season);
      }

      return {
        key,
        title: items[0].title,
        poster: items.find((i) => i.poster)?.poster || items[0].poster,
        mediaId: items[0].mediaId,
        mediaType: items[0].mediaType,
        tmdbId: items[0].tmdbId,
        status: overallStatus,
        progress: Math.round(avgProgress * 10) / 10,
        torrentState: worstState,
        seasons,
        items,
      };
    }).sort((a, b) => {
      // Errors first, then downloading, then queued
      const order = { error: 0, downloading: 1, queued: 2 };
      return (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3);
    });
  }, [activeDownloads]);

  // Agrupa concluídos por título base (ex: "The Mentalist - Temporada 1..7" → "The Mentalist")
  const completedGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const dl of completedDownloads) {
      const key = baseTitle(dl.title) || dl.title;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(dl);
    }
    return Array.from(map.entries()).map(([title, items]) => ({
      title,
      items,
      poster: items.find((i) => i.poster)?.poster || items[0].poster,
      mediaId: items[0].mediaId,
      mediaType: items[0].mediaType,
      tmdbId: items[0].tmdbId,
    }));
  }, [completedDownloads]);

  const handleWatch = (dl: any) => {
    if (dl.mediaId) {
      setPlayingMedia({ mediaId: dl.mediaId, mediaType: dl.mediaType });
    }
  };

  const handleDeleteDownload = async (id: string, dl?: { hash?: string | null; torrentState?: string; mediaType?: string; mediaId?: string }) => {
    try {
      // Itens órfãos em erro (sem documento Download, _id === mediaId) são removidos
      // diretamente via DELETE /movies/:id ou /series/:id, limpando rastros.
      const isOrphan = dl && dl.hash === null && dl.torrentState === 'failed';
      if (isOrphan) {
        if (dl.mediaType === 'series') {
          await mediaApi.deleteSeries(dl.mediaId || id);
        } else {
          await mediaApi.deleteMovie(dl.mediaId || id);
        }
      } else {
        await mediaApi.deleteDownload(id);
      }
      setDownloads((prev) => {
        const next = prev.filter((d) => d._id !== id);
        setCache(CACHE_KEY, next);
        return next;
      });
    } catch { /* ignore */ }
  };

  const handleDeleteGroup = async (group: { items: any[]; mediaType?: string; mediaId?: string }) => {
    for (const item of group.items) {
      await handleDeleteDownload(item._id, item);
    }
  };

  const handleRetryDownload = async (dl: { mediaType?: string; mediaId?: string; _id?: string }) => {
    const targetId = dl.mediaId || dl._id;
    if (!targetId) return;
    try {
      if (dl.mediaType === 'series') {
        await mediaApi.retrySeries(targetId);
      } else {
        await mediaApi.retryMovie(targetId);
      }
      setDownloads((prev) =>
        prev.map((d) =>
          d._id === dl._id ? { ...d, status: 'queued', torrentStateLabel: t('downloadStatus.inQueue') } : d
        )
      );
      fetchDownloads();
    } catch { /* ignore */ }
  };

  return (
    <MediaLayout>
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">{t('downloads.title')}</h1>
            <p className="text-gray-400 text-sm mt-1">{t('downloads.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              'w-2 h-2 rounded-full',
              wsConnected ? 'bg-green-500' : 'bg-yellow-500'
            )} />
            <span className="text-xs text-gray-500">
              {wsConnected ? t('downloads.realTime') : t('downloads.polling')}
            </span>
          </div>
        </div>

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!wsConnected && !loading && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
            <WifiOff className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-yellow-400">
              {t('downloads.realTimeUnavailable')}
            </span>
          </div>
        )}

        {!loading && activeGroups.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              {t('downloads.active')} ({activeGroups.length})
            </h2>
            <div className="space-y-3">
              {activeGroups.map((group) => (
                <DownloadProgress
                  key={group.key}
                  title={group.title}
                  poster={group.poster}
                  status={group.status}
                  progress={group.progress}
                  torrentState={group.torrentState}
                  mediaId={group.mediaId}
                  tmdbId={group.tmdbId}
                  mediaType={group.mediaType}
                  itemCount={group.items.length}
                  seasons={group.seasons}
                  posterFallback={group.mediaId && group.mediaType ? `${mediaApiBase}/poster/${group.mediaType}/${group.mediaId}` : undefined}
                  onDelete={() => handleDeleteGroup(group)}
                  onRetry={group.status === 'error' ? () => handleRetryDownload(group.items[0]) : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {!loading && activeGroups.length === 0 && downloads.length === 0 && (
          <div className="text-center py-20">
            <Download className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400 text-lg mb-1">{t('downloads.noActive')}</p>
            <p className="text-gray-500 text-sm">{t('downloads.noActiveDesc')}</p>
          </div>
        )}

        {!loading && completedGroups.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              {t('downloads.completed')} ({completedDownloads.length})
            </h2>
            <div className="space-y-3">
              {completedGroups.map((group, groupIndex) => {
                const totalSize = group.items.reduce((sum, i) => sum + (i.size || 0), 0);
                const sizeGB = (totalSize / 1e9).toFixed(1);
                const groupKey = `${group.title}-${group.mediaId}-${group.mediaType}-${groupIndex}`;
                return (
                  <div
                    key={groupKey}
                    className="flex items-center gap-4 p-4 rounded-xl border border-green-500/20 bg-green-500/5"
                  >
                    <PosterImage
                      src={group.poster}
                      fallbackSrc={group.mediaId && group.mediaType ? `${mediaApiBase}/poster/${group.mediaType}/${group.mediaId}` : undefined}
                      mediaId={group.mediaId}
                      tmdbId={group.tmdbId}
                      mediaType={group.mediaType}
                      alt={group.title}
                      containerClassName="w-20 h-28 rounded-lg shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-white truncate" title={group.title}>{group.title}</h4>
                      <p className="text-xs text-gray-400 mt-1">
                        {group.mediaType === 'series'
                          ? `${group.items.length} ${group.items.length !== 1 ? t('media.seasons') : t('media.season')}`
                          : `${sizeGB} GB`
                        } — {t('downloadStatus.completed')}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {group.items.map((dl, itemIndex) => (
                          <span
                            key={getUniqueKey(dl, itemIndex)}
                            className="px-2 py-0.5 text-[10px] font-medium rounded bg-green-500/10 border border-green-500/20 text-green-400"
                          >
                            {dl.title.replace(`${group.title} - `, '').replace(`${group.title} – `, '')}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleWatch(group.items[0])}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-all shrink-0 shadow-lg shadow-sky-600/20"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      {t('media.play')}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {playingMedia && (
        <MediaPlayerOverlay
          mediaId={playingMedia.mediaId}
          mediaType={playingMedia.mediaType as 'movie' | 'series'}
          onClose={() => setPlayingMedia(null)}
        />
      )}
    </MediaLayout>
  );
}
