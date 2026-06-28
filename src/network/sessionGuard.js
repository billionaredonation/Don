import {
  getSessionId,
  getActivePlayerSession,
} from '../player/playerPosition.js';

const GAMEPLAY_OVERLAY_SELECTORS = [
  '.pc-stamina',
  '.mobile-stamina',
  '[data-mobile-stamina]',
  '.mobile-controls-layer',
  '.mobile-joystick',
  '.mobile-self-player-indicator',
  '.mobile-self-player-dot',
  '[data-mobile-self-marker-hard="true"]',
  '.gta-player-marker-self',
  '.gta-player-marker',
  '.player-glass-hud',
  '.player-weather-mini',
  '.player-network-card',
  '.admin-status-dot',
  '.house-selection-panel',
  '.entity-interaction-hint',
  '.entity-interaction-notice',
];

function removeGameplayNode(node) {
  if (!node || node.classList?.contains('mn-session-blocked-screen')) return;
  if (node.classList?.contains('mn-session-blocked-card')) return;
  node.remove?.();
}

function hideGameplayOverlays() {
  document
    .querySelectorAll(GAMEPLAY_OVERLAY_SELECTORS.join(','))
    .forEach(removeGameplayNode);
}

function installSessionOverlayKiller() {
  if (window.__MN_SESSION_OVERLAY_KILLER_INSTALLED === true) return;

  window.__MN_SESSION_OVERLAY_KILLER_INSTALLED = true;

  const observer = new MutationObserver((mutations) => {
    if (window.__MN_SESSION_BLOCKED !== true) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;

        if (node.matches?.(GAMEPLAY_OVERLAY_SELECTORS.join(','))) {
          removeGameplayNode(node);
        }

        node
          .querySelectorAll?.(GAMEPLAY_OVERLAY_SELECTORS.join(','))
          .forEach(removeGameplayNode);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  const timer = window.setInterval(() => {
    if (window.__MN_SESSION_BLOCKED === true) {
      hideGameplayOverlays();
    }
  }, 90);

  window.__MN_SESSION_OVERLAY_KILLER_CLEANUP = () => {
    observer.disconnect();
    window.clearInterval(timer);
    window.__MN_SESSION_OVERLAY_KILLER_INSTALLED = false;
    delete window.__MN_SESSION_OVERLAY_KILLER_CLEANUP;
  };
}

function renderBlockedSession(root) {
  if (!root) return;

  window.__MN_SESSION_BLOCKED = true;

  document.body?.classList.add('mn-session-blocked');
  document.documentElement?.classList.add('mn-session-blocked');

  root.classList?.add('mn-session-blocked-root');
  root.removeAttribute?.('data-mobile-controls');

  hideGameplayOverlays();
  installSessionOverlayKiller();

  root.innerHTML = `
    <main class="mn-session-blocked-screen" role="alert" aria-live="assertive">
      <section class="mn-session-blocked-card">
        <h2>Аккаунт открыт на другом устройстве</h2>
        <p>
          Играть можно только с одного устройства одновременно.
          Обнови страницу здесь, если хочешь продолжить на этом устройстве.
        </p>
      </section>
    </main>
  `;

  window.dispatchEvent(new CustomEvent('mn:session-blocked'));

  hideGameplayOverlays();
  requestAnimationFrame(() => hideGameplayOverlays());
  setTimeout(() => hideGameplayOverlays(), 80);
  setTimeout(() => hideGameplayOverlays(), 240);
  setTimeout(() => hideGameplayOverlays(), 600);
}

export function setupSessionGuard(root) {
  let destroyed = false;
  let blocked = false;

  async function checkSession() {
    if (destroyed || blocked) return;

    try {
      const localSessionId = getSessionId();
      const activeSessionId = await getActivePlayerSession();

      if (activeSessionId && activeSessionId !== localSessionId) {
        blocked = true;
        destroyed = true;
        renderBlockedSession(root);
      }
    } catch (error) {
      console.warn('[sessionGuard] check failed:', error);
    }
  }

  checkSession();

  const timer = setInterval(checkSession, 8000);

  return () => {
    destroyed = true;
    clearInterval(timer);

    if (!blocked) {
      window.__MN_SESSION_BLOCKED = false;
      document.body?.classList.remove('mn-session-blocked');
      document.documentElement?.classList.remove('mn-session-blocked');
      window.__MN_SESSION_OVERLAY_KILLER_CLEANUP?.();
    }
  };
}
