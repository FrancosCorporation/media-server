// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { logger } from '../utils/logger';
import { TranslationService } from './TranslationService';
import { extractSeasonFromPageTitle, normalizeTitleForMatch } from '../utils/mediaOrganizer';
import { QBittorrentService } from './QBittorrentService';
import { CloudflareBypassService, fetchWithBypass } from './CloudflareBypassService';

const COMPONENT = 'ApacheTorrent';

// ── Regra de tamanho: filmes máx 3 GB, séries sem limite ───────────────────
const MAX_MOVIE_SIZE_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB

// Regex de permissão estrita — O torrent SÓ passa se tiver 100% de certeza que é PT-BR
const PTBR_WHITELIST = /\b(dub(lad[oá])?|dual(?:\s*(?:á|a)udio)?|pt[-_.]?br|portugu[eê]s|nacional)\b/i;

// Regex de rejeição imediata — qualquer marcador estrangeiro mata o torrent
const FOREIGN_BLACKLIST = /\b(french|vff|vf2?|vfq|fre\b|fra\b|eng\b|en\s|es\b|subbed|ita|somm|rus(sian)?\b|esp\b|espa[nñ]ol|spanish|latino|multi(?![^.]*\bbr\b))\b/i;

const RESOLUTION_1080_REGEX = /(?:1080p|1080|FHD)/i;
const RESOLUTION_720_REGEX = /(?:720p|720)/i;
const RESOLUTION_BAD_REGEX = /(?:480p|CAM|TS|Telesync|3D|HSBS|SBS|SDTV)/i;
const H264_REGEX = /(?:x264|h\.?264|avc)/i;
const HEVC_REGEX = /(?:x265|hevc|h\.?265|10bit)/i;

interface ApacheResult {
  title: string;
  magnet: string;
  seasonPage: string;
  seasonNumber?: number;
  seriesTitle?: string;
  movieYear?: number;
  seeders?: number;
  size?: number; // bytes — extracted from page HTML when available
}

interface ScoredResult {
  result: ApacheResult;
  resolution: number;
  isH264: boolean;
}

function isPTBR(title: string): boolean {
  const t = title.toLowerCase();
  if (FOREIGN_BLACKLIST.test(t)) {
    logger.warn(COMPONENT, `[REJEITADO - IDIOMA INCOMPATÍVEL - BLACKLIST] "${title}"`);
    return false;
  }
  const ok = PTBR_WHITELIST.test(t);
  if (!ok) {
    logger.warn(COMPONENT, `[REJEITADO - IDIOMA INCOMPATÍVEL] "${title}"`);
  }
  return ok;
}

function scoreTorrent(r: ApacheResult, isMovie = false): ScoredResult | null {
  const title = r.title.toLowerCase();

  if (RESOLUTION_BAD_REGEX.test(title)) return null;
  if (!isPTBR(title)) return null;

  // Regra 3GB: filmes com tamanho conhecido > 3GB são rejeitados
  if (isMovie && r.size && r.size > MAX_MOVIE_SIZE_BYTES) {
    logger.warn(COMPONENT, `[REJEITADO - TAMANHO] "${r.title}" (${(r.size / 1024 / 1024 / 1024).toFixed(1)}GB > 3GB)`);
    return null;
  }

  return {
    result: r,
    resolution: RESOLUTION_1080_REGEX.test(title) ? 0 : RESOLUTION_720_REGEX.test(title) ? 1 : 2,
    isH264: H264_REGEX.test(title) && !HEVC_REGEX.test(title),
  };
}

