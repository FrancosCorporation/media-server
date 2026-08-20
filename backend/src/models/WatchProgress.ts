// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import mongoose, { Schema, Document } from 'mongoose';

export interface WatchProgressDocument extends Document {
  userId: string;
  mediaId: string;
  mediaType: 'movie' | 'series';
  currentTime: number;
  duration: number;
  percentage: number;
  completed: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  lastWatched: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WatchProgressSchema = new Schema<WatchProgressDocument>({
  userId: { type: String, required: true },
  mediaId: { type: String, required: true },
  mediaType: { type: String, enum: ['movie', 'series'], required: true },
  currentTime: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  seasonNumber: { type: Number },
  episodeNumber: { type: Number },
  lastWatched: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

WatchProgressSchema.index({ userId: 1, mediaId: 1, seasonNumber: 1, episodeNumber: 1 }, { unique: true });
WatchProgressSchema.index({ userId: 1, lastWatched: -1 });

WatchProgressSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  if (this.duration > 0) {
    this.percentage = Math.min(100, (this.currentTime / this.duration) * 100);
    this.completed = this.percentage >= 90;
  }
  next();
});

export const WatchProgress = mongoose.model<WatchProgressDocument>('WatchProgress', WatchProgressSchema);
