// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import mongoose, { Schema, Document } from 'mongoose';

export interface CachedCoverDocument extends Document {
  mediaId: string;
  mediaType: 'movie' | 'series';
  title: string;
  poster?: string;
  backdrop?: string;
  source: 'tmdb' | 'radarr' | 'sonarr' | 'hdrtorrent';
  lastUpdated: Date;
  createdAt: Date;
}

const CachedCoverSchema = new Schema<CachedCoverDocument>({
  mediaId: { type: String, required: true },
  mediaType: { type: String, enum: ['movie', 'series'], required: true },
  title: { type: String, required: true },
  poster: String,
  backdrop: String,
  source: { type: String, enum: ['tmdb', 'radarr', 'sonarr', 'hdrtorrent'], default: 'tmdb' },
  lastUpdated: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

CachedCoverSchema.index({ mediaId: 1, mediaType: 1 }, { unique: true });
CachedCoverSchema.index({ title: 'text' });

export const CachedCover = mongoose.model<CachedCoverDocument>('CachedCover', CachedCoverSchema);
