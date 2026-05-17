function isMobileDevice() {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

async function requestGameFullscreen() {
  const target = document.documentElement;

  try {
    if (target.requestFullscreen) {
      await target.requestFullscreen();
    }
  } catch (error) {
    console.warn('[mobileControls] fullscreen failed:', error);
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
    <button class="mobile-control-toggle" type="button">
      Мобильное управление
    </button>

    <div class="mobile-control-panel" hidden>
      <div class="mobile-control-card">
        <h3>Мобильное управление</h3>

        <p>
          Если вы играете с ПК — оставайтесь на стандартном управлении.
          Если вы играете с телефона — рекомендуем включить мобильное управление.
        </p>

        <p>
          После включения игра попробует открыться на весь экран.
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

    await requestGameFullscreen();

    joystickCleanup?.();
    joystickCleanup = enableJoystick?.() || null;
  }

  toggle.addEventListener('click', openPanel);
  cancel.addEventListener('click', closePanel);
  accept.addEventListener('click', enableMobileMode);

  return () => {
    toggle.removeEventListener('click', openPanel);
    cancel.removeEventListener('click', closePanel);
    accept.removeEventListener('click', enableMobileMode);

    joystickCleanup?.();

    layer.innerHTML = '';
  };
}
