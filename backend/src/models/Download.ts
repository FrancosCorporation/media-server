// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import mongoose, { Schema, Document } from 'mongoose';
import type { DownloadStatus, MediaType } from '../types';

export interface DownloadDocument extends Document {
  mediaId: string;
  mediaType: MediaType;
  title: string;
  poster?: string;
  hash?: string;
  status: DownloadStatus;
  progress: number;
  speed?: number;
  eta?: number;
  seeds?: number;
  peers?: number;
  quality?: string;
  /** Marca quando o torrent entrou em "Aguardando fontes" (sem seeds) — usado para timeout */
  stalledSince?: Date;
  /** Estado da conversão pós-download (P6): none | queued | running | done | failed */
  conversionStatus?: string;
  /** Progresso da conversão (0-100), quando running */
  conversionProgress?: number;
  addedAt: Date;
  updatedAt: Date;
}

const DownloadSchema = new Schema<DownloadDocument>({
  mediaId: { type: String, required: true },
  mediaType: { type: String, enum: ['movie', 'series'], required: true },
  title: { type: String, required: true },
  poster: String,
  hash: { type: String, index: true },
  status: { type: String, enum: ['queued', 'downloading', 'complete', 'error'], default: 'queued' },
  progress: { type: Number, default: 0 },
  speed: Number,
  eta: Number,
  seeds: Number,
  peers: Number,
  quality: String,
  stalledSince: Date,
  conversionStatus: { type: String, default: 'none' },
  conversionProgress: Number,
  addedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const Download = mongoose.model<DownloadDocument>('Download', DownloadSchema);
