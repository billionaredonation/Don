// pages/preload/preload.js
import { register, show } from '../../src/router.js';
import { getState } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';

const PRELOAD_VERSION = '12';
const CITY_MAP_VERSION = '36';

const BASE_PATH = import.meta.env.BASE_URL || './';

const MIN_LOADING_TIME = 2600;
const SLIDE_TIME = 1200;

const ALL_CITY_IDS = [
  'vinnytsia',
  'lutsk',
  'luhansk',
  'dnipro',
  'donetsk',
  'zhytomyr',
  'uzhhorod',
  'zaporizhzhia',
  'ivano-frankivsk',
  'kyiv',
  'kropyvnytskyi',
  'crimea',
  'lviv',
  'mykolaiv',
  'odesa',
  'poltava',
  'rivne',
  'sumy',
  'ternopil',
  'kharkiv',
  'kherson',
  'khmelnytskyi',
  'cherkasy',
  'chernihiv',
  'chernivtsi',
];

const CITY_MAP_FILES = {
  vinnytsia: 'Vinnytsia.png',
  lutsk: 'Lutsk.png',
  luhansk: 'Luhansk.png',
  dnipro: 'Dnipro.png',
  donetsk: 'Donetsk.png',
  zhytomyr: 'Zhytomyr.png',
  uzhhorod: 'Uzhhorod.png',
  zaporizhzhia: 'Zaporizhzhia.png',
  'ivano-frankivsk': 'IvanoFrankovsk.png',
  kyiv: 'Kyiv.png',
  kropyvnytskyi: 'Kropivnitsky.png',
  crimea: 'Crimea.png',
  lviv: 'Lviv.png',
  mykolaiv: 'Nikolaev.png',
  odesa: 'Odessa.png',
  poltava: 'Poltava.png',
  rivne: 'Rovno.png',
  sumy: 'Sumy.png',
  ternopil: 'Ternopil.png',
  kharkiv: 'Kharkiv.png',
  kherson: 'Kherson.png',
  khmelnytskyi: 'Khmelnitskiy.png',
  cherkasy: 'Cherkasy.png',
  chernihiv: 'Chernihiv.png',
  chernivtsi: 'Chernivtsi.png',
};

const DEFAULT_LOADING_IMAGES = [
  './loading-1.png',
  './loading-2.png',
  './loading-3.png',
];

function assetUrl(src) {
  if (!src) return '';

  if (src.startsWith('http')) return src;
  if (src.startsWith(BASE_PATH)) return src;
  if (src.startsWith('./')) return `${BASE_PATH}${src.slice(2)}`;
  if (src.startsWith('/')) return `${BASE_PATH}${src.slice(1)}`;

  return `${BASE_PATH}${src}`;
}

function withVersion(src, version = PRELOAD_VERSION) {
  if (!src) return '';

  const url = assetUrl(src);

  return url.includes('?') ? url : `${url}?v=${version}`;
}

function getCityMapSrc(cityId, city) {
  const normalizedCityId = normalizeCityId(cityId);

  return (
    city?.map ||
    city?.image ||
    city?.background ||
    CITY_MAP_FILES[normalizedCityId] ||
    'UkraineMap.png'
  );
}

function makeCityLoadingCandidates(cityId) {
  const normalizedCityId = normalizeCityId(cityId);

  return [
    `./loading-${normalizedCityId}-1.png`,
    `./loading-${normalizedCityId}-2.png`,
    `./loading-${normalizedCityId}-3.png`,
  ];
}

const DEFAULT_PRELOAD_TEXTS = [
  {
    eyebrow: 'Новый город',
    title: '{city}',
    text: '{region}. {tagline}',
  },
  {
    eyebrow: 'Загружаем район',
    title: 'Улицы ждут',
    text: 'Проверяем карту, стартовые условия и городскую экономику.',
  },
  {
    eyebrow: 'Экономика',
    title: 'Деньги в движении',
    text: 'Собираем маршруты, работы, риски и возможности региона.',
  },
];