const SERIES_STOPWORDS = new Set([
  'the', 'o', 'os', 'a', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'em', 'e', 'para',
  'season', 'temporada', 'tempordada', 'completa', 'completo', 'complete', 'com', 'baixarapido',
  'apachetorrent', 'hdr', 'hdrTorrent', 'www', 'comando', 'original', 'torrent', 'legendado',
  'dublado', 'dual', 'audio', 'áudio',   'bluray', '1080p', '720p', 'web', 'dl', 'rip', 'mkv',
  '1080', '720', 'x264', 'x265', 'hevc', 'h264', 'by', 'br', 'hd',
  'this', 'that', 'is', 'are', 'was', 'were', 'for', 'and', 'with', 'you', 'your', 'not',
  'aac', 'ac3', 'dts', 'dd', 'ddp', 'eac3', 'truehd', 'mp4', 'avi', '10bit', '8bit', 'remux',
  'webrip', 'brrip', 'hdrip', 'webdl', 'hdtv', 'repack', 'proper', 'extended', 'uncut',
  'ita', 'eng', 'esp', 'ptbr', '1080', 'fhd', 'uhd', '2160p', '4k', 'sdr', 'hdr10', 'web',
  'nf', 'amzn', 'dsnp', 'ghost', 'utr', 'flux', 'cakes', 'dimension', 'krave', 'kontrast',
  'prime', 'ion', 'ion265', 'psa', 'derew', 'luanharper', 'luan', 'harper', 'sujaidr',
  'pimprg', 'mrlss', 'v3sp4ev3r', 'bludv', 'yg', 'fb', 'tpf', 'filmhd', 'joy', 'rartv',
  'legenda', 'legendas', 'episodio', 'episódio', 'capitulo', 'capítulo', 'temporadas',
  'remastered', 'edicao', 'edição', 'special', 'extras', 'box', 'pack', 'galaxy', 'yts',
  'yify', 'rarbg', 'eztv', 'ettv', 'cmg', 'xvid', 'avc', 'german', 'hindi', 'japanese',
  'italian', 'french', 'spanish', 'chinese', 'korean', 'hdman', 'ion10', 'dvdrip', 'bdrip',
  'dub', 'dual-audio', 'web-dl', 'dvd', '480p', '480', 'flac', 'mp3', 'opus', 'h265',
  'idioma', 'version', 'complete-series', 'udio', 'baixe', 'dublada', 'dubladas', 'dublado',
  'series', '2ch', 'ddp5', 'dd5', 'dolby', 'kitsune', 'edith', 'grace', 'bae', 'bioma',
  'megusta', 'ntb', 'elite', 'amb3r', 'npms', 'playweb', 'toonshub', 'varyg', 'rmteam',
  'ngp', 'jff', 'rawr', 'lazy', 'dolores', 'xebec', 'higgsboson', 'successfulcrab',
  'galaxytv', 'hhweb', 'ethel', 'kinopok', 'utopia', 'mls', 'sajja', 'don', 'daddyrpm',
  'x0r', 'blabla', 'rarbg', 'figment', 'webified', 'ggez', 'megusta', 'baileys', 'xander',
  'medical', 'division', 'sub', 'subs', 'subtitulo', 'subtítulos', 'lullozzo', 'stblz',
]);

function firstSignificantToken(title: string): string | null {
  const tokens = normalizeTitleForMatch(title).split(' ').filter((t) => t.length > 2 && !SERIES_STOPWORDS.has(t));
  return tokens[0] || null;
}

const LEAD_PREFIXES = new Set([
  'the', 'a', 'an', 'o', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'em', 'e',
  'comoeubaixo', 'comoeu', 'apachetorrent', 'vacatorrent', 'hdrtorrent', 'hdr',
  'torrentdosfilmes', 'bludv', 'comando', 'baixarapido', 'www', 'mp4',
]);

function isSameSeries(torrentTitle: string, expectedSeries: string): boolean {
  const seriesPhrase = normalizeTitleForMatch(expectedSeries);
  const torrentPhrase = normalizeTitleForMatch(torrentTitle);

  const seriesTokens = seriesPhrase.split(' ').filter((t) => t.length > 2 && !SERIES_STOPWORDS.has(t));
  const torrentRaw = torrentPhrase.split(' ').filter((t) => t.length > 2);
  const torrentTokens = torrentRaw.filter((t) => !SERIES_STOPWORDS.has(t));

  if (seriesTokens.length === 0) {
    return seriesPhrase.length >= 3 && torrentPhrase.includes(seriesPhrase);
  }

  const allPresent = seriesTokens.every((st) =>
    torrentTokens.some((tt) => tt.includes(st) || st.includes(tt))
  );
  if (!allPresent) return false;

  const lead = seriesTokens[0];
  const leadIndex = torrentRaw.findIndex((tt) => tt.includes(lead) || lead.includes(tt));
  if (leadIndex === -1) return false;
  for (let i = 0; i < leadIndex; i++) {
    if (!LEAD_PREFIXES.has(torrentRaw[i]) && !SERIES_STOPWORDS.has(torrentRaw[i])) return false;
  }

  if (seriesTokens.length === 1) {
    const isQualifier = (t: string) =>
      /\d/.test(t) ||
      LEAD_PREFIXES.has(t) ||
      SERIES_STOPWORDS.has(t);
    const foreign = torrentRaw.filter(
      (t) => !isQualifier(t) && !(t.includes(lead) || lead.includes(t))
    );
    if (foreign.length > 0) return false;
  }

  return true;
}

