import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';

const V = '60';

function getBasePath() {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

function normalizeAssetPath(path) {
  return String(path || '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/Don\//, '')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '');
}

function asset(path) {
  const clean = normalizeAssetPath(path);
  return `${getBasePath()}${clean}?v=${V}`;
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

  const mapSrc = asset(city.map || 'UkraineMap.png');

  root.innerHTML = `
    <main class="home-gameplay">
      <img
        class="city-map-image"
        src="${mapSrc}"
        alt="${city.name}"
      />
    </main>
  `;

  const img = root.querySelector('.city-map-image');

  img.onerror = () => {
    console.error('[MN] Карта города не загрузилась:', mapSrc, city);
    img.onerror = null;
    img.src = asset('UkraineMap.png');
  };
});
