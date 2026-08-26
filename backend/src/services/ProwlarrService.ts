// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import axios from 'axios';
import { logger } from '../utils/logger';
import { Settings } from '../models/Settings';
import { extractSeasonFromPageTitle } from '../utils/mediaOrganizer';
import { fetchWithBypass } from './CloudflareBypassService';
import type { BRResult } from './BRTorrentAggregator';

const COMPONENT = 'Prowlarr';

const CATEGORIES_SERIES = '5000';
const CATEGORIES_MOVIES = '2000';

// Regex de permissão estrita — O torrent SÓ passa se tiver 100% de certeza que é PT-BR
const PTBR_WHITELIST = /\b(dub(lad[oá])?|dual(?:\s*(?:á|a)udio)?|pt[-_.]?br|portugu[eê]s|nacional)\b/i;

// Regex de rejeição imediata — qualquer marcador estrangeiro mata o torrent
const FOREIGN_BLACKLIST = /\b(french|vff|vf2?|vfq|fre\b|fra\b|eng\b|en\s|es\b|subbed|ita|somm|rus(sian)?\b|esp\b|espa[nñ]ol|spanish|latino|multi(?![^.]*\bbr\b))\b/i;

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

interface ProwlarrSearchResult {
  title: string;
  indexer: string;
  indexerId: number;
  seeders: number;
  leechers: number;
  size: number;
  magnetUrl?: string;
  downloadUrl?: string;
  guid?: string;
  categories?: Array<{ id: number; name: string }>;
}

async function getConfig() {
  const s = await Settings.findOne();
  return {
    url: s?.prowlarrUrl || process.env.PROWLARR_URL || 'http://prowlarr:9696',
    apiKey: s?.prowlarrApiKey || process.env.PROWLARR_API_KEY || 'c18371cbc1304f6f8d5a3ab4928723fb',
  };
}

async function resolveMagnet(magnetUrl: string): Promise<string | null> {
  try {
    const res = await fetchWithBypass(magnetUrl, {
      maxRedirects: 0,
      timeout: 15000,
    });
    const loc = res.headers['location'] as string | undefined;
    if (res.status >= 300 && res.status < 400 && loc && loc.startsWith('magnet:?')) return loc;
    return null;
  } catch {
    return null;
  }
}

// Fallback: para séries, quando não há PT-BR, aceita o melhor EN disponível.
// Critérios relaxados: seeds > 0, H.264 (não HEVC), 720p/1080p, sem blacklist de idioma incompatível.
// A conversão (MediaPostProcessor) lida com a faixa de áudio disponível.
const FALLBACK_EN_BLACKLIST = /\b(french|vff|vf2?|vfq|fre\b|fra\b|subbed|ita|somm|rus(sian)?\b|latino)\b/i;
const FALLBACK_EN_WHITELIST = /\b(eng\b|english|dual|pt[-_.]?br|portugu[eê]s|nacional|esubs?|es \[?\d*\]?)\b/i;

function isFallbackAcceptable(title: string): boolean {
  const t = title.toLowerCase();
  if (FALLBACK_EN_BLACKLIST.test(t)) return false;
  // Aceita se tiver algum marcador de idioma (ENG, EN, ESubs, etc.) — evita títulos genéricos
  return FALLBACK_EN_WHITELIST.test(t);
}

function isH264Only(title: string): boolean {
  return /(?:x264|h\.?264|avc)/i.test(title) && !/(?:x265|hevc|h\.?265|10bit)/i.test(title);
}

function is1080p(title: string): boolean {
  return /(?:1080p|1080|FHD)/i.test(title);
}

export async function searchProwlarr(
  query: string,
  isSeries = true,
  limit = 30
): Promise<BRResult[]> {
  const { url, apiKey } = await getConfig();
  if (!apiKey) {
    logger.warn(COMPONENT, 'No Prowlarr API key configured');
    return [];
  }

  const category = isSeries ? CATEGORIES_SERIES : CATEGORIES_MOVIES;
  const searchUrl = `${url}/api/v1/search?query=${encodeURIComponent(query)}&type=search&categories=${category}&limit=${limit}`;

  try {
    const { data } = await axios.get(searchUrl, {
      headers: { 'X-Api-Key': apiKey },
      timeout: 60000,
    });
    const items: ProwlarrSearchResult[] = Array.isArray(data) ? data : [];

    const results: BRResult[] = [];
    const batch = items.slice(0, 15);

    for (const item of batch) {
      if (!item.magnetUrl) continue;
      const magnet = await resolveMagnet(item.magnetUrl);
      if (!magnet) continue;

      if (!isPTBR(item.title)) continue;

      results.push({
        title: item.title,
        magnet,
        source: `Prowlarr:${item.indexer}`,
        seeds: item.seeders || 0,
        seasonNumber: extractSeasonFromPageTitle(item.title) || undefined,
        seriesTitle: query,
      });
    }

    // Fallback: para séries, se nenhum PT-BR, usa o melhor EN disponível
    if (isSeries && results.length === 0) {
      logger.info(COMPONENT, `No PT-BR results for "${query}", trying English fallback`);
      for (const item of batch) {
        if (!item.magnetUrl) continue;
        const magnet = await resolveMagnet(item.magnetUrl);
        if (!magnet) continue;
        if (!isFallbackAcceptable(item.title)) continue;
        if (!isH264Only(item.title)) continue;
        if (!is1080p(item.title)) continue;
        if (item.seeders <= 0) continue;

        results.push({
          title: item.title,
          magnet,
          source: `Prowlarr:${item.indexer}`,
          seeds: item.seeders || 0,
          seasonNumber: extractSeasonFromPageTitle(item.title) || undefined,
          seriesTitle: query,
        });
      }
      logger.info(COMPONENT, `Prowlarr fallback EN: ${results.length} magnets for "${query}"`);
    }

    logger.info(COMPONENT, `Prowlarr: ${results.length} magnets (PT-BR + fallback) for "${query}"`);
    return results;
  } catch (err: any) {
    logger.warn(COMPONENT, `Prowlarr failed: ${err.message}`);
    return [];
  }
}

export const ProwlarrService = {
  searchProwlarr,
  resolveMagnet,
};