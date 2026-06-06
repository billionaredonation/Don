import { show } from './router.js';
import { initRuntime, getState, loadRemote } from './state.js';

import '../pages/auth/auth.js';
import '../pages/welcome1/welcome1.js';
import '../pages/welcome2/welcome2.js';
import '../pages/welcome3/welcome3.js';
import '../pages/preload/preload.js';
import '../pages/home/home.js';

import { verifyTelegramAccess } from './auth/telegramAuth.js';
import { setupTelegramGameShell } from './telegram/telegramGameShell.js';

/*
  ВАЖНО:
  CSS фиксы мобилки НЕ импортируем отсюда.

  Почему:
  - src/main.js находится внутри папки src;
  - если написать import './styles/final-game-fixes.css',
    Vite будет искать файл здесь: src/styles/final-game-fixes.css;
  - если файла нет, сборка падает.

  Мобильный CSS подключай через index.html:

  <link rel="stylesheet" href="./pages/home/mobile-game-fix.css?v=1" />

  Так сборка не будет ломаться из-за неправильного пути в JS.
*/

function renderTelegramOnlyScreen() {
  const root = document.getElementById('app');

  if (!root) return;

  root.innerHTML = `
    <main style="
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:24px;
      background:#050607;
      color:#fff;
      font-family:Arial,sans-serif;
      text-align:center;
    ">
      <section style="
        width:min(430px, 100%);
        padding:24px;
        border:1px solid rgba(255,255,255,.16);
        border-radius:22px;
        background:rgba(255,255,255,.06);
      ">
        <h1 style="margin:0 0 12px;font-size:28px;">
          Запуск только через Telegram
        </h1>

        <p style="margin:0;opacity:.75;line-height:1.45;font-size:15px;">
          Открой игру через Telegram Mini App.
        </p>
      </section>
    </main>
  `;
}

function isTelegramWebApp() {
  return Boolean(window.Telegram?.WebApp?.initData) ||
    Boolean(window.Telegram?.WebApp?.initDataUnsafe?.user);
}

function renderFatalError(error) {
  const root = document.getElementById('app');

  if (!root) return;

  const message = String(error?.stack || error?.message || error || 'Unknown error');

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
      ${message}
    </div>
  `;
}

async function boot() {
  try {
    if (!isTelegramWebApp()) {
      renderTelegramOnlyScreen();
      return;
    }

    await verifyTelegramAccess();

    setupTelegramGameShell();

    initRuntime();

    await loadRemote();

    const state = getState();

    const nickname =
      state.nickname ||
      state.player?.nickname ||
      '';

    const city =
      state.city ||
      state.cityId ||
      state.player?.city ||
      '';

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
    console.error(error);
    renderFatalError(error);
  }
}

boot();
