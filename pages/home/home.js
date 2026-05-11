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
  let scale = 1;
  let x = 0;
  let y = 0;

  let isDragging = false;
  let activePointerId = null;
  let startX = 0;
  let startY = 0;
  let startMapX = 0;
  let startMapY = 0;

  const MIN_SCALE = 1;
  const MAX_SCALE = 9;

  function getLimits() {
    const rect = stage.getBoundingClientRect();

    const mapWidth = rect.width * scale;
    const mapHeight = rect.height * scale;

    return {
      maxX: Math.max(0, (mapWidth - rect.width) / 2),
      maxY: Math.max(0, (mapHeight - rect.height) / 2),
    };
  }

  function applyTransform() {
    const limits = getLimits();

    x = clamp(x, -limits.maxX, limits.maxX);
    y = clamp(y, -limits.maxY, limits.maxY);

    viewport.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
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

    isDragging = true;
    activePointerId = event.pointerId;

    startX = event.clientX;
    startY = event.clientY;
    startMapX = x;
    startMapY = y;

    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener('pointermove', (event) => {
    if (!isDragging || event.pointerId !== activePointerId) return;

    x = startMapX + event.clientX - startX;
    y = startMapY + event.clientY - startY;

    applyTransform();
  });

  stage.addEventListener('pointerup', (event) => {
    if (event.pointerId !== activePointerId) return;

    isDragging = false;
    activePointerId = null;
  });

  stage.addEventListener('pointercancel', () => {
    isDragging = false;
    activePointerId = null;
  });

  stage.addEventListener('wheel', (event) => {
    event.preventDefault();

    const delta = event.deltaY > 0 ? -0.35 : 0.35;
    zoomAt(event.clientX, event.clientY, scale + delta);
  }, { passive: false });

  stage.addEventListener('dblclick', (event) => {
    if (scale > 1.1) {
      scale = 1;
      x = 0;
      y = 0;
      applyTransform();
      return;
    }

    zoomAt(event.clientX, event.clientY, 2.7);
  });

  window.addEventListener('resize', applyTransform);

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
          <div class="gta-water-layer water-main"></div>
          <div class="gta-water-layer water-light"></div>
          <div class="gta-water-layer water-lines"></div>
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
