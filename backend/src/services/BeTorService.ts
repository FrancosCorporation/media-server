// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { logger } from '../utils/logger';
import { fetchWithBypass } from './CloudflareBypassService';
import { extractSeasonFromPageTitle } from '../utils/mediaOrganizer';
import type { BRResult } from './BRTorrentAggregator';

const COMPONENT = 'BeTor';
const BASE = 'https://catalogo.betor.top';

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

function getAttr(html: string, attr: string): string | undefined {
  const m = html.match(new RegExp(`\\b${attr}="([^"]*)"`, 'i'));
  return m ? m[1] : undefined;
}

function parseTorrents(html: string, query: string, sourceBase: string): BRResult[] {
  const results: BRResult[] = [];
  const blocks = html.match(/<[^>]*data-torrent[^>]*>[\s\S]*?<\/[^>]+>/gi) || [];
  for (const block of blocks) {
    const magnet = getAttr(block, 'data-torrent-magnet-uri');
    if (!magnet) continue;
    const title = getAttr(block, 'data-torrent-name') || '';
    if (!title) continue;
    if (!isPTBR(title)) continue;
    const provider = getAttr(block, 'data-provider-url');
    const providerName = provider ? provider.replace(/https?:\/\/([^\/]+).*/, '$1') : 'betor';
    results.push({
      title,
      magnet,
      source: `${sourceBase}:${providerName}`,
      seeds: Number(getAttr(block, 'data-torrent-num-seeds')) || 0,
      seasonNumber: extractSeasonFromPageTitle(title) || undefined,
      seriesTitle: query,
    });
  }
  return results;
}

function matchesQuery(title: string, query: string): boolean {
  const tokens = query
    .replace(/\b(season\s*\d+|\bs\d{1,2}e\d{1,2}\b|the|a|an)\b/gi, ' ')
    .split(/[\s._\-]+/)
    .filter(t => t.length >= 3);
  if (!tokens.length) return true;
  const t = title.toLowerCase();
  return tokens.every(tok => t.includes(tok.toLowerCase()));
}

export async function searchBeTor(
  query: string,
  isSeries = true,
  opts?: { imdbId?: string }
): Promise<BRResult[]> {
  try {
    const results: BRResult[] = [];

    if (opts?.imdbId) {
      const url = `${BASE}/imdb/${opts.imdbId}/`;
      logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${url}`);
      const { data: html } = await fetchWithBypass(url, { timeout: 20000 });
      results.push(
        ...parseTorrents(String(html), query, 'BeTor').filter(r => matchesQuery(r.title, query))
      );
      logger.info(COMPONENT, `BeTor: ${results.length} magnets (imdb ${opts.imdbId}) para "${query}"`);
      return results;
    }

    const page = isSeries ? 'series' : 'filmes';
    const url = `${BASE}/${page}/`;
    logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${url}`);
    const { data: html } = await fetchWithBypass(url, { timeout: 20000 });
    const found = parseTorrents(String(html), query, 'BeTor').filter(r => matchesQuery(r.title, query));
    results.push(...found);

    logger.info(COMPONENT, `BeTor: ${results.length} magnets (newest ${page}) para "${query}"`);
    return results;
  } catch (err: any) {
    logger.warn(COMPONENT, `BeTor failed: ${err.message}`);
    return [];
  }
}

export const BeTorService = {
  searchBeTor,
};
