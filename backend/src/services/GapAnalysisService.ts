// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { parseMediaFilename, organizeMediaFile, organizeDirectory } from '../utils/mediaOrganizer';
import { TMDBService, type TMDBSeriesResult, type TMDBEpisode } from './TMDBService';

const COMPONENT = 'GapAnalysisService';
const MEDIA_EXTS = ['.mkv', '.mp4', '.avi', '.ts', '.rmvb', '.flv', '.wmv', '.m4v'];

export interface SeasonGap {
  seasonNumber: number;
  totalExpected: number;
  existingEpisodes: number[];
  missingEpisodes: number[];
  isComplete: boolean;
}

export interface SeriesGapAnalysis {
  seriesTitle: string;
  tmdbId: number | null;
  canonicalTitle: string | null;
  totalSeasons: number;
  totalExpectedEpisodes: number;
  totalExistingEpisodes: number;
  seasons: SeasonGap[];
  allComplete: boolean;
  downloadPriority: Array<{ season: number; episodes: number[] }>;
}

/**
 * Mapeia arquivos existentes em uma pasta de série no disco.
 * Retorna um mapa: temporada → [episódios encontrados]
 */
function scanDiskEpisodes(seriesPath: string): Map<number, number[]> {
  const seasonMap = new Map<number, number[]>();

  if (!fs.existsSync(seriesPath)) return seasonMap;

  const entries = fs.readdirSync(seriesPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Pasta de temporada: Season 01, Season 1, S01, Temporada 1, etc.
      const seasonMatch = entry.name.match(/(?:Season|Temporada|S)\s*(\d{1,2})/i);
      if (!seasonMatch) continue;

      const seasonNum = parseInt(seasonMatch[1]);
      const seasonDir = path.join(seriesPath, entry.name);
      const episodes: number[] = [];

      const files = fs.readdirSync(seasonDir);
      for (const file of files) {
        if (!MEDIA_EXTS.includes(path.extname(file).toLowerCase())) continue;

        const parsed = parseMediaFilename(file);
        if (parsed && parsed.season === seasonNum && parsed.episode) {
          if (!episodes.includes(parsed.episode)) {
            episodes.push(parsed.episode);
          }
        }
      }

      // Se não conseguiu extrair episódios dos nomes, tenta contar arquivos
      if (episodes.length === 0) {
        const mediaFiles = files.filter(f => MEDIA_EXTS.includes(path.extname(f).toLowerCase()));
        for (let i = 0; i < mediaFiles.length; i++) {
          episodes.push(i + 1); // Atribui números sequenciais
        }
      }

      seasonMap.set(seasonNum, episodes.sort((a, b) => a - b));
    } else if (entry.isFile()) {
      // Arquivo na raiz (fora de pasta de temporada)
      if (!MEDIA_EXTS.includes(path.extname(entry.name).toLowerCase())) continue;

      const parsed = parseMediaFilename(entry.name);
      if (parsed?.season && parsed?.episode) {
        const existing = seasonMap.get(parsed.season) || [];
        if (!existing.includes(parsed.episode)) {
          existing.push(parsed.episode);
          seasonMap.set(parsed.season, existing.sort((a, b) => a - b));
        }
      } else {
        // Arquivo sem info de temporada, assume temporada 1
        const existing = seasonMap.get(1) || [];
        existing.push(existing.length + 1);
        seasonMap.set(1, existing);
      }
    }
  }

  return seasonMap;
}

/**
 * Analisa lacunas entre o que está no disco e o que a série deveria ter (TMDB).
 * Se não tiver TMDB ID, usa apenas a análise do disco.
 */
