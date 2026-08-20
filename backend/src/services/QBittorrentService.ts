// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import axios from 'axios';
import { Settings } from '../models/Settings';
import { logger } from '../utils/logger';
import { normalizeTitleForMatch, extractSeasonNumber } from '../utils/mediaOrganizer';

const COMPONENT = 'QBittorrentService';

let cookie = '';
let lastLoginAttempt = 0;
let loginError = '';
let isConnected = false;
let loginPromise: Promise<boolean> | null = null;

async function getConfig() {
  const s = await Settings.findOne();
  return {
    url: s?.qbittorrentUrl || process.env.QBITTORRENT_URL || 'http://qbittorrent:8082',
    username: s?.qbittorrentUsername || process.env.QBITTORRENT_USERNAME || 'dolfim',
    password: s?.qbittorrentPassword || process.env.QBITTORRENT_PASSWORD || '123Rd!',
  };
}

/**
 * Tenta autenticar no qBittorrent.
 * 
 * IMPORTANTE: qBittorrent retorna "Fails." com HTTP 200 quando as
 * credenciais estão erradas (não retorna 401!). Por isso precisamos
 * verificar o corpo da resposta e o header set-cookie.
 */
async function login(): Promise<boolean> {
  // Se já existe um login em andamento, reutiliza a mesma promise
  if (loginPromise) return loginPromise;

  // Evita flood de login — no máximo 1 tentativa a cada 60 segundos
  // (qBittorrent session dura ~30min, não precisa re-logar a cada poll)
  const now = Date.now();
  if (now - lastLoginAttempt < 60000 && cookie) return true;

  // Debug: log why we're re-logging in
  if (cookie && now - lastLoginAttempt >= 60000) {
    logger.info(COMPONENT, `Login cooldown expired (${Math.round((now - lastLoginAttempt) / 1000)}s since last), re-authenticating`);
  } else if (!cookie) {
    logger.info(COMPONENT, `No cookie available, authenticating`);
  }

  loginPromise = doLogin();
  const result = await loginPromise;
  loginPromise = null;
  return result;
}

async function doLogin(): Promise<boolean> {
  lastLoginAttempt = Date.now();
  const config = await getConfig();

  try {
    const form = new URLSearchParams();
    form.append('username', config.username);
    form.append('password', config.password);

    const res = await axios.post(`${config.url}/api/v2/auth/login`, form.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      maxRedirects: 0,
      validateStatus: (s) => s < 400,
      timeout: 10000,
    });

    // Pega o cookie do header set-cookie
    const raw = res.headers['set-cookie'];
    const body = typeof res.data === 'string' ? res.data.trim() : '';

    // qBittorrent retorna "Fails." quando as credenciais estão erradas
    if (body.includes('Fails') || body.includes('fail')) {
      loginError = 'Credenciais inválidas (usuário ou senha errados)';
      isConnected = false;
      cookie = '';
      logger.error(COMPONENT, 'Login failed: credenciais inválidas', {
        status: res.status,
        body: body.slice(0, 50),
        url: config.url,
      });
      return false;
    }

    // Verifica se recebemos o cookie
    if (raw) {
      const joined = Array.isArray(raw) ? raw[0] : raw;
      cookie = joined.split(';')[0].trim();
      loginError = '';
      isConnected = true;
      logger.info(COMPONENT, 'qBittorrent autenticado', {
        status: res.status,
        url: config.url,
      });
      return true;
    }

    // Resposta sem cookie e sem "Fails." — provavelmente redirect sem cookie
    if (res.status >= 300 && res.status < 400) {
      // Redirect pode ter o cookie no header Location ou set-cookie
      // Tenta de novo sem maxRedirects
      try {
        const res2 = await axios.post(`${config.url}/api/v2/auth/login`, form.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        });
        const raw2 = res2.headers['set-cookie'];
        const body2 = typeof res2.data === 'string' ? res2.data.trim() : '';
        if (body2.includes('Fails') || body2.includes('fail')) {
          loginError = 'Credenciais inválidas';
          isConnected = false;
          cookie = '';
          logger.error(COMPONENT, 'Login failed: credenciais inválidas (retry)');
          return false;
        }
        if (raw2) {
          const joined = Array.isArray(raw2) ? raw2[0] : raw2;
          cookie = joined.split(';')[0].trim();
          loginError = '';
          isConnected = true;
          logger.info(COMPONENT, 'qBittorrent autenticado (retry)');
          return true;
        }
      } catch {
        // Ignora erro do retry
      }
    }

    loginError = `Resposta inesperada: HTTP ${res.status}, sem cookie e sem Fails`;
    isConnected = false;
    cookie = '';
    logger.warn(COMPONENT, loginError, { body: body.slice(0, 100) });
    return false;
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNABORTED') {
      loginError = `qBittorrent inacessível em ${config.url} (${err.code})`;
      logger.error(COMPONENT, loginError);
    } else if (err.response?.status === 403) {
      loginError = 'Acesso negado — verifique as credenciais no qBittorrent';
      logger.error(COMPONENT, loginError);
    } else {
      loginError = `Erro de conexão: ${err.message}`;
      logger.error(COMPONENT, 'Login error', { error: err.message, url: config.url });
    }
    isConnected = false;
    cookie = '';
    return false;
  }
}

