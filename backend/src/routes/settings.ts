// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { Settings } from '../models/Settings';
import type { AuthRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    const safe = settings.toObject();

    // Fallback para env vars quando o banco está vazio
    if (!safe.radarrUrl) safe.radarrUrl = process.env.RADARR_URL || 'http://radarr:7878';
    if (!safe.radarrApiKey) safe.radarrApiKey = process.env.RADARR_API_KEY || '';
    if (!safe.sonarrUrl) safe.sonarrUrl = process.env.SONARR_URL || 'http://sonarr:8989';
    if (!safe.sonarrApiKey) safe.sonarrApiKey = process.env.SONARR_API_KEY || '';
    if (!safe.prowlarrUrl) safe.prowlarrUrl = process.env.PROWLARR_URL || 'http://prowlarr:9696';
    if (!safe.prowlarrApiKey) safe.prowlarrApiKey = process.env.PROWLARR_API_KEY || '';
    if (!safe.qbittorrentUrl) safe.qbittorrentUrl = process.env.QBITTORRENT_URL || 'http://qbittorrent:8082';
    if (!safe.qbittorrentUsername) safe.qbittorrentUsername = process.env.QBITTORRENT_USERNAME || 'dolfim';
    if (!safe.qbittorrentPassword) safe.qbittorrentPassword = process.env.QBITTORRENT_PASSWORD || '123Rd!';
    if (!safe.jellyfinUrl) safe.jellyfinUrl = process.env.JELLYFIN_URL || 'http://jellyfin:8096';
    if (!safe.jellyfinApiKey) safe.jellyfinApiKey = process.env.JELLYFIN_API_KEY || '';
    if (!safe.uiLanguage) safe.uiLanguage = 'pt-BR';

    // Oculta segredos se vieram do banco (já configurados manualmente)
    // Se veio do env var, mantém visível para o admin ver o padrão
    const dbSettings = settings.toObject();
    if (dbSettings.radarrApiKey) safe.radarrApiKey = '••••••';
    if (dbSettings.sonarrApiKey) safe.sonarrApiKey = '••••••';
    if (dbSettings.prowlarrApiKey) safe.prowlarrApiKey = '••••••';
    if (dbSettings.qbittorrentPassword) safe.qbittorrentPassword = '••••••';
    if (dbSettings.jellyfinApiKey) safe.jellyfinApiKey = '••••••';

    res.json({ settings: safe });
  } catch {
    res.status(500).json({ error: 'Erro ao carregar configurações' });
  }
});

router.put('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const body = { ...req.body };
    // Ignora campos mascarados — usuário não alterou a senha/chave
    for (const key of ['radarrApiKey', 'sonarrApiKey', 'prowlarrApiKey', 'qbittorrentPassword', 'jellyfinApiKey']) {
      if (body[key] === '••••••') delete body[key];
    }
    const settings = await Settings.findOneAndUpdate(
      {},
      { $set: body },
      { new: true, upsert: true }
    );
    res.json({ settings });
  } catch {
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

export default router;
