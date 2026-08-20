// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Download } from '../models/Download';
import { normalizeTitleForMatch } from './mediaOrganizer';
import { logger } from './logger';

const COMPONENT = 'Dedupe';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeKey(title: string): string {
  return normalizeTitleForMatch(title || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score de qualidade para deduplicação: mantém a melhor cópia.
 * 4K/2160p > 1080p > 720p > 480p > sem qualidade.
 */
export function qualityScore(quality?: string): number {
  if (!quality) return 0;
  const q = String(quality).toLowerCase();
  if (/(2160p|4k|uhd|8k|hdr10|dolbyvision)/.test(q)) return 400;
  if (/(1080p|1080|fhd|bluray)/.test(q)) return 300;
  if (/(720p|720|hdtv|web)/.test(q)) return 200;
  if (/(480p|480|sd|dvdrip)/.test(q)) return 100;
  return 0;
}

/**
 * Score de completude/qualidade para eleger o "keeper" numa deduplicação.
 * Prioridade: disponível no disco > qualidade > registro completo > mais recente.
 */
export function recordCompletenessScore(doc: any): number {
  let score = 0;
  score += doc.status === 'available' ? 100 : 0;
  score += qualityScore(doc.quality) / 10; // 0–40
  score += doc.path ? 20 : 0;
  score += doc.tmdbId || doc.tvdbId ? 15 : 0;
  score += doc.poster ? 10 : 0;
  score += doc.overview ? 10 : 0;
  score += new Date(doc.addedAt).getTime() / 1e12; // desempate: mais recente
  return score;
}

/**
 * Dedup estrita por Título + Ano (normalizados). Exige ano e um mínimo de
 * tokens para evitar falso positivo entre remakes/reboots de mesmo nome.
 * Retorna o registro existente ou null.
 */
export async function findExistingByTitleYear(
  model: any,
  title: string,
  year?: number
): Promise<any | null> {
  if (!title || !year) return null;

  const normalized = normalizeKey(title);
  if (normalized.length < 3) return null;

  const escaped = escapeRegExp(normalized);
  const exact = await model.findOne({
    year,
    title: { $regex: new RegExp(`^${escaped}$`, 'i') },
  });
  if (exact) return exact;

  // Fallback estrito: mesma palavra-chave (≥75% dos tokens) + mesmo ano
  const words = normalized.split(' ').filter((w) => w.length > 2);
  if (words.length < 2) return null;

  const candidates = await model.find({ year }).limit(100);
  const match = candidates.find((c: any) => {
    const cWords = normalizeKey(c.title).split(' ').filter((w) => w.length > 2);
    if (cWords.length === 0) return false;
    const common = words.filter((w) => cWords.includes(w)).length;
    return common / Math.min(words.length, cWords.length) >= 0.75;
  });
  return match || null;
}

interface UniqueDownloadParams {
  mediaId: string;
  mediaType: 'movie' | 'series';
  title: string;
  poster?: string;
  hash?: string;
  status?: 'queued' | 'downloading';
}

/**
 * Cria um download apenas se NÃO existir duplicata ativa.
 * Regras:
 *  - Mesmo mediaId + tipo com status ativo (queued/downloading) → bloqueia.
 *  - Série: mesmo título normalizado (temporadas viram "sN", então "X - Temporada 1"
 *    não colide com "X - Temporada 2") → bloqueia. Filmes dependem do mediaId
 *    (reboots de mesmo nome têm anos diferentes — evitar falso positivo).
 * Retorna o download criado (ou o existente quando há duplicata).
 */
export async function createDownloadIfUnique(
  params: UniqueDownloadParams
): Promise<any | null> {
  const { mediaId, mediaType, title } = params;

  const existingByMedia = await Download.findOne({
    mediaId,
    mediaType,
    status: { $in: ['queued', 'downloading'] },
  });
  if (existingByMedia) {
    logger.info(COMPONENT, `Download já ativo (mediaId) — ignorando: "${title}"`);
    return existingByMedia;
  }

  if (mediaType === 'series') {
    const normalized = normalizeKey(title);
    if (normalized.length >= 3) {
      const actives = await Download.find({
        mediaType,
        status: { $in: ['queued', 'downloading'] },
      });
      const dup = actives.find((d) => {
        const dn = normalizeKey(d.title);
        if (!dn) return false;
        return dn === normalized || dn.includes(normalized) || normalized.includes(dn);
      });
      if (dup) {
        logger.info(COMPONENT, `Download já ativo (título) — ignorando: "${title}" (≈ "${dup.title}")`);
        return dup;
      }
    }
  }

  const download = await Download.create({
    mediaId,
    mediaType,
    title,
    poster: params.poster || '',
    hash: params.hash,
    status: params.status || 'queued',
    progress: 0,
  });
  logger.info(COMPONENT, `Download criado: "${title}" (${mediaType}, ${mediaId})`);
  return download;
}
