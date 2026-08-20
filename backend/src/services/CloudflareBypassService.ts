// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger } from '../utils/logger';

const COMPONENT = 'CloudflareBypass';

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || 'http://flaresolverr:8191/v1';
const BYPASS_ENABLED = process.env.TORRENT_BYPASS_ENABLED !== 'false';
const COOKIE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface BypassCookies {
  cf_clearance: string;
  userAgent: string;
  expiresAt: number;
}

interface SolverResult {
  cookies?: BypassCookies;
  html?: string;
}

const cookieCache = new Map<string, BypassCookies>();

const CF_CHALLENGE_SIGNATURES = [
  'just a moment',
  'checking your browser',
  'cf-challenge',
  'cf-turnstile',
  'challenge-platform',
  'ray id:',
  '__cf_chl_',
  'cf_chl_opt',
  'cf_chl1',
  'verify you are human',
  'attention required',
];

function isCloudflareChallenge(html: string, status: number): boolean {
  if (status === 403 || status === 503) return true;
  const lower = html.toLowerCase();
  return CF_CHALLENGE_SIGNATURES.some(sig => lower.includes(sig));
}

function describeCloudflareBlock(html: string, status: number): string {
  if (status === 403 || status === 503) return `HTTP ${status}`;
  const lower = html.toLowerCase();
  const hit = CF_CHALLENGE_SIGNATURES.find(sig => lower.includes(sig));
  return hit ? `assinatura "${hit}" no HTML` : 'resposta incompatível';
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

function getCachedCookies(domain: string): BypassCookies | null {
  const cached = cookieCache.get(domain);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    cookieCache.delete(domain);
    return null;
  }
  return cached;
}

function setCachedCookies(domain: string, cookies: BypassCookies): void {
  cookieCache.set(domain, { ...cookies, expiresAt: Date.now() + COOKIE_TTL_MS });
}

const FLARESOLVERR_MAX_RETRIES = 3;

