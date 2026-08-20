// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import axios from 'axios';
import { logger } from '../utils/logger';
import { Settings } from '../models/Settings';
import { Movie } from '../models/Movie';

const COMPONENT = 'RadarrService';

// Tamanho mínimo em MB para considerar um download válido (abaixo disso é propaganda/spam)
const MIN_SIZE_MB = 300;

// Whitelist estrita PT-BR — o release SÓ passa se tiver 100% de certeza que é PT-BR
const PTBR_WHITELIST = /\b(dub(lad[oá])?|dual(?:\s*(?:á|a)udio)?|pt[-_.]?br|portugu[eê]s|nacional)\b/i;

// Rejeição imediata — qualquer marcador estrangeiro mata o release
const FOREIGN_BLACKLIST = /\b(french|vff|vf2?|vfq|fre\b|fra\b|eng\b|en\s|es\b|subbed|ita|somm|rus(sian)?\b|esp\b|espa[nñ]ol|spanish|latino|multi(?![^.]*\bbr\b))\b/i;

let configCache: { url: string; apiKey: string } | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 60_000;

async function getConfig() {
  if (configCache && Date.now() - configCacheTime < CONFIG_CACHE_TTL) {
    return configCache;
  }
  const s = await Settings.findOne();
  configCache = {
    url: s?.radarrUrl || process.env.RADARR_URL || 'http://radarr:7878',
    apiKey: s?.radarrApiKey || process.env.RADARR_API_KEY || '',
  };
  configCacheTime = Date.now();
  return configCache;
}

/**
 * Sistema de scoring para priorização de releases.
 * Política STRICT PT-BR: releases em idioma estrangeiro são rejeitados na origem
 * (nunca baixamos versão EN). Somente releases com whitelist PT-BR pontuam:
 * Prioridade 1: PT-BR/DUAL/Dublado + 1080p
 * Prioridade 2: PT-BR/DUAL/Dublado + 720p
 */
function scoreRelease(release: any, movieTitle?: string, movieYear?: number): number {
  const title = (release.title || '').toLowerCase();
  const sizeMB = (release.size || 0) / 1024 / 1024;

  // Barra idioma estrangeiro (defesa em profundidade — o filtro no manualGrab já rejeita)
  if (FOREIGN_BLACKLIST.test(title) || !PTBR_WHITELIST.test(title)) return -99999;

  // Palavras-chave de áudio em português
  const ptKeywords = ['pt-br', 'pt_br', 'dual', 'dublado', 'dub', 'portugues', 'portuguese', 'br', 'brrip'];
  const isPT = ptKeywords.some(k => title.includes(k));
  
  // Qualidade
  const is1080p = title.includes('1080p') || title.includes('1080');
  const is720p = title.includes('720p') || title.includes('720');
  
  // Tamanho (preferir arquivos menores dentro da qualidade)
  let sizeScore = 0;
  if (sizeMB > 0 && sizeMB <= 4096) sizeScore = 100 - (sizeMB / 40); // 0-100 baseado no tamanho
  
  // Scoring principal
  let score = 0;
  
  if (isPT && is1080p) score = 4000 + sizeScore;           // Prioridade 1
  else if (isPT && is720p) score = 3000 + sizeScore;       // Prioridade 2
  else score = sizeScore;                                   // Fallback (nunca usado com filtro estrito)
  
  // Bonus por seeders
  const seeders = release.seeders || 0;
  score += Math.min(seeders * 0.1, 50);
  
  // Penalidade por packs/collections
  if (title.includes('collection') || title.includes('trilogy') || title.includes('pack') || title.includes('boxset')) {
    score -= 500;
  }
  
  // Penalidade por 3D
  if (title.includes('3d') || title.includes('hsbs') || title.includes('sbs')) {
    score -= 1000;
  }
  
  // Verificação de ano se fornecido
  if (movieYear) {
    const yearStr = movieYear.toString();
    const hasWrongYear = /\b(20\d{2}|19\d{2})\b/.test(title) && !title.includes(yearStr);
    if (hasWrongYear) score -= 2000;
  }
  
  // Penalidade forte para arquivos muito pequenos (provavelmente propaganda/spam)
  if (sizeMB > 0 && sizeMB < MIN_SIZE_MB) {
    score -= 3000;
  }
  
  return score;
}

