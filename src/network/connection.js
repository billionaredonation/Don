// Shared transport. Never retries gameplay requests: a lost response may hide a commit.
const OFFLINE = 'Нет подключения к интернету. Проверьте соединение.';
const UNREACHABLE = 'Не удалось связаться с сервером. Проверьте интернет или попробуйте позже.';
const UNKNOWN = ' Результат операции неизвестен. После восстановления связи проверьте баланс или состояние игры перед повтором.';
export class ConnectionError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'ConnectionError';
    this.code = code;
    this.cause = cause;
  }
}
const isOffline = () => globalThis.navigator?.onLine === false;
let unavailable = false;
let banner;
let recoveryTimer;
let probe;
let probing = false;
let hideTimer;

function show(message, recovered = false) {
  if (!globalThis.document?.body) return;
  if (!banner) {
    banner = document.createElement('div');
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0px);left:50%;transform:translateX(-50%);z-index:2147483647;max-width:90vw;width:max-content;box-sizing:border-box;padding:10px 16px;border-radius:0 0 12px 12px;background:#38251b;color:#fff;font:14px/1.4 system-ui;text-align:center;pointer-events:none;box-shadow:0 3px 16px #0006';
    document.body.appendChild(banner);
  }
  clearTimeout(hideTimer);
  banner.textContent = message;
  banner.hidden = false;
  banner.style.background = recovered ? '#174c36' : '#38251b';
  if (recovered) hideTimer = setTimeout(() => { banner.hidden = true; }, 4000);
}
function failed(message) {
  unavailable = true;
  show(message);
  if (probe && !recoveryTimer) recoveryTimer = setTimeout(checkConnection, 5000);
}
function recovered() {
  if (!unavailable || isOffline()) return;
  unavailable = false;
  clearTimeout(recoveryTimer);
  recoveryTimer = null;
  show('Соединение восстановлено.', true);
}
async function checkConnection() {
  clearTimeout(recoveryTimer);
  recoveryTimer = null;
  if (!unavailable || probing || !probe) return;
  probing = true;
  try {
    if (isOffline()) throw new Error('offline');
    await probe();
    recovered();
  } catch {
    show(isOffline() ? OFFLINE : UNREACHABLE);
  } finally {
    probing = false;
    if (unavailable) recoveryTimer = setTimeout(checkConnection, 5000);
  }
}

export function createConnectionFetch(rawFetch, { timeoutMs = 30000 } = {}) {
  return async function connectionFetch(input, init = {}) {
    if (isOffline()) {
      failed(OFFLINE);
      throw new ConnectionError('NETWORK_OFFLINE', OFFLINE + ' Запрос не отправлен.');
    }
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const uncertain = !['GET', 'HEAD', 'OPTIONS'].includes(method) ? UNKNOWN : '';
    const upstream = init.signal || input?.signal;
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort(upstream.reason);
    if (upstream?.aborted) abort();
    else upstream?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await rawFetch(input, { ...init, signal: controller.signal });
      if (response.status >= 500) {
        failed('Сервер временно недоступен. Повторите попытку позже.');
        throw new ConnectionError('SERVER_UNAVAILABLE', 'Сервер временно недоступен.' + uncertain);
      }
      recovered();
      return response;
    } catch (error) {
      if (error instanceof ConnectionError) throw error;
      // Intentional cancellation is not a connectivity failure.
      if (upstream?.aborted && !timedOut) throw error;
      const message = timedOut ? 'Превышено время ожидания ответа сервера.' : isOffline() ? OFFLINE : UNREACHABLE;
      failed(message);
      console.warn('[connection] request failed', error);
      throw new ConnectionError(timedOut ? 'NETWORK_TIMEOUT' : 'NETWORK_UNREACHABLE', message + uncertain, error);
    } finally {
      clearTimeout(timer);
      upstream?.removeEventListener('abort', abort);
    }
  };
}

export function normalizeConnectionError(error) {
  if (error instanceof ConnectionError) return error;
  if (error?.context instanceof ConnectionError) return error.context;
  return error;
}

export function installConnectionMonitor(url, publicKey) {
  if (!globalThis.window || probe) return;
  // Read-only health check; never replay the operation that failed.
  probe = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: publicKey }, cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error('health unavailable');
    } finally { clearTimeout(timer); }
  };
  window.addEventListener('offline', () => failed(OFFLINE));
  window.addEventListener('online', () => {
    unavailable = true;
    show('Проверяем соединение с сервером…');
    void checkConnection();
  });
  const initial = () => { if (isOffline()) failed(OFFLINE); };
  if (document.body) initial();
  else document.addEventListener('DOMContentLoaded', initial, { once: true });
}

export const connectionFetch = createConnectionFetch((...args) => globalThis.fetch(...args));
