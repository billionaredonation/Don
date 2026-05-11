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

function money(value) {
  return Number(value || 0).toLocaleString('ru-RU') + ' грн';
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function enableMapControls(stage, map) {
  let scale = 1;
  let x = 0;
  let y = 0;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startMapX = 0;
  let startMapY = 0;
  let lastTouchDistance = 0;

  function applyTransform() {
    map.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  }

  function zoomAt(clientX, clientY, nextScale) {
    const rect = stage.getBoundingClientRect();

    const pointX = clientX - rect.left - rect.width / 2;
    const pointY = clientY - rect.top - rect.height / 2;

    const oldScale = scale;
    scale = clamp(nextScale, 1, 8);

    const factor = scale / oldScale;

    x = pointX - (pointX - x) * factor;
    y = pointY - (pointY - y) * factor;

    applyTransform();
  }

  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, scale + (event.deltaY > 0 ? -0.3 : 0.3));
  }, { passive: false });

  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;

    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startMapX = x;
    startMapY = y;

    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener('pointermove', (event) => {
    if (!dragging) return;

    x = startMapX + event.clientX - startX;
    y = startMapY + event.clientY - startY;

    applyTransform();
  });

  stage.addEventListener('pointerup', () => {
    dragging = false;
  });

  stage.addEventListener('pointercancel', () => {
    dragging = false;
  });

  stage.addEventListener('touchstart', (event) => {
    if (event.touches.length === 1) {
      dragging = true;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      startMapX = x;
      startMapY = y;
    }

    if (event.touches.length === 2) {
      dragging = false;

      const a = event.touches[0];
      const b = event.touches[1];

      lastTouchDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
  }, { passive: false });

  stage.addEventListener('touchmove', (event) => {
    event.preventDefault();

    if (event.touches.length === 1 && dragging) {
      x = startMapX + event.touches[0].clientX - startX;
      y = startMapY + event.touches[0].clientY - startY;
      applyTransform();
    }

    if (event.touches.length === 2) {
      const a = event.touches[0];
      const b = event.touches[1];

      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const centerX = (a.clientX + b.clientX) / 2;
      const centerY = (a.clientY + b.clientY) / 2;

      if (lastTouchDistance) {
        zoomAt(centerX, centerY, scale * (distance / lastTouchDistance));
      }

      lastTouchDistance = distance;
    }
  }, { passive: false });

  stage.addEventListener('touchend', () => {
    dragging = false;
    lastTouchDistance = 0;
  });

  stage.addEventListener('dblclick', (event) => {
    if (scale > 1.2) {
      scale = 1;
      x = 0;
      y = 0;
      applyTransform();
      return;
    }

    zoomAt(event.clientX, event.clientY, 2.4);
  });

  applyTransform();
}

const POINTS = {
  profile: {
    title: 'Профиль',
    label: 'Игрок',
    text: 'Личная карточка персонажа, город, стартовый капитал и будущая статистика.',
    x: 27,
    y: 34,
  },
  work: {
    title: 'Работа',
    label: 'Заработок',
    text: 'Здесь будет стартовая механика заработка: смены, энергия, опыт и прокачка профессий.',
    x: 56,
    y: 41,
  },
  business: {
    title: 'Бизнес',
    label: 'Капитал',
    text: 'Будущая зона для активов, оборота, улучшений и городских предприятий.',
    x: 72,
    y: 58,
  },
  home: {
    title: 'Дом',
    label: 'База',
    text: 'Личная база игрока: жильё, комфорт, бонусы и восстановление ресурсов.',
    x: 39,
    y: 66,
  },
  skills: {
    title: 'Навыки',
    label: 'Развитие',
    text: 'Прокачка персонажа: работа, бизнес, транспорт, интеллект и городские умения.',
    x: 52,
    y: 78,
  },
};

function renderPoint(id, point) {
  return `
    <button
      class="map-point"
      type="button"
      data-point="${id}"
      style="--x:${point.x}%; --y:${point.y}%;"
      aria-label="${point.title}"
    >
      <span></span>
      <b>${point.label}</b>
    </button>
  `;
}

function setPanel(root, point, city) {
  const panel = root.querySelector('#homePanel');

  panel.innerHTML = `
    <div class="home-panel-kicker">${point.title}</div>
    <h2>${point.label}</h2>
    <p>${point.text}</p>
    <small>${city.name} · ${city.region || 'городской регион'}</small>
  `;
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
        <div class="water-layer water-layer-back"></div>
        <div class="water-layer water-layer-front"></div>

        <div class="city-map-frame">
          <img
            class="city-map-image"
            src="${mapSrc}"
            alt="${city.name}"
            loading="eager"
            decoding="async"
          />

          <div class="map-points">
            ${Object.entries(POINTS).map(([id, point]) => renderPoint(id, point)).join('')}
          </div>
        </div>

        <header class="home-hud">
          <div class="home-city-chip">
            <span>${city.region || 'Город'}</span>
            <b>${city.name}</b>
          </div>

          <div class="home-player-chip">
            <b>${state.nickname || 'Игрок'}</b>
            <span>${money(city.startMoney)}</span>
          </div>
        </header>

        <section class="home-panel" id="homePanel">
          <div class="home-panel-kicker">Карта города</div>
          <h2>${city.name}</h2>
          <p>${city.tagline || 'Город открыт для развития. Выбирай район на карте и начинай движение.'}</p>
          <small>Двойной клик — приблизить / сбросить · Колесо или pinch — zoom</small>
        </section>
      </section>
    </main>
  `;

  const stage = root.querySelector('.home-map-stage');
  const map = root.querySelector('.city-map-frame');

  enableMapControls(stage, map);

  root.querySelector('.map-points').addEventListener('click', (event) => {
    const button = event.target.closest('.map-point');
    if (!button) return;

    const point = POINTS[button.dataset.point];
    if (!point) return;

    setPanel(root, point, city);
  });
});
