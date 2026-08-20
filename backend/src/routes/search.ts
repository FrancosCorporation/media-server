// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { RadarrService } from '../services/RadarrService';
import { SonarrService } from '../services/SonarrService';
import { TMDBService } from '../services/TMDBService';
import { OMDBService } from '../services/OMDBService';
import { SearchHistory } from '../models/SearchHistory';
import { logger } from '../utils/logger';
import { fixPosters, fixPosterUrl } from '../utils/poster';
import type { AuthRequest } from '../types';

const router = Router();
const COMPONENT = 'SearchRoute';

router.use(authenticateToken);

/**
 * Extrai ano da query se presente (ex: "The Middle 2022" -> {title: "The Middle", year: 2022})
 */
function extractYearFromQuery(query: string): { title: string; year?: number } {
  const yearMatch = query.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[0], 10);
    const title = query.replace(yearMatch[0], '').trim();
    if (title) return { title, year };
  }
  return { title: query };
}

/**
 * Verifica se um resultado TMDB tem dados úteis (poster + overview)
 */
function hasUsefulData(item: any): boolean {
  return !!(item.poster && item.overview && item.overview.length > 20);
}

/**
 * Tenta buscar no OMDB quando TMDB falha ou retorna dados incompletos
 * OMDB é usado APENAS para metadados (overview, genres, rating) - NÃO para posters
 * pois as URLs do OMDB (m.media-amazon.com) são time-limited e expiram
 * Se OMDB retorna IMDB ID, tenta achar no TMDB via findByImdbId para dados completos
 */
async function tryOMDBFallback(title: string, year?: number): Promise<any | null> {
  try {
    const omdb = await OMDBService.searchMovieByTitle(title, year);
    if (omdb) {
      // Verifica se o título retornado é razoavelmente similar ao buscado
      const searchTitleNorm = title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const resultTitleNorm = omdb.Title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const similarity = calculateSimilarity(searchTitleNorm, resultTitleNorm);
      
      if (similarity < 0.4 && !(year && omdb.Year === String(year))) {
        logger.warn(COMPONENT, `OMDB title mismatch rejected: searched "${title}" got "${omdb.Title}" (similarity: ${similarity.toFixed(2)})`);
        return null;
      }
      
      const mapped = OMDBService.mapOMDBToMovie(omdb);
      
      // Se tem IMDB ID, tenta achar no TMDB via findByImdbId (match exato)
      let tmdbMatch = null;
      if (mapped.imdbId && mapped.imdbId !== 'N/A') {
        try {
          tmdbMatch = await TMDBService.findByImdbId(mapped.imdbId);
        } catch (e: any) {
          logger.warn(COMPONENT, `TMDB findByImdbId failed for "${title}": ${e.message}`);
        }
      }
      
      // Se achou no TMDB via IMDB ID, retorna dados combinados (TMDB poster + OMDB overview fallback)
      if (tmdbMatch && tmdbMatch.tmdbId) {
        const posterUrl = tmdbMatch.posterPath ? TMDBService.getPosterUrl(tmdbMatch.posterPath) : '';
        // Usa overview do OMDB se TMDB não tiver
        const overview = tmdbMatch.overview || mapped.overview || '';
        return {
          tmdbId: tmdbMatch.tmdbId,
          imdbId: mapped.imdbId,
          title: tmdbMatch.title,
          originalTitle: tmdbMatch.title,
          year: tmdbMatch.year,
          overview,
          poster: posterUrl || '',
          backdrop: '',
          genres: [],
          rating: 0,
          source: 'tmdb-imdb',
        };
      }
      
      // Senão, retorna dados do OMDB (poster via proxy /omdb-image — URLs time-limited são
      // proxificadas e cacheadas pelo backend)
      return {
        tmdbId: undefined,
        imdbId: mapped.imdbId,
        title: mapped.title,
        originalTitle: mapped.originalTitle,
        year: mapped.year,
        overview: mapped.overview,
        poster: mapped.poster || '',
        backdrop: '',
        genres: mapped.genres,
        rating: mapped.rating,
        source: 'omdb',
      };
    }
  } catch (err: any) {
    logger.warn(COMPONENT, `OMDB fallback failed for "${title}": ${err.message}`);
  }
  return null;
}

