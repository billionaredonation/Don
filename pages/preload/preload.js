// pages/preload/preload.js
import { register, show } from '../../src/router.js';
import { getState } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';

const PRELOAD_VERSION = '4';
const CITY_MAP_VERSION = '35';

const MIN_LOADING_TIME = 4200;
const SLIDE_TIME = 1400;

/*
  ВАЖНО:
  сюда добавлены разные варианты регистра, потому что GitHub Pages
  чувствителен к имени файла.

  Если файл называется loading-1.PNG, а код просит loading-1.png —
  на GitHub Pages будет 404.
*/
const LOADING_IMAGE_CANDIDATES = [
  [
    './loading-1.png',
    './loading-1.PNG',
    './Loading-1.png',
    './Loading-1.PNG',
    './loading1.png',
    './loading1.PNG',
  ],
  [
    './loading-2.png',
    './loading-2.PNG',
    './Loading-2.png',
    './Loading-2.PNG',
    './loading2.png',
    './loading2.PNG',
  ],
  [
    './loading-3.png',
    './loading-3.PNG',
    './Loading-3.png',
    './Loading-3.PNG',
    './loading3.png',
    './loading3.PNG',
  ],
];

const TIPS = [
  'Деньги любят скорость, но город любит тех, кто помнит район.',
  'Работа в регионе зависит от экономики города и стартовых условий.',
  'Стабильный город даёт предсказуемость. Хаотичный — шанс сорвать куш.',
  'Некоторые решения выглядят мелкими, пока не начинают стоить недели прогресса.',
];

function withVersion(src, version = PRELOAD_VERSION) {
  if (!src) return '';
  return src.includes('?') ? src : `${src}?v=${version}`;
}

function withoutVersion(src) {
  return String(src || '').split('?')[0];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function preloadImage(src, timeout = 4500) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(false);
      return;
    }

    const image = new Image();
    let done = false;

    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };

    const timer = window.setTimeout(() => finish(false), timeout);

    image.onload = () => {
      window.clearTimeout(timer);
      finish(true);
    };

    image.onerror = () => {
      window.clearTimeout(timer);
      finish(false);
    };

    image.src = src;
  });
}

async function firstWorkingImage(candidates) {
  for (const candidate of candidates) {
    const versioned = withVersion(candidate);
    const ok = await preloadImage(versioned, 2500);

    if (ok) {
      console.log('[Preload] image found:', versioned);
      return versioned;
    }

    console.warn('[Preload] image missing:', versioned);
  }

  return '';
}

async function resolveLoadingImages(city) {
  const cityMap = withVersion(city.map || './UkraineMap.png', CITY_MAP_VERSION);
  const ukraineMap = withVersion('./UkraineMap.png', CITY_MAP_VERSION);

  const resolved = [];

  for (const candidates of LOADING_IMAGE_CANDIDATES) {
    const image = await firstWorkingImage(candidates);

    if (image) {
      resolved.push(image);
    }
  }

  /*
    Если loading-фото не найдены или их меньше трёх,
    добиваем список рабочими картами.
  */
  if (!resolved.length) {
    resolved.push(cityMap);
  }

  if (resolved.length < 2) {
    resolved.push(ukraineMap);
  }

  if (resolved.length < 3) {
    resolved.push(cityMap);
  }

  return resolved;
}

function makeSlides(city, images) {
  const cityMap = withVersion(city.map || './UkraineMap.png', CITY_MAP_VERSION);
  const ukraineMap = withVersion('./UkraineMap.png', CITY_MAP_VERSION);

  const copy = [
    {
      eyebrow: 'Новый город',
      title: city.name,
      text: `${city.region}. ${city.tagline}`,
      fallback: cityMap,
    },
    {
      eyebrow: 'Загружаем район',
      title: 'Улицы ждут',
      text: 'Проверяем карту, районные данные и стартовые условия.',
      fallback: cityMap,
    },
    {
      eyebrow: 'Экономика',
      title: 'Деньги в движении',
      text: 'Собираем маршруты, работы и экономику региона.',
      fallback: ukraineMap,
    },
  ];

  return images.map((src, index) => {
    const item = copy[index] || copy[index % copy.length];

    return {
      src,
      fallback: item.fallback,
      eyebrow: item.eyebrow,
      title: item.title,
      text: item.text,
    };
  });
}

function setImageWithFallback(img, primarySrc, fallbackSrc) {
  const safeFallback = fallbackSrc || withVersion('./UkraineMap.png', CITY_MAP_VERSION);

  img.classList.remove('is-active');

  window.setTimeout(() => {
    img.onerror = () => {
      console.warn('[Preload] primary image failed, using fallback:', {
        primarySrc,
        safeFallback,
      });

      img.onerror = null;
      img.src = safeFallback;
    };

    img.onload = () => {
      console.log('[Preload] displayed image:', img.currentSrc || img.src);
      img.classList.add('is-active');
    };

    img.src = primarySrc || safeFallback;
  }, 80);
}

