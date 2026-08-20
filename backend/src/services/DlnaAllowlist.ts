// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../utils/logger';

const COMPONENT = 'DlnaAllowlist';

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

interface AllowlistEntry {
  ip: string;
  deviceName: string;
  uuid: string;
  addedAt: number;
  expiresAt: number;
}

const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 horas

class DlnaAllowlist {
  private static instance: DlnaAllowlist;
  private allowlist = new Map<string, AllowlistEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startCleanupInterval();
  }

  static getInstance(): DlnaAllowlist {
    if (!DlnaAllowlist.instance) {
      DlnaAllowlist.instance = new DlnaAllowlist();
    }
    return DlnaAllowlist.instance;
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60 * 60 * 1000); // A cada hora
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let removed = 0;
    for (const [ip, entry] of this.allowlist.entries()) {
      if (entry.expiresAt < now) {
        this.allowlist.delete(ip);
        removed++;
      }
    }
    if (removed > 0) {
      logger.info(COMPONENT, `Cleaned up ${removed} expired DLNA allowlist entries`);
    }
  }

  add(ip: string, device: DLNADevice): void {
    const now = Date.now();
    const entry: AllowlistEntry = {
      ip,
      deviceName: device.name,
      uuid: device.uuid,
      addedAt: now,
      expiresAt: now + DEFAULT_TTL,
    };
    this.allowlist.set(ip, entry);
    logger.info(COMPONENT, `Added DLNA device to allowlist`, { ip, name: device.name, uuid: device.uuid });
  }

  has(ip: string): boolean {
    const entry = this.allowlist.get(ip);
    if (!entry) return false;
    
    // Verificar se expirou
    if (entry.expiresAt < Date.now()) {
      this.allowlist.delete(ip);
      return false;
    }
    
    // Renovar TTL a cada acesso válido
    entry.expiresAt = Date.now() + DEFAULT_TTL;
    return true;
  }

  remove(ip: string): boolean {
    const result = this.allowlist.delete(ip);
    if (result) {
      logger.info(COMPONENT, `Removed DLNA device from allowlist`, { ip });
    }
    return result;
  }

  getAll(): AllowlistEntry[] {
    return Array.from(this.allowlist.values());
  }

  getEntry(ip: string): AllowlistEntry | undefined {
    return this.allowlist.get(ip);
  }

  // Middleware Express para bypass de autenticação DLNA
  middleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      const clientIp = req.ip || req.connection?.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';
      
      // Verificar se é dispositivo DLNA por IP na allowlist
      const isAllowlisted = this.has(clientIp);
      
      // Verificar User-Agent típico de DLNA/UPnP
      const isDlnaUserAgent = /DLNA|UPnP|MediaRenderer|MediaServer|Windows-Media-Player/i.test(userAgent);
      
      const isDlna = isAllowlisted || isDlnaUserAgent;
      
      if (isDlna) {
        logger.info(COMPONENT, `DLNA request detected, bypassing auth`, { 
          ip: clientIp, 
          userAgent: userAgent.substring(0, 100),
          allowlisted: isAllowlisted
        });
        return next();
      }
      
      // Não é DLNA, continuar para autenticação normal
      next();
    };
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.allowlist.clear();
  }
}

export const dlnaAllowlist = DlnaAllowlist.getInstance();
export default DlnaAllowlist;