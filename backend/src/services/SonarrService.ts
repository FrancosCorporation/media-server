// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import axios from 'axios';
import { logger } from '../utils/logger';
import { Settings } from '../models/Settings';

const COMPONENT = 'SonarrService';

// Tamanho mínimo em MB para considerar um download válido (abaixo disso é propaganda/spam)
const MIN_SIZE_MB = 300;

async function getConfig() {
  const s = await Settings.findOne();
  return {
    url: s?.sonarrUrl || process.env.SONARR_URL || 'http://sonarr:8989',
    apiKey: s?.sonarrApiKey || process.env.SONARR_API_KEY || '',
  };
}

/**
 * Sistema de scoring para priorização de releases de séries.
 * Prioridade 1: PT-BR/DUAL/Dublado + 1080p
 * Prioridade 2: PT-BR/DUAL/Dublado + 720p
 * Prioridade 3: Original (EN) + 1080p
 * Prioridade 4: Original (EN) + 720p
 */
function scoreRelease(release: any, seriesTitle?: string): number {
  const title = (release.title || '').toLowerCase();
  const sizeMB = (release.size || 0) / 1024 / 1024;
  
  const ptKeywords = ['pt-br', 'pt_br', 'dual', 'dublado', 'dub', 'portugues', 'portuguese', 'br', 'brrip'];
  const isPT = ptKeywords.some(k => title.includes(k));
  
  const is1080p = title.includes('1080p') || title.includes('1080');
  const is720p = title.includes('720p') || title.includes('720');
  
  let sizeScore = 0;
  if (sizeMB > 0) sizeScore = Math.max(0, 100 - (sizeMB / 20));
  
  let score = 0;
  
  if (isPT && is1080p) score = 4000 + sizeScore;
  else if (isPT && is720p) score = 3000 + sizeScore;
  else if (!isPT && is1080p) score = 2000 + sizeScore;
  else if (!isPT && is720p) score = 1000 + sizeScore;
  else score = sizeScore;
  
  const seeders = release.seeders || 0;
  score += Math.min(seeders * 0.1, 50);
  
  if (title.includes('collection') || title.includes('pack') || title.includes('boxset')) {
    score -= 500;
  }
  
  if (title.includes('3d') || title.includes('hsbs') || title.includes('sbs')) {
    score -= 1000;
  }
  
  // Penalidade forte para arquivos muito pequenos (provavelmente propaganda/spam)
  if (sizeMB > 0 && sizeMB < MIN_SIZE_MB) {
    score -= 3000;
  }
  
  return score;
}