register('preload', async (root, props = {}) => {
  const nextScreen = props.next || 'home';
  const mode = props.mode || 'default';

  const currentState = getState();
  const cityId = normalizeCityId(currentState.city || currentState.player?.city);
  const city = getCityConfig(cityId);

  root.className = 'page preload-page';

  root.innerHTML = `
    <section class="preload-screen" aria-label="Загрузка города">
      <div class="preload-noise" aria-hidden="true"></div>
      <div class="preload-vignette" aria-hidden="true"></div>

      <div class="preload-art-stage">
        <img
          class="preload-art"
          id="preloadArt"
          alt=""
        />
      </div>

      <div class="preload-brand">
        <span>MN</span>
      </div>

      <div class="preload-city-card">
        <p class="preload-eyebrow" id="preloadEyebrow">Новый город</p>
        <h1 id="preloadTitle">${city.name}</h1>
        <p id="preloadText">${city.region}. ${city.tagline}</p>
      </div>

      <div class="preload-bottom">
        <div class="preload-tip">
          <span>Совет</span>
          <p id="preloadTip">${TIPS[0]}</p>
        </div>

        <div class="preload-status">
          <div class="preload-status-top">
            <span id="preloadStatusText">
              ${mode === 'first-start' ? 'Подготавливаем первый вход' : 'Загружаем главное меню'}
            </span>
            <b id="preloadPercent">0%</b>
          </div>

          <div class="preload-bar">
            <i id="preloadBar"></i>
          </div>
        </div>
      </div>
    </section>
  `;

  const art = root.querySelector('#preloadArt');
  const eyebrow = root.querySelector('#preloadEyebrow');
  const title = root.querySelector('#preloadTitle');
  const text = root.querySelector('#preloadText');
  const tip = root.querySelector('#preloadTip');
  const percent = root.querySelector('#preloadPercent');
  const bar = root.querySelector('#preloadBar');
  const statusText = root.querySelector('#preloadStatusText');

  let currentSlideIndex = 0;
  let loadedAssets = 0;
  let finished = false;
  let slideTimer = null;
  let progressTimer = null;
  let slides = [];

  function setProgress(value) {
    const safeValue = clamp(Math.round(value), 0, 100);

    percent.textContent = `${safeValue}%`;
    bar.style.width = `${safeValue}%`;

    if (safeValue >= 100) {
      statusText.textContent = 'Город готов';
    } else if (safeValue >= 75) {
      statusText.textContent = 'Открываем доступ к району';
    } else if (safeValue >= 45) {
      statusText.textContent = 'Загружаем карту города';
    } else {
      statusText.textContent = mode === 'first-start'
        ? 'Подготавливаем первый вход'
        : 'Загружаем главное меню';
    }
  }

  function setSlide(index) {
    if (!slides.length) return;

    const slide = slides[index % slides.length];

    setImageWithFallback(art, slide.src, slide.fallback);

    eyebrow.textContent = slide.eyebrow;
    title.textContent = slide.title;
    text.textContent = slide.text;
    tip.textContent = TIPS[index % TIPS.length];
  }

  function goNext() {
    if (finished) return;

    finished = true;

    if (slideTimer) {
      window.clearInterval(slideTimer);
    }

    if (progressTimer) {
      window.clearInterval(progressTimer);
    }

    setProgress(100);

    root.querySelector('.preload-screen')?.classList.add('is-leaving');

    window.setTimeout(() => {
      show(nextScreen);
    }, 520);
  }

  const startedAt = Date.now();
  let visualProgress = 0;

  progressTimer = window.setInterval(() => {
    const timePart = clamp(((Date.now() - startedAt) / MIN_LOADING_TIME) * 80, 0, 80);
    const assetPart = loadedAssets > 0 ? 20 : 0;

    visualProgress = Math.max(visualProgress, timePart + assetPart);
    setProgress(visualProgress);
  }, 90);

  const images = await resolveLoadingImages(city);
  slides = makeSlides(city, images);

  console.log('[Preload] final images:', images.map(withoutVersion));

  setSlide(0);

  slideTimer = window.setInterval(() => {
    currentSlideIndex += 1;
    setSlide(currentSlideIndex);
  }, SLIDE_TIME);

  Promise.all(
    images.map(async (src) => {
      await preloadImage(src);
      loadedAssets += 1;
    })
  ).then(async () => {
    const elapsed = Date.now() - startedAt;
    const rest = Math.max(0, MIN_LOADING_TIME - elapsed);

    await new Promise((resolve) => window.setTimeout(resolve, rest));

    goNext();
  });
});