/**
 * Calcula similaridade simples entre duas strings (Jaccard-like)
 */
function calculateSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.split('').filter(c => c.trim()));
  const setB = new Set(b.split('').filter(c => c.trim()));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Encontra o melhor match TMDB por título e ano
 */
function findBestMatch(results: any[], title: string, year?: number): any | null {
  if (!results.length) return null;
  
  const normalizedTitle = title.toLowerCase().trim();
  
  // Se tem ano, procura match exato de título + ano
  if (year) {
    const exactYearMatch = results.find(r => 
      r.title.toLowerCase().trim() === normalizedTitle && r.year === year
    );
    if (exactYearMatch) return exactYearMatch;
    
    // Procura por título similar + ano próximo (±1 ano)
    const closeYearMatch = results.find(r => 
      r.title.toLowerCase().includes(normalizedTitle) && 
      r.year && Math.abs(r.year - year) <= 1
    );
    if (closeYearMatch) return closeYearMatch;
  }
  
  // Fallback: primeiro resultado com poster
  const withPoster = results.find(r => r.posterPath);
  if (withPoster) return withPoster;
  
  return results[0];
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim().slice(0, 200);
    if (!q) return res.status(400).json({ error: 'Parâmetro "q" obrigatório' });
    if (/[<>"';&]/.test(q)) return res.status(400).json({ error: 'Caracteres inválidos na busca' });

    // Extrai ano da query para melhorar busca
    const { title: searchTitle, year: searchYear } = extractYearFromQuery(q);
    
    // Busca em paralelo: filmes (Radarr) + séries (Sonarr) + TMDB
    // TMDB busca SEM ano primeiro (mais amplo), depois filtraremos
    const [moviesResult, seriesResult, tmdbSeriesResult, tmdbMoviesResult] = await Promise.allSettled([
      RadarrService.searchMovie(q),
      SonarrService.searchSeries(q),
      TMDBService.searchSeries(q),
      TMDBService.searchMovies(searchTitle), // SEM ano para busca ampla
    ]);

    // --- Filmes ---
    const radarrMovies = moviesResult.status === 'fulfilled' ? moviesResult.value : [];
    const tmdbMoviesAll = tmdbMoviesResult.status === 'fulfilled' ? tmdbMoviesResult.value || [] : [];
    
    // Filtra TMDB por ano se fornecido
    let tmdbMovies = tmdbMoviesAll;
    if (searchYear) {
      tmdbMovies = tmdbMoviesAll.filter(m => m.year && Math.abs(m.year - searchYear) <= 1);
      // Se não achou com ano, volta para todos (pode ser que o ano no TMDB seja diferente)
      if (tmdbMovies.length === 0) {
        tmdbMovies = tmdbMoviesAll;
      }
    }

    // Merge: TMDB como base (títulos pt-BR), Radarr para tmdbId se não tiver
    const moviesByTmdbId = new Map<number, any>();
    for (const m of tmdbMovies) {
      const posterUrl = TMDBService.getPosterUrl(m.posterPath);
      moviesByTmdbId.set(m.tmdbId, {
        id: m.tmdbId,
        tmdbId: m.tmdbId,
        title: m.title,
        originalTitle: m.originalTitle,
        year: m.year,
        overview: m.overview,
        poster: posterUrl || '',
        backdrop: TMDBService.getBackdropUrl(m.backdropPath) || '',
        genres: m.genres || [],
        rating: m.rating || 0,
        source: 'tmdb',
      });
    }
    // Adiciona filmes do Radarr que não estão no TMDB
    for (const r of radarrMovies) {
      if (!moviesByTmdbId.has(r.id)) {
        moviesByTmdbId.set(r.id, { ...r, tmdbId: r.id, originalTitle: r.title, source: 'radarr' });
      }
    }
    let movies = Array.from(moviesByTmdbId.values());

    // --- OMDB Fallback para filmes sem poster ou sem overview ---
    // Tenta OMDB para filmes que não têm poster ou overview útil.
    // REGRA: OMDB também é consultado DIRETO quando TMDB/Radarr não retornam NADA
    // (títulos que só existem no OMDB, ex: "New York Dolls Live at the Matrix Club (1973)").
    const moviesNeedingOMDB = movies.filter(m => !m.poster || !hasUsefulData(m));
    const omdbMovies: any[] = [];
    if (moviesNeedingOMDB.length > 0 || movies.length === 0) {
      const targets = moviesNeedingOMDB.length > 0
        ? moviesNeedingOMDB.map(m => tryOMDBFallback(m.title, m.year || searchYear))
        : [tryOMDBFallback(searchTitle, searchYear)];
      const omdbResults = await Promise.allSettled(targets);
      for (const result of omdbResults) {
        if (result.status === 'fulfilled' && result.value) {
          omdbMovies.push(result.value);
        }
      }
    }
    // Combina filmes TMDB/Radarr com OMDB.
    // REGRA: fallback (OMDB/Radarr) NUNCA sobrescreve card já encontrado via TMDB —
    // só pode ACRESCENTAR cards genuinamente novos (tmdbId/imdbId distintos).
    // Se o OMDB resolver para um tmdbId que já existe, descarta a cópia (mantém o card TMDB original).
    const knownTmdbIds = new Set(movies.map((m) => m.tmdbId).filter(Boolean));
    for (const om of omdbMovies) {
      if (om.tmdbId && knownTmdbIds.has(om.tmdbId)) {
        logger.info(COMPONENT, `OMDB duplicate for existing TMDB card skipped: "${om.title}" (tmdbId=${om.tmdbId})`);
        continue;
      }
      const sameImdb = movies.some(
        (m) => m.imdbId && om.imdbId && String(m.imdbId) === String(om.imdbId)
      );
      if (sameImdb) {
        logger.info(COMPONENT, `OMDB duplicate by imdbId skipped: "${om.title}"`);
        continue;
      }
      movies.push(om);
    }

    // --- Séries ---
    const sonarrSeries = seriesResult.status === 'fulfilled' ? seriesResult.value : [];
    const tmdbSeries = tmdbSeriesResult.status === 'fulfilled' ? tmdbSeriesResult.value || [] : [];

    const sonarrByTmdbId = new Map<number, any>();
    for (const s of sonarrSeries) {
      if (s.tmdbId) sonarrByTmdbId.set(s.tmdbId, s);
    }

    const seriesByTmdbId = new Map<number, any>();
    for (const t of tmdbSeries) {
      const posterUrl = TMDBService.getPosterUrl(t.posterPath);
      const sMatch = sonarrByTmdbId.get(t.tmdbId);
      seriesByTmdbId.set(t.tmdbId, {
        id: sMatch?.tvdbId || t.tmdbId,
        tvdbId: sMatch?.tvdbId || null,
        tmdbId: t.tmdbId,
        title: t.name,
        originalTitle: t.originalName,
        year: t.year,
        overview: t.overview,
        poster: posterUrl || '',
        backdrop: TMDBService.getBackdropUrl(t.backdropPath) || '',
        genres: t.genres || [],
        rating: t.rating || 0,
        seasons: t.totalSeasons,
        totalSeasons: t.totalSeasons,
        totalEpisodes: t.totalEpisodes,
        source: 'tmdb',
      });
    }
    for (const s of sonarrSeries) {
      if (!seriesByTmdbId.has(s.tmdbId)) {
        seriesByTmdbId.set(s.tmdbId, { ...s, tvdbId: s.tvdbId, tmdbId: s.tmdbId, originalTitle: s.title, source: 'sonarr' });
      }
    }
    let series = Array.from(seriesByTmdbId.values());

    // Salva no histórico
    SearchHistory.create({
      userId: req.user?._id || 'anonymous',
      query: q,
      mediaType: 'all',
    }).catch(() => {});

    logger.info(COMPONENT, `Unified search: "${q}" → ${movies.length} movies, ${series.length} series`);

    const moviesWithProxy = movies.map(m => ({
      ...m,
      poster: m.poster ? fixPosterUrl(m.poster, 'movie') : ''
    }));
    const seriesWithProxy = series.map(s => ({
      ...s,
      poster: s.poster ? fixPosterUrl(s.poster, 'series') : ''
    }));

    res.json({ movies: moviesWithProxy, series: seriesWithProxy });
  } catch (err) {
    logger.error(COMPONENT, 'Search error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro na busca unificada' });
  }
});

export default router;
