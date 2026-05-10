import { register, show } from '../../src/router.js';
import { state, save, getState } from '../../src/state.js';
import { citiesBase } from '../../src/data/citiesBase.js';
import { getInflation, getDevaluation, getStateAssetsShare } from '../../src/lib/economy.js';



const ROOT_ASSETS = import.meta.glob('../../*.{png,svg,jpg,jpeg,webp,gif,ico,avif}', {
  eager: true,
  query: '?url',
  import: 'default'
});

function rootAsset(src) {
  const cleanSrc = String(src || '')
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .split('?')[0];

  const key = `../../${cleanSrc}`;
  const bundled = ROOT_ASSETS[key];

  if (bundled) {
    return bundled;
  }

  return new URL(`../../${cleanSrc}`, import.meta.url).href;
}

const FALLBACK_MAP_SRC = 'UkraineMap.png';

const REGIONS_SVG_CANDIDATES = [
  rootAsset('ua.svg')
];
const REGIONS_VIEW_BOX = '0 0 1000 669';
const MAX_ZOOM = 3.4;

const REGION_DATA = {
  UA05: { cityId: 'vinnytsia', cityName: 'Винница' },
  UA07: { cityId: 'lutsk', cityName: 'Луцк' },
  UA09: { cityId: 'luhansk', cityName: 'Луганск' },
  UA12: { cityId: 'dnipro', cityName: 'Днепр' },
  UA14: { cityId: 'donetsk', cityName: 'Донецк' },
  UA18: { cityId: 'zhytomyr', cityName: 'Житомир' },
  UA21: { cityId: 'uzhhorod', cityName: 'Ужгород' },
  UA23: { cityId: 'zaporizhzhia', cityName: 'Запорожье' },
  UA26: { cityId: 'ivano-frankivsk', cityName: 'Ивано-Франковск' },
  UA30: { cityId: 'kyiv', cityName: 'Киев' },
  UA32: { cityId: 'kyiv', cityName: 'Киев' },
  UA35: { cityId: 'kropyvnytskyi', cityName: 'Кропивницкий' },
  UA43: { cityId: 'crimea', cityName: 'Крым' },
  UA46: { cityId: 'lviv', cityName: 'Львов' },
  UA48: { cityId: 'mykolaiv', cityName: 'Николаев' },
  UA51: { cityId: 'odesa', cityName: 'Одесса' },
  UA53: { cityId: 'poltava', cityName: 'Полтава' },
  UA56: { cityId: 'rivne', cityName: 'Ровно' },
  UA59: { cityId: 'sumy', cityName: 'Сумы' },
  UA61: { cityId: 'ternopil', cityName: 'Тернополь' },
  UA63: { cityId: 'kharkiv', cityName: 'Харьков' },
  UA65: { cityId: 'kherson', cityName: 'Херсон' },
  UA68: { cityId: 'khmelnytskyi', cityName: 'Хмельницкий' },
  UA71: { cityId: 'cherkasy', cityName: 'Черкассы' },
  UA74: { cityId: 'chernihiv', cityName: 'Чернигов' },
  UA77: { cityId: 'chernivtsi', cityName: 'Черновцы' }
};

const CITY_MAPS = {
  vinnytsia: './VinitsaMap.png',
  lutsk: './LutskMap.png',
  luhansk: './LuganskMap.png',
  dnipro: './DneprMap.png',
  donetsk: './DonetskMap.png',
  zhytomyr: './ZutomyrMap.png',
  uzhhorod: './UzgorodMap.png',
  zaporizhzhia: './Zaporozya.png',
  'ivano-frankivsk': './IvanoFrankovsk.png',
  kyiv: './KiyvMap.png',
  kropyvnytskyi: './Kropivnitskyi.png',
  crimea: './KrymMap.png',
  lviv: './Lviv.png',
  mykolaiv: './Nikolaev.png',
  odesa: './Odessa.png',
  poltava: './Poltava.png',
  rivne: './Rovno.png',
  sumy: './Sumy.png',
  ternopil: './Ternopil.png',
  kharkiv: './Kharkiv.png',
  kherson: './Kherson.png',
  khmelnytskyi: './Khmelnitskiy.png',
  cherkasy: './CherkasyMap.png',
  chernihiv: './ChernigovMap.png',
  chernivtsi: './ChernivtsiMap.png'
};

