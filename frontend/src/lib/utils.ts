// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Limpa título de mídia removendo tokens de qualidade, release groups, etc.
 * Ex: "Todo Mundo em Pânico WEB DL 1080p" → "Todo Mundo em Pânico"
 */
export function cleanTitle(title: string): string {
  return title
    .replace(/[._-]+/g, ' ')
    .replace(/\b(WEB.?DL|BRRip|BDRip|HDRip|DVDRip|HDTV|WEBRip|BluRay|Remux|x264|x265|HEVC|AAC|DD5\.1|DTS|720p|1080p|2160p|4K|HDR|WEB.?DL|WEBDL|BRRip|BDRip|HDRip|DVDRip|HDTV|WEBRip|BluRay|Remux|x264|x265|HEVC|AAC|DD5\.1|DTS|720p|1080p|2160p|4K|HDR)\b/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–—]\s*$/, '')
    .trim();
}

/**
 * Formata título com ano: "Todo Mundo em Pânico (2026)"
 */
export function formatTitleWithYear(title: string, year?: number): string {
  const clean = cleanTitle(title);
  if (year && year > 1900 && year < 2100) {
    return `${clean} (${year})`;
  }
  return clean;
}
