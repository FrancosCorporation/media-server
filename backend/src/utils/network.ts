// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { networkInterfaces } from 'os';
import { logger } from './logger';

const COMPONENT = 'NetworkUtils';

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  // 10.x.x.x
  if (a === 10) return true;
  // 172.16.x.x - 172.31.x.x
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.x.x
  if (a === 192 && b === 168) return true;
  // 169.254.x.x (link-local)
  if (a === 169 && b === 254) return true;
  return false;
}

export function getLocalIP(): string {
  const interfaces = networkInterfaces();
  
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    
    // Skip virtual interfaces
    if (name.startsWith('docker') || name.startsWith('veth') || 
        name.startsWith('br-') || name.startsWith('lo') ||
        name.startsWith('tun') || name.startsWith('tap')) {
      continue;
    }
    
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        if (isPrivateIP(addr.address)) {
          logger.info(COMPONENT, `Selected local IP: ${addr.address} (interface: ${name})`);
          return addr.address;
        }
      }
    }
  }
  
  // Fallback: try to find any non-internal IPv4
  for (const [, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        logger.warn(COMPONENT, `Using fallback IP: ${addr.address}`);
        return addr.address;
      }
    }
  }
  
  logger.error(COMPONENT, 'Could not determine local IP, defaulting to 127.0.0.1');
  return '127.0.0.1';
}

export function getLocalStreamBaseURL(): string {
  const ip = getLocalIP();
  const port = process.env.API_PORT || '4000';
  return `http://${ip}:${port}`;
}

export function buildStreamURL(mediaPath: string, token?: string): string {
  const base = getLocalStreamBaseURL();
  const encodedPath = encodeURIComponent(mediaPath);
  const url = `${base}/api/stream/${encodedPath}`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

export function buildHLSURL(mediaPath: string, quality: '720p' | '1080p' = '1080p', token?: string): string {
  const base = getLocalStreamBaseURL();
  const encodedPath = encodeURIComponent(mediaPath);
  const url = `${base}/api/stream/hls/${quality}/${encodedPath}`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

export function buildMPEGTSURL(mediaPath: string, quality: '720p' | '1080p' = '1080p', token?: string, forDlna = false): string {
  const base = getLocalStreamBaseURL();
  const encodedPath = encodeURIComponent(mediaPath);
  const url = `${base}/api/stream/mpegts/${quality}/${encodedPath}`;

  if (forDlna) {
    // SEM token para DLNA
    return url;
  }

  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}