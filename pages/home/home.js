import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';

const V = '50';

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

function getBasePath() {
  const path = window.location.pathname;

  if (path.includes('/Don/')) return '/Don/';
  return './';
}

function asset(fileName) {
  return `${getBasePath()}${fileName}?v=${V}`;
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

  const mapFile = CITY_MAPS[cityId] || 'UkraineMap.png';

  root.innerHTML = `
    <main class="home-gameplay">
      <img
        class="city-map-image"
        src="${asset(mapFile)}"
        alt="${city.name}"
      />
    </main>
  `;

  const img = root.querySelector('.city-map-image');

  img.onerror = () => {
    img.onerror = null;
    img.src = asset('UkraineMap.png');
  };
});
