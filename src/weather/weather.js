import { supabase } from '../lib/supabaseClient.js';

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
    chance: 38,
    tempShift: 0,
  },
  {
    type: 'cloudy',
    label: 'Облачно',
    icon: '☁',
    chance: 26,
    tempShift: -2,
  },
  {
    type: 'rain',
    label: 'Дождь',
    icon: '🌧',
    chance: 22,
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

function normalizeWeatherRow(row) {
  return {
    cityId: row.city_id,
    type: row.weather_type,
    label: row.label,
    icon: row.icon,
    temperature: row.temperature,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function createWeather(cityId) {
  const selected = pickWeatherType();
  const baseTemp = getBaseTemperature(cityId);
  const randomShift = getRandomInt(-2, 2);
  const now = Date.now();

  return {
    city_id: cityId,
    weather_type: selected.type,
    label: selected.label,
    icon: selected.icon,
    temperature: baseTemp + selected.tempShift + randomShift,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + WEATHER_TTL).toISOString(),
  };
}

function isWeatherFresh(weather) {
  if (!weather?.expires_at) return false;
  return new Date(weather.expires_at).getTime() > Date.now();
}

function createFallbackWeather(cityId) {
  return normalizeWeatherRow(createWeather(cityId));
}

export async function getCityWeather(cityId) {
  const { data: currentWeather, error: selectError } = await supabase
    .from('city_weather')
    .select('*')
    .eq('city_id', cityId)
    .maybeSingle();

  if (!selectError && currentWeather && isWeatherFresh(currentWeather)) {
    return normalizeWeatherRow(currentWeather);
  }

  const nextWeather = createWeather(cityId);

  const { data: savedWeather, error: upsertError } = await supabase
    .from('city_weather')
    .upsert(nextWeather, {
      onConflict: 'city_id',
    })
    .select('*')
    .single();

  if (upsertError) {
    console.warn('[weather] Supabase weather upsert failed:', upsertError);
    return normalizeWeatherRow(nextWeather);
  }

  return normalizeWeatherRow(savedWeather);
}

export async function resetCityWeather(cityId) {
  const nextWeather = createWeather(cityId);

  const { data: savedWeather, error } = await supabase
    .from('city_weather')
    .upsert(nextWeather, {
      onConflict: 'city_id',
    })
    .select('*')
    .single();

  if (error) {
    console.warn('[weather] Supabase weather reset failed:', error);
    return createFallbackWeather(cityId);
  }

  return normalizeWeatherRow(savedWeather);
}
