const routerStore = window.__MN_GAME_ROUTER__ || {
  screens: {}
};

window.__MN_GAME_ROUTER__ = routerStore;

export const screens = routerStore.screens;

export function register(id, fn) {
  screens[id] = fn;
}

export function show(id, props = {}) {
  const root = document.getElementById('app');

  if (!root) {
    console.error('Root element #app not found');
    return;
  }

  root.innerHTML = '';

  if (!screens[id]) {
    const registeredScreens = Object.keys(screens);

    root.innerHTML = `
      <div style="padding:20px;color:white;background:#050505;min-height:100vh;font-family:Arial">
        Ошибка: экран "${id}" не найден<br>
        Зарегистрированы: ${registeredScreens.join(', ') || 'ничего'}
      </div>
    `;

    return;
  }

  screens[id](root, props);
  window.currentScreen = id;
}

