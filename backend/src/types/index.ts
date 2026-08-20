// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Request } from 'express';

export interface UserPayload {
  _id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  photo?: string;
}

export interface AuthRequest extends Request {
  user?: UserPayload;
}

export type MediaStatus = 'available' | 'downloading' | 'error' | 'pending';
export type MediaType = 'movie' | 'series';
export type DownloadStatus = 'queued' | 'downloading' | 'complete' | 'error';
export type UserRole = 'admin' | 'user';

export interface IMovie {
  tmdbId: number;
  radarrId?: number;
  title: string;
  year: number;
  overview: string;
  poster?: string;
  backdrop?: string;
  genres: string[];
  rating: number;
  status: MediaStatus;
  quality?: string;
  path?: string;
}

export interface ISeries {
  tvdbId: number;
  sonarrId?: number;
  title: string;
  year: number;
  overview: string;
  poster?: string;
  backdrop?: string;
  genres: string[];
  rating: number;
  status: MediaStatus;
  seasons: number;
  path?: string;
}

export interface IDownload {
  mediaId: string;
  mediaType: MediaType;
  title: string;
  poster?: string;
  status: DownloadStatus;
  progress: number;
  speed?: number;
  eta?: number;
  seeds?: number;
  peers?: number;
  quality?: string;
}

export interface ISettings {
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
}

export interface IUser {
  username: string;
  email: string;
  password: string;
  role: UserRole;
}
