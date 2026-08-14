const GAME_TOAST_SELECTOR = '[data-game-toast="true"]';

function getToastDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return 3000;
  return Math.min(10000, Math.max(800, duration));
}

function createToast() {
  const notice = document.createElement('div');
  notice.className = 'admin-floating-notice mn-game-toast';
  notice.dataset.gameToast = 'true';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.style.cssText = `
    position: fixed;
    left: 50%;
    top: 18px;
    z-index: 100000;
    transform: translateX(-50%);
    max-width: min(520px, calc(100vw - 24px));
    padding: 10px 14px;
    border: 1px solid rgba(255,255,255,0.16);
    border-radius: 14px;
    background: rgba(8, 12, 18, 0.92);
    color: #fff;
    font: 800 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    box-shadow: 0 12px 36px rgba(0,0,0,0.45);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    pointer-events: none;
    text-align: center;
  `;
  document.body.appendChild(notice);
  return notice;
}

export function enableGameToastFeature() {
  document.querySelector(GAME_TOAST_SELECTOR)?.remove();

  let hideTimer = 0;

  function handleToast(event) {
    const message = String(event?.detail?.message || '').trim();
    if (!message) return;

    const notice = document.querySelector(GAME_TOAST_SELECTOR) || createToast();
    notice.textContent = message;
    notice.dataset.type = String(event?.detail?.type || 'info');

    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      notice.remove();
      hideTimer = 0;
    }, getToastDuration(event?.detail?.durationMs));
  }

  window.addEventListener('mn:toast', handleToast);

  return () => {
    window.removeEventListener('mn:toast', handleToast);
    window.clearTimeout(hideTimer);
    document.querySelector(GAME_TOAST_SELECTOR)?.remove();
  };
}
