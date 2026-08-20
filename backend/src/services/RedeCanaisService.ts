// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { logger } from '../utils/logger';
import { TranslationService } from './TranslationService';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fetchWithBypass } from './CloudflareBypassService';

const COMPONENT = 'RedeCanais';

interface VideoSource {
  url: string;
  quality: string;
  title: string;
  type: 'direct' | 'hls';
}

async function searchContent(query: string): Promise<string | null> {
  const translatedQuery = await TranslationService.translate(query, 'en', 'pt-BR');
  logger.info(COMPONENT, `Translated: "${query}" → "${translatedQuery}"`);

  const searchUrl = `https://redecanaishd.rest/?s=${encodeURIComponent(translatedQuery)}`;
  logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${searchUrl}`);
  const response = await fetchWithBypass(searchUrl, { timeout: 15000 });
  const html = response.data;

  const allLinks: string[] = [];
  const re = /href=['"]((?:https?:\/\/[^'"]+)?\/(?:series|filme|episodio)\/[^'"]+)['"]/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const url = match[1].startsWith('http') ? match[1] : 'https://redecanaishd.rest' + match[1];
    if (!url.match(/\/(series|filmes?)\/?$/) && !allLinks.includes(url)) allLinks.push(url);
  }

  if (allLinks.length > 0) {
    logger.info(COMPONENT, `Found ${allLinks.length} results: ${allLinks[0]}`);
    return allLinks[0];
  }
  return null;
}

async function getFirstEpisodeUrl(seriesUrl: string): Promise<string> {
  if (seriesUrl.includes('/episodios/')) return seriesUrl;

  logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${seriesUrl}`);
  const response = await fetchWithBypass(seriesUrl, { timeout: 15000 });
  const html = response.data;
  const epLinks: string[] = [];
  const re = /href=['"]([^'"]*\/episodios\/[^'"]+)['"]/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const url = match[1].startsWith('http') ? match[1] : new URL(seriesUrl).origin + match[1];
    if (!epLinks.includes(url)) epLinks.push(url);
  }
  return epLinks[0] || seriesUrl;
}

