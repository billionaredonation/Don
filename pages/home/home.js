import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';

const MAP_FILES = import.meta.glob('../../*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

const CITY_MAPS = {
  vinnytsia: 'VinitsaMap.png',
  lutsk: 'LutskMap.png',
  luhansk: 'LuganskMap.png',
  dnipro: 'DneprMap.png',
  donetsk: 'DonetskMap.png',
  zhytomyr: 'ZutomyrMap.png',
  uzhhorod: 'UzgorodMap.png',
  zaporizhzhia: 'Zaporozya.png',
  'ivano-frankivsk': 'IvanoFrankovsk.png',
  kyiv: 'KiyvMap.png',
  kropyvnytskyi: 'Kropivnitskyi.png',
  crimea: 'KrymMap.png',
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
  cherkasy: 'CherkasyMap.png',
  chernihiv: 'ChernigovMap.png',
  chernivtsi: 'ChernivtsiMap.png',
};

function getMapByFileName(fileName) {
  const entry = Object.entries(MAP_FILES).find(([path]) => {
    return path.endsWith(`/${fileName}`);
  });

  return entry?.[1] || null;
}

function getCityMap(cityId) {
  const fileName = CITY_MAPS[cityId];
  const cityMap = getMapByFileName(fileName);

  if (cityMap) return cityMap;

  const fallback = getMapByFileName('UkraineMap.png');

  console.error('[MN] Карта города не найдена:', {
    cityId,
    fileName,
    availableMaps: Object.keys(MAP_FILES),
  });

  return fallback;
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

  const mapSrc = getCityMap(cityId);

  root.dataset.city = cityId;

  root.innerHTML = `
    <main class="home-gameplay">
      <img
        class="city-map-image"
        src="${mapSrc}"
        alt="${city.name}"
        loading="eager"
        decoding="async"
      />
    </main>
  `;
});
