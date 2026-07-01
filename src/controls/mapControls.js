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

  function getRequestedStartScale(defaultScale) {
    const requested = Number(options.startScale);

    if (Number.isFinite(requested) && requested > 0) {
      return requested;
    }

    return defaultScale;
  }

  function getDesktopMapProfile() {
    const screen = getViewportSize();
    const minSide = Math.min(screen.width, screen.height);

    /*
      ПК: не показываем всю карту сразу, но и не выкручиваем zoom так,
      чтобы дома и игрок выглядели как огромные кнопки.
      Фактический fullscreen делает Telegram API/CSS-shell, а не грубый scale.
    */
    const requested = getRequestedStartScale(lowPower ? 1.42 : 1.56);

    if (minSide <= 410) {
      return {
        scale: clamp(requested, lowPower ? 1.28 : 1.34, lowPower ? 1.42 : 1.52),
        worldFactor: lowPower ? 2.02 : 2.18,
      };
    }

    if (minSide <= 520) {
      return {
        scale: clamp(requested, lowPower ? 1.34 : 1.42, lowPower ? 1.5 : 1.6),
        worldFactor: lowPower ? 2.14 : 2.28,
      };
    }

    if (minSide <= 650) {
      return {
        scale: clamp(requested, lowPower ? 1.42 : 1.5, lowPower ? 1.58 : 1.68),
        worldFactor: lowPower ? 2.28 : 2.48,
      };
    }

    return {
      scale: clamp(requested, lowPower ? 1.5 : 1.58, lowPower ? 1.7 : 1.82),
      worldFactor: lowPower ? 2.42 : 2.68,
    };
  }

  function getMapProfile() {
    if (mobile) {
      return {
        scale: getRequestedStartScale(3.2),
        worldFactor: lowPower ? 3.2 : 3.55,
      };
    }

    return getDesktopMapProfile();
  }

  let scale = getMapProfile().scale;
  let x = 0;
  let y = 0;

  let worldWidth = 1200;
  let worldHeight = 864;

  // На мобилке нельзя читать getBoundingClientRect() каждый кадр движения.
  // Читаем размер сцены только на refresh/resize, а в RAF используем кеш.
  let cachedStageWidth = 1;
  let cachedStageHeight = 1;

  let lastFocusX = Number(options.focusX) || 50;
  let lastFocusY = Number(options.focusY) || 50;

  const mapImages = Array.from(viewport.querySelectorAll('.gta-map-image'));
  let resizeRefreshTimer = null;
  let lastViewportTransform = '';
  let lastZoomCssValue = '';
  let lastEntityScaleCssValue = '';

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
      const isGlow = image.classList.contains('gta-map-glow');

      image.style.position = 'absolute';
      image.style.inset = '0';
      image.style.display = mobile && isGlow ? 'none' : 'block';
      image.style.visibility = 'visible';
      image.style.opacity = isGlow ? (lowPower ? '0' : '0.18') : '1';
      image.style.width = '100%';
      image.style.height = '100%';
      image.style.objectFit = 'contain';
      image.style.objectPosition = 'center center';
      image.style.pointerEvents = 'none';
      image.style.userSelect = 'none';
      image.style.zIndex = isGlow ? '1' : '2';
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

  function readStageRect() {
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

    cachedStageWidth = Math.max(1, width);
    cachedStageHeight = Math.max(1, height);

    return {
      width: cachedStageWidth,
      height: cachedStageHeight,
    };
  }

  function getCachedStageRect() {
    return {
      width: cachedStageWidth,
      height: cachedStageHeight,
    };
  }

  function measureWorld() {
    forceVisibleMapLayer();

    const rect = readStageRect();
    const ratio = getImageRatio(viewport);
    const isDesktopPortrait = !mobile && rect.height > rect.width * 1.18;
    const base = isDesktopPortrait
      ? Math.max(rect.width, Math.min(rect.height, rect.width * 1.28))
      : Math.max(rect.width, rect.height);
    const { worldFactor } = getMapProfile();

    worldWidth = Math.max(mobile ? 900 : 760, base * worldFactor);
    worldHeight = Math.max(620, worldWidth * ratio);

    viewport.style.width = `${worldWidth}px`;
    viewport.style.height = `${worldHeight}px`;
  }

  function getLimits() {
    const rect = getCachedStageRect();

    const scaledWidth = worldWidth * scale;
    const scaledHeight = worldHeight * scale;

    return {
      maxX: Math.max(0, (scaledWidth - rect.width) / 2),
      maxY: Math.max(0, (scaledHeight - rect.height) / 2),
    };
  }

  function applyTransform() {
    /*
      Мобилка:
      getMapProfile() больше не вызывается на каждом кадре движения.
      Scale обновляется через refresh(), а transform перерисовывается только
      если реально изменился. Это снижает микрофризы в Telegram WebView.
    */

    const limits = getLimits();

    x = clamp(x, -limits.maxX, limits.maxX);
    y = clamp(y, -limits.maxY, limits.maxY);

    const safeX = Math.round(x * 1000) / 1000;
    const safeY = Math.round(y * 1000) / 1000;
    const safeScale = Math.round(scale * 10000) / 10000;

    const nextTransform =
      `translate(-50%, -50%) translate3d(${safeX}px, ${safeY}px, 0) scale(${safeScale})`;

    if (nextTransform !== lastViewportTransform) {
      viewport.style.transform = nextTransform;
      lastViewportTransform = nextTransform;
    }

    const nextZoomValue = safeScale.toFixed(2);
    const nextEntityScaleValue = (1 / Math.max(safeScale, 1)).toFixed(4);

    if (nextZoomValue !== lastZoomCssValue) {
      stage.style.setProperty('--zoom', nextZoomValue);
      lastZoomCssValue = nextZoomValue;
    }

    if (nextEntityScaleValue !== lastEntityScaleCssValue) {
      stage.style.setProperty('--map-entity-scale', nextEntityScaleValue);
      lastEntityScaleCssValue = nextEntityScaleValue;
    }
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
    scale = getMapProfile().scale;

    lastViewportTransform = '';
    lastZoomCssValue = '';
    lastEntityScaleCssValue = '';

    measureWorld();
    focusOnPlayer(lastFocusX, lastFocusY);
  }

  function onResize() {
    clearTimeout(resizeRefreshTimer);
    resizeRefreshTimer = setTimeout(refresh, mobile ? 120 : 60);
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
      clearTimeout(resizeRefreshTimer);

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
