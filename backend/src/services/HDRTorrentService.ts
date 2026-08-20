// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { logger } from '../utils/logger';
import { TranslationService } from './TranslationService';
import { fetchWithBypass } from './CloudflareBypassService';

const COMPONENT = 'HDRTorrent';

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

interface HDRTorrentResult {
  title: string;
  magnet: string;
  source: string;
  seeds?: number;
  quality?: string;
  type?: string;
  poster?: string;
}

const RES_GOOD = /(?:1080p|1080|FHD|4k|2160p)/i;
const RES_BAD = /(?:480p|CAM|TS|Telesync|3D)/i;
const RES_BLOCKED = /(?:2160p|4k|2k|2\.5k|3k|4k|8k|uhd|hdr10|dolbyvision)/i;

async function searchByTitle(query: string): Promise<HDRTorrentResult[]> {
  try {
    const translated = await TranslationService.translate(query, 'en', 'pt-BR');
    const searchUrls = [
      `https://hdrtorrent.com/index.php?s=${encodeURIComponent(translated)}`,
    ];
    if (translated.toLowerCase() !== query.toLowerCase()) {
      searchUrls.push(`https://hdrtorrent.com/index.php?s=${encodeURIComponent(query)}`);
    }

    for (const searchUrl of searchUrls) {
      try {
        logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${searchUrl}`);
        const response = await fetchWithBypass(searchUrl, { timeout: 15000 });
        const html = response.data;

        const detailPages: Array<{ url: string; title: string; poster?: string; quality?: string; type?: string }> = [];
        const cardRegex = /<div\s+class='capa-img[^']*'>\s*<a\s+href='([^']+)'[^>]*>.*?<img\s+src='([^']+)'.*?<\/a>\s*<h2\s+class='h6'><a[^>]*>([^<]+)<\/a>\s*<span\s+class='box_midia\s+bg-success'>([^<]*)<\/span>\s*<span\s+class='box_qual\s+bg-danger'>([^<]*)<\/span>/gis;

        let match;
        while ((match = cardRegex.exec(html)) !== null) {
          const url = match[1].startsWith('http') ? match[1] : `https://hdrtorrent.com/${match[1]}`;
          if (!detailPages.find(p => p.url === url)) {
            detailPages.push({
              url,
              poster: match[2],
              title: match[3].trim(),
              type: match[4].trim(),
              quality: match[5].trim(),
            });
          }
        }

        if (detailPages.length === 0) {
          const linkRegex = /href='(https:\/\/hdrtorrent\.com\/[^']+-torrent-download\/)'/gi;
          let lm: RegExpExecArray | null;
          while ((lm = linkRegex.exec(html)) !== null) {
            if (!detailPages.find(p => p.url === lm![1])) {
              detailPages.push({ url: lm[1], title: '' });
            }
          }
        }

        if (detailPages.length === 0) continue;

        const results: HDRTorrentResult[] = [];
        for (const page of detailPages.slice(0, 10)) {
          try {
            const magnets = await extractMagnetsFromPage(page.url);
            for (const mag of magnets) {
              if (!isPTBR(mag.title)) continue;
              results.push({
                ...mag,
                source: 'HDRTorrent',
                poster: page.poster,
                quality: page.quality || mag.quality,
                type: page.type || mag.type,
              });
            }
          } catch { /* skip failed pages */ }
        }

        if (results.length > 0) {
          logger.info(COMPONENT, `Found ${results.length} PT-BR magnets for "${query}"`);
          return results;
        }
      } catch (err: any) {
        logger.warn(COMPONENT, `Search failed for "${query}": ${err.message}`);
      }
    }

    return [];
  } catch (err: any) {
    logger.warn(COMPONENT, `searchByTitle failed: ${err.message}`);
    return [];
  }
}

async function extractMagnetsFromPage(pageUrl: string): Promise<Array<{ title: string; magnet: string; quality?: string; type?: string; poster?: string }>> {
  logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${pageUrl}`);
  const response = await fetchWithBypass(pageUrl, { timeout: 15000 });
  const html = response.data;
  const results: Array<{ title: string; magnet: string; quality?: string; type?: string; poster?: string }> = [];

  const posterMatch = html.match(/<meta\s+property='og:image'\s+content='([^']+)'/i);
  const poster = posterMatch?.[1];

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const fullTitle = titleMatch?.[1] || '';

  const qualityMatch = html.match(/<b>Qualidade<\/b>:\s*([^<]+)/i);
  const quality = qualityMatch?.[1]?.trim();

  const typeMatch = html.match(/<span\s+class='box_midia\s+bg-success'>([^<]*)<\/span>/i);
  const type = typeMatch?.[1]?.trim();

  const magnetRegex = /href=['"](magnet:\?[^'"]+)['"]/gi;
  let match;
  const seen = new Set<string>();
  while ((match = magnetRegex.exec(html)) !== null) {
    const magnet = match[1];
    if (seen.has(magnet)) continue;
    seen.add(magnet);

    let title = '';
    const dn = magnet.match(/dn=([^&]+)/);
    if (dn) title = decodeURIComponent(dn[1]).replace(/\+/g, ' ');

    const idx = html.indexOf(match[0]);
    const context = html.substring(Math.max(0, idx - 500), idx + match[0].length + 200);
    const ctxQuality = context.match(/(?:1080p|720p|4k|2160p|WEB-DL|BluRay|HDR)/i)?.[0];

    results.push({
      title: title || fullTitle,
      magnet,
      quality: ctxQuality || quality || undefined,
      type,
      poster,
    });
  }

  return results;
}

export async function searchHDR(query: string): Promise<HDRTorrentResult[]> {
  const results = await searchByTitle(query);
  logger.info(COMPONENT, `HDRTorrent: ${results.length} PT-BR magnets for "${query}"`);
  return results;
}

export const HDRTorrentService = {
  searchHDR,
  searchByTitle,
  extractMagnetsFromPage,
};