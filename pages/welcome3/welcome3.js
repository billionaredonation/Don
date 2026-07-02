import { register, show } from '../../src/router.js';
import { state, save, getState, createAndSavePlayer } from '../../src/state.js';
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

  const base = String(import.meta.env.BASE_URL || './');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;

  return `${normalizedBase}${encodeURI(cleanSrc)}`;
}

const FALLBACK_MAP_SRC = 'UkraineMap.png';
const MAP_IMG = rootAsset(FALLBACK_MAP_SRC);

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

const SVG_TEXT_CACHE = new Map();
let regionsSvgPromise = null;

function preloadImage(src, options = {}) {
  if (!src) {
    return Promise.resolve(null);
  }

  const cacheKey = String(src);
  const cached = IMAGE_PRELOAD_CACHE.get(cacheKey);

  if (cached) {
    return cached;
  }

  const promise = new Promise((resolve, reject) => {
    const img = new Image();

    img.decoding = 'async';
    img.loading = options.loading || 'eager';

    if ('fetchPriority' in img) {
      img.fetchPriority = options.fetchPriority || 'low';
    }

    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  IMAGE_PRELOAD_CACHE.set(cacheKey, promise);

  return promise;
}

const IMAGE_PRELOAD_CACHE = new Map();
const SVG_PARSER = new DOMParser();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case "'": return '&#39;';
      case '"': return '&quot;';
      default: return char;
    }
  });
}

function getCityInitials(title) {
  return String(title || 'MN')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] || '')
    .join('')
    .toUpperCase() || 'MN';
}

function setImageAttributes(img, options = {}) {
  if (!img) {
    return;
  }

  img.decoding = 'async';
  img.loading = options.loading || 'lazy';

  if ('fetchPriority' in img) {
    img.fetchPriority = options.fetchPriority || 'low';
  }
}

