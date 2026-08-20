// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// MediaPostProcessorService — Pré-conversão de arquivos de mídia (Zero Delay).
//
// Função: assim que um arquivo chega ao disco (via qBittorrent ou import do
// Radarr/Sonarr), este serviço:
//   1. Usa ffprobe para detectar a codecagem real (vídeo/áudio/contêiner).
//   2. Se o arquivo já é H.264+AAC+MP4 compatível com navegador, pula.
//   3. Senão, spawna o ffmpeg EM BACKGROUND e converte para:
//        -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p
//        -vf "scale=-2:min(1080,ih):force_original_aspect_ratio=decrease,pad=..."
//        -c:a aac -b:a 192k -ac 2
//        -movflags +faststart
//   4. Grava em arquivo temporário (.mp4.tmp) NA MESMA PASTA do original.
//   5. Ao finalizar com sucesso (exit 0):
//        - unlinkSync(original)
//        - renameSync(temp -> final .mp4)
//        - Atualiza o path no DB (Movie/Series) para o novo arquivo.
//
// Projeto: DIRECT PLAY — o StreamingService é um servidor estático puro
// (206 byte-range). Nenhum transcoding on-the-fly. O arquivo no disco é
// SEMPRE compatível antes do play começar.

import { spawn } from 'child_process';
import { existsSync, renameSync, statSync, unlinkSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { Movie } from '../models/Movie';
import { Series } from '../models/Series';
import { logger } from '../utils/logger';

const COMPONENT = 'MediaPostProcessor';

// Parâmetros do ffmpeg para conversão de pré-processamento (estáveis, sem retry
// agressivo — arquivos grandes podem levar minutos).
const PRESET = process.env.POSTPROCESS_PRESET || 'fast';
const CRF = process.env.POSTPROCESS_CRF || '23';
const AUDIO_BITRATE = process.env.POSTPROCESS_AUDIO_BITRATE || '192k';
const MAX_THREADS = parseInt(process.env.POSTPROCESS_THREADS || '8', 10);
// Hardware acceleration: VAAPI para AMD GPUs (radeonsi driver)
// AMF não funciona no Linux, Vulkan RADV não expõe video encode
const HWACCEL = (process.env.POSTPROCESS_HWACCEL || 'vaapi').toLowerCase();
// Codec de saída: h264_vaapi (VAAPI) ou libx264 (CPU fallback)
const VIDEO_CODEC = HWACCEL === 'vaapi' ? 'h264_vaapi' : 'libx264';
const INCOMPATIBLE_VIDEO = ['hevc', 'h265', 'av1', 'vp9'];
const INCOMPATIBLE_AUDIO = ['ac3', 'eac3', 'dts', 'truehd', 'dts-hd'];

interface ProbeData {
  streams: any[];
  format?: { duration?: string };
}

function probeFile(filePath: string): ProbeData | null {
  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync('/usr/lib/jellyfin-ffmpeg/ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ], {
      timeout: 15000,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.status !== 0 || !result.stdout) return null;
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/** Retorna true se o arquivo já é web-compatible (H.264/AAC/MP4). */
function isWebCompatible(probe: ProbeData): boolean {
  const videoStream = probe.streams.find((s: any) => s.codec_type === 'video');
  const audioStream = probe.streams.find((s: any) => s.codec_type === 'audio');
  const videoCodec = (videoStream?.codec_name || '').toLowerCase();
  const audioCodec = (audioStream?.codec_name || '').toLowerCase();

  // H.264 com pixel format 10-bit não é compatível com navegadores
  const is10bit = videoCodec === 'h264' && /10le|10be|12le|12be/.test(videoStream?.pix_fmt || '');

  return (
    extname(probe.streams[0]?.filename || '').toLowerCase() === '.mp4' &&
    videoCodec === 'h264' &&
    !is10bit &&
    !INCOMPATIBLE_VIDEO.some(c => videoCodec.includes(c)) &&
    !INCOMPATIBLE_AUDIO.some(c => (audioCodec || '').includes(c)) &&
    ['aac', 'mp3'].includes(audioCodec)
  );
}

/** Extrai resolução do vídeo para decidir se precisa downscale. */
function getMaxResolution(probe: ProbeData): number {
  const videoStream = probe.streams.find((s: any) => s.codec_type === 'video');
  const w = parseInt(String(videoStream?.width || 0), 10);
  const h = parseInt(String(videoStream?.height || 0), 10);
  return Math.max(w, h);
}

interface ProcessResult {
  success: boolean;
  skipped: boolean;
  reason?: string;
  error?: string;
}

export const MediaPostProcessorService = {
  /**
   * Processa um arquivo de mídia já no disco: detecta compatibilidade e, se
   * necessário, converte EM BACKGROUND (spawn único, não bloqueante). O path
   * no DB é atualizado automaticamente após a conversão.
   *
   * `filePath` pode ser um path absoluto ou relativo (resolve contra MEDIA_ROOTS).
   */
  async process(
    filePath: string,
    mediaId?: string,
    mediaType?: 'movie' | 'series'
  ): Promise<ProcessResult> {
    // Resolve path absoluto
    const resolved = resolveAbsolutePath(filePath);
    if (!resolved || !existsSync(resolved)) {
      return { success: false, skipped: false, reason: 'arquivo não encontrado', error: resolved ? 'file not found on disk' : 'invalid path' };
    }

    const probe = probeFile(resolved);
    if (!probe) {
      return { success: false, skipped: false, reason: 'ffprobe failed', error: 'arquivo ilegível pelo ffprobe (corrompido?)' };
    }

    if (isWebCompatible(probe)) {
      logger.info(COMPONENT, `Arquivo já compatível, pulando: ${basename(resolved)}`);
      return { success: true, skipped: true, reason: 'já compatível' };
    }

    // Arquivo incompatível → spawn ffmpeg em background (sem await).
    // O processo é detached: se o processo pai morrer, o ffmpeg continua.
    spawnFfmpegConversion(resolved, probe, mediaId, mediaType).catch((err: Error) => {
      logger.error(COMPONENT, `Failed to spawn post-processing: ${err.message}`);
    });

    logger.info(COMPONENT, `Post-processing spawned for ${basename(resolved)} (incompatible: ${probe.streams.find((s: any) => s.codec_type === 'video')?.codec_name}/${probe.streams.find((s: any) => s.codec_type === 'audio')?.codec_name})`);
    return { success: true, skipped: false, reason: 'conversão em background' };
  },
};

/** Spawna ffmpeg em background (detached) para converter o arquivo. */
function spawnFfmpegConversion(
  sourcePath: string,
  probe: ProbeData,
  mediaId?: string,
  mediaType?: 'movie' | 'series'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const videoStream = probe.streams.find((s: any) => s.codec_type === 'video');
    const audioStream = probe.streams.find((s: any) => s.codec_type === 'audio');
    const srcW = parseInt(String(videoStream?.width || 0), 10);
    const srcH = parseInt(String(videoStream?.height || 0), 10);
    const maxRes = Math.max(srcW, srcH);

    // Filtro de escala: downscale para 1080p se > 1080, senão mantém.
    // Para vídeos com largura > 1920 ou altura > 1080, faz scale + pad.
    // Para vídeos já dentro dos limites (ex: 1920x800), mantém original.
    let scaleFilter = 'scale=-2:-2';
    if (srcW > 1920 || srcH > 1080) {
      // Need to downscale
      if (srcW > 1920) {
        scaleFilter = 'scale=1920:-2:force_original_aspect_ratio=decrease';
      } else if (srcH > 1080) {
        scaleFilter = 'scale=-2:1080:force_original_aspect_ratio=decrease';
      }
      // After scaling, pad if needed to reach 1920x1080
      scaleFilter += ',pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
    }

    const destDir = dirname(sourcePath);
    // Usa hash do path para evitar problemas com caracteres especiais/espaços no nome
    const pathHash = require('crypto').createHash('md5').update(sourcePath).digest('hex').slice(0, 8);
    const tempPath = join(destDir, `.tmp_${pathHash}.mp4`);
    const finalPath = join(destDir, `${basename(sourcePath, extname(sourcePath))}.mp4`);

    // Build ffmpeg args with VAAPI hardware acceleration
    const ffmpegArgs: string[] = [];
    // VAAPI precisa de -hwaccel + -hwaccel_device + -hwaccel_output_format vaapi
    ffmpegArgs.push('-hwaccel', 'vaapi');
    ffmpegArgs.push('-hwaccel_device', '/dev/dri/renderD128');
    ffmpegArgs.push('-hwaccel_output_format', 'vaapi');
    ffmpegArgs.push('-y', '-i', sourcePath);
    ffmpegArgs.push('-vaapi_device', '/dev/dri/renderD128');
    ffmpegArgs.push('-map', '0:v:0', '-map', '0:a:0', '-sn');

    // Limitar threads para não sobrecarregar o sistema
    if (MAX_THREADS > 0) {
      ffmpegArgs.push('-threads', String(MAX_THREADS));
    }

    if (VIDEO_CODEC === 'h264_vaapi') {
      // VAAPI: use quality-based rate control (qp) instead of fixed bitrate.
      // qp 30 ≈ libx264 CRF 28 → ~1-2GB for 2hr movie (vs 6GB with old 6000k).
      ffmpegArgs.push('-c:v', 'h264_vaapi');
      if (srcW > 1920 || srcH > 1080) {
        const scaleFilterVAAPI = maxRes > 1080
          ? 'hwupload,scale_vaapi=w=1920:h=-2:flags=lanczos,hwdownload,format=nv12'
          : 'hwupload,hwdownload,format=nv12';
        ffmpegArgs.push('-vf', scaleFilterVAAPI);
      }
      ffmpegArgs.push('-qp', '30');
    } else {
      // CPU fallback: libx264
      ffmpegArgs.push('-c:v', 'libx264');
      ffmpegArgs.push('-preset', PRESET);
      ffmpegArgs.push('-crf', CRF);
      ffmpegArgs.push('-pix_fmt', 'yuv420p');
      if (srcW > 1920 || srcH > 1080) {
        ffmpegArgs.push('-vf', scaleFilter);
      }
      ffmpegArgs.push('-g', '25', '-keyint_min', '25');
    }

    ffmpegArgs.push('-c:a', 'aac', '-b:a', AUDIO_BITRATE, '-ar', '48000');
    ffmpegArgs.push('-ac', String(audioStream ? (audioStream.ch_layouts === '5.1(side)' ? 6 : 2) : 2));
    ffmpegArgs.push('-af', 'aresample=async=1');
    ffmpegArgs.push('-movflags', '+faststart+frag_keyframe+empty_moov');
    ffmpegArgs.push(tempPath);

    const accelLabel = HWACCEL === 'vaapi' ? 'VAAPI' : 'CPU';
    logger.info(COMPONENT, `ffmpeg start: ${basename(sourcePath)} -> ${basename(finalPath)} (${accelLabel}/${VIDEO_CODEC}, ${srcW}x${srcH} ${maxRes > 1080 ? '→ 1080p' : '→ native'})`);

    const ffmpeg = spawn('/usr/lib/jellyfin-ffmpeg/ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: true, // permite que o ffmpeg continue rodando mesmo se o node sair
    });

    // Desancla o processo para ele continuar após o exit do parent
    ffmpeg.unref();

    let stderr = '';
    ffmpeg.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const cleanup = (deleteTemp = true) => {
      if (deleteTemp && existsSync(tempPath)) {
        try { unlinkSync(tempPath); } catch { /* ignore */ }
      }
    };

    ffmpeg.on('error', (err) => {
      logger.error(COMPONENT, `ffmpeg spawn error: ${err.message}`);
      cleanup();
      reject(new Error(`ffmpeg spawn error: ${err.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code === 0 && existsSync(tempPath)) {
        try {
          // ── Validação obrigatória antes de deletar o original ──────────
          // O ffmpeg pode sair com exit 0 mesmo com saída corrompida
          // (moov atom ausente, disco cheio, sinal interrompeu, etc.)
          const tempStats = statSync(tempPath);
          if (tempStats.size === 0) {
            logger.error(COMPONENT, `Output file is empty after conversion — keeping original`);
            cleanup();
            reject(new Error('Output file empty'));
            return;
          }

          // Verificar se o arquivo de saída é legível (moov atom existe)
          const outProbe = probeFile(tempPath);
          if (!outProbe) {
            logger.error(COMPONENT, `Output file unreadable by ffprobe (moov atom missing?) — keeping original. Source: ${basename(sourcePath)} (${(statSync(sourcePath).size / 1024 / 1024).toFixed(0)}MB) → Output: ${basename(tempPath)} (${(tempStats.size / 1024 / 1024).toFixed(0)}MB)`);
            cleanup();
            reject(new Error('Output file unreadable — moov atom missing'));
            return;
          }

          // Verificar duração razoável (saída deve ter ≥80% da duração do original)
          const srcDuration = parseFloat(String(probe.format?.duration || '0'));
          const outDuration = parseFloat(String(outProbe.format?.duration || '0'));
          if (srcDuration > 0 && outDuration > 0 && outDuration < srcDuration * 0.8) {
            logger.error(COMPONENT, `Output duration too short (${outDuration.toFixed(0)}s vs source ${srcDuration.toFixed(0)}s) — keeping original. File: ${basename(sourcePath)}`);
            cleanup();
            reject(new Error(`Output duration mismatch: ${outDuration.toFixed(0)}s < 80% of ${srcDuration.toFixed(0)}s`));
            return;
          }

          // Tamanho mínimo: saída deve ter ≥10% do tamanho do original
          // VAAPI pode comprimir 5-6x (ex: 5.5GB → 1.2GB) — 10% é seguro
          const srcSize = existsSync(sourcePath) ? statSync(sourcePath).size : 0;
          if (srcSize > 0 && tempStats.size < srcSize * 0.10) {
            logger.error(COMPONENT, `Output too small (${(tempStats.size / 1024 / 1024).toFixed(0)}MB vs source ${(srcSize / 1024 / 1024).toFixed(0)}MB) — keeping original`);
            cleanup();
            reject(new Error(`Output size mismatch: ${(tempStats.size / 1024 / 1024).toFixed(0)}MB < 10% of ${(srcSize / 1024 / 1024).toFixed(0)}MB`));
            return;
          }

          // Tamanho máximo: saída NÃO pode ser maior que o original
          // (se acontecer, a conversão não compressionou — manter original)
          if (srcSize > 0 && tempStats.size > srcSize * 1.05) {
            logger.warn(COMPONENT, `Output larger than source (${(tempStats.size / 1024 / 1024).toFixed(0)}MB > ${(srcSize / 1024 / 1024).toFixed(0)}MB) — keeping original`);
            cleanup();
            reject(new Error(`Output too large: ${(tempStats.size / 1024 / 1024).toFixed(0)}MB > ${(srcSize / 1024 / 1024).toFixed(0)}MB source`));
            return;
          }

          logger.info(COMPONENT, `Output validated: ${basename(finalPath)} (${(tempStats.size / 1024 / 1024).toFixed(0)}MB, ${outDuration.toFixed(0)}s)`);

          // ── Validação OK → substituição atômica ─────────────────────
          if (existsSync(sourcePath)) unlinkSync(sourcePath);
          renameSync(tempPath, finalPath);

          logger.info(COMPONENT, `Post-processing complete: ${basename(finalPath)}`);

          // Atualiza o DB com o novo path (relativo)
          if (mediaId && mediaType) {
            updateDbPath(mediaId, mediaType, finalPath).catch((err: Error) => {
              logger.warn(COMPONENT, `DB path update failed: ${err.message}`);
            });
          }

          resolve();
        } catch (err: any) {
          logger.error(COMPONENT, `Atomic rename failed: ${err.message}`);
          cleanup(false); // deixa o temp para debugging
          reject(new Error(`Atomic rename failed: ${err.message}`));
        }
      } else {
        logger.error(COMPONENT, `ffmpeg exited with code ${code}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`);
        cleanup();
        reject(new Error(`ffmpeg exited ${code}`));
      }
    });
  });
}

async function updateDbPath(mediaId: string, mediaType: 'movie' | 'series', absolutePath: string): Promise<void> {
  const rel = relativeToRoot(absolutePath);
  if (!rel) return;
  if (mediaType === 'movie') {
    await Movie.findByIdAndUpdate(mediaId, { path: rel, status: 'available' });
  } else {
    await Series.findByIdAndUpdate(mediaId, { path: rel, status: 'available' });
  }
  logger.info(COMPONENT, `DB updated ${mediaType} ${mediaId} → ${rel}`);
}

function relativeToRoot(filePath: string): string | null {
  const roots = ['/media/movies', '/media/series', '/downloads', '/media/transcode'];
  for (const root of roots) {
    if (filePath.startsWith(root)) {
      return filePath.replace(root, '').replace(/^[/\\]+/, '').replace(/\\/g, '/');
    }
  }
  return null;
}

function resolveAbsolutePath(input: string): string | null {
  if (!input) return null;
  const roots = ['/media/movies', '/media/series', '/downloads', '/media/transcode'];
  for (const root of roots) {
    const candidate = join(root, input.replace(/^[/\\]+/, ''));
    if (existsSync(candidate)) return candidate;
  }
  // Já é absoluto?
  if (input.startsWith('/')) return input;
  return null;
}
