// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import mongoose, { Schema, Document } from 'mongoose';
import type { MediaStatus } from '../types';

export interface SeriesDocument extends Document {
  tvdbId?: number;
  tmdbId?: number;
  sonarrId?: number;
  title: string;
  canonicalTitle?: string;
  originalTitle?: string;
  year?: number;
  overview: string;
  poster?: string;
  backdrop?: string;
  genres: string[];
  rating: number;
  status: MediaStatus;
  seasons: number;
  totalEpisodes?: number;
  path?: string;
  addedAt: Date;
  updatedAt: Date;
}

const SeriesSchema = new Schema<SeriesDocument>({
  tvdbId: { type: Number, sparse: true },
  tmdbId: { type: Number, sparse: true },
  sonarrId: Number,
  title: { type: String, required: true, index: 'text' },
  canonicalTitle: String,
  originalTitle: String,
  year: Number,
  overview: { type: String, default: '' },
  poster: String,
  backdrop: String,
  genres: [{ type: String }],
  rating: { type: Number, default: 0 },
  status: { type: String, enum: ['available', 'downloading', 'error', 'pending'], default: 'pending' },
  seasons: { type: Number, default: 1 },
  totalEpisodes: Number,
  path: String,
  addedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

SeriesSchema.index({ tvdbId: 1 });

SeriesSchema.index({ title: 'text', overview: 'text' });
SeriesSchema.index({ addedAt: -1 });
SeriesSchema.index({ rating: -1 });

export const Series = mongoose.model<SeriesDocument>('Series', SeriesSchema);
