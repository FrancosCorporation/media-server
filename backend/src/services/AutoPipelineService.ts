// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { Series } from '../models/Series';
import { Download } from '../models/Download';
import { TMDBService } from './TMDBService';
import { MediaScannerService } from './MediaScannerService';
import {
  GapAnalysisService,
  isSeasonCompleteOnDisk,
  markSeasonCompleteIfFull,
} from './GapAnalysisService';
import { SonarrService } from './SonarrService';
import { JellyfinService } from './JellyfinService';
import { organizeDirectory } from '../utils/mediaOrganizer';
import { ApacheTorrentService } from './ApacheTorrentService';
import { BRTorrentAggregator } from './BRTorrentAggregator';
import { RedeCanaisService } from './RedeCanaisService';
import { QBittorrentService } from './QBittorrentService';
import { createDownloadIfUnique } from '../utils/dedupe';
import axios from 'axios';
import { normalizeTitleForMatch } from '../utils/mediaOrganizer';

const COMPONENT = 'AutoPipeline';

/**
 * Validação preventiva de duplicatas ANTES de buscar torrents.
 * Verifica tmdbId, tvdbId e título exato para evitar duplicatas no pipeline.
 */
async function checkDuplicatePreventive(
  canonicalTitle: string,
  tmdbId: number | null,
  tvdbId: number | null,
  seriesId: string
): Promise<{ isDuplicate: boolean; reason: string }> {
  // 1. Check por tmdbId
  if (tmdbId) {
    const existing = await Series.findOne({ tmdbId, _id: { $ne: seriesId } });
    if (existing) {
      const torrents = await QBittorrentService.getTorrents();
      const hasGoodTorrent = torrents.some((t: any) =>
        normalizeTitleForMatch(t.name).includes(normalizeTitleForMatch(canonicalTitle)) &&
        (t.seeds || 0) > 0
      );
      if (hasGoodTorrent) {
        return { isDuplicate: true, reason: `tmdbId ${tmdbId} já tem versão com seeds` };
      }
    }
  }

  // 2. Check por tvdbId
  if (tvdbId) {
    const existing = await Series.findOne({ tvdbId, _id: { $ne: seriesId } });
    if (existing) {
      const torrents = await QBittorrentService.getTorrents();
      const hasGoodTorrent = torrents.some((t: any) =>
        normalizeTitleForMatch(t.name).includes(normalizeTitleForMatch(canonicalTitle)) &&
        (t.seeds || 0) > 0
      );
      if (hasGoodTorrent) {
        return { isDuplicate: true, reason: `tvdbId ${tvdbId} já tem versão com seeds` };
      }
    }
  }

  // 3. Check por título exato
  const existingByTitle = await Series.findOne({
    title: { $regex: new RegExp(`^${canonicalTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    _id: { $ne: seriesId }
  });
  if (existingByTitle) {
    return { isDuplicate: true, reason: `Título "${canonicalTitle}" já existe` };
  }

  return { isDuplicate: false, reason: '' };
}

/**
 * Pipeline completo e automático para séries:
 * 1. Resolve identidade canônica via TMDB
 * 2. Escaneia disco e identifica lacunas
 * 3. Busca e baixa todas as temporadas faltantes
 * 4. Organiza arquivos na estrutura Jellyfin
 * 5. Atualiza status no MongoDB
 * 6. Solicita refresh da biblioteca no Jellyfin
 */

export interface PipelineResult {
  seriesId: string;
  canonicalTitle: string;
  tmdbId: number | null;
  gapsFound: boolean;
  downloadsTriggered: number;
  filesOrganized: number;
  status: 'complete' | 'partial' | 'error';
  message: string;
}

/**
 * Pipeline principal: roda quando uma série é adicionada.
 * Tudo automatizado, sem intervenção manual.
 */
export async function runSeriesPipeline(
  seriesId: string,
  options: {
    basePath?: string;
    skipDownload?: boolean;
    organizeOnly?: boolean;
  } = {}
): Promise<PipelineResult> {
  const basePath = options.basePath || '/media/series';
  const series = await Series.findById(seriesId);

  if (!series) {
    return {
      seriesId, canonicalTitle: '', tmdbId: null,
      gapsFound: false, downloadsTriggered: 0, filesOrganized: 0,
      status: 'error', message: 'Série não encontrada',
    };
  }

  logger.info(COMPONENT, `Pipeline started for "${series.title}" (id: ${seriesId})`);

  // 1. Resolve identidade canônica via TMDB
  // canonicalTitle = título original (inglês) para diretórios e buscas consistentes
  let canonicalTitle = series.originalTitle || series.canonicalTitle || series.title;
  // searchTitles = variações de título para busca nos indexadores BR
  // (título original EN + título pt-BR limpo, sem subtítulo — indexadores BR usam ambos)
  const searchTitles = [...new Set([
    series.originalTitle || canonicalTitle,
    (series.title || '').split(':')[0].trim(),
    canonicalTitle,
  ].filter((t): t is string => !!t))];
  let tmdbId = series.tmdbId || null;

  try {
    if (!tmdbId) {
      const results = await TMDBService.searchSeries(series.title);
      if (results.length > 0) {
        tmdbId = results[0].tmdbId;
        canonicalTitle = results[0].originalName || results[0].name;
        series.tmdbId = tmdbId;
        series.canonicalTitle = canonicalTitle;
        if (results[0].originalName) series.originalTitle = results[0].originalName;
        if (results[0].totalSeasons) series.seasons = results[0].totalSeasons;
        if (results[0].totalEpisodes) series.totalEpisodes = results[0].totalEpisodes;
        await series.save();
        logger.info(COMPONENT, `TMDB resolved: "${series.title}" → "${canonicalTitle}" (tmdbId: ${tmdbId}, searchTitles: ${JSON.stringify(searchTitles)})`);
      }
    } else {
      const details = await TMDBService.getSeriesDetails(tmdbId);
      if (details) {
        canonicalTitle = details.originalName || details.name;
        series.canonicalTitle = canonicalTitle;
        if (details.originalName) series.originalTitle = details.originalName;
        series.seasons = details.totalSeasons || series.seasons;
        series.totalEpisodes = details.totalEpisodes || series.totalEpisodes;
        await series.save();
      }
      // Resolve tvdbId via TMDB external_ids se estiver faltando (ex.: busca em português)
      if (!series.tvdbId) {
        try {
          const ext = await TMDBService.getExternalIds(tmdbId);
          if (ext?.tvdbId) {
            series.tvdbId = ext.tvdbId;
            await series.save();
          }
        } catch { /* ignorado */ }
      }
    }
  } catch (err: any) {
    logger.warn(COMPONENT, `TMDB lookup failed, using existing title: ${err.message}`);
  }

  // 1b. Adiciona ao Sonarr (se tiver tvdbId e ainda não foi adicionado)
  if (!series.sonarrId && series.tvdbId) {
    try {
      const sonarrSeries = await SonarrService.addSeries(
        series.tvdbId,
        canonicalTitle,
        series.year || 0,
        4,
        '/media/series',
        series.seasons || 1
      );
      series.sonarrId = sonarrSeries.id;
      series.status = 'downloading';
      await series.save();
      logger.info(COMPONENT, `Series added to Sonarr: "${canonicalTitle}" (sonarrId: ${sonarrSeries.id})`);
    } catch (err: any) {
      logger.warn(COMPONENT, `Sonarr add failed, continuing with gap analysis: ${err.message}`);
    }
  }

  // Verificar queue do Sonarr após adicionar
  if (series.sonarrId) {
    try {
      const config = await SonarrService.getSonarrConfig();
      const { data: queue } = await axios.get(`${config.url}/api/v3/queue`, {
        headers: { 'X-Api-Key': config.apiKey },
        timeout: 10000,
      });
      logger.info(COMPONENT, `Sonarr queue after add`, { 
        seriesId: series.sonarrId, 
        queueLength: queue.records?.length || 0,
        items: queue.records?.map((r: any) => ({ title: r.title, status: r.status, size: r.size, sizeleft: r.sizeleft, downloadId: r.downloadId }))
      });
    } catch (err: any) {
      logger.warn(COMPONENT, `Failed to check Sonarr queue: ${err.message}`);
    }
  }

  // 2. Gap Analysis: o que já existe no disco vs o que deveria ter
  let downloadsTriggered = 0;
  let filesOrganized = 0;

  try {
    const analysis = await GapAnalysisService.analyzeSeriesGaps(canonicalTitle, tmdbId, basePath);
    logger.info(COMPONENT, `Gap analysis: ${analysis.totalExistingEpisodes}/${analysis.totalExpectedEpisodes} episodes, ${analysis.downloadPriority.length} seasons with gaps`);

    // 3. Organiza arquivos que já existem mas estão fora do padrão
    if (!options.skipDownload) {
      const organized = GapAnalysisService.organizeExistingFiles(canonicalTitle, basePath);
      filesOrganized = organized.length;
      if (filesOrganized > 0) {
        logger.info(COMPONENT, `Organized ${filesOrganized} existing files for "${canonicalTitle}"`);
      }
      // Verifica se alguma temporada ficou completa após organizar
      await markSeasonCompleteIfFull(seriesId, canonicalTitle, tmdbId, basePath);
    }

    // 4. Baixa temporadas faltantes (se Sonarr não pegou automaticamente)
    if (!options.skipDownload && analysis.downloadPriority.length > 0) {
      // Espera 30s para dar tempo do Sonarr iniciar os downloads automáticos
      if (series.sonarrId) {
        logger.info(COMPONENT, `Sonarr is managing "${canonicalTitle}", skipping ApacheTorrent fallback for 30s`);
        await new Promise((resolve) => setTimeout(resolve, 30000));
      }

      for (const gap of analysis.downloadPriority) {
        // NOVO: Validação preventiva de duplicatas (tmdbId/tvdbId/título)
        const dupCheck = await checkDuplicatePreventive(canonicalTitle, tmdbId, series.tvdbId || null, seriesId);
        if (dupCheck.isDuplicate) {
          logger.warn(COMPONENT, `Pulando temporada ${gap.season} — duplicata preventiva: ${dupCheck.reason}`);
          continue;
        }

        // NOVO: Limpeza de torrents 0-seeds da mesma série antes de iniciar
        await QBittorrentService.cleanupZeroSeedTorrents(canonicalTitle);

        // Dedupe: se já tem arquivos em disco para esta temporada, pula
        const alreadyOnDisk = await QBittorrentService.hasSeasonFilesOnDisk(canonicalTitle, gap.season, basePath);
        if (alreadyOnDisk) {
          logger.info(COMPONENT, `Season ${gap.season} already on disk for "${canonicalTitle}", skipping`);
          continue;
        }

        // Dedupe: se o qBittorrent já está baixando esta série+temporada
        // (ex.: o Sonarr pegou via Prowlarr), não adiciona outro torrent
        const alreadyDownloading = await QBittorrentService.hasActiveTorrentForSeason(canonicalTitle, gap.season);
        if (alreadyDownloading) {
          logger.info(COMPONENT, `Season ${gap.season} already downloading for "${canonicalTitle}", skipping`);
          continue;
        }

        logger.info(COMPONENT, `Downloading Season ${gap.season} (${gap.episodes.length} episodes missing) for "${canonicalTitle}"`);

        const seasonPath = `${basePath}/${canonicalTitle}/Season ${String(gap.season).padStart(2, '0')}`;

        // 1º: busca em TODOS os indexadores (ApacheTorrent + TorrentDosFilmes + Comando + HDRTorrent)
        // Tenta múltiplos títulos (original EN + pt-BR limpo) para maximizar chance
        let allResults: any[] = [];
        for (const st of searchTitles) {
          const r = await BRTorrentAggregator.searchAll(`${st} Season ${gap.season}`);
          logger.info(COMPONENT, `Search results for "${st} Season ${gap.season}": ${r.length} total magnets`);
          if (r.length > 0) {
            allResults = r;
            break;
          }
        }
        if (allResults.length > 0) {
          const batch = await ApacheTorrentService.addAllMagnets(allResults as any, seasonPath, undefined, gap.season);
          downloadsTriggered += batch.added;
          logger.info(COMPONENT, `BRTorrentAggregator Season ${gap.season}: ${batch.added} magnets added (from ${allResults.length} candidates)`);

          // Só cria o download se algum torrent foi efetivamente adicionado
          if (batch.added > 0 && batch.hashes.length > 0) {
            await createDownloadIfUnique({
              mediaId: seriesId,
              mediaType: 'series',
              title: canonicalTitle,
              poster: series.poster,
              status: 'downloading',
              hash: batch.hashes[0],
            });
            continue;
          }
          // Se o filtro de relevância rejeitou tudo, cai no fallback por episódio abaixo
        } else {
          logger.warn(COMPONENT, `NO RESULTS from any indexer for Season ${gap.season} of "${canonicalTitle}"`);
        }

        // 2º: fallback — PRIMEIRO tenta season pack via Prowlarr (melhores seeds)
        // antes de cair para episódios individuais
        let seasonPackResults: any[] = [];
        for (const st of searchTitles) {
          const query = `${st} Season ${gap.season}`;
          const r = await BRTorrentAggregator.searchAll(query);
          logger.info(COMPONENT, `Season pack search "${query}": ${r.length} results`);
          if (r.length > 0) {
            seasonPackResults = r;
            break;
          }
        }

        if (seasonPackResults.length > 0) {
          const batch = await ApacheTorrentService.addAllMagnets(seasonPackResults as any, seasonPath, undefined, gap.season);
          downloadsTriggered += batch.added;
          if (batch.added > 0 && batch.hashes.length > 0) {
            await createDownloadIfUnique({
              mediaId: seriesId,
              mediaType: 'series',
              title: canonicalTitle,
              poster: series.poster,
              status: 'downloading',
              hash: batch.hashes[0],
            });
            continue; // season pack baixado, pula episódios
          }
          if (batch.noSeedSeasons.length > 0) {
            logger.warn(COMPONENT, `Season pack S${String(gap.season).padStart(2, '0')}: ${seasonPackResults.length} candidates, NENHUM com seed real — removidos`);
          }
        }

        // 3º: fallback final por episódio (só se season pack falhou)
        for (const ep of gap.episodes) {
          let epResults: any[] = [];
          for (const st of searchTitles) {
            const query = `${st} S${String(gap.season).padStart(2, '0')}E${String(ep).padStart(2, '0')}`;
            const r = await BRTorrentAggregator.searchAll(query);
            logger.info(COMPONENT, `Episode search "${query}": ${r.length} results`);
            if (r.length > 0) {
              epResults = r;
              break;
            }
          }

          if (epResults.length > 0) {
            const batch = await ApacheTorrentService.addAllMagnets(epResults as any, seasonPath, undefined, gap.season);
            downloadsTriggered += batch.added;
            if (batch.noSeedSeasons.length > 0) {
              logger.warn(COMPONENT, `Episode S${String(gap.season).padStart(2, '0')}E${String(ep).padStart(2, '0')}: ${epResults.length} candidates, NENHUM com seed real — removidos`);
            }
          } else {
            logger.warn(COMPONENT, `NO RESULTS for episode S${String(gap.season).padStart(2, '0')}E${String(ep).padStart(2, '0')} of "${canonicalTitle}"`);
            const epQuery = `${searchTitles[0]} S${String(gap.season).padStart(2, '0')}E${String(ep).padStart(2, '0')}`;
            const sources = await RedeCanaisService.searchBR(epQuery);
            if (sources.length > 0) {
              const best = sources.find((s: any) =>
                s.quality === '1080p' || s.quality === 'Original' || s.quality === '720p'
              ) || sources[0];

              const saveDir = `${basePath}/${canonicalTitle}/Season ${String(gap.season).padStart(2, '0')}`;
              if (best.type === 'hls') {
                await RedeCanaisService.downloadHLS(best.url, saveDir, best.title);
              } else {
                const { execSync } = require('child_process');
                fs.mkdirSync(saveDir, { recursive: true });
                const safeName = best.title.replace(/[^a-zA-Z0-9\s\-_.]/g, '').trim();
                execSync(`curl -L -o "${saveDir}/${safeName}.mp4" "${best.url}"`, { timeout: 600000 });
              }
              downloadsTriggered++;
            } else {
              logger.warn(COMPONENT, `RedeCanais also returned NO RESULTS for "${epQuery}"`);
            }
          }
        }
      }
    }
  } catch (err: any) {
    logger.error(COMPONENT, `Pipeline analysis/download error: ${err.message}`);
  }

  // 5. Refresh Jellyfin
  try {
    await JellyfinService.refreshLibrary('series');
    logger.info(COMPONENT, `Jellyfin library refresh triggered for "${canonicalTitle}"`);
  } catch (err: any) {
    logger.warn(COMPONENT, `Jellyfin refresh failed: ${err.message}`);
  }

  const status = downloadsTriggered === 0 && filesOrganized === 0 ? 'complete' : 'partial';
  const message = downloadsTriggered > 0
    ? `${downloadsTriggered} downloads iniciados, ${filesOrganized} arquivos organizados`
    : filesOrganized > 0
      ? `${filesOrganized} arquivos organizados na estrutura Jellyfin`
      : 'Série completa, nada para fazer';

  logger.info(COMPONENT, `Pipeline finished for "${canonicalTitle}": ${message}`);

  return {
    seriesId,
    canonicalTitle,
    tmdbId,
    gapsFound: downloadsTriggered > 0,
    downloadsTriggered,
    filesOrganized,
    status,
    message,
  };
}

/**
 * Chamado quando um download é concluído (detectado pelo WebSocket).
 * Organiza os arquivos e atualiza status.
 */
export async function onDownloadComplete(
  mediaId: string,
  mediaType: string,
  downloadTitle: string
): Promise<void> {
  if (mediaType === 'series') {
    try {
      const series = await Series.findById(mediaId);
      if (!series) return;

      const basePath = '/media/series';
      const canonicalTitle = series.canonicalTitle || series.title;

      // Organiza arquivos da série
      const organized = organizeDirectory(
        path.join(basePath, canonicalTitle),
        canonicalTitle,
        undefined,
        basePath
      );

      if (organized.length > 0) {
        logger.info(COMPONENT, `Post-download: organized ${organized.length} files for "${canonicalTitle}"`);
      }

      // Re-análise para verificar se está completa
      const analysis = await GapAnalysisService.analyzeSeriesGaps(
        series.originalTitle || series.canonicalTitle || series.title,
        series.tmdbId || null,
        basePath
      );

      if (analysis.allComplete) {
        series.status = 'available';
        await series.save();
        logger.info(COMPONENT, `"${canonicalTitle}" is now COMPLETE (${analysis.totalExistingEpisodes} episodes)`);
      }

      // Refresh Jellyfin
      await JellyfinService.refreshLibrary('series');
    } catch (err: any) {
      logger.error(COMPONENT, `Post-download processing failed: ${err.message}`);
    }
  } else if (mediaType === 'movie') {
    try {
      // Para filmes: merge duplicatas e refresh Jellyfin
      const merged = await MediaScannerService.mergeDuplicateMovies();
      if (merged > 0) {
        logger.info(COMPONENT, `Post-download: merged ${merged} duplicate movies`);
      }
      await JellyfinService.refreshLibrary('movies');
      logger.info(COMPONENT, `Jellyfin library refresh triggered for movies`);
    } catch (err: any) {
      logger.error(COMPONENT, `Post-download movie processing failed: ${err.message}`);
    }
  } else if (mediaType === 'series') {
    try {
      // Para séries: merge duplicatas e refresh Jellyfin
      const merged = await MediaScannerService.mergeDuplicateSeries();
      if (merged > 0) {
        logger.info(COMPONENT, `Post-download: merged ${merged} duplicate series`);
      }
      await JellyfinService.refreshLibrary('series');
      logger.info(COMPONENT, `Jellyfin library refresh triggered for series`);
    } catch (err: any) {
      logger.error(COMPONENT, `Post-download series processing failed: ${err.message}`);
    }
  }
}

export const AutoPipelineService = {
  runSeriesPipeline,
  onDownloadComplete,
  reconcilePendingSeries,
};

/**
 * Reconcilia séries travadas em 'pending' sem download ativo.
 *
 * Um item fica "preso" em pending quando:
 *  - O pipeline inicial (runSeriesPipeline) rodou mas não encontrou magnet/fonte BR;
 *    o status não foi revertido (o pipeline deixa o status como estava).
 *  - Ou o download foi removido do qBittorrent/sonarr mas a série ainda aponta pending.
 *
 * O serviço:
 *  1. Busca séries 'pending' com updatedAt >= 30min atrás (backoff, evita spam).
 *  2. Pula se já existir Download ativo (queued/downloading) ou torrent ativo no qBit.
 *  3. Reinjeta no pipeline (busca BR + addAllMagnets) e marca como 'downloading'.
 */
const RECONCILE_BACKOFF_MS = 30 * 60 * 1000;
const RECONCILE_MAX_PER_RUN = 3;
let reconcileRunning = false;

async function hasActiveTorrentForSeries(seriesTitle: string): Promise<boolean> {
  const FAILED_STATES = new Set(['error', 'missingFiles', 'checkingResumeData', 'checkingSavePath', 'stalledUP', 'queuedUP', 'uploading', 'pausedUP', 'forcedUP']);
  try {
    const torrents = await QBittorrentService.getTorrents();
    const norm = normalizeTitleForMatch(seriesTitle);
    return torrents.some((t: any) => {
      if (FAILED_STATES.has(t.state)) return false;
      const tn = normalizeTitleForMatch(t.name);
      // Match by title (broad) — the pipeline already dedupes per-season via hasActiveTorrentForSeason
      return tn.includes(norm) || norm.includes(tn);
    });
  } catch {
    return false;
  }
}

export async function reconcilePendingSeries(): Promise<void> {
  if (reconcileRunning) return;
  reconcileRunning = true;
  try {
    const cutoff = new Date(Date.now() - RECONCILE_BACKOFF_MS);
    const seriesList = await Series.find({ status: 'pending', updatedAt: { $lte: cutoff } })
      .sort({ updatedAt: 1 })
      .limit(RECONCILE_MAX_PER_RUN);
    if (seriesList.length === 0) {
      logger.info(COMPONENT, 'reconcilePendingSeries: nenhuma série pendente (backoff)');
      return;
    }
    logger.info(COMPONENT, `reconcilePendingSeries: ${seriesList.length} série(s) pendente(s) para reinjeção`);
    for (const s of seriesList) {
      const mediaId = s._id.toString();
      // Dedupe: já existe download ativo (queued/downloading)
      const activeDownload = await Download.findOne({
        mediaId,
        status: { $in: ['queued', 'downloading'] },
      });
      if (activeDownload) {
        logger.info(COMPONENT, `  "${s.title}" já tem download ativo (hash=${activeDownload.hash}), pulando`);
        continue;
      }
      // Dedupe: torrent ativo no qBittorrent (evita reinjetar se o pipeline já colocou algo)
      const canonical = s.canonicalTitle || s.title;
      const hasActiveTorrent = await hasActiveTorrentForSeries(canonical);
      if (hasActiveTorrent) {
        logger.info(COMPONENT, `  "${s.title}" já tem torrent ativo no qBittorrent, pulando`);
        continue;
      }
      logger.info(COMPONENT, `  Reconciliando "${s.title}" (tmdbId=${s.tmdbId})`);
      // Marca como downloading ANTES de rodar o pipeline para impedir re-entrada em rodadas consecutivas.
      s.status = 'downloading';
      await s.save();
      try {
        await runSeriesPipeline(mediaId);
      } catch (err: any) {
        logger.warn(COMPONENT, `  Pipeline falhou para "${s.title}": ${err.message}`);
        // Não reverte para pending — deixa o status como 'downloading' para a próxima rodada de reconcile.
      }
    }
  } catch (err: any) {
    logger.warn(COMPONENT, `reconcilePendingSeries erro: ${err.message}`);
  } finally {
    reconcileRunning = false;
  }
}