export async function analyzeSeriesGaps(
  seriesTitle: string,
  tmdbId: number | null,
  basePath: string = '/media/series'
): Promise<SeriesGapAnalysis> {
  // 1. Busca dados canônicos no TMDB (se tiver ID)
  let tmdbData: TMDBSeriesResult | null = null;
  if (tmdbId) {
    tmdbData = await TMDBService.getSeriesDetails(tmdbId);
  }

  // Se não tem TMDB, busca por título
  if (!tmdbData) {
    const results = await TMDBService.searchSeries(seriesTitle);
    tmdbData = results[0] || null;
  }

  const canonicalTitle = tmdbData?.name || seriesTitle;
  const originalName = tmdbData?.originalName || canonicalTitle;
  const totalSeasons = tmdbData?.totalSeasons || 0;
  const totalExpected = tmdbData?.totalEpisodes || 0;

  // 2. Monta caminho da série no disco
  // A pasta do Sonarr usa o título original (EN): tenta originalName primeiro,
  // depois o nome pt-BR e por fim o título informado.
  const seriesPathCandidates = [
    path.join(basePath, originalName),
    tmdbData?.year ? path.join(basePath, `${originalName} (${tmdbData.year})`) : null,
    path.join(basePath, canonicalTitle),
    tmdbData?.year ? path.join(basePath, `${canonicalTitle} (${tmdbData.year})`) : null,
    path.join(basePath, seriesTitle),
  ].filter(Boolean) as string[];

  let seriesPath = seriesPathCandidates.find((p) => fs.existsSync(p)) || seriesPathCandidates[seriesPathCandidates.length - 1];

  // 3. Escaneia disco
  const diskEpisodes = scanDiskEpisodes(seriesPath);

  // 4. Monta análise de gaps
  const seasons: SeasonGap[] = [];
  const downloadPriority: Array<{ season: number; episodes: number[] }> = [];

  if (tmdbData && tmdbData.seasons.length > 0) {
    // Tem dados TMDB: compara cada temporada
    for (const tmdbSeason of tmdbData.seasons) {
      const existing = diskEpisodes.get(tmdbSeason.seasonNumber) || [];
      const expected = Array.from({ length: tmdbSeason.episodeCount }, (_, i) => i + 1);
      const missing = expected.filter(ep => !existing.includes(ep));

      seasons.push({
        seasonNumber: tmdbSeason.seasonNumber,
        totalExpected: tmdbSeason.episodeCount,
        existingEpisodes: existing,
        missingEpisodes: missing,
        isComplete: missing.length === 0,
      });

      if (missing.length > 0) {
        downloadPriority.push({ season: tmdbSeason.seasonNumber, episodes: missing });
      }
    }
  } else {
    // Sem dados TMDB: reporta apenas o que tem no disco
    for (const [seasonNum, episodes] of diskEpisodes) {
      seasons.push({
        seasonNumber: seasonNum,
        totalExpected: episodes.length,
        existingEpisodes: episodes,
        missingEpisodes: [],
        isComplete: true,
      });
    }
  }

  const totalExisting = seasons.reduce((sum, s) => sum + s.existingEpisodes.length, 0);
  const allComplete = seasons.every(s => s.isComplete);

  const analysis: SeriesGapAnalysis = {
    seriesTitle,
    tmdbId: tmdbData?.tmdbId || tmdbId,
    canonicalTitle,
    totalSeasons: totalSeasons || seasons.length,
    totalExpectedEpisodes: totalExpected || totalExisting,
    totalExistingEpisodes: totalExisting,
    seasons,
    allComplete,
    downloadPriority,
  };

  logger.info(COMPONENT, `Analysis for "${seriesTitle}": ${totalExisting}/${totalExpected || '?'} episodes, ${downloadPriority.length} seasons with gaps`);
  return analysis;
}

/**
 * Organiza arquivos já baixados na estrutura Jellyfin.
 * Útil para processar conteúdo que já está no disco mas fora do padrão.
 */
const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'de', 'da', 'do', 'das', 'dos', 'e', 'o', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com', 'como', 'que', 'ser', 'is', 'are', 'was', 'were', 'se']);

