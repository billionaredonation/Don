const MOBILE_MAP_TILE_ASSETS = import.meta.glob('../../map-tiles/**/*.{png,jpg,jpeg,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const MOBILE_TILE_GRID = 8;
const MOBILE_TILE_RENDER_RADIUS = 2;
const MOBILE_TILE_PRELOAD_RADIUS = 3;
const MOBILE_TILE_KEEP_RADIUS = 4;
const MOBILE_TILE_IDLE_DELAY = 110;
const MOBILE_TILE_CLEANUP_DELAY = 7800;
const MOBILE_CAMERA_EVENT_INTERVAL_MS = 90;
const DESKTOP_CAMERA_EVENT_INTERVAL_MS = 34;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
      (cleanKey.includes(`/${grid}/`) || cleanKey.includes(`/grid-${grid}/`) || cleanKey.includes(`/g${grid}/`)) &&
      xyNeedles.some((needle) => cleanKey.includes(needle))
    );
  });

  return matched?.[1] || null;
}

function hasMobileTilesForCity(cityId) {
  const city = normalizeTilePart(cityId);

  if (!city) return false;

  const cityNeedle = `/map-tiles/${city}/`;

  return Object.keys(MOBILE_MAP_TILE_ASSETS).some((key) => (
    String(key).toLowerCase().replaceAll('\\', '/').includes(cityNeedle)
  ));
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

function dispatchCameraFocus(detail) {
  window.dispatchEvent(new CustomEvent('mn:map-camera-focus', {
    detail,
  }));
}

export function isLowPowerDevice() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const isSmallScreen = window.matchMedia?.('(max-width: 520px)')?.matches;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

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

  function getMapProfile() {
    const screen = getViewportSize();
    const minSide = Math.min(screen.width, screen.height);

    if (mobile) {
      return {
        scale: getRequestedStartScale(lowPower ? 1.42 : 1.55),
        worldFactor: lowPower ? 1.96 : 2.12,
      };
    }

    if (minSide <= 410) {
      return {
        scale: clamp(getRequestedStartScale(lowPower ? 1.32 : 1.42), 1.18, lowPower ? 1.48 : 1.62),
        worldFactor: lowPower ? 2.02 : 2.18,
      };
    }

    if (minSide <= 650) {
      return {
        scale: clamp(getRequestedStartScale(lowPower ? 1.42 : 1.54), 1.24, lowPower ? 1.62 : 1.72),
        worldFactor: lowPower ? 2.24 : 2.46,
      };
    }

    return {
      scale: clamp(getRequestedStartScale(lowPower ? 1.5 : 1.58), 1.28, lowPower ? 1.74 : 1.88),
      worldFactor: lowPower ? 2.42 : 2.68,
    };
  }

  let scale = getMapProfile().scale;
  let x = 0;
  let y = 0;
  let targetMapX = 0;
  let targetMapY = 0;

  let worldWidth = 1200;
  let worldHeight = 804;
  let cachedStageWidth = 1;
  let cachedStageHeight = 1;

  let lastFocusX = toFiniteNumber(options.focusX, 50);
  let lastFocusY = toFiniteNumber(options.focusY, 50);

  const mapImages = Array.from(viewport.querySelectorAll('.gta-map-image'));

  let resizeRefreshTimer = null;
  let lastViewportTransform = '';
  let lastZoomCssValue = '';
  let lastEntityScaleCssValue = '';
  let lastPlayerScreenOffsetX = Number.NaN;
  let lastPlayerScreenOffsetY = Number.NaN;

  let tileLayer = null;
  let tileLayerOwned = false;
  let tileMode = false;
  let tileIdleId = null;
  let tileUpdateFrame = null;
  let lastTileCenterKey = '';
  let tileCleanupTimer = null;
  const activeTiles = new Map();
  const preloadedTileSrcs = new Set();

  const cameraFollowLerp = mobile
    ? (lowPower ? 0.40 : 0.50)
    : 1;
  const cameraSettleEpsilon = mobile ? 0.018 : 0.001;
  const cameraSnapDistance = mobile ? 280 : 0;

  let cameraFrameId = 0;
  let cameraReady = false;
  let cameraFocusFrameId = 0;
  let cameraFocusTimerId = 0;
  let lastCameraFocusDispatchedAt = Number.NEGATIVE_INFINITY;
  let pendingCameraFocusDetail = null;

  function setRenderMode(mode) {
    stage.dataset.mapRenderMode = mode;

    const home = stage.closest?.('.home');

    if (home) {
      home.dataset.mapRenderMode = mode;
    }
  }

  function setupFallbackSingleImage() {
    setRenderMode(mobile ? 'single-mobile-fallback' : 'single-desktop');

    const fallbackSrc =
      fallbackMapSrc ||
      viewport.dataset.mapSrc ||
      viewport.querySelector?.('.gta-map-mobile-image')?.dataset?.mapSrc ||
      viewport.querySelector?.('.gta-map-image:not(.gta-map-glow)')?.getAttribute?.('src') ||
      '';

    mapImages.forEach((image) => {
      const isGlow = image.classList.contains('gta-map-glow');

      if (mobile && isGlow) {
        image.style.display = 'none';
        image.style.visibility = 'hidden';
        image.style.opacity = '0';
        return;
      }

      image.style.display = 'block';
      image.style.visibility = 'visible';
      image.style.opacity = isGlow ? (lowPower || mobile ? '0' : '0.18') : '1';
      image.style.position = 'absolute';
      image.style.inset = '0';
      image.style.width = '100%';
      image.style.height = '100%';
      image.style.minWidth = '100%';
      image.style.minHeight = '100%';
      image.style.objectFit = 'contain';
      image.style.objectPosition = 'center center';
      image.style.pointerEvents = 'none';
      image.style.userSelect = 'none';
      image.style.zIndex = isGlow ? '1' : '12';
      image.style.backgroundColor = 'transparent';
      image.decoding = 'async';
      image.loading = 'eager';

      if (fallbackSrc) {
        if (image.tagName === 'IMG') {
          if (!image.getAttribute('src') || image.getAttribute('src') !== fallbackSrc) {
            image.src = fallbackSrc;
          }

          image.style.backgroundImage = '';
          image.style.backgroundSize = '';
          image.style.backgroundRepeat = '';
          image.style.backgroundPosition = '';
        } else {
          image.style.backgroundImage = `url("${fallbackSrc}")`;
          image.style.backgroundSize = '100% 100%';
          image.style.backgroundRepeat = 'no-repeat';
          image.style.backgroundPosition = 'center center';
        }
      }
    });
  }

  function setupMobileTileLayer() {
    if (!mobile) {
      setupFallbackSingleImage();
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
      tileLayerOwned = true;
      tileLayer.className = 'gta-map-mobile-tile-layer';
      tileLayer.setAttribute('aria-hidden', 'true');

      const entities = viewport.querySelector('.gta-map-entities');
      viewport.insertBefore(tileLayer, entities || viewport.firstChild);
    }

    tileLayer.style.position = 'absolute';
    tileLayer.style.inset = '0';
    tileLayer.style.width = '100%';
    tileLayer.style.height = '100%';
    tileLayer.style.overflow = 'hidden';
    tileLayer.style.pointerEvents = 'none';
    tileLayer.style.zIndex = '5';
    tileLayer.style.contain = 'layout style paint';
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
    viewport.style.contain = mobile ? 'layout style paint' : '';

    if (!tileMode) {
      setupFallbackSingleImage();
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

    viewport
      .querySelectorAll('.map-objects-layer, .map-objects-layer-public, .map-objects-layer-admin')
      .forEach((layer) => {
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

    cachedStageWidth = Math.max(1, Number(rect.width) || screen.width);
    cachedStageHeight = Math.max(1, Number(rect.height) || screen.height);

    return {
      width: cachedStageWidth,
      height: cachedStageHeight,
    };
  }

  function measureWorld() {
    forceVisibleMapLayer();

    const rect = readStageRect();
    const ratio = getImageRatio(viewport);
    const base = Math.max(rect.width, rect.height);
    const profile = getMapProfile();

    scale = profile.scale;

    const requestedWorldFactor = Number(options.worldFactor);
    const worldFactor = Number.isFinite(requestedWorldFactor) && requestedWorldFactor > 0
      ? requestedWorldFactor
      : profile.worldFactor;

    worldWidth = Math.max(mobile ? 760 : 760, base * worldFactor);
    worldHeight = Math.max(mobile ? 500 : 620, worldWidth * ratio);

    viewport.style.width = `${Math.round(worldWidth)}px`;
    viewport.style.height = `${Math.round(worldHeight)}px`;
    viewport.dataset.mapRatio = String(ratio);
    viewport.dataset.worldWidth = String(Math.round(worldWidth));
    viewport.dataset.worldHeight = String(Math.round(worldHeight));
  }

  function getLimits() {
    const w = worldWidth * scale;
    const h = worldHeight * scale;

    return {
      maxX: Math.max(0, (w - cachedStageWidth) / 2),
      maxY: Math.max(0, (h - cachedStageHeight) / 2),
    };
  }

  function applyTransform() {
    const limits = getLimits();
    const safeX = Math.round(clamp(x, -limits.maxX, limits.maxX) * 1000) / 1000;
    const safeY = Math.round(clamp(y, -limits.maxY, limits.maxY) * 1000) / 1000;
    const safeScale = Math.round(scale * 10000) / 10000;

    x = safeX;
    y = safeY;

    if (mobile) {
      const playerWorldX = (lastFocusX / 100 - 0.5) * worldWidth * safeScale;
      const playerWorldY = (lastFocusY / 100 - 0.5) * worldHeight * safeScale;
      const playerScreenOffsetX = Math.round((safeX + playerWorldX) * 100) / 100;
      const playerScreenOffsetY = Math.round((safeY + playerWorldY) * 100) / 100;

      if (
        !Number.isFinite(lastPlayerScreenOffsetX) ||
        !Number.isFinite(lastPlayerScreenOffsetY) ||
        Math.abs(playerScreenOffsetX - lastPlayerScreenOffsetX) >= 0.25 ||
        Math.abs(playerScreenOffsetY - lastPlayerScreenOffsetY) >= 0.25
      ) {
        lastPlayerScreenOffsetX = playerScreenOffsetX;
        lastPlayerScreenOffsetY = playerScreenOffsetY;

        const offsetDetail = {
          x: playerScreenOffsetX,
          y: playerScreenOffsetY,
          cityId,
        };

        window.__MN_MOBILE_PLAYER_SCREEN_OFFSET__ = offsetDetail;
        window.dispatchEvent(new CustomEvent('mn:mobile-player-screen-offset', {
          detail: offsetDetail,
        }));
      }
    }

    const nextTransform = `translate(-50%, -50%) translate3d(${safeX}px, ${safeY}px, 0) scale(${safeScale})`;

    if (nextTransform !== lastViewportTransform) {
      viewport.style.transform = nextTransform;
      lastViewportTransform = nextTransform;
    }

    const nextZoomCssValue = safeScale.toFixed(3);
    const nextEntityScaleCssValue = (1 / Math.max(safeScale, 1)).toFixed(4);

    if (nextZoomCssValue !== lastZoomCssValue) {
      stage.style.setProperty('--zoom', nextZoomCssValue);
      lastZoomCssValue = nextZoomCssValue;
    }

    if (nextEntityScaleCssValue !== lastEntityScaleCssValue) {
      stage.style.setProperty('--map-entity-scale', nextEntityScaleCssValue);
      lastEntityScaleCssValue = nextEntityScaleCssValue;
    }
  }

  function getTileSetAround(tileX, tileY, radius) {
    const result = [];

    for (let yIndex = tileY - radius; yIndex <= tileY + radius; yIndex += 1) {
      for (let xIndex = tileX - radius; xIndex <= tileX + radius; xIndex += 1) {
        if (xIndex < 0 || yIndex < 0 || xIndex >= MOBILE_TILE_GRID || yIndex >= MOBILE_TILE_GRID) {
          continue;
        }

        result.push({ x: xIndex, y: yIndex });
      }
    }

    return result;
  }

  function preloadTileSrc(src) {
    if (!src || preloadedTileSrcs.has(src)) return;

    preloadedTileSrcs.add(src);

    const image = new Image();
    image.decoding = 'async';
    image.loading = 'eager';
    image.src = src;
  }

  function createTileElement(tileX, tileY, src) {
    const tile = document.createElement('div');
    const size = 100 / MOBILE_TILE_GRID;

    tile.className = 'gta-map-mobile-tile';
    tile.dataset.tileX = String(tileX);
    tile.dataset.tileY = String(tileY);
    tile.style.position = 'absolute';
    tile.style.left = `${tileX * size}%`;
    tile.style.top = `${tileY * size}%`;
    tile.style.width = `${size + 0.08}%`;
    tile.style.height = `${size + 0.08}%`;
    tile.style.backgroundImage = `url("${src}")`;
    tile.style.backgroundSize = '100% 100%';
    tile.style.backgroundRepeat = 'no-repeat';
    tile.style.backgroundPosition = 'center center';
    tile.style.opacity = '0';
    tile.style.transition = 'opacity 120ms linear';
    tile.style.willChange = 'opacity';
    tile.style.contain = 'strict';

    const probe = new Image();

    probe.onload = () => {
      tile.classList.add('is-loaded');
      tile.style.opacity = '1';
    };

    probe.onerror = () => {
      activeTiles.delete(`${tileX}:${tileY}`);
      tile.remove();
    };

    probe.decoding = 'async';
    probe.loading = 'eager';
    probe.src = src;

    return tile;
  }

  function loadTilePosition(tilePosition, appendToDom = true) {
    const key = `${tilePosition.x}:${tilePosition.y}`;

    if (activeTiles.has(key)) return;

    const src = findMobileTileSrc(cityId, MOBILE_TILE_GRID, tilePosition.x, tilePosition.y);

    if (!src) return;

    preloadTileSrc(src);

    if (!appendToDom || !tileLayer) return;

    const tile = createTileElement(tilePosition.x, tilePosition.y, src);
    activeTiles.set(key, tile);
    tileLayer.appendChild(tile);
  }

  function unloadFarTiles(keepKeys) {
    activeTiles.forEach((tile, key) => {
      if (keepKeys.has(key)) return;

      activeTiles.delete(key);
      tile.remove();
    });
  }

  function getFocusedTileCenter() {
    const tileX = clamp(Math.floor((lastFocusX / 100) * MOBILE_TILE_GRID), 0, MOBILE_TILE_GRID - 1);
    const tileY = clamp(Math.floor((lastFocusY / 100) * MOBILE_TILE_GRID), 0, MOBILE_TILE_GRID - 1);

    return {
      tileX,
      tileY,
      centerKey: `${tileX}:${tileY}`,
    };
  }

  function updateMobileTiles(force = false) {
    if (!tileMode || !tileLayer) return;

    const { tileX, tileY, centerKey } = getFocusedTileCenter();

    if (!force && centerKey === lastTileCenterKey) return;

    lastTileCenterKey = centerKey;

    if (tileIdleId) {
      cancelIdle(tileIdleId);
      tileIdleId = null;
    }

    const renderTiles = getTileSetAround(tileX, tileY, MOBILE_TILE_RENDER_RADIUS);
    const preloadTiles = getTileSetAround(tileX, tileY, MOBILE_TILE_PRELOAD_RADIUS);
    const keepTiles = getTileSetAround(tileX, tileY, MOBILE_TILE_KEEP_RADIUS);
    const keepKeys = new Set(keepTiles.map((tile) => `${tile.x}:${tile.y}`));

    renderTiles.forEach((tilePosition) => loadTilePosition(tilePosition, true));

    tileIdleId = scheduleIdle(() => {
      tileIdleId = null;

      preloadTiles.forEach((tilePosition) => loadTilePosition(tilePosition, false));

      window.clearTimeout(tileCleanupTimer);
      tileCleanupTimer = window.setTimeout(() => unloadFarTiles(keepKeys), MOBILE_TILE_CLEANUP_DELAY);
    }, MOBILE_TILE_IDLE_DELAY);
  }

  function scheduleTileUpdate(force = false) {
    if (!tileMode) return;

    if (!force) {
      const { centerKey } = getFocusedTileCenter();

      if (centerKey === lastTileCenterKey) return;
    }

    if (tileUpdateFrame) return;

    tileUpdateFrame = requestAnimationFrame(() => {
      tileUpdateFrame = null;
      updateMobileTiles(force);
    });
  }

  function computeTargetMapPosition(playerX, playerY) {
    const focusX = Number(playerX);
    const focusY = Number(playerY);

    if (!Number.isFinite(focusX) || !Number.isFinite(focusY)) {
      return null;
    }

    lastFocusX = clamp(focusX, 0, 100);
    lastFocusY = clamp(focusY, 0, 100);

    const fx = (lastFocusX / 100 - 0.5) * worldWidth * scale;
    const fy = (lastFocusY / 100 - 0.5) * worldHeight * scale;

    return {
      x: -fx,
      y: -fy,
    };
  }

  function ensureCameraLoop() {
    if (cameraFrameId) return;

    const step = () => {
      cameraFrameId = 0;

      const dx = targetMapX - x;
      const dy = targetMapY - y;
      const distance = Math.hypot(dx, dy);

      if (!cameraReady || !mobile || distance > cameraSnapDistance) {
        x = targetMapX;
        y = targetMapY;
        cameraReady = true;
        applyTransform();
        return;
      }

      if (distance <= cameraSettleEpsilon) {
        x = targetMapX;
        y = targetMapY;
        applyTransform();
        return;
      }

      x += dx * cameraFollowLerp;
      y += dy * cameraFollowLerp;
      applyTransform();
      ensureCameraLoop();
    };

    cameraFrameId = requestAnimationFrame(step);
  }

  function flushCameraFocusDispatch() {
    cameraFocusFrameId = 0;
    cameraFocusTimerId = 0;

    if (!pendingCameraFocusDetail) return;

    lastCameraFocusDispatchedAt = performance.now();
    dispatchCameraFocus(pendingCameraFocusDetail);
    pendingCameraFocusDetail = null;
  }

  function scheduleCameraFocusDispatch(detail, force = false) {
    pendingCameraFocusDetail = detail;

    if (force) {
      if (cameraFocusFrameId) {
        cancelAnimationFrame(cameraFocusFrameId);
        cameraFocusFrameId = 0;
      }

      if (cameraFocusTimerId) {
        clearTimeout(cameraFocusTimerId);
        cameraFocusTimerId = 0;
      }

      flushCameraFocusDispatch();
      return;
    }

    if (cameraFocusFrameId || cameraFocusTimerId) return;

    const now = performance.now();
    const interval = mobile ? MOBILE_CAMERA_EVENT_INTERVAL_MS : DESKTOP_CAMERA_EVENT_INTERVAL_MS;
    const wait = Math.max(0, interval - (now - lastCameraFocusDispatchedAt));

    if (wait <= 0) {
      cameraFocusFrameId = requestAnimationFrame(flushCameraFocusDispatch);
      return;
    }

    cameraFocusTimerId = window.setTimeout(() => {
      cameraFocusTimerId = 0;
      cameraFocusFrameId = requestAnimationFrame(flushCameraFocusDispatch);
    }, wait);
  }

  function focusOnPlayer(playerX, playerY) {
    const target = computeTargetMapPosition(playerX, playerY);

    if (!target) return;

    targetMapX = target.x;
    targetMapY = target.y;

    scheduleCameraFocusDispatch({
      cityId,
      x: lastFocusX,
      y: lastFocusY,
      scale,
      mobile,
      tileMode,
      worldWidth,
      worldHeight,
    });

    ensureCameraLoop();
    scheduleTileUpdate();
  }

  function refresh() {
    const oldFocusX = lastFocusX;
    const oldFocusY = lastFocusY;

    lastViewportTransform = '';
    lastZoomCssValue = '';
    lastEntityScaleCssValue = '';

    measureWorld();
    focusOnPlayer(oldFocusX, oldFocusY);
    scheduleTileUpdate(true);
  }

  function onResize() {
    clearTimeout(resizeRefreshTimer);
    resizeRefreshTimer = window.setTimeout(refresh, mobile ? 160 : 60);
  }

  function onImageReady() {
    refresh();
  }

  setupMobileTileLayer();
  refresh();

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  window.visualViewport?.addEventListener?.('resize', onResize, { passive: true });

  if (!tileMode) {
    mapImages.forEach((image) => {
      image.addEventListener('load', onImageReady, { passive: true });
      image.addEventListener('error', onImageReady, { passive: true });
    });
  }

  return {
    cleanup() {
      clearTimeout(resizeRefreshTimer);
      window.clearTimeout(tileCleanupTimer);

      if (tileUpdateFrame) {
        cancelAnimationFrame(tileUpdateFrame);
      }

      if (cameraFrameId) {
        cancelAnimationFrame(cameraFrameId);
      }

      if (cameraFocusFrameId) {
        cancelAnimationFrame(cameraFocusFrameId);
      }

      if (cameraFocusTimerId) {
        clearTimeout(cameraFocusTimerId);
      }

      if (tileIdleId) {
        cancelIdle(tileIdleId);
      }

      window.dispatchEvent(new CustomEvent('mn:mobile-player-screen-offset', {
        detail: { x: 0, y: 0, cityId },
      }));
      window.__MN_MOBILE_PLAYER_SCREEN_OFFSET__ = { x: 0, y: 0, cityId };

      activeTiles.forEach((tile) => tile.remove());
      activeTiles.clear();
      preloadedTileSrcs.clear();

      if (tileLayerOwned) {
        tileLayer?.remove();
      } else {
        tileLayer?.replaceChildren?.();
      }

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
