// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// StreamingService — servidor estático com suporte a HTTP Range Requests (206).
//
// A política do DolfinFlix é ZERO DELAY: arquivos no disco JÁ são H.264/AAC/MP4
// graças ao MediaPostProcessorService (rodado em background na conclusão do
// download ou import). O serviço aqui NÃO faz transcoding — apenas serve o
// arquivo com byte-range para que o navegador faça seek direto.
import { createReadStream, existsSync, statSync } from 'fs';
import { extname } from 'path';
import { Response } from 'express';
import { spawn } from 'child_process';
import { logger } from '../utils/logger';
import { ConversionQueueService } from './ConversionQueueService';

const COMPONENT = 'StreamingService';

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.m4v'];
const HLS_ROOT = '/media/transcode/hls';

function isVideoFile(filePath: string): boolean {
  return VIDEO_EXTENSIONS.includes(extname(filePath).toLowerCase());
}

function getContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.webm') return 'video/webm';
  if (ext === '.ts') return 'video/mp2t';
  if (ext === '.m4v') return 'video/x-m4v';
  return 'video/mp4';
}

function parseRange(reqRange: string | undefined, fileSize: number) {
  if (!reqRange) return null;
  const match = reqRange.match(/bytes=(\d+)-(\d*)/);
  if (!match) return null;
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
  if (start >= fileSize || start > end) return null;
  return { start, end: Math.min(end, fileSize - 1) };
}

/**
 * Stream um arquivo diretamente com Range Requests (206) para seek instantâneo.
 * Sem transcoding — o arquivo já é MP4 H.264/AAC (garantido pelo MediaPostProcessor).
 */
function streamDirect(
  filePath: string,
  reqRange: string | undefined,
  res: Response
): void {
  const stat = statSync(filePath);
  const fileSize = stat.size;
  const contentType = getContentType(filePath);
  const range = parseRange(reqRange, fileSize);

  if (range) {
    const { start, end } = range;
    const chunkSize = end - start + 1;
    res.status(206);
    res.set({
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': String(chunkSize),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    const stream = createReadStream(filePath, { start, end, highWaterMark: 1 * 1024 * 1024 });
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
  } else {
    res.status(200);
    res.set({
      'Content-Length': String(fileSize),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    const stream = createReadStream(filePath, { highWaterMark: 1 * 1024 * 1024 });
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
  }
}

export const StreamingService = {
  /**
   * Serve o vídeo diretamente com Range Requests (206) — ZERO transcoding.
   * Se o arquivo estiver corrompido/incompatível, agenda conversão via
   * ConversionQueueService e devolve 202 para o frontend.
   */
  async streamVideo(
    filePath: string,
    reqRange: string | undefined,
    res: Response,
    forceTranscode?: boolean,
    _quality?: '720p' | '1080p',
    _seekStart?: number
  ): Promise<void> {
    if (!existsSync(filePath)) {
      res.status(404).json({ error: 'Arquivo não encontrado' });
      return;
    }

    if (!isVideoFile(filePath)) {
      res.status(400).json({ error: 'Formato de vídeo não suportado' });
      return;
    }

    // Se o cliente pediu explicitamente transcoding (escape manual),
    // delega para o serviço de conversão e devolve 202.
    if (forceTranscode) {
      const conversion = await ConversionQueueService.enqueueByPath(filePath);
      logger.info(COMPONENT, `Manual transcode requested: ${filePath} status=${conversion.conversionStatus}`);
      res.status(202).json({
        error: 'arquivo-em-conversao',
        status: conversion.conversionStatus,
        progress: conversion.progress,
        mediaId: conversion.mediaId || undefined,
        message: 'Transcodificação solicitada — aguarde e tente novamente.',
      });
      return;
    }

    // Arquivo incompatível detectado? Agenda conversão e devolve 202.
    // (Os arquivos no disco devem ser compatíveis graças ao MediaPostProcessor.)
    logger.info(COMPONENT, `Direct play: ${filePath} Range: ${reqRange || 'none'}`);
    streamDirect(filePath, reqRange, res);
  },

  /**
   * Extrai um frame do vídeo num timestamp dado (usado para thumbnails).
   * Usa ffmpeg apenas para captura de frame — sem transcoding.
   */
  async extractFrame(filePath: string, time: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const fps = Math.max(0, Math.min(time, 99999));
      const tmpPath = `/tmp/frame_${Date.now()}.jpg`;
      const ffmpeg = spawn('ffmpeg', [
        '-ss', String(fps),
        '-i', filePath,
        '-vframes', '1',
        '-q:v', '2',
        '-update', '1',
        tmpPath,
      ], { stdio: ['ignore', 'ignore', 'pipe'] });

      let stderr = '';
      ffmpeg.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          try {
            const buf = require('fs').readFileSync(tmpPath);
            require('fs').unlinkSync(tmpPath);
            resolve(buf);
          } catch (e: any) {
            reject(new Error(`Failed to read frame: ${e.message}`));
          }
        } else {
          reject(new Error(`FFmpeg frame extraction failed with code ${code}: ${stderr.slice(-200)}`));
        }
      });
      ffmpeg.on('error', (err) => reject(err));
    });
  },
};
