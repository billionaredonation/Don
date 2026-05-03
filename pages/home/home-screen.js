import { register, show } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';

const V = '34';

function money(value) {
  return value.toLocaleString('ru-RU') + ' грн';
}

function renderMenuButton(id, label, icon) {
  return `
    <button class="home-menu-btn ${id}-btn" id="${id}Btn" type="button">
      <span class="home-menu-icon">${icon}</span>
      <span>${label}</span>
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
      <div class="home-ocean" aria-hidden="true"></div>

      <section class="home-map-stage" aria-label="${city.name}">
        <img class="city-map-image" src="${city.map}?v=${V}" alt="${city.name}" />

        <div class="home-hud home-hud-top">
          <div class="home-city-title">
            <span>${city.region}</span>
            <strong>${city.name}</strong>
          </div>

          <button class="home-reset-btn" id="resetBtn" type="button">Сброс</button>
        </div>

        <nav class="home-main-menu" aria-label="Главное меню">
          ${renderMenuButton('profile', 'Профиль', 'П')}
          ${renderMenuButton('skills', 'Навыки', 'Н')}
          ${renderMenuButton('settings', 'Настройки', '⚙')}
        </nav>
      </section>

      <aside class="home-city-panel" id="homeInfo" aria-live="polite">
        <div class="home-city-heading">
          <span>Главное меню</span>
          <h3>${city.tagline}</h3>
        </div>

        <div class="home-detail-card">
          <b>${state.nickname || 'Игрок'} в городе ${city.name}</b>
          <p>Карта города теперь основа геймплея. Базовые кнопки остаются одинаковыми в каждом городе, а остальные действия добавим позже.</p>
          <small>Стартовый капитал: ${money(city.startMoney)}</small>
        </div>
      </aside>
    </main>
  `;

  const cityMapImage = root.querySelector('.city-map-image');

  cityMapImage.addEventListener('error', () => {
    cityMapImage.onerror = null;
    cityMapImage.src = './UkraineMap.png?v=' + V;
  });

  root.querySelector('#resetBtn').onclick = resetProgress;
  root.querySelector('#profileBtn').onclick = () => showProfile(root, city);
  root.querySelector('#skillsBtn').onclick = () => showSkills(root, city);
  root.querySelector('#settingsBtn').onclick = () => showSettings(root, city);
});

function showProfile(root, city) {
  setPanel(root, `
    <div class="home-city-heading">
      <span>Профиль</span>
      <h3>${state.nickname || 'Игрок'} в городе ${city.name}</h3>
    </div>
    <div class="home-detail-card">
      <b>${city.profileTitle}</b>
      <p>${city.profileText}</p>
      <small>Стартовый капитал: ${money(city.startMoney)}</small>
    </div>
  `);
}

function showSkills(root, city) {
  setPanel(root, `
    <div class="home-city-heading">
      <span>Навыки</span>
      <h3>Навыки персонажа</h3>
    </div>
    <div class="home-detail-card">
      <b>Система навыков будет здесь</b>
      <p>Кнопка уже закреплена в общем меню каждого города. Позже сюда можно добавить прокачку работы, бизнеса, транспорта и недвижимости.</p>
      <small>Текущий город: ${city.name}</small>
    </div>
  `);
}

function showSettings(root, city) {
  setPanel(root, `
    <div class="home-city-heading">
      <span>Настройки</span>
      <h3>${city.name}</h3>
    </div>
    <div class="home-detail-card">
      <b>Городской модуль</b>
      <p>Для каждого города используется своя карта и свой набор данных. Базовые кнопки меню остаются общими.</p>
      <small>Папка города: src/cities/${city.id}</small>
    </div>
  `);
}

function setPanel(root, html) {
  root.querySelector('#homeInfo').innerHTML = html;
}

function resetProgress() {
  localStorage.removeItem('mn-game-state');

  state.nickname = null;
  state.city = null;
  state.cityName = null;
  state.regionId = null;

  show('welcome1');
}