const CITY_MAP_FALLBACKS = {
  cherkasy: [
    './CherkasyMap.png',
    './Cherkasy.png',
    './CherkassyMap.png',
    './Cherkassy.png',
    './CherkasiMap.png',
    './Cherkasi.png',
    './cherkasymap.png',
    './cherkasy.png',
    './cherkassyMap.png',
    './cherkassy.png',
    './cherkasiMap.png',
    './cherkasi.png',
    './UkraineMap.png'
  ]
};

const CITY_ID_ALIASES = {
  odessa: 'odesa',
  kiev: 'kyiv',
  kiyv: 'kyiv',
  zaporizhia: 'zaporizhzhia',
  zaporizhzhya: 'zaporizhzhia',
  zaporozhye: 'zaporizhzhia',
  ivanoFrankivsk: 'ivano-frankivsk',
  'ivano-frankovsk': 'ivano-frankivsk',
  krym: 'crimea',
  crimeaMap: 'crimea',
  rovno: 'rivne',
  nikolaev: 'mykolaiv',
  chernigov: 'chernihiv',
  khmelnitskiy: 'khmelnytskyi',
  zutomyr: 'zhytomyr',
  cherkassy: 'cherkasy',
  cherkasyMap: 'cherkasy',
  cherkasi: 'cherkasy'
};

const CITY_META = {
  vinnytsia: { title: 'Винница', subtitle: 'Спокойный старт: агро, сервис и легкая промышленность.', jobs: ['Агро', 'Пекарня', 'Сервис'] },
  lutsk: { title: 'Луцк', subtitle: 'Деревообработка, склады и тихий региональный сервис.', jobs: ['Лесопилка', 'Склад', 'Сервис'] },
  luhansk: { title: 'Луганск', subtitle: 'Промышленный регион для восстановления производства.', jobs: ['Шахта', 'Ремонт', 'Логистика'] },
  dnipro: { title: 'Днепр', subtitle: 'Логистика, производство, склады и городской бизнес.', jobs: ['Логистика', 'Склад', 'СТО'] },
  donetsk: { title: 'Донецк', subtitle: 'Металлургия и тяжелое производство в стадии восстановления.', jobs: ['Шахта', 'Метзавод', 'СТО'] },
  zhytomyr: { title: 'Житомир', subtitle: 'Камень, деревообработка и удобная логистика.', jobs: ['Карьер', 'Пилорама', 'Склад'] },
  uzhhorod: { title: 'Ужгород', subtitle: 'Граница, туризм, вино и сервисный бизнес.', jobs: ['Винодельня', 'Отель', 'Кафе'] },
  zaporizhzhia: { title: 'Запорожье', subtitle: 'Индустриальный регион с заводами и металлом.', jobs: ['Завод', 'Металлургия', 'СТО'] },
  'ivano-frankivsk': { title: 'Ивано-Франковск', subtitle: 'Туризм, лесная промышленность и креативные сервисы.', jobs: ['Туризм', 'Кофейня', 'Коворкинг'] },
  kyiv: { title: 'Киев', subtitle: 'Столица: офисы, доставка, такси и высокий темп.', jobs: ['Офис', 'Курьер', 'Такси'] },
  kropyvnytskyi: { title: 'Кропивницкий', subtitle: 'Аграрный хаб, техника и зерновые склады.', jobs: ['Элеватор', 'СТО', 'Агро'] },
  crimea: { title: 'Крым', subtitle: 'Курорты, порты, вино и туристический бизнес.', jobs: ['Отель', 'Порт', 'Винодельня'] },
  lviv: { title: 'Львов', subtitle: 'Туризм, кофе, сервис и стабильный рост.', jobs: ['Кофейня', 'Отель', 'Курьер'] },
  mykolaiv: { title: 'Николаев', subtitle: 'Верфи, портовая экономика и агро-логистика.', jobs: ['Верфь', 'Порт', 'Склад'] },
  odesa: { title: 'Одесса', subtitle: 'Порт, торговля, туризм, такси и быстрый оборот денег.', jobs: ['Порт', 'Такси', 'Торговля'] },
  poltava: { title: 'Полтава', subtitle: 'Нефть, агро-переработка и затишный сервис.', jobs: ['Нефтобаза', 'Мельница', 'Кафе'] },
  rivne: { title: 'Ровно', subtitle: 'Текстиль, лесопереработка и сервисный старт.', jobs: ['Текстиль', 'Лесопилка', 'Сервис'] },
  sumy: { title: 'Сумы', subtitle: 'Химпром, машиностроение и агро-бизнес.', jobs: ['Завод', 'СТО', 'Агро'] },
  ternopil: { title: 'Тернополь', subtitle: 'Студенческий город с сервисом и агро-рынком.', jobs: ['IT-аутсорс', 'Агро', 'Сервис'] },
  kharkiv: { title: 'Харьков', subtitle: 'IT, машины, образование и производственные кластеры.', jobs: ['Завод', 'Университет', 'IT'] },
  kherson: { title: 'Херсон', subtitle: 'Судостроение, агро-экспорт и морские ворота.', jobs: ['Верфь', 'Порт', 'Агро'] },
  khmelnytskyi: { title: 'Хмельницкий', subtitle: 'Оптовые рынки, агро и городская торговля.', jobs: ['Рынок', 'Агро', 'Сервис'] },
  cherkasy: { title: 'Черкассы', subtitle: 'Сахар, деревообработка и логистика по Днепру.', jobs: ['Сахар', 'Логистика', 'СТО'] },
  chernihiv: { title: 'Чернигов', subtitle: 'Пиво, сельское хозяйство и сервисные инициативы.', jobs: ['Пивзавод', 'Агро', 'Сервис'] },
  chernivtsi: { title: 'Черновцы', subtitle: 'Туризм, крафтовые кофейни и творческие сервисы.', jobs: ['Кофейня', 'Отель', 'Сувениры'] },
  default: { title: 'Регион Украины', subtitle: 'Стартовая зона для развития персонажа.', jobs: ['Подработка', 'Доставка', 'Склад'] }
};

