import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function enableMapControls(stage, viewport) {
  const MIN_SCALE = 0.78;
  const MAX_SCALE = 8;
  const WORLD_FACTOR = 1.18;

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

  const pointers = new Map();
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchCenter = { x: 0, y: 0 };

  function measureWorld() {
    const rect = stage.getBoundingClientRect();

    worldWidth = rect.width * WORLD_FACTOR;
    worldHeight = rect.height * WORLD_FACTOR;

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
    const limits = getLimits();

    x = clamp(x, -limits.maxX, limits.maxX);
    y = clamp(y, -limits.maxY, limits.maxY);

    viewport.style.transform =
      `translate(-50%, -50%) translate3d(${x}px, ${y}px, 0) scale(${scale})`;

    stage.style.setProperty('--zoom', scale.toFixed(2));
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
    if (event.target.closest('.gta-map-header, .gta-map-footer')) return;

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

    zoomAt(event.clientX, event.clientY, 2.35);
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

  if (state.city !== cityId) {
    state.city = cityId;
    state.cityName = city.name;
    save();
  }

  const mapSrc = getCityMap(city);

  root.dataset.city = cityId;

  root.innerHTML = `
    <main class="home-gameplay">
      <section class="gta-map-stage">
        <div class="gta-map-bg"></div>

        <div class="gta-water">
          <div class="gta-water-soft"></div>
        </div>

        <div class="gta-map-viewport">
          <img
            class="gta-map-image"
            src="${mapSrc}"
            alt="${city.name}"
            loading="eager"
            decoding="async"
          />

          <div class="gta-map-markers">
            <button class="gta-marker marker-work" type="button">
              <span></span>
              <b>Робота</b>
            </button>

            <button class="gta-marker marker-base" type="button">
              <span></span>
              <b>База</b>
            </button>

            <button class="gta-marker marker-market" type="button">
              <span></span>
              <b>Ринок</b>
            </button>
          </div>
        </div>

        <header class="gta-map-header">
          <div class="gta-map-title">
            <span>MN MAP</span>
            <strong>${city.name}</strong>
          </div>

          <div class="gta-map-player">
            ${state.nickname || 'Игрок'}
          </div>
        </header>

        <footer class="gta-map-footer">
          <span>Колесо / pinch — масштаб</span>
          <span>Перетаскивай карту</span>
          <span>Двойной клик — сброс</span>
        </footer>
      </section>
    </main>
  `;

  const stage = root.querySelector('.gta-map-stage');
  const viewport = root.querySelector('.gta-map-viewport');

  enableMapControls(stage, viewport);
});
