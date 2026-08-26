// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// MediaPostProcessorService — Pré-conversão de arquivos de mídia (Zero Delay).
//
// Função: assim que um arquivo chega ao disco (via qBittorrent ou import do
// Radarr/Sonarr), este serviço:
//   1. Usa ffprobe para detectar a codecagem real (vídeo/áudio/contêiner).
//   2. Se o arquivo já é H.264+AAC+MP4 compatível com navegador, pula.
//   3. Mede a complexidade real do conteúdo (PROBE CRF 21): amostra N trechos
//      do vídeo com x264/CPU em qualidade fixa — o bitrate que sai é quanto
//      o arquivo precisa. O alvo final é a PIOR cena medida (nunca quadricula).
//   4. Senão, spawna o ffmpeg EM BACKGROUND e converte para:
//        h264_vaapi VBR no bitrate medido (clampado em piso/teto)
//        -vf scale para 1080p se necessário
//        -c:a aac estéreo (-b:a 128k), áudio PT-BR preferido
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

import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, openSync, readSync, closeSync, renameSync, statSync, unlinkSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { Movie } from '../models/Movie';
import { Series } from '../models/Series';
import { logger } from '../utils/logger';

const COMPONENT = 'MediaPostProcessor';

// Parâmetros do ffmpeg para conversão de pré-processamento.
//
// ── MODOS DE ENCODE (POSTPROCESS_MODE) ──────────────────────────────────────
//  'noturno' (PADRÃO): x264/CPU preset slow em CRF fixo (25). Qualidade
//    ancorada — o encoder decide frame a frame quantos bits cada cena precisa
//    (VBR real: cena calma gasta migalha, pesada recebe o que exige). Dispensa
//    probe de complexidade. Calibração Ago/2026 (Matrix BDRip + Reacher WEB-DL,
//    11 cenas, SSIM vs fonte): CRF25 fica a ~0.002 de distância do CRF19
//    gastando ~4x menos bits; validado visualmente pelo dono nas duas fontes.
//  'vaapi': legado — GPU h264_vaapi VBR no bitrate medido pelo probe (p70/pior
//    cena). Rápido, mas ~2x menos eficiente por bit e quadricula cena pesada
//    quando bate no teto. Manter como fallback via POSTPROCESS_MODE=vaapi.
const MODE = (process.env.POSTPROCESS_MODE || 'noturno').toLowerCase();
const PRESET = process.env.POSTPROCESS_PRESET || 'veryfast'; // (vaapi/probe)
const X264_PRESET = process.env.POSTPROCESS_X264_PRESET || 'slow';
const CRF = process.env.POSTPROCESS_CRF || '25';              // alvo de qualidade (noturno)
const AUDIO_BITRATE = process.env.POSTPROCESS_AUDIO_BITRATE || '128k';
const MAX_THREADS = parseInt(process.env.POSTPROCESS_THREADS || '8', 10);
// Hardware acceleration (modo vaapi): VAAPI para AMD GPUs (radeonsi driver)
// AMF não funciona no Linux, Vulkan RADV não expõe video encode
const HWACCEL = (process.env.POSTPROCESS_HWACCEL || 'vaapi').toLowerCase();
// Codec de saída no modo vaapi
const VIDEO_CODEC = 'h264_vaapi';
// 2-pass VBR bitrate: por padrão o alvo é MEDIDO no conteúdo (probe CRF 21).
// Os valores fixos abaixo são apenas fallback quando o probe está desativado
// ou não consegue medir (duração desconhecida, todas as sondas falham, etc.).
// Validação empírica (Ago/2026): Matrix aceita ~1000k; WEB-DL de ação pede
// 4500-6000k — bitrate fixo ou quadricula cena pesada ou infla conteúdo leve.
const VAAPI_VIDEO_BITRATE = process.env.POSTPROCESS_VIDEO_BITRATE || '1200k';
const VAAPI_MAX_BITRATE = process.env.POSTPROCESS_MAX_BITRATE || '1500k';
const VAAPI_BUFSIZE = process.env.POSTPROCESS_BUFSIZE || '3000k';
// ── Probe adaptativo ────────────────────────────────────────────────────────
const ADAPTIVE_ENABLED = process.env.POSTPROCESS_ADAPTIVE !== '0'; // default ON
const PROBE_POINTS = Math.max(1, parseInt(process.env.POSTPROCESS_PROBE_POINTS || '5', 10));
const PROBE_SAMPLE_SEC = parseInt(process.env.POSTPROCESS_PROBE_SAMPLE || '30', 10);
const BITRATE_FLOOR = parseInt(process.env.POSTPROCESS_MIN_BITRATE || '600', 10);   // kbps
const BITRATE_CEIL = parseInt(process.env.POSTPROCESS_MAX_TARGET_BITRATE || '6000', 10); // kbps
// Concorrência máxima de conversões simultâneas.
// noturno (x264 slow/CPU) satura os cores sozinho → 1 job por vez, a menos que
// POSTPROCESS_CONCURRENCY seja definido explicitamente. vaapi (GPU) suporta
// multi-session → default 4.
const CONCURRENCY_ENV = process.env.POSTPROCESS_CONCURRENCY;
const MAX_CONCURRENT = Math.max(1, parseInt(CONCURRENCY_ENV || (MODE === 'noturno' ? '1' : '4'), 10));
let runningCount = 0;
const queue: Array<{
  sourcePath: string;
  probe: ProbeData;
  mediaId?: string;
  mediaType?: 'movie' | 'series';
  resolve: (v: void) => void;
  reject: (e: Error) => void;
}> = [];
const runningPaths = new Set<string>();
const INCOMPATIBLE_VIDEO = ['hevc', 'h265', 'av1', 'vp9'];
const INCOMPATIBLE_AUDIO = ['ac3', 'eac3', 'dts', 'truehd', 'dts-hd'];