export const RadarrService = {
  async searchMovie(query: string) {
    const config = await getConfig();
    const { data } = await axios.get(`${config.url}/api/v3/movie/lookup`, {
      params: { term: query },
      headers: { 'X-Api-Key': config.apiKey },
    });
    return data.map((m: any) => {
      const poster = m.images?.find((i: any) => i.coverType === 'poster')?.url?.replace(/MediaCoverProxy/g, 'MediaCover');
      const backdrop = m.images?.find((i: any) => i.coverType === 'fanart')?.url?.replace(/MediaCoverProxy/g, 'MediaCover');
      const result = {
        id: m.tmdbId,
        title: m.title,
        year: m.year,
        overview: m.overview,
        poster: poster?.startsWith('/') ? '/media-api/radarr-cover' + poster : poster,
        backdrop: backdrop?.startsWith('/') ? '/media-api/radarr-cover' + backdrop : backdrop,
        genres: m.genres || [],
        rating: m.ratings?.tmdb?.value || 0,
      };
      if (poster) {
        logger.info(COMPONENT, `Poster URL for "${m.title}"`, {
          originalPoster: poster,
          proxiedPoster: result.poster,
          hasBackdrop: !!backdrop,
        });
      }
      return result;
    });
  },

  async addMovie(tmdbId: number, title: string, year: number, qualityProfileId = 7, rootFolderPath = '/media/movies') {
    const config = await getConfig();
    try {
      const { data } = await axios.post(`${config.url}/api/v3/movie`, {
        tmdbId,
        title,
        year,
        qualityProfileId,
        rootFolderPath,
        // monitored:false + searchForMovie:false → Radarr NUNCA baixa sozinho (nem via RSS),
        // evitando que indexers retornem versão EN. O grab é feito apenas pelo
        // manualGrab estrito PT-BR do app (filtro na origem, antes do qBittorrent).
        monitored: false,
        addOptions: { searchForMovie: false },
      }, { headers: { 'X-Api-Key': config.apiKey } });
      return data;
    } catch (err: any) {
      if (err.response?.status === 400) {
        const existing = await this.lookupByTmdbId(tmdbId);
        if (existing) return existing;
      }
      throw err;
    }
  },

  async lookupByTmdbId(tmdbId: number) {
    const config = await getConfig();
    const { data } = await axios.get(`${config.url}/api/v3/movie/lookup`, {
      params: { term: `tmdb:${tmdbId}` },
      headers: { 'X-Api-Key': config.apiKey },
    });
    if (data?.length) return data[0];
    return null;
  },

  async getMovie(radarrId: number) {
    const config = await getConfig();
    const { data } = await axios.get(`${config.url}/api/v3/movie/${radarrId}`, {
      headers: { 'X-Api-Key': config.apiKey },
    });
    return data;
  },

  async deleteMovie(radarrId: number, deleteFiles = true) {
    const config = await getConfig();
    await axios.delete(`${config.url}/api/v3/movie/${radarrId}`, {
      headers: { 'X-Api-Key': config.apiKey },
      data: { deleteFiles },
    });
  },

  /**
   * Busca releases disponíveis para um filme e faz grab manual do melhor usando scoring inteligente.
   */
  async manualGrab(movieId: number, maxSizeMB = 3072, movieTitle?: string, movieYear?: number): Promise<{ grabbed: boolean; title?: string; sizeMB?: number; error?: string }> {
    const config = await getConfig();
    try {
      const { data: releases } = await axios.get(`${config.url}/api/v3/release`, {
        params: { movieId },
        headers: { 'X-Api-Key': config.apiKey },
        timeout: 30000,
      });

      logger.info(COMPONENT, `Manual grab: ${releases.length} releases found for movie ${movieId}`);

      // Normalizar título do filme para matching
      const normalizedTitle = (movieTitle || '').toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const titleWords = normalizedTitle.split(' ').filter((w: string) => w.length > 2);

      // Filtrar releases válidos
      const candidates = releases.filter((r: any) => {
        const title = (r.title || '').toLowerCase();
        const sizeMB = (r.size || 0) / 1024 / 1024;
        const rejections = r.rejections || [];

        // Deve ter palavras do título do filme no release
        if (titleWords.length > 0) {
          const matchCount = titleWords.filter((w: string) => title.includes(w)).length;
          if (matchCount === 0) return false;
        }

        // Whitelist estrita PT-BR — barra idioma estrangeiro NA ORIGEM
        if (FOREIGN_BLACKLIST.test(title)) return false;
        if (!PTBR_WHITELIST.test(title)) return false;

        // Se tem ano, o release DEVE conter o ano
        if (movieYear) {
          const yearStr = movieYear.toString();
          const hasWrongYear = /\b(20\d{2}|19\d{2})\b/.test(title) && !title.includes(yearStr);
          if (hasWrongYear) return false;
        }

        // Deve ter 1080p ou 720p no nome
        if (!title.includes('1080p') && !title.includes('1080') && !title.includes('720p') && !title.includes('720')) return false;
        
        // Não pode ter rejeição
        if (rejections.length > 0) return false;
        
        // Tamanho deve ser menor que o limite
        if (sizeMB > maxSizeMB) return false;
        
        // Rejeitar arquivos muito pequenos (provavelmente propaganda/spam)
        if (sizeMB > 0 && sizeMB < MIN_SIZE_MB) return false;
        
        // Não pode ser pack
        if (title.includes('collection') || title.includes('trilogy') || title.includes('pack')) return false;
        
        // Não pode ser 3D
        if (title.includes('3d') || title.includes('hsbs') || title.includes('sbs')) return false;

        return true;
      });

      if (candidates.length === 0) {
        logger.warn(COMPONENT, `Manual grab: no suitable releases for movie ${movieId}`);
        return { grabbed: false, error: 'Nenhum release adequado encontrado' };
      }

      // Ordenar por score (maior primeiro)
      candidates.sort((a: any, b: any) => scoreRelease(b, movieTitle, movieYear) - scoreRelease(a, movieTitle, movieYear));
      
      const best = candidates[0];
      const bestScore = scoreRelease(best, movieTitle, movieYear);
      
      logger.info(COMPONENT, `Best release selected: "${best.title}" (score: ${bestScore.toFixed(1)})`);

      // 4. Fazer grab
      await axios.post(`${config.url}/api/v3/release`, best, {
        headers: { 'X-Api-Key': config.apiKey, 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      const sizeMB = Math.round((best.size || 0) / 1024 / 1024);
      logger.info(COMPONENT, `Manual grab SUCCESS: "${best.title}" (${sizeMB}MB)`);

      return { grabbed: true, title: best.title, sizeMB };
    } catch (err: any) {
      logger.error(COMPONENT, `Manual grab failed for movie ${movieId}: ${err.message}`);
      return { grabbed: false, error: err.message };
    }
  },

  getRadarrConfig() {
    return getConfig();
  },
};