function setOptimizedFallbackImage(img, cityId) {
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

function setCityPreviewImage(img, cityId, options = {}) {
  if (!img) {
    return;
  }

  const candidates = cityMapCandidates(cityId);
  const src = versionedAsset(candidates[0]);

  setImageAttributes(img, options);

  if (img.dataset.currentSrc === src && img.src) {
    return;
  }

  img.dataset.currentSrc = src;
  img.dataset.fallbackIndex = '0';

  img.onload = () => {
    img.closest('.city-preview-map')?.classList.remove('is-loading');
    img.closest('.city-preview-map')?.classList.add('is-loaded');
  };

  img.onerror = () => setOptimizedFallbackImage(img, cityId);
  img.src = src;
}

async function fetchFirstSvg() {
  if (regionsSvgPromise) {
    return regionsSvgPromise;
  }

  regionsSvgPromise = (async () => {
    const errors = [];

    for (const svgSrc of REGIONS_SVG_CANDIDATES) {
      const url = svgSrc;
      const cachedSvg = SVG_TEXT_CACHE.get(url);

      if (cachedSvg) {
        return cachedSvg;
      }

      try {
        const response = await fetch(url, {
          cache: 'force-cache'
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

        SVG_TEXT_CACHE.set(url, text);
        return text;
      } catch (error) {
        errors.push(`${url}: ${error?.message || error}`);
      }
    }

    throw new Error(`Не удалось загрузить SVG карту. Проверенные пути: ${errors.join(' | ')}`);
  })();

  return regionsSvgPromise;
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
          <img
            class="compact-map-image"
            src="${MAP_IMG}"
            alt="Карта Украины"
            decoding="async"
            fetchpriority="high"
            loading="eager"
          />
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
            <img
              class="full-map-image"
              data-src="${MAP_IMG}"
              alt="Карта Украины"
              decoding="async"
              fetchpriority="low"
              loading="lazy"
            />
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
  const fullMapImage = root.querySelector('.full-map-image');

  let svgTextCache = '';
  let svgTemplate = null;
  let selectedRegion = null;
  let pendingRegion = null;
  let compactRegionElements = [];
  let fullRegionElements = [];
  let fullLayerReady = false;
  let visualFrame = null;
  let transformFrame = null;
  let lastTransformValue = '';
  let lastVisualRegionId = null;
  let lastVisualMode = '';
  let cachedViewportRect = null;

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
    const safeTitle = escapeHtml(meta.title);
    const safeSubtitle = escapeHtml(meta.subtitle);
    const safeEconomy = escapeHtml(meta.economy);
    const initials = escapeHtml(getCityInitials(meta.title));

    cityPreviewCard.innerHTML = `
      <div class="city-preview-top">
        <div class="city-preview-image city-preview-badge" aria-hidden="true">
          <span>${initials}</span>
        </div>

        <div class="city-preview-main">
          <h4>${safeTitle}</h4>
          <p>${safeSubtitle}</p>
        </div>
      </div>

      <div class="city-preview-map is-loading">
        <img class="city-preview-map-img" alt="Карта города ${safeTitle}" />
      </div>

      <div class="city-preview-grid">
        <div class="city-preview-stat">
          <span>Имущество</span>
          <strong>${escapeHtml(meta.property)}</strong>
        </div>

        <div class="city-preview-stat">
          <span>Машины</span>
          <strong>${escapeHtml(meta.cars)}</strong>
        </div>

        <div class="city-preview-stat">
          <span>Дома</span>
          <strong>${escapeHtml(meta.houses)}</strong>
        </div>

        <div class="city-preview-stat">
          <span>Инфляция</span>
          <strong>${escapeHtml(meta.inflation)}</strong>
        </div>
      </div>

      <div class="city-preview-jobs">
        <span>Работы региона</span>
        <div>
          ${meta.jobs.map((job) => `<b>${escapeHtml(job)}</b>`).join('')}
        </div>
      </div>

      <div class="city-preview-economy">
        <span>Экономика</span>
        <p>${safeEconomy}</p>
      </div>

      <div class="city-preview-warning">
        Девальвация: ${escapeHtml(meta.devaluation)}
      </div>
    `;

    const mapImg = cityPreviewCard.querySelector('.city-preview-map-img');

    // Картинка города грузится только после выбора области и только один раз.
    // Раньше здесь было два <img> с одной и той же тяжёлой картой.
    setCityPreviewImage(mapImg, cityId, {
      loading: 'eager',
      fetchPriority: 'high'
    });

    requestAnimationFrame(() => {
      cityPreviewCard.classList.add('is-refreshed');
    });
  }

  async function preloadAssets() {
    svgTextCache = await fetchFirstSvg();
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

    selectedRegion = {
      regionId: pendingRegion.regionId,
      cityId: normalizeCityId(pendingRegion.cityId),
      cityName: pendingRegion.cityName
    };

    const finalCityId = normalizeCityId(selectedRegion.cityId);

    state.city = finalCityId;
    state.cityId = finalCityId;
    state.cityName = selectedRegion.cityName;
    state.regionId = selectedRegion.regionId;

    if (!state.player) {
      state.player = {};
    }

    state.player.city = finalCityId;
    state.player.cityId = finalCityId;
    state.player.cityName = selectedRegion.cityName;
    state.player.regionId = selectedRegion.regionId;

    save();

    mapModal.classList.add('hidden');
    updateVisualState();
  }

  function prepareSvgTemplate() {
    if (svgTemplate) {
      return svgTemplate;
    }

    if (!svgTextCache) {
      return null;
    }

    const doc = SVG_PARSER.parseFromString(svgTextCache, 'image/svg+xml');
    const svg = doc.querySelector('svg');

    if (!svg) {
      return null;
    }

    svg.setAttribute('viewBox', svg.getAttribute('viewBox') || REGIONS_VIEW_BOX);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.removeAttribute('style');

    Object.keys(REGION_DATA).forEach((regionId) => {
      const regionEl =
        svg.querySelector(`#${CSS.escape(regionId)}`) ||
        svg.querySelector(`[id="${regionId}"]`) ||
        svg.querySelector(`[data-id="${regionId}"]`) ||
        svg.querySelector(`[data-region="${regionId}"]`);

      if (!regionEl) {
        console.warn('[welcome3] region not found in svg:', regionId);
        return;
      }

      const clickableEl =
        regionEl.matches('path, polygon, polyline')
          ? regionEl
          : regionEl.querySelector('path, polygon, polyline');

      if (!clickableEl) {
        console.warn('[welcome3] region has no clickable shape:', regionId);
        return;
      }

      const info = makeRegionInfo(regionId);

      clickableEl.id = regionId;
      clickableEl.dataset.regionId = regionId;
      clickableEl.dataset.cityId = info.cityId;
      clickableEl.dataset.cityName = info.cityName;
      clickableEl.classList.add('map-region');
      clickableEl.setAttribute('role', 'button');
      clickableEl.setAttribute('tabindex', '0');
      clickableEl.setAttribute('aria-label', info.cityName);
    });

    svgTemplate = svg;

    return svgTemplate;
  }

  function createSvgLayer(target, mode) {
    const template = prepareSvgTemplate();

    if (!template) {
      target.innerHTML = `<div class="map-error">Ошибка чтения SVG</div>`;
      return [];
    }

    target.textContent = '';

    const svg = template.cloneNode(true);

    svg.classList.add(
      'regions-svg',
      mode === 'compact' ? 'compact-svg' : 'full-svg'
    );

    const validRegions = Array.from(svg.querySelectorAll('.map-region'));

    target.appendChild(svg);

    return validRegions;
  }

  function renderCompactLayer() {
    compactRegionElements = createSvgLayer(compactRegionsLayer, 'compact');
    updateVisualState();
  }

  function ensureFullLayer() {
    if (fullLayerReady) {
      return;
    }

    if (fullMapImage && !fullMapImage.src) {
      setImageAttributes(fullMapImage, {
        loading: 'eager',
        fetchPriority: 'high'
      });
      fullMapImage.src = fullMapImage.dataset.src || MAP_IMG;
    }

    fullRegionElements = createSvgLayer(fullRegionsLayer, 'full');
    fullLayerReady = true;
    updateVisualState();
  }

  function resolveRegionFromEvent(event) {
    const target = event.target?.closest?.('.map-region');

    if (!target) {
      return null;
    }

    return target.dataset.regionId || target.id || null;
  }

  function bindRegionLayer(layer) {
    layer.addEventListener('pointerdown', (event) => {
      if (resolveRegionFromEvent(event)) {
        event.stopPropagation();
      }
    });

    layer.addEventListener('click', (event) => {
      const regionId = resolveRegionFromEvent(event);

      if (!regionId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      pickRegion(regionId, { animate: true });
    });

    layer.addEventListener('keydown', (event) => {
      const regionId = resolveRegionFromEvent(event);

      if (!regionId || (event.key !== 'Enter' && event.key !== ' ')) {
        return;
      }

      event.preventDefault();
      pickRegion(regionId, { animate: true });
    });
  }

  function invalidateViewportRect() {
    cachedViewportRect = null;
  }

  function getViewportRect() {
    if (!cachedViewportRect) {
      cachedViewportRect = fullMapViewport.getBoundingClientRect();
    }

    return cachedViewportRect;
  }

  function scheduleTransform() {
    if (transformFrame) {
      cancelAnimationFrame(transformFrame);
    }

    transformFrame = requestAnimationFrame(() => {
      const safeX = Math.round(view.x * 100) / 100;
      const safeY = Math.round(view.y * 100) / 100;
      const safeScale = Math.round(view.scale * 1000) / 1000;
      const nextTransform = `translate3d(${safeX}px, ${safeY}px, 0) scale(${safeScale})`;

      if (nextTransform !== lastTransformValue) {
        fullMapContent.style.transform = nextTransform;
        lastTransformValue = nextTransform;
      }
    });
  }

  function clampView() {
    const viewportRect = getViewportRect();
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
    const viewportRect = getViewportRect();
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
    invalidateViewportRect();

    const viewportRect = getViewportRect();

    view.scale = isTouchDevice ? 1.42 : 1.55;
    view.x = viewportRect.width * -0.18;
    view.y = viewportRect.height * -0.03;

    clampView();
    lastTransformValue = '';
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

    invalidateViewportRect();
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
      invalidateViewportRect();
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
    fullMapViewport.addEventListener('pointerdown', onPointerDown, { passive: true });
    fullMapViewport.addEventListener('pointermove', onPointerMove, { passive: true });
    fullMapViewport.addEventListener('pointerup', onPointerUp, { passive: true });
    fullMapViewport.addEventListener('pointercancel', onPointerUp, { passive: true });
    fullMapViewport.addEventListener('lostpointercapture', onPointerUp, { passive: true });

    fullMapViewport.addEventListener('wheel', (event) => {
      event.preventDefault();

      const direction = event.deltaY > 0 ? -1 : 1;
      const factor = direction > 0 ? 1.12 : 0.88;

      invalidateViewportRect();
      setScaleAroundPoint(view.scale * factor, event.clientX, event.clientY);
    }, { passive: false });
  }

  openMapBtn.addEventListener('click', () => {
    mapModal.classList.remove('hidden');

    pendingRegion = selectedRegion;
    renderCityPreview(pendingRegion);
    ensureFullLayer();
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

  nextBtn.addEventListener('click', async () => {
    if (!selectedRegion) {
      return;
    }

    const nickname =
      state.nickname ||
      state.player?.nickname ||
      '';

    if (!nickname) {
      show('welcome2');
      return;
    }

    const finalCityId = normalizeCityId(selectedRegion.cityId);

    nextBtn.disabled = true;
    nextBtn.classList.remove('active');
    nextBtn.textContent = 'Сохраняем...';

    try {
      await createAndSavePlayer({
        nickname,
        city: finalCityId,
        cityId: finalCityId,
        cityName: selectedRegion.cityName,
        regionId: selectedRegion.regionId,
      });

      show('preload', {
        next: 'home',
        mode: 'first-start',
      });
    } catch (error) {
      console.warn('[welcome3] create player failed:', error);

      nextBtn.disabled = false;
      nextBtn.classList.add('active');
      nextBtn.textContent = 'Далее';

      alert('Не удалось сохранить игрока. Проверь интернет и попробуй ещё раз.');
    }
  });

  compactMap.addEventListener('click', () => {
    openMapBtn.click();
  });

  bindRegionLayer(compactRegionsLayer);
  bindRegionLayer(fullRegionsLayer);
  bindMapControls();

  window.addEventListener('resize', invalidateViewportRect, { passive: true });
  window.addEventListener('orientationchange', invalidateViewportRect, { passive: true });

  const savedRegionId = getState().regionId;
  const savedCityId = getState().cityId || getState().city;

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

    loader.classList.add('is-hidden');
    loader.style.opacity = '0';
    loader.style.pointerEvents = 'none';
    loader.style.visibility = 'hidden';

    window.setTimeout(() => {
      loader.style.display = 'none';
    }, 260);
  }

  preloadAssets()
    .then(() => {
      renderCompactLayer();
      updateVisualState();
    })
    .catch((error) => {
      console.error(error);

      compactRegionsLayer.innerHTML = `<div class="map-error">Ошибка загрузки SVG</div>`;
      fullRegionsLayer.innerHTML = `<div class="map-error">Ошибка загрузки карты областей</div>`;
    })
    .finally(() => {
      window.setTimeout(hideLoader, 120);
    });

  window.setTimeout(hideLoader, 1800);

  updateVisualState();
});