interface ProbeData {
  streams: any[];
  format?: { duration?: string; bit_rate?: string };
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

const execFileAsync = promisify(execFile);

/**
 * Mede a complexidade real do conteúdo: amostra N trechos espalhados pelo
 * vídeo e re-codifica cada um com x264/CPU em CRF 23 (referência de qualidade
 * nível streaming — economia de ~25% vs CRF 21 com diferença imperceptível).
 * O bitrate resultante de cada sonda é "quantos bits aquele trecho precisa".
 * Retorna { p70Kbps, worstKbps }:
 *  - p70Kbps  = percentil 70 das sondas → alvo de MÉDIA VBR (cenas calmas
 *               gastam menos, ação puxa para cima — variação natural);
 *  - worstKbps = pior cena (max) → teto de PICO (maxrate).
 * Retorna null se nenhuma sonda conseguir medir.
 */
async function measureContentBitrate(
  sourcePath: string,
  totalDurationSec: number
): Promise<{ p70Kbps: number; worstKbps: number } | null> {
  if (!(totalDurationSec > PROBE_SAMPLE_SEC * 2)) return null;

  const pathHash = require('crypto').createHash('md5').update(sourcePath).digest('hex').slice(0, 8);
  // Ignora os primeiros/últimos 5% (aberturas/créditos raramente são a pior cena)
  const start = totalDurationSec * 0.05;
  const end = totalDurationSec * 0.95;
  const step = PROBE_POINTS > 1 ? (end - start) / (PROBE_POINTS - 1) : 0;

  const samples: number[] = [];
  for (let i = 0; i < PROBE_POINTS; i++) {
    const ss = Math.round(start + step * i);
    const outPath = `/tmp/pp_probe_${pathHash}_${i}.mp4`;
    try {
      await execFileAsync('/usr/lib/jellyfin-ffmpeg/ffmpeg', [
        '-y', '-ss', String(ss), '-i', sourcePath,
        '-t', String(PROBE_SAMPLE_SEC),
        '-map', '0:v:0', '-an', '-sn',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        outPath,
      ], { timeout: 300000 });
      const p = probeFile(outPath);
      const br = parseFloat(String(p?.format?.bit_rate || '0'));
      if (br > 0) samples.push(Math.round(br / 1000));
    } catch (err: any) {
      logger.warn(COMPONENT, `Probe sonda ${i + 1}/${PROBE_POINTS} falhou (${err.message?.slice(0, 80)}) — seguindo com as demais`);
    } finally {
      try { if (existsSync(outPath)) unlinkSync(outPath); } catch { /* ignore */ }
    }
  }

  if (samples.length === 0) return null;
  samples.sort((a, b) => a - b);
  const idx = Math.min(samples.length - 1, Math.floor(0.7 * (samples.length - 1) + 0.5));
  return { p70Kbps: samples[idx], worstKbps: samples[samples.length - 1] };
}

/** Arredonda para cima em passos de 500k e clampa no piso/teto configurado. */
function clampBitrate(kbps: number): number {
  const rounded = Math.ceil(kbps / 500) * 500;
  return Math.min(BITRATE_CEIL, Math.max(BITRATE_FLOOR, rounded));
}

/** Retorna true se o arquivo já é web-compatible (H.264/AAC/MP4). */
function isWebCompatible(probe: ProbeData, filePath?: string): boolean {
  const videoStream = probe.streams.find((s: any) => s.codec_type === 'video');
  const audioStream = probe.streams.find((s: any) => s.codec_type === 'audio');
  const videoCodec = (videoStream?.codec_name || '').toLowerCase();
  const audioCodec = (audioStream?.codec_name || '').toLowerCase();

  const is10bit = videoCodec === 'h264' && /10le|10be|12le|12be/.test(videoStream?.pix_fmt || '');

  const INCOMPATIBLE_EXT = ['.mkv', '.avi', '.ts'];
  const ext = filePath ? extname(filePath).toLowerCase() : '';
  if (INCOMPATIBLE_EXT.includes(ext)) return false;

  return (
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

function pumpQueue(): void {
  if (queue.length === 0 || runningCount >= MAX_CONCURRENT) return;
  const item = queue.shift()!;
  runningCount++;
  runningPaths.add(item.sourcePath);
  spawnFfmpegConversion(item.sourcePath, item.probe, item.mediaId, item.mediaType)
    .then(item.resolve)
    .catch(item.reject)
    .finally(() => {
      runningPaths.delete(item.sourcePath);
      runningCount--;
      pumpQueue();
    });
}

function isAlreadyQueued(sourcePath: string): boolean {
  return queue.some(item => item.sourcePath === sourcePath) || runningPaths.has(sourcePath);
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

    // Defesa anti-malware: assinatura binária de executável no lugar de vídeo.
    // Extensão pode mentir ("episodio.mp4" que é PE); magic bytes não.
    try {
      const fd = openSync(resolved, 'r');
      const buf = Buffer.alloc(8);
      readSync(fd, buf, 0, 8, 0);
      closeSync(fd);
      const execSignatures: Array<[string, string]> = [
        ['MZ', 'executável Windows (PE)'],
        ['\x7fELF', 'executável Linux (ELF)'],
        ['#!', 'script (shebang)'],
        ['PK\x03\x04', 'pacote ZIP/JAR/APK'],
        ['\xfe\xed\xfa\xce', 'binário Mach-O'],
      ];
      for (const [sig, desc] of execSignatures) {
        if (buf.subarray(0, sig.length).toString('latin1') === sig) {
          logger.error(COMPONENT, `[ANTI-MALWARE] Assinatura de ${desc} detectada em: ${resolved}`);
          return { success: false, skipped: false, reason: `possível malware: ${desc}`, error: 'executable signature detected' };
        }
      }
    } catch { /* leitura falhou — segue fluxo normal (ffprobe vai rejeitar) */ }

    const probe = probeFile(resolved);
    if (!probe) {
      return { success: false, skipped: false, reason: 'ffprobe failed', error: 'arquivo ilegível pelo ffprobe (corrompido?)' };
    }

    if (isWebCompatible(probe, resolved)) {
      logger.info(COMPONENT, `Arquivo já compatível, pulando: ${basename(resolved)}`);
      return { success: true, skipped: true, reason: 'já compatível' };
    }

    // Deduplicação: não enfileirar se já está na fila ou rodando
    if (isAlreadyQueued(resolved)) {
      logger.info(COMPONENT, `Já enfileirado/rodando, pulando: ${basename(resolved)}`);
      return { success: true, skipped: false, reason: 'já na fila' };
    }

    // Arquivo incompatível → enfileirar para conversão controlada
    return new Promise<ProcessResult>((resolve, reject) => {
      queue.push({ sourcePath: resolved, probe, mediaId, mediaType, resolve: () => resolve({ success: true, skipped: false, reason: 'conversão enfileirada' }), reject: (e: Error) => reject(e) });
      logger.info(COMPONENT, `Post-processing enfileirado: ${basename(resolved)} (fila: ${queue.length}, rodando: ${runningCount}/${MAX_CONCURRENT})`);
      pumpQueue();
    });
  },
};

/** Spawna ffmpeg em background (detached) para converter o arquivo. */
function spawnFfmpegConversion(
  sourcePath: string,
  probe: ProbeData,
  mediaId?: string,
  mediaType?: 'movie' | 'series'
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const videoStream = probe.streams.find((s: any) => s.codec_type === 'video');
    const srcW = parseInt(String(videoStream?.width || 0), 10);
    const srcH = parseInt(String(videoStream?.height || 0), 10);

    // ── Áudio: preferir faixa PT-BR (dublado), senão primeira faixa ────────
    const audioStreams = probe.streams.filter((s: any) => s.codec_type === 'audio');
    const porIdx = audioStreams.findIndex((s: any) =>
      String(s.tags?.language || '').toLowerCase().startsWith('por'));
    const audioMapSpec = porIdx >= 0 ? `0:a:${porIdx}` : '0:a:0?';

    // ── Alvo de vídeo ───────────────────────────────────────────────────────
    // noturno: CRF fixo — SEM probe (a qualidade é o alvo; o bitrate sai do
    // que cada cena precisa, decidido pelo próprio x264).
    // vaapi: mede o conteúdo (média VBR = percentil 70 das sondas; pico =
    // pior cena). Nunca excede 85% do bitrate da fonte.
    let videoBitrateKbps = parseInt(VAAPI_VIDEO_BITRATE, 10) || 1200;
    let maxKbps = Math.round(videoBitrateKbps * 1.1);
    if (MODE === 'vaapi' && ADAPTIVE_ENABLED) {
      const srcDuration = parseFloat(String(probe.format?.duration || '0'));
      const srcTotalBps = parseFloat(String(probe.format?.bit_rate || '0'));
      const measured = await measureContentBitrate(sourcePath, srcDuration);
      if (measured && measured.p70Kbps > 0) {
        videoBitrateKbps = clampBitrate(measured.p70Kbps);
        if (srcTotalBps > 0) {
          const sourceCap = Math.floor((srcTotalBps / 1000) * 0.85);
          if (videoBitrateKbps > sourceCap) {
            logger.info(COMPONENT, `Cap pela fonte: alvo ${videoBitrateKbps}kbps > 85% da fonte (${sourceCap}kbps) — limitando`);
            // Cap exato, SEM re-arredondar para cima (ceil furaria a garantia
            // de nunca exceder 85% da fonte).
            videoBitrateKbps = Math.max(BITRATE_FLOOR, sourceCap);
          }
        }
        maxKbps = Math.min(
          BITRATE_CEIL,
          Math.max(videoBitrateKbps + BITRATE_FLOOR, clampBitrate(measured.worstKbps))
        );
        logger.info(COMPONENT, `Probe adaptativo: sondas p70=${measured.p70Kbps}kbps / pior=${measured.worstKbps}kbps → média ${videoBitrateKbps}kbps, pico ${maxKbps}kbps (clamp ${BITRATE_FLOOR}-${BITRATE_CEIL})`);
      } else {
        logger.warn(COMPONENT, `Probe não conseguiu medir — usando fallback fixo ${videoBitrateKbps}kbps`);
      }
    }

    const destDir = dirname(sourcePath);
    const pathHash = require('crypto').createHash('md5').update(sourcePath).digest('hex').slice(0, 8);
    const tempPath = join(destDir, `.tmp_${pathHash}.mp4`);
    const finalPath = join(destDir, `${basename(sourcePath, extname(sourcePath))}.mp4`);

    const ffmpegArgs: string[] = [];
    // Input lido normalmente (software decode) — SEM hwaccel no decode
    // para evitar problemas com 10-bit HDR e incompatibilidade de surface
    ffmpegArgs.push('-y', '-i', sourcePath);

    if (MODE !== 'vaapi') {
      // ── MODO NOTURNO: x264/CPU, qualidade ancorada em CRF ────────────────
      // Sem -threads: x264 paraleliza sozinho usando os cores disponíveis.
      ffmpegArgs.push('-vf', srcW > 1920 || srcH > 1080
        ? 'scale=1920:-2:flags=lanczos,format=yuv420p'
        : 'format=yuv420p');
      ffmpegArgs.push('-map', '0:v:0', '-map', audioMapSpec, '-sn');
      ffmpegArgs.push(
        '-c:v', 'libx264',
        '-preset', X264_PRESET,
        '-crf', CRF,
        '-tune', 'film',
        '-profile:v', 'high',
      );
    } else {
      if (MAX_THREADS > 0) {
        ffmpegArgs.push('-threads', String(MAX_THREADS));
      }

      // Video filter chain: scale (se necessário) → format=nv12 → hwupload → VAAPI
      const vf: string[] = [];
      if (srcW > 1920 || srcH > 1080) {
        vf.push('scale=1920:-2:flags=lanczos');
      }
      vf.push('format=nv12');
      vf.push('hwupload');
      ffmpegArgs.push('-vf', vf.join(','));

      // Mapeamento de streams + VAAPI device para encode
      ffmpegArgs.push('-vaapi_device', '/dev/dri/renderD128');
      ffmpegArgs.push('-map', '0:v:0', '-map', audioMapSpec, '-sn');

      // Encode com GPU — VBR no bitrate medido pelo probe.
      // Média = p70 das sondas; pico (maxrate) = pior cena medida; bufsize 2x a média.
      ffmpegArgs.push('-c:v', VIDEO_CODEC, '-profile:v', 'high', '-bf', '2');
      ffmpegArgs.push('-b:v', `${videoBitrateKbps}k`, '-maxrate', `${maxKbps}k`, '-bufsize', `${videoBitrateKbps * 2}k`);
    }

    // Áudio: AAC estéreo 128k, faixa PT-BR preferida (Regras_dolfimflix.md §3.5)
    ffmpegArgs.push('-c:a', 'aac', '-b:a', AUDIO_BITRATE, '-ar', '48000');
    ffmpegArgs.push('-ac', '2');
    ffmpegArgs.push('-af', 'aresample=async=1');
    ffmpegArgs.push('-movflags', '+faststart');
    ffmpegArgs.push(tempPath);

    const modeLabel = MODE !== 'vaapi'
      ? `noturno/x264-${X264_PRESET}@CRF${CRF}`
      : `vaapi/${VIDEO_CODEC} @ ${videoBitrateKbps}k VBR`;
    const audioLabel = porIdx >= 0 ? `áudio PT-BR (0:a:${porIdx})` : 'áudio padrão (0:a:0)';
    logger.info(COMPONENT, `ffmpeg start: ${basename(sourcePath)} -> ${basename(finalPath)} (${modeLabel}, ${srcW}x${srcH} ${srcW > 1920 || srcH > 1080 ? '→ 1080p' : '→ native'}, ${audioLabel}, estéreo)`);

    const ffmpeg = spawn('/usr/lib/jellyfin-ffmpeg/ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'ignore', 'pipe'],
      // detached: false (padrão) — processo fica no cgroup do container, respeita limites de memória/CPU
    });

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

          // Tamanho mínimo: saída deve ter ≥5% do tamanho do original
          // VAAPI pode comprimir 5-6x (ex: 5.5GB → 1.2GB) — 5% permite episódios TV
          const srcSize = existsSync(sourcePath) ? statSync(sourcePath).size : 0;
          if (srcSize > 0 && tempStats.size < srcSize * 0.05) {
            logger.error(COMPONENT, `Output too small (${(tempStats.size / 1024 / 1024).toFixed(0)}MB vs source ${(srcSize / 1024 / 1024).toFixed(0)}MB) — keeping original`);
            cleanup();
            reject(new Error(`Output size mismatch: ${(tempStats.size / 1024 / 1024).toFixed(0)}MB < 5% of ${(srcSize / 1024 / 1024).toFixed(0)}MB`));
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
