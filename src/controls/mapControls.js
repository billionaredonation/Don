function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function isLowPowerDevice() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return reducedMotion || memory <= 3 || cores <= 4;
}

function isMobileGameplay() {
  return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

export function enableMapControls(stage, viewport, options = {}) {
  if (!stage || !viewport) {
    return {
      cleanup() {},
      focusOnPlayer() {},
      refresh() {},
    };
  }

  const mobile = isMobileGameplay();

  const LOCKED_SCALE = Number(options.startScale) || (mobile ? 2.65 : 4.4);
  const WORLD_FACTOR = mobile ? 2.35 : 3.7;
  const MAP_RATIO = 0.72;

  let scale = LOCKED_SCALE;
  let cameraX = 0;
  let cameraY = 0;

  let worldWidth = 0;
  let worldHeight = 0;

  function measureWorld() {
    const rect = stage.getBoundingClientRect();
    const base = Math.max(rect.width, rect.height);

    worldWidth = base * WORLD_FACTOR;
    worldHeight = worldWidth * MAP_RATIO;

    viewport.style.width = `${worldWidth}px`;
    viewport.style.height = `${worldHeight}px`;
    viewport.style.left = '50%';
    viewport.style.top = '50%';
    viewport.style.position = 'absolute';
    viewport.style.overflow = 'visible';
    viewport.style.transformOrigin = 'center center';
  }

  function getCameraLimits() {
    const rect = stage.getBoundingClientRect();

    const scaledWidth = worldWidth * scale;
    const scaledHeight = worldHeight * scale;

    return {
      x: Math.max(0, (scaledWidth - rect.width) / 2),
      y: Math.max(0, (scaledHeight - rect.height) / 2),
    };
  }

  function applyCamera() {
    scale = LOCKED_SCALE;

    const limits = getCameraLimits();

    cameraX = clamp(cameraX, -limits.x, limits.x);
    cameraY = clamp(cameraY, -limits.y, limits.y);

    viewport.style.transform =
      `translate(-50%, -50%) translate3d(${cameraX}px, ${cameraY}px, 0) scale(${scale})`;

    stage.style.setProperty('--zoom', scale.toFixed(2));
  }

  function focusOnPlayer(playerX, playerY) {
    const px = Number(playerX);
    const py = Number(playerY);

    if (!Number.isFinite(px) || !Number.isFinite(py)) return;

    const mapX = (px / 100 - 0.5) * worldWidth * scale;
    const mapY = (py / 100 - 0.5) * worldHeight * scale;

    cameraX = -mapX;
    cameraY = -mapY;

    applyCamera();
  }

  function refresh() {
    measureWorld();
    focusOnPlayer(options.focusX ?? 50, options.focusY ?? 50);
  }

  function onResize() {
    refresh();
  }

  window.addEventListener('resize', onResize);

  const image = viewport.querySelector('.gta-map-image:not(.gta-map-glow)');

  if (image && !image.complete) {
    image.addEventListener('load', refresh, { once: true });
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
