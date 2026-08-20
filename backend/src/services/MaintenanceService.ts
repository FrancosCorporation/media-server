// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// MaintenanceService — Funções de manutenção e auto-limpeza.
//
// Funções originais (debug/manutenção):
//   deduplicateMedia, cleanupOrphans, verifySync, DEFAULT_VERIFY_TITLES
//
// Nova função (Regra 4 do Regras_dolfimflix.md):
//   startCleanup — remove arquivos de mídias 100% assistidas há >N dias.

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Movie } from '../models/Movie';
import { Series } from '../models/Series';
import { Download } from '../models/Download';
import { WatchProgress } from '../models/WatchProgress';
import { RadarrService } from '../services/RadarrService';
import { SonarrService } from '../services/SonarrService';
import { QBittorrentService } from '../services/QBittorrentService';
import { MetadataService } from '../services/MetadataService';
import { fixPosterUrl } from '../utils/poster';
import { recordCompletenessScore } from '../utils/dedupe';
import { logger } from '../utils/logger';

const COMPONENT = 'Maintenance';

const MEDIA_ROOTS = ['/media/movies', '/media/series', '/downloads', '/media/transcode'];

export const DEFAULT_VERIFY_TITLES = [
  'The Middle', 'Ted Lasso', 'Matrix', 'How I Met Your Mother',
  'The Mentalist', 'This Is Us', 'House', 'Friends', 'Dexter',
];

function resolveInRoots(relativePath: string): string | null {
  for (const root of MEDIA_ROOTS) {
    const candidate = path.join(root, relativePath);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countDuplicates(docs: any[]): number {
  const counts = new Map<number, number>();
  for (const d of docs) {
    if (!d.tmdbId) continue;
    counts.set(d.tmdbId, (counts.get(d.tmdbId) || 0) + 1);
  }
  let dupes = 0;
  for (const c of counts.values()) if (c > 1) dupes += c;
  return dupes;
}

async function httpStatus(url: string): Promise<string> {
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      validateStatus: () => true,
      responseType: 'arraybuffer',
    });
    return res.status === 200 ? '200' : String(res.status);
  } catch (err: any) {
    return `ERR:${err.code || err.message}`;
  }
}

