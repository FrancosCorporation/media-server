// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import bcrypt from 'bcrypt';
import { User } from '../models/User';
import { Settings } from '../models/Settings';
import { logger } from '../utils/logger';

const COMPONENT = 'Seed';

export async function seedAdmin(): Promise<void> {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      const username = process.env.ADMIN_USERNAME || 'admin';
      const password = process.env.ADMIN_PASSWORD || 'admin123';
      const hashed = await bcrypt.hash(password, 12);
      await User.create({
        username,
        email: process.env.ADMIN_EMAIL || 'admin@dolfimflix.local',
        password: hashed,
        role: 'admin',
      });
      logger.info(COMPONENT, `Default admin user created (${username} / ${password})`);
      logger.warn(COMPONENT, 'CHANGE THE DEFAULT ADMIN PASSWORD IMMEDIATELY');
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
        qbittorrentUrl: process.env.QBITTORRENT_URL || 'http://qbittorrent:8082',
        qbittorrentUsername: process.env.QBITTORRENT_USERNAME || 'dolfim',
        qbittorrentPassword: process.env.QBITTORRENT_PASSWORD || '123Rd!',
        jellyfinUrl: process.env.JELLYFIN_URL || 'http://jellyfin:8096',
        jellyfinApiKey: process.env.JELLYFIN_API_KEY || '',
        defaultQuality: process.env.DEFAULT_QUALITY || '1080p',
        preferHevc: process.env.PREFER_HEVC !== 'false',
        preferLanguage: process.env.PREFER_LANGUAGE || 'pt',
        fallbackLanguage: process.env.FALLBACK_LANGUAGE || 'en',
      });
      logger.info(COMPONENT, 'Default settings created from environment');
    }
  } catch (err) {
    logger.error(COMPONENT, 'Seed error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
