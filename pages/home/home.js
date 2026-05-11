import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';
import { getCityWeather } from '../../src/weather/weather.js';

const MAP_FILES = import.meta.glob('../../*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

function getMapByFileName(fileName) {
  const entry = Object.entries(MAP_FILES).find(([path]) => path.endsWith(`/${fileName}`));
  return entry?.[1] || null;
}

function getCityMap(city) {
  const mapPath = String(city.map || '').replace(/^\.?\//, '');
  const mapFileName = mapPath.split('/').pop();

  return getMapByFileName(mapFileName) || getMapByFileName('UkraineMap.png');
}

function getUserDayMode() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 19 ? 'day' : 'night';
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isLowPowerDevice() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const isSmallScreen = window.matchMedia('(max-width: 520px)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return reducedMotion || memory <= 3 || cores <= 4 || isSmallScreen;
}

function enableMapControls(stage, viewport) {
  const lowPower = isLowPowerDevice();

  const MIN_SCALE = lowPower ? 0.82 : 0.9;
  const MAX_SCALE = lowPower ? 5.5 : 8;
  const WORLD_FACTOR = lowPower ? 1.38 : 1.55;

  let scale = 1;
  let x = 0;
  let y = 0;
  let worldWidth = 0;
  let worldHeight = 0;

  let isDragging = false;
  let activePointerId = null;
  let startX = 0;
  let startY = 0;
  let startMapX = 0;
  let startMapY = 0;

  let ticking = false;
  let pendingApply = false;

  const pointers = new Map();
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchCenter = { x: 0, y: 0 };

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

  function applyTransformNow() {
    const limits = getLimits();

    x = clamp(x, -limits.maxX, limits.maxX);
    y = clamp(y, -limits.maxY, limits.maxY);

    viewport.style.transform =
      `translate(-50%, -50%) translate3d(${x}px, ${y}px, 0) scale(${scale})`;

    stage.style.setProperty('--zoom', scale.toFixed(2));
  }

  function applyTransform() {
    if (!lowPower) {
      applyTransformNow();
      return;
    }

    pendingApply = true;

    if (ticking) return;

    ticking = true;

    requestAnimationFrame(() => {
      if (pendingApply) {
        applyTransformNow();
        pendingApply = false;
      }

      ticking = false;
    });
  }

  function zoomAt(clientX, clientY, nextScale) {
    const rect = stage.getBoundingClientRect();

    const pointX = clientX - rect.left - rect.width / 2;
    const pointY = clientY - rect.top - rect.height / 2;

    const oldScale = scale;
    scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);

    const factor = scale / oldScale;

    x = pointX - (pointX - x) * factor;
    y = pointY - (pointY - y) * factor;

    applyTransform();
  }

  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.gta-map-header')) return;

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture(event.pointerId);

    if (pointers.size === 1) {
      isDragging = true;
      activePointerId = event.pointerId;

      startX = event.clientX;
      startY = event.clientY;
      startMapX = x;
      startMapY = y;
    } else if (pointers.size === 2) {
      isDragging = false;
      activePointerId = null;

      const [p1, p2] = [...pointers.values()];

      pinchStartDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      pinchStartScale = scale;
      pinchCenter = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };
    }
  });

  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (pinchStartDist > 0) {
        zoomAt(pinchCenter.x, pinchCenter.y, pinchStartScale * (dist / pinchStartDist));
      }

      return;
    }

    if (isDragging && event.pointerId === activePointerId) {
      x = startMapX + event.clientX - startX;
      y = startMapY + event.clientY - startY;
      applyTransform();
    }
  });

  function endPointer(event) {
    pointers.delete(event.pointerId);

    if (pointers.size < 2) {
      pinchStartDist = 0;
    }

    if (pointers.size === 1) {
      const [remainingId] = [...pointers.keys()];
      const p = pointers.get(remainingId);

      isDragging = true;
      activePointerId = remainingId;

      startX = p.x;
      startY = p.y;
      startMapX = x;
      startMapY = y;
    }

    if (pointers.size === 0) {
      isDragging = false;
      activePointerId = null;
    }
  }

  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('pointerleave', endPointer);

  stage.addEventListener('wheel', (event) => {
    event.preventDefault();

    const delta = event.deltaY > 0 ? -0.12 : 0.12;
    zoomAt(event.clientX, event.clientY, scale * (1 + delta));
  }, { passive: false });

  stage.addEventListener('dblclick', (event) => {
    if (scale > 1.1) {
      scale = 1;
      x = 0;
      y = 0;
      applyTransform();
      return;
    }

    zoomAt(event.clientX, event.clientY, lowPower ? 2 : 2.35);
  });

  window.addEventListener('resize', () => {
    measureWorld();
    applyTransform();
  });

  measureWorld();
  applyTransform();
}

register('home', (root) => {
  root.className = 'page home';

  const cityId = normalizeCityId(state.city);
  const city = getCityConfig(cityId);
  const dayMode = getUserDayMode();
  const weather = getCityWeather(cityId);

  if (state.city !== cityId) {
    state.city = cityId;
    state.cityName = city.name;
    save();
  }

  const mapSrc = getCityMap(city);

  root.dataset.city = cityId;
  root.dataset.time = dayMode;
  root.dataset.weather = weather.type;

  if (isLowPowerDevice()) {
    root.dataset.performance = 'low';
  } else {
    root.dataset.performance = 'normal';
  }

root.innerHTML = `
  <main class="home-gameplay">
    <section class="gta-map-stage">
      <div class="gta-map-bg"></div>
      <div class="gta-stars"></div>
      <div class="gta-sky-light"></div>

      <div class="gta-water">
        <div class="gta-water-soft"></div>
      </div>

      <div class="gta-map-viewport">
        <div class="gta-map-weather">
          <div class="gta-weather-sun"></div>
          <div class="gta-weather-clouds"></div>
          <div class="gta-weather-rain"></div>
          <div class="gta-weather-heat"></div>
        </div>

        <img
          class="gta-map-image gta-map-glow"
          src="${mapSrc}"
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
        />

        <img
          class="gta-map-image"
          src="${mapSrc}"
          alt="${city.name}"
          loading="eager"
          decoding="async"
          fetchpriority="high"
        />
      </div>

      <header class="gta-map-header">
        <div class="gta-map-title">
          <span class="gta-time-badge">
            ${dayMode === 'day' ? '☀ День' : '☾ Ночь'}
          </span>

          <span class="gta-weather-badge">
            ${weather.icon} ${weather.label} · ${weather.temperature}°C
          </span>

          <strong>${city.name}</strong>
        </div>

        <div class="gta-map-player">
          ${state.nickname || 'Игрок'}
        </div>
      </header>
    </section>
  </main>
`;

  const stage = root.querySelector('.gta-map-stage');
  const viewport = root.querySelector('.gta-map-viewport');

  enableMapControls(stage, viewport);
});