function toBackendUrl(url: string, base: string): string {
  if (url.startsWith('http')) return url;
  const backendPath = url.replace(/^\/media-api\//, '/api/');
  return `${base}${backendPath}`;
}

async function deduplicateCollection(
  model: any,
  type: 'movie' | 'series'
): Promise<any[]> {
  const docs = await model.find({ tmdbId: { $exists: true, $ne: null } });
  const byTmdb = new Map<number, any[]>();
  for (const d of docs) {
    if (!d.tmdbId) continue;
    const list = byTmdb.get(d.tmdbId) || [];
    list.push(d);
    byTmdb.set(d.tmdbId, list);
  }

  const removed: any[] = [];
  for (const [tmdbId, group] of byTmdb) {
    if (group.length <= 1) continue;
    const ranked = [...group].sort((a, b) => recordCompletenessScore(b) - recordCompletenessScore(a));
    const keep = ranked[0];
    for (const dup of ranked.slice(1)) {
      await Download.updateMany(
        { mediaId: dup._id.toString() },
        { mediaId: keep._id.toString() }
      ).catch((err) =>
        logger.warn(COMPONENT, `Failed to re-point downloads for ${dup.title}`, { error: err.message })
      );
      await model.findByIdAndDelete(dup._id);
      removed.push({
        _id: dup._id.toString(),
        title: dup.title,
        tmdbId,
        reason: `duplicata de "${keep.title}" (tmdbId ${tmdbId})`,
      });
    }
  }
  logger.info(COMPONENT, `Deduplicated ${type}s: ${removed.length} removed`);
  return removed;
}

export async function deduplicateMedia(): Promise<{ movies: any[]; series: any[] }> {
  const movies = await deduplicateCollection(Movie, 'movie');
  const series = await deduplicateCollection(Series, 'series');
  return { movies, series };
}

export async function cleanupOrphans(
  options: { dryRun?: boolean } = {}
): Promise<{ movies: any[]; series: any[]; dryRun: boolean }> {
  const dryRun = options.dryRun !== false;
  const movies: any[] = [];
  const series: any[] = [];

  const movieDocs = await Movie.find({ status: 'available' });
  for (const m of movieDocs) {
    if (!m.path) continue;
    const full = resolveInRoots(m.path);
    if (!full || !fs.existsSync(full)) {
      movies.push({
        _id: m._id.toString(),
        title: m.title,
        path: m.path,
        reason: 'arquivo físico não encontrado no disco',
      });
      if (!dryRun) {
        await Download.deleteMany({ mediaId: m._id.toString() }).catch(() => {});
        await Movie.findByIdAndDelete(m._id).catch(() => {});
        logger.warn(COMPONENT, `Orphan movie deleted (no file): ${m.title} (${m.path})`);
      }
    }
  }

  const seriesDocs = await Series.find({ status: 'available' });
  for (const s of seriesDocs) {
    if (!s.path) continue;
    const full = resolveInRoots(s.path);
    if (!full || !fs.existsSync(full)) {
      series.push({
        _id: s._id.toString(),
        title: s.title,
        path: s.path,
        reason: 'arquivo físico não encontrado no disco',
      });
      if (!dryRun) {
        await Download.deleteMany({ mediaId: s._id.toString() }).catch(() => {});
        await Series.findByIdAndDelete(s._id).catch(() => {});
        logger.warn(COMPONENT, `Orphan series deleted (no file): ${s.title} (${s.path})`);
      }
    }
  }

  logger.info(COMPONENT, `Orphan cleanup (dryRun=${dryRun}): ${movies.length} movies, ${series.length} series`);
  return { movies, series, dryRun };
}

async function checkPosters(
  items: Array<{ item: any; mediaType: 'movie' | 'series' }>,
  base: string
): Promise<any[]> {
  const out: any[] = [];
  for (const { item, mediaType } of items) {
    let raw = item.poster || '';
    if (!raw) {
      raw = await MetadataService.resolvePosterUrl(mediaType, item._id.toString()).catch(() => '');
    }
    const url = fixPosterUrl(raw, mediaType);
    let statusCode = 'no-poster';
    if (url) {
      statusCode = await httpStatus(toBackendUrl(url, base));
    }
    out.push({ mediaId: item._id.toString(), title: item.title, mediaType, posterUrl: url, httpStatus: statusCode });
  }
  return out;
}

export async function verifySync(
  titles: string[],
  posterBaseUrl?: string
): Promise<any[]> {
  const base = posterBaseUrl || `http://localhost:${process.env.API_PORT || '4000'}`;
  const torrents = await QBittorrentService.getTorrents().catch(() => [] as any[]);

  const report: any[] = [];
  for (const title of titles) {
    const re = new RegExp(escapeRegex(title), 'i');

    const movies = await Movie.find({ title: { $regex: re } });
    const series = await Series.find({
      $or: [
        { title: { $regex: re } },
        { canonicalTitle: { $regex: re } },
        { originalTitle: { $regex: re } },
      ],
    });

    const [radarr, sonarr] = await Promise.all([
      RadarrService.searchMovie(title).catch(() => [] as any[]),
      SonarrService.searchSeries(title).catch(() => [] as any[]),
    ]);

    const qbit = torrents.filter((t: any) => t.name && re.test(t.name));

    report.push({
      title,
      db: {
        movies: movies.map((m) => ({
          _id: m._id.toString(), tmdbId: m.tmdbId, status: m.status, path: m.path, poster: m.poster,
        })),
        series: series.map((s) => ({
          _id: s._id.toString(), tmdbId: s.tmdbId, tvdbId: s.tvdbId, status: s.status, path: s.path, poster: s.poster,
        })),
        duplicatedMovies: countDuplicates(movies),
        duplicatedSeries: countDuplicates(series),
      },
      radarr: { found: radarr.length > 0, count: radarr.length },
      sonarr: { found: sonarr.length > 0, count: sonarr.length },
      qbittorrent: {
        found: qbit.length > 0,
        torrents: qbit.map((t: any) => ({
          name: t.name, state: t.state, progress: t.progress, seeds: t.seeds, peers: t.peers,
        })),
      },
      posters: await checkPosters(
        [
          ...movies.map((item) => ({ item, mediaType: 'movie' as const })),
          ...series.map((item) => ({ item, mediaType: 'series' as const })),
        ],
        base
      ),
    });
  }
  return report;
}

// ─── Auto-cleanup (Regra 4 — Auto-Limpeza) ───────────────────────────────────

/**
 * Remove arquivos de mídias 100% assistidas há >maxDaysSinceWatched dias.
 * Mantém o registro no DB (título, capa, metadados) mas libera disco.
 */
export const MaintenanceService = {
  startCleanup(maxDaysSinceWatched = 30, intervalHours = 12): void {
    const intervalMs = intervalHours * 60 * 60 * 1000;

    const runCleanup = async () => {
      try {
        const cutoffDate = new Date(Date.now() - maxDaysSinceWatched * 24 * 60 * 60 * 1000);
        const completed = await WatchProgress.find({
          completed: true,
          lastWatched: { $lt: cutoffDate },
        }).lean();

        if (completed.length === 0) return;

        let removed = 0;
        for (const wp of completed) {
          try {
            const doc = wp.mediaType === 'movie'
              ? await Movie.findById(wp.mediaId)
              : await Series.findById(wp.mediaId);
            if (!doc?.path) continue;

            const absPath = resolveInRoots(doc.path);
            if (absPath && existsSync(absPath)) {
              unlinkSync(absPath);
              logger.info(COMPONENT, `Removed watched file: ${doc.path}`);
              if (wp.mediaType === 'movie') {
                await Movie.findByIdAndUpdate(wp.mediaId, { path: null });
              } else {
                await Series.findByIdAndUpdate(wp.mediaId, { path: null });
              }
              removed++;
            }
          } catch (err: any) {
            logger.warn(COMPONENT, `Cleanup item ${wp.mediaId} failed: ${err.message}`);
          }
        }

        if (removed > 0) {
          logger.info(COMPONENT, `Auto-cleanup: ${removed} files removed`);
        }
      } catch (err: any) {
        logger.error(COMPONENT, `Auto-cleanup error: ${err.message}`);
      }
    };

    runCleanup();
    setInterval(runCleanup, intervalMs);
  },
};