function significantTokens(title: string): string[] {
  return normalizeTitleForMatch(title)
    .split(' ')
    .filter((t) => t.length > 2 && !SERIES_STOPWORDS.has(t) && !LEAD_PREFIXES.has(t));
}

/**
 * Verifica se o release é do filme certo. Sem isso, a busca do Apache pode
 * devolver filmes DIFERENTES que batem apenas por ano+idioma (ex: "O Afinador"
 * no lugar de "The Drama" em busca de 2026) — o que causava download errado.
 */
function isSameMovie(torrentTitle: string, movieTitle: string): boolean {
  const movieTokens = significantTokens(movieTitle);
  if (movieTokens.length === 0) return false;

  const torrentTokens = significantTokens(torrentTitle);
  if (torrentTokens.length === 0) return false;

  const common = movieTokens.filter((w) =>
    torrentTokens.some((tt) => tt.includes(w) || w.includes(tt))
  );

  return common.length >= 2 || (movieTokens.length === 1 && common.length === 1);
}

function selectBestTorrent(results: ApacheResult[], year?: number, expectedSeries?: string, isMovie = false): ApacheResult | null {
  const scored = results
    .map(r => scoreTorrent(r, isMovie))
    .filter((s): s is ScoredResult => s !== null)
    .filter((s) => {
      if (!year) return true;
      const yearStr = year.toString();
      const yearMatch = s.result.title.match(/\b(19\d{2}|20\d{2})\b/);
      return !yearMatch || yearMatch[0] === yearStr;
    })
    .filter((s) => !expectedSeries || isSameSeries(s.result.title, expectedSeries));

  if (scored.length === 0) {
    logger.info(COMPONENT, 'Filter: no viable PT-BR torrent found after scoring');
    return null;
  }

  scored.sort((a, b) => {
    const aSeeds = a.result.seeders || 0;
    const bSeeds = b.result.seeders || 0;
    const aHasSeeds = aSeeds > 0;
    const bHasSeeds = bSeeds > 0;
    if (aHasSeeds !== bHasSeeds) return aHasSeeds ? -1 : 1;
    if (a.resolution !== b.resolution) return a.resolution - b.resolution;
    if (a.isH264 !== b.isH264) return a.isH264 ? -1 : 1;
    return bSeeds - aSeeds;
  });

  const best = scored[0];
  logger.info(COMPONENT, `Filter: ${results.length} → ${scored.length} PT-BR candidates → best: "${best.result.title}" (${best.result.seeders || '?'} seeds, ${best.resolution === 0 ? '1080p' : best.resolution === 1 ? '720p' : 'res-desconhecida'}${best.isH264 ? ', H.264' : ''})`);
  return best.result;
}

function selectBestPerSeason(results: ApacheResult[], year?: number, expectedSeries?: string): ApacheResult[] {
  const bySeason = new Map<number, ApacheResult[]>();

  for (const r of results) {
    const season = r.seasonNumber || 0;
    const existing = bySeason.get(season) || [];
    existing.push(r);
    bySeason.set(season, existing);
  }

  const best: ApacheResult[] = [];
  for (const [season, seasonResults] of bySeason) {
    const winner = selectBestTorrent(seasonResults, year, expectedSeries);
    if (winner) {
      best.push(winner);
      logger.info(COMPONENT, `Season ${season || '?'}: selected "${winner.title}"`);
    }
  }

  return best;
}

