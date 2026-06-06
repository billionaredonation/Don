function isMobileDevice() {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

function syncViewportSize() {
  const height = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);

  if (height > 0) {
    document.documentElement.style.setProperty('--mn-vh', `${height}px`);
  }
}

async function requestLandscapeFullscreen() {
  const target = document.documentElement;

  syncViewportSize();

  try {
    window.Telegram?.WebApp?.expand?.();
  } catch {
    // Telegram WebApp может быть недоступен вне Mini App.
  }

  try {
    if (!document.fullscreenElement && target.requestFullscreen) {
      await target.requestFullscreen();
    }
  } catch (error) {
    console.warn('[mobileControls] fullscreen failed:', error);
  }

  try {
    await screen.orientation?.lock?.('landscape');
  } catch (error) {
    console.warn('[mobileControls] landscape lock failed:', error);
  }
}

export function setupMobileControlPrompt({
  root,
  layer,
  enableJoystick,
}) {
  if (!root || !layer) return null;

  const mobile = isMobileDevice();

  if (!mobile) {
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
          На телефоне управление включается в landscape-режиме.
          Поверни телефон боком, чтобы карта, модалки и джойстик не расползались.
        </p>

        <p class="mobile-control-hint">
          Игра попробует открыть полноэкранный режим и зафиксировать landscape.
          Если браузер не разрешит фиксацию — просто поверни телефон вручную.
        </p>

        <div class="mobile-control-actions">
          <button class="mobile-control-cancel" type="button">
            Оставить стандартное
          </button>

          <button class="mobile-control-accept" type="button">
            Включить landscape
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

  window.addEventListener('resize', syncViewportSize);
  window.addEventListener('orientationchange', syncViewportSize);
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
