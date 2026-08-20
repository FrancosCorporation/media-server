// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { Movie } from '../models/Movie';
import { Series } from '../models/Series';
import { SearchHistory } from '../models/SearchHistory';
import { Download } from '../models/Download';
import { RadarrService } from '../services/RadarrService';
import { TMDBService } from '../services/TMDBService';
import { MetadataService } from '../services/MetadataService';
import { logger } from '../utils/logger';
import { fixPosterUrl } from '../utils/poster';
import type { AuthRequest } from '../types';

const router = Router();
const COMPONENT = 'RecommendationsRoute';
router.use(authenticateToken);

// ─── Cache de recomendações ────────────────────────────────────────────────
// O cálculo antigo consultava Radarr/Sonarr/TMDB em tempo real (até 8+ chamadas
// externas por request), deixando a home lenta. Agora a resposta é cacheada por
// 30 minutos (usuário) e as buscas no Radarr também são cacheadas.
const CACHE_TTL = 30 * 60 * 1000; // 30 min
const recommendationsCache = new Map<string, { data: any; timestamp: number }>();
// Single-flight: evita que N usuários com cache frio disparem N× chamadas externas
const inflight = new Map<string, Promise<any>>();

// Cache de buscas no Radarr (gênero/histórico) — o mesmo gênero não é
// pesquisado no Radarr de novo dentro de 30 minutos.
const radarrSearchCache = new Map<string, { results: any[]; timestamp: number }>();
const RADARR_SEARCH_TTL = 30 * 60 * 1000;

/** Invalida o cache (ex: quando um download conclui / mídia é adicionada/removida). */
export function invalidateRecommendationsCache(): void {
  recommendationsCache.clear();
}

async function searchRadarrCached(query: string): Promise<any[]> {
  const cacheKey = query.toLowerCase().trim();
  const cached = radarrSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < RADARR_SEARCH_TTL) {
    return cached.results;
  }
  const results = await RadarrService.searchMovie(cacheKey);
  radarrSearchCache.set(cacheKey, { results, timestamp: Date.now() });
  return results;
}

const GENRE_PT_TO_EN: Record<string, string> = {
  'ação': 'action', 'aventura': 'adventure', 'animação': 'animation',
  'comédia': 'comedy', 'crime': 'crime', 'documentário': 'documentary',
  'drama': 'drama', 'família': 'family', 'fantasia': 'fantasy',
  'história': 'history', 'terror': 'horror', 'música': 'music',
  'mistério': 'mystery', 'romance': 'romance', 'ficção científica': 'science fiction',
  'suspense': 'thriller', 'guerra': 'war', 'faroeste': 'western',
  'action': 'action', 'adventure': 'adventure', 'animation': 'animation',
  'comedy': 'comedy', 'documentary': 'documentary', 'fantasy': 'fantasy',
  'horror': 'horror', 'mystery': 'mystery', 'thriller': 'thriller',
  'science fiction': 'science fiction', 'war': 'war', 'western': 'western',
};

function normalizeGenre(genre: string): string {
  const lower = genre.toLowerCase();
  return GENRE_PT_TO_EN[lower] || lower;
}

