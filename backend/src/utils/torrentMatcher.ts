// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
/**
 * Utilitário compartilhado para matching de torrents por título.
 * Usado tanto pelo WebSocket (index.ts) quanto pela rota de downloads (routes/downloads.ts).
 */

/**
 * Normaliza nome (pontos, underscores, hífens → espaço, remove especiais, colapsa espaços).
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escapa caracteres especiais de regex.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Encontra um torrent pelo título usando matching fuzzy progressivo:
 * 1. Hash exato (mais preciso)
 * 2. Título exato
 * 3. Torrent começa com o título
 * 4. Título contido no torrent
 * 5. 70%+ das palavras coincidem
 */
export function findTorrentByTitle(torrents: any[], title: string): any | undefined {
  const normalized = normalizeName(title);
  const titleLen = normalized.length;
  const titleWords = normalized.split(' ').filter((w: string) => w.length > 2);

  let bestMatch: any = null;
  let bestScore = -1;

  for (const tr of torrents) {
    const tn = normalizeName(tr.name || '');
    let score = 0;

    // Exact match gets highest score
    if (tn === normalized) { score = 1000; }
    // Torrent name starts with the title — prefer shorter names (closer to exact)
    else if (tn.startsWith(normalized)) { score = 800 - Math.min(tn.length - titleLen, 500); }
    // Title is contained in torrent name
    else if (tn.includes(normalized)) { score = 600 - Math.min(tn.length - titleLen, 400); }
    // Word-level match (70% threshold)
    else if (titleWords.length > 1) {
      const matchCount = titleWords.filter((w: string) => tn.includes(w)).length;
      if (matchCount / titleWords.length >= 0.7) {
        score = 400 + (matchCount / titleWords.length) * 100 - Math.min(tn.length, 300);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = tr;
    }
  }

  return bestScore > 0 ? bestMatch : undefined;
}

/**
 * Encontra um torrent em uma lista, primeiro por hash, depois por título.
 * Versão mais simples para uso em rotas de listagem.
 */
export function findTorrent(torrents: any[], download: { hash?: string; title?: string }): any | undefined {
  // Match por hash primeiro (mais preciso e rápido) - case-insensitive
  if (download.hash) {
    const dlHash = download.hash.toLowerCase();
    const byHash = torrents.find((tr: any) => tr.hash?.toLowerCase() === dlHash);
    if (byHash) return byHash;
  }

  // Fallback: match por título normalizado
  if (download.title) {
    return findTorrentByTitle(torrents, download.title);
  }

  return undefined;
}
