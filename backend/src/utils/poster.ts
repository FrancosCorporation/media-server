// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
/**
 * Normaliza URL de poster/capa dos serviços (Radarr/Sonarr) para passar
 * pelo proxy do backend.
 *
 * Lida com:
 * - URLs relativas (/MediaCover/<id>/poster.jpg) → prefixa com /api/radarr-cover ou /api/sonarr-cover
 * - URLs internas (http://radarr:7878/MediaCover/<id>/poster.jpg) → extrai path e prefixa com proxy
 * - URLs externas (http/https de CDN como TMDB) → retorna como está
 * - URLs já proxificadas → retorna como está
 * - URLs malformadas (/MediaCover/<hash>/<file>.jpg) → retorna vazio para usar placeholder
 */
export function proxyCoverUrl(url: string | undefined | null, type: 'movie' | 'series'): string {
  if (!url) return '';

  // Normaliza /MediaCoverProxy/ → /MediaCover/ (Radarr/Sonarr não têm MediaCoverProxy)
  const normalized = url.replace(/MediaCoverProxy/g, 'MediaCover');

  // Detectar hash SHA256 (64 chars) em QUALQUER parte do path MediaCover
  // Se encontrar, NÃO proxyfiar - retorna vazio para usar fallback TMDB
  if (/\/MediaCover\/[a-f0-9]{64}\//i.test(normalized)) {
    return '';
  }

  // URLs que já passam por proxy com path correto — não modificar
  if (normalized.startsWith('/media-api/') || normalized.startsWith('/api/')) {
    // Retrocompat: normaliza /api/ para /media-api/
    return normalized.replace(/^\/api\//, '/media-api/');
  }

  // URL interna do serviço (http://radarr:7878/MediaCover/... ou http://sonarr:8989/MediaCover/...)
  // Deve vir ANTES da verificação de http genérico
  try {
    const parsed = new URL(normalized);
    if (parsed.pathname.startsWith('/MediaCover')) {
      const proxyPrefix = type === 'movie' ? '/media-api/radarr-cover' : '/media-api/sonarr-cover';
      return `${proxyPrefix}${parsed.pathname}`;
    }
  } catch { /* not a valid URL — continue to next checks */ }

  // URL relativa (/MediaCover/...)
  if (normalized.startsWith('/')) {
    const proxyPrefix = type === 'movie' ? '/media-api/radarr-cover' : '/media-api/sonarr-cover';
    return `${proxyPrefix}${normalized}`;
  }

  // TMDB images — proxy through our backend to avoid CORS
  if (normalized.startsWith('https://image.tmdb.org/t/p/')) {
    const imagePath = normalized.replace('https://image.tmdb.org/t/p/', '');
    return `/media-api/tmdb-image/${imagePath}`;
  }

  // OMDB/Amazon images — proxy through our backend (URLs are time-limited/CDN-protected)
  if (normalized.startsWith('https://m.media-amazon.com/images/')) {
    const imagePath = normalized.replace('https://m.media-amazon.com/images/', '');
    return `/media-api/omdb-image/${imagePath}`;
  }

  // URLs externas (http/https CDN como TMDB) — retorna como está
  if (normalized.startsWith('http')) return normalized;

  return url;
}

/**
 * Alias para compatibilidade retroativa.
 * Transforma URLs relativas de poster para passar pelo proxy do backend.
 */
export function fixPosterUrl(poster: string | undefined | null, type: 'movie' | 'series'): string {
  return proxyCoverUrl(poster, type);
}

/**
 * Aplica fixPosterUrl em todos os itens de um array.
 */
export function fixPosters<T extends { poster?: string }>(items: T[], type: 'movie' | 'series'): T[] {
  return items.map((item) => ({
    ...item,
    poster: proxyCoverUrl(item.poster, type),
  }));
}
