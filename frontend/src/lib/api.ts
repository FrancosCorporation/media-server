// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
/**
 * Limpa tokens e redireciona para o login.
 * Tenta chamar /api/auth/logout para limpar o cookie httpOnly.
 */
export async function logoutAndRedirect() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {}
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

/**
 * Retorna a URL base da API.
 * - Em produção: lê de VITE_API_URL (ex: https://dominio.com/api)
 * - Em desenvolvimento: retorna '/api' (Vite faz proxy para localhost:5000)
 */
export function apiBase(): string {
  try {
    const url = import.meta.env.VITE_API_URL as string | undefined;
    if (url && url.trim()) return url.replace(/\/$/, '');
  } catch {
    // import.meta.env pode não estar disponível em alguns contextos
  }
  return '/api';
}

/**
 * Retorna a URL base de autenticação (apiBase + '/auth').
 * Usada pelas páginas de login, registro, etc.
 */
export function authBase(): string {
  return `${apiBase()}/auth`;
}

/**
 * Retorna o domínio base (sem /api) para URLs de OAuth/Google.
 */
export function domainBase(): string {
  return apiBase().replace(/\/api\/?$/, '');
}

// Evita rajada de refreshes quando várias chamadas recebem 401 ao mesmo tempo
let refreshPromise: Promise<boolean> | null = null;

/**
 * Tenta renovar o access token usando o refresh token (cookie httpOnly).
 * Em caso de sucesso, salva o novo accessToken no localStorage.
 */
async function tryRefreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${apiBase()}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.accessToken) {
          localStorage.setItem('accessToken', data.accessToken);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch(path: string, opts: RequestInit & { skipAuthRedirect?: boolean } = {}) {
  const { skipAuthRedirect, ...fetchOpts } = opts;
  const base = apiBase();
  const url = path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
  const headers = new Headers(fetchOpts.headers || {});
  headers.set('Content-Type', 'application/json');
  const token = localStorage.getItem('accessToken');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const doFetch = () => fetch(url, Object.assign({}, fetchOpts, { headers, credentials: 'include' }));

  let res = await doFetch();

  // 401 → tenta renovar o token automaticamente e repete a requisição uma vez
  // (resolve o caso de sessão expirada no meio do uso, ex: /auth/me)
  if (res.status === 401) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${localStorage.getItem('accessToken')}`);
      res = await doFetch();
    }
  }

  // Se o token renovado também falhou, limpa e redireciona para login
  // (a menos que skipAuthRedirect esteja definido — útil para chamadas não-críticas)
  if (res.status === 401 && !skipAuthRedirect) {
    logoutAndRedirect();
    throw new Error('Sessão expirada. Redirecionando para login...');
  }

  return res;
}
