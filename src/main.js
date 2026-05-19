// src/main.js
import { show } from './router.js';
import { initRuntime, getState, loadRemote } from './state.js';

// статические страницы
import '../pages/auth/auth.js';
import '../pages/welcome1/welcome1.js';
import '../pages/welcome2/welcome2.js';
import '../pages/welcome3/welcome3.js';
import '../pages/preload/preload.js';
import '../pages/home/home.js';
import { verifyTelegramAccess } from './auth/telegramAuth.js';
function renderTelegramOnlyScreen() {
  const root = document.getElementById('app');

  if (!root) {
    return;
  }

  root.innerHTML = `
    <main style="
      min-height:100dvh;
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
        box-shadow:0 24px 90px rgba(0,0,0,.58);
      ">
        <h1 style="margin:0 0 12px;font-size:28px;">
          Запуск только через Telegram
        </h1>

        <p style="margin:0;opacity:.75;line-height:1.45;font-size:15px;">
          Открой игру через Telegram Mini App.
          В обычном браузере вход отключён.
        </p>
      </section>
    </main>
  `;
}

function isTelegramWebApp() {
  return Boolean(window.Telegram?.WebApp?.initData) ||
    Boolean(window.Telegram?.WebApp?.initDataUnsafe?.user);
}

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
    if (!isTelegramWebApp()) {
      renderTelegramOnlyScreen();
      return;
    }

    await verifyTelegramAccess();
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

boot();
