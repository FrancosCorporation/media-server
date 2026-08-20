// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthRequest, UserPayload } from '../types';

const JWT_SECRET: string = process.env.JWT_SECRET || (() => {
  console.error('[Auth] FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
})();

import { rateLimit } from 'express-rate-limit';
import { LoginAttempt } from '../models/LoginAttempt';

const ipRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' },
  keyGenerator: (req) => req.ip || req.connection.remoteAddress || 'unknown',
});

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  // Complemento: permite token via ?token= (usado por navigator.sendBeacon que não suporta headers).
  if (!token && req.query.token) {
    token = String(req.query.token);
  }

  if (!token) {
    res.status(401).json({ error: 'Token de autenticação necessário' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded as UserPayload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Acesso restrito a administradores' });
    return;
  }
  next();
}

export function generateToken(payload: UserPayload): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as string;
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}