async function computeRecommendations(userId: string): Promise<any> {
  // Fetch only recent items (last 50) for recent section, and top-rated for highlights
  // This avoids fetching the entire library
  const [recentMovies, recentSeries, searchHistory] = await Promise.all([
    Movie.find({ status: { $nin: ['error', 'failed'] } }).sort({ addedAt: -1 }).limit(50).lean(),
    Series.find({ status: { $nin: ['error', 'failed'] } }).sort({ addedAt: -1 }).limit(50).lean(),
    SearchHistory.find({ userId }).sort({ searchedAt: -1 }).limit(5).lean(),
  ]);

  // For top-rated, fetch only items with rating > 0, limited
  const [topRatedMovies, topRatedSeries] = await Promise.all([
    Movie.find({ rating: { $gt: 0 }, status: { $nin: ['error', 'failed'] } }).sort({ rating: -1 }).limit(20).lean(),
    Series.find({ rating: { $gt: 0 }, status: { $nin: ['error', 'failed'] } }).sort({ rating: -1 }).limit(20).lean(),
  ]);

  const allRecent = [...recentMovies, ...recentSeries];
  const allTopRated = [...topRatedMovies, ...topRatedSeries];

  const movieTmdbIds = new Set(allRecent.map((m) => m.tmdbId).filter(Boolean));
  const seriesTmdbIds = new Set(allRecent.map((s) => s.tmdbId).filter(Boolean));

  // Only enrich items that are missing poster or overview
  const needsEnrichment = (item: any) => !item.poster || !item.overview;
  const recentToEnrich = allRecent.filter(needsEnrichment).slice(0, 20) as any[];
  const topRatedToEnrich = allTopRated.filter(needsEnrichment).slice(0, 20) as any[];

  const [enrichedRecent, enrichedTopRated] = await Promise.all([
    MetadataService.enrichMovies(recentToEnrich.filter((m: any) => !m.seasons)),
    MetadataService.enrichSeriesItems(recentToEnrich.filter((m: any) => m.seasons)),
  ]);

  // Merge enriched data back
  const enrichMap = new Map<string, any>();
  for (const m of enrichedRecent) enrichMap.set(m._id.toString(), m);
  for (const m of enrichedTopRated) enrichMap.set(m._id.toString(), m);

  const getEnriched = (item: any) => enrichMap.get(item._id.toString()) || item;

  const recent = allRecent
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
    .slice(0, 8)
    .map((m) => {
      const enriched = getEnriched(m);
      return {
        _id: m._id.toString(),
        tmdbId: (m as any).tmdbId,
        tvdbId: (m as any).tvdbId,
        title: m.title,
        year: m.year,
        poster: fixPosterUrl(enriched.poster, movieTmdbIds.has((m as any).tmdbId) ? 'movie' : 'series'),
        overview: enriched.overview,
        rating: enriched.rating,
        genres: enriched.genres,
        seasons: (m as any).seasons,
        status: m.status,
        addedAt: m.addedAt,
      };
    });

  const topRated = allTopRated
    .filter((m) => m.rating > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 8)
    .map((m) => {
      const enriched = getEnriched(m);
      return {
        _id: m._id.toString(),
        title: m.title,
        year: m.year,
        poster: fixPosterUrl(enriched.poster, movieTmdbIds.has((m as any).tmdbId) ? 'movie' : 'series'),
        overview: enriched.overview,
        rating: enriched.rating,
        genres: enriched.genres,
        seasons: (m as any).seasons,
        status: m.status,
      };
    });

  const genreSet = new Set<string>();
  allRecent.forEach((m) => m.genres?.forEach((g) => genreSet.add(g)));

  async function enrichWithTMDB(r: any): Promise<any | null> {
    try {
      const tmdbMovies = await TMDBService.searchMovies(r.title);
      const tmdbMatch = tmdbMovies.find((t: any) => t.tmdbId === r.id);
      if (!tmdbMatch) return null;
      const tmdbPoster = TMDBService.getPosterUrl(tmdbMatch.posterPath);
      const tmdbBackdrop = TMDBService.getBackdropUrl(tmdbMatch.backdropPath);
      if (!tmdbPoster) return null;
      return {
        ...r,
        title: tmdbMatch.title || r.title,
        overview: tmdbMatch.overview || r.overview,
        genres: tmdbMatch.genres?.length ? tmdbMatch.genres : r.genres,
        rating: tmdbMatch.rating || r.rating,
        poster: tmdbPoster,
        backdrop: tmdbBackdrop || r.backdrop,
      };
    } catch {
      return null;
    }
  }

  const genreBased: any[] = [];
  if (genreSet.size > 0) {
    const topGenres = [...genreSet].slice(0, 2); // Reduced from 3 to 2
    const genreResults = await Promise.allSettled(
      topGenres.map(async (genre) => {
        try {
          const searchQuery = normalizeGenre(genre);
          const results = await searchRadarrCached(searchQuery);
          return results
            .filter((r: any) => !movieTmdbIds.has(r.id) && !seriesTmdbIds.has(r.id))
            .slice(0, 6); // Limit per genre
        } catch {
          return [];
        }
      })
    );
    const allGenreResults = genreResults
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .slice(0, 8); // Reduced from 12 to 8
    const enriched = await Promise.allSettled(allGenreResults.map(enrichWithTMDB));
    for (const item of enriched) {
      if (item.status === 'fulfilled' && item.value) genreBased.push(item.value);
      if (genreBased.length >= 8) break;
    }
  }

  if (genreBased.length < 8 && searchHistory.length > 0) {
    const historyResults = await Promise.allSettled(
      searchHistory.slice(0, 3).map(async (sh) => { // Limit to 3 history items
        try {
          const results = await searchRadarrCached(sh.query);
          return results
            .filter((r: any) => !movieTmdbIds.has(r.id) && !seriesTmdbIds.has(r.id))
            .slice(0, 5); // Limit per query
        } catch {
          return [];
        }
      })
    );
    const allHistoryResults = historyResults
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .slice(0, 8); // Reduced from 15 to 8
    const enriched = await Promise.allSettled(allHistoryResults.map(enrichWithTMDB));
    for (const item of enriched) {
      if (item.status === 'fulfilled' && item.value) genreBased.push(item.value);
      if (genreBased.length >= 8) break;
    }
  }

  // Fetch stats in parallel with the rest
  const [movieCount, seriesCount, downloadCount] = await Promise.all([
    Movie.countDocuments(),
    Series.countDocuments(),
    Download.countDocuments({ status: 'downloading' }),
  ]);

  return {
    recent,
    highlights: topRated.slice(0, 4),
    recommended: genreBased.slice(0, 12),
    stats: {
      movies: movieCount,
      series: seriesCount,
      downloads: downloadCount,
    },
  };
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = (req.user?._id || 'anonymous').toString();

    const cached = recommendationsCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      res.set('Cache-Control', 'private, max-age=1800');
      return res.json(cached.data);
    }

    // Single-flight: se já existe um cálculo em andamento para este usuário,
    // aguarda o mesmo (evita bombardeio no Radarr/TMDB com cache frio).
    let promise = inflight.get(userId);
    if (!promise) {
      promise = computeRecommendations(userId)
        .then((data) => {
          recommendationsCache.set(userId, { data, timestamp: Date.now() });
          inflight.delete(userId);
          return data;
        })
        .catch((err) => {
          inflight.delete(userId);
          throw err;
        });
      inflight.set(userId, promise);
    }

    const data = await promise;
    res.set('Cache-Control', 'private, max-age=1800');
    res.json(data);
  } catch (err) {
    logger.error(COMPONENT, 'Error fetching recommendations', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Erro ao carregar recomendações' });
  }
});

export default router;
