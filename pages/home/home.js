import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';

const MAP_FILES = import.meta.glob('../../*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

function getMapByFileName(fileName) {
  const entry = Object.entries(MAP_FILES).find(([path]) => {
    return path.endsWith(`/${fileName}`);
  });

  return entry?.[1] || null;
}

function getCityMap(city) {
  const mapPath = String(city.map || '').replace(/^\.?\//, '');
  const mapFileName = mapPath.split('/').pop();

  return (
    getMapByFileName(mapFileName) ||
    getMapByFileName('UkraineMap.png')
  );
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

  const mapSrc = getCityMap(city);

  root.dataset.city = cityId;

root.innerHTML = `
  <main class="home-gameplay">
    <div class="home-map-island">
      <img
        class="city-map-image"
        src="${mapSrc}"
        alt="${city.name}"
        loading="eager"
        decoding="async"
      />
    </div>

    <div class="map-night"></div>
    <div class="map-light"></div>
  </main>
`;