function normalizeWord(w: string): string {
  return w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function significantWords(title: string): string[] {
  return title
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Resolve o diretório de uma série no disco de forma segura.
 * Não usa "primeira palavra" sozinha (evita confundir "The Middle" com "The Mentalist").
 */
function resolveSeriesDirectory(seriesTitle: string, basePath: string): string | null {
  const candidates = [seriesTitle];
  const beforeColon = seriesTitle.split(':')[0].trim();
  if (beforeColon && beforeColon !== seriesTitle) candidates.push(beforeColon);

  for (const name of candidates) {
    const exact = path.join(basePath, name);
    if (fs.existsSync(exact)) return exact;
  }

  let baseEntries: fs.Dirent[] = [];
  try {
    baseEntries = fs.readdirSync(basePath, { withFileTypes: true });
  } catch {
    return null;
  }
  const dirs = baseEntries.filter((e) => e.isDirectory()).map((e) => e.name);

  // 1) Casa todas as palavras significativas do título
  const sig = significantWords(seriesTitle);
  if (sig.length > 0) {
    const fullMatches = dirs.filter((d) => {
      const dWords = d.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return sig.every((w) => dWords.includes(w));
    });
    if (fullMatches.length === 1) return path.join(basePath, fullMatches[0]);
    if (fullMatches.length > 1) {
      logger.warn(COMPONENT, `Ambiguous series dir for "${seriesTitle}" (${fullMatches.join(', ')}), skipping organize`);
      return null;
    }
  }

  // 2) Fallback: primeira palavra significativa, apenas se for única correspondência
  if (sig.length > 0) {
    const partial = dirs.filter((d) => {
      const dWords = d.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return dWords.includes(sig[0]);
    });
    if (partial.length === 1) return path.join(basePath, partial[0]);
  }

  return null;
}

export function organizeExistingFiles(
  seriesTitle: string,
  basePath: string = '/media/series'
): string[] {
  const seriesPath = resolveSeriesDirectory(seriesTitle, basePath);

  if (!seriesPath) {
    logger.warn(COMPONENT, `Series directory not found: ${seriesTitle}`);
    return [];
  }

  return organizeDirectory(seriesPath, seriesTitle, undefined, basePath);
}

/**
 * Retorna status resumido de uma série para o frontend.
 */
export function getStatusSummary(analysis: SeriesGapAnalysis): string {
  if (analysis.allComplete) return 'complete';
  if (analysis.totalExistingEpisodes === 0) return 'empty';
  return 'partial';
}

/**
 * Verifica se uma temporada está completa (todos os episódios esperados existem em disco).
 * Usa o TMDB para saber quantos episódios a temporada deve ter.
 */
export async function isSeasonCompleteOnDisk(
  seriesTitle: string,
  season: number,
  tmdbId: number | null,
  basePath: string = '/media/series'
): Promise<{ complete: boolean; expected: number; existing: number }> {
  if (!tmdbId) return { complete: false, expected: 0, existing: 0 };

  try {
    // Busca episódios da temporada no TMDB
    const episodes = await TMDBService.getSeasonEpisodes(tmdbId, season);
    if (!episodes || episodes.length === 0) return { complete: false, expected: 0, existing: 0 };

    const expectedEpisodes = episodes.length;
    if (expectedEpisodes === 0) return { complete: false, expected: 0, existing: 0 };

    // Escaneia disco
    const seriesPath = resolveSeriesDirectory(seriesTitle, basePath);
    if (!seriesPath) return { complete: false, expected: expectedEpisodes, existing: 0 };

    const seasonMap = scanDiskEpisodes(seriesPath);
    const existingEpisodes = seasonMap.get(season) || [];

    const uniqueExisting = new Set(existingEpisodes.filter(e => e >= 1 && e <= expectedEpisodes)).size;

    return {
      complete: uniqueExisting >= expectedEpisodes,
      expected: expectedEpisodes,
      existing: uniqueExisting,
    };
  } catch {
    return { complete: false, expected: 0, existing: 0 };
  }
}

/**
 * Marca uma temporada como completa no banco (atualiza status da série se todas temporadas completas).
 */
export async function markSeasonCompleteIfFull(
  seriesId: string,
  seriesTitle: string,
  tmdbId: number | null,
  basePath: string = '/media/series'
): Promise<void> {
  if (!tmdbId) return;
  try {
    const seriesDetails = await TMDBService.getSeriesDetails(tmdbId);
    if (!seriesDetails) return;

    let allComplete = true;
    for (const season of seriesDetails.seasons) {
      if (season.seasonNumber === 0) continue; // pula specials
      const check = await isSeasonCompleteOnDisk(seriesTitle, season.seasonNumber, tmdbId, basePath);
      if (!check.complete) {
        allComplete = false;
        break;
      }
    }

    if (allComplete) {
      await import('../models/Series').then(m => m.Series.findByIdAndUpdate(seriesId, { status: 'available' }));
      logger.info(COMPONENT, `Series "${seriesTitle}" marked as fully available (all seasons complete)`);
    }
  } catch (err: any) {
    logger.warn(COMPONENT, `Failed to mark season complete: ${err.message}`);
  }
}

export const GapAnalysisService = {
  analyzeSeriesGaps,
  organizeExistingFiles,
  scanDiskEpisodes,
  getStatusSummary,
};
