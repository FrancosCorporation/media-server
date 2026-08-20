// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

const COMPONENT = 'MediaOrganizer';

/**
 * Padrões regex para extrair temporada e episódio de nomes de arquivo de mídia.
 * Suporta: S01E01, S1E1, 1x01, 1x1, T01E01, Temporada 1 Episodio 1, etc.
 */
const EPISODE_PATTERNS = [
  // S01E01, S1E1, s01e01
  { regex: /[.\s_-]?[Ss](\d{1,2})[.\s_-]?[Ee](\d{1,2})/i, seasonGroup: 1, episodeGroup: 2 },
  // 1x01, 1x1
  { regex: /(\d{1,2})[xX](\d{1,2})/, seasonGroup: 1, episodeGroup: 2 },
  // T01E01, T1E1
  { regex: /[Tt](\d{1,2})[.\s_-]?[Ee](\d{1,2})/i, seasonGroup: 1, episodeGroup: 2 },
  // Temporada 1 Episodio 1 (PT-BR)
  { regex: /[Tt]emporada\s*(\d{1,2})[.\s_-]*[Ee]pis[oó]dio\s*(\d{1,2})/i, seasonGroup: 1, episodeGroup: 2 },
  // Temp 1 Ep 1
  { regex: /[Tt]emp\s*(\d{1,2})[.\s_-]*[Ee]p\s*(\d{1,2})/i, seasonGroup: 1, episodeGroup: 2 },
];

/**
 * Padrões para extrair apenas temporada (sem episódio específico).
 */
const SEASON_ONLY_PATTERNS = [
  // Temporada 1, 1ª Temporada, Season 1
  /[.\s_-]?[Tt]emporada\s*(\d{1,2})/i,
  /(\d{1,2})[ªº]?\s*[Tt]emporada/i,
  /[.\s_-]?[Ss]eason\s*(\d{1,2})/i,
  /[.\s_-]?[Ss](\d{1,2})[.\s_-]?(?: Complete| Completa)?$/i,
];

interface ParsedMediaInfo {
  seriesName: string;
  season: number;
  episode: number | null;
  originalFilename: string;
}

/**
 * Limpa o nome da série removendo tokens de qualidade, release group, etc.
 */