async function tryFlareSolverr(url: string): Promise<SolverResult | null> {
  if (!BYPASS_ENABLED) return null;

  for (let attempt = 1; attempt <= FLARESOLVERR_MAX_RETRIES; attempt++) {
    try {
      logger.info(COMPONENT, `[FLARESOLVRR] Tentando resolver challenge (tentativa ${attempt}/${FLARESOLVERR_MAX_RETRIES}) para ${url}`);
      const response = await axios.post(`${FLARESOLVERR_URL}`, {
        cmd: 'request.get',
        url,
        maxTimeout: 60000,
      }, { timeout: 65000 });

      const solution = response.data?.solution;
      if (!solution) {
        logger.warn(COMPONENT, `[FLARESOLVRR] Tentativa ${attempt} sem solution para ${url}`);
        continue;
      }

      // FlareSolverr já resolveu o challenge e devolve o HTML final em solution.response.
      // Se a resposta não parece mais um challenge, usamos ela DIRETO como resultado —
      // nem todo site emite cf_clearance (alguns usam cookies de sessão).
      const solvedHtml: string = solution.response || '';
      if (solvedHtml && !isCloudflareChallenge(solvedHtml, 200)) {
        logger.info(COMPONENT, `[FLARESOLVRR] Sucesso na tentativa ${attempt} - HTML resolvido (${solvedHtml.length} bytes) para ${url}`);
        return { html: solvedHtml, cookies: extractCookies(solution, url) || undefined };
      }

      // Fallback: tenta extrair cf_clearance para re-request com cookie.
      const cfCookie = (solution.cookies || []).find((c: any) => c.name === 'cf_clearance');
      if (cfCookie) {
        logger.info(COMPONENT, `[FLARESOLVRR] Sucesso na tentativa ${attempt} - cf_clearance obtido para ${url}`);
        return {
          cookies: {
            cf_clearance: cfCookie.value,
            userAgent: solution.userAgent || DEFAULT_USER_AGENT,
            expiresAt: 0,
          },
        };
      }
      logger.warn(COMPONENT, `[FLARESOLVRR] Tentativa ${attempt} sem HTML válido nem cf_clearance para ${url}`);
    } catch (err: any) {
      logger.warn(COMPONENT, `[FLARESOLVRR] Tentativa ${attempt} falhou para ${url}: ${err.message}`);
    }

    if (attempt < FLARESOLVERR_MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }

  return null;
}

function extractCookies(solution: any, url: string): BypassCookies | null {
  const cfCookie = (solution.cookies || []).find((c: any) => c.name === 'cf_clearance');
  if (!cfCookie) return null;
  return {
    cf_clearance: cfCookie.value,
    userAgent: solution.userAgent || DEFAULT_USER_AGENT,
    expiresAt: 0,
  };
}

async function tryPuppeteerStealth(url: string): Promise<SolverResult | null> {
  if (!BYPASS_ENABLED) return null;

  let puppeteer: any;
  let stealthPlugin: any;
  try {
    puppeteer = require('puppeteer-extra');
    stealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(stealthPlugin());
  } catch (e) {
    logger.error(COMPONENT, `[PUPPETEER] Dependências não instaladas: puppeteer-extra, puppeteer-extra-plugin-stealth, puppeteer`);
    return null;
  }

  let browser: any;
  try {
    logger.info(COMPONENT, `[PUPPETEER] Iniciando Chrome headless para ${url}`);
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
      ],
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    });

    const page = await browser.newPage();
    await page.setUserAgent(DEFAULT_USER_AGENT);
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    if (!response) {
      logger.warn(COMPONENT, `[PUPPETEER] Sem resposta para ${url}`);
      return null;
    }

    const cookies = await page.cookies();
    const cfCookie = cookies.find((c: any) => c.name === 'cf_clearance');
    const userAgent = await page.evaluate(() => navigator.userAgent);

    if (cfCookie) {
      logger.info(COMPONENT, `[PUPPETEER] Sucesso - cf_clearance obtido para ${url}`);
      return {
        cookies: {
          cf_clearance: cfCookie.value,
          userAgent,
          expiresAt: 0,
        },
      };
    }

    // Challenge resolvido via Puppeteer: retorna o HTML renderizado como resposta final.
    const html = await page.content();
    if (html && !isCloudflareChallenge(html, 200)) {
      logger.info(COMPONENT, `[PUPPETEER] Sucesso - HTML renderizado (${html.length} bytes) para ${url}`);
      return { html };
    }

    logger.warn(COMPONENT, `[PUPPETEER] Challenge resolvido mas sem cf_clearance para ${url}`);
  } catch (err: any) {
    logger.error(COMPONENT, `[PUPPETEER] Erro para ${url}: ${err.message}`);
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
  return null;
}

async function resolveChallenge(url: string): Promise<SolverResult | null> {
  const domain = getDomain(url);
  
  const cached = getCachedCookies(domain);
  if (cached) {
    logger.info(COMPONENT, `[CACHE] Usando cookies em cache para ${domain}`);
    return { cookies: cached };
  }

  let result = await tryFlareSolverr(url);
  if (!result) {
    logger.info(COMPONENT, `[FALLBACK] FlareSolverr indisponível, tentando Puppeteer-Stealth para ${url}`);
    result = await tryPuppeteerStealth(url);
  }

  if (result?.cookies) {
    setCachedCookies(domain, result.cookies);
  }
  return result;
}

const MAX_BYPASS_ATTEMPTS = 3;