const CITY_PRELOAD_TEXTS = {
  vinnytsia: [
    {
      eyebrow: 'Винница',
      title: '{city}',
      text: 'Спокойный город, где первые деньги любят дисциплину, а не шум.',
    },
    {
      eyebrow: 'Региональный старт',
      title: 'Тихий темп',
      text: 'Проверяем агро, сервис и лёгкую промышленность.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Малые шаги',
      text: 'Здесь выигрывает тот, кто не спешит с большими рисками.',
    },
  ],

  lutsk: [
    {
      eyebrow: 'Луцк',
      title: '{city}',
      text: 'Склады, дерево, сервис и город, который не любит лишнего шума.',
    },
    {
      eyebrow: 'Подготовка',
      title: 'Северо-западный ритм',
      text: 'Собираем маршруты, подработки и первые точки роста.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Тихий капитал',
      text: 'Медленный старт может оказаться самым устойчивым.',
    },
  ],

  luhansk: [
    {
      eyebrow: 'Луганск',
      title: '{city}',
      text: 'Промышленный регион, где каждый шаг требует расчёта.',
    },
    {
      eyebrow: 'Восстановление',
      title: 'Тяжёлый старт',
      text: 'Проверяем производство, ремонт и логистику.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Цена риска',
      text: 'Большая прибыль редко приходит без давления.',
    },
  ],

  dnipro: [
    {
      eyebrow: 'Днепр',
      title: '{city}',
      text: 'Логистика, склады и производство. Город любит движение.',
    },
    {
      eyebrow: 'Маршруты',
      title: 'Город на потоке',
      text: 'Готовим работу, транспорт и первые сделки.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Оборот важнее пафоса',
      text: 'Здесь деньги не лежат. Они ездят.',
    },
  ],

  donetsk: [
    {
      eyebrow: 'Донецк',
      title: '{city}',
      text: 'Тяжёлая промышленность, жёсткий старт и высокая цена ошибки.',
    },
    {
      eyebrow: 'Регион',
      title: 'Металл и уголь',
      text: 'Проверяем шахты, заводы и ремонтные цепочки.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Суровая прибыль',
      text: 'Этот город не обещает лёгких денег. Только настоящие.',
    },
  ],

  zhytomyr: [
    {
      eyebrow: 'Житомир',
      title: '{city}',
      text: 'Камень, дерево и спокойная логистика для уверенного старта.',
    },
    {
      eyebrow: 'Подготовка',
      title: 'Крепкий фундамент',
      text: 'Проверяем карьер, пилораму и складские маршруты.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Работа руками',
      text: 'Здесь ценят не шум, а полезный труд.',
    },
  ],

  uzhhorod: [
    {
      eyebrow: 'Ужгород',
      title: '{city}',
      text: 'Граница рядом. Возможности тоже.',
    },
    {
      eyebrow: 'Маршруты',
      title: 'Тихие связи',
      text: 'Проверяем туризм, сервис и пограничную экономику.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Маленький город, длинные пути',
      text: 'Иногда самый спокойный маршрут ведёт к самым интересным деньгам.',
    },
  ],

  zaporizhzhia: [
    {
      eyebrow: 'Запорожье',
      title: '{city}',
      text: 'Индустриальный город, где металл тяжёлый, а решения ещё тяжелее.',
    },
    {
      eyebrow: 'Заводы',
      title: 'Горячий старт',
      text: 'Проверяем производство, СТО, металлургию и городской ритм.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Деньги из стали',
      text: 'Здесь капитал собирают не словами, а оборотом.',
    },
  ],

  'ivano-frankivsk': [
    {
      eyebrow: 'Ивано-Франковск',
      title: '{city}',
      text: 'Туризм, лес, кофе и город, который умеет зарабатывать красиво.',
    },
    {
      eyebrow: 'Карпаты рядом',
      title: 'Мягкий старт',
      text: 'Проверяем сервис, креатив и туристический поток.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Атмосфера тоже актив',
      text: 'Здесь можно продать не только товар, но и настроение.',
    },
  ],

  kyiv: [
    {
      eyebrow: 'Киев',
      title: '{city}',
      text: 'Столица не ждёт медленных. Здесь каждый час стоит денег.',
    },
    {
      eyebrow: 'Темп',
      title: 'Большой город',
      text: 'Проверяем офисы, доставку, такси и дорогую аренду.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Высокие ставки',
      text: 'В Киеве можно быстро вырасти. Или быстро понять цену ошибки.',
    },
  ],

  kropyvnytskyi: [
    {
      eyebrow: 'Кропивницкий',
      title: '{city}',
      text: 'Аграрный хаб, техника и зерно. Деньги здесь любят сезон.',
    },
    {
      eyebrow: 'Подготовка',
      title: 'Полевой расчёт',
      text: 'Проверяем элеваторы, СТО и агро-маршруты.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Сезон решает',
      text: 'Кто понимает цикл — тот понимает прибыль.',
    },
  ],

  crimea: [
    {
      eyebrow: 'Крым',
      title: '{city}',
      text: 'Курорты, порт, вино и экономика, завязанная на поток людей.',
    },
    {
      eyebrow: 'Побережье',
      title: 'Сезонный капитал',
      text: 'Проверяем туризм, сервис и портовые возможности.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Деньги приходят волнами',
      text: 'Главное — оказаться на берегу в правильный момент.',
    },
  ],

  lviv: [
    {
      eyebrow: 'Львов',
      title: '{city}',
      text: 'Кофе, туризм, сервис и город, где атмосфера продаётся дорого.',
    },
    {
      eyebrow: 'Старый город',
      title: 'Красивый оборот',
      text: 'Проверяем отели, кофейни, доставку и туристический поток.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Вкус к деньгам',
      text: 'Во Львове важно не только что продаёшь, но и как.',
    },
  ],

  mykolaiv: [
    {
      eyebrow: 'Николаев',
      title: '{city}',
      text: 'Верфи, портовая экономика и город, привыкший к тяжёлой работе.',
    },
    {
      eyebrow: 'Порт',
      title: 'Морская логистика',
      text: 'Проверяем склады, верфи и агро-экспорт.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Груз имеет вес',
      text: 'Здесь деньги часто приходят не быстро, зато крупно.',
    },
  ],

  odesa: [
    {
      eyebrow: 'Одесса',
      title: '{city}',
      text: 'Порт просыпается раньше города. Деньги любят море и скорость.',
    },
    {
      eyebrow: 'Побережье',
      title: 'Торговый шум',
      text: 'Проверяем порт, такси, туризм и быстрый оборот.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Улыбка тоже инструмент',
      text: 'В Одессе важно уметь считать и разговаривать.',
    },
  ],

  poltava: [
    {
      eyebrow: 'Полтава',
      title: '{city}',
      text: 'Нефть, агро и спокойный город с крепкой базой.',
    },
    {
      eyebrow: 'Регион',
      title: 'Ровный старт',
      text: 'Проверяем переработку, сервис и локальный рынок.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Стабильность имеет цену',
      text: 'Не самый громкий город, зато умеет держать темп.',
    },
  ],

  rivne: [
    {
      eyebrow: 'Ровно',
      title: '{city}',
      text: 'Лес, текстиль и сервис. Хорошее место для аккуратного старта.',
    },
    {
      eyebrow: 'Подготовка',
      title: 'Рабочий ритм',
      text: 'Проверяем лесопереработку, склады и услуги.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Меньше шума, больше дела',
      text: 'Здесь прибыль строится на постоянстве.',
    },
  ],

  sumy: [
    {
      eyebrow: 'Сумы',
      title: '{city}',
      text: 'Химпром, машиностроение и агро. Город для расчётливых.',
    },
    {
      eyebrow: 'Регион',
      title: 'Северный баланс',
      text: 'Проверяем заводы, СТО и сельское хозяйство.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Точность важнее скорости',
      text: 'Сумская прибыль любит аккуратные решения.',
    },
  ],

  ternopil: [
    {
      eyebrow: 'Тернополь',
      title: '{city}',
      text: 'Студенческий город, сервис, агро и небольшие быстрые возможности.',
    },
    {
      eyebrow: 'Подготовка',
      title: 'Локальный темп',
      text: 'Проверяем подработки, услуги и рынок.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Малые деньги тоже капитал',
      text: 'Здесь важно начать раньше, чем начать идеально.',
    },
  ],

  kharkiv: [
    {
      eyebrow: 'Харьков',
      title: '{city}',
      text: 'IT, образование, машины и город с инженерным характером.',
    },
    {
      eyebrow: 'Темп',
      title: 'Умный старт',
      text: 'Проверяем заводы, университеты и технологичные возможности.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Знание приносит деньги',
      text: 'В Харькове мозги могут стоить дороже груза.',
    },
  ],

  kherson: [
    {
      eyebrow: 'Херсон',
      title: '{city}',
      text: 'Верфи, агро и морские ворота. Город с тяжёлой водой в крови.',
    },
    {
      eyebrow: 'Порт',
      title: 'Южный маршрут',
      text: 'Проверяем агро, судостроение и логистику.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Деньги идут каналами',
      text: 'Главное — знать, куда течёт поток.',
    },
  ],

  khmelnytskyi: [
    {
      eyebrow: 'Хмельницкий',
      title: '{city}',
      text: 'Рынки, опт, агро и городская торговля.',
    },
    {
      eyebrow: 'Торговля',
      title: 'Оборот решает',
      text: 'Проверяем рынки, сервис и локальные цепочки.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Купить дешевле, продать умнее',
      text: 'Здесь считают не красиво, а точно.',
    },
  ],

  cherkasy: [
    {
      eyebrow: 'Черкассы',
      title: '{city}',
      text: 'Днепр рядом, логистика рядом, деньги тоже где-то рядом.',
    },
    {
      eyebrow: 'Регион',
      title: 'Сахар и маршруты',
      text: 'Проверяем переработку, дерево и движение по городу.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Средний город, реальные шансы',
      text: 'Черкассы любят тех, кто умеет видеть недооценённое.',
    },
  ],

  chernihiv: [
    {
      eyebrow: 'Чернигов',
      title: '{city}',
      text: 'Пиво, агро и спокойный северный старт.',
    },
    {
      eyebrow: 'Подготовка',
      title: 'Старый город',
      text: 'Проверяем сервис, производство и сельское хозяйство.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Тише едешь — больше считаешь',
      text: 'Здесь можно расти без лишнего шума.',
    },
  ],

  chernivtsi: [
    {
      eyebrow: 'Черновцы',
      title: '{city}',
      text: 'Туризм, сувениры, кофе и город с мягкой торговой жилкой.',
    },
    {
      eyebrow: 'Регион',
      title: 'Крафтовый старт',
      text: 'Проверяем отели, кофейни и маленький бизнес.',
    },
    {
      eyebrow: 'Экономика',
      title: 'Красивый товар продаётся легче',
      text: 'В Черновцах важна упаковка — и не только у товара.',
    },
  ],
};

