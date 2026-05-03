import { createCityConfig } from './shared/createCityConfig.js';

export const CITY_ID_ALIASES = {
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

function job(id, title, pay, description) {
  return { id, title, pay, description };
}

function city(config) {
  return createCityConfig(config);
}

export const cities = {
  kyiv: city({
    id: 'kyiv',
    name: 'Киев',
    region: 'Столица',
    map: './KiyvMap.png',
    tagline: 'Офисы, доставка и самые дорогие смены.',
    economyType: 'capital',
    startMoney: 1800,
    profileTitle: 'Столичный игрок',
    profileText: 'В Киеве больше конкуренции, но выше потолок заработка.',
    specialty: {
      label: 'Бонус',
      value: '+18% к офисным работам',
      description: 'Столица лучше подходит для быстрых денег через сервис, доставку и офисные задачи.'
    },
    jobs: [
      job('courier', 'Курьер', 980, 'Быстрая смена с частыми заказами.'),
      job('office', 'Офис', 1320, 'Стабильная работа с высоким доходом.'),
      job('taxi', 'Такси', 1160, 'Доход зависит от активности города.')
    ],
    housing: {
      title: 'Микроапартаменты',
      minPrice: 2600,
      description: 'Дорогое жилье, зато рядом с работами и сервисами.',
      bonus: '+5% к доходу офисных смен'
    }
  }),

  zaporizhzhia: city({
    id: 'zaporizhzhia',
    name: 'Запорожье',
    region: 'Индустриальный регион',
    map: './Zaporozya.png',
    tagline: 'Металлургия, заводы и мощный старт.',
    economyType: 'industrial',
    startMoney: 1300,
    profileTitle: 'Рабочий индустрии',
    profileText: 'Запорожье дает крепкий старт через производство и ремонт.',
    specialty: {
      label: 'Бонус',
      value: '+13% к заводам',
      description: 'Производственные смены платят стабильнее и открывают будущие улучшения.'
    },
    jobs: [
      job('plant', 'Завод', 1080, 'Основной заработок индустриального города.'),
      job('metallurgy', 'Металлургия', 1190, 'Тяжелая, но более прибыльная смена.'),
      job('repair', 'СТО', 930, 'Быстрая техническая работа.')
    ],
    housing: {
      title: 'Рабочее общежитие',
      minPrice: 1100,
      description: 'Дешевый старт рядом с производством.',
      bonus: '+4% к заводским работам'
    }
  }),

  odesa: city({
    id: 'odesa',
    name: 'Одесса',
    region: 'Портовый город',
    map: './Odessa.png',
    tagline: 'Порт, торговля и туристические деньги.',
    economyType: 'trade',
    startMoney: 1500,
    profileTitle: 'Портовый предприниматель',
    profileText: 'Одесса дает хороший старт через торговлю и сезонные работы.',
    specialty: {
      label: 'Бонус',
      value: '+15% к торговле',
      description: 'Портовые сделки платят больше, но иногда требуют больше времени.'
    },
    jobs: [
      job('port', 'Порт', 1180, 'Разгрузка и логистика товаров.'),
      job('market', 'Торговля', 1040, 'Покупка, продажа и быстрый оборот.'),
      job('taxi', 'Такси у моря', 930, 'Доход выше в туристические часы.')
    ],
    housing: {
      title: 'Комната у центра',
      minPrice: 1900,
      description: 'Средняя цена и быстрый доступ к порту.',
      bonus: '+4% к торговым работам'
    }
  }),

  lviv: city({
    id: 'lviv',
    name: 'Львов',
    region: 'Туристический центр',
    map: './Lviv.png',
    tagline: 'Кофейни, отели и сервис с хорошими чаевыми.',
    economyType: 'tourism',
    startMoney: 1400,
    profileTitle: 'Городской сервисник',
    profileText: 'Львов хорош для стабильного роста через сервис и туризм.',
    specialty: {
      label: 'Бонус',
      value: '+12% к сервису',
      description: 'Работы в кафе и отелях чаще дают бонусные выплаты.'
    },
    jobs: [
      job('coffee', 'Кофейня', 920, 'Стабильная смена с чаевыми.'),
      job('hotel', 'Отель', 1030, 'Сервисная работа с хорошим графиком.'),
      job('guide', 'Гид', 1100, 'Больше платит при развитом профиле.')
    ],
    housing: {
      title: 'Квартира в старом районе',
      minPrice: 1700,
      description: 'Комфортный старт для сервисных работ.',
      bonus: '+3% к чаевым'
    }
  }),

  kharkiv: city({
    id: 'kharkiv',
    name: 'Харьков',
    region: 'Наука и производство',
    map: './Kharkiv.png',
    tagline: 'IT, заводы и технические смены.',
    economyType: 'tech',
    startMoney: 1450,
    profileTitle: 'Технический специалист',
    profileText: 'Харьков дает сильные работы для развития через технологии.',
    specialty: {
      label: 'Бонус',
      value: '+14% к техработам',
      description: 'Технические работы платят выше после первых улучшений.'
    },
    jobs: [
      job('factory', 'Завод', 1050, 'Производственная смена с надежным доходом.'),
      job('it', 'IT-аутсорс', 1240, 'Высокая зарплата, но выше требования.'),
      job('repair', 'Ремонт техники', 990, 'Быстрые заказы по району.')
    ],
    housing: {
      title: 'Студия у транспорта',
      minPrice: 1550,
      description: 'Недорогое жилье рядом с работами.',
      bonus: '+4% к техработам'
    }
  }),

  dnipro: city({
    id: 'dnipro',
    name: 'Днепр',
    region: 'Логистический узел',
    map: './DneprMap.png',
    tagline: 'Склады, доставка и промышленность.',
    economyType: 'logistics',
    startMoney: 1350,
    profileTitle: 'Логист',
    profileText: 'Днепр удобен для стабильного заработка через склады и доставку.',
    specialty: {
      label: 'Бонус',
      value: '+10% к логистике',
      description: 'Складские и транспортные работы быстрее окупаются.'
    },
    jobs: [
      job('warehouse', 'Склад', 960, 'Ровный доход без сильных рисков.'),
      job('logistics', 'Логистика', 1120, 'Маршруты и перевозки по городу.'),
      job('service', 'СТО', 1010, 'Ремонт транспорта и мелкие заказы.')
    ],
    housing: {
      title: 'Жилье у склада',
      minPrice: 1350,
      description: 'Дешевле столицы, удобно для логистики.',
      bonus: '+3% к складским сменам'
    }
  })
};

const fallbackCities = [
  ['vinnytsia', 'Винница', 'Агро и сервис', './VinitsaMap.png', '+9% к агроработам'],
  ['lutsk', 'Луцк', 'Лес и ремесло', './LutskMap.png', '+11% к деревообработке'],
  ['luhansk', 'Луганск', 'Восстановление', './LuganskMap.png', '+16% к восстановлению'],
  ['donetsk', 'Донецк', 'Металл и шахты', './DonetskMap.png', '+17% к шахтам'],
  ['zhytomyr', 'Житомир', 'Камень и дерево', './ZutomyrMap.png', '+12% к материалам'],
  ['uzhhorod', 'Ужгород', 'Граница и туризм', './UzgorodMap.png', '+13% к торговле'],
  ['ivano-frankivsk', 'Ивано-Франковск', 'Туризм и креатив', './IvanoFrankovsk.png', '+12% к туризму'],
  ['kropyvnytskyi', 'Кропивницкий', 'Аграрный центр', './Kropivnitskyi.png', '+12% к агрологистике'],
  ['crimea', 'Крым', 'Курорт и порт', './KrymMap.png', '+18% к сезонным работам'],
  ['mykolaiv', 'Николаев', 'Верфи и порт', './Nikolaev.png', '+14% к верфям'],
  ['poltava', 'Полтава', 'Нефть и агро', './Poltava.png', '+11% к переработке'],
  ['rivne', 'Ровно', 'Текстиль и лес', './Rovno.png', '+10% к легкой промышленности'],
  ['sumy', 'Сумы', 'Химпром и агро', './Sumy.png', '+13% к заводам'],
  ['ternopil', 'Тернополь', 'Студенты и агро', './Ternopil.png', '+10% к обучению'],
  ['kherson', 'Херсон', 'Море и агроэкспорт', './Kherson.png', '+13% к экспорту'],
  ['khmelnytskyi', 'Хмельницкий', 'Рынки и агро', './Khmelnitskiy.png', '+14% к рынку'],
  ['cherkasy', 'Черкассы', 'Днепр и переработка', './CherkasyMap.png', '+11% к переработке'],
  ['chernihiv', 'Чернигов', 'Агро и ремесло', './ChernigovMap.png', '+10% к ремеслу'],
  ['chernivtsi', 'Черновцы', 'Крафт и туризм', './ChernivtsiMap.png', '+12% к крафту']
];

fallbackCities.forEach(([id, name, region, map, bonus]) => {
  cities[id] = city({
    id,
    name,
    region,
    map,
    tagline: region + ': отдельная экономика города.',
    economyType: 'local',
    startMoney: 1200,
    profileTitle: 'Житель города',
    profileText: name + ' открыт как отдельный городской модуль.',
    specialty: {
      label: 'Бонус',
      value: bonus,
      description: 'У города свои цены, работы и будущие события.'
    },
    jobs: [
      job('base', 'Подработка', 820, 'Базовый заработок для старта.'),
      job('service', 'Сервис', 900, 'Местная работа с ровной оплатой.'),
      job('special', region, 1040, 'Уникальная работа региона.')
    ],
    housing: {
      title: 'Стартовое жилье',
      minPrice: 1000,
      description: 'Базовое жилье в городе ' + name + '.',
      bonus: bonus
    }
  });
});

export function normalizeCityId(cityId) {
  return CITY_ID_ALIASES[cityId] || cityId || 'zaporizhzhia';
}

export function getCityConfig(cityId) {
  return cities[normalizeCityId(cityId)] || cities.zaporizhzhia;
}
