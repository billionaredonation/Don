import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';

const V = '36';

function money(value) {
  return Number(value || 0).toLocaleString('ru-RU') + ' грн';
}

function getSafeCity() {
  const normalizedCityId = normalizeCityId(state.city);
  const city = getCityConfig(normalizedCityId);

  if (state.city !== normalizedCityId) {
    state.city = normalizedCityId;
    state.cityName = city.name;
    save();
  }

  return city;
}

register('home', (root) => {
  root.className = 'page home';

  const city = getSafeCity();

  root.dataset.city = city.id;

  root.innerHTML = `
    <main class="home-gameplay">
      <section class="home-map-stage" aria-label="${city.name}">
        <img
          class="city-map-image"
          src="${city.map}?v=${V}"
          alt="${city.name}"
          loading="eager"
          decoding="async"
        />

        <div class="home-map-overlay"></div>

        <header class="home-hud home-hud-top">
          <div class="home-city-title">
            <span>${city.region || 'Городской регион'}</span>
            <strong>${city.name}</strong>
          </div>

          <div class="home-player-name">
            ${state.nickname || 'Игрок'}
          </div>
        </header>

        <section class="home-map-info">
          <span>Карта города</span>
          <h1>${city.name}</h1>
          <p>${city.tagline || 'Город открыт для развития.'}</p>
        </section>

        <section class="home-bottom-panel">
          <div class="home-detail-card">
            <b>${city.specialty?.value || 'Городская экономика'}</b>
            <p>${city.specialty?.description || 'Здесь будет основная механика города: районы, работа, бизнес, жильё и события.'}</p>
            <small>Стартовый капитал: ${money(city.startMoney)}</small>
          </div>
        </section>
      </section>
    </main>
  `;

  const cityMapImage = root.querySelector('.city-map-image');

  cityMapImage.addEventListener('error', () => {
    cityMapImage.onerror = null;
    cityMapImage.src = './UkraineMap.png?v=' + V;
  });
});
