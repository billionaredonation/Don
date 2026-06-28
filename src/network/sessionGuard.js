import {
  getSessionId,
  getActivePlayerSession,
} from '../player/playerPosition.js';

function renderBlockedSession(root) {
  if (!root) return;

  document.body?.classList.add('mn-session-blocked');
  document.documentElement?.classList.add('mn-session-blocked');

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
