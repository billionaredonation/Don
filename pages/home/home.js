import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';

/* ---------------------------------------------------------------------
   1.  JS-ЛОГИКА ОСТАЁТСЯ ПРЕЖНЕЙ, МЫ МЕНЯЕМ ТОЛЬКО:
      • WORLD_FACTOR   →  1.0   (карта помещается целиком)
      • стартовый scale рассчитываем автоматически
      • убираем слой water-lines из HTML-шаблона
   ------------------------------------------------------------------ */

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
   SVG-МАСКА ГОРОДА (см. комментарии в оригинале)
   ============================================================ */

const CITY_SHAPES = [
  /* … массивы координат без изменений … */
];

function shapeToPath(points) {
  return points.reduce((acc, [px, py], i) => {
    return acc + (i === 0 ? `M${px},${py}` : `L${px},${py}`);
  }, '') + 'Z';
}

function buildCityMaskDataUrl() {
  /* … функция без изменений … */
}

/* ============================================================ */

function enableMapControls(stage, viewport) {
  const MIN_SCALE = 0.6;
  const MAX_SCALE = 9;
  const WORLD_FACTOR = 1.0;            // ★ было 1.6

  let scale = 1;
  let x = 0;
  let y = 0;
  let worldSize = 0;

  /* … остальные переменные без изменений … */

  function measureWorld() {
    const rect = stage.getBoundingClientRect();
    worldSize = Math.max(rect.width, rect.height) * WORLD_FACTOR;
    viewport.style.width  = `${worldSize}px`;
    viewport.style.height = `${worldSize}px`;
  }

  /* … функции getLimits, applyTransform, zoomAt без изменений … */

  /* --- события pointer / wheel / dblclick — без изменений --- */

  window.addEventListener('resize', () => {
    measureWorld();
    applyTransform();
  });

  /* ---------- стартовая инициализация ---------- */
  measureWorld();

  /* ★ Вычисляем минимальный zoom, чтобы карта целиком влезла на экран */
  scale = Math.min(
    stage.clientWidth  / worldSize,
    stage.clientHeight / worldSize
  );
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

  /* ------------------ HTML-шаблон -------------------
     · строка с water-lines УДАЛЕНА
  --------------------------------------------------- */
  root.innerHTML = `
    <main class="home-gameplay">
      <section class="gta-map-stage">
        <div class="gta-map-bg"></div>

        <div class="gta-water">
          <div class="gta-water-layer water-main"></div>
          <div class="gta-water-layer water-light"></div>
          <!-- <div class="gta-water-layer water-lines"></div> --> <!-- ★ убрано -->
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

  const stage    = root.querySelector('.gta-map-stage');
  const viewport = root.querySelector('.gta-map-viewport');

  /* Подключаем SVG-маску */
  viewport.style.setProperty('--mask-url', buildCityMaskDataUrl());

  enableMapControls(stage, viewport);
});
