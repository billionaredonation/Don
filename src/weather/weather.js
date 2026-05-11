const WEATHER_STORAGE_KEY = 'mn_city_weather_v1';
const WEATHER_TTL = 45 * 60 * 1000;

const CITY_BASE_TEMPERATURE = {
  kyiv: 18,
  zaporizhzhia: 22,
  odesa: 23,
  kharkiv: 19,
  dnipro: 21,
  lviv: 16,
  donetsk: 21,
  luhansk: 22,
  mykolaiv: 23,
  poltava: 19,
  sumy: 17,
  chernihiv: 16,
  cherkasy: 19,
  kherson: 24,
  vinnytsia: 18,
  zhytomyr: 17,
  rivne: 16,
  lutsk: 16,
  ternopil: 16,
  khmelnytskyi: 17,
  chernivtsi: 17,
  'ivano-frankivsk': 16,
  uzhhorod: 19,
  kropyvnytskyi: 20,
  crimea: 25,
};

const WEATHER_TYPES = [
  {
    type: 'clear',
    label: 'Ясно',
    icon: '☀',
    chance: 42,
    tempShift: 0,
  },
  {
    type: 'cloudy',
    label: 'Облачно',
    icon: '☁',
    chance: 24,
    tempShift: -2,
  },
  {
    type: 'rain',
    label: 'Дождь',
    icon: '🌧',
    chance: 20,
    tempShift: -5,
  },
  {
    type: 'hot',
    label: 'Жара',
    icon: '🔥',
    chance: 14,
    tempShift: 8,
  },
];

function getStoredWeather() {
  try {
    return JSON.parse(localStorage.getItem(WEATHER_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveStoredWeather(data) {
  localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(data));
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickWeatherType() {
  const totalChance = WEATHER_TYPES.reduce((sum, item) => sum + item.chance, 0);
  let roll = Math.random() * totalChance;

  for (const item of WEATHER_TYPES) {
    roll -= item.chance;

    if (roll <= 0) {
      return item;
    }
  }

  return WEATHER_TYPES[0];
}

function getBaseTemperature(cityId) {
  return CITY_BASE_TEMPERATURE[cityId] ?? 18;
}

function createWeather(cityId) {
  const selected = pickWeatherType();
  const baseTemp = getBaseTemperature(cityId);
  const randomShift = getRandomInt(-2, 2);

  const temperature = baseTemp + selected.tempShift + randomShift;

  return {
    cityId,
    type: selected.type,
    label: selected.label,
    icon: selected.icon,
    temperature,
    createdAt: Date.now(),
    expiresAt: Date.now() + WEATHER_TTL,
  };
}

export function getCityWeather(cityId) {
  const stored = getStoredWeather();
  const current = stored[cityId];

  if (current && current.expiresAt && Date.now() < current.expiresAt) {
    return current;
  }

  const next = createWeather(cityId);

  stored[cityId] = next;
  saveStoredWeather(stored);

  return next;
}

export function resetCityWeather(cityId) {
  const stored = getStoredWeather();
  delete stored[cityId];
  saveStoredWeather(stored);
  return getCityWeather(cityId);
}
