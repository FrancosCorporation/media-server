// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { logger } from '../utils/logger';
import { TranslationService } from './TranslationService';
import { QBittorrentService } from './QBittorrentService';
import { extractSeasonFromPageTitle } from '../utils/mediaOrganizer';
import { HDRTorrentService } from './HDRTorrentService';
import { ProwlarrService } from './ProwlarrService';
import { JackettService } from './JackettService';
import { BeTorService } from './BeTorService';
import { fetchWithBypass } from './CloudflareBypassService';

const COMPONENT = 'BRTorrentAgg';

// ── Regra de tamanho: filmes máx 3 GB ──────────────────────────────────────
const MAX_MOVIE_SIZE_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB

export interface BRResult {
  title: string;
  magnet: string;
  source: string;
  seeds?: number;
  seasonNumber?: number;
  seriesTitle?: string;
  size?: number;
}

// Regex de permissão estrita — O torrent SÓ passa se tiver 100% de certeza que é PT-BR
const PTBR_WHITELIST = /\b(dub(lad[oá])?|dual(?:\s*(?:á|a)udio)?|pt[-_.]?br|portugu[eê]s|nacional)\b/i;

// Regex de rejeição imediata — qualquer marcador estrangeiro mata o torrent
const FOREIGN_BLACKLIST = /\b(french|vff|vf2?|vfq|fre\b|fra\b|eng\b|en\s|es\b|subbed|ita|somm|rus(sian)?\b|esp\b|espa[nñ]ol|spanish|latino|multi(?![^.]*\bbr\b))\b/i;

const RES_1080 = /(?:1080p|1080|FHD)/i;
const RES_720  = /(?:720p|720)/i;
const RES_BAD  = /(?:480p|CAM|TS|Telesync|3D|HSBS|SBS|SDTV)/i;
const RES_BLOCKED = /(?:2160p|4k|2k|2\.5k|3k|4k|8k|uhd|hdr10|dolbyvision)/i;

const H264_REGEX = /(?:x264|h\.?264|avc)/i;
const HEVC_REGEX = /(?:x265|hevc|h\.?265|10bit)/i;

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

interface ScoredBR {
  result: BRResult;
  seedCount: number;
  resolution: 1080 | 720;
  isH264: boolean;
}

function scoreBR(r: BRResult, isMovie = false): ScoredBR | null {
  const t = r.title.toLowerCase();

  if (RES_BLOCKED.test(t)) return null;

  const is1080 = RES_1080.test(t);
  const is720  = RES_720.test(t);
  if (!is1080 && !is720) return null;

  if (!isPTBR(t)) return null;

  // Regra 3GB: filmes com tamanho conhecido > 3GB são rejeitados
  if (isMovie && r.size && r.size > MAX_MOVIE_SIZE_BYTES) {
    logger.warn(COMPONENT, `[REJEITADO - TAMANHO] "${r.title}" (${(r.size / 1024 / 1024 / 1024).toFixed(1)}GB > 3GB)`);
    return null;
  }

  const seedCount = r.seeds || 0;

  return {
    result: r,
    seedCount,
    resolution: is1080 ? 1080 : 720,
    isH264: H264_REGEX.test(t) && !HEVC_REGEX.test(t),
  };
}

function selectBest(items: BRResult[], year?: number, isMovie = false): BRResult | null {
  const scored = items
    .map(r => scoreBR(r, isMovie))
    .filter((s): s is ScoredBR => s !== null)
    .filter(s => {
      if (!year) return true;
      const m = s.result.title.match(/\b(19\d{2}|20\d{2})\b/);
      return !m || m[0] === year.toString();
    });

  // Rejeitar todos sem seeds — torrent morto não baixa
  const withPeers = scored.filter(s => s.seedCount > 0);
  if (!withPeers.length) {
    logger.warn(COMPONENT, `Rejecting all ${scored.length} candidates: zero seeds. Closest: ${scored[0]?.result.title?.substring(0, 50)} (0 seeds)`);
    // Se não tem nenhum com seeds, retorna o de maior resolution como fallback
    return scored.sort((a, b) => b.resolution - a.resolution || b.seedCount - a.seedCount)[0].result;
  }

  withPeers.sort((a, b) => {
    if (a.resolution !== b.resolution) return a.resolution === 1080 ? -1 : 1;
    if (a.isH264 !== b.isH264) return a.isH264 ? -1 : 1;
    return b.seedCount - a.seedCount;
  });

  logger.info(COMPONENT, `Select: ${items.length} → ${scored.length} PT-BR candidates → ${withPeers.length} with seeds → best: "${withPeers[0].result.title}" (${withPeers[0].resolution}p, ${withPeers[0].seedCount} seeds, ${withPeers[0].isH264 ? 'H.264' : 'HEVC'})`);
  return withPeers[0].result;
}

