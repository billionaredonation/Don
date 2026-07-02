const MOBILE_MAP_TILE_ASSETS = import.meta.glob('../../map-tiles/**/*.{png,jpg,jpeg,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const MOBILE_TILE_GRID = 8;
const MOBILE_TILE_KEEP_RADIUS = 1;
const MOBILE_TILE_PRELOAD_RADIUS = 2;
const MOBILE_TILE_IDLE_DELAY = 90;

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
  const explicitRatio = Number(viewport?.dataset?.mapRatio);

  if (Number.isFinite(explicitRatio) && explicitRatio > 0.2 && explicitRatio < 2.5) {
    return explicitRatio;
  }

  const image =
    viewport?.querySelector?.('.gta-map-image:not(.gta-map-glow)') ||
    viewport?.querySelector?.('.gta-map-image');

  if (image?.naturalWidth > 0 && image?.naturalHeight > 0) {
    return image.naturalHeight / image.naturalWidth;
  }

  return 0.6697;
}

function normalizeTilePart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .replace(/[^a-z0-9_-]+/g, '-');
}

function getTileAssetValue(key) {
  return MOBILE_MAP_TILE_ASSETS[key] || null;
}

function findMobileTileSrc(cityId, grid, tileX, tileY) {
  const city = normalizeTilePart(cityId);

  if (!city) return null;

  const extensions = ['avif', 'webp', 'png', 'jpg', 'jpeg'];
  const names = [
    `${tileX}_${tileY}`,
    `${tileX}-${tileY}`,
    `tile_${tileX}_${tileY}`,
    `tile-${tileX}-${tileY}`,
    `x${tileX}_y${tileY}`,
    `x${tileX}-y${tileY}`,
  ];

  const roots = [
    `../../map-tiles/${city}/${grid}`,
    `../../map-tiles/${city}`,
  ];

  for (const root of roots) {
    for (const name of names) {
      for (const ext of extensions) {
        const direct = getTileAssetValue(`${root}/${name}.${ext}`);

        if (direct) return direct;
      }
    }
  }

  const cityNeedle = `/map-tiles/${city}/`;
  const xyNeedles = names.map((name) => `/${name}.`);

  const matched = Object.entries(MOBILE_MAP_TILE_ASSETS).find(([key]) => {
    const cleanKey = String(key).toLowerCase().replaceAll('\\', '/');

    return (
      cleanKey.includes(cityNeedle) &&
      (cleanKey.includes(`/${grid}/`) || cleanKey.includes(`/grid-${grid}/`) || cleanKey.includes(`/g${grid}/`) || true) &&
      xyNeedles.some((needle) => cleanKey.includes(needle))
    );
  });

  return matched?.[1] || null;
}

function hasMobileTilesForCity(cityId) {
  const city = normalizeTilePart(cityId);

  if (!city) return false;

  const cityNeedle = `/map-tiles/${city}/`;

  return Object.keys(MOBILE_MAP_TILE_ASSETS).some((key) => {
    return String(key).toLowerCase().replaceAll('\\', '/').includes(cityNeedle);
  });
}

function scheduleIdle(callback, timeout = 220) {
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout });
  }

  return window.setTimeout(callback, Math.min(timeout, 80));
}

