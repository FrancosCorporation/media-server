// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Response } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger';

const COMPONENT = 'CoversRoute';
const router = Router();

const SONARR_URL = process.env.SONARR_URL || 'http://sonarr:8989';
const SONARR_API_KEY = process.env.SONARR_API_KEY || '';
const RADARR_URL = process.env.RADARR_URL || 'http://radarr:7878';
const RADARR_API_KEY = process.env.RADARR_API_KEY || '';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// Proxy for TMDB images (avoid CORS)
router.get('/tmdb-image/*', async (req: any, res: Response) => {
  try {
    const imagePath = req.params[0] || '';
    const targetUrl = `${TMDB_IMAGE_BASE}/${imagePath}`;

    logger.info('CoversRoute', `Proxying TMDB image: ${targetUrl}`);

    const response = await axios.get(targetUrl, {
      responseType: 'stream',
      timeout: 10000,
      validateStatus: () => true,
    });

    const contentLength = parseInt(String(response.headers['content-length'] || '0'), 10);
    if (contentLength === 0) {
      logger.warn('CoversRoute', 'TMDB image 0-byte, not caching');
      return res.status(404).json({ error: 'Empty image' });
    }

    res.set({
      'Content-Type': response.headers['content-type'] || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    });
    res.status(response.status);
    response.data.pipe(res);
  } catch (err: any) {
    logger.warn('CoversRoute', `TMDB image proxy error: ${err.message}`);
    res.status(404).json({ error: 'Image not found' });
  }
});

// Proxy for Sonarr covers
router.get('/sonarr-cover/*', async (req: any, res: Response) => {
  try {
    const coverPath = req.params[0] || '';
    const targetUrl = `${SONARR_URL}/${coverPath}`;
    
    logger.info('CoversRoute', `Proxying Sonarr cover: ${targetUrl}`);

    const response = await axios.get(targetUrl, {
      headers: {
        'X-Api-Key': SONARR_API_KEY,
      },
      responseType: 'stream',
      timeout: 10000,
      validateStatus: () => true,
    });

    res.set({
      'Content-Type': response.headers['content-type'] || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    });
    res.status(response.status);
    response.data.pipe(res);
  } catch (err: any) {
    logger.warn('CoversRoute', `Sonarr cover proxy error: ${err.message}`);
    res.status(404).json({ error: 'Cover not found' });
  }
});

// Proxy for Radarr covers
router.get('/radarr-cover/*', async (req: any, res: Response) => {
  try {
    const coverPath = (req.params[0] || '').replace(/MediaCoverProxy/g, 'MediaCover');
    const targetUrl = `${RADARR_URL}/${coverPath}`;
    
    logger.info('CoversRoute', `Proxying Radarr cover: ${targetUrl}`);

    const response = await axios.get(targetUrl, {
      headers: {
        'X-Api-Key': RADARR_API_KEY,
      },
      responseType: 'stream',
      timeout: 10000,
      validateStatus: () => true,
    });

    res.set({
      'Content-Type': response.headers['content-type'] || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    });
    res.status(response.status);
    response.data.pipe(res);
  } catch (err: any) {
    logger.warn('CoversRoute', `Radarr cover proxy error: ${err.message}`);
    res.status(404).json({ error: 'Cover not found' });
  }
});

export default router;
