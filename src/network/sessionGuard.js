import {
  getSessionId,
  getActivePlayerSession,
} from '../player/playerPosition.js';

export function setupSessionGuard(root) {
  let destroyed = false;

  async function checkSession() {
    if (destroyed) return;

    try {
      const localSessionId = getSessionId();
      const activeSessionId = await getActivePlayerSession();

      if (activeSessionId && activeSessionId !== localSessionId) {
        destroyed = true;

        root.innerHTML = `
          <main class="home-gameplay">
            <section class="gta-map-stage">
              <div style="
                position:absolute;
                inset:0;
                display:flex;
                align-items:center;
                justify-content:center;
                padding:24px;
                background:#050607;
                color:white;
                text-align:center;
                z-index:9999;
              ">
                <div style="
                  max-width:420px;
                  padding:22px;
                  border:1px solid rgba(255,255,255,.18);
                  border-radius:18px;
                  background:rgba(255,255,255,.06);
                ">
                  <h2 style="margin:0 0 10px;">Аккаунт открыт на другом устройстве</h2>
                  <p style="margin:0; opacity:.8;">
                    Играть можно только с одного устройства одновременно.
                    Обнови страницу здесь, если хочешь продолжить на этом устройстве.
                  </p>
                </div>
              </div>
            </section>
          </main>
        `;
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
  };
}
