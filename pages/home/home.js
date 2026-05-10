import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { normalizeCityId } from '../../src/cities/index.js';

const V = '40';

const BASE_PATH = import.meta.env.BASE_URL || './';

function rootAsset(fileName) {
  return `${BASE_PATH}${fileName}?v=${V}`;
}

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

register('home', (root) => {
  root.className = 'page home';

  const cityId = normalizeCityId(state.city);

  if (state.city !== cityId) {
    state.city = cityId;
    save();
  }

  const mapFile = CITY_MAPS[cityId] || 'UkraineMap.png';

  root.dataset.city = cityId;

  root.innerHTML = `
    <main class="home-gameplay">
      <img
        class="city-map-image"
        src="${rootAsset(mapFile)}"
        alt="${cityId}"
        loading="eager"
        decoding="async"
      />
    </main>
  `;

  const image = root.querySelector('.city-map-image');

  image.addEventListener('error', () => {
    image.onerror = null;
    image.src = rootAsset('UkraineMap.png');
  });
});
