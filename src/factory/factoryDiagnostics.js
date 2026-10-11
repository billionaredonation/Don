// Temporary factory diagnostics. Set false to hide the panel and stop recording.
export const FACTORY_DIAGNOSTICS_ENABLED = true;
const VERSION = 'FACTORY-DIAG-20261011-1';
const entries = [];
const listeners = new Set();

function safeText(value) {
  let text = String(value ?? '');
  const initData = String(globalThis.window?.Telegram?.WebApp?.initData || '');
  for (const secret of [initData, encodeURIComponent(initData)]) {
    if (secret) text = text.split(secret).join('[REDACTED]');
  }
  return text
    .replace(/(?:initData|authorization|apikey|access_token|refresh_token|hash|signature)\s*[=:]\s*[^\s,}]+/gi, '[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]')
    .slice(0, 1600);
}

export function factoryDiagnostic(stage, message = '') {
  if (!FACTORY_DIAGNOSTICS_ENABLED) return;
  entries.push(`${new Date().toISOString()} | ${safeText(stage)} | ${safeText(message)}`);
  if (entries.length > 60) entries.shift();
  for (const listener of listeners) listener();
}

export function mountFactoryDiagnostics(modal) {
  if (!FACTORY_DIAGNOSTICS_ENABLED) return () => {};
  const host = document.createElement('section');
  host.style.cssText = 'padding:12px;margin-bottom:14px;border:1px solid #e5bc59;border-radius:12px;background:#17150e;color:#fff';
  host.innerHTML = `<strong>Временная диагностика завода · ${VERSION}</strong>
    <p style="margin:6px 0">После попытки запуска скопируйте отчёт. Если копирование недоступно, выделите текст ниже.</p>
    <textarea readonly aria-label="Диагностика завода" style="display:block;box-sizing:border-box;width:100%;height:150px;background:#090b09;color:#fff;font:12px monospace;white-space:pre-wrap"></textarea>
    <button type="button" style="margin-top:8px">Скопировать диагностику</button>
    <span role="status" style="margin-left:8px"></span>`;
  modal.querySelector('main').prepend(host);
  const area = host.querySelector('textarea');
  const status = host.querySelector('[role="status"]');
  const update = () => {
    area.value = `${VERSION}\n${entries.join('\n')}`;
    area.scrollTop = area.scrollHeight;
  };
  listeners.add(update);
  factoryDiagnostic('Панель подключена', 'Ожидание открытия завода');
  host.querySelector('button').onclick = async () => {
    try {
      await navigator.clipboard.writeText(area.value);
      status.textContent = 'Скопировано';
    } catch {
      area.focus(); area.select(); area.setSelectionRange(0, area.value.length);
      status.textContent = 'Текст выделен — скопируйте вручную';
    }
  };
  return () => { listeners.delete(update); host.remove(); };
}
