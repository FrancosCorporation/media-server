// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
/**
 * Transcrição YouTube via Backend
 *
 * Todos os requests passam pelo backend /api/proxy/media-transcript
 * para evitar CORS. O backend usa yt-dlp para extrair legendas.
 *
 * A API innertube do YouTube NÃO aceita requests cross-origin
 * do navegador — não há como fazer isso 100% no frontend.
 */

/**
 * Extrai o videoId de uma URL do YouTube.
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Busca transcrição de um vídeo do YouTube via backend.
 */
export async function fetchYouTubeTranscript(
  url: string,
  lang: string = 'pt'
): Promise<{ text: string; title: string; language: string }> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('URL do YouTube inválida');
  }

  const res = await fetch('/api/proxy/media-transcript', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, lang }),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || `Erro HTTP ${res.status} ao obter transcrição`);
  }

  return {
    text: data.text || '',
    title: data.title || `Vídeo ${videoId}`,
    language: data.language || lang,
  };
}

/**
 * Retorna thumbnail de um vídeo do YouTube.
 */
export function getYouTubeThumbnail(url: string): string | null {
  const videoId = extractVideoId(url);
  if (!videoId) return null;
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}