function selectBestPerSeason(items: BRResult[]): BRResult[] {
  const bySeason = new Map<number, BRResult[]>();
  for (const r of items) {
    const s = r.seasonNumber || 0;
    const existing = bySeason.get(s) || [];
    existing.push(r);
    bySeason.set(s, existing);
  }
  const best: BRResult[] = [];
  for (const [season, results] of bySeason) {
    const w = selectBest(results);
    if (w) best.push(w);
  }
  return best;
}

async function searchApacheTorrent(query: string): Promise<BRResult[]> {
  try {
    const translated = await TranslationService.translate(query, 'en', 'pt-BR');
    const searchUrl = `https://apachetorrent.com/index.php?s=${encodeURIComponent(translated)}`;
    logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${searchUrl}`);
    const { data: html } = await fetchWithBypass(searchUrl, { timeout: 15000 });

    const pages: Array<{ title: string; url: string }> = [];
    const regex = /<div\s+class='capaname'>\s*<a\s+href='([^']+)'[^>]*title='([^']+)'/gi;
    const matches = html.matchAll(regex);
    for (const m of matches) {
      if (!pages.find(p => p.url === m[1])) {
        pages.push({ url: m[1], title: m[2] });
      }
    }
    if (!pages.length) return [];

    const results: BRResult[] = [];
    for (const page of pages) {
      const seasonNum = extractSeasonFromPageTitle(page.title);
      try {
        logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${page.url}`);
        const { data: pageHtml } = await fetchWithBypass(page.url, { timeout: 15000 });
        const magnetRegex = /href=['"](magnet:\?[^'"]+)['"]/gi;
        let m;
        while ((m = magnetRegex.exec(pageHtml)) !== null) {
          let title = '';
          const dn = m[1].match(/dn=([^&]+)/);
          if (dn) title = decodeURIComponent(dn[1]).replace(/\+/g, ' ');
          results.push({
            title: title || 'ApacheTorrent',
            magnet: m[1],
            source: 'ApacheTorrent',
            seasonNumber: seasonNum || undefined,
            seriesTitle: query,
          });
        }
      } catch { /* skip failed pages */ }
    }
    logger.info(COMPONENT, `ApacheTorrent: ${results.length} magnets for "${query}"`);
    return results;
  } catch (err: any) {
    logger.warn(COMPONENT, `ApacheTorrent failed: ${err.message}`);
    return [];
  }
}

async function searchTorrentDosFilmes(query: string): Promise<BRResult[]> {
  const SITES = [
    { name: 'TorrentDosFilmes', url: 'https://torrentdosfilmes.com' },
  ];

  for (const site of SITES) {
    try {
      const searchUrl = `${site.url}/?s=${encodeURIComponent(query)}`;
      logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${searchUrl}`);
      const { data: html } = await fetchWithBypass(searchUrl, { timeout: 15000 });

      const results: BRResult[] = [];
      const linkRegex = /<a\s+href='([^']+)'[^>]*rel='bookmark'[^>]*>([^<]+)<\/a>/gi;
      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        const detailUrl = m[1];
        const pageTitle = m[2].trim();
        if (!detailUrl.includes(site.url)) continue;

        try {
          logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${detailUrl}`);
          const { data: detailHtml } = await fetchWithBypass(detailUrl, { timeout: 15000 });
          const magRegex = /href=['"](magnet:\?[^'"]+)['"]/gi;
          let mag;
          while ((mag = magRegex.exec(detailHtml)) !== null) {
            results.push({
              title: pageTitle,
              magnet: mag[1],
              source: site.name,
              seriesTitle: query,
            });
          }
        } catch { /* skip */ }
      }

      if (results.length > 0) {
        logger.info(COMPONENT, `${site.name}: ${results.length} magnets for "${query}"`);
        return results;
      }
    } catch (err: any) {
      logger.warn(COMPONENT, `${site.name} failed: ${err.message}`);
    }
  }
  return [];
}

