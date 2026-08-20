// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import mongoose, { Schema, Document } from 'mongoose';

export interface SearchHistoryDocument extends Document {
  userId: string;
  query: string;
  mediaType: 'movie' | 'series' | 'all';
  searchedAt: Date;
}

const SearchHistorySchema = new Schema<SearchHistoryDocument>({
  userId: { type: String, required: true },
  query: { type: String, required: true },
  mediaType: { type: String, enum: ['movie', 'series', 'all'], required: true },
  searchedAt: { type: Date, default: Date.now },
});

SearchHistorySchema.index({ userId: 1, searchedAt: -1 });

export const SearchHistory = mongoose.model<SearchHistoryDocument>('SearchHistory', SearchHistorySchema);
