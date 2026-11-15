// Адрес API.
// Если страницу отдаёт сам сервер (Electron на http://127.0.0.1:4000, боевой деплой), API живёт на том же
// origin — используем его. Раньше в Electron жёстко стоял http://localhost:4000, а окно открыто на
// 127.0.0.1: это разные сайты для cookie, и сессия/сокет не работали.
// Только в режиме `vite dev` (порт 5173) и при открытии не по http(s) берём VITE_API_BASE.
export const API_BASE = (() => {
  const explicitBase: string | undefined = import.meta.env.VITE_API_BASE;
  const isElectron =
    typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron');

  // В вебе с отдельно размещённым клиентом явный VITE_API_BASE по-прежнему главнее.
  if (!isElectron && explicitBase) {
    return explicitBase;
  }

  if (typeof window !== 'undefined') {
    const { protocol, origin, port } = window.location;
    const isHttp = protocol === 'http:' || protocol === 'https:';
    const isViteDevServer = port === '5173';
    if (isHttp && !isViteDevServer) {
      return origin;
    }
  }
  return explicitBase || 'http://localhost:4000';
})();

const CSRF_HEADER = 'X-CSRF-Token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

async function requestCsrfToken() {
  const response = await fetch(`${API_BASE}/api/security/csrf-token`, {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('Не удалось получить CSRF токен');
  }
  const payload = (await response.json()) as { token?: string };
  if (!payload?.token) {
    throw new Error('Некорректный ответ CSRF сервера');
  }
  csrfToken = payload.token;
  return csrfToken;
}

export async function ensureCsrfToken(force = false) {
  if (!force && csrfToken) {
    return csrfToken;
  }
  if (!csrfPromise || force) {
    csrfPromise = requestCsrfToken().finally(() => {
      csrfPromise = null;
    });
  }
  return csrfPromise;
}

export function clearCsrfToken() {
  csrfToken = null;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});

  if (!SAFE_METHODS.has(method)) {
    const token = await ensureCsrfToken();
    headers.set(CSRF_HEADER, token);
  }

  const absoluteUrl = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const response = await fetch(absoluteUrl, {
    ...init,
    method,
    headers,
    credentials: init.credentials ?? 'include'
  });

  const refreshed = response.headers.get(CSRF_HEADER);
  if (refreshed) {
    csrfToken = refreshed;
  }

  if (!response.ok && response.status === 403) {
    clearCsrfToken();
  }

  return response;
}

