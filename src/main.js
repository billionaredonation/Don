// src/main.js
import { show } from './router.js';
import { initRuntime, getState, loadRemote } from './state.js';

// статические страницы
import '../pages/welcome1/welcome1.js';
import '../pages/welcome2/welcome2.js';
import '../pages/welcome3/welcome3.js';
import '../pages/preload/preload.js';
import '../pages/home/home-screen.js';

function renderBootError(error) {
  console.error(error);

  const root = document.getElementById('app');

  if (!root) {
    return;
  }

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
    await loadRemote();

    const currentState = getState();

    const nickname =
      currentState.nickname ||
      currentState.player?.nickname;

    const city =
      currentState.city ||
      currentState.cityId ||
      currentState.player?.city ||
      currentState.player?.cityId;

    if (!nickname) {
      show('welcome1');
      return;
    }

    if (!city) {
      show('welcome3');
      return;
    }

    show('preload', {
      next: 'home',
      mode: 'return',
    });
  } catch (error) {
    renderBootError(error);
  }
}

boot();
