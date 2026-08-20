// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import axios from 'axios';
import { logger } from '../utils/logger';

const COMPONENT = 'DLNAService';
const SSDP_HELPER_URL = process.env.SSDP_HELPER_URL || 'http://ssdp-helper:9090';

export interface DLNADevice {
  name: string;
  manufacturer: string;
  model: string;
  location: string;
  uuid: string;
  controlURL: string;
  transportURL: string;
  ip: string;
  port: number;
}

export async function discoverDLNADevices(): Promise<DLNADevice[]> {
  try {
    logger.info(COMPONENT, 'Discovering DLNA devices via ssdp-helper');
    const response = await axios.get(`${SSDP_HELPER_URL}/discover`, { timeout: 5000 });
    const data = response.data;
    
    if (!data.devices || data.devices.length === 0) {
      logger.info(COMPONENT, 'No DLNA devices found via ssdp-helper');
      return [];
    }
    
    // Convert ssdp-helper device format to our DLNADevice format
    const devices: DLNADevice[] = data.devices.map((d: any, i: number) => ({
      name: d.name || `DLNA Device ${i + 1}`,
      manufacturer: d.manufacturer || 'Unknown',
      model: d.model || 'Unknown',
      location: d.location || '',
      uuid: d.uuid || `mock-uuid-${i}`,
      controlURL: d.controlURL || '/ctl/AVTransport',
      transportURL: d.transportURL || '/ctl/AVTransport',
      ip: d.ip || d.location?.replace('http://', '').split(':')[0] || '192.168.1.9',
      port: d.port || 8080,
    }));
    
    logger.info(COMPONENT, `Discovered ${devices.length} DLNA device(s)`);
    return devices;
  } catch (err: any) {
    logger.warn(COMPONENT, 'Failed to discover DLNA devices via ssdp-helper', { error: err.message });
    return [];
  }
}

const SOAP_ENVELOPE = (action: string, body: string) => `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      ${body}
    </u:${action}>
  </s:Body>
</s:Envelope>`;

async function sendSOAP(device: DLNADevice, action: string, body: string): Promise<boolean> {
  try {
    const url = `http://${device.ip}:${device.port}${device.controlURL}`;
    const soap = SOAP_ENVELOPE(action, body);
    const response = await axios.post(url, soap, {
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'SOAPACTION': `"urn:schemas-upnp-org:service:AVTransport:1#${action}"`,
        'User-Agent': 'DolfimFlix/1.0',
      },
      timeout: 10000,
      validateStatus: () => true,
    });
    logger.info(COMPONENT, `SOAP ${action} response`, { status: response.status });
    return response.status === 200;
  } catch (err: any) {
    logger.error(COMPONENT, `SOAP ${action} failed`, { error: err.message, device: device.name });
    return false;
  }
}

export async function playOnDLNA(device: DLNADevice, mediaUrl: string, title?: string): Promise<boolean> {
  logger.info(COMPONENT, `playOnDLNA called for ${device?.name} with ${mediaUrl}`);

  // 1. Stop current playback
  const stopBody = `<InstanceID>0</InstanceID>`;
  await sendSOAP(device, 'Stop', stopBody);

  // 2. Set AVTransportURI
  const setUriBody = `
    <InstanceID>0</InstanceID>
    <CurrentURI>${mediaUrl}</CurrentURI>
    <CurrentURIMetaData></CurrentURIMetaData>
  `;
  const ok = await sendSOAP(device, 'SetAVTransportURI', setUriBody);
  if (!ok) return false;

  // 3. Play
  const playBody = `<InstanceID>0</InstanceID><Speed>1</Speed>`;
  return await sendSOAP(device, 'Play', playBody);
}

export async function getDLNATransportInfo(device: DLNADevice): Promise<string> {
  return 'UNKNOWN';
}