function selectTopPerSeason(results: ApacheResult[], year?: number, expectedSeries?: string, topN = 3): Map<number, ApacheResult[]> {
  const bySeason = new Map<number, ScoredResult[]>();

  for (const r of results) {
    const scored = scoreTorrent(r);
    if (!scored) continue;
    if (year) {
      const yearStr = year.toString();
      const yearMatch = r.title.match(/\b(19\d{2}|20\d{2})\b/);
      if (yearMatch && yearMatch[0] !== yearStr) continue;
    }
    if (expectedSeries && !isSameSeries(r.title, expectedSeries)) continue;
    const season = r.seasonNumber || 0;
    const existing = bySeason.get(season) || [];
    existing.push(scored);
    bySeason.set(season, existing);
  }

  const result = new Map<number, ApacheResult[]>();
  for (const [season, list] of bySeason) {
    list.sort((a, b) => {
      const aSeeds = a.result.seeders || 0;
      const bSeeds = b.result.seeders || 0;
      const aHasSeeds = aSeeds > 0;
      const bHasSeeds = bSeeds > 0;
      if (aHasSeeds !== bHasSeeds) return aHasSeeds ? -1 : 1;
      if (a.resolution !== b.resolution) return a.resolution - b.resolution;
      if (a.isH264 !== b.isH264) return a.isH264 ? -1 : 1;
      return bSeeds - aSeeds;
    });
    result.set(season, list.slice(0, topN).map(s => s.result));
  }
  return result;
}

function rankByRealSeeds<T extends { result: ApacheResult; hash: string; seeds: number }>(candidates: T[]): T[] {
  return candidates.slice().sort((a, b) => {
    const aHas = a.seeds > 0;
    const bHas = b.seeds > 0;
    if (aHas !== bHas) return aHas ? -1 : 1;
    const aRes = RESOLUTION_1080_REGEX.test(a.result.title) ? 0 : RESOLUTION_720_REGEX.test(a.result.title) ? 1 : 2;
    const bRes = RESOLUTION_1080_REGEX.test(b.result.title) ? 0 : RESOLUTION_720_REGEX.test(b.result.title) ? 1 : 2;
    if (aRes !== bRes) return aRes - bRes;
    const aH = H264_REGEX.test(a.result.title) && !HEVC_REGEX.test(a.result.title);
    const bH = H264_REGEX.test(b.result.title) && !HEVC_REGEX.test(b.result.title);
    if (aH !== bH) return aH ? -1 : 1;
    return b.seeds - a.seeds;
  });
}

