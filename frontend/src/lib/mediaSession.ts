// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { clearAllCookies, clearSessionStorage } from './clearSession';

export const MEDIA_LOGIN_PATH = '/dolfimflix/login';

let navigateTo: ((path: string) => void) | null = null;
let lastRedirectAt = 0;

/** Registra o bridge do React Router (feito uma vez no AppLayout). */
export function registerMediaNavigator(fn: (path: string) => void): void {
  navigateTo = fn;
}

/** Desregistra o bridge ao desmontar. */
export function unregisterMediaNavigator(): void {
  navigateTo = null;
}

/** Limpa todos os tokens + cookies de sessão (media, corp e afins). */
export function clearMediaSession(): void {
  clearAllCookies();
  clearSessionStorage();
}

/**
 * Redireciona para o login via React Router quando disponível;
 * fallback para window.location.replace fora do contexto do router.
 * Guard anti-bateria: no máximo 1 redirect por 2s.
 */
export function redirectToMediaLogin(): void {
  const now = Date.now();
  if (now - lastRedirectAt < 2000) return;
  lastRedirectAt = now;
  try {
    if (navigateTo) {
      navigateTo(MEDIA_LOGIN_PATH);
      return;
    }
  } catch {}
  if (typeof window !== 'undefined') {
    window.location.replace(MEDIA_LOGIN_PATH);
  }
}

const AUTH_ERROR_PATTERN = /token|jwt|sess|auth|login|unauthorized|inválid|expir|deslogad|autentica/i;

/**
 * Trata falha de autenticação recebida de qualquer Request do media-api:
 * limpa a sessão corrompida e redireciona para o login.
 * 401 → sempre. 400 → só quando o corpo indica problema de token/sessão.
 */
export function handleAuthFailure(status: number, errorBody?: string): void {
  const isAuthError =
    status === 401 ||
    (status === 400 && !!errorBody && AUTH_ERROR_PATTERN.test(errorBody));

  if (!isAuthError) return;

  clearMediaSession();
  redirectToMediaLogin();
}