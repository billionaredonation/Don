function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isCoarsePointer() {
  return window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches ||
    navigator.maxTouchPoints > 0;
}

function getViewportSize() {
  const width = Math.max(
    1,
    Math.round(
      window.visualViewport?.width ||
      window.innerWidth ||
      document.documentElement.clientWidth ||
      1
    )
  );

  const height = Math.max(
    1,
    Math.round(
      window.visualViewport?.height ||
      window.innerHeight ||
      document.documentElement.clientHeight ||
      1
    )
  );

  return { width, height };
}

export function isLowPowerDevice() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const isSmallScreen = window.matchMedia('(max-width: 520px)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return reducedMotion || memory <= 3 || cores <= 4 || isSmallScreen;
}

export function enableMapControls(stage, viewport, options = {}) {
  if (!stage || !viewport) {
    return {
      cleanup() {},
      focusOnPlayer() {},
      refresh() {},
    };
  }

  const lowPower = isLowPowerDevice();
  const mobile = isCoarsePointer();

  const LOCKED_SCALE = Number(options.startScale) || (mobile ? 3.15 : 4.4);
  const WORLD_FACTOR = mobile
    ? (lowPower ? 2.65 : 3.15)
    : (lowPower ? 2.25 : 3.65);

  let scale = LOCKED_SCALE;
  let x = 0;
  let y = 0;

  let worldWidth = 1;
  let worldHeight = 1;
  let lastFocusX = Number(options.focusX) || 50;
  let lastFocusY = Number(options.focusY) || 50;

  function forceStageLayout() {
    stage.style.position = 'absolute';
    stage.style.inset = '0';
    stage.style.width = '100%';
    stage.style.height = '100%';
    stage.style.minHeight = '100%';
    stage.style.overflow = 'hidden';
    stage.style.touchAction = 'none';

    viewport.style.position = 'absolute';
    viewport.style.left = '50%';
    viewport.style.top = '50%';
    viewport.style.overflow = 'visible';
    viewport.style.transformOrigin = 'center center';
    viewport.style.willChange = 'transform';
  }

  function getStageRect() {
    const rect = stage.getBoundingClientRect();
    const viewportSize = getViewportSize();

    const width = Math.max(1, rect.width || viewportSize.width);
    const height = Math.max(1, rect.height || viewportSize.height);

    return { width, height };
  }

  function measureWorld() {
    forceStageLayout();

    const rect = getStageRect();
    const base = Math.max(rect.width, rect.height);

    worldWidth = Math.max(rect.width, base * WORLD_FACTOR);
    worldHeight = Math.max(rect.height, worldWidth * 0.72);

    viewport.style.width = `${worldWidth}px`;
    viewport.style.height = `${worldHeight}px`;
  }

  function getLimits() {
    const rect = getStageRect();

    const scaledWidth = worldWidth * scale;
    const scaledHeight = worldHeight * scale;

    return {
      maxX: Math.max(0, (scaledWidth - rect.width) / 2),
      maxY: Math.max(0, (scaledHeight - rect.height) / 2),
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

    lastFocusX = focusX;
    lastFocusY = focusY;

    const fx = (focusX / 100 - 0.5) * worldWidth * scale;
    const fy = (focusY / 100 - 0.5) * worldHeight * scale;

    x = -fx;
    y = -fy;

    applyTransform();
  }

  function refresh() {
    measureWorld();
    focusOnPlayer(lastFocusX, lastFocusY);
  }

  function onResize() {
    refresh();
  }

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  window.visualViewport?.addEventListener?.('resize', onResize, { passive: true });

  refresh();

  return {
    cleanup() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.visualViewport?.removeEventListener?.('resize', onResize);
    },

    focusOnPlayer,
    refresh,
  };
}
