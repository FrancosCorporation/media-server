// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import mongoose, { Schema, Document } from 'mongoose';

export interface SettingsDocument extends Document {
  radarrUrl?: string;
  radarrApiKey?: string;
  sonarrUrl?: string;
  sonarrApiKey?: string;
  prowlarrUrl?: string;
  prowlarrApiKey?: string;
  jackettUrl?: string;
  jackettApiKey?: string;
  qbittorrentUrl?: string;
  qbittorrentUsername?: string;
  qbittorrentPassword?: string;
  jellyfinUrl?: string;
  jellyfinApiKey?: string;
  tmdbApiKey?: string;
  defaultQuality: string;
  preferHevc: boolean;
  preferLanguage: string;
  fallbackLanguage: string;
  uiLanguage: string;
}

const SettingsSchema = new Schema<SettingsDocument>({
  radarrUrl: String, radarrApiKey: String,
  sonarrUrl: String, sonarrApiKey: String,
  prowlarrUrl: String, prowlarrApiKey: String,
  jackettUrl: String, jackettApiKey: String,
  qbittorrentUrl: String, qbittorrentUsername: String, qbittorrentPassword: String,
  jellyfinUrl: String, jellyfinApiKey: String,
  tmdbApiKey: String,
  defaultQuality: { type: String, default: '1080p' },
  preferHevc: { type: Boolean, default: true },
  preferLanguage: { type: String, default: 'pt' },
  fallbackLanguage: { type: String, default: 'en' },
  uiLanguage: { type: String, default: 'pt-BR' },
});

export const Settings = mongoose.model<SettingsDocument>('Settings', SettingsSchema);