function normalizeCityId(cityId) {
  return CITY_ID_ALIASES[cityId] || cityId;
}

function versionedAsset(src) {
  if (!src) {
    return rootAsset(FALLBACK_MAP_SRC);
  }

  return rootAsset(src);
}  



function cityMapCandidates(cityId) {
  const normalizedCityId = normalizeCityId(cityId);
  const fallbackList = CITY_MAP_FALLBACKS[normalizedCityId];

  if (fallbackList && fallbackList.length) {
    return fallbackList;
  }

  return [
    CITY_MAPS[normalizedCityId] || FALLBACK_MAP_SRC,
    FALLBACK_MAP_SRC
  ];
}

function cityMapSrc(cityId) {
  const candidates = cityMapCandidates(cityId);
  return versionedAsset(candidates[0]);
}

function setFallbackImage(img, cityId) {
  const candidates = cityMapCandidates(cityId);
  const nextIndex = Number(img.dataset.fallbackIndex || '0') + 1;

  if (nextIndex < candidates.length) {
    img.dataset.fallbackIndex = String(nextIndex);
    img.src = versionedAsset(candidates[nextIndex]);
    return;
  }

  img.onerror = null;
  img.src = versionedAsset(FALLBACK_MAP_SRC);
}

function fitPreviewThumb(img) {
  const box = img.closest('.city-preview-image');

  if (!box || !img.naturalWidth || !img.naturalHeight) {
    return;
  }

  const ratio = img.naturalWidth / img.naturalHeight;

  box.style.setProperty('--city-preview-ratio', ratio.toFixed(3));
  box.classList.toggle('is-square-map', ratio < 1.18);
}

