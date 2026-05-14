const MOBILE_CONTROLS_KEY = 'mn_mobile_controls_enabled';

function isMobileDevice() {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

function hasMobileControlsEnabled() {
  return localStorage.getItem(MOBILE_CONTROLS_KEY) === '1';
}

function saveMobileControlsEnabled() {
  localStorage.setItem(MOBILE_CONTROLS_KEY, '1');
}

async function requestGameFullscreen() {
  const target = document.documentElement;

  try {
    if (target.requestFullscreen && !document.fullscreenElement) {
      await target.requestFullscreen();
    }
  } catch (error) {
    console.warn('[mobileControls] fullscreen failed:', error);
  }
}

async function lockLandscape() {
  try {
    if (screen.orientation?.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch (error) {
    console.warn('[mobileControls] orientation lock failed:', error);
  }
}

async function enterMobileGameMode(root) {
  root.dataset.mobileControls = 'enabled';

  await requestGameFullscreen();
  await lockLandscape();
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
    <button class="mobile-control-toggle" type="button" aria-label="Mobile controls">
      🎮
      <span class="mobile-control-dot"></span>
    </button>

    <div class="mobile-control-tip">
      Мобильное управление здесь
    </div>

    <div class="mobile-control-panel" hidden>
      <div class="mobile-control-card">
        <strong>Мобильное управление</strong>

        <p>
          Если вы играете с ПК — оставайтесь на стандартном управлении.
          Если вы играете с телефона — рекомендуем включить мобильное управление.
        </p>

        <p class="mobile-control-hint">
          После включения игра откроется на весь экран.
          Поверните телефон на бок для нормальной игры.
        </p>

        <div class="mobile-control-actions">
          <button class="mobile-control-cancel" type="button">
            Оставить стандартное
          </button>

          <button class="mobile-control-accept" type="button">
            Включить
          </button>
        </div>
      </div>
    </div>
  `;

  const toggle = layer.querySelector('.mobile-control-toggle');
  const tip = layer.querySelector('.mobile-control-tip');
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
    saveMobileControlsEnabled();

    tip.hidden = true;
    toggle.classList.add('is-enabled');

    await enterMobileGameMode(root);

    joystickCleanup?.();
    joystickCleanup = enableJoystick?.() || null;
  }

  toggle.addEventListener('click', openPanel);
  cancel.addEventListener('click', closePanel);
  accept.addEventListener('click', enableMobileMode);

  if (hasMobileControlsEnabled()) {
    tip.hidden = true;
    toggle.classList.add('is-enabled');

    enterMobileGameMode(root).finally(() => {
      joystickCleanup?.();
      joystickCleanup = enableJoystick?.() || null;
    });
  } else {
    setTimeout(() => {
      if (!hasMobileControlsEnabled()) {
        tip.classList.add('is-visible');
      }
    }, 1200);
  }

  return () => {
    toggle.removeEventListener('click', openPanel);
    cancel.removeEventListener('click', closePanel);
    accept.removeEventListener('click', enableMobileMode);

    joystickCleanup?.();

    layer.innerHTML = '';
  };
}
