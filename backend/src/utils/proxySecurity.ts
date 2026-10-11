// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere

export type ImageProxyKind = 'tmdb' | 'omdb' | 'media-cover';

export interface RasterImageType {
  contentType: string;
  extension: string;
}

const RASTER_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']);

export function sanitizeImagePath(value: string, kind: ImageProxyKind): string | null {
  const withoutQuery = value.split(/[?#]/, 1)[0];
  const decoded = withoutQuery.startsWith('/') ? withoutQuery.slice(1) : withoutQuery;
  let normalized: string;
  try {
    normalized = decodeURIComponent(decoded);
  } catch {
    return null;
  }

  if (
    !normalized ||
    normalized.length > 1024 ||
    normalized.includes('%') ||
    normalized.includes('\\') ||
    normalized.includes('\0')
  ) {
    return null;
  }

  const segments = normalized.split('/');
  if (
    segments.length > 8 ||
    segments.some((segment) =>
      !segment ||
      segment === '.' ||
      segment === '..' ||
      !/^[A-Za-z0-9._,-]+$/.test(segment),
    )
  ) {
    return null;
  }

  if (kind === 'media-cover') {
    if (/^MediaCoverProxy$/i.test(segments[0])) segments[0] = 'MediaCover';
    if (!/^MediaCover$/i.test(segments[0]) || segments.length < 2) return null;
  } else if (kind === 'tmdb') {
    if (!/^(?:w\d{2,3}|original)$/i.test(segments[0]) || segments.length < 2) return null;
  }

  const extension = segments[segments.length - 1].split('.').pop()?.toLowerCase() || '';
  if (!RASTER_EXTENSIONS.has(extension)) return null;
  return `/${segments.join('/')}`;
}

export function extractSafeImagePath(
  originalUrl: string,
  routePrefix: string,
  kind: ImageProxyKind,
): string | null {
  const requestPath = originalUrl.split(/[?#]/, 1)[0];
  const routeStart = `${routePrefix}/`;
  if (!requestPath.startsWith(routeStart)) return null;
  return sanitizeImagePath(requestPath.slice(routeStart.length), kind);
}

export function buildServiceUrl(baseUrl: string, resourcePath: string): URL {
  const base = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !resourcePath.startsWith('/')
  ) {
    throw new Error('URL de serviço inválida');
  }

  const basePath = base.pathname.replace(/\/+$/, '');
  return new URL(`${basePath}${resourcePath}`, base.origin);
}

export function detectRasterImageType(bytes: Buffer): RasterImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { contentType: 'image/png', extension: 'png' };
  }
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) {
    return { contentType: 'image/gif', extension: 'gif' };
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 4, 8) === 'ftyp' &&
    /^(?:avif|avis)$/.test(bytes.toString('ascii', 8, 12))
  ) {
    return { contentType: 'image/avif', extension: 'avif' };
  }
  return null;
}
