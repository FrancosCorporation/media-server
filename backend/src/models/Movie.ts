// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import mongoose, { Schema, Document } from 'mongoose';
import type { MediaStatus } from '../types';

export interface MovieDocument extends Document {
  tmdbId?: number;
  radarrId?: number;
  title: string;
  originalTitle?: string;
  year?: number;
  overview: string;
  poster?: string;
  backdrop?: string;
  genres: string[];
  rating: number;
  status: MediaStatus;
  quality?: string;
  path?: string;
  addedAt: Date;
  updatedAt: Date;
}

const MovieSchema = new Schema<MovieDocument>({
  tmdbId: { type: Number, sparse: true },
  radarrId: Number,
  title: { type: String, required: true, index: 'text' },
  originalTitle: String,
  year: Number,
  overview: { type: String, default: '' },
  poster: String,
  backdrop: String,
  genres: [{ type: String }],
  rating: { type: Number, default: 0 },
  status: { type: String, enum: ['available', 'downloading', 'error', 'pending'], default: 'pending' },
  quality: String,
  path: String,
  addedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

MovieSchema.index({ title: 'text', overview: 'text' });
MovieSchema.index({ addedAt: -1 });
MovieSchema.index({ rating: -1 });

export const Movie = mongoose.model<MovieDocument>('Movie', MovieSchema);