function getCityMeta(regionInfo) {
  if (!regionInfo) {
    return CITY_META.default;
  }

  const cityId = normalizeCityId(regionInfo.cityId);
  const staticMeta = CITY_META[cityId] || CITY_META.default;
  const base = citiesBase[cityId] || {};
  const runtime = (getState().citiesRuntime || {})[cityId] || {};
  const raw = Object.assign({}, base, runtime);

  return Object.assign({}, staticMeta, {
    title: base.name || staticMeta.title || regionInfo.cityName,
    image: cityMapSrc(cityId),
    property: 0,
    cars: 0,
    houses: 0,
    inflation: getInflation(raw) + ' %',
    devaluation: getDevaluation(raw) + ' %',
    stateAssets: getStateAssetsShare(raw) + ' %',
    jobs: staticMeta.jobs || CITY_META.default.jobs,
    economy: 'Рассчитывается в игре.'
  });
}

function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = resolve;
    img.onerror = reject;
    img.src = src;
  });
}

async function fetchFirstSvg() {
  const errors = [];

  for (const svgSrc of REGIONS_SVG_CANDIDATES) {
    const url = svgSrc;

    try {
      const response = await fetch(url, {
        cache: 'no-store',
      });

      if (!response.ok) {
        errors.push(`${url}: ${response.status}`);
        continue;
      }

      const text = await response.text();

      if (!text || !text.includes('<svg')) {
        errors.push(`${url}: invalid svg body`);
        continue;
      }

      console.log('[welcome3] SVG loaded:', url);
      return text;
    } catch (error) {
      errors.push(`${url}: ${error?.message || error}`);
    }
  }

  throw new Error(`Не удалось загрузить SVG карту. Проверенные пути: ${errors.join(' | ')}`);
}



