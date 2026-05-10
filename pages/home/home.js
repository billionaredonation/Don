import { register, show } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';
import './home-screen.js';

const V = '35';

function money(value) {
  return value.toLocaleString('ru-RU') + ' грн';
}

function renderMapPoint(id, label, x, y) {
  return `
    <button class="map-point map-point-${id}" type="button" data-point="${id}" style="--x:${x}%; --y:${y}%;">
      <span class="map-point-dot"></span>
      <span class="map-point-label">${label}</span>
    </button>
  `;
}

register('home', (root) => {
  root.className = 'page home';

  const normalizedCityId = normalizeCityId(state.city);
  const city = getCityConfig(normalizedCityId);

  if (state.city !== normalizedCityId) {
    state.city = normalizedCityId;
    save();
  }

  root.dataset.city = city.id;

  root.innerHTML = `
    <main class="home-gameplay">
      <section class="home-map-stage" aria-label="${city.name}">
        <img class="city-map-image" src="${city.map}?v=${V}" alt="${city.name}" />

        <div class="home-map-shade"></div>

        <div class="home-hud home-hud-top">
          <div class="home-city-title">
            <span>${city.region}</span>
            <strong>${city.name}</strong>
          </div>

          <div class="home-player-chip">
            <span>${state.nickname || 'Игрок'}</span>
          </div>
        </div>

        <div class="home-map-points">
          ${renderMapPoint('profile', 'Профиль', 22, 28)}
          ${renderMapPoint('work', 'Работа', 58, 38)}
          ${renderMapPoint('business', 'Бизнес', 72, 55)}
          ${renderMapPoint('home', 'Дом', 34, 66)}
          ${renderMapPoint('skills', 'Навыки', 48, 78)}
        </div>

        <aside class="home-city-panel" id="homeInfo" aria-live="polite">
          <div class="home-city-heading">
            <span>Карта города</span>
            <h3>${city.tagline}</h3>
          </div>

          <div class="home-detail-card">
            <b>${state.nickname || 'Игрок'} в городе ${city.name}</b>
            <p>Карта теперь основа игры. Все действия будут открываться через районы, точки и городские объекты.</p>
            <small>Стартовый капитал: ${money(city.startMoney)}</small>
          </div>
        </aside>
      </section>
    </main>
  `;

  const cityMapImage = root.querySelector('.city-map-image');

  cityMapImage.addEventListener('error', () => {
    cityMapImage.onerror = null;
    cityMapImage.src = './UkraineMap.png?v=' + V;
  });

  root.querySelector('.home-map-points').addEventListener('click', (event) => {
    const point = event.target.closest('.map-point');
    if (!point) return;

    const type = point.dataset.point;

    if (type === 'profile') showProfile(root, city);
    if (type === 'work') showWork(root, city);
    if (type === 'business') showBusiness(root, city);
    if (type === 'home') showHome(root, city);
    if (type === 'skills') showSkills(root, city);
  });
});

function showProfile(root, city) {
  setPanel(root, `
    <div class="home-city-heading">
      <span>Профиль</span>
      <h3>${state.nickname || 'Игрок'} / ${city.name}</h3>
    </div>
    <div class="home-detail-card">
      <b>${city.profileTitle}</b>
      <p>${city.profileText}</p>
      <small>Стартовый капитал: ${money(city.startMoney)}</small>
    </div>
  `);
}

function showWork(root, city) {
  setPanel(root, `
    <div class="home-city-heading">
      <span>Рабочий район</span>
      <h3>Заработок в городе</h3>
    </div>
    <div class="home-detail-card">
      <b>${city.jobs?.[0]?.title || 'Первая работа'}</b>
      <p>${city.jobs?.[0]?.description || 'Здесь будет стартовая работа персонажа.'}</p>
      <small>Доход: ${money(city.jobs?.[0]?.pay || 0)}</small>
    </div>
  `);
}

function showBusiness(root, city) {
  setPanel(root, `
    <div class="home-city-heading">
      <span>Бизнес-зона</span>
      <h3>Будущий капитал</h3>
    </div>
    <div class="home-detail-card">
      <b>${city.specialty?.value || 'Городская экономика'}</b>
      <p>${city.specialty?.description || 'Здесь будут бизнесы, оборот, апгрейды и городские активы.'}</p>
      <small>Тип экономики: ${city.economyType || 'городская'}</small>
    </div>
  `);
}

function showHome(root, city) {
  setPanel(root, `
    <div class="home-city-heading">
      <span>Жильё</span>
      <h3>${city.housing?.title || 'Дом игрока'}</h3>
    </div>
    <div class="home-detail-card">
      <b>От ${money(city.housing?.minPrice || 0)}</b>
      <p>${city.housing?.description || 'Здесь будет жильё, улучшения и личная база игрока.'}</p>
      <small>${city.housing?.bonus || 'Бонусы появятся позже'}</small>
    </div>
  `);
}

function showSkills(root, city) {
  setPanel(root, `
    <div class="home-city-heading">
      <span>Навыки</span>
      <h3>Прокачка персонажа</h3>
    </div>
    <div class="home-detail-card">
      <b>Навыки будут частью карты</b>
      <p>Прокачка будет открываться через городские действия: работа, бизнес, жильё и события.</p>
      <small>Текущий город: ${city.name}</small>
    </div>
  `);
}

function setPanel(root, html) {
  root.querySelector('#homeInfo').innerHTML = html;
}
