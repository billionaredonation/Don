function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function isLowPowerDevice() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const isSmallScreen = window.matchMedia('(max-width: 520px)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return reducedMotion || memory <= 3 || cores <= 4 || isSmallScreen;
}

export function enableMapControls(stage, viewport, options = {}) {
  const lowPower = isLowPowerDevice();

  const LOCKED_SCALE = Number(options.startScale) || 3;
  const WORLD_FACTOR = lowPower ? 2.00 : 3.95;

  let scale = LOCKED_SCALE;
  let x = 0;
  let y = 0;

  let worldWidth = 0;
  let worldHeight = 0;

  function measureWorld() {
    const rect = stage.getBoundingClientRect();

    worldWidth = Math.max(rect.width, rect.height) * WORLD_FACTOR;
    worldHeight = worldWidth * 0.72;

    viewport.style.width = `${worldWidth}px`;
    viewport.style.height = `${worldHeight}px`;
  }

  function getLimits() {
    const rect = stage.getBoundingClientRect();

    const w = worldWidth * scale;
    const h = worldHeight * scale;

    return {
      maxX: Math.max(0, (w - rect.width) / 2),
      maxY: Math.max(0, (h - rect.height) / 2),
    };
  }

  function applyTransform() {
    scale = LOCKED_SCALE;

    const limits = getLimits();

    x = clamp(x, -limits.maxX, limits.maxX);
    y = clamp(y, -limits.maxY, limits.maxY);

    viewport.style.transform =
      `translate(-50%, -50%) translate3d(${x}px, ${y}px, 0) scale(${scale})`;

    stage.style.setProperty('--zoom', scale.toFixed(2));
  }

  function focusOnPlayer(playerX, playerY) {
    const focusX = Number(playerX);
    const focusY = Number(playerY);

    if (!Number.isFinite(focusX) || !Number.isFinite(focusY)) return;

    const fx = (focusX / 100 - 0.5) * worldWidth * scale;
    const fy = (focusY / 100 - 0.5) * worldHeight * scale;

    x = -fx;
    y = -fy;

    applyTransform();
  }

  function onResize() {
    measureWorld();
    focusOnPlayer(options.focusX, options.focusY);
  }

  window.addEventListener('resize', onResize);

  measureWorld();
  focusOnPlayer(options.focusX, options.focusY);

  return {
    cleanup() {
      window.removeEventListener('resize', onResize);
    },

    focusOnPlayer,
  };
}
