// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Fila de conversão pós-download (P6): converte mídia incompatível com web
// (HEVC/TrueHD/MKV etc.) em background, com concorrência limitada para não
// saturar o Xeon, e expõe o status para o player/usuário. NUNCA transcode on-demand.
import { spawn, spawnSync } from 'child_process';
import { existsSync, statSync, unlinkSync } from 'fs';
import { basename, extname, join } from 'path';
import { Download } from '../models/Download';
import { Movie } from '../models/Movie';
import { Series } from '../models/Series';
import { logger } from '../utils/logger';

const COMPONENT = 'ConversionQueue';

const TRANSCODE_DIR = '/media/transcode';
const MEDIA_ROOTS = ['/media/movies', '/media/series', '/downloads', '/media/transcode'];
const MAX_RETRIES = parseInt(process.env.CONVERSION_MAX_RETRIES || '2', 10);
const CONCURRENCY = Math.max(1, parseInt(process.env.CONVERSION_CONCURRENCY || '1', 10));
const TRANSCODE_PRESET = process.env.TRANSCODE_PRESET || 'veryfast';
const TRANSCODE_CRF = process.env.TRANSCODE_CRF || '25';
const TRANSCODE_THREADS = process.env.TRANSCODE_THREADS || '4';
const INCOMPATIBLE_VIDEO = ['hevc', 'h265', 'av1', 'vp9'];
const INCOMPATIBLE_AUDIO = ['ac3', 'eac3', 'ac 3', 'ac eac3', 'dts', 'truehd', 'dts-hd'];