async function extractEmbeds(pageUrl: string): Promise<{ filmtyp?: string; vidmoly?: string }> {
  logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${pageUrl}`);
  const response = await fetchWithBypass(pageUrl, { timeout: 15000 });
  const html = response.data;
  const result: { filmtyp?: string; vidmoly?: string } = {};

  const embeds = html.match(/data-embed=['"]([^'"]+)['"]/g) || [];
  for (const embed of embeds) {
    const ftMatch = embed.match(/filmtyp\.site\/e\/([a-zA-Z0-9]+)/);
    if (ftMatch) result.filmtyp = ftMatch[1];

    const vmMatch = embed.match(/vidmoly\.net\/(?:embed-)?([a-zA-Z0-9]+)/);
    if (vmMatch) result.vidmoly = vmMatch[1];
  }

  return result;
}

async function getKaken(token: string): Promise<string | null> {
  const url = `https://filmtyp.site/d/${token}`;
  logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${url}`);
  const response = await fetchWithBypass(url, { timeout: 15000 });
  const html = response.data;

  const evStart = html.indexOf('eval(function(p,a,c,k,e,d)');
  if (evStart === -1) return null;

  const evStr = html.substring(evStart);
  let depth = 0, end = 0;
  for (let j = 0; j < evStr.length; j++) {
    if (evStr[j] === '(') depth++;
    if (evStr[j] === ')') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  const evalFull = evStr.substring(0, end);

  const evRe = new RegExp("eval\\(function\\(p,a,c,k,e,d\\)\\{([\\s\\S]*?)\\}\\('([\\s\\S]*?)',(\\d+),(\\d+),'([\\s\\S]*?)'\\)\\)");
  const evM = evalFull.match(evRe);
  if (!evM) return null;

  const kk = evM[5].split('|');
  const ka = parseInt(evM[4]);
  const kc = parseInt(evM[3]);
  const kp = evM[2];

  function unpack(p: string, a: number, c: number, k: string[]) {
    let e = function (d: number) {
      let retval = '';
      while (d--) {
        if (k[d]) {
          retval = p.replace(new RegExp('\\b' + d.toString(a) + '\\b', 'g'), k[d]);
          p = retval;
        }
      }
      return p;
    };
    return e(c);
  }

  const unpacked = unpack(kp, ka, kc, kk);
  const km = unpacked.match(/window\.kaken\s*=\s*['"]([^'"]+)['"]/);
  return km ? km[1] : null;
}

async function getFilmtypSources(kaken: string): Promise<VideoSource[]> {
  const url = `https://filmtyp.site/api/?${kaken}`;
  logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${url}`);
  const response = await fetchWithBypass<{ status: string; sources: any[]; title?: string }>(url, { timeout: 15000 });
  const data = response.data;

  if (data.status !== 'ok' || !data.sources) return [];
  return data.sources.map((s: any) => ({
    url: s.file, quality: s.label || 'Default', title: data.title || 'Video', type: 'direct' as const,
  }));
}

async function getVidmolySources(token: string): Promise<VideoSource[]> {
  const url = `https://vidmoly.net/embed-${token}.html`;
  logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${url}`);
  const response = await fetchWithBypass(url, { timeout: 15000 });
  const html = response.data;

  const sourcesMatch = html.match(/sources\s*[:=]\s*\[{[^}]*file\s*[:=]\s*['"]([^'"]+\.m3u8[^'"]*)['"]/);
  if (!sourcesMatch) return [];

  const m3u8Url = sourcesMatch[1];
  const title = html.match(/title\s*[:=]\s*['"]([^'"]+)['"]/)?.[1] || 'Video';

  try {
    logger.info(COMPONENT, `[BYPASS] Requisição via CloudflareBypassService para ${m3u8Url}`);
    const m3u8Response = await fetchWithBypass(m3u8Url, { timeout: 10000 });
    const m3u8 = m3u8Response.data;
    const variants: VideoSource[] = [];
    const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

    const lines = m3u8.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
        const nextLine = lines[i + 1]?.trim();
        if (nextLine && !nextLine.startsWith('#')) {
          const variantUrl = nextLine.startsWith('http') ? nextLine : baseUrl + nextLine;
          const res = resMatch?.[1] || '';
          const label = res.includes('1080') ? '1080p' : res.includes('720') ? '720p' : res.includes('480') ? '480p' : res || 'Auto';
          variants.push({ url: variantUrl, quality: label, title, type: 'hls' });
        }
      }
    }

    if (variants.length === 0) {
      variants.push({ url: m3u8Url, quality: 'Auto', title, type: 'hls' });
    }

    return variants;
  } catch {
    return [{ url: m3u8Url, quality: 'Auto', title, type: 'hls' }];
  }
}

async function downloadHLS(hlsUrl: string, savePath: string, title: string): Promise<boolean> {
  try {
    const sanitized = title.replace(/[^a-zA-Z0-9\s\-_.]/g, '').trim();

    fs.mkdirSync(savePath, { recursive: true });

    const outputPath = path.join(savePath, `${sanitized}.mp4`);

    if (fs.existsSync(outputPath)) {
      logger.info(COMPONENT, `File already exists, skipping: ${outputPath}`);
      return true;
    }

    logger.info(COMPONENT, `Downloading HLS: ${hlsUrl.substring(0, 80)}...`);
    execSync(`ffmpeg -i "${hlsUrl}" -c copy -bsf:a aac_adtstoasc "${outputPath}" -y`, {
      timeout: 600000,
      stdio: 'pipe',
    });

    logger.info(COMPONENT, `Downloaded: ${outputPath}`);
    return true;
  } catch (err: any) {
    logger.error(COMPONENT, `HLS download failed: ${err.message}`);
    return false;
  }
}

export async function searchBR(query: string): Promise<VideoSource[]> {
  try {
    const contentUrl = await searchContent(query);
    if (!contentUrl) return [];

    const episodeUrl = await getFirstEpisodeUrl(contentUrl);
    const embeds = await extractEmbeds(episodeUrl);

    if (embeds.filmtyp) {
      const kaken = await getKaken(embeds.filmtyp);
      if (kaken) {
        const sources = await getFilmtypSources(kaken);
        if (sources.length > 0) {
          logger.info(COMPONENT, `Found ${sources.length} filmtyp sources for "${query}"`);
          return sources;
        }
      }
    }

    if (embeds.vidmoly) {
      const sources = await getVidmolySources(embeds.vidmoly);
      if (sources.length > 0) {
        logger.info(COMPONENT, `Found ${sources.length} vidmoly sources for "${query}"`);
        return sources;
      }
    }

    logger.warn(COMPONENT, `No downloadable sources found for "${query}"`);
    return [];
  } catch (err: any) {
    logger.warn(COMPONENT, `searchBR failed: ${err.message}`);
    return [];
  }
}

export const RedeCanaisService = {
  searchBR,
  searchContent,
  getFirstEpisodeUrl,
  extractEmbeds,
  getKaken,
  getFilmtypSources,
  getVidmolySources,
  downloadHLS,
};