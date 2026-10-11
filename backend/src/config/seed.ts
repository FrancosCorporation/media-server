// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import bcrypt from 'bcrypt';
import { User } from '../models/User';
import { Settings } from '../models/Settings';
import { logger } from '../utils/logger';

const COMPONENT = 'Seed';

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' || typeof code === 'number') return String(code);
  }
  return 'SEED_ERROR';
}

export async function seedAdmin(): Promise<void> {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      const username = process.env.ADMIN_USERNAME?.trim() || '';
      const email = process.env.ADMIN_EMAIL?.trim() || '';
      const password = process.env.ADMIN_PASSWORD || '';
      if (!username || !email || Buffer.byteLength(password, 'utf8') < 16) {
        throw new Error('Configure ADMIN_USERNAME, ADMIN_EMAIL e uma ADMIN_PASSWORD com pelo menos 16 bytes antes do primeiro início');
      }

      const hashed = await bcrypt.hash(password, 12);
      await User.create({ username, email, password: hashed, role: 'admin' });
      logger.info(COMPONENT, 'Initial administrator created from configured credentials');
    }

    const settingsCount = await Settings.countDocuments();
    if (settingsCount === 0) {
      await Settings.create({
        radarrUrl: process.env.RADARR_URL || 'http://radarr:7878',
        radarrApiKey: process.env.RADARR_API_KEY || '',
        sonarrUrl: process.env.SONARR_URL || 'http://sonarr:8989',
        sonarrApiKey: process.env.SONARR_API_KEY || '',
        prowlarrUrl: process.env.PROWLARR_URL || 'http://prowlarr:9696',
        prowlarrApiKey: process.env.PROWLARR_API_KEY || '',
        jackettUrl: process.env.JACKETT_URL || 'http://jackett:9117',
        jackettApiKey: process.env.JACKETT_API_KEY || '',
        qbittorrentUrl: process.env.QBITTORRENT_URL || 'http://qbittorrent:8082',
        qbittorrentUsername: process.env.QBITTORRENT_USERNAME || '',
        qbittorrentPassword: process.env.QBITTORRENT_PASSWORD || '',
        jellyfinUrl: process.env.JELLYFIN_URL || 'http://jellyfin:8096',
        jellyfinApiKey: process.env.JELLYFIN_API_KEY || '',
        defaultQuality: process.env.DEFAULT_QUALITY || '1080p',
        preferHevc: process.env.PREFER_HEVC !== 'false',
        preferLanguage: process.env.PREFER_LANGUAGE || 'pt',
        fallbackLanguage: process.env.FALLBACK_LANGUAGE || 'en',
      });
      logger.info(COMPONENT, 'Default settings created from environment');
    }
  } catch (error) {
    logger.error(COMPONENT, 'Failed to initialize application records', { errorCode: errorCode(error) });
    throw new Error('Falha ao inicializar dados da aplicação; confira as configurações obrigatórias');
  }
}
