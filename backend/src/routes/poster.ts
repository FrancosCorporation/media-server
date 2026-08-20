// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Request, Response } from 'express';
import { MetadataService } from '../services/MetadataService';
import { fixPosterUrl } from '../utils/poster';
import { logger } from '../utils/logger';

const COMPONENT = 'PosterRoute';
const router = Router();

/**
 * GET /api/poster/:mediaType/:id
 * 
 * Fallback automático de capa: quando a capa primária (ex: poster.jpg do
 * Radarr/Sonarr) retorna 404, o frontend chama este endpoint que resolve a
 * melhor capa disponível:
 *   - capa atual do banco (se válida)
 *   - TMDB direto pelo tmdbId (https://image.tmdb.org/t/p/w500/{poster_path})
 *   - busca por título no TMDB
 * 
 * :id pode ser o Mongo _id da mídia OU o tmdbId numérico.
 * Responde com redirect 302 para a URL resolvida (passando pelo proxy
 * /api/tmdb-image quando for CDN do TMDB, evitando CORS).
 * 
 * ⚠️ Rota PÚBLICA de propósito: é usada em <img src> pelos componentes
 * (PosterImage/MediaCard/MediaPreviewModal), e <img> não envia o header
 * Authorization. Capas são imagens públicas do TMDB — sem dado sensível.
 */
router.get('/:mediaType/:id', async (req: Request, res: Response) => {
  try {
    const { mediaType, id } = req.params;
    if (mediaType !== 'movie' && mediaType !== 'series') {
      return res.status(400).json({ error: 'mediaType deve ser "movie" ou "series"' });
    }

    const poster = await MetadataService.resolvePosterUrl(mediaType, id);
    if (!poster) {
      // Return a placeholder SVG instead of 404 to avoid console errors
      const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect fill="#1a1a2e" width="300" height="450"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#666" font-family="system-ui" font-size="14">${mediaType === 'movie' ? '🎬 Filme' : '📺 Série'}</text></svg>`;
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(placeholderSvg);
    }

    const proxied = fixPosterUrl(poster, mediaType as 'movie' | 'series');
    if (!proxied) {
      const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect fill="#1a1a2e" width="300" height="450"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#666" font-family="system-ui" font-size="14">${mediaType === 'movie' ? '🎬 Filme' : '📺 Série'}</text></svg>`;
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(placeholderSvg);
    }

    res.set('Cache-Control', 'public, max-age=86400');
    res.redirect(302, proxied);
  } catch (err: any) {
    logger.warn(COMPONENT, 'Poster resolve failed', { error: err.message });
    const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect fill="#1a1a2e" width="300" height="450"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#666" font-family="system-ui" font-size="14">Erro</text></svg>`;
    res.set('Content-Type', 'image/svg+xml');
    return res.send(placeholderSvg);
  }
});

/**
 * GET /api/poster/search/:mediaType/:title
 * 
 * Busca capa no TMDB por título (fallback final quando não há ID).
 * Usado pelo PosterImage como último recurso na cadeia de fallback.
 */
router.get('/search/:mediaType/:title', async (req: Request, res: Response) => {
  try {
    const { mediaType, title } = req.params;
    if (mediaType !== 'movie' && mediaType !== 'series') {
      return res.status(400).json({ error: 'mediaType deve ser "movie" ou "series"' });
    }

    const decodedTitle = decodeURIComponent(title);
    const { TMDBService } = await import('../services/TMDBService');
    
    const results = mediaType === 'movie' 
      ? await TMDBService.searchMovies(decodedTitle)
      : await TMDBService.searchSeries(decodedTitle);
    
    const first = results[0];
    if (!first?.posterPath) {
      const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect fill="#1a1a2e" width="300" height="450"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#666" font-family="system-ui" font-size="14">${mediaType === 'movie' ? '🎬 Filme' : '📺 Série'}</text></svg>`;
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(placeholderSvg);
    }

    const posterUrl = `https://image.tmdb.org/t/p/w500${first.posterPath}`;
    const proxied = fixPosterUrl(posterUrl, mediaType as 'movie' | 'series');
    
    if (!proxied) {
      const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect fill="#1a1a2e" width="300" height="450"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#666" font-family="system-ui" font-size="14">${mediaType === 'movie' ? '🎬 Filme' : '📺 Série'}</text></svg>`;
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(placeholderSvg);
    }

    res.set('Cache-Control', 'public, max-age=86400');
    res.redirect(302, proxied);
  } catch (err: any) {
    logger.warn(COMPONENT, 'Poster search failed', { error: err.message });
    const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect fill="#1a1a2e" width="300" height="450"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#666" font-family="system-ui" font-size="14">Erro</text></svg>`;
    res.set('Content-Type', 'image/svg+xml');
    return res.send(placeholderSvg);
  }
});

export default router;
