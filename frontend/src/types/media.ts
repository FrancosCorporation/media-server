// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
export type MediaStatus = 'available' | 'downloading' | 'error' | 'pending';
export type DownloadStatus = 'queued' | 'downloading' | 'complete' | 'error';

export interface MediaItem {
  _id: string;
  tmdbId?: number;
  tvdbId?: number;
  radarrId?: number;
  sonarrId?: number;
  title: string;
  year: number;
  overview: string;
  poster?: string;
  backdrop?: string;
  genres: string[];
  rating: number;
  status: MediaStatus;
  seasons?: number;
  quality?: string;
  path?: string;
  addedAt: string;
  updatedAt: string;
}

export interface DownloadItem {
  _id: string;
  mediaId: string;
  mediaType: 'movie' | 'series';
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
  addedAt: string;
}

export interface MediaUser {
  _id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
}

export interface MediaSettings {
  radarrUrl?: string;
  radarrApiKey?: string;
  sonarrUrl?: string;
  sonarrApiKey?: string;
  prowlarrUrl?: string;
  prowlarrApiKey?: string;
  qbittorrentUrl?: string;
  qbittorrentUsername?: string;
  qbittorrentPassword?: string;
  jellyfinUrl?: string;
  jellyfinApiKey?: string;
  defaultQuality: string;
  preferHevc: boolean;
  preferLanguage: string;
  fallbackLanguage: string;
  uiLanguage: string;
}
