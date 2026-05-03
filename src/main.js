import { show } from './router.js';
import { initRuntime, getState } from './state.js';

import '../pages/welcome1/welcome1.js?v=102';
import '../pages/welcome2/welcome2.js?v=102';
import '../pages/welcome3/welcome3.js?v=108';
import '../pages/home/home.js?v=101';

function renderBootError(error) {
  console.error(error);

  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = `
    <div style="
      min-height:100vh;
      background:#050505;
      color:#fff;
      padding:20px;
      font-family:Arial,sans-serif;
      white-space:pre-wrap;
      line-height:1.45;
    ">
      Ошибка запуска:

      ${error?.stack || error?.message || error}
    </div>
  `;
}

async function boot() {
  try {
    window.Telegram?.WebApp?.ready?.();
    window.Telegram?.WebApp?.expand?.();

    initRuntime();

    const state = getState();

    const nickname = state.nickname || state.player?.nickname;
    const city = state.city || state.player?.city;

    if (!nickname) {
      show('welcome1');
      return;
    }

    if (!city) {
      show('welcome3');
      return;
    }

    show('home');
  } catch (error) {
    renderBootError(error);
  }
}

boot();
