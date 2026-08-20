// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Bonjour, type Service } from 'bonjour-service';
import http from 'http';
import { logger } from '../utils/logger';

const COMPONENT = 'AirPlayService';
const DISCOVERY_TIMEOUT = 5000;

export interface AirPlayDevice {
  name: string;
  ip: string;
  port: number;
  id: string;
  modelName?: string;
  deviceVersion?: string;
  macAddress?: string;
}

let bonjour: InstanceType<typeof Bonjour> | null = null;

function getBonjour(): InstanceType<typeof Bonjour> {
  if (!bonjour) {
    bonjour = new Bonjour();
  }
  return bonjour;
}

export function discoverAirPlayDevices(): Promise<AirPlayDevice[]> {
  return new Promise((resolve) => {
    const devices: AirPlayDevice[] = [];
    const seen = new Set<string>();
    const bj = getBonjour();

    logger.info(COMPONENT, 'Starting mDNS discovery for AirPlay devices...');

    const browser = bj.find({ type: 'airplay' }, (service: any) => {
      const key = `${service.referer?.address || service.addresses?.[0]}`;
      if (seen.has(key) || !service.addresses?.length) return;
      seen.add(key);

      const ip = service.addresses?.[0] || service.referer?.address || '';
      if (!ip) return;

      const device: AirPlayDevice = {
        name: service.name || 'Unknown AirPlay Device',
        ip,
        port: service.port || 7000,
        id: service.txt?.et || service.name || '',
        modelName: service.txt?.md,
        deviceVersion: service.txt?.pv,
        macAddress: service.txt?.am,
      };

      devices.push(device);
      logger.info(COMPONENT, `Found AirPlay device: ${device.name} (${device.ip}:${device.port})`);
    });

    setTimeout(() => {
      try { browser.stop(); } catch {}
      logger.info(COMPONENT, `Found ${devices.length} AirPlay devices`);
      resolve(devices);
    }, DISCOVERY_TIMEOUT);
  });
}

function httpPut(host: string, port: number, path: string, headers: Record<string, string>, body?: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port,
      path,
      method: 'PUT',
      headers: {
        ...headers,
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
    });

    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('AirPlay request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

export async function playOnAirPlay(device: AirPlayDevice, mediaUrl: string, title?: string): Promise<boolean> {
  logger.info(COMPONENT, `Sending play command to AirPlay device: ${device.name}`);

  try {
    // 1. Check if device is available
    const reverseResponse = await httpPut(device.ip, device.port, '/reverse', {
      'Upgrade': 'PTTH/1.0',
      'X-Apple-Purpose': 'event',
    }).catch(() => ({ statusCode: 0, body: '' }));

    // 2. Send the play URL via /play URL (AirPlay 2) or /scrub (AirPlay 1)
    // Use the /play endpoint with proper headers
    const playBody = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Content-Location</key>
  <string>${mediaUrl}</string>
  <key>Start-Position</key>
  <real>0</real>
  <key>Remote-Display-Name</key>
  <string>${title || 'FrancoCorp Media'}</string>
</dict>
</plist>`;

    const result = await httpPut(device.ip, device.port, '/play', {
      'Content-Type': 'application/x-apple-binary-plist',
      'User-Agent': 'MediaServer/1.0',
    }, playBody);

    if (result.statusCode === 200 || result.statusCode === 204) {
      logger.info(COMPONENT, `Playback started on AirPlay device: ${device.name}`);
      return true;
    }

    // Fallback: try /play with URL-encoded body (simpler AirPlay 1)
    const simpleResult = await httpPut(device.ip, device.port, '/play', {
      'Content-Type': 'text/parameters',
      'User-Agent': 'MediaServer/1.0',
    }, `Content-Location: ${mediaUrl}\nStart-Position: 0\n`);

    if (simpleResult.statusCode === 200 || simpleResult.statusCode === 204) {
      logger.info(COMPONENT, `Playback started on AirPlay device: ${device.name} (fallback)`);
      return true;
    }

    logger.warn(COMPONENT, `AirPlay play returned status ${result.statusCode}`);
    return false;
  } catch (err: any) {
    logger.error(COMPONENT, `Failed to play on AirPlay device ${device.name}: ${err.message}`);
    return false;
  }
}

export async function stopOnAirPlay(device: AirPlayDevice): Promise<boolean> {
  try {
    const result = await httpPut(device.ip, device.port, '/stop', {
      'Content-Type': 'text/parameters',
      'User-Agent': 'MediaServer/1.0',
    });
    return result.statusCode === 200 || result.statusCode === 204;
  } catch {
    return false;
  }
}

export function shutdownAirPlay(): void {
  if (bonjour) {
    bonjour.destroy();
    bonjour = null;
  }
}