const DEFAULT_TIPS = [
  'Не держи все деньги в одном решении.',
  'Первые действия важнее, чем кажется.',
  'Городская экономика любит регулярность.',
  'Иногда безопасный доход лучше красивого риска.',
];

const CITY_PRELOAD_TIPS = {
  kyiv: [
    'В Киеве высокий доход часто идёт рядом с высокими расходами.',
    'Не разгоняйся быстрее, чем растёт твой капитал.',
    'Столичный темп наказывает за лишние паузы.',
  ],

  odesa: [
    'В Одессе быстрый оборот важнее долгих размышлений.',
    'Портовая экономика любит движение.',
    'Разговор иногда дешевле ошибки.',
  ],

  zaporizhzhia: [
    'Индустриальные города любят стабильный оборот.',
    'Ремонт, металл и производство могут стать базой капитала.',
    'Не путай тяжёлый старт с плохим стартом.',
  ],

  uzhhorod: [
    'Граница — это не только путь, но и возможность.',
    'Маленький город не значит маленькая экономика.',
    'Туризм и сервис могут кормить стабильнее, чем кажется.',
  ],

  cherkasy: [
    'В среднем городе проще заметить недооценённую возможность.',
    'Логистика по региону может быть важнее, чем кажется.',
    'Не игнорируй простые работы: они строят стартовый капитал.',
  ],
};