async function searchPages(query: string): Promise<Array<{ title: string; url: string }>> {
  const translatedQuery = await TranslationService.translate(query, 'en', 'pt-BR');
  logger.info(COMPONENT, `Translated: "${query}" → "${translatedQuery}"`);

  const searchUrls = [`https://apachetorrent.com/index.php?s=${encodeURIComponent(translatedQuery)}`];
  if (translatedQuery.toLowerCase() !== query.toLowerCase()) {
    searchUrls.push(`https://apachetorrent.com/index.php?s=${encodeURIComponent(query)}`);
  }

  const allPages: Array<{ title: string; url: string }> = [];

  for (const searchUrl of searchUrls) {
    try {
      logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${searchUrl}`);
      const response = await fetchWithBypass(searchUrl, { timeout: 15000 });
      const html = response.data;

      const regex = /<div\s+class='capaname'>\s*<a\s+href='([^']+)'[^>]*title='([^']+)'/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const url = match[1];
        const title = match[2];
        if (!allPages.find(p => p.url === url)) {
          allPages.push({ title, url });
        }
      }

      if (allPages.length > 0) break;
    } catch (err: any) {
      logger.warn(COMPONENT, `Search failed: ${err.message}`);
    }
  }

  return allPages;
}

function deduplicatePages(pages: Array<{ title: string; url: string }>): Array<{ title: string; url: string }> {
  const bySeason = new Map<number, { title: string; url: string }>();
  const noSeason: Array<{ title: string; url: string }> = [];

  for (const page of pages) {
    const seasonMatch = page.title.match(/(\d+)ª?\s*Temporada/i)
      || page.url.match(/(\d+)-temporada/);

    if (seasonMatch) {
      const num = parseInt(seasonMatch[1]);
      const existing = bySeason.get(num);
      if (!existing || (page.title.toLowerCase().includes('completa') && !existing.title.toLowerCase().includes('completa'))) {
        bySeason.set(num, page);
      }
    } else {
      noSeason.push(page);
    }
  }

  const seasons = Array.from(bySeason.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([_, page]) => page);

  return [...seasons, ...noSeason];
}

async function extractMagnets(pageUrl: string): Promise<Array<{ title: string; magnet: string; seeders?: number; size?: number }>> {
  try {
    logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${pageUrl}`);
    const response = await fetchWithBypass(pageUrl, { timeout: 15000 });
    const html = response.data;
    const results: Array<{ title: string; magnet: string; seeders?: number; size?: number }> = [];
    const seen = new Set<string>();

    const magnetRegex = /href=['"](magnet:\?[^'"]+)['"]/gi;
    let match;
    while ((match = magnetRegex.exec(html)) !== null) {
      const magnet = match[1];
      if (seen.has(magnet)) continue;
      seen.add(magnet);

      let title = '';
      const dnMatch = magnet.match(/dn=([^&]+)/);
      if (dnMatch) {
        title = decodeURIComponent(dnMatch[1]).replace(/\+/g, ' ');
      }

      if (!title) {
        const idx = html.indexOf(match[0]);
        const context = html.substring(Math.max(0, idx - 300), idx);
        const titleMatch = context.match(/<h2[^>]*>([^<]+)<\/h2>/i)
          || context.match(/<p[^>]*class=['"][^'"]*text-primary[^'"]*['"][^>]*>([^<]+)<\/p>/i);
        if (titleMatch) title = titleMatch[1].trim();
      }

      let seeders: number | undefined;
      let size: number | undefined;
      const idx = html.indexOf(match[0]);
      const context = html.substring(Math.max(0, idx - 500), idx + match[0].length + 500);
      const seedersMatch = context.match(/(?:seeders?|seeds?|s)\s*[:=]?\s*(\d+)/i)
        || context.match(/class=['"][^'"]*seed[^'"]*['"][^>]*>\s*(\d+)/i);
      if (seedersMatch) {
        seeders = parseInt(seedersMatch[1]);
      }

      // Tentar extrair tamanho do release do título (ex: "1.5GB", "800MB", "3.2 GB")
      const sizeFromTitle = title.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
      if (sizeFromTitle) {
        const val = parseFloat(sizeFromTitle[1]);
        const unit = sizeFromTitle[2].toUpperCase();
        if (unit === 'TB') size = val * 1024 * 1024 * 1024 * 1024;
        else if (unit === 'GB') size = val * 1024 * 1024 * 1024;
        else size = val * 1024 * 1024; // MB
      }

      results.push({ title: title || 'Desconhecido', magnet, seeders, size });
    }

    logger.info(COMPONENT, `Extracted ${results.length} magnets from ${pageUrl}`);
    return results;
  } catch (err: any) {
    logger.warn(COMPONENT, `Failed to extract from ${pageUrl}: ${err.message}`);
    return [];
  }
}

async function searchBR(query: string): Promise<ApacheResult[]> {
  try {
    const pages = await searchPages(query);
    if (pages.length === 0) {
      logger.info(COMPONENT, `No results for "${query}"`);
      return [];
    }

    const uniquePages = deduplicatePages(pages);
    logger.info(COMPONENT, `${uniquePages.length} unique pages from ${pages.length} total for "${query}"`);

    const allResults: ApacheResult[] = [];
    for (const page of uniquePages) {
      const seasonNum = extractSeasonFromPageTitle(page.title);
      const magnets = await extractMagnets(page.url);
      for (const m of magnets) {
        allResults.push({
          ...m,
          seasonPage: page.url,
          seasonNumber: seasonNum || undefined,
          seriesTitle: query,
        });
      }
    }

    logger.info(COMPONENT, `Total: ${allResults.length} magnets for "${query}"`);
    return allResults;
  } catch (err: any) {
    logger.warn(COMPONENT, `searchBR failed: ${err.message}`);
    return [];
  }
}

function filterBySeason(results: ApacheResult[], seasonNumber: number): ApacheResult[] {
  const target = String(seasonNumber).padStart(2, '0');
  return results.filter((r) => {
    if (r.seasonNumber !== undefined && r.seasonNumber !== null) {
      return r.seasonNumber === seasonNumber;
    }
    const title = r.title.toLowerCase();
    return (
      new RegExp(`\\bseason\\s*0*${seasonNumber}\\b`, 'i').test(title) ||
      new RegExp(`\\b0*${seasonNumber}ª?\\s*temporada`, 'i').test(title) ||
      new RegExp(`\\bS0*${seasonNumber}\\b(?!E)`, 'i').test(title) ||
      title.includes(`s${target}`) ||
      title.includes(`season ${target}`)
    );
  });
}

const SEED_CHECK_TIMEOUT_MS = 45000;
const SEED_POLL_INTERVAL_MS = 5000;

const UNRESOLVED_STATES = new Set([
  'metaDL',
  'forcedMetaDL',
  'checkingResumeData',
  'checking',
  'checkingDL',
  'checkingUP',
  'checkingSavePath',
  'allocating',
  'moving',
]);

function isMetadataUnresolved(t: any): boolean {
  if (!t) return false;
  return UNRESOLVED_STATES.has(t.state);
}

async function addAllMagnets(magnets: ApacheResult[], savePath = '/downloads', year?: number, targetSeason?: number, movieTitle?: string): Promise<{ added: number; failed: number; hashes: string[]; noSeedSeasons: number[]; seasons: Array<{ season: number; hasSeed: boolean; addedHash: string | null }> }> {
  const isSeries = savePath.includes('series');
  const category = isSeries ? 'series' : savePath.includes('movies') ? 'movies' : undefined;

  let pool = isSeries && targetSeason ? filterBySeason(magnets, targetSeason) : magnets;

  // Filmes: exige que o release SEJA do filme buscado (título), além de ano+PT-BR.
  if (!isSeries && movieTitle) {
    pool = pool.filter((m) => isSameMovie(m.title, movieTitle));
    logger.info(COMPONENT, `Title-match "${movieTitle}": ${magnets.length} → ${pool.length} candidatos do filme certo`);
  }

  // ── SÉRIES: fluxo original (sem limite de tamanho) ──
  if (isSeries) {
    return addAllMagnetsSeries(pool, savePath, year, targetSeason, category, magnets);
  }

  // ── FILMES: novo fluxo — adiciona TODOS, avalia metadata real, mantém o vencedor ──
  return addAllMagnetsMovies(pool, savePath, year, category, magnets);
}

/**
 * Fluxo para FILMES:
 * 1. Adiciona TODOS os candidatos ao qBittorrent (pausados)
 * 2. Espera metadata resolver (tamanho real + seeds)
 * 3. Filtra: tamanho ≤ 3GB, tem seeds
 * 4. Seleciona: maior tamanho (melhor fonte) + 1080p + H.264
 * 5. Deleta os perdedores
 */
async function addAllMagnetsMovies(
  pool: ApacheResult[],
  savePath: string,
  year: number | undefined,
  category: string | undefined,
  allMagnets: ApacheResult[],
): Promise<{ added: number; failed: number; hashes: string[]; noSeedSeasons: number[]; seasons: Array<{ season: number; hasSeed: boolean; addedHash: string | null }> }> {

  if (pool.length === 0) {
    logger.warn(COMPONENT, `No PT-BR candidates for movie "${allMagnets[0]?.title || 'unknown'}"`);
    return { added: 0, failed: 0, hashes: [], noSeedSeasons: [], seasons: [] };
  }

  // FASE 1: Adicionar TODOS os candidatos ao qBittorrent (pausados para não baixar)
  logger.info(COMPONENT, `Adding ${pool.length} candidates to qBittorrent for evaluation...`);
  const magnets = pool.map(r => r.magnet);
  const evaluated = await QBittorrentService.addMagnetsForEvaluation(magnets, savePath);

  if (evaluated.length === 0) {
    logger.warn(COMPONENT, `No torrents resolved metadata for movie "${pool[0]?.title || 'unknown'}"`);
    return { added: 0, failed: 0, hashes: [], noSeedSeasons: [], seasons: [] };
  }

  // FASE 2: Filtrar por tamanho real ≤ 3GB
  const underLimit = evaluated.filter(t => t.size <= MAX_MOVIE_SIZE_BYTES);
  const overLimit = evaluated.filter(t => t.size > MAX_MOVIE_SIZE_BYTES);

  if (overLimit.length > 0) {
    logger.warn(COMPONENT, `Size filter: ${evaluated.length} → ${underLimit.length} (rejected ${overLimit.length} movies > 3GB: ${overLimit.map(t => `${t.name} (${(t.size / 1024 / 1024 / 1024).toFixed(1)}GB)`).join(', ')})`);
  }

  // Deletar os que passaram do limite
  if (overLimit.length > 0) {
    await QBittorrentService.deleteTorrents(overLimit.map(t => t.hash));
  }

  if (underLimit.length === 0) {
    logger.warn(COMPONENT, `All ${evaluated.length} candidates exceed 3GB — no movie added`);
    return { added: 0, failed: 0, hashes: [], noSeedSeasons: [], seasons: [] };
  }

  // FASE 3: Classificar por qualidade (seeds + resolução + tamanho)
  const ranked = underLimit.map(t => {
    const titleLower = t.name.toLowerCase();
    const is1080 = /1080p|1080|FHD/i.test(titleLower);
    const is720 = /720p|720/i.test(titleLower);
    const isH264 = /(?:x264|h\.?264|avc)/i.test(titleLower) && !/(?:x265|hevc|h\.?265|10bit)/i.test(titleLower);
    const hasSeeds = t.seeds > 0;

    return {
      ...t,
      score: {
        hasSeeds: hasSeeds ? 1 : 0,
        resolution: is1080 ? 0 : is720 ? 1 : 2,
        isH264: isH264 ? 1 : 0,
        size: t.size, // maior tamanho = melhor fonte
      },
    };
  }).sort((a, b) => {
    // Prioridade: seeds > resolução > H.264 > tamanho (maior vence)
    if (a.score.hasSeeds !== b.score.hasSeeds) return b.score.hasSeeds - a.score.hasSeeds;
    if (a.score.resolution !== b.score.resolution) return a.score.resolution - b.score.resolution;
    if (a.score.isH264 !== b.score.isH264) return b.score.isH264 - a.score.isH264;
    return b.score.size - a.score.size;
  });

  const winner = ranked[0];
  const losers = ranked.slice(1);

  // FASE 4: Deletar os perdedores
  if (losers.length > 0) {
    await QBittorrentService.deleteTorrents(losers.map(l => l.hash));
    logger.info(COMPONENT, `Removed ${losers.length} losing candidates`);
  }

  // FASE 5: O vencedor já está no qBittorrent (adicionado na FASE 1 e retomado)
  // NÃO adicionar novamente — já está baixando

  const winnerSizeGB = (winner.size / 1024 / 1024 / 1024).toFixed(2);
  const winnerSeeds = winner.seeds;
  const resolution = winner.score.resolution === 0 ? '1080p' : winner.score.resolution === 1 ? '720p' : 'res-desconhecida';
  const codec = winner.score.isH264 ? 'H.264' : 'H.265/other';

  logger.info(COMPONENT, `MOVIE WINNER: "${winner.name}" — ${winnerSizeGB}GB, ${winnerSeeds} seeds, ${resolution}, ${codec}`);

  return {
    added: 1,
    failed: 0,
    hashes: [winner.hash],
    noSeedSeasons: [],
    seasons: [{ season: 0, hasSeed: winnerSeeds > 0, addedHash: winner.hash }],
  };
}

/**
 * Fluxo para SÉRIES: mantém comportamento original (sem limite de tamanho).
 */
async function addAllMagnetsSeries(
  pool: ApacheResult[],
  savePath: string,
  year: number | undefined,
  targetSeason: number | undefined,
  category: string | undefined,
  allMagnets: ApacheResult[],
): Promise<{ added: number; failed: number; hashes: string[]; noSeedSeasons: number[]; seasons: Array<{ season: number; hasSeed: boolean; addedHash: string | null }> }> {

  const expectedSeries = savePath.match(/\/media\/series\/([^/]+)/)?.[1];

  const candidates = selectTopPerSeason(pool, year, expectedSeries, 3);

  const flatCandidates = Array.from(candidates.values()).flat();
  if (flatCandidates.length === 0) {
    logger.warn(COMPONENT, `No suitable PT-BR torrent found for series "${allMagnets[0]?.seriesTitle || allMagnets[0]?.title || 'unknown'}"`);
    return { added: 0, failed: 0, hashes: [], noSeedSeasons: [], seasons: [] };
  }

  let added = 0;
  let failed = 0;
  const hashes: string[] = [];
  const addedBySeason = new Map<number, Array<{ result: ApacheResult; hash: string }>>();
  const alreadyHasSeasonStructure = /\/Season\s+\d+$/i.test(savePath);

  for (const [season, seasonCandidates] of candidates) {
    const seasonAdded: Array<{ result: ApacheResult; hash: string }> = [];
    for (const item of seasonCandidates) {
      let effectiveSavePath = savePath;
      if (item.seriesTitle && !alreadyHasSeasonStructure) {
        const seriesName = item.seriesTitle.replace(/[.\s_-]+/g, ' ').trim();
        effectiveSavePath = item.seasonNumber
          ? `${savePath}/${seriesName}/Season ${String(item.seasonNumber).padStart(2, '0')}`
          : `${savePath}/${seriesName}`;
      }
      const infohash = await QBittorrentService.addMagnet(item.magnet, effectiveSavePath, category);
      if (infohash) {
        added++;
        hashes.push(infohash);
        seasonAdded.push({ result: item, hash: infohash });
      } else {
        failed++;
      }
    }
    addedBySeason.set(season, seasonAdded);
  }

  // Seed check loop (mantido do original)
  const deadline = Date.now() + SEED_CHECK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const torrents = await QBittorrentService.getTorrents();
    const byHash = new Map<string, any>(torrents.map((t: any) => [t.hash?.toLowerCase(), t]));
    let allResolved = true;
    let anySeeded = false;
    for (const seasonAdded of addedBySeason.values()) {
      for (const cand of seasonAdded) {
        const t = byHash.get(cand.hash.toLowerCase());
        if (isMetadataUnresolved(t)) { allResolved = false; continue; }
        if ((t?.seeds || 0) > 0) anySeeded = true;
      }
    }
    if (allResolved && anySeeded) break;
    await new Promise(r => setTimeout(r, SEED_POLL_INTERVAL_MS));
  }

  const torrents = await QBittorrentService.getTorrents();
  const byHash = new Map<string, any>(torrents.map((t: any) => [t.hash?.toLowerCase(), t]));
  const winnersBySeason = new Map<number, Array<{ result: ApacheResult; hash: string; seeds: number }>>();
  const noSeedSeasons: number[] = [];

  for (const [season, seasonAdded] of addedBySeason) {
    if (seasonAdded.length === 0) continue;
    const withSeeds = seasonAdded.map(cand => {
      const t = byHash.get(cand.hash.toLowerCase());
      return { result: cand.result, hash: cand.hash, seeds: t ? (t.seeds || 0) : 0, unresolved: isMetadataUnresolved(t) };
    });
    const hasSeed = withSeeds.some(c => c.seeds > 0);
    const anyUnresolved = withSeeds.some(c => c.unresolved);

    if (hasSeed) {
      const ranked = rankByRealSeeds(withSeeds);
      const winner = ranked[0];
      for (const loser of ranked.slice(1)) {
        const removed = await QBittorrentService.deleteTorrent(loser.hash, false);
        if (removed) { const idx = hashes.indexOf(loser.hash); if (idx !== -1) hashes.splice(idx, 1); }
      }
      winnersBySeason.set(season, [winner]);
    } else if (!anyUnresolved) {
      for (const c of withSeeds) {
        const removed = await QBittorrentService.deleteTorrent(c.hash, false);
        if (removed) { const idx = hashes.indexOf(c.hash); if (idx !== -1) hashes.splice(idx, 1); }
      }
      noSeedSeasons.push(season);
    } else {
      const ranked = rankByRealSeeds(withSeeds);
      const winner = ranked[0];
      for (const loser of ranked.slice(1)) {
        if (loser.unresolved) continue;
        const removed = await QBittorrentService.deleteTorrent(loser.hash, false);
        if (removed) { const idx = hashes.indexOf(loser.hash); if (idx !== -1) hashes.splice(idx, 1); }
      }
      winnersBySeason.set(season, [winner]);
    }
  }

  const finalHashes = Array.from(winnersBySeason.values()).flat().map(w => w.hash);
  const seasons = Array.from(winnersBySeason.entries()).map(([season, ws]) => ({
    season,
    hasSeed: (ws[0]?.seeds || 0) > 0,
    addedHash: ws[0]?.hash || null,
  }));
  for (const s of noSeedSeasons) seasons.push({ season: s, hasSeed: false, addedHash: null });

  return { added: finalHashes.length, failed, hashes: finalHashes, noSeedSeasons, seasons };
}

export const ApacheTorrentService = {
  searchBR,
  addAllMagnets,
};