export const SonarrService = {
  async searchSeries(query: string) {
    const config = await getConfig();
    const { data } = await axios.get(`${config.url}/api/v3/series/lookup`, {
      params: { term: query },
      headers: { 'X-Api-Key': config.apiKey },
    });
    return data.map((s: any) => {
      const poster = s.images?.find((i: any) => i.coverType === 'poster')?.url;
      const backdrop = s.images?.find((i: any) => i.coverType === 'fanart')?.url;
      return {
        id: s.tvdbId,
        tvdbId: s.tvdbId,
        tmdbId: s.tmdbId,
        title: s.title,
        year: s.year,
        overview: s.overview,
        poster: poster?.startsWith('/') ? '/media-api/sonarr-cover' + poster : poster,
        backdrop: backdrop?.startsWith('/') ? '/media-api/sonarr-cover' + backdrop : backdrop,
        genres: s.genres || [],
        rating: s.ratings?.tmdb?.value || 0,
        seasons: s.seasons?.filter((se: any) => se.seasonNumber > 0)?.length || 0,
      };
    });
  },

  async deleteSeries(sonarrId: number, deleteFiles = true) {
    const config = await getConfig();
    await axios.delete(`${config.url}/api/v3/series/${sonarrId}`, {
      headers: { 'X-Api-Key': config.apiKey },
      data: { deleteFiles },
    });
  },

  /**
   * Busca releases disponíveis para uma série e faz grab manual do melhor usando scoring inteligente.
   */
  async manualGrab(seriesId: number, maxSizeMB = Infinity, seriesTitle?: string): Promise<{ grabbed: boolean; title?: string; sizeMB?: number; error?: string }> {
    const config = await getConfig();
    try {
      const { data: releases } = await axios.get(`${config.url}/api/v3/release`, {
        params: { seriesId },
        headers: { 'X-Api-Key': config.apiKey },
        timeout: 30000,
      });

      logger.info(COMPONENT, `Manual grab: ${releases.length} releases found for series ${seriesId}`);

      const normalizedSeriesTitle = (seriesTitle || '').toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const seriesWords = normalizedSeriesTitle.split(' ').filter((w: string) => w.length > 2);

      const candidates = releases.filter((r: any) => {
        const title = (r.title || '').toLowerCase();
        const sizeMB = (r.size || 0) / 1024 / 1024;
        const rejections = r.rejections || [];

        if (seriesWords.length > 0) {
          const matchCount = seriesWords.filter((w: string) => title.includes(w)).length;
          if (matchCount === 0) return false;
        }

        if (!title.includes('1080p') && !title.includes('1080') && !title.includes('720p') && !title.includes('720')) return false;
        if (rejections.length > 0) return false;
        if (sizeMB > maxSizeMB) return false;
        if (title.includes('collection') || title.includes('pack')) return false;
        if (title.includes('3d') || title.includes('hsbs') || title.includes('sbs')) return false;
        
        // Rejeitar arquivos muito pequenos (provavelmente propaganda/spam)
        if (sizeMB > 0 && sizeMB < MIN_SIZE_MB) return false;

        return true;
      });

      if (candidates.length === 0) {
        return { grabbed: false, error: 'Nenhum release adequado encontrado' };
      }

      // Ordenar por score (maior primeiro)
      candidates.sort((a: any, b: any) => scoreRelease(b, seriesTitle) - scoreRelease(a, seriesTitle));
      
      const best = candidates[0];
      const bestScore = scoreRelease(best, seriesTitle);
      
      logger.info(COMPONENT, `Best release selected: "${best.title}" (score: ${bestScore.toFixed(1)})`);

      await axios.post(`${config.url}/api/v3/release`, best, {
        headers: { 'X-Api-Key': config.apiKey, 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      const sizeMB = Math.round((best.size || 0) / 1024 / 1024);
      logger.info(COMPONENT, `Manual grab SUCCESS: "${best.title}" (${sizeMB}MB)`);

      return { grabbed: true, title: best.title, sizeMB };
    } catch (err: any) {
      logger.error(COMPONENT, `Manual grab failed for series ${seriesId}: ${err.message}`);
      return { grabbed: false, error: err.message };
    }
  },

  async addSeries(tvdbId: number, title: string, year: number, qualityProfileId = 4, rootFolderPath = '/media/series', totalSeasons = 1) {
    const config = await getConfig();
    const seasons = Array.from({ length: totalSeasons }, (_, i) => ({
      seasonNumber: i + 1,
      monitored: true,
    }));
    logger.info(COMPONENT, `Adding series to Sonarr`, { tvdbId, title, year, qualityProfileId, rootFolderPath, totalSeasons });
    try {
      const { data } = await axios.post(`${config.url}/api/v3/series`, {
        tvdbId,
        title,
        year,
        qualityProfileId,
        rootFolderPath,
        monitored: true,
        addOptions: { searchForMissingEpisodes: true },
        seriesType: 'standard',
        seasons,
      }, { headers: { 'X-Api-Key': config.apiKey } });
      logger.info(COMPONENT, `Series added to Sonarr successfully`, { sonarrId: data.id, title: data.title });
      return data;
    } catch (err: any) {
      logger.error(COMPONENT, `Failed to add series to Sonarr`, { error: err.message, response: err.response?.data });
      throw err;
    }
  },

  /**
   * Verifica se episódios já existem no disco via API do Sonarr
   */
  async checkEpisodesOnDisk(seriesId: number): Promise<{ season: number; episode: number; hasFile: boolean }[]> {
    const config = await getConfig();
    try {
      const { data: episodes } = await axios.get(`${config.url}/api/v3/episode`, {
        params: { seriesId },
        headers: { 'X-Api-Key': config.apiKey },
        timeout: 30000,
      });
      
      return episodes.map((ep: any) => ({
        season: ep.seasonNumber,
        episode: ep.episodeNumber,
        hasFile: ep.hasFile === true,
      }));
    } catch (err: any) {
      logger.error(COMPONENT, `Failed to check episodes on disk: ${err.message}`);
      return [];
    }
  },

  async getSonarrConfig() {
    return getConfig();
  },
};
