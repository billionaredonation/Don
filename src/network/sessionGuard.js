import {
  getSessionId,
  getActivePlayerSession,
} from '../player/playerPosition.js';

function hideGameplayOverlays() {
  const selectors = [
    '.pc-stamina',
    '.mobile-stamina',
    '[data-mobile-stamina]',
    '.mobile-controls-layer',
    '.mobile-joystick',
    '.mobile-self-player-indicator',
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

  document.querySelectorAll(selectors.join(',')).forEach((node) => {
    if (node?.classList?.contains('mn-session-blocked-screen')) return;
    node.remove();
  });
}

function renderBlockedSession(root) {
  if (!root) return;

  document.body?.classList.add('mn-session-blocked');
  document.documentElement?.classList.add('mn-session-blocked');

  root.classList?.add('mn-session-blocked-root');
  root.removeAttribute?.('data-mobile-controls');

  hideGameplayOverlays();

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

  const timer = setInterval(checkSession, 2500);

  checkSession();

  return () => {
    destroyed = true;
    clearInterval(timer);

    if (!blocked) {
      document.body?.classList.remove('mn-session-blocked');
      document.documentElement?.classList.remove('mn-session-blocked');
    }
  };
}
