// pages/preload/preload.js
import { register, show } from '../../src/router.js';
import { getState } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';

const PRELOAD_VERSION = '2';
const CITY_MAP_VERSION = '34';

const MIN_LOADING_TIME = 4200;
const SLIDE_TIME = 1400;

const LOADING_IMAGES = [
  './loading-1.png',
  './loading-2.png',
  './loading-3.png',
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function preloadImage(src, timeout = 5000) {
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

function setImageWithFallback(img, primarySrc, fallbackSrc) {
  img.onerror = () => {
    img.onerror = null;
    img.src = fallbackSrc;
  };

  img.src = primarySrc || fallbackSrc;
}

function makeSlides(city) {
  const cityMap = withVersion(city.map || './UkraineMap.png', CITY_MAP_VERSION);
  const ukraineMap = withVersion('./UkraineMap.png', CITY_MAP_VERSION);

  const texts = [
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

  return LOADING_IMAGES.map((src, index) => {
    const copy = texts[index] || texts[index % texts.length];

    return {
      src: withVersion(src),
      fallback: copy.fallback,
      eyebrow: copy.eyebrow,
      title: copy.title,
      text: copy.text,
    };
  });
}

register('preload', (root, props = {}) => {
  const nextScreen = props.next || 'home';
  const mode = props.mode || 'default';

  const currentState = getState();
  const cityId = normalizeCityId(currentState.city || currentState.player?.city);
  const city = getCityConfig(cityId);

  const slides = makeSlides(city);

  const assetsToLoad = [
    ...slides.flatMap((slide) => [slide.src, slide.fallback]),
    withVersion('./UkraineMap.png', CITY_MAP_VERSION),
  ].filter(Boolean);

  let currentSlideIndex = 0;
  let loadedAssets = 0;
  let finished = false;
  let slideTimer = null;
  let progressTimer = null;

  root.className = 'page preload-page';

  root.innerHTML = `
    <section class="preload-screen" aria-label="Загрузка города">
      <div class="preload-noise" aria-hidden="true"></div>
      <div class="preload-vignette" aria-hidden="true"></div>

      <div class="preload-art-stage">
        <img
          class="preload-art is-active"
          id="preloadArt"
          alt=""
        />
      </div>

      <div class="preload-brand">
        <span>MN</span>
      </div>

      <div class="preload-city-card">
        <p class="preload-eyebrow" id="preloadEyebrow">${slides[0].eyebrow}</p>
        <h1 id="preloadTitle">${slides[0].title}</h1>
        <p id="preloadText">${slides[0].text}</p>
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

  setImageWithFallback(art, slides[0].src, slides[0].fallback);

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
    const slide = slides[index % slides.length];

    art.classList.remove('is-active');

    window.setTimeout(() => {
      if (finished || !root.isConnected) return;

      setImageWithFallback(art, slide.src, slide.fallback);

      eyebrow.textContent = slide.eyebrow;
      title.textContent = slide.title;
      text.textContent = slide.text;
      tip.textContent = TIPS[index % TIPS.length];

      art.classList.add('is-active');
    }, 180);
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

  slideTimer = window.setInterval(() => {
    currentSlideIndex += 1;
    setSlide(currentSlideIndex);
  }, SLIDE_TIME);

  const startedAt = Date.now();
  let visualProgress = 0;

  progressTimer = window.setInterval(() => {
    const timePart = clamp(((Date.now() - startedAt) / MIN_LOADING_TIME) * 80, 0, 80);
    const assetPart = assetsToLoad.length
      ? (loadedAssets / assetsToLoad.length) * 20
      : 20;

    visualProgress = Math.max(visualProgress, timePart + assetPart);
    setProgress(visualProgress);
  }, 90);

  Promise.all(
    assetsToLoad.map(async (src) => {
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