function cancelIdle(id) {
  if (!id) return;

  if ('cancelIdleCallback' in window) {
    window.cancelIdleCallback(id);
    return;
  }

  window.clearTimeout(id);
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
  const cityId =
    options.cityId ||
    viewport.dataset.cityId ||
    stage.closest?.('.home')?.dataset.city ||
    '';

  const fallbackMapSrc =
    options.mapSrc ||
    viewport.dataset.mapSrc ||
    viewport.querySelector?.('.gta-map-image:not(.gta-map-glow)')?.dataset?.mapSrc ||
    viewport.querySelector?.('.gta-map-image:not(.gta-map-glow)')?.currentSrc ||
    viewport.querySelector?.('.gta-map-image:not(.gta-map-glow)')?.src ||
    '';

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
      /*
        Мобильный профиль щадящий: меньше огромного полотна, меньше памяти GPU,
        меньше работы на каждом translate/scale кадре.
      */
      return {
        scale: getRequestedStartScale(lowPower ? 1.46 : 1.55),
        worldFactor: lowPower ? 2.02 : 2.18,
      };
    }

    return getDesktopMapProfile();
  }

  let scale = getMapProfile().scale;
  let x = 0;
  let y = 0;

  let worldWidth = 1200;
  let worldHeight = 864;

  let cachedStageWidth = 1;
  let cachedStageHeight = 1;

  let lastFocusX = Number(options.focusX) || 50;
  let lastFocusY = Number(options.focusY) || 50;

  const mapImages = Array.from(viewport.querySelectorAll('.gta-map-image'));
  let resizeRefreshTimer = null;
  let lastViewportTransform = '';
  let lastZoomCssValue = '';
  let lastEntityScaleCssValue = '';

  let tileLayer = null;
  let tileMode = false;
  let tileIdleId = null;
  let tileUpdateFrame = null;
  let lastTileCenterKey = '';
  let tileCleanupTimer = null;
  const activeTiles = new Map();

  function setRenderMode(mode) {
    stage.dataset.mapRenderMode = mode;

    const home = stage.closest?.('.home');

    if (home) {
      home.dataset.mapRenderMode = mode;
    }
  }

  function setupFallbackSingleImage() {
    setRenderMode('single-mobile-fallback');

    mapImages.forEach((image) => {
      const isGlow = image.classList.contains('gta-map-glow');

      if (mobile && isGlow) {
        image.style.display = 'none';
        return;
      }

      image.style.display = 'block';
      image.style.visibility = 'visible';
      image.style.opacity = '1';
      image.style.backgroundImage = fallbackMapSrc ? `url("${fallbackMapSrc}")` : '';
      image.style.backgroundSize = '100% 100%';
      image.style.backgroundRepeat = 'no-repeat';
      image.style.backgroundPosition = 'center center';

      if (image.tagName === 'IMG' && fallbackMapSrc && !image.getAttribute('src')) {
        image.src = fallbackMapSrc;
      }
    });
  }

  function setupMobileTileLayer() {
    if (!mobile) {
      setRenderMode('single-desktop');
      return;
    }

    if (!hasMobileTilesForCity(cityId)) {
      setupFallbackSingleImage();
      return;
    }

    tileMode = true;
    setRenderMode('tiles');

    mapImages.forEach((image) => {
      image.style.display = 'none';
      image.style.visibility = 'hidden';
      image.style.opacity = '0';

      if (image.tagName === 'IMG') {
        image.removeAttribute('src');
        image.removeAttribute('srcset');
      }
    });

    tileLayer = viewport.querySelector('.gta-map-mobile-tile-layer');

    if (!tileLayer) {
      tileLayer = document.createElement('div');
      tileLayer.className = 'gta-map-mobile-tile-layer';
      tileLayer.setAttribute('aria-hidden', 'true');

      const entities = viewport.querySelector('.gta-map-entities');
      viewport.insertBefore(tileLayer, entities || viewport.firstChild);
    }
  }

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

    if (!tileMode) {
      mapImages.forEach((image) => {
        const isGlow = image.classList.contains('gta-map-glow');

        image.style.position = 'absolute';
        image.style.inset = '0';
        image.style.display = mobile && isGlow ? 'none' : 'block';
        image.style.visibility = 'visible';
        image.style.opacity = isGlow ? (lowPower || mobile ? '0' : '0.18') : '1';
        image.style.width = '100%';
        image.style.height = '100%';
        image.style.objectFit = 'contain';
        image.style.objectPosition = 'center center';
        image.style.pointerEvents = 'none';
        image.style.userSelect = 'none';
        image.style.zIndex = isGlow ? '1' : '2';
      });
    }

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

    worldWidth = Math.max(mobile ? 760 : 760, base * worldFactor);
    worldHeight = Math.max(mobile ? 520 : 620, worldWidth * ratio);

    viewport.style.width = `${Math.round(worldWidth)}px`;
    viewport.style.height = `${Math.round(worldHeight)}px`;
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
    const limits = getLimits();

    x = clamp(x, -limits.maxX, limits.maxX);
    y = clamp(y, -limits.maxY, limits.maxY);

    const precision = mobile ? 100 : 1000;
    const safeX = Math.round(x * precision) / precision;
    const safeY = Math.round(y * precision) / precision;
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

  function getTileSetAround(tileX, tileY, radius) {
    const result = [];

    for (let yIndex = tileY - radius; yIndex <= tileY + radius; yIndex += 1) {
      for (let xIndex = tileX - radius; xIndex <= tileX + radius; xIndex += 1) {
        if (
          xIndex < 0 ||
          yIndex < 0 ||
          xIndex >= MOBILE_TILE_GRID ||
          yIndex >= MOBILE_TILE_GRID
        ) {
          continue;
        }

        result.push({ x: xIndex, y: yIndex });
      }
    }

    return result;
  }

  function createTileElement(tileX, tileY, src) {
    const tile = document.createElement('div');
    const size = 100 / MOBILE_TILE_GRID;

    tile.className = 'gta-map-mobile-tile';
    tile.dataset.tileX = String(tileX);
    tile.dataset.tileY = String(tileY);
    tile.style.left = `${tileX * size}%`;
    tile.style.top = `${tileY * size}%`;
    tile.style.width = `${size + 0.08}%`;
    tile.style.height = `${size + 0.08}%`;
    tile.style.backgroundImage = `url("${src}")`;

    const probe = new Image();

    probe.onload = () => {
      tile.classList.add('is-loaded');
    };

    probe.onerror = () => {
      tile.remove();
    };

    probe.decoding = 'async';
    probe.loading = 'eager';
    probe.src = src;

    return tile;
  }

  function unloadFarTiles(keepKeys) {
    activeTiles.forEach((tile, key) => {
      if (keepKeys.has(key)) return;

      activeTiles.delete(key);
      tile.remove();
    });
  }

  function updateMobileTiles() {
    if (!tileMode || !tileLayer) return;

    const tileX = clamp(
      Math.floor((lastFocusX / 100) * MOBILE_TILE_GRID),
      0,
      MOBILE_TILE_GRID - 1
    );

    const tileY = clamp(
      Math.floor((lastFocusY / 100) * MOBILE_TILE_GRID),
      0,
      MOBILE_TILE_GRID - 1
    );

    const centerKey = `${tileX}:${tileY}`;

    if (centerKey === lastTileCenterKey) return;

    lastTileCenterKey = centerKey;

    if (tileIdleId) {
      cancelIdle(tileIdleId);
      tileIdleId = null;
    }

    tileIdleId = scheduleIdle(() => {
      tileIdleId = null;

      const keepTiles = getTileSetAround(tileX, tileY, MOBILE_TILE_KEEP_RADIUS);
      const preloadTiles = getTileSetAround(tileX, tileY, MOBILE_TILE_PRELOAD_RADIUS);
      const keepKeys = new Set(preloadTiles.map((tile) => `${tile.x}:${tile.y}`));

      keepTiles.forEach((tilePosition) => {
        const key = `${tilePosition.x}:${tilePosition.y}`;

        if (activeTiles.has(key)) return;

        const src = findMobileTileSrc(
          cityId,
          MOBILE_TILE_GRID,
          tilePosition.x,
          tilePosition.y
        );

        if (!src) return;

        const tile = createTileElement(tilePosition.x, tilePosition.y, src);
        activeTiles.set(key, tile);
        tileLayer.appendChild(tile);
      });

      window.clearTimeout(tileCleanupTimer);
      tileCleanupTimer = window.setTimeout(() => unloadFarTiles(keepKeys), 420);
    }, MOBILE_TILE_IDLE_DELAY);
  }

  function scheduleTileUpdate() {
    if (!tileMode) return;
    if (tileUpdateFrame) return;

    tileUpdateFrame = requestAnimationFrame(() => {
      tileUpdateFrame = null;
      updateMobileTiles();
    });
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
    scheduleTileUpdate();
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
    resizeRefreshTimer = setTimeout(refresh, mobile ? 180 : 60);
  }

  function onImageReady() {
    refresh();
  }

  setupMobileTileLayer();

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  window.visualViewport?.addEventListener?.('resize', onResize, { passive: true });

  if (!tileMode) {
    mapImages.forEach((image) => {
      image.addEventListener('load', onImageReady, { passive: true });
      image.addEventListener('error', onImageReady, { passive: true });
    });
  }

  refresh();

  return {
    cleanup() {
      clearTimeout(resizeRefreshTimer);
      window.clearTimeout(tileCleanupTimer);

      if (tileUpdateFrame) {
        cancelAnimationFrame(tileUpdateFrame);
      }

      if (tileIdleId) {
        cancelIdle(tileIdleId);
      }

      activeTiles.clear();
      tileLayer?.remove();

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
