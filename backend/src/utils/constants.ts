// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
/**
 * Constantes compartilhadas do pipeline de mídia.
 *
 * MIN_SPAM_SIZE_BYTES: regra anti-propaganda/spam. Arquivos menores que 300MB
 * baixados são quase sempre propagandas ou conteúdo inválido — o torrent é
 * deletado do qBittorrent e o item é marcado como erro.
 */
export const MIN_SPAM_SIZE_BYTES = 500 * 1024 * 1024; // 500MB em bytes

/**
 * Palavras-chave de propaganda.
 *
 * ATENÇÃO: 'bludv' também é tag de RELEASE GROUP em arquivos legítimos grandes
 * (ex: "Matrix.Reloaded.2003...DUAL-MLD-BLUDV.mkv" com 5.6GB). Por isso a
 * checagem é SIZE-AWARE: keywords de release group só classificam como spam
 * quando o arquivo/torrent é pequeno (< MIN_SPAM_SIZE_BYTES).
 */
export const SPAM_KEYWORDS = [
  '1xbet', '1xbobet', 'promo', 'shrek', 'dynamite', 'dinheiro', 'livre',
  '100free', 'freepremium', 'betgratis', 'aposta', 'casino', 'slot',
  'propaganda', 'publicidade', 'comercial', 'sponsored', 'advert',
];

/** Keywords que são também tags de release group — só spam se o arquivo for pequeno */
const SPAM_RELEASE_GROUP_KEYWORDS = ['dynamite'];

/**
 * Keywords para nomes de PASTA (onde não há tamanho de arquivo para avaliar):
 * apenas palavras 100% propaganda, sem as de release group (evita pular
 * diretórios legítimos como "Matrix...DUAL-MLD-BLUDV").
 */
export const SPAM_DIR_KEYWORDS = SPAM_KEYWORDS.filter(
  (kw) => !SPAM_RELEASE_GROUP_KEYWORDS.includes(kw)
);

/**
 * Extrai palavras do título esperado para a checagem de relevância,
 * removendo tokens de temporada ("temporada 2" → nada) e acentos —
 * espelha o comportamento de normalizeTitleForMatch do pipeline antigo.
 */
function extractTitleWords(expectedTitle: string): string[] {
  return expectedTitle
    .toLowerCase()
    .replace(/\b(?:temporada|tempordada|season)\s*\d{1,2}\b/g, '')
    .replace(/\b\d{1,2}ª?\s*(?:temporada|tempordada|season)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Detecta arquivo de propaganda/spam.
 * @param fileName nome do arquivo/torrent (case-insensitive)
 * @param expectedTitle título esperado da mídia (para checagem de relevância)
 * @param fileSizeBytes tamanho em bytes (opcional — usado p/ não marcar
 *   releases grandes que usam tags de grupo como 'bludv')
 */
export function isLikelySpam(
  fileName: string,
  expectedTitle: string,
  fileSizeBytes?: number
): { spam: boolean; reason: string } {
  const nameLower = fileName.toLowerCase();
  const titleWords = extractTitleWords(expectedTitle);

  for (const keyword of SPAM_KEYWORDS) {
    if (nameLower.includes(keyword)) {
      if (SPAM_RELEASE_GROUP_KEYWORDS.includes(keyword)) {
        // Release group só é spam quando o arquivo é pequeno (ou tamanho desconhecido)
        const isSmall = fileSizeBytes === undefined || fileSizeBytes < MIN_SPAM_SIZE_BYTES;
        if (isSmall) {
          return { spam: true, reason: `contains spam keyword '${keyword}' (small file)` };
        }
        continue; // arquivo grande com tag de release group = conteúdo legítimo
      }
      return { spam: true, reason: `contains spam keyword '${keyword}'` };
    }
  }

  // Checagem de relevância (heurística): só se aplica a arquivos PEQUENOS
  // (< 300MB) e sem marcador de episódio. Evita falso positivo em conteúdo
  // legítimo com nome traduzido (ex: série pt-BR cujo torrent usa nome em
  // inglês) — nesses casos o torrent é grande e/ou tem marcador SxxExx.
  const hasEpisodeMarker =
    /[st]\d{1,2}[. _-]*e\d{1,2}/i.test(fileName) || /\b\d{1,2}[xX]\d{1,2}\b/.test(fileName);
  const isKnownSmall = fileSizeBytes !== undefined && fileSizeBytes < MIN_SPAM_SIZE_BYTES;

  if (!hasEpisodeMarker && isKnownSmall && titleWords.length >= 2) {
    const titleMatchCount = titleWords.filter((w) => nameLower.includes(w)).length;
    const relevanceRatio = titleMatchCount / titleWords.length;
    if (relevanceRatio < 0.15) {
      return { spam: true, reason: `low title relevance (${titleMatchCount}/${titleWords.length} title words matched = ${(relevanceRatio * 100).toFixed(0)}%)` };
    }
  }

  return { spam: false, reason: '' };
}

/**
 * Variante sem título esperado — útil para checar um caminho de arquivo
 * resolvido (ex: stream) onde não temos o título canônico à mão.
 *
 * IMPORTANTE: NÃO aplica regra cega de tamanho (< 300MB) porque há conteúdo
 * legítimo pequeno na biblioteca (ex: episódios x265 de 70MB). A regra de
 * tamanho mínimo vale APENAS no pipeline de download (novos torrents), onde
 * o tamanho total é conhecido. Aqui o tamanho só é usado para desambiguar
 * keywords que também são tags de release group (ex: 'bludv').
 */
export function isSpamFileName(fileName: string, fileSizeBytes?: number): boolean {
  const nameLower = fileName.toLowerCase();
  for (const keyword of SPAM_KEYWORDS) {
    if (!nameLower.includes(keyword)) continue;
    if (SPAM_RELEASE_GROUP_KEYWORDS.includes(keyword)) {
      const isSmall = fileSizeBytes === undefined || fileSizeBytes < MIN_SPAM_SIZE_BYTES;
      if (isSmall) return true;
      continue;
    }
    return true;
  }
  return false;
}