function formatTemplate(value, city) {
  return String(value || '')
    .replaceAll('{city}', city.name || 'Город')
    .replaceAll('{region}', city.region || 'Регион')
    .replaceAll('{tagline}', city.tagline || '');
}

function getCityTexts(cityId, city) {
  const normalizedCityId = normalizeCityId(cityId);
  const source = CITY_PRELOAD_TEXTS[normalizedCityId] || DEFAULT_PRELOAD_TEXTS;

  return source.map((item) => ({
    eyebrow: formatTemplate(item.eyebrow, city),
    title: formatTemplate(item.title, city),
    text: formatTemplate(item.text, city),
  }));
}

function getCityTips(cityId) {
  const normalizedCityId = normalizeCityId(cityId);
  return CITY_PRELOAD_TIPS[normalizedCityId] || DEFAULT_TIPS;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function preloadImage(src, timeout = 3200) {
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

async function collectExistingImages(candidates) {
  const existing = [];

  for (const src of candidates) {
    const versioned = withVersion(src);
    const ok = await preloadImage(versioned);

    if (ok) {
      existing.push(versioned);
      console.log('[Preload] image found:', versioned);
    } else {
      console.warn('[Preload] image missing:', versioned);
    }
  }

  return existing;
}

async function resolveLoadingImages(cityId, city) {
  const normalizedCityId = normalizeCityId(cityId);

  const cityMap = withVersion(getCityMapSrc(normalizedCityId, city), CITY_MAP_VERSION);
  const ukraineMap = withVersion('UkraineMap.png', CITY_MAP_VERSION);

  const images = [];

  const cityMapOk = await preloadImage(cityMap, 4500);

  if (cityMapOk) {
    images.push(cityMap);
  } else {
    console.warn('[Preload] city map missing:', cityMap);
  }

  const cityLoadingImages = await collectExistingImages(
    makeCityLoadingCandidates(normalizedCityId)
  );

  for (const img of cityLoadingImages) {
    if (!images.includes(img)) {
      images.push(img);
    }
  }

  if (images.length < 3) {
    const defaultImages = await collectExistingImages(DEFAULT_LOADING_IMAGES);

    for (const img of defaultImages) {
      if (!images.includes(img)) {
        images.push(img);
      }

      if (images.length >= 3) break;
    }
  }

  if (!images.length) {
    images.push(ukraineMap);
  }

  while (images.length < 3) {
    images.push(images[0] || ukraineMap);
  }

  console.log('[Preload] resolved images for city:', normalizedCityId, images);

  return images;
}

function makeSlides(cityId, city, images) {
  const cityMap = withVersion(getCityMapSrc(cityId, city), CITY_MAP_VERSION);
  const ukraineMap = withVersion('UkraineMap.png', CITY_MAP_VERSION);
  const texts = getCityTexts(cityId, city);

  return images.map((src, index) => {
    const textItem = texts[index] || texts[index % texts.length];

    return {
      src,
      fallback: cityMap || ukraineMap,
      eyebrow: textItem.eyebrow,
      title: textItem.title,
      text: textItem.text,
    };
  });
}

function setImageWithFallback(img, primarySrc, fallbackSrc) {
  const safeFallback = fallbackSrc || withVersion('UkraineMap.png', CITY_MAP_VERSION);

  img.classList.remove('is-active');

  window.setTimeout(() => {
    img.onerror = () => {
      img.onerror = null;
      img.src = safeFallback;
    };

    img.onload = () => {
      img.classList.add('is-active');
    };

    img.src = primarySrc || safeFallback;
  }, 80);
}

function resolveSelectedCityId() {
  const currentState = getState();

  const rawCityId =
    currentState.city ||
    currentState.player?.city ||
    currentState.cityId ||
    currentState.player?.cityId ||
    'kyiv';

  const normalizedCityId = normalizeCityId(rawCityId);

  if (ALL_CITY_IDS.includes(normalizedCityId)) {
    return normalizedCityId;
  }

  return normalizedCityId || 'kyiv';
}

register('preload', async (root, props = {}) => {
  const nextScreen = props.next || 'home';
  const mode = props.mode || 'default';

  const cityId = resolveSelectedCityId();
  const city = getCityConfig(cityId);
  const tips = getCityTips(cityId);

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
          <p id="preloadTip">${tips[0] || DEFAULT_TIPS[0]}</p>
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
    }, 420);
  }

  const startedAt = Date.now();
  let visualProgress = 0;

  progressTimer = window.setInterval(() => {
    const timePart = clamp(((Date.now() - startedAt) / MIN_LOADING_TIME) * 75, 0, 75);
    const assetPart = loadedAssets > 0 ? 25 : 0;

    visualProgress = Math.max(visualProgress, timePart + assetPart);
    setProgress(visualProgress);
  }, 80);

  const images = await resolveLoadingImages(cityId, city);
  const slides = makeSlides(cityId, city, images);

  function setSlide(index) {
    const slide = slides[index % slides.length];

    setImageWithFallback(art, slide.src, slide.fallback);

    eyebrow.textContent = slide.eyebrow;
    title.textContent = slide.title;
    text.textContent = slide.text;
    tip.textContent = tips[index % tips.length] || DEFAULT_TIPS[index % DEFAULT_TIPS.length];
  }

  setSlide(0);

  slideTimer = window.setInterval(() => {
    currentSlideIndex += 1;
    setSlide(currentSlideIndex);
  }, SLIDE_TIME);

  Promise.allSettled([
    ...images.map(async (src) => {
      await preloadImage(src, 4500);
      loadedAssets += 1;
    }),

    import('../home/home.js').catch((error) => {
      console.warn('[Preload] home module preload failed:', error);
    }),
  ]).then(async () => {
    const elapsed = Date.now() - startedAt;
    const rest = Math.max(0, MIN_LOADING_TIME - elapsed);

    await new Promise((resolve) => window.setTimeout(resolve, rest));

    goNext();
  });
});
