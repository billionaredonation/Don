import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';

const V = '45';
const BASE_PATH = import.meta.env.BASE_URL || './';

function cleanPath(path) {
  return String(path || '').replace(/^\.?\//, '');
}

function asset(path) {
  return `${BASE_PATH}${cleanPath(path)}?v=${V}`;
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function buildMapCandidates(city) {
  return unique([
    city.map,
    cleanPath(city.map),
    asset(city.map),

    `${city.id}.png`,
    asset(`${city.id}.png`),

    `${city.name}.png`,
    asset(`${city.name}.png`),

    'UkraineMap.png',
    asset('UkraineMap.png'),
  ]);
}

function loadImageFromCandidates(img, candidates, index = 0) {
  if (index >= candidates.length) {
    console.error('[MN] Карта не найдена. Проверенные пути:', candidates);
    img.removeAttribute('src');
    img.alt = 'Карта не найдена';
    return;
  }

  img.onerror = () => loadImageFromCandidates(img, candidates, index + 1);
  img.onload = () => {
    img.onerror = null;
    console.log('[MN] Карта загружена:', candidates[index]);
  };

  img.src = candidates[index];
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

  root.dataset.city = city.id;

  root.innerHTML = `
    <main class="home-gameplay">
      <img
        class="city-map-image"
        alt="${city.name}"
        loading="eager"
        decoding="async"
      />
    </main>
  `;

  const img = root.querySelector('.city-map-image');
  loadImageFromCandidates(img, buildMapCandidates(city));
});
