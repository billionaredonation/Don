import { register, show } from '../../src/router.js';
import { state, save, getState } from '../../src/state.js';
import { citiesBase } from '../../src/data/citiesBase.js';
import { getInflation, getDevaluation, getStateAssetsShare } from '../../src/lib/economy.js';

const MAP_IMG = './UkraineMap.png?v=13';
const REGIONS_SVG = './ua.svg?v=9';
const CITY_MAP_VERSION = '34';
const FALLBACK_MAP_SRC = './UkraineMap.png';
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
  zutomyr: 'zhytomyr'
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

function cityMapSrc(cityId) {
  const normalizedCityId = normalizeCityId(cityId);
  return (CITY_MAPS[normalizedCityId] || FALLBACK_MAP_SRC) + '?v=' + CITY_MAP_VERSION;
}

function setFallbackImage(img) {
  img.onerror = null;
  img.src = FALLBACK_MAP_SRC + '?v=' + CITY_MAP_VERSION;
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
    return fullRegionElements;
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

    const meta = getCityMeta(regionInfo);
    const imageSrc = meta.image || cityMapSrc(regionInfo.cityId);

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
      thumbImg.addEventListener('load', () => fitPreviewThumb(thumbImg), { once: true });
      thumbImg.addEventListener('error', () => setFallbackImage(thumbImg), { once: true });

      if (thumbImg.complete && thumbImg.naturalWidth) {
        fitPreviewThumb(thumbImg);
      }
    }

    if (mapImg) {
      mapImg.addEventListener('error', () => setFallbackImage(mapImg), { once: true });
    }

    requestAnimationFrame(() => {
      cityPreviewCard.classList.add('is-refreshed');
    });
  }

  async function preloadAssets() {
    const svgResponse = await fetch(REGIONS_SVG);

    await preloadImage(MAP_IMG);

    if (!svgResponse.ok) {
      throw new Error('SVG load error: ' + svgResponse.status);
    }

    svgTextCache = await svgResponse.text();
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

      confirmCityBtn.disabled = !pendingRegion;
      confirmCityBtn.classList.toggle('active', Boolean(pendingRegion));

      visualFrame = null;
    });
  }

  function previewRegion(regionInfo) {
    if (!regionInfo || isTouchDevice) {
      return;
    }

    renderCityPreview(regionInfo);
  }

  function resetPreview() {
    renderCityPreview(pendingRegion || null);
  }

  function choosePendingRegion(regionInfo) {
    if (!regionInfo) {
      return;
    }

    pendingRegion = regionInfo;
    animateRegionChoice(regionInfo);
    renderCityPreview(regionInfo);
    updateVisualState();
  }

  function confirmRegion() {
    if (!pendingRegion) {
      return;
    }

    selectedRegion = pendingRegion;
    pendingRegion = null;

    state.city = normalizeCityId(selectedRegion.cityId);
    state.cityName = selectedRegion.cityName;
    state.regionId = selectedRegion.regionId;

    save();

    mapModal.classList.add('hidden');
    renderCityPreview(null);
    updateVisualState();
  }

  function applyTransform() {
    if (transformFrame) {
      return;
    }

    transformFrame = requestAnimationFrame(() => {
      fullMapContent.style.transform =
        'translate(calc(-50% + ' + view.x + 'px), calc(-50% + ' + view.y + 'px)) scale(' + view.scale + ')';

      transformFrame = null;
    });
  }

  function resetTransform() {
    view.x = 0;
    view.y = 0;
    view.scale = isTouchDevice ? 1.42 : 1.55;
    applyTransform();
  }

  function clampView() {
    view.scale = Math.max(1, Math.min(MAX_ZOOM, view.scale));

    const maxOffset = 460 * view.scale;

    view.x = Math.max(-maxOffset, Math.min(maxOffset, view.x));
    view.y = Math.max(-maxOffset, Math.min(maxOffset, view.y));
  }

  function distance(a, b) {
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  function startPan(pointer) {
    gesture.mode = 'pan';
    gesture.moved = false;
    gesture.startX = pointer.clientX;
    gesture.startY = pointer.clientY;
    gesture.baseX = view.x;
    gesture.baseY = view.y;
  }

  function startPinch() {
    const pts = Array.from(pointers.values());

    if (pts.length < 2) {
      return;
    }

    gesture.mode = 'pinch';
    gesture.moved = false;
    gesture.startDistance = distance(pts[0], pts[1]);
    gesture.baseScale = view.scale;
    gesture.baseX = view.x;
    gesture.baseY = view.y;
    gesture.startX = (pts[0].clientX + pts[1].clientX) / 2;
    gesture.startY = (pts[0].clientY + pts[1].clientY) / 2;
  }

  function onPointerDown(event) {
    const isMouse = event.pointerType === 'mouse';
    const isTouch = event.pointerType === 'touch' || event.pointerType === 'pen';

    if (isMouse && event.button !== 2) {
      return;
    }

    if (isMouse) {
      event.preventDefault();
    }

    pointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType
    });

    if (fullMapViewport.setPointerCapture) {
      fullMapViewport.setPointerCapture(event.pointerId);
    }

    if (isTouch && pointers.size === 1) {
      startPan(event);
      return;
    }

    if (isTouch && pointers.size === 2) {
      startPinch();
      return;
    }

    if (isMouse) {
      startPan(event);
    }
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) {
      return;
    }

    pointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType
    });

    if (gesture.mode === 'pan' && pointers.size === 1) {
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;

      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        gesture.moved = true;
      }

      view.x = gesture.baseX + dx;
      view.y = gesture.baseY + dy;

      clampView();
      applyTransform();
      return;
    }

    if (gesture.mode === 'pinch' && pointers.size >= 2) {
      const pts = Array.from(pointers.values());
      const currentDistance = distance(pts[0], pts[1]);
      const scaleRatio = currentDistance / gesture.startDistance;
      const midX = (pts[0].clientX + pts[1].clientX) / 2;
      const midY = (pts[0].clientY + pts[1].clientY) / 2;

      view.scale = gesture.baseScale * scaleRatio;
      view.x = gesture.baseX + (midX - gesture.startX);
      view.y = gesture.baseY + (midY - gesture.startY);
      gesture.moved = true;

      clampView();
      applyTransform();
    }
  }

  function onPointerUp(event) {
    pointers.delete(event.pointerId);

    if (fullMapViewport.releasePointerCapture) {
      fullMapViewport.releasePointerCapture(event.pointerId);
    }

    if (pointers.size === 1) {
      const remainingPointer = Array.from(pointers.values())[0];

      startPan({
        clientX: remainingPointer.clientX,
        clientY: remainingPointer.clientY,
        pointerType: remainingPointer.pointerType
      });

      return;
    }

    if (pointers.size === 0) {
      gesture.mode = 'none';
    }
  }

  function onWheel(event) {
    event.preventDefault();

    view.scale += event.deltaY > 0 ? -0.12 : 0.12;

    clampView();
    applyTransform();
  }

  function prepareSvg(svg, mode) {
    svg.classList.add('ukraine-regions-svg', mode);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.removeAttribute('fill');
    svg.removeAttribute('stroke');
    svg.removeAttribute('stroke-width');
    svg.style.fill = 'none';
    svg.style.stroke = 'none';

    const rawViewBox = svg.getAttribute('viewBox') || svg.getAttribute('viewbox') || REGIONS_VIEW_BOX;

    svg.removeAttribute('viewbox');
    svg.setAttribute('viewBox', rawViewBox);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');

    svg.querySelectorAll('*').forEach((el) => {
      el.style.pointerEvents = 'none';
    });

    svg.querySelectorAll('text, circle, rect, line, polyline, ellipse, #points, #label_points').forEach((el) => {
      el.style.display = 'none';
    });

    const regions = Array.from(svg.querySelectorAll('path, polygon'));

    regions.forEach((region) => {
      const isKnownRegion = Boolean(region.id && REGION_DATA[region.id]);

      region.style.display = isKnownRegion ? '' : 'none';
      region.style.pointerEvents = isKnownRegion ? 'all' : 'none';

      if (isKnownRegion) {
        region.removeAttribute('fill');
        region.removeAttribute('stroke');
        region.removeAttribute('stroke-width');
        region.style.fill = '';
        region.style.stroke = '';
      }
    });

    return regions.filter((region) => REGION_DATA[region.id]);
  }

  function setupRegion(path, storage, mode) {
    const regionInfo = makeRegionInfo(path.id);

    path.classList.add('ukraine-region');

    if (!regionInfo) {
      path.classList.add('is-disabled');
      return;
    }

    path.classList.add('is-selectable');
    path.dataset.cityId = regionInfo.cityId;
    path.dataset.cityName = regionInfo.cityName;
    path.style.pointerEvents = 'all';
    path.setAttribute('tabindex', '0');
    path.setAttribute('role', 'button');
    path.setAttribute('aria-label', regionInfo.cityName);

    if (state.regionId === regionInfo.regionId || state.city === regionInfo.cityId) {
      selectedRegion = regionInfo;
    }

    if (mode === 'full') {
      if (!isTouchDevice) {
        path.addEventListener('mouseenter', () => previewRegion(regionInfo));
        path.addEventListener('mouseleave', resetPreview);
        path.addEventListener('focus', () => previewRegion(regionInfo));
        path.addEventListener('blur', resetPreview);
      }

      path.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button === 0) {
          event.preventDefault();
          event.stopPropagation();
        }
      });

      path.addEventListener('pointerup', (event) => {
        const isMouseLeft = event.pointerType === 'mouse' && event.button === 0;
        const isTouchTap = event.pointerType !== 'mouse' && !gesture.moved;

        if (!isMouseLeft && !isTouchTap) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        choosePendingRegion(regionInfo);
      });

      path.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        path.blur();

        if (!gesture.moved) {
          path.blur();
          choosePendingRegion(regionInfo);
        }
      });

      path.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          choosePendingRegion(regionInfo);
        }
      });
    }

    storage.push(path);
  }

