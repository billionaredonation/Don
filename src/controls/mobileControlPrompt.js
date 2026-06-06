function isMobileDevice() {
  return (
    window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0
  );
}

function getViewportSize() {
  const width = Math.round(
    window.visualViewport?.width ||
    window.innerWidth ||
    document.documentElement.clientWidth ||
    window.screen?.width ||
    0
  );

  const height = Math.round(
    window.visualViewport?.height ||
    window.innerHeight ||
    document.documentElement.clientHeight ||
    window.screen?.height ||
    0
  );

  return { width, height };
}

function syncViewportSize() {
  const { width, height } = getViewportSize();

  if (width > 0) {
    document.documentElement.style.setProperty('--mn-vw', `${width}px`);
  }

  if (height > 0) {
    document.documentElement.style.setProperty('--mn-vh', `${height}px`);
  }
}

async function requestLandscapeFullscreen() {
  syncViewportSize();

  document.body?.classList.add('mn-landscape-game');

  try {
    window.Telegram?.WebApp?.expand?.();
  } catch {
    // Telegram WebApp может быть недоступен вне Mini App.
  }

  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Fullscreen часто запрещён без пользовательского жеста.
  }

  try {
    await screen.orientation?.lock?.('landscape');
  } catch {
    // iOS/Telegram WebView часто не дают программно закрепить landscape.
  }
}

export function setupMobileControlPrompt({
  root,
  layer,
  enableJoystick,
}) {
  if (!root || !layer) return null;

  if (!isMobileDevice()) {
    layer.innerHTML = '';
    return null;
  }

  let joystickCleanup = null;

  layer.innerHTML = `
    <button class="mobile-control-toggle" type="button" aria-label="Включить мобильное управление">
      🎮
    </button>

    <div class="mobile-control-panel" hidden>
      <div class="mobile-control-card">
        <h3>Мобильное управление</h3>

        <p>
          Поверни телефон боком. Игра рассчитана на landscape-режим.
        </p>

        <p class="mobile-control-hint">
          Если Telegram не даст закрепить поворот автоматически,
          просто держи телефон горизонтально.
        </p>

        <div class="mobile-control-actions">
          <button class="mobile-control-cancel" type="button">
            Отмена
          </button>

          <button class="mobile-control-accept" type="button">
            Включить
          </button>
        </div>
      </div>
    </div>
  `;

  const toggle = layer.querySelector('.mobile-control-toggle');
  const panel = layer.querySelector('.mobile-control-panel');
  const cancel = layer.querySelector('.mobile-control-cancel');
  const accept = layer.querySelector('.mobile-control-accept');

  function openPanel() {
    panel.hidden = false;
  }

  function closePanel() {
    panel.hidden = true;
  }

  async function enableMobileMode() {
    closePanel();

    root.dataset.mobileControls = 'enabled';
    document.body?.classList.add('mn-landscape-game');

    await requestLandscapeFullscreen();

    joystickCleanup?.();
    joystickCleanup = enableJoystick?.() || null;
  }

  toggle.addEventListener('click', openPanel);
  cancel.addEventListener('click', closePanel);
  accept.addEventListener('click', enableMobileMode);

  window.addEventListener('resize', syncViewportSize, { passive: true });
  window.addEventListener('orientationchange', syncViewportSize, { passive: true });
  syncViewportSize();

  return () => {
    toggle.removeEventListener('click', openPanel);
    cancel.removeEventListener('click', closePanel);
    accept.removeEventListener('click', enableMobileMode);

    window.removeEventListener('resize', syncViewportSize);
    window.removeEventListener('orientationchange', syncViewportSize);

    joystickCleanup?.();

    layer.innerHTML = '';
  };
}
