function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function isLowPowerDevice() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return reducedMotion || memory <= 3 || cores <= 4;
}

function getMapRatio(viewport) {
  const image = viewport?.querySelector?.('.gta-map-image:not(.gta-map-glow)');

  if (!image) return 0.72;

  const naturalWidth = Number(image.naturalWidth || 0);
  const naturalHeight = Number(image.naturalHeight || 0);

  if (!naturalWidth || !naturalHeight) return 0.72;

  return naturalHeight / naturalWidth;
}

export function enableMapControls(stage, viewport, options = {}) {
  const isMobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;

  const LOCKED_SCALE = isMobile
    ? Number(options.startScale) || 2.25
    : Number(options.startScale) || 3;

  const WORLD_FACTOR = isMobile ? 3.6 : 3.95;

  let scale = LOCKED_SCALE;
  let x = 0;
  let y = 0;

  let worldWidth = 0;
  let worldHeight = 0;

  function measureWorld() {
    const rect = stage.getBoundingClientRect();
    const baseSize = Math.max(rect.width, rect.height);
    const ratio = getMapRatio(viewport);

    worldWidth = baseSize * WORLD_FACTOR;
    worldHeight = worldWidth * ratio;

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

  function refresh(focusX = options.focusX, focusY = options.focusY) {
    measureWorld();
    focusOnPlayer(focusX, focusY);
  }

  function onResize() {
    refresh();
  }

  window.addEventListener('resize', onResize);

  const image = viewport.querySelector('.gta-map-image:not(.gta-map-glow)');

  if (image && !image.complete) {
    image.addEventListener('load', () => refresh(), { once: true });
  }

  refresh();

  return {
    cleanup() {
      window.removeEventListener('resize', onResize);
    },

    focusOnPlayer,
    refresh,
  };
}
