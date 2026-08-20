// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import mongoose, { Schema, Document } from 'mongoose';

export interface HistoryDocument extends Document {
  userId: string;
  mediaId: string;
  mediaType: 'movie' | 'series';
  title: string;
  action: 'added' | 'removed' | 'watched' | 'downloaded';
  timestamp: Date;
}

const HistorySchema = new Schema<HistoryDocument>({
  userId: { type: String, required: true },
  mediaId: { type: String, required: true },
  mediaType: { type: String, enum: ['movie', 'series'], required: true },
  title: { type: String, required: true },
  action: { type: String, enum: ['added', 'removed', 'watched', 'downloaded'], required: true },
  timestamp: { type: Date, default: Date.now },
});

HistorySchema.index({ userId: 1, timestamp: -1 });

export const History = mongoose.model<HistoryDocument>('History', HistorySchema);
