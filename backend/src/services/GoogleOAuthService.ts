// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import axios from 'axios';
import { User } from '../models/User';
import { generateToken } from '../middleware/auth';
import { logger } from '../utils/logger';

const COMPONENT = 'GoogleOAuthService';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  verified_email: boolean;
}

export class GoogleOAuthService {
  private static clientId = process.env.GOOGLE_CLIENT_ID || '';
  private static clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  private static redirectUri = process.env.GOOGLE_CALLBACK_URL || 'https://francoscorporation.ddns.net/api/auth/google/callback';
  private static defaultFrontendUrl = process.env.FRONTEND_URL || 'https://francoscorporation.ddns.net';

  /**
   * Generate the Google OAuth authorization URL
   * @param state - Optional state parameter to preserve originating domain (base64 encoded)
   */
  static getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });

    if (state) {
      params.set('state', state);
    }

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  private static async exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
    const response = await axios.post<GoogleTokenResponse>(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    return response.data;
  }

  /**
   * Get user info from Google using access token
   */
  private static async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await axios.get<GoogleUserInfo>(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    return response.data;
  }

  /**
   * Handle the full OAuth flow: exchange code → get user info → find/create user → generate JWT
   * @param code - Authorization code from Google
   * @param ip - Client IP address
   * @param state - Optional state parameter containing the originating frontend URL
   */
  static async handleCallback(code: string, ip?: string, state?: string): Promise<{ accessToken: string; user: any; redirectUrl: string }> {
    // Determine the correct frontend URL from state or fallback to default
    const ALLOWED_ORIGINS = [
      'https://francoscorporation.ddns.net',
      'https://filmes.francoscorporation.ddns.net',
    ];
    let frontendUrl = this.defaultFrontendUrl;
    if (state) {
      try {
        const decoded = Buffer.from(state, 'base64').toString('utf-8');
        const origin = new URL(decoded).origin;
        if (ALLOWED_ORIGINS.includes(origin)) {
          frontendUrl = origin;
          logger.info(COMPONENT, 'Using originating domain from state', { frontendUrl });
        } else {
          logger.warn(COMPONENT, 'State origin not in whitelist, using default', { origin });
        }
      } catch {
        logger.warn(COMPONENT, 'Invalid state parameter, using default frontend URL');
      }
    }

    // Step 1: Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(code);
    logger.info(COMPONENT, 'Google tokens received');

    // Step 2: Get user info from Google
    const googleUser = await this.getUserInfo(tokens.access_token);
    logger.info(COMPONENT, 'Google user info received', { email: googleUser.email });

    if (!googleUser.email) {
      throw new Error('Conta Google sem e-mail. Use outro método de login.');
    }

    // Step 3: Find or create user in database
    let user = await User.findOne({ email: googleUser.email });

    if (user) {
      // User exists — update googleId if not set
      if (!user.googleId) {
        user.googleId = googleUser.id;
      }

      // Update photo if not set
      if (!user.photo && googleUser.picture) {
        user.photo = googleUser.picture;
      }

      // Mark as verified
      if (!user.emailVerified) {
        user.emailVerified = true;
      }

      await user.save();
      logger.info(COMPONENT, 'Existing user logged in via Google', { email: googleUser.email });
    } else {
      // Create new user
      // Generate a unique username from email
      let baseUsername = googleUser.name
        ? googleUser.name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20)
        : googleUser.email.split('@')[0];

      // Check if username exists, append random suffix if needed
      let username = baseUsername;
      let counter = 1;
      while (await User.findOne({ username })) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      user = new User({
        username,
        email: googleUser.email,
        googleId: googleUser.id,
        photo: googleUser.picture || null,
        emailVerified: true, // Google already verified the email
        role: 'user',
      });

      if (ip) {
        (user as any).lastRegisterIP = ip;
      }

      await user.save();
      logger.info(COMPONENT, 'New user created via Google OAuth', { email: googleUser.email, username });
    }

    // Step 4: Generate JWT token
    const accessToken = generateToken({
      _id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      photo: user.photo,
    });

    // Step 5: Build redirect URL with token (using the correct frontend domain)
    const redirectUrl = `${frontendUrl}/oauth?accessToken=${encodeURIComponent(accessToken)}&expiresIn=7d`;

    return {
      accessToken,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        photo: user.photo,
      },
      redirectUrl,
    };
  }
}
