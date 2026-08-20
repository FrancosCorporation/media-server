// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { logger } from '../utils/logger';
import { Settings } from '../models/Settings';
import { extractSeasonFromPageTitle } from '../utils/mediaOrganizer';
import type { BRResult } from './BRTorrentAggregator';

const COMPONENT = 'Jackett';

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

// Alguns indexadores (ex.: BeTor) ignoram o parâmetro q e retornam lançamentos
// recentes — filtra por tokens significativos do título buscado.
function matchesQuery(title: string, query: string): boolean {
  const tokens = query
    .replace(/\b(season\s*\d+|\bs\d{1,2}e\d{1,2}\b|the|a|an|de|do|da|em|e)\b/gi, ' ')
    .split(/[\s._\-]+/)
    .filter(t => t.length >= 3);
  if (!tokens.length) return true;
  const t = title.toLowerCase();
  return tokens.every(tok => t.includes(tok.toLowerCase()));
}

interface JackettConfig {
  url: string;
  apiKey: string;
}

async function getConfig(): Promise<JackettConfig> {
  const s = await Settings.findOne();
  return {
    url: s?.jackettUrl || process.env.JACKETT_URL || 'http://jackett:9117',
    apiKey: s?.jackettApiKey || process.env.JACKETT_API_KEY || 'vbo5j8i3wybss03ex780wqjmc0n2nkmh',
  };
}

function extractTorznabData(item: any, key: string): string | undefined {
  const attrs = item['torznab:attr'] || item['jackett:attr'] || [];
  const found = (Array.isArray(attrs) ? attrs : [attrs]).find(
    (a: any) => a?.$?.name === key
  );
  return found?.$?.value;
}

function resolveSize(item: any): number | undefined {
  const size = Number(extractTorznabData(item, 'size'));
  if (!Number.isFinite(size) || size <= 0) {
    const len = item.length?.[0];
    if (len && len !== '0') return Number(len);
  }
  return Number.isFinite(size) && size > 0 ? size : undefined;
}

function itemToResult(item: any, query: string): BRResult | null {
  const title: string = item.title?.[0]?.trim();
  if (!title) return null;

  const magnet =
    item.magneturl?.[0] ||
    (typeof item.link?.[0] === 'string' && item.link[0].startsWith('magnet:?') ? item.link[0] : undefined) ||
    (item.enclosure?.[0]?.$?.url && item.enclosure[0].$.url.startsWith('magnet:?') ? item.enclosure[0].$.url : undefined) ||
    (typeof item.guid?.[0] === 'string' && item.guid[0].startsWith('magnet:?') ? item.guid[0] : undefined);
  if (!magnet) return null;

  const indexer = extractTorznabData(item, 'jackettindexer') || 'all';
  const seeds = Number(extractTorznabData(item, 'seeders')) || 0;

  return {
    title,
    magnet,
    source: `Jackett:${indexer}`,
    seeds,
    seasonNumber: extractSeasonFromPageTitle(title) || undefined,
    seriesTitle: query,
    size: resolveSize(item),
  };
}

export async function searchJackett(
  query: string,
  isSeries = true,
  opts?: { imdbId?: string }
): Promise<BRResult[]> {
  const { url, apiKey } = await getConfig();
  if (!apiKey) {
    logger.warn(COMPONENT, 'No Jackett API key configured');
    return [];
  }

  const params = new URLSearchParams({
    apikey: apiKey,
    t: opts?.imdbId ? (isSeries ? 'tvsearch' : 'movie') : 'search',
    q: query,
    limit: '60',
  });
  if (opts?.imdbId) params.set('imdbid', opts.imdbId);
  if (isSeries) params.set('cat', '5000,5030,5040');
  else params.set('cat', '2000,2010,2020');

  const searchUrl = `${url}/api/v2.0/indexers/all/results/torznab/api?${params.toString()}`;

  try {
    const { data } = await axios.get(searchUrl, { timeout: 30000 });
    const parsed = await parseStringPromise(data, { explicitArray: true });
    const items = parsed?.rss?.channel?.[0]?.item || [];
    if (!items.length) {
      logger.info(COMPONENT, `Jackett: 0 resultados para "${query}"`);
      return [];
    }

    const results: BRResult[] = [];
    for (const item of items) {
      const r = itemToResult(item, query);
      if (!r) continue;
      if (!isPTBR(r.title)) continue;
      if (!matchesQuery(r.title, query)) {
        logger.warn(COMPONENT, `[REJEITADO - TÍTULO NÃO CORRESPONDE À BUSCA] "${r.title}"`);
        continue;
      }
      results.push(r);
    }

    logger.info(COMPONENT, `Jackett: ${results.length} PT-BR magnets (from ${items.length} hits) para "${query}"`);
    return results;
  } catch (err: any) {
    logger.warn(COMPONENT, `Jackett failed: ${err.message}`);
    return [];
  }
}

export const JackettService = {
  searchJackett,
};