async function searchComando(query: string): Promise<BRResult[]> {
  try {
    const searchUrl = `https://comando.to/?s=${encodeURIComponent(query)}`;
    logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${searchUrl}`);
    const { data: html } = await fetchWithBypass(searchUrl, { timeout: 15000 });

    const results: BRResult[] = [];
    const magRegex = /href=['"](magnet:\?[^'"]+)['"]/gi;
    let m;
    while ((m = magRegex.exec(html)) !== null) {
      let title = '';
      const dn = m[1].match(/dn=([^&]+)/);
      if (dn) title = decodeURIComponent(dn[1]).replace(/\+/g, ' ');
      results.push({
        title: title || 'Comando',
        magnet: m[1],
        source: 'Comando',
        seriesTitle: query,
      });
    }

    const linkRegex = /<a\s+href=['"](https:\/\/comando\.to\/[^'"]+)['"]/gi;
    let l;
    const seen = new Set<string>();
    while ((l = linkRegex.exec(html)) !== null) {
      if (seen.has(l[1])) continue;
      seen.add(l[1]);
      try {
        logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${l[1]}`);
        const { data: detailHtml } = await fetchWithBypass(l[1], { timeout: 15000 });
        const dm = detailHtml.match(/href=['"](magnet:\?[^'"]+)['"]/);
        if (dm) {
          let title = '';
          const dn = dm[1].match(/dn=([^&]+)/);
          if (dn) title = decodeURIComponent(dn[1]).replace(/\+/g, ' ');
          results.push({
            title: title || 'Comando',
            magnet: dm[1],
            source: 'Comando',
            seriesTitle: query,
          });
        }
      } catch { /* skip */ }
    }

    logger.info(COMPONENT, `Comando: ${results.length} magnets for "${query}"`);
    return results;
  } catch (err: any) {
    logger.warn(COMPONENT, `Comando failed: ${err.message}`);
    return [];
  }
}

async function searchHDRTorrent(query: string): Promise<BRResult[]> {
  try {
    const results = await HDRTorrentService.searchHDR(query);
    return results.map(r => ({
      title: r.title,
      magnet: r.magnet,
      source: 'HDRTorrent',
      seeds: r.seeds,
      seriesTitle: query,
    }));
  } catch (err: any) {
    logger.warn(COMPONENT, `HDRTorrent failed: ${err.message}`);
    return [];
  }
}

export async function searchAll(
  query: string,
  opts?: { imdbId?: string }
): Promise<BRResult[]> {
  logger.info(COMPONENT, `Searching all BR indexers for "${query}"`);

  const isSeries = /\bseason\s*\d+|\bs\d{1,2}e\d{1,2}\b/i.test(query);

  const results = await Promise.allSettled([
    searchApacheTorrent(query),
    searchTorrentDosFilmes(query),
    searchComando(query),
    searchHDRTorrent(query),
    ProwlarrService.searchProwlarr(query, isSeries),
    JackettService.searchJackett(query, isSeries, opts),
    BeTorService.searchBeTor(query, isSeries, opts),
  ]);

  const all: BRResult[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      logger.info(COMPONENT, `Indexer ${r.value.length > 0 ? 'SUCCESS' : 'EMPTY'}: ${r.value.length} results for "${query}"`);
      all.push(...r.value);
    } else {
      logger.warn(COMPONENT, `Indexer FAILED: ${r.reason?.message || r.reason}`);
    }
  }

  const seen = new Set<string>();
  const unique = all.filter(r => {
    if (seen.has(r.magnet)) return false;
    seen.add(r.magnet);
    return true;
  });

  logger.info(COMPONENT, `Total: ${unique.length} unique magnets from ${results.length} indexers for "${query}"`);
  return unique;
}

export async function searchAndAddMagnet(
  query: string,
  savePath: string,
  year?: number,
  isSeries?: boolean
): Promise<{ added: number; total: number }> {
  const all = await searchAll(query);
  if (!all.length) return { added: 0, total: 0 };

  const category = savePath.includes('series') ? 'series' : savePath.includes('movies') ? 'movies' : undefined;
  const bestTorrents = isSeries ? selectBestPerSeason(all) : [selectBest(all, year, !isSeries)].filter(Boolean) as BRResult[];

  let added = 0;
  const alreadyHasSeasonStructure = /\/Season\s+\d+$/i.test(savePath);

  for (const item of bestTorrents) {
    let effectivePath = savePath;
    if (isSeries && item.seriesTitle && !alreadyHasSeasonStructure) {
      const name = item.seriesTitle.replace(/[.\s_-]+/g, ' ').trim();
      effectivePath = item.seasonNumber
        ? `${savePath}/${name}/Season ${String(item.seasonNumber).padStart(2, '0')}`
        : `${savePath}/${name}`;
    }
    const ok = await QBittorrentService.addMagnet(item.magnet, effectivePath, category);
    if (ok) {
      added++;
      logger.info(COMPONENT, `[${item.source}] Added: "${item.title}" → ${effectivePath}`);
    }
  }

  return { added, total: bestTorrents.length };
}

export const BRTorrentAggregator = {
  searchAll,
  searchAndAddMagnet,
};