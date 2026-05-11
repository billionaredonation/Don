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

/* ============================================================
   SVG-МАСКА ГОРОДА С РВАНЫМ КРАЕМ
   ============================================================
   Координаты заданы в системе 1000x1000 (см. viewBox).
   Это органический силуэт "город у реки" — основной массив
   суши плюс несколько обособленных кусочков (острова/районы),
   чтобы край смотрелся натурально, а не как один овал.

   Если у тебя появится точный GeoJSON города — просто
   замени массивы ниже на свои [x, y] в координатах 0..1000.
   ============================================================ */
const CITY_SHAPES = [
  // Основной массив города
  [
    [180, 210], [240, 170], [320, 150], [410, 140], [490, 155],
    [560, 175], [620, 200], [680, 230], [730, 270], [770, 320],
    [800, 380], [820, 450], [830, 520], [820, 590], [800, 650],
    [760, 700], [710, 740], [650, 770], [580, 790], [510, 800],
    [440, 795], [370, 780], [310, 755], [260, 720], [220, 680],
    [195, 630], [180, 575], [170, 515], [165, 450], [165, 385],
    [170, 320], [175, 260],
  ],
  // Островок / район 1
  [
    [120, 470], [150, 440], [165, 470], [155, 510], [125, 515], [110, 495],
  ],
  // Островок / район 2
  [
    [840, 280], [870, 270], [885, 295], [875, 320], [850, 325], [835, 305],
  ],
  // Островок / район 3
  [
    [600, 850], [640, 840], [665, 865], [655, 890], [615, 895], [595, 875],
  ],
];

function shapeToPath(points) {
  return points.reduce((acc, [px, py], i) => {
    return acc + (i === 0 ? `M${px},${py}` : `L${px},${py}`);
  }, '') + 'Z';
}

function buildCityMaskDataUrl() {
  const paths = CITY_SHAPES.map(shapeToPath).join(' ');

  const svg = `
<svg xmlns="[w3.org](http://www.w3.org/2000/svg)" viewBox="0 0 1000 1000" preserveAspectRatio="none">
  <defs>
    <filter id="tear" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="7" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="38" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
  <g filter="url(#tear)">
    <path d="${paths}" fill="white"/>
  </g>
</svg>`.trim();

  const encoded = encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');

  return `url("data:image/svg+xml;charset=utf-8,${encoded}")`;
}

/* ============================================================ */

function enableMapControls(stage, viewport) {
  const MIN_SCALE = 0.6;
  const MAX_SCALE = 9;
  const WORLD_FACTOR = 1.6;

  let scale = 1;
  let x = 0;
  let y = 0;
  let worldSize = 0;

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
    worldSize = Math.max(rect.width, rect.height) * WORLD_FACTOR;
    viewport.style.width = `${worldSize}px`;
    viewport.style.height = `${worldSize}px`;
  }

  function getLimits() {
    const rect = stage.getBoundingClientRect();
    const w = worldSize * scale;
    const h = worldSize * scale;

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
        const nextScale = pinchStartScale * (dist / pinchStartDist);
        zoomAt(pinchCenter.x, pinchCenter.y, nextScale);
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
    const factor = 1 + delta;
    zoomAt(event.clientX, event.clientY, scale * factor);
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

  // Подключаем рваную SVG-маску города
  viewport.style.setProperty('--mask-url', buildCityMaskDataUrl());

  enableMapControls(stage, viewport);
});