function cleanSeriesName(name: string): string {
  let result = name
    .replace(/[.\s_-]+/g, ' ')
    // Remove domínios de site (.com, .com.br, .net, etc.)
    .replace(/\b\w+\.com\.?br?\b|\b\w+\.net\b|\b\w+\.org\b|\b\w+\.tv\b|\b\w+\.info\b/gi, '')
    // Remove palavras em português de sites de torrent
    .replace(/\b(EPISODIO|episodios|COMPLETO|COMPLETA|COMPLETE|DOWNLOAD|BAIXAR|BAIXARAPIDO|DOWNLOADCOMPLETO|legendado|dublado|dual|audiobook|torrent|serie|series|temporada|all|\d{4})\b/gi, '')
    .replace(/\b(1080p|720p|480p|2160p|4k|hdr|hevc|x264|x265|h264|h265|aac|ac3|dts|flac|mp3|bluray|webrip|webdl|hdtv|dvdrip|bdrip|internal|rarbg|yify|yts|ettv|loki|avc|10bit|dual|audio|portuguese|dub|pt-br|english|subtitle|subs|soft|vostfr|ad|atv|web|byor|multi|eng|xvid|brrip|h264|h265|hevc|aac|ac3|dts|5\.1|7\.1|2ch|6ch|8ch|stereo|mono|dl|dubbed|subbed|ptbr|pt-br|en|es|fr|de|it|mkv|mp4|avi|web.?dl)\b/gi, '')
    // Remove extensões de arquivo soltas
    .replace(/\b(mkv|mp4|avi|flv|wmv|mov|mts|m2ts|ts|iso|rar|zip|nfo)\b/gi, '');
  // Remove números soltos
  result = result.replace(/\b\d+\b/g, '');
  // Remove "COM AO" e padrões similares de sites de download
  result = result.replace(/\bCOM\s+AO\b|\bAO\s+0?\d+\b/gi, '');
  // Remove "COM" solto que sobrou
  result = result.replace(/\bCOM\b/gi, '');
  return result
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Limpa nome de torrent para exibição amigável.
 * Remove quality tags, release groups, domains, e mantém SxxExx se presente.
 */
export function cleanTorrentName(name: string): string {
  const basename = path.basename(name, path.extname(name));

  // Extrai padrão SxxExx antes de limpar
  let episodeSuffix = '';
  const epMatch = basename.match(/[.\s_-]?[Ss](\d{1,2})[.\s_-]?[Ee](\d{1,2})/i) ||
                  basename.match(/(\d{1,2})[xX](\d{1,2})/) ||
                  basename.match(/[Tt](\d{1,2})[.\s_-]?[Ee](\d{1,2})/i);
  if (epMatch) {
    episodeSuffix = ` S${epMatch[1].padStart(2, '0')}E${epMatch[2].padStart(2, '0')}`;
  }

  const cleaned = cleanSeriesName(basename);

  // Remove sufixo de episódio duplicado se cleanSeriesName não removeu
  const withoutEp = cleaned.replace(/[.\s_-]?[Ss]\d{1,2}[.\s_-]?[Ee]\d{1,2}/gi, '')
                          .replace(/\d{1,2}[xX]\d{1,2}/g, '')
                          .replace(/[Tt]\d{1,2}[.\s_-]?[Ee]\d{1,2}/gi, '')
                          .trim();

  return withoutEp + episodeSuffix;
}

/**
 * Extrai informações de mídia de um nome de arquivo.
 */
export function parseMediaFilename(filename: string): ParsedMediaInfo | null {
  const basename = path.basename(filename, path.extname(filename));

  // Tenta cada padrão de episódio
  for (const pattern of EPISODE_PATTERNS) {
    const match = basename.match(pattern.regex);
    if (match) {
      const season = parseInt(match[pattern.seasonGroup]);
      const episode = parseInt(match[pattern.episodeGroup]);
      const seriesName = cleanSeriesName(basename.substring(0, basename.search(pattern.regex)));

      if (seriesName && season > 0 && episode > 0) {
        return {
          seriesName,
          season,
          episode,
          originalFilename: filename,
        };
      }
    }
  }

  // Tenta extrair apenas temporada
  for (const pattern of SEASON_ONLY_PATTERNS) {
    const match = basename.match(pattern);
    if (match) {
      const season = parseInt(match[1]);
      const seriesName = cleanSeriesName(basename.substring(0, basename.search(pattern)));

      if (seriesName && season > 0) {
        return {
          seriesName,
          season,
          episode: null,
          originalFilename: filename,
        };
      }
    }
  }

  return null;
}

/**
 * Formata número com zero à esquerda (1 → "01", 12 → "12").
 */
function padNumber(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Organiza um arquivo de mídia na estrutura Jellyfin.
 *
 * Estrutura criada:
 *   /media/series/Nome da Serie/Season 01/Nome da Serie - S01E01.mkv
 *
 * @param filePath - Caminho completo do arquivo original
 * @param seriesTitle - Título da série (usado como fallback se não conseguir extrair do nome)
 * @param seasonNumber - Número da temporada (usado como fallback)
 * @param episodeNumber - Número do episódio (usado como fallback)
 * @param basePath - Pasta raiz (padrão: /media/series)
 * @returns Caminho final do arquivo organizado, ou null se falhou
 */
export function organizeMediaFile(
  filePath: string,
  seriesTitle?: string,
  seasonNumber?: number,
  episodeNumber?: number | null,
  basePath: string = '/media/series'
): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      logger.warn(COMPONENT, `File not found: ${filePath}`);
      return null;
    }

    const filename = path.basename(filePath);
    const ext = path.extname(filename);

    // Tenta extrair info do nome do arquivo
    let info = parseMediaFilename(filename);

    // Usa fallbacks se não conseguiu extrair
    const seriesName = info?.seriesName || cleanSeriesName(seriesTitle || filename.replace(ext, ''));
    const season = info?.season || seasonNumber || 1;
    const episode = info?.episode || episodeNumber || null;

    if (!seriesName) {
      logger.warn(COMPONENT, `Could not determine series name for: ${filename}`);
      return null;
    }

    // Monta o caminho Jellyfin
    const seasonFolder = `Season ${padNumber(season)}`;
    let newFilename: string;

    if (episode) {
      newFilename = `${seriesName} - S${padNumber(season)}E${padNumber(episode)}${ext}`;
    } else {
      // Se não tem episódio, mantém o nome original mas na pasta correta
      newFilename = filename;
    }

    const destDir = path.join(basePath, seriesName, seasonFolder);
    fs.mkdirSync(destDir, { recursive: true });

    const destPath = path.join(destDir, newFilename);

    // Evita sobrescrever: se já existe, adiciona sufixo
    if (fs.existsSync(destPath) && destPath !== filePath) {
      const uniquePath = path.join(destDir, `${seriesName} - S${padNumber(season)}E${padNumber(episode || 0)}_dup${ext}`);
      logger.warn(COMPONENT, `File already exists: ${destPath}, using: ${uniquePath}`);
      fs.renameSync(filePath, uniquePath);
      return uniquePath;
    }

    // Não move se já está no local correto
    if (filePath === destPath) {
      return destPath;
    }

    // Tenta rename primeiro, se falhar por cross-device usa copy
    try {
      fs.renameSync(filePath, destPath);
    } catch (renameErr: any) {
      if (renameErr.code === 'EXDEV') {
        fs.copyFileSync(filePath, destPath);
        fs.unlinkSync(filePath);
      } else {
        throw renameErr;
      }
    }
    logger.info(COMPONENT, `Organized: ${filename} → ${seriesName}/${seasonFolder}/${newFilename}`);
    return destPath;
  } catch (err: any) {
    logger.error(COMPONENT, `Failed to organize ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Organiza todos os arquivos de mídia em um diretório.
 * Útil para processar o conteúdo baixado por torrents.
 *
 * @param dirPath - Diretório contendo os arquivos para organizar
 * @param seriesTitle - Título da série
 * @param seasonNumber - Número da temporada
 * @param basePath - Pasta raiz (padrão: /media/series)
 * @returns Array com os caminhos dos arquivos organizados
 */
export function organizeDirectory(
  dirPath: string,
  seriesTitle: string,
  seasonNumber?: number,
  basePath: string = '/media/series'
): string[] {
  const organized: string[] = [];

  try {
    if (!fs.existsSync(dirPath)) {
      logger.warn(COMPONENT, `Directory not found: ${dirPath}`);
      return organized;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(dirPath, entry.name);
        const ext = path.extname(entry.name).toLowerCase();

        // Processa apenas arquivos de mídia
        const MEDIA_EXTS = ['.mkv', '.mp4', '.avi', '.ts', '.rmvb', '.flv', '.wmv', '.m4v'];
        if (!MEDIA_EXTS.includes(ext)) continue;

        const result = organizeMediaFile(filePath, seriesTitle, seasonNumber, undefined, basePath);
        if (result) organized.push(result);
      } else if (entry.isDirectory()) {
        // Se é pasta de temporada, extrai número e processa recursivamente
        const seasonMatch = entry.name.match(/(?:Season|Temporada|S)\s*(\d{1,2})/i);
        const subSeason = seasonMatch ? parseInt(seasonMatch[1]) : seasonNumber;

        const subOrganized = organizeDirectory(
          path.join(dirPath, entry.name),
          seriesTitle,
          subSeason,
          basePath
        );
        organized.push(...subOrganized);
      }
    }
  } catch (err: any) {
    logger.error(COMPONENT, `Failed to organize directory ${dirPath}: ${err.message}`);
  }

  return organized;
}

/**
 * Extrai informação de temporada de uma página do ApacheTorrent.
 * Ex: "Breaking Bad - 1ª Temporada Completa" → season 1
 */
export function extractSeasonFromPageTitle(pageTitle: string): number | null {
  for (const pattern of SEASON_ONLY_PATTERNS) {
    const match = pageTitle.match(pattern);
    if (match) {
      return parseInt(match[1]);
    }
  }
  return null;
}

/**
 * Normaliza qualquer referência de temporada em um token canônico "sN".
 * Suporta: "Temporada 1", "1ª Temporada", "Season 1", "S01", "1ª temporada".
 * Ex: "Ted Lasso - Temporada 1" → "ted lasso s1"
 *     "Ted Lasso (2020) S01 (1080p...)" → "ted lasso 2020 s1 1080p ..."
 */
export function normalizeSeasonToken(title: string): string {
  let t = title.toLowerCase();
  // "temporada 1", "tempordada 1", "season 1" → "s1"
  t = t.replace(/\b(?:temporada|tempordada|season)\s*(\d{1,2})\b/g, ' s$1 ');
  // "1ª temporada", "5ª temporada" (número antes) → "s1"
  t = t.replace(/(\d{1,2})ª?\s*(?:temporada|tempordada)\b/g, ' s$1 ');
  // "S01"/"S1" (sem E de episódio na sequência) → "s1"
  t = t.replace(/\bs(\d{1,2})\b(?!e)/g, ' s$1 ');
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * Normaliza um título para comparação fuzzy (backfill de hash, dedupe).
 * Converte temporadas para o token canônico "sN" e remove separadores.
 */
export function normalizeTitleForMatch(title: string): string {
  // Primeiro normaliza separadores (pontos, hífens) para que "season.4" → "season 4"
  const spaced = title.toLowerCase().replace(/[._-]+/g, ' ');
  return normalizeSeasonToken(spaced)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai o número da temporada de um título normalizado (via normalizeTitleForMatch).
 * Retorna null se não houver temporada identificável.
 */
export function extractSeasonNumber(normalizedTitle: string): number | null {
  const match = normalizedTitle.match(/\bs(\d{1,2})(?:e\d{1,3})?\b/);
  return match ? parseInt(match[1], 10) : null;
}

// ─── SERIES_STOPWORDS and LEAD_PREFIXES for isSameSeries ───
const SERIES_STOPWORDS = new Set([
  'the', 'o', 'os', 'a', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'em', 'e', 'para',
  'season', 'temporada', 'tempordada', 'completa', 'completo', 'complete', 'com', 'baixarapido',
  'apachetorrent', 'hdr', 'hdrTorrent', 'www', 'comando', 'original', 'torrent', 'legendado',
  'dublado', 'dual', 'audio', 'áudio',   'bluray', '1080p', '720p', 'web', 'dl', 'rip', 'mkv',
  '1080', '720', 'x264', 'x265', 'hevc', 'h264', 'by', 'br', 'hd',
  'this', 'that', 'is', 'are', 'was', 'were', 'for', 'and', 'with', 'you', 'your', 'not',
  'aac', 'ac3', 'dts', 'dd', 'ddp', 'eac3', 'truehd', 'mp4', 'avi', '10bit', '8bit', 'remux',
  'webrip', 'brrip', 'hdrip', 'webdl', 'hdtv', 'repack', 'proper', 'extended', 'uncut',
  'ita', 'eng', 'esp', 'ptbr', '1080', 'fhd', 'uhd', '2160p', '4k', 'sdr', 'hdr10', 'web',
  'nf', 'amzn', 'dsnp', 'ghost', 'utr', 'flux', 'cakes', 'dimension', 'krave', 'kontrast',
  'prime', 'ion', 'ion265', 'psa', 'derew', 'luanharper', 'luan', 'harper', 'sujaidr',
  'pimprg', 'mrlss', 'v3sp4ev3r', 'bludv', 'yg', 'fb', 'tpf', 'filmhd', 'joy', 'rartv',
  'legenda', 'legendas', 'episodio', 'episódio', 'capitulo', 'capítulo', 'temporadas',
  'remastered', 'edicao', 'edição', 'special', 'extras', 'box', 'pack', 'galaxy', 'yts',
  'yify', 'rarbg', 'eztv', 'ettv', 'cmg', 'xvid', 'avc', 'german', 'hindi', 'japanese',
  'italian', 'french', 'spanish', 'chinese', 'korean', 'hdman', 'ion10', 'dvdrip', 'bdrip',
  'dub', 'dual-audio', 'web-dl', 'dvd', '480p', '480', 'flac', 'mp3', 'opus', 'h265',
  'idioma', 'version', 'complete-series', 'udio', 'baixe', 'dublada', 'dubladas', 'dublado',
  'series', '2ch', 'ddp5', 'dd5', 'dolby', 'kitsune', 'edith', 'grace', 'bae', 'bioma',
  'megusta', 'ntb', 'elite', 'amb3r', 'npms', 'playweb', 'toonshub', 'varyg', 'rmteam',
  'ngp', 'jff', 'rawr', 'lazy', 'dolores', 'xebec', 'higgsboson', 'successfulcrab',
  'galaxytv', 'hhweb', 'ethel', 'kinopok', 'utopia', 'mls', 'sajja', 'don', 'daddyrpm',
  'x0r', 'blabla', 'rarbg', 'figment', 'webified', 'ggez', 'megusta', 'baileys', 'xander',
  'medical', 'division', 'sub', 'subs', 'subtitulo', 'subtítulos', 'lullozzo', 'stblz',
]);

const LEAD_PREFIXES = new Set([
  'the', 'a', 'an', 'o', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'em', 'e',
  'comoeubaixo', 'comoeu', 'apachetorrent', 'vacatorrent', 'hdrtorrent', 'hdr',
  'torrentdosfilmes', 'bludv', 'comando', 'baixarapido', 'www', 'mp4',
]);

/**
 * Verifica se o torrent É a série esperada (e não apenas uma série que contém
 * o nome dela no título — ex.: "Your Friends And Neighbours" NÃO é "Friends").
 *
 * Regras:
 * 1. Todos os tokens significativos da série precisam aparecer no torrent.
 * 2. A série precisa ser o ASSUNTO do título: o primeiro token da série deve
 *    aparecer logo no início (posição 0, ou posição 1 após um prefixo comum
 *    como "the"/"o"). Se o nome da série está no meio/fim do título, o torrent
 *    é de outra série e deve ser rejeitado.
 */
export function isSameSeries(torrentTitle: string, expectedSeries: string): boolean {
  const seriesPhrase = normalizeTitleForMatch(expectedSeries);
  const torrentPhrase = normalizeTitleForMatch(torrentTitle);

  const seriesTokens = seriesPhrase.split(' ').filter((t) => t.length > 2 && !SERIES_STOPWORDS.has(t));
  const torrentRaw = torrentPhrase.split(' ').filter((t) => t.length > 2);
  const torrentTokens = torrentRaw.filter((t) => !SERIES_STOPWORDS.has(t));

  if (seriesTokens.length === 0) {
    return seriesPhrase.length >= 3 && torrentPhrase.includes(seriesPhrase);
  }

  // 1) Todos os tokens da série precisam aparecer no torrent
  const allPresent = seriesTokens.every((st) =>
    torrentTokens.some((tt) => tt.includes(st) || st.includes(tt))
  );
  if (!allPresent) return false;

  // 2) A série deve estar no INÍCIO do título, podendo ser precedida apenas por
  //    prefixos comuns (artigos ou domínios de site BR) ou stopwords de qualidade/
  //    idioma ("APACHETORRENT.COM.-DUBLADO-DUAL-AUDIO-.Ted Lasso").
  //    "Your Friends And Neighbours" → "your" antes → rejeitado.
  //    "A.Spy.Among.Friends" → "spy" antes → rejeitado.
  const lead = seriesTokens[0];
  const leadIndex = torrentRaw.findIndex((tt) => tt.includes(lead) || lead.includes(tt));
  if (leadIndex === -1) return false;
  for (let i = 0; i < leadIndex; i++) {
    if (!LEAD_PREFIXES.has(torrentRaw[i]) && !SERIES_STOPWORDS.has(torrentRaw[i])) return false;
  }

  // 3) Séries de palavra única ("Friends", "Dexter") não podem conter outro nome
  //    próprio no título — só qualificadores (ano, temporada, qualidade, release).
  //    Ex.: "Friends With Benefits S01" NÃO é "Friends".
  if (seriesTokens.length === 1) {
    const isQualifier = (t: string) =>
      /\d/.test(t) ||                       // qualquer token com dígito (ano, resolução, codec, s01-s10, ddp5, 2ch)
      LEAD_PREFIXES.has(t) ||               // domínio de site BR no título
      SERIES_STOPWORDS.has(t);              // qualidade/codec/idioma/release
    const foreign = torrentRaw.filter(
      (t) => !isQualifier(t) && !(t.includes(lead) || lead.includes(t))
    );
    if (foreign.length > 0) return false;
  }

  return true;
}
