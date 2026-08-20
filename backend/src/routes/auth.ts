// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { User } from '../models/User';
import { generateToken, authenticateToken } from '../middleware/auth';
import type { AuthRequest } from '../types';
import { logger } from '../utils/logger';
import { GoogleOAuthService } from '../services/GoogleOAuthService';

const router = Router();
const COMPONENT = 'AuthRoute';
import { LoginAttempt } from '../models/LoginAttempt';

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Campos obrigatórios: username, email, password' });
    }

    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) {
      return res.status(409).json({ error: 'Usuário ou email já existe' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({ username, email, password: hashedPassword, role: 'user' });

    // Primeiro usuário é admin
    const count = await User.countDocuments();
    if (count === 1) {
      user.role = 'admin';
      await user.save();
    }

    const token = generateToken({ _id: user._id.toString(), username: user.username, email: user.email, role: user.role, photo: user.photo });
    logger.info(COMPONENT, `User registered: ${username}`);
    res.status(201).json({ token, user: { _id: user._id, username: user.username, role: user.role, photo: user.photo } });
  } catch (err) {
    logger.error(COMPONENT, 'Register error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro interno ao registrar' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const email = req.body.email;
    const identifier = username || email;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Campos obrigatórios: username, password' });
    }

    const ip = req.ip || 'unknown';

    const checkResult = await LoginAttempt.checkAndUpdate(ip, identifier);
    if (!checkResult.allowed) {
      return res.status(429).json({
        error: checkResult.message || 'Muitas tentativas de login. Tente novamente mais tarde.',
        lockedUntil: checkResult.lockedUntil,
      });
    }

    const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });
    if (!user) {
      await LoginAttempt.recordFailure(ip, identifier);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    // Usuários criados via Google OAuth não possuem senha
    if (!user.password) {
      return res.status(401).json({ error: 'Esta conta foi criada com Google. Use o login com Google.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await LoginAttempt.recordFailure(ip, identifier);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    await LoginAttempt.recordSuccess(ip);
    const token = generateToken({ _id: user._id.toString(), username: user.username, email: user.email, role: user.role, photo: user.photo });
    logger.info(COMPONENT, `User logged in: ${user.username}`);
    res.json({ token, user: { _id: user._id, username: user.username, role: user.role, photo: user.photo } });
  } catch (err) {
    logger.error(COMPONENT, 'Login error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro interno ao fazer login' });
  }
});

// ─── Google OAuth Routes ───────────────────────────────────────

/**
 * GET /api/auth/google
 * Initiates Google OAuth flow - redirects user to Google consent screen
 */
router.get('/google', (req: Request, res: Response) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      logger.warn(COMPONENT, 'Google OAuth não configurado: variáveis de ambiente ausentes');
      return res.status(503).json({
        error: { message: 'Login com Google não está disponível no momento. Tente novamente mais tarde.' },
      });
    }

    // Pass the originating domain as state so callback redirects to the correct frontend
    const referer = req.headers.referer || req.headers.origin || '';
    let state: string | undefined;
    if (referer) {
      try {
        const origin = new URL(referer).origin;
        state = Buffer.from(origin).toString('base64');
      } catch { /* invalid referer, skip state */ }
    }
    const authUrl = GoogleOAuthService.getAuthorizationUrl(state);
    logger.info(COMPONENT, 'Redirecionando para Google OAuth', { authUrl: authUrl.substring(0, 100) + '...' });
    res.redirect(authUrl);
  } catch (err) {
    logger.error(COMPONENT, 'Erro ao iniciar Google OAuth', { error: err instanceof Error ? err.message : String(err) });
    const frontendUrl = process.env.FRONTEND_URL || 'https://francoscorporation.ddns.net';
    res.redirect(`${frontendUrl}/login?error=google_auth_unavailable`);
  }
});

/**
 * GET /api/auth/google/callback
 * Google OAuth callback - exchanges code for tokens and creates/finds user
 */
router.get('/google/callback', async (req: Request, res: Response) => {
  // Helper: resolve frontend URL from state parameter (with whitelist validation)
  const ALLOWED_ORIGINS = [
    'https://francoscorporation.ddns.net',
    'https://filmes.francoscorporation.ddns.net',
  ];
  const defaultFrontend = process.env.FRONTEND_URL || 'https://francoscorporation.ddns.net';
  const resolveFrontend = (state?: string): string => {
    if (!state) return defaultFrontend;
    try {
      const origin = new URL(Buffer.from(state, 'base64').toString('utf-8')).origin;
      return ALLOWED_ORIGINS.includes(origin) ? origin : defaultFrontend;
    } catch { return defaultFrontend; }
  };

  try {
    const { code, error } = req.query;
    const state = (typeof req.query.state === 'string') ? req.query.state : undefined;
    const frontendUrl = resolveFrontend(state);

    if (error) {
      logger.warn(COMPONENT, 'Google OAuth negado pelo usuário', { error });
      return res.redirect(`${frontendUrl}/login?error=google_auth_denied`);
    }

    if (!code || typeof code !== 'string') {
      logger.warn(COMPONENT, 'Google OAuth callback sem código', { query: req.query });
      return res.redirect(`${frontendUrl}/login?error=google_auth_invalid`);
    }

    const ip = req.ip || 'unknown';
    const result = await GoogleOAuthService.handleCallback(code, ip, state);

    logger.info(COMPONENT, 'Google OAuth callback bem-sucedido', { email: result.user.email });

    // Redirect to frontend with token
    return res.redirect(result.redirectUrl);
  } catch (err) {
    logger.error(COMPONENT, 'Erro no Google OAuth callback', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.substring(0, 200) : undefined,
    });
    const state = (typeof req.query.state === 'string') ? req.query.state : undefined;
    const frontendUrl = resolveFrontend(state);
    res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
  }
});

// ─── GET /me ──────────────────────────────────────────────────
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await User.findById(authReq.user?._id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json(user);
  } catch (err) {
    logger.error(COMPONENT, 'Get /me error', { error: err instanceof Error ? err.message : String(err) });
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
});

// ─── POST /logout ─────────────────────────────────────────────
// Auth stateless (JWT no header): logout não exige estado no servidor.
// Responde SEMPRE 200 OK mesmo sem token válido (idempotente).
router.post('/logout', (_req: Request, res: Response) => {
  res.json({ ok: true, message: 'Sessão encerrada' });
});

export default router;
