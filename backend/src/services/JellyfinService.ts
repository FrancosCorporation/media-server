// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import axios from 'axios';
import { Settings } from '../models/Settings';
import { logger } from '../utils/logger';

const COMPONENT = 'JellyfinService';

async function getConfig() {
  const s = await Settings.findOne();
  const isPlaceholder = (key: string) => /^changeme$/i.test(key.trim());
  // DB tem prioridade; se for placeholder, tenta o env; só usa se não for placeholder
  let apiKey = '';
  if (s?.jellyfinApiKey && !isPlaceholder(s.jellyfinApiKey)) {
    apiKey = s.jellyfinApiKey;
  } else if (process.env.JELLYFIN_API_KEY && !isPlaceholder(process.env.JELLYFIN_API_KEY)) {
    apiKey = process.env.JELLYFIN_API_KEY;
  }
  return {
    url: s?.jellyfinUrl || process.env.JELLYFIN_URL || 'http://jellyfin:8096',
    apiKey,
  };
}

/**
 * Solicita ao Jellyfin que rescanneie uma biblioteca específica.
 * Útil após deletar arquivos para o Jellyfin atualizar sua interface.
 *
 * IMPORTANTE: Requer uma API Key configurada no Jellyfin.
 * Se não houver API Key, apenas loga um aviso (não falha a operação principal).
 */
async function refreshLibrary(libraryName?: string): Promise<boolean> {
  const config = await getConfig();

  if (!config.apiKey) {
    logger.warn(COMPONENT, 'Jellyfin API key not configured — skipping library refresh');
    return false;
  }

  try {
    // Primeiro, busca as bibliotecas disponíveis para encontrar o ID correto
    const { data: libraries } = await axios.get(`${config.url}/Library/VirtualFolders`, {
      headers: {
        'X-Emby-Token': config.apiKey,
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    // Filtra pela biblioteca desejada (Movies ou Series)
    const targetName = libraryName?.toLowerCase();
    const library = libraries?.find((lib: any) => {
      const name = (lib.Name || '').toLowerCase();
      if (targetName) return name.includes(targetName);
      // Se não especificou, refresh em todas
      return true;
    });

    if (library?.ItemId) {
      await axios.post(`${config.url}/Library/VirtualFolders/${library.ItemId}/Refresh`, null, {
        headers: {
          'X-Emby-Token': config.apiKey,
          'Content-Type': 'application/json',
        },
        params: { recursive: true, imageCacheMode: 'None' },
        timeout: 30000,
      });
      logger.info(COMPONENT, `Library refresh triggered: ${library.Name}`);
      return true;
    }

    // Fallback: tenta refresh em todas as bibliotecas
    const { data: allLibs } = await axios.get(`${config.url}/Library/VirtualFolders`, {
      headers: { 'X-Emby-Token': config.apiKey, 'Accept': 'application/json' },
      timeout: 10000,
    });

    for (const lib of (allLibs || [])) {
      if (lib?.ItemId) {
        await axios.post(`${config.url}/Library/VirtualFolders/${lib.ItemId}/Refresh`, null, {
          headers: { 'X-Emby-Token': config.apiKey, 'Content-Type': 'application/json' },
          params: { recursive: true, imageCacheMode: 'None' },
          timeout: 30000,
        }).catch(() => {});
      }
    }
    logger.info(COMPONENT, 'All libraries refresh triggered');
    return true;
  } catch (err: any) {
    logger.warn(COMPONENT, `Library refresh failed: ${err.message}`);
    return false;
  }
}

export const JellyfinService = {
  refreshLibrary,
};