export const QBittorrentService = {
  /**
   * Verifica se o qBittorrent está acessível e autenticado.
   */
  async checkHealth(): Promise<{ connected: boolean; message: string; version?: string }> {
    try {
      const ok = await login();
      if (!ok) {
        return { connected: false, message: loginError || 'Falha na autenticação' };
      }
      const config = await getConfig();
      const { data } = await axios.get(`${config.url}/api/v2/app/version`, {
        headers: { Cookie: cookie },
        timeout: 5000,
      });
      return {
        connected: true,
        message: 'Conectado',
        version: typeof data === 'string' ? data.trim() : String(data),
      };
    } catch (err: any) {
      return {
        connected: false,
        message: err.message || 'Erro ao verificar saúde',
      };
    }
  },

  async login(): Promise<boolean> {
    return login();
  },

  async getInfo() {
    if (!await login()) return null;
    const config = await getConfig();
    try {
      const { data } = await axios.get(`${config.url}/api/v2/transfer/info`, {
        headers: { Cookie: cookie },
        timeout: 10000,
      });
      isConnected = true;
      return data;
    } catch (err: any) {
      logger.warn(COMPONENT, 'getInfo failed', { error: err.message });
      cookie = '';
      isConnected = false;
      return null;
    }
  },

  async getTorrents() {
    if (!await login()) return [];
    const config = await getConfig();
    try {
      const { data } = await axios.get(`${config.url}/api/v2/torrents/info`, {
        headers: { Cookie: cookie },
        timeout: 15000,
      });
      isConnected = true;
      loginError = '';
      return data.map((t: any) => ({
        hash: t.hash,
        name: t.name,
        progress: t.progress * 100,
        speed: t.dlspeed,
        eta: t.eta,
        seeds: t.num_seeds,
        peers: t.num_leechers,
        size: t.size,
        downloaded: t.downloaded,
        state: t.state,
      }));
    } catch (err: any) {
      logger.warn(COMPONENT, 'getTorrents failed', { error: err.message });
      cookie = '';
      isConnected = false;
      return [];
    }
  },

  /**
   * Busca um torrent específico por hash (via filtro do qBittorrent).
   * Retorna null se não encontrar.
   */
  async getTorrentByHash(hash: string): Promise<any | null> {
    if (!await login()) return null;
    const config = await getConfig();
    try {
      const { data } = await axios.get(`${config.url}/api/v2/torrents/info`, {
        headers: { Cookie: cookie },
        params: { hashes: hash },
        timeout: 10000,
      });
      if (data && data.length > 0) {
        const t = data[0];
        return {
          hash: t.hash,
          name: t.name,
          progress: t.progress * 100,
          speed: t.dlspeed,
          eta: t.eta,
          seeds: t.num_seeds,
          peers: t.num_leechers,
          size: t.size,
          downloaded: t.downloaded,
          state: t.state,
        };
      }
      return null;
    } catch (err: any) {
      logger.warn(COMPONENT, 'getTorrentByHash failed', { hash, error: err.message });
      return null;
    }
  },

  /**
   * Deleta um torrent do qBittorrent pelo hash.
   * Se deleteFiles=true, remove também os arquivos do disco.
   */
  async deleteTorrent(hash: string, deleteFiles = false): Promise<boolean> {
    if (!await login()) return false;
    const config = await getConfig();
    try {
      await axios.post(
        `${config.url}/api/v2/torrents/delete`,
        `hashes=${hash}&deleteFiles=${deleteFiles ? 'true' : 'false'}`,
        {
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        }
      );
      logger.info(COMPONENT, 'Torrent deleted', { hash, deleteFiles });
      return true;
    } catch (err: any) {
      logger.error(COMPONENT, 'deleteTorrent failed', { hash, error: err.message });
      return false;
    }
  },

  /**
   * Verifica se já existe um torrent ativo (não-falho) para a série+temporada.
   * Usado para evitar download duplicado quando o Sonarr já está baixando a temporada.
   */
  async hasActiveTorrentForSeason(seriesTitle: string, season: number): Promise<boolean> {
    if (!await login()) return false;
    const config = await getConfig();
    try {
      const { data } = await axios.get(`${config.url}/api/v2/torrents/info`, {
        headers: { Cookie: cookie },
        timeout: 15000,
      });
      const FAILED_STATES = [
        'error',
        'missingFiles',
        'checkingResumeData',
        'checkingSavePath',
        'stalledUP',
        'queuedUP',
        'uploading',
        'pausedUP',
        'forcedUP',
      ];
      const seriesNorm = normalizeTitleForMatch(seriesTitle);
      for (const t of data) {
        if (FAILED_STATES.includes(t.state)) continue;
        const tn = normalizeTitleForMatch(t.name);
        if (!tn.includes(seriesNorm) && !seriesNorm.includes(tn)) continue;
        const torrentSeason = extractSeasonNumber(tn);
        if (torrentSeason === season) return true;
      }
      return false;
    } catch (err: any) {
      logger.warn(COMPONENT, 'hasActiveTorrentForSeason failed', { error: err.message });
      return false;
    }
  },

  /**
   * Verifica se já existem arquivos de vídeo em disco para a série+temporada.
   * Evita re-download quando a temporada já foi baixada e organizada.
   */
  async hasSeasonFilesOnDisk(seriesTitle: string, season: number, basePath = '/media/series'): Promise<boolean> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const seriesNorm = normalizeTitleForMatch(seriesTitle);
      const seriesRoot = path.join(basePath, seriesTitle);
      if (!fs.existsSync(seriesRoot)) return false;
      const entries = fs.readdirSync(seriesRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const seasonMatch = entry.name.match(/(?:Season|Temporada|S)\s*(\d{1,2})/i);
        if (seasonMatch && parseInt(seasonMatch[1]) === season) {
          const seasonDir = path.join(seriesRoot, entry.name);
          const files = fs.readdirSync(seasonDir);
          const videoFiles = files.filter(f => /\.(mkv|mp4|avi|ts|rmvb|flv|wmv|m4v)$/i.test(f));
          if (videoFiles.length > 0) return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  },

  async addMagnet(magnet: string, savePath = '/downloads', category?: string): Promise<string | null> {
    if (!await login()) return null;
    const config = await getConfig();

    // Inject extra public trackers to maximize peer discovery
    const extraTrackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.stealth.si:80/announce',
      'udp://tracker.openbittorrent.com:80/announce',
      'udp://exodus.desync.com:6969/announce',
      'udp://open.demonii.com:1337/announce',
      'udp://tracker.moeking.me:6969/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://tracker.tiny-vps.com:6969/announce',
      'udp://tracker.jordan.im:6969/announce',
      'udp://tracker.skynetcloud.site:6969/announce',
      'udp://tracker.dump.cl:6969/announce',
      'https://tracker.nanoha.org:443/announce',
    ];
    const existingTrackers = new Set(
      (magnet.match(/[?&]tr=([^&]+)/g) || []).map((m: string) => decodeURIComponent(m.replace(/^[?&]tr=/, '')))
    );
    const newTrackers = extraTrackers.filter((t) => !existingTrackers.has(t));
    if (newTrackers.length > 0) {
      magnet += newTrackers.map((t) => `&tr=${encodeURIComponent(t)}`).join('');
    }

    logger.info(COMPONENT, 'Adding magnet to qBittorrent', { 
      savePath, 
      category: category || 'none',
      extraTrackers: newTrackers.length,
      magnetPreview: magnet.substring(0, 80) + '...'
    });
    try {
      let params = `urls=${encodeURIComponent(magnet)}&savepath=${savePath}&paused=false&forceStart=true`;
      if (category) {
        params += `&category=${category}`;
      }

      const { data } = await axios.post(
        `${config.url}/api/v2/torrents/add`,
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: cookie,
          },
          timeout: 15000,
        }
      );

      logger.info(COMPONENT, 'Magnet added to qBittorrent response', {
        savePath,
        category: category || 'none',
        response: typeof data === 'string' ? data.substring(0, 200) : 'ok',
        responseType: typeof data
      });

      const infohash = magnet.match(/(?:btih|xt=urn:btih):([a-fA-F0-9]{40})/i)?.[1]?.toLowerCase();
      if (infohash) {
        // Confirma que o torrent REALMENTE apareceu no qBittorrent antes de reportar sucesso.
        // (Antes, o hash era retornado mesmo sem confirmação → criava "download fantasma"
        //  que ficava em "Aguardando fontes" para sempre no banco.)
        let found: any = null;
        for (let attempt = 0; attempt < 3 && !found; attempt++) {
          await new Promise(r => setTimeout(r, 2000));
          const torrents = await QBittorrentService.getTorrents();
          found = torrents.find((t: any) => t.hash?.toLowerCase() === infohash) || null;
        }
        if (found) {
          logger.info(COMPONENT, 'Torrent confirmed in qBittorrent', { 
            hash: infohash, 
            name: found.name, 
            state: found.state,
            seeds: found.seeds,
            peers: found.peers
          });
          return infohash;
        }
        logger.error(COMPONENT, 'Torrent NOT confirmed in qBittorrent after add — refusing to create phantom download', { hash: infohash, magnet: magnet.substring(0, 80) });
        return null;
      }
      return null;
    } catch (err: any) {
      logger.error(COMPONENT, 'Failed to add magnet', {
        error: err.message,
        response: err.response?.data,
        status: err.response?.status,
        magnet: magnet.substring(0, 60) + '...',
      });
      return null;
    }
  },

  /**
   * Define preferências do qBittorrent (ex: max_active_torrents, max_active_downloads).
   * Usado para otimizar downloads em paralelo.
   */
  async configureActiveLimits(maxActiveTorrents = 25, maxActiveDownloads = 20): Promise<boolean> {
    if (!await login()) return false;
    const config = await getConfig();
    try {
      const form = new URLSearchParams();
      form.append('json', JSON.stringify({
        max_active_torrents: maxActiveTorrents,
        max_active_downloads: maxActiveDownloads,
        max_active_uploads: 3,
      }));
      await axios.post(
        `${config.url}/api/v2/app/setPreferences`,
        form.toString(),
        {
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        }
      );
      logger.info(COMPONENT, 'qBittorrent preferences updated', { maxActiveTorrents, maxActiveDownloads });
      return true;
    } catch (err: any) {
      logger.error(COMPONENT, 'setPreferences failed', { error: err.message });
      return false;
    }
  },

  /**
   * Retorna apenas torrents que têm seeds reais (> 0).
   * Útil para validações de duplicata no pipeline.
   */
  async getTorrentsWithRealSeeds(): Promise<any[]> {
    const torrents = await this.getTorrents();
    return torrents.filter((t: any) => (t.seeds || 0) > 0);
  },

  /**
   * Limpa torrents com 0 seeds que estão travados (stalled/queued/paused/metaDL).
   * Remove da fila torrents que não têm seeds reais e estão em estado de espera.
   * Se seriesTitle for fornecido, filtra apenas torrents da série específica.
   */
  async cleanupZeroSeedTorrents(seriesTitle?: string): Promise<number> {
    if (!await login()) return 0;
    const config = await getConfig();
    try {
      const { data } = await axios.get(`${config.url}/api/v2/torrents/info`, {
        headers: { Cookie: cookie }, timeout: 15000
      });

      const STALLED_STATES = ['stalledDL', 'queuedDL', 'pausedDL', 'metaDL', 'forcedMetaDL'];
      let deleted = 0;

      for (const t of data) {
        const hasZeroSeeds = (t.num_seeds || 0) === 0;
        const isStalled = STALLED_STATES.includes(t.state);
        const noProgress = (t.progress || 0) === 0;

        // Deletar se: 0 seeds E (estado stalled OU sem progresso)
        if (hasZeroSeeds && (isStalled || noProgress)) {
          // Filtro opcional por série
          if (seriesTitle && !normalizeTitleForMatch(t.name).includes(normalizeTitleForMatch(seriesTitle))) {
            continue;
          }

          await QBittorrentService.deleteTorrent(t.hash, false);
          deleted++;
          logger.info(COMPONENT, `[CLEANUP] Removed zero-seed torrent: "${t.name}" (state: ${t.state})`);
        }
      }
      return deleted;
    } catch (err: any) {
      logger.error(COMPONENT, 'cleanupZeroSeedTorrents failed', { error: err.message });
      return 0;
    }
  },
  /**
   * Adiciona múltiplos magnets para avaliação de qualidade.
   * Retorna metadata real (tamanho, seeds) após resolução do magnet.
   */
  async addMagnetsForEvaluation(magnets: string[], savePath: string): Promise<Array<{
    hash: string;
    name: string;
    size: number;
    seeds: number;
    state: string;
  }>> {
    if (!await login()) return [];
    const config = await getConfig();

    // Adicionar todos os magnets
    const addedHashes: string[] = [];
    for (const magnet of magnets) {
      try {
        const infohash = magnet.match(/(?:btih|xt=urn:btih):([a-fA-F0-9]{40})/i)?.[1]?.toLowerCase();
        if (!infohash) continue;

        const params = `urls=${encodeURIComponent(magnet)}&savepath=${savePath}&paused=true&forceStart=false`;
        await axios.post(`${config.url}/api/v2/torrents/add`, params, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
          timeout: 15000,
        });
        addedHashes.push(infohash);
      } catch (err: any) {
        logger.warn(COMPONENT, `Failed to add evaluation magnet: ${err.message}`);
      }
    }

    if (addedHashes.length === 0) return [];

    // Forçar resolução de metadata: retomar torrents pausados para que qBittorrent busque metadata
    try {
      await axios.post(`${config.url}/api/v2/torrents/resume`,
        `hashes=${addedHashes.join('|')}`,
        { headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
      );
    } catch { }

    // Esperar metadata resolver (até 45s, checando a cada 5s)
    logger.info(COMPONENT, `Waiting for metadata resolution of ${addedHashes.length} torrents...`);
    const results: Array<{ hash: string; name: string; size: number; seeds: number; state: string }> = [];

    for (let attempt = 0; attempt < 9; attempt++) {
      await new Promise(r => setTimeout(r, 5000));

      for (const hash of addedHashes) {
        if (results.find(r => r.hash === hash)) continue; // já resolvido

        try {
          const { data } = await axios.get(`${config.url}/api/v2/torrents/info`, {
            headers: { Cookie: cookie },
            params: { hashes: hash },
            timeout: 10000,
          });

          if (data && data.length > 0) {
            const t = data[0];
            // Torrent com tamanho real (>0) e metadata resolvida
            if (t.size > 0) {
              results.push({
                hash: t.hash,
                name: t.name,
                size: t.size,
                seeds: t.num_seeds || 0,
                state: t.state,
              });
              logger.info(COMPONENT, `Metadata resolved: "${t.name}" — ${(t.size / 1024 / 1024 / 1024).toFixed(2)}GB, ${t.num_seeds} seeds, state: ${t.state}`);
            }
          }
        } catch { }
      }

      // Se todos resolvidos, parar
      if (results.length >= addedHashes.length) break;
    }

    logger.info(COMPONENT, `Evaluation metadata: ${results.length}/${addedHashes.length} resolved`);
    return results;
  },

  /**
   * Deleta múltiplos torrents por hash (sem deletar arquivos).
   */
  async deleteTorrents(hashes: string[]): Promise<number> {
    if (!await login() || hashes.length === 0) return 0;
    const config = await getConfig();
    try {
      await axios.post(
        `${config.url}/api/v2/torrents/delete`,
        `hashes=${hashes.join('|')}&deleteFiles=false`,
        {
          headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000,
        }
      );
      logger.info(COMPONENT, `Deleted ${hashes.length} evaluation torrents`);
      return hashes.length;
    } catch (err: any) {
      logger.error(COMPONENT, `deleteTorrents failed: ${err.message}`);
      return 0;
    }
  },

  /** Retorna true se o último login foi bem-sucedido (não faz request). */
  get isConnected() { return isConnected; },
};
