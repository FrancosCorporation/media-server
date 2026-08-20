// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Request, Response } from 'express';
import axios from 'axios';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { QBittorrentService } from '../services/QBittorrentService';
import { Settings } from '../models/Settings';
import { logger } from '../utils/logger';
import type { AuthRequest } from '../types';

const COMPONENT = 'QBittorrentRoute';
const router = Router();
router.use(authenticateToken);

/**
 * GET /api/qbittorrent/status
 * Retorna status da conexão com qBittorrent (versão, conectado, último erro)
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const health = await QBittorrentService.checkHealth();
    const settings = await Settings.findOne();
    const configuredUrl = settings?.qbittorrentUrl
      || process.env.QBITTORRENT_URL
      || 'http://qbittorrent:8080';

    res.json({
      ...health,
      configuredUrl,
      checkTimestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(COMPONENT, 'Status check error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ connected: false, message: 'Erro interno ao verificar status' });
  }
});

/**
 * POST /api/qbittorrent/test
 * Testa a conexão com qBittorrent forçando um novo login com as credenciais atuais.
 * Útil para debug na página de configurações.
 */
router.post('/test', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await Settings.findOne();
    const url = settings?.qbittorrentUrl || process.env.QBITTORRENT_URL || 'http://qbittorrent:8082';
    const username = settings?.qbittorrentUsername || process.env.QBITTORRENT_USERNAME || 'dolfim';
    const password = settings?.qbittorrentPassword || process.env.QBITTORRENT_PASSWORD || '123Rd!';

    logger.info(COMPONENT, 'Testando conexão com qBittorrent', {
      url,
      username,
      passwordSet: !!password,
    });

    // Testa 1: reachabilidade do host
    try {
      const pingRes = await axios.get(`${url}/api/v2/app/version`, {
        timeout: 5000,
        validateStatus: () => true,
      });
      if (pingRes.status !== 200 && pingRes.status !== 403) {
        // 403 = reachable mas sem auth (esperado)
        return res.json({
          success: false,
          step: 'reachability',
          message: `qBittorrent respondeu com HTTP ${pingRes.status} em ${url}`,
          url,
        });
      }
    } catch (err: any) {
      const code = err.code || (err.message || '').includes('timeout') ? 'TIMEOUT' : 'UNKNOWN';
      return res.json({
        success: false,
        step: 'reachability',
        message: `Não foi possível conectar em ${url}: ${code}`,
        url,
      });
    }

    // Testa 2: login
    const ok = await QBittorrentService.login();
    if (!ok) {
      return res.json({
        success: false,
        step: 'login',
        message: 'Falha na autenticação. Verifique usuário e senha no qBittorrent.',
        url,
        username,
      });
    }

    // Testa 3: buscar torrents
    const torrents = await QBittorrentService.getTorrents();

    res.json({
      success: true,
      step: 'complete',
      message: `Conectado! ${torrents.length} torrent(s) encontrados.`,
      url,
      torrentCount: torrents.length,
    });
  } catch (err) {
    logger.error(COMPONENT, 'Test error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({
      success: false,
      step: 'error',
      message: 'Erro interno ao testar conexão',
    });
  }
});

export default router;
