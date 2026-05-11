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

function enableMapControls(stage, map) {
  let scale = 1;
  let x = 0;
  let y = 0;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startMapX = 0;
  let startMapY = 0;

  let lastTouchDistance = 0;
  let lastTouchCenter = null;

  function applyTransform() {
    map.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  }

  function zoomAt(clientX, clientY, nextScale) {
    const rect = stage.getBoundingClientRect();

    const pointX = clientX - rect.left - rect.width / 2;
    const pointY = clientY - rect.top - rect.height / 2;

    const oldScale = scale;
    scale = clamp(nextScale, 1, 4);

    const factor = scale / oldScale;

    x = pointX - (pointX - x) * factor;
    y = pointY - (pointY - y) * factor;

    applyTransform();
  }

  stage.addEventListener('wheel', (event) => {
    event.preventDefault();

    const delta = event.deltaY > 0 ? -0.18 : 0.18;
    zoomAt(event.clientX, event.clientY, scale + delta);
  }, { passive: false });

  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;

    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startMapX = x;
    startMapY = y;

    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener('pointermove', (event) => {
    if (!isDragging) return;

    x = startMapX + event.clientX - startX;
    y = startMapY + event.clientY - startY;

    applyTransform();
  });

  stage.addEventListener('pointerup', () => {
    isDragging = false;
  });

  stage.addEventListener('pointercancel', () => {
    isDragging = false;
  });

  stage.addEventListener('touchstart', (event) => {
    if (event.touches.length === 1) {
      isDragging = true;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      startMapX = x;
      startMapY = y;
    }

    if (event.touches.length === 2) {
      isDragging = false;

      const a = event.touches[0];
      const b = event.touches[1];

      lastTouchDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      lastTouchCenter = {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
      };
    }
  }, { passive: false });

  stage.addEventListener('touchmove', (event) => {
    event.preventDefault();

    if (event.touches.length === 1 && isDragging) {
      x = startMapX + event.touches[0].clientX - startX;
      y = startMapY + event.touches[0].clientY - startY;
      applyTransform();
    }

    if (event.touches.length === 2) {
      const a = event.touches[0];
      const b = event.touches[1];

      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const center = {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
      };

      if (lastTouchDistance && lastTouchCenter) {
        const ratio = distance / lastTouchDistance;
        zoomAt(center.x, center.y, scale * ratio);
      }

      lastTouchDistance = distance;
      lastTouchCenter = center;
    }
  }, { passive: false });

  stage.addEventListener('touchend', () => {
    isDragging = false;
    lastTouchDistance = 0;
    lastTouchCenter = null;
  });

  stage.addEventListener('dblclick', (event) => {
    if (scale > 1.2) {
      scale = 1;
      x = 0;
      y = 0;
      applyTransform();
    } else {
      zoomAt(event.clientX, event.clientY, 2);
    }
  });

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
      <section class="home-map-stage">
        <img
          class="city-map-image"
          src="${mapSrc}"
          alt="${city.name}"
          loading="eager"
          decoding="async"
        />
      </section>
    </main>
  `;

  const stage = root.querySelector('.home-map-stage');
  const map = root.querySelector('.city-map-image');

  enableMapControls(stage, map);
});
