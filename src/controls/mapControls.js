const MOBILE_MAP_TILE_ASSETS = import.meta.glob('../../map-tiles/**/*.{png,jpg,jpeg,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const MOBILE_TILE_GRID = 8;
const MOBILE_TILE_RENDER_RADIUS = 2;
const MOBILE_TILE_PRELOAD_RADIUS = 3;
const MOBILE_TILE_KEEP_RADIUS = 4;
const MOBILE_TILE_IDLE_DELAY = 120;
const MOBILE_TILE_CLEANUP_DELAY = 7800;

const MAP_OBJECT_DENSE_LIMIT = 48;
const MAP_OBJECT_DENSE_LIMIT_LOW_POWER = 34;
const MAP_OBJECT_CULL_INTERVAL = 320;
const MAP_OBJECT_MOVING_IDLE_MS = 260;
const MAP_OBJECT_VIEW_PADDING_PERCENT = 8;
const MAP_OBJECT_PERF_STYLE_ID = 'mn-map-controls-object-perf-style';

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
  const preloadedTileSrcs = new Set();

  const perfHome = stage.closest?.('.home') || null;
  const perfTargets = [stage, perfHome].filter(Boolean);
  let mapObjectPerfEnabled = false;
  let mapObjectMovingTimer = null;
  let mapObjectIsMoving = false;
  let mapObjectCullingFrame = null;
  let mapObjectCullLastAt = 0;
  let mapObjectCullLastKey = '';
  let mapObjectLayersCache = [];
  let mapObjectLayersCacheAt = 0;
  let mapObjectDomCount = 0;

  /*
    Camera rewrite:
    focusOnPlayer sets a target and mapControls paints the viewport through one
    lightweight camera loop. This keeps all existing player/network/admin code in
    place, but removes the hard snap that made movement feel like separate steps.
  */
  const CAMERA_SETTLE_EPSILON = mobile ? 0.028 : 0.018;
  const CAMERA_SNAP_DISTANCE = mobile ? 900 : 1100;
  const CAMERA_TARGET_LERP = mobile
    ? (lowPower ? 0.2 : 0.26)
    : (lowPower ? 0.34 : 0.42);
  const CAMERA_FOLLOW_LERP = mobile
    ? (lowPower ? 0.16 : 0.2)
    : (lowPower ? 0.24 : 0.32);

  let desiredMapX = 0;
  let desiredMapY = 0;
  let targetMapX = 0;
  let targetMapY = 0;
  let cameraFrameId = 0;
  let cameraLastFrameAt = 0;
  let cameraReady = false;

  function ensureMapObjectPerfStyle() {
    if (document.getElementById(MAP_OBJECT_PERF_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = MAP_OBJECT_PERF_STYLE_ID;
    style.textContent = `
      [data-map-object-perf="active"] .map-objects-layer,
      [data-map-object-perf="active"] .map-objects-layer-public,
      [data-map-object-perf="active"] .map-objects-layer-admin {
        contain: layout style paint !important;
        backface-visibility: hidden !important;
        transform: translateZ(0) !important;
        pointer-events: none !important;
      }

      [data-map-object-perf="active"] .map-object {
        contain: layout style paint !important;
        backface-visibility: hidden !important;
        transform-style: flat !important;
        transition: none !important;
        animation: none !important;
        will-change: auto !important;
      }

      [data-map-object-perf="active"][data-map-camera-moving="true"] .map-object,
      [data-map-object-perf="active"] [data-map-camera-moving="true"] .map-object {
        box-shadow: none !important;
        filter: none !important;
        text-shadow: none !important;
      }

      [data-map-object-perf="active"] .map-object[data-map-culled="true"] {
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      [data-map-object-perf="active"][data-map-camera-moving="true"] .map-object,
      [data-map-object-perf="active"] [data-map-camera-moving="true"] .map-object {
        pointer-events: none !important;
        cursor: default !important;
      }

      [data-map-object-perf="active"][data-map-camera-moving="true"] .map-object::before,
      [data-map-object-perf="active"][data-map-camera-moving="true"] .map-object::after,
      [data-map-object-perf="active"] [data-map-camera-moving="true"] .map-object::before,
      [data-map-object-perf="active"] [data-map-camera-moving="true"] .map-object::after {
        display: none !important;
        content: none !important;
      }

      [data-map-object-perf="active"][data-map-camera-moving="true"] .map-house-svg,
      [data-map-object-perf="active"][data-map-camera-moving="true"] .map-object-icon,
      [data-map-object-perf="active"] [data-map-camera-moving="true"] .map-house-svg,
      [data-map-object-perf="active"] [data-map-camera-moving="true"] .map-object-icon {
        filter: none !important;
        transition: none !important;
        animation: none !important;
      }

      [data-map-object-perf="active"][data-map-camera-moving="true"] .map-object-badge,
      [data-map-object-perf="active"][data-map-camera-moving="true"] .map-object-sub,
      [data-map-object-perf="active"] [data-map-camera-moving="true"] .map-object-badge,
      [data-map-object-perf="active"] [data-map-camera-moving="true"] .map-object-sub {
        display: none !important;
      }
    `;

    document.head?.appendChild(style);
  }

  function setPerfDataset(name, value) {
    perfTargets.forEach((target) => {
      if (!target?.dataset) return;

      if (value === null || value === undefined || value === false) {
        delete target.dataset[name];
        return;
      }

      target.dataset[name] = String(value);
    });
  }

  function getMapObjectLayers(force = false) {
    const now = performance.now();
    const cacheValid =
      !force &&
      mapObjectLayersCache.length > 0 &&
      now - mapObjectLayersCacheAt < 700 &&
      mapObjectLayersCache.every((layer) => layer?.isConnected);

    if (cacheValid) {
      return mapObjectLayersCache;
    }

    mapObjectLayersCache = Array.from(
      viewport.querySelectorAll(
        '.map-objects-layer, .map-objects-layer-public, .map-objects-layer-admin'
      )
    );
    mapObjectLayersCacheAt = now;

    return mapObjectLayersCache;
  }

  function getMapObjectDomCount() {
    return getMapObjectLayers(true).reduce((total, layer) => {
      return total + (layer?.children?.length || 0);
    }, 0);
  }

  function parsePercentStyle(value) {
    const number = Number.parseFloat(String(value || ''));

    return Number.isFinite(number) ? number : null;
  }

  function getVisiblePercentBounds() {
    const rect = getCachedStageRect();
    const scaledWidth = Math.max(1, worldWidth * scale);
    const scaledHeight = Math.max(1, worldHeight * scale);
    const padding = MAP_OBJECT_VIEW_PADDING_PERCENT;

    const left = 50 + ((-rect.width / 2 - x) / scaledWidth) * 100 - padding;
    const right = 50 + ((rect.width / 2 - x) / scaledWidth) * 100 + padding;
    const top = 50 + ((-rect.height / 2 - y) / scaledHeight) * 100 - padding;
    const bottom = 50 + ((rect.height / 2 - y) / scaledHeight) * 100 + padding;

    return {
      left: clamp(left, -padding, 100 + padding),
      right: clamp(right, -padding, 100 + padding),
      top: clamp(top, -padding, 100 + padding),
      bottom: clamp(bottom, -padding, 100 + padding),
    };
  }

  function clearMapObjectCulling() {
    getMapObjectLayers(true).forEach((layer) => {
      delete layer.dataset.visibleObjectsCount;

      Array.from(layer.children || []).forEach((element) => {
        if (!element?.dataset?.mapCulled) return;

        delete element.dataset.mapCulled;
        element.style.removeProperty('visibility');
        element.style.removeProperty('opacity');
        element.style.removeProperty('pointer-events');
      });
    });

    setPerfDataset('mapObjectVisibleCount', null);
    mapObjectCullLastKey = '';
  }

  function updateMapObjectCulling(force = false) {
    if (!mapObjectPerfEnabled) {
      clearMapObjectCulling();
      return;
    }

    const now = performance.now();

    if (!force && now - mapObjectCullLastAt < MAP_OBJECT_CULL_INTERVAL) {
      return;
    }

    mapObjectCullLastAt = now;

    const bounds = getVisiblePercentBounds();
    const nextKey = [
      Math.round(bounds.left * 2),
      Math.round(bounds.right * 2),
      Math.round(bounds.top * 2),
      Math.round(bounds.bottom * 2),
      mapObjectDomCount,
    ].join(':');

    if (!force && nextKey === mapObjectCullLastKey) {
      return;
    }

    mapObjectCullLastKey = nextKey;

    let visibleCount = 0;
    let totalCount = 0;

    getMapObjectLayers().forEach((layer) => {
      let layerVisibleCount = 0;

      Array.from(layer.children || []).forEach((element) => {
        if (!element?.classList?.contains('map-object')) return;

        totalCount += 1;

        const objectX = parsePercentStyle(element.style.left);
        const objectY = parsePercentStyle(element.style.top);
        const keepVisible =
          element.classList.contains('map-object-selected') ||
          element.classList.contains('map-object-nearby') ||
          element.matches?.('[aria-expanded="true"], [data-force-visible="true"]');

        const insideView =
          keepVisible ||
          objectX === null ||
          objectY === null ||
          (
            objectX >= bounds.left &&
            objectX <= bounds.right &&
            objectY >= bounds.top &&
            objectY <= bounds.bottom
          );

        if (insideView) {
          visibleCount += 1;
          layerVisibleCount += 1;

          if (element.dataset.mapCulled) {
            delete element.dataset.mapCulled;
            element.style.removeProperty('visibility');
            element.style.removeProperty('opacity');
            element.style.removeProperty('pointer-events');
          }

          return;
        }

        if (!element.dataset.mapCulled) {
          element.dataset.mapCulled = 'true';
          element.style.setProperty('visibility', 'hidden', 'important');
          element.style.setProperty('opacity', '0', 'important');
          element.style.setProperty('pointer-events', 'none', 'important');
        }
      });

      layer.dataset.visibleObjectsCount = String(layerVisibleCount);
    });

    setPerfDataset('mapObjectVisibleCount', String(visibleCount));

    if (totalCount !== mapObjectDomCount) {
      updateMapObjectDensity(totalCount);
    }
  }

  function scheduleMapObjectCulling(force = false) {
    if (!mapObjectPerfEnabled && !force) return;
    if (mapObjectCullingFrame) return;

    mapObjectCullingFrame = requestAnimationFrame(() => {
      mapObjectCullingFrame = null;
      updateMapObjectCulling(Boolean(force));
    });
  }

  function updateMapObjectDensity(count = null) {
    const nextCount = Number.isFinite(Number(count))
      ? Number(count)
      : getMapObjectDomCount();

    mapObjectDomCount = Math.max(0, nextCount);

    const denseLimit = lowPower ? MAP_OBJECT_DENSE_LIMIT_LOW_POWER : MAP_OBJECT_DENSE_LIMIT;
    const shouldEnable = mobile && mapObjectDomCount >= denseLimit;

    if (shouldEnable) {
      ensureMapObjectPerfStyle();
      setPerfDataset('mapObjectPerf', 'active');
      setPerfDataset('mapObjectCount', String(mapObjectDomCount));

      if (!mapObjectPerfEnabled) {
        mapObjectPerfEnabled = true;
        scheduleMapObjectCulling(true);
      } else {
        scheduleMapObjectCulling(false);
      }

      return;
    }

    mapObjectPerfEnabled = false;
    mapObjectIsMoving = false;
    setPerfDataset('mapObjectPerf', null);
    setPerfDataset('mapCameraMoving', null);
    setPerfDataset('mapObjectCount', null);
    clearTimeout(mapObjectMovingTimer);
    mapObjectMovingTimer = null;
    clearMapObjectCulling();
  }

  function onMapObjectsRendered(event) {
    const detail = event?.detail || {};
    const count = Number(
      detail.layerChildren ??
      detail.renderedCount ??
      detail.count ??
      NaN
    );

    updateMapObjectDensity(Number.isFinite(count) ? count : null);
  }

  function markCameraMoving() {
    if (!mapObjectPerfEnabled) return;

    mapObjectIsMoving = true;
    setPerfDataset('mapCameraMoving', 'true');

    clearTimeout(mapObjectMovingTimer);
    mapObjectMovingTimer = window.setTimeout(() => {
      mapObjectIsMoving = false;
      setPerfDataset('mapCameraMoving', null);
      scheduleMapObjectCulling(true);
    }, MAP_OBJECT_MOVING_IDLE_MS);
  }

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
      layer.style.pointerEvents = 'none';
      layer.style.backfaceVisibility = 'hidden';
      layer.style.transform = 'translateZ(0)';
      layer.style.contain = 'layout style paint';
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

    /*
      Keep sub-pixel precision. Previous device-pixel snapping reduced GPU work,
      but on movement it created visible stair-step camera motion.
    */
    const precision = 1000;

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

    if (mapObjectPerfEnabled && !mapObjectIsMoving) {
      scheduleMapObjectCulling(false);
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

  function preloadTileSrc(src) {
    if (!src || preloadedTileSrcs.has(src)) return;

    preloadedTileSrcs.add(src);

    const image = new Image();

    image.decoding = 'async';
    image.loading = 'eager';
    image.src = src;
  }

  function loadTilePosition(tilePosition, appendToDom = true) {
    const key = `${tilePosition.x}:${tilePosition.y}`;

    if (activeTiles.has(key)) return;

    const src = findMobileTileSrc(
      cityId,
      MOBILE_TILE_GRID,
      tilePosition.x,
      tilePosition.y
    );

    if (!src) return;

    preloadTileSrc(src);

    if (!appendToDom || !tileLayer) return;

    const tile = createTileElement(tilePosition.x, tilePosition.y, src);
    activeTiles.set(key, tile);
    tileLayer.appendChild(tile);
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

  function getFocusedTileCenter() {
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

    /*
      ВАЖНО: прогрузку карты не убираем.
      Сразу добавляем ближние тайлы в DOM, а внешний круг заранее грузим в память
      браузера через Image(). Когда игрок подходит к зоне, картинка уже в cache.
    */
    const renderTiles = getTileSetAround(tileX, tileY, MOBILE_TILE_RENDER_RADIUS);
    const preloadTiles = getTileSetAround(tileX, tileY, MOBILE_TILE_PRELOAD_RADIUS);
    const keepTiles = getTileSetAround(tileX, tileY, MOBILE_TILE_KEEP_RADIUS);
    const keepKeys = new Set(keepTiles.map((tile) => `${tile.x}:${tile.y}`));

    renderTiles.forEach((tilePosition) => loadTilePosition(tilePosition, true));

    tileIdleId = scheduleIdle(() => {
      tileIdleId = null;

      preloadTiles.forEach((tilePosition) => {
        const key = `${tilePosition.x}:${tilePosition.y}`;

        if (activeTiles.has(key)) return;

        const src = findMobileTileSrc(
          cityId,
          MOBILE_TILE_GRID,
          tilePosition.x,
          tilePosition.y
        );

        preloadTileSrc(src);
      });

      window.clearTimeout(tileCleanupTimer);
      tileCleanupTimer = window.setTimeout(() => unloadFarTiles(keepKeys), MOBILE_TILE_CLEANUP_DELAY);
    }, MOBILE_TILE_IDLE_DELAY);
  }

  function scheduleTileUpdate(force = false) {
    if (!tileMode) return;

    if (!force) {
      const { centerKey } = getFocusedTileCenter();

      if (centerKey === lastTileCenterKey) {
        return;
      }
    }

    if (tileUpdateFrame) return;

    tileUpdateFrame = requestAnimationFrame(() => {
      tileUpdateFrame = null;
      updateMobileTiles(Boolean(force));
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

  function getCameraFrameScale(now) {
    if (!cameraLastFrameAt) {
      cameraLastFrameAt = now;
      return 1;
    }

    const delta = Math.min(34, Math.max(8, now - cameraLastFrameAt));
    cameraLastFrameAt = now;

    return delta / 16.6667;
  }

  function paintCamera(now = performance.now(), force = false) {
    const distanceToDesired = Math.hypot(desiredMapX - x, desiredMapY - y);

    if (!cameraReady || force || distanceToDesired >= CAMERA_SNAP_DISTANCE) {
      targetMapX = desiredMapX;
      targetMapY = desiredMapY;
      x = targetMapX;
      y = targetMapY;
      cameraReady = true;
      cameraLastFrameAt = now;

      applyTransform();
      scheduleTileUpdate(Boolean(force));
      return;
    }

    const frameScale = getCameraFrameScale(now);
    const targetFollow = 1 - Math.pow(1 - CAMERA_TARGET_LERP, frameScale);

    targetMapX += (desiredMapX - targetMapX) * targetFollow;
    targetMapY += (desiredMapY - targetMapY) * targetFollow;

    const dx = targetMapX - x;
    const dy = targetMapY - y;
    const distance = Math.hypot(dx, dy);
    const desiredDistance = Math.hypot(desiredMapX - targetMapX, desiredMapY - targetMapY);

    if (distance <= CAMERA_SETTLE_EPSILON && desiredDistance <= CAMERA_SETTLE_EPSILON) {
      targetMapX = desiredMapX;
      targetMapY = desiredMapY;
      x = targetMapX;
      y = targetMapY;

      applyTransform();
      scheduleTileUpdate();
      return;
    }

    const follow = 1 - Math.pow(1 - CAMERA_FOLLOW_LERP, frameScale);

    x += dx * follow;
    y += dy * follow;

    markCameraMoving();
    applyTransform();
    scheduleTileUpdate();

    if (!cameraFrameId) {
      cameraFrameId = requestAnimationFrame(runCameraFrame);
    }
  }

  function runCameraFrame(now = performance.now()) {
    cameraFrameId = 0;
    paintCamera(now, false);
  }

  function scheduleCameraFrame(force = false) {
    if (force) {
      if (cameraFrameId) {
        cancelAnimationFrame(cameraFrameId);
        cameraFrameId = 0;
      }

      paintCamera(performance.now(), true);
      return;
    }

    /*
      Coalesce all focusOnPlayer calls into one rAF paint. In dense cities the
      old immediate paint could transform the whole map more than once per frame,
      which made 100+ SVG houses feel like step-by-step movement.
    */
    if (!cameraFrameId) {
      cameraFrameId = requestAnimationFrame(runCameraFrame);
    }
  }

  function focusOnPlayer(playerX, playerY, options = {}) {
    const nextTarget = computeTargetMapPosition(playerX, playerY);

    if (!nextTarget) return;

    desiredMapX = nextTarget.x;
    desiredMapY = nextTarget.y;

    if (options.force || !cameraReady) {
      targetMapX = desiredMapX;
      targetMapY = desiredMapY;
    }

    scheduleCameraFrame(Boolean(options.force));
  }

  function refresh() {
    scale = getMapProfile().scale;

    lastViewportTransform = '';
    lastZoomCssValue = '';
    lastEntityScaleCssValue = '';

    measureWorld();
    focusOnPlayer(lastFocusX, lastFocusY, { force: true });
    updateMapObjectDensity();
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
  window.addEventListener('mn:map-objects-rendered', onMapObjectsRendered, { passive: true });
  window.addEventListener('mn:map-objects-dom-rendered', onMapObjectsRendered, { passive: true });

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

      if (cameraFrameId) {
        cancelAnimationFrame(cameraFrameId);
      }

      if (tileUpdateFrame) {
        cancelAnimationFrame(tileUpdateFrame);
      }

      if (tileIdleId) {
        cancelIdle(tileIdleId);
      }

      if (mapObjectCullingFrame) {
        cancelAnimationFrame(mapObjectCullingFrame);
      }

      clearTimeout(mapObjectMovingTimer);
      mapObjectIsMoving = false;
      clearMapObjectCulling();
      setPerfDataset('mapObjectPerf', null);
      setPerfDataset('mapCameraMoving', null);
      setPerfDataset('mapObjectCount', null);

      activeTiles.clear();
      preloadedTileSrcs.clear();
      tileLayer?.remove();

      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.visualViewport?.removeEventListener?.('resize', onResize);
      window.removeEventListener('mn:map-objects-rendered', onMapObjectsRendered);
      window.removeEventListener('mn:map-objects-dom-rendered', onMapObjectsRendered);

      mapImages.forEach((image) => {
        image.removeEventListener('load', onImageReady);
        image.removeEventListener('error', onImageReady);
      });
    },

    focusOnPlayer,
    refresh,
  };
}