function getProbeData(filePath: string): any | null {
  try {
    const result = spawnSync('/usr/lib/jellyfin-ffmpeg/ffprobe', [
      '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath,
    ], { timeout: 10000, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    if (result.status !== 0 || !result.stdout) return null;
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function needsTranscoding(filePath: string): { needed: boolean; reason: string; data: any } {
  const data = getProbeData(filePath);
  if (!data) {
    const ext = extname(filePath).toLowerCase();
    const compatible = ['.mp4', '.webm', '.mov'].includes(ext);
    return { needed: !compatible, reason: compatible ? 'probe unavailable, assuming compatible' : `unable to probe (container ${ext})`, data: null };
  }
  const videoStream = data.streams.find((s: any) => s.codec_type === 'video');
  const audioStream = data.streams.find((s: any) => s.codec_type === 'audio');
  const videoCodec = videoStream?.codec_name;
  const audioCodec = audioStream?.codec_name;
  const ext = extname(filePath).toLowerCase();
  const videoIncompatible = videoCodec && INCOMPATIBLE_VIDEO.some(c => videoCodec.toLowerCase().includes(c));
  const audioIncompatible = audioCodec && INCOMPATIBLE_AUDIO.some(c => audioCodec.toLowerCase().includes(c));
  const extIncompatible = ['.mkv', '.avi', '.ts'].includes(ext);
  const isAlreadyCompatible = ext === '.mp4' && videoCodec === 'h264' && audioCodec && ['aac', 'mp3'].includes(audioCodec.toLowerCase()) && !videoIncompatible && !audioIncompatible && !extIncompatible;
  if (isAlreadyCompatible) return { needed: false, reason: 'Already compatible MP4 H.264/AAC', data };
  const reasons = [];
  if (videoIncompatible) reasons.push(`video codec: ${videoCodec}`);
  if (audioIncompatible) reasons.push(`audio codec: ${audioCodec}`);
  if (extIncompatible) reasons.push(`container: ${ext}`);
  return { needed: reasons.length > 0, reason: reasons.join(', ') || 'Incompatible format', data };
}

function getTranscodedPath(originalPath: string): string {
  const baseName = basename(originalPath, extname(originalPath));
  const safeName = baseName.replace(/[^a-zA-Z0-9\-_.]/g, '_');
  return join(TRANSCODE_DIR, `${safeName}.mp4`);
}

async function transcodeFile(sourcePath: string, outputPath: string, onProgress?: (pct: number) => void): Promise<void> {
  const tempOutput = `${outputPath}.tmp`;
  const data = getProbeData(sourcePath);
  const ffmpegArgs: string[] = ['-i', sourcePath, '-threads', TRANSCODE_THREADS, '-map', '0:v:0', '-map', '0:a:0', '-sn'];
  const videoStream = data?.streams?.find((s: any) => s.codec_type === 'video');
  const audioStream = data?.streams?.find((s: any) => s.codec_type === 'audio');
  const copyVideo = videoStream?.codec_name?.toLowerCase() === 'h264' && !/10le|10be|12le|12be/.test(videoStream?.pix_fmt || '');
  if (copyVideo) {
    ffmpegArgs.push('-c:v', 'copy');
  } else {
    ffmpegArgs.push('-c:v', 'libx264', '-preset', TRANSCODE_PRESET, '-crf', TRANSCODE_CRF, '-pix_fmt', 'yuv420p', '-g', '25', '-keyint_min', '25');
  }
  if (audioStream) {
    ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
  }
  ffmpegArgs.push('-movflags', '+faststart', tempOutput);
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    ffmpeg.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        try { require('fs').renameSync(tempOutput, outputPath); resolve(); }
        catch (e: any) { reject(new Error(`rename failed: ${e.message}`)); }
      } else {
        try { require('fs').unlinkSync(tempOutput); } catch { /* noop — temp já foi removido */ }
        reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().split('\n').slice(-2).join(' | ')}`));
      }
    });
    ffmpeg.on('error', (err) => reject(err));
  });
}

async function transcodeToMp4(sourcePath: string, outputPath?: string, onProgress?: (pct: number) => void): Promise<string> {
  const targetPath = outputPath || getTranscodedPath(sourcePath);
  await transcodeFile(sourcePath, targetPath, onProgress);
  return targetPath;
}

type ConversionState =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed';

interface QueueItem {
  mediaId: string;
  mediaType: 'movie' | 'series';
  filePath: string;
  state: ConversionState;
  progress: number;
  retries: number;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

function relativeToRoot(filePath: string): string | null {
  for (const root of MEDIA_ROOTS) {
    if (filePath.startsWith(root)) {
      return filePath.replace(root, '').replace(/^[/\\]+/, '').replace(/\\/g, '/');
    }
  }
  return null;
}

class ConversionQueueServiceImpl {
  // Chave da fila: "mediaId::filePath" — para séries, cada episódio é um item
  // (varios arquivos podem compartilhar o mesmo mediaId da série).
  private queue: Map<string, QueueItem> = new Map();
  private running = 0;
  private started = false;

  private keyFor(mediaId: string, filePath?: string): string {
    return `${mediaId}::${filePath || ''}`;
  }

  async ensureStarted(): Promise<void> {
    if (this.started) return;
    this.started = true;
    // Retoma conversões interrompidas por restart (downloading/criadas antes de restart)
    try {
      const pending = await Download.find({
        conversionStatus: { $in: ['queued', 'running'] },
      });
      for (const dl of pending) {
        const key = this.keyFor(dl.mediaId);
        if (!this.queue.has(key)) {
          // Tenta resolver o path do arquivo — se não existir, marca como failed
          const resolved = await this.resolveFilePath(dl.mediaId, dl.mediaType);
          if (!resolved || !existsSync(resolved)) {
            logger.warn(COMPONENT, `Skipping restore: arquivo não encontrado para ${dl.mediaId}`);
            await this.persist(dl.mediaId, 'failed', 0);
            continue;
          }
          this.queue.set(key, {
            mediaId: dl.mediaId,
            mediaType: dl.mediaType,
            filePath: resolved,
            state: 'queued',
            progress: dl.conversionProgress || 0,
            retries: 0,
          });
        }
      }
      if (pending.length > 0) {
        logger.info(COMPONENT, `Resuming ${pending.length} pending conversions from DB`);
      }
    } catch (err) {
      logger.warn(COMPONENT, `Failed to restore pending conversions: ${(err as Error).message}`);
    }
    this.pump();
  }

  /** Agenda (ou retorna o estado de) uma conversão para um arquivo. Dedup por mediaId+filePath. */
  enqueue(mediaId: string, mediaType: 'movie' | 'series', filePath: string): ConversionState {
    const key = this.keyFor(mediaId, filePath);
    const existing = this.queue.get(key);
    if (existing && (existing.state === 'queued' || existing.state === 'running')) {
      // Atualiza o path se veio vazio (restore de DB)
      if (!existing.filePath && filePath) existing.filePath = filePath;
      return existing.state;
    }

    this.queue.set(key, {
      mediaId,
      mediaType,
      filePath,
      state: 'queued',
      progress: 0,
      retries: 0,
    });
    this.persist(mediaId, 'queued', 0).catch(() => {});
    logger.info(COMPONENT, `Conversion queued: ${mediaType} ${mediaId} (${basename(filePath)})`);
    this.pump();
    return 'queued';
  }

  /** Status agregado por mediaId (pode haver vários arquivos/episódios). */
  getStatus(mediaId: string): { conversionStatus: string; progress: number; error?: string } {
    const items = [...this.queue.values()].filter((i) => i.mediaId === mediaId);
    if (items.length === 0) return { conversionStatus: 'none', progress: 0 };

    const active = items.find((i) => i.state === 'queued' || i.state === 'running');
    if (active) {
      return {
        conversionStatus: active.state,
        progress: active.progress,
        ...(active.error ? { error: active.error } : {}),
      };
    }
    const done = items.some((i) => i.state === 'done');
    if (done) {
      return { conversionStatus: 'done', progress: 100 };
    }
    const failed = items.find((i) => i.state === 'failed');
    return {
      conversionStatus: 'failed',
      progress: failed?.progress || 0,
      ...(failed?.error ? { error: failed.error } : {}),
    };
  }

  /**
   * Agenda conversão a partir de um path absoluto no disco (usado no gating do
   * stream quando o arquivo não é web-compatível). Resolve a mídia por root/path.
   */
  async enqueueByPath(
    filePath: string
  ): Promise<{ conversionStatus: string; progress: number; mediaId?: string }> {
    // Já convertido? O arquivo em /media/transcode é o resultado da conversão.
    if (filePath.startsWith(TRANSCODE_DIR)) {
      const media = await this.findMediaByPath(filePath);
      if (media) return { conversionStatus: 'done', progress: 100, mediaId: media.mediaId };
      return { conversionStatus: 'done', progress: 100 };
    }

    const media = await this.findMediaByPath(filePath);
    if (media) {
      const state = this.enqueue(media.mediaId, media.mediaType, filePath);
      return { conversionStatus: state, progress: 0, mediaId: media.mediaId };
    }
    return { conversionStatus: 'none', progress: 0 };
  }

  private async findMediaByPath(
    filePath: string
  ): Promise<{ mediaId: string; mediaType: 'movie' | 'series' } | null> {
    const rel = relativeToRoot(filePath);
    if (!rel) return null;

    const exact = async () => {
      const m = await Movie.findOne({ path: rel });
      if (m) return { mediaId: m._id.toString(), mediaType: 'movie' as const };
      const s = await Series.findOne({ path: rel });
      if (s) return { mediaId: s._id.toString(), mediaType: 'series' as const };
      return null;
    };

    if (filePath.startsWith('/media/movies')) {
      const hit = await exact();
      if (hit) return hit;
    } else if (filePath.startsWith('/media/series')) {
      const hit = await exact();
      if (hit) return hit;
      // Episódio dentro de uma série: o path do DB é a pasta da série.
      // Ex.: arquivo "SerieName/Season 01/ep1.mkv" → procura série com path
      // igual ao primeiro segmento (regex escape para folder com caracteres especiais).
      const firstSegment = rel.split('/')[0];
      if (firstSegment) {
        const series = await Series.findOne({
          path: { $regex: `^${firstSegment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|$)` },
        });
        if (series) return { mediaId: series._id.toString(), mediaType: 'series' };
      }
    }

    // Fallback: procura em ambos os modelos (ex.: /downloads em 1º scan)
    const hit = await exact();
    if (hit) return hit;

    const firstSegment = rel.split('/')[0];
    if (firstSegment) {
      const series = await Series.findOne({
        path: { $regex: `^${firstSegment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|$)` },
      });
      if (series) return { mediaId: series._id.toString(), mediaType: 'series' };
    }
    return null;
  }

  private pump(): void {
    if (!this.started) return;
    if (this.running >= CONCURRENCY) return;

    let startedOne = false;
    for (const [key, item] of this.queue) {
      if (item.state !== 'queued') continue;
      if (this.running >= CONCURRENCY) break;
      this.running++;
      item.state = 'running';
      item.startedAt = Date.now();
      startedOne = true;
      this.persist(item.mediaId, 'running', item.progress).catch(() => {});
      this.runItem(key, item).finally(() => {
        this.running--;
        this.pump();
      });
    }
    if (!startedOne && this.running === 0) {
      // Nada em execução e nada na fila — fila ociosa
      logger.info(COMPONENT, 'Conversion queue idle');
    }
  }

  private async runItem(key: string, item: QueueItem): Promise<void> {
    try {
      if (!item.filePath || !existsSync(item.filePath)) {
        // Tenta redescobrir o arquivo a partir do registro no banco
        const found = await this.resolveFilePath(item.mediaId, item.mediaType);
        if (!found || !existsSync(found)) {
          throw new Error('arquivo não encontrado para conversão');
        }
        item.filePath = found;
      }

      const probe = needsTranscoding(item.filePath);
      if (!probe.data) {
        throw new Error('arquivo ilegível pelo ffprobe (corrompido/incompleto)');
      }
      if (!probe.needed) {
        logger.info(COMPONENT, `Já compatível, sem conversão: ${basename(item.filePath)}`);
        item.state = 'done';
        item.progress = 100;
        this.persist(item.mediaId, 'done', 100).catch(() => {});
        return;
      }

      logger.info(COMPONENT, `Convertendo ${basename(item.filePath)} (${probe.reason})`);
      const outputPath = await transcodeToMp4(item.filePath, undefined, (pct) => {
        item.progress = pct;
        this.persist(item.mediaId, 'running', pct).catch(() => {});
      });

      // Atualiza o path no banco para o arquivo convertido (relativo ao /media/transcode)
      const rel = relativeToRoot(outputPath);
      if (rel) {
        if (item.mediaType === 'movie') {
          await Movie.findByIdAndUpdate(item.mediaId, { path: rel, status: 'available' });
        } else {
          await Series.findByIdAndUpdate(item.mediaId, { path: rel, status: 'available' });
        }
        logger.info(COMPONENT, `Path atualizado para ${mediaTypeLabel(item.mediaType)} ${item.mediaId}: ${rel}`);
      }

      // Não apaga o original quando ele ainda é dado do qBittorrent (seeding).
      // Fora de /downloads (ex.: cópia organizada em /media), remove para não
      // duplicar espaço.
      if (outputPath !== item.filePath && !item.filePath.startsWith('/downloads')) {
        try {
          unlinkSync(item.filePath);
          logger.info(COMPONENT, `Original removido após conversão: ${basename(item.filePath)}`);
        } catch (err: any) {
          logger.warn(COMPONENT, `Não foi possível remover original: ${err.message}`);
        }
      }

      item.state = 'done';
      item.progress = 100;
      item.finishedAt = Date.now();
      await this.persist(item.mediaId, 'done', 100);
      logger.info(COMPONENT, `Conversão concluída: ${basename(outputPath)}`);
    } catch (err: any) {
      item.retries++;
      item.error = err.message;
      if (item.retries <= MAX_RETRIES) {
        logger.warn(COMPONENT, `Conversão falhou (tentativa ${item.retries}/${MAX_RETRIES}): ${err.message}`);
        item.state = 'queued';
        // Backoff simples; pump() retomará na próxima rodada
        setTimeout(() => this.pump(), 30_000 * item.retries);
      } else {
        item.state = 'failed';
        item.finishedAt = Date.now();
        await this.persist(item.mediaId, 'failed', item.progress);
        logger.error(COMPONENT, `Conversão definitivamente falhou para ${item.mediaId}: ${err.message}`);
      }
    }
  }

  private async resolveFilePath(
    mediaId: string,
    mediaType: 'movie' | 'series'
  ): Promise<string | null> {
    const media =
      mediaType === 'movie'
        ? await Movie.findById(mediaId)
        : await Series.findById(mediaId);
    if (!media || !media.path) return null;
    for (const root of MEDIA_ROOTS) {
      const candidate = join(root, String(media.path));
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
      } catch {
        /* continue */
      }
    }
    return null;
  }

  private async persist(
    mediaId: string,
    status: string,
    progress: number
  ): Promise<void> {
    try {
      await Download.updateMany(
        { mediaId },
        { conversionStatus: status, conversionProgress: progress }
      );
    } catch (err) {
      logger.warn(COMPONENT, `Falha ao persistir status de conversão: ${(err as Error).message}`);
    }
  }
}

function mediaTypeLabel(t: 'movie' | 'series'): string {
  return t === 'movie' ? 'movie' : 'series';
}

export const ConversionQueueService = new ConversionQueueServiceImpl();
export { TRANSCODE_DIR };