function loadSvgInto(layer, storage, mode) {
  layer.textContent = '';
  storage.length = 0;

  const svg = createCleanSvg(mode);
  layer.appendChild(svg);

  prepareSvg(svg, mode).forEach((path) => {
    setupRegion(path, storage, mode);
  });
}

  function openMap(regionInfo) {
    mapModal.classList.remove('hidden');
    pendingRegion = null;
    pointers.clear();
    gesture.mode = 'none';
    gesture.moved = false;

    renderCityPreview(null);
    resetTransform();

    if (regionInfo) {
      choosePendingRegion(regionInfo);
    } else {
      updateVisualState();
    }
  }

  async function initRegions() {
    try {
      await preloadAssets();

      compactRegionsLayer.innerHTML = '';
      loadSvgInto(fullRegionsLayer, fullRegionElements, 'full');
      updateVisualState();

      loader.classList.add('is-hidden');

      window.setTimeout(() => {
        loader.remove();
      }, 280);
    } catch (error) {
      console.error(error);
      loader.classList.add('is-hidden');

      compactRegionsLayer.innerHTML = '<div class="map-error">Ошибка загрузки SVG</div>';
      fullRegionsLayer.innerHTML = '<div class="map-error">Ошибка загрузки SVG</div>';
      setMainText('Ошибка загрузки карты областей');
    }
  }

  openMapBtn.addEventListener('click', () => openMap());
  compactMap.addEventListener('click', () => openMap());

  closeMapBtn.addEventListener('click', () => {
    mapModal.classList.add('hidden');
    pendingRegion = null;
    pointers.clear();
    gesture.mode = 'none';
    gesture.moved = false;
    renderCityPreview(null);
    updateVisualState();
  });

  confirmCityBtn.addEventListener('click', confirmRegion);

  nextBtn.addEventListener('click', () => {
    if (!selectedRegion) {
      alert('Сначала выбери город на карте');
      return;
    }

    show('home');
  });

  function createCleanSvg(mode) {
  const parser = new DOMParser();
  const sourceDoc = parser.parseFromString(svgTextCache, 'image/svg+xml');
  const sourceSvg = sourceDoc.querySelector('svg');
  const cleanSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  if (!sourceSvg) {
    throw new Error('SVG tag not found');
  }


  const rawViewBox = sourceSvg.getAttribute('viewBox') || sourceSvg.getAttribute('viewbox') || REGIONS_VIEW_BOX;

  cleanSvg.setAttribute('viewBox', rawViewBox);
  cleanSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  cleanSvg.setAttribute('focusable', 'false');
  cleanSvg.setAttribute('aria-hidden', 'true');

  Object.keys(REGION_DATA).forEach((regionId) => {
    const sourceRegion = sourceDoc.getElementById(regionId);

    if (!sourceRegion) {
      return;
    }

    const region = sourceRegion.cloneNode(true);

    region.removeAttribute('fill');
    region.removeAttribute('stroke');
    region.removeAttribute('stroke-width');
    region.removeAttribute('style');

    cleanSvg.appendChild(region);
  });

  return cleanSvg;
}

  
  fullMapViewport.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  fullMapViewport.addEventListener('pointerdown', onPointerDown);
  fullMapViewport.addEventListener('pointermove', onPointerMove);
  fullMapViewport.addEventListener('pointerup', onPointerUp);
  fullMapViewport.addEventListener('pointercancel', onPointerUp);
  fullMapViewport.addEventListener('wheel', onWheel, { passive: false });

  initRegions();
});
