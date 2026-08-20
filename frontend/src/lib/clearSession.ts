// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
const TOKEN_KEYS = ['media_token', 'accessToken', 'refreshToken', 'user', 'lastCastPosition'];
const COOKIE_PATHS = ['/', '/api', '/api/auth'];
const COOKIE_ATTRS = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0';

/** Remove todos os cookies do domínio atual (inclui httpOnly refresh/session de paths /api). */
export function clearAllCookies(): void {
  const domains: string[] = [];
  try {
    domains.push(window.location.hostname);
    domains.push(`.${window.location.hostname}`);
  } catch {}

  (document.cookie || '').split(';').forEach((raw) => {
    const eq = raw.indexOf('=');
    const name = (eq > -1 ? raw.slice(0, eq) : raw).trim();
    if (!name) return;

    for (const path of COOKIE_PATHS) {
      clearCookie(name, path, undefined);
      clearCookie(name, path, undefined, true);
      for (const domain of domains) {
        clearCookie(name, path, domain);
        clearCookie(name, path, domain, true);
      }
    }
  });
}

function clearCookie(name: string, path: string, domain?: string, secure?: boolean): void {
  let cookie = `${name}=; ${COOKIE_ATTRS}; path=${path}; SameSite=Lax`;
  if (domain) cookie += `; domain=${domain}`;
  if (secure) cookie += '; Secure';
  document.cookie = cookie;
}

/** Limpa tokens de auth no localStorage/sessionStorage (media_token, accessToken, etc). */
export function clearSessionStorage(): void {
  for (const key of TOKEN_KEYS) {
    try { localStorage.removeItem(key); } catch {}
    try { sessionStorage.removeItem(key); } catch {}
  }
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}
}

/**
 * Força logout completo: limpa cookies do domínio + storage e avisa os backends.
 * Use num botão de "Forçar Logout" ou rode no console: forceLogoutAndReset()
 */
export async function forceLogoutAndReset(redirectTo = '/dolfimflix/login'): Promise<void> {
  clearAllCookies();
  clearSessionStorage();

  await Promise.allSettled([
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => null),
    fetch('/media-api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => null),
  ]);

  if (typeof window !== 'undefined') window.location.replace(redirectTo);
}

/** Alias legado — limpa completamente a sessão (cookies + storage) e redireciona. */
export const forceLogoutAndClear = forceLogoutAndReset;