register('welcome3', (root) => {
  root.className = 'page welcome-page welcome3';

  root.innerHTML = `
    <div class="welcome-bg"></div>

    <div class="welcome3-loader" id="welcome3Loader">
      <div class="loader-logo">MN</div>
      <div class="loader-title">Загрузка карты</div>
            <div class="loader-text">Подготавливаем области Украины...</div>
      <div class="loader-bar"><span></span></div>
    </div>

    <section class="welcome-card welcome3-card">
      <div class="welcome-logo">MN</div>

      <div class="welcome-header">
        <p class="welcome-step">Шаг 3 / 3</p>
        <h2 class="welcome-title">Выбери город</h2>
        <p class="welcome-subtitle">
          Открой карту, найди область и изучи экономику региона.
        </p>
      </div>

      <div class="compact-map-card">
        <div class="compact-map">
          <img class="compact-map-image" src="${MAP_IMG}" alt="Карта Украины" />
          <div class="compact-regions-layer" id="compactRegionsLayer">
            <div class="map-loading">Загрузка...</div>
          </div>
        </div>
      </div>

      <div class="city-selection-box">
        <span id="citySelectionText">Город пока не выбран</span>
      </div>

      <div class="welcome-actions">
        <button class="welcome-btn secondary open-map-btn" id="openMapBtn" type="button">
          Открыть карту
        </button>

        <button class="welcome-btn primary next-btn" id="nextBtn" type="button" disabled>
          Далее
        </button>
      </div>
    </section>

    <div class="map-modal hidden" id="mapModal">
      <div class="map-modal-panel">
        <div class="map-modal-header">
          <div>
            <h3>Выбор стартового города</h3>
            <p>Двигай карту одним пальцем, приближай двумя. Тап по области открывает экономику города.</p>
          </div>

          <button class="close-map-btn" id="closeMapBtn" type="button" aria-label="Закрыть карту">
            ×
          </button>
        </div>

        <div class="full-map-viewport" id="fullMapViewport">
          <div class="full-map-content" id="fullMapContent">
            <img class="full-map-image" src="${MAP_IMG}" alt="Карта Украины" />
            <div class="full-regions-layer" id="fullRegionsLayer">
              <div class="map-loading">Загрузка областей...</div>
            </div>
          </div>
        </div>

        <div class="city-preview-card" id="cityPreviewCard">
          <div class="city-preview-empty">
            Выбери область на карте, чтобы увидеть экономику города
          </div>
        </div>

        <button class="welcome-btn primary confirm-city-btn" id="confirmCityBtn" type="button" disabled>
          Подтвердить выбор
        </button>
      </div>
    </div>
  `;

  const loader = root.querySelector('#welcome3Loader');
  const compactRegionsLayer = root.querySelector('#compactRegionsLayer');
  const fullRegionsLayer = root.querySelector('#fullRegionsLayer');
  const citySelectionText = root.querySelector('#citySelectionText');
  const cityPreviewCard = root.querySelector('#cityPreviewCard');
  const nextBtn = root.querySelector('#nextBtn');
  const openMapBtn = root.querySelector('#openMapBtn');
  const mapModal = root.querySelector('#mapModal');
  const closeMapBtn = root.querySelector('#closeMapBtn');
  const confirmCityBtn = root.querySelector('#confirmCityBtn');
  const fullMapViewport = root.querySelector('#fullMapViewport');
  const fullMapContent = root.querySelector('#fullMapContent');
  const compactMap = root.querySelector('.compact-map');

  let svgTextCache = '';
  let selectedRegion = null;
  let pendingRegion = null;
  let compactRegionElements = [];
  let fullRegionElements = [];
  let visualFrame = null;
  let transformFrame = null;
  let lastVisualRegionId = null;
  let lastVisualMode = '';

  const isTouchDevice =
    window.matchMedia('(pointer: coarse)').matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const view = {
    x: 0,
    y: 0,
    scale: 1.55
  };

  const pointers = new Map();
  const gesture = {
    mode: 'none',
    moved: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
    startDistance: 0,
    baseScale: 1
  };

  function makeRegionInfo(regionId) {
    const regionData = REGION_DATA[regionId];

    if (!regionData) {
      return null;
    }

    return {
      regionId,
      cityId: regionData.cityId,
      cityName: regionData.cityName
    };
  }

  function getAllRegions() {
    return [
      ...compactRegionElements,
      ...fullRegionElements
    ];
  }

  function setMainText(text) {
    citySelectionText.textContent = text;
  }

  function renderCityPreview(regionInfo) {
    cityPreviewCard.classList.remove('is-refreshed');

    if (!regionInfo) {
      cityPreviewCard.innerHTML = `
        <div class="city-preview-empty">
          Выбери область на карте, чтобы увидеть экономику города
        </div>
      `;
      return;
    }

    const cityId = normalizeCityId(regionInfo.cityId);
    const meta = getCityMeta(regionInfo);
    const imageSrc = meta.image || cityMapSrc(cityId);

    cityPreviewCard.innerHTML = `
      <div class="city-preview-top">
        <div class="city-preview-image">
          <img class="city-preview-thumb-img" src="${imageSrc}" alt="${meta.title}" />
        </div>

        <div class="city-preview-main">
          <h4>${meta.title}</h4>
          <p>${meta.subtitle}</p>
        </div>
      </div>

      <div class="city-preview-map">
        <img class="city-preview-map-img" src="${imageSrc}" alt="Карта города ${meta.title}" />
      </div>

      <div class="city-preview-grid">
        <div class="city-preview-stat">
          <span>Имущество</span>
          <strong>${meta.property}</strong>
        </div>

        <div class="city-preview-stat">
          <span>Машины</span>
          <strong>${meta.cars}</strong>
        </div>

        <div class="city-preview-stat">
          <span>Дома</span>
          <strong>${meta.houses}</strong>
        </div>

        <div class="city-preview-stat">
          <span>Инфляция</span>
          <strong>${meta.inflation}</strong>
        </div>
      </div>

      <div class="city-preview-jobs">
        <span>Работы региона</span>
        <div>
          ${meta.jobs.map((job) => `<b>${job}</b>`).join('')}
        </div>
      </div>

      <div class="city-preview-economy">
        <span>Экономика</span>
        <p>${meta.economy}</p>
      </div>

      <div class="city-preview-warning">
        Девальвация: ${meta.devaluation}
      </div>
    `;

    const thumbImg = cityPreviewCard.querySelector('.city-preview-thumb-img');
    const mapImg = cityPreviewCard.querySelector('.city-preview-map-img');

    if (thumbImg) {
      thumbImg.dataset.fallbackIndex = '0';
      thumbImg.addEventListener('load', () => fitPreviewThumb(thumbImg), { once: true });
      thumbImg.addEventListener('error', () => setFallbackImage(thumbImg, cityId));

      if (thumbImg.complete && thumbImg.naturalWidth) {
        fitPreviewThumb(thumbImg);
      }
    }

    if (mapImg) {
      mapImg.dataset.fallbackIndex = '0';
      mapImg.addEventListener('error', () => setFallbackImage(mapImg, cityId));
    }

    requestAnimationFrame(() => {
      cityPreviewCard.classList.add('is-refreshed');
    });
  }

  async function preloadAssets() {
    const loadedSvgText = await fetchFirstSvg();
    svgTextCache = loadedSvgText;

    preloadImage(MAP_IMG).catch((error) => {
      console.warn('UkraineMap.png не загрузился, SVG карта всё равно будет работать', error);
    });
  }

  function animateRegionChoice(regionInfo) {
    if (!regionInfo || isTouchDevice) {
      return;
    }

    getAllRegions().forEach((regionEl) => {
      if (regionEl.id !== regionInfo.regionId) {
        return;
      }

      regionEl.classList.remove('is-click-burst');

      requestAnimationFrame(() => {
        regionEl.classList.add('is-click-burst');
      });

      window.setTimeout(() => {
        regionEl.classList.remove('is-click-burst');
      }, 460);
    });
  }

  function updateVisualState() {
    if (visualFrame) {
      cancelAnimationFrame(visualFrame);
    }

    visualFrame = requestAnimationFrame(() => {
      const allRegions = getAllRegions();
      const activeRegion = pendingRegion || selectedRegion;
      const nextVisualRegionId = activeRegion ? activeRegion.regionId : null;
      const nextVisualMode = pendingRegion ? 'pending' : selectedRegion ? 'selected' : '';

      if (nextVisualRegionId !== lastVisualRegionId || nextVisualMode !== lastVisualMode) {
        allRegions.forEach((regionEl) => {
          const isActive = regionEl.id === nextVisualRegionId;

          regionEl.classList.toggle('is-pending', isActive && nextVisualMode === 'pending');
          regionEl.classList.toggle('is-selected', isActive && nextVisualMode === 'selected');
        });

        lastVisualRegionId = nextVisualRegionId;
        lastVisualMode = nextVisualMode;
      }

      if (selectedRegion) {
        nextBtn.disabled = false;
        nextBtn.classList.add('active');
        setMainText('Выбран город: ' + selectedRegion.cityName);
      } else {
        nextBtn.disabled = true;
        nextBtn.classList.remove('active');
                setMainText('Город пока не выбран');
      }

      if (pendingRegion) {
        confirmCityBtn.disabled = false;
        confirmCityBtn.classList.add('active');
      } else {
        confirmCityBtn.disabled = true;
        confirmCityBtn.classList.remove('active');
      }
    });
  }

  function pickRegion(regionId, options = {}) {
    const regionInfo = makeRegionInfo(regionId);

    if (!regionInfo) {
      return;
    }

    pendingRegion = regionInfo;
    renderCityPreview(pendingRegion);
    updateVisualState();

    if (options.animate) {
      animateRegionChoice(regionInfo);
    }
  }

  function confirmCity() {
    if (!pendingRegion) {
      return;
    }

    selectedRegion = pendingRegion;

    state.cityId = normalizeCityId(selectedRegion.cityId);
    state.cityName = selectedRegion.cityName;
    state.regionId = selectedRegion.regionId;
    save();

    mapModal.classList.add('hidden');
    updateVisualState();
  }

function createSvgLayer(target, mode) {
  if (!svgTextCache) {
    target.innerHTML = `<div class="map-error">Ошибка загрузки SVG</div>`;
    return [];
  }

  target.innerHTML = '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgTextCache, 'image/svg+xml');

  const svg = doc.querySelector('svg');

  if (!svg) {
    target.innerHTML = `<div class="map-error">Ошибка чтения SVG</div>`;
    return [];
  }

  svg.setAttribute(
    'viewBox',
    svg.getAttribute('viewBox') || REGIONS_VIEW_BOX
  );

  svg.removeAttribute('width');
  svg.removeAttribute('height');

  svg.classList.add(
    'regions-svg',
    mode === 'compact' ? 'compact-svg' : 'full-svg'
  );

  const validRegions = [];

  Object.keys(REGION_DATA).forEach((regionId) => {
    const regionEl = svg.querySelector(`#${regionId}`);

    if (!regionEl) {
      return;
    }

    const tag = regionEl.tagName.toLowerCase();

    if (
      tag !== 'path' &&
      tag !== 'polygon' &&
      tag !== 'polyline'
    ) {
      return;
    }

    if (tag === 'path') {
      const d = regionEl.getAttribute('d') || '';

      const normalized = d.trim();

      const isBroken =
        !normalized ||
        normalized.length < 8 ||
        !/^[Mm]/.test(normalized) ||
        !/\d/.test(normalized);

      if (isBroken) {
        console.warn('[welcome3] broken path skipped:', regionId);
        return;
      }
    }

    validRegions.push(regionEl);
  });

  validRegions.forEach((regionEl) => {
    const info = makeRegionInfo(regionEl.id);

    if (!info) {
      return;
    }

    regionEl.classList.add('map-region');

    regionEl.setAttribute('role', 'button');
    regionEl.setAttribute('tabindex', '0');
    regionEl.setAttribute('aria-label', info.cityName);

    regionEl.dataset.cityId = info.cityId;
    regionEl.dataset.cityName = info.cityName;

    regionEl.addEventListener('click', (event) => {
      event.stopPropagation();
      pickRegion(regionEl.id, { animate: true });
    });

    regionEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        pickRegion(regionEl.id, { animate: true });
      }
    });
  });

  target.appendChild(svg);

  return validRegions;
}
  function renderLayers() {
    compactRegionElements = createSvgLayer(compactRegionsLayer, 'compact');
    fullRegionElements = createSvgLayer(fullRegionsLayer, 'full');
    updateVisualState();
  }

  function scheduleTransform() {
    if (transformFrame) {
      cancelAnimationFrame(transformFrame);
    }

    transformFrame = requestAnimationFrame(() => {
      fullMapContent.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
    });
  }

  function clampView() {
    const viewportRect = fullMapViewport.getBoundingClientRect();
    const contentWidth = viewportRect.width;
    const contentHeight = viewportRect.width * 0.669;

    const scaledWidth = contentWidth * view.scale;
    const scaledHeight = contentHeight * view.scale;

    const minX = Math.min(0, viewportRect.width - scaledWidth);
    const minY = Math.min(0, viewportRect.height - scaledHeight);

    view.x = Math.max(minX - 80, Math.min(80, view.x));
    view.y = Math.max(minY - 80, Math.min(80, view.y));
  }

  function setScaleAroundPoint(nextScale, clientX, clientY) {
    const viewportRect = fullMapViewport.getBoundingClientRect();
    const px = clientX - viewportRect.left;
    const py = clientY - viewportRect.top;

    const oldScale = view.scale;
    const clampedScale = Math.max(1, Math.min(MAX_ZOOM, nextScale));

    const mapX = (px - view.x) / oldScale;
    const mapY = (py - view.y) / oldScale;

    view.scale = clampedScale;
    view.x = px - mapX * clampedScale;
    view.y = py - mapY * clampedScale;

    clampView();
    scheduleTransform();
  }

  function resetView() {
    const viewportRect = fullMapViewport.getBoundingClientRect();

    view.scale = isTouchDevice ? 1.42 : 1.55;
    view.x = viewportRect.width * -0.18;
    view.y = viewportRect.height * -0.03;

    clampView();
    scheduleTransform();
  }

  function getDistance(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;

    return Math.sqrt(dx * dx + dy * dy);
  }

  function onPointerDown(event) {
    if (!event.isPrimary && event.pointerType !== 'touch') {
      return;
    }

    fullMapViewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, event);

    if (pointers.size === 1) {
      gesture.mode = 'pan';
      gesture.moved = false;
      gesture.startX = event.clientX;
      gesture.startY = event.clientY;
      gesture.baseX = view.x;
      gesture.baseY = view.y;
    }

    if (pointers.size === 2) {
      const activePointers = Array.from(pointers.values());

      gesture.mode = 'pinch';
      gesture.moved = true;
      gesture.startDistance = getDistance(activePointers[0], activePointers[1]);
      gesture.baseScale = view.scale;
      gesture.baseX = view.x;
      gesture.baseY = view.y;
    }
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) {
      return;
    }

    pointers.set(event.pointerId, event);

    if (gesture.mode === 'pan' && pointers.size === 1) {
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        gesture.moved = true;
      }

      view.x = gesture.baseX + dx;
      view.y = gesture.baseY + dy;

      clampView();
      scheduleTransform();
      return;
    }

    if (gesture.mode === 'pinch' && pointers.size >= 2) {
      const activePointers = Array.from(pointers.values());
      const distance = getDistance(activePointers[0], activePointers[1]);
      const centerX = (activePointers[0].clientX + activePointers[1].clientX) / 2;
      const centerY = (activePointers[0].clientY + activePointers[1].clientY) / 2;

      if (gesture.startDistance > 0) {
                const nextScale = gesture.baseScale * (distance / gesture.startDistance);
        setScaleAroundPoint(nextScale, centerX, centerY);
      }
    }
  }

  function onPointerUp(event) {
    pointers.delete(event.pointerId);

    if (pointers.size === 0) {
      gesture.mode = 'none';
    }

    if (pointers.size === 1) {
      const remainingPointer = Array.from(pointers.values())[0];

      gesture.mode = 'pan';
      gesture.startX = remainingPointer.clientX;
      gesture.startY = remainingPointer.clientY;
      gesture.baseX = view.x;
      gesture.baseY = view.y;
    }
  }

  function bindMapControls() {
    fullMapViewport.addEventListener('pointerdown', onPointerDown);
    fullMapViewport.addEventListener('pointermove', onPointerMove);
    fullMapViewport.addEventListener('pointerup', onPointerUp);
    fullMapViewport.addEventListener('pointercancel', onPointerUp);
    fullMapViewport.addEventListener('lostpointercapture', onPointerUp);

    fullMapViewport.addEventListener('wheel', (event) => {
      event.preventDefault();

      const direction = event.deltaY > 0 ? -1 : 1;
      const factor = direction > 0 ? 1.12 : 0.88;

      setScaleAroundPoint(view.scale * factor, event.clientX, event.clientY);
    }, { passive: false });
  }

  openMapBtn.addEventListener('click', () => {
    mapModal.classList.remove('hidden');

    pendingRegion = selectedRegion;
    renderCityPreview(pendingRegion);
    updateVisualState();

    requestAnimationFrame(() => {
      resetView();
    });
  });

  closeMapBtn.addEventListener('click', () => {
    mapModal.classList.add('hidden');
  });

  mapModal.addEventListener('click', (event) => {
    if (event.target === mapModal) {
      mapModal.classList.add('hidden');
    }
  });

  confirmCityBtn.addEventListener('click', confirmCity);

  nextBtn.addEventListener('click', () => {
    if (!selectedRegion) {
      return;
    }

    show('home');
  });

  compactMap.addEventListener('click', () => {
    openMapBtn.click();
  });

  bindMapControls();

  const savedRegionId = getState().regionId;
  const savedCityId = getState().cityId;

  if (savedRegionId && REGION_DATA[savedRegionId]) {
    selectedRegion = makeRegionInfo(savedRegionId);
    pendingRegion = selectedRegion;
  } else if (savedCityId) {
    const matchedRegionId = Object.keys(REGION_DATA).find((regionId) => {
      return normalizeCityId(REGION_DATA[regionId].cityId) === normalizeCityId(savedCityId);
    });

    if (matchedRegionId) {
      selectedRegion = makeRegionInfo(matchedRegionId);
      pendingRegion = selectedRegion;
    }
  }

 function hideLoader() {
  if (!loader) {
    return;
  }

  loader.classList.add('hidden');
  loader.style.opacity = '0';
  loader.style.pointerEvents = 'none';
  loader.style.visibility = 'hidden';

  window.setTimeout(() => {
    loader.style.display = 'none';
  }, 350);
}

function hideLoader() {
  if (!loader) {
    return;
  }

  loader.classList.add('is-hidden');
  loader.style.opacity = '0';
  loader.style.pointerEvents = 'none';
  loader.style.visibility = 'hidden';

  window.setTimeout(() => {
    loader.style.display = 'none';
  }, 350);
}
