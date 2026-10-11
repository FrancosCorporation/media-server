// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
import type { Request } from 'express';

function loadFrontendOrigins(): Set<string> {
  const values = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const origins = new Set<string>();

  for (const value of values) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`Origem inválida em FRONTEND_URLS/FRONTEND_URL: ${value}`);
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error(`Configure somente uma origem HTTP(S) em FRONTEND_URLS/FRONTEND_URL: ${value}`);
    }
    origins.add(parsed.origin);
  }

  return origins;
}

export const FRONTEND_ORIGINS = loadFrontendOrigins();

export function isAllowedFrontendOrigin(origin: string | undefined): boolean {
  return !origin || FRONTEND_ORIGINS.has(origin);
}

export function applyStreamCorsHeaders(req: Request, res: import('express').Response): boolean {
  const origin = req.headers.origin;
  res.vary('Origin');

  if (origin && !isAllowedFrontendOrigin(origin)) return false;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, Authorization, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
  }
  return true;
}
