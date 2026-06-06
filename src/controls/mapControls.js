function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isCoarsePointer() {
  return (
    window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches ||
    navigator.maxTouchPoints > 0
  );
}

function getViewportSize() {
  const width = Math.max(
    1,
    Math.round(
      window.visualViewport?.width ||
      window.innerWidth ||
      document.documentElement.clientWidth ||
      window.screen?.width ||
      1
    )
  );

  const height = Math.max(
    1,
    Math.round(
      window.visualViewport?.height ||
      window.innerHeight ||
      document.documentElement.clientHeight ||
      window.screen?.height ||
      1
    )
  );

  return { width, height };
}

function getImageRatio(viewport) {
  const image =
    viewport?.querySelector?.('.gta-map-image:not(.gta-map-glow)') ||
    viewport?.querySelector?.('.gta-map-image');

  if (image?.naturalWidth > 0 && image?.naturalHeight > 0) {
    return image.naturalHeight / image.naturalWidth;
  }

  return 0.72;
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

  const LOCKED_SCALE = Number(options.startScale) || (mobile ? 3.2 : 4.4);
  const WORLD_FACTOR = mobile
    ? (lowPower ? 3.2 : 3.55)
    : (lowPower ? 2.6 : 3.95);

  let scale = LOCKED_SCALE;
  let x = 0;
  let y = 0;

  let worldWidth = 1200;
  let worldHeight = 864;

  let lastFocusX = Number(options.focusX) || 50;
  let lastFocusY = Number(options.focusY) || 50;

  const mapImages = Array.from(viewport.querySelectorAll('.gta-map-image'));

  function forceVisibleMapLayer() {
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
    viewport.style.right = 'auto';
    viewport.style.bottom = 'auto';
    viewport.style.display = 'block';
    viewport.style.visibility = 'visible';
    viewport.style.opacity = '1';
    viewport.style.overflow = 'visible';
    viewport.style.transformOrigin = 'center center';
    viewport.style.willChange = 'transform';
    viewport.style.zIndex = '50';
    viewport.style.pointerEvents = 'none';

    mapImages.forEach((image, index) => {
      image.style.position = 'absolute';
      image.style.inset = '0';
      image.style.display = 'block';
      image.style.visibility = 'visible';
      image.style.opacity = index === 0 && image.classList.contains('gta-map-glow') ? '0.45' : '1';
      image.style.width = '100%';
      image.style.height = '100%';
      image.style.objectFit = 'contain';
      image.style.objectPosition = 'center center';
      image.style.pointerEvents = 'none';
      image.style.userSelect = 'none';
      image.style.zIndex = image.classList.contains('gta-map-glow') ? '1' : '2';
    });

    const entities = viewport.querySelector('.gta-map-entities');

    if (entities) {
      entities.style.position = 'absolute';
      entities.style.inset = '0';
      entities.style.display = 'block';
      entities.style.visibility = 'visible';
      entities.style.opacity = '1';
      entities.style.overflow = 'visible';
      entities.style.zIndex = '90';
      entities.style.pointerEvents = 'none';
    }

    const objectLayers = viewport.querySelectorAll(
      '.map-objects-layer, .map-objects-layer-public, .map-objects-layer-admin'
    );

    objectLayers.forEach((layer) => {
      layer.style.position = 'absolute';
      layer.style.inset = '0';
      layer.style.visibility = 'visible';
      layer.style.opacity = '1';
      layer.style.overflow = 'visible';
    });
  }

  function getStageRect() {
    const rect = stage.getBoundingClientRect();
    const screen = getViewportSize();

    let width = Number(rect.width);
    let height = Number(rect.height);

    if (!Number.isFinite(width) || width < 20) {
      width = screen.width;
    }

    if (!Number.isFinite(height) || height < 20) {
      height = screen.height;
    }

    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  }

  function measureWorld() {
    forceVisibleMapLayer();

    const rect = getStageRect();
    const ratio = getImageRatio(viewport);
    const base = Math.max(rect.width, rect.height);

    worldWidth = Math.max(900, base * WORLD_FACTOR);
    worldHeight = Math.max(620, worldWidth * ratio);

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

    lastFocusX = clamp(focusX, 0, 100);
    lastFocusY = clamp(focusY, 0, 100);

    const fx = (lastFocusX / 100 - 0.5) * worldWidth * scale;
    const fy = (lastFocusY / 100 - 0.5) * worldHeight * scale;

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

  function onImageReady() {
    refresh();
  }

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  window.visualViewport?.addEventListener?.('resize', onResize, { passive: true });

  mapImages.forEach((image) => {
    image.addEventListener('load', onImageReady, { passive: true });
    image.addEventListener('error', onImageReady, { passive: true });
  });

  refresh();

  return {
    cleanup() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.visualViewport?.removeEventListener?.('resize', onResize);

      mapImages.forEach((image) => {
        image.removeEventListener('load', onImageReady);
        image.removeEventListener('error', onImageReady);
      });
    },

    focusOnPlayer,
    refresh,
  };
}