export async function fetchWithBypass<T = string>(url: string, options: AxiosRequestConfig = {}): Promise<AxiosResponse<T>> {
  const domain = getDomain(url);
  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  const attemptRequest = async (extraHeaders: Record<string, string> = {}): Promise<AxiosResponse<T>> => {
    return axios.get<T>(url, {
      ...options,
      headers: { ...defaultHeaders, ...options.headers, ...extraHeaders },
      timeout: options.timeout || 30000,
      validateStatus: () => true,
    });
  };

  let response = await attemptRequest();

  if (isCloudflareChallenge(String(response.data), response.status)) {
    logger.warn(COMPONENT, `[CLOUDFLARE BLOCK DETECTADO] ${domain} (status: ${response.status} | ${describeCloudflareBlock(String(response.data), response.status)})`);

    for (let attempt = 1; attempt <= MAX_BYPASS_ATTEMPTS; attempt++) {
      const solved = await resolveChallenge(url);
      if (!solved) {
        logger.error(COMPONENT, `[BYPASS FALHOU] Não foi possível obter cookies para ${domain} (tentativa ${attempt}/${MAX_BYPASS_ATTEMPTS})`);
        break;
      }

      // FlareSolverr/Puppeteer já resolveram o challenge e devolveram o HTML final:
      // usamos a resposta diretamente, sem re-request.
      if (solved.html) {
        response = {
          data: solved.html,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: { headers: {}, method: 'get', url },
        } as AxiosResponse<T>;
        logger.info(COMPONENT, `[BYPASS SUCESSO] ${domain} - HTML resolvido via solver (tentativa ${attempt})`);
        break;
      }

      if (!solved.cookies) {
        logger.error(COMPONENT, `[BYPASS FALHOU] Solver sem cookies válidos para ${domain} (tentativa ${attempt}/${MAX_BYPASS_ATTEMPTS})`);
        break;
      }

      response = await attemptRequest({
        'Cookie': `cf_clearance=${solved.cookies.cf_clearance}`,
        'User-Agent': solved.cookies.userAgent,
      });

      if (isCloudflareChallenge(String(response.data), response.status)) {
        logger.error(COMPONENT, `[BYPASS FALHOU] Cloudflare ainda bloqueando ${domain} após bypass (tentativa ${attempt}/${MAX_BYPASS_ATTEMPTS})`);
        if (attempt < MAX_BYPASS_ATTEMPTS) {
          await new Promise(r => setTimeout(r, 3000));
        }
      } else {
        logger.info(COMPONENT, `[BYPASS SUCESSO] ${domain} - challenge resolvido na tentativa ${attempt}`);
        break;
      }
    }
  }

  return response;
}

export function createAxiosWithBypass(baseURL?: string): AxiosInstance {
  const instance = axios.create({
    baseURL,
    timeout: 30000,
    validateStatus: () => true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  instance.interceptors.response.use(async (response) => {
    const url = response.config.url ? (baseURL ? `${baseURL}${response.config.url}` : response.config.url) : '';
    if (url && isCloudflareChallenge(response.data, response.status)) {
      logger.warn(COMPONENT, `[CLOUDFLARE BLOCK DETECTADO] ${url} (status: ${response.status} | ${describeCloudflareBlock(response.data, response.status)})`);
      const solved = await resolveChallenge(url);
      if (!solved) return response;

      // Solver já resolveu e devolveu o HTML final: retorna como resposta.
      if (solved.html) {
        logger.info(COMPONENT, `[BYPASS SUCESSO] ${url} - HTML resolvido via solver (${solved.html.length} bytes)`);
        return {
          ...response,
          data: solved.html,
          status: 200,
          statusText: 'OK',
        };
      }

      if (!solved.cookies) return response;
      const retryConfig = {
        ...response.config,
        headers: {
          ...response.config.headers,
          'Cookie': `cf_clearance=${solved.cookies.cf_clearance}`,
          'User-Agent': solved.cookies.userAgent,
        },
      };
      return instance.request(retryConfig);
    }
    return response;
  });

  return instance;
}

export const CloudflareBypassService = {
  fetchWithBypass,
  createAxiosWithBypass,
  isCloudflareChallenge,
  clearCache: () => cookieCache.clear(),
};