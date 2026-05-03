import { register, show } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';
const V = '33';
import './home-screen.js';


function money(value) {
  return value.toLocaleString('ru-RU') + ' ₴';
}

function renderJobs(city) {
  return city.jobs.map((job) => `
    <button class="home-job" type="button" data-job-id="${job.id}">
      <span>
        <b>${job.title}</b>
        <small>${job.description}</small>
      </span>
      <strong>${money(job.pay)}</strong>
    </button>
  `).join('');
}

function renderFeature(city) {
  return `
    <div class="home-feature">
      <span>${city.specialty.label}</span>
      <strong>${city.specialty.value}</strong>
      <p>${city.specialty.description}</p>
    </div>
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

  root.innerHTML = `
    <div class="home-top">
      <div>
        <h2>${city.name}</h2>
        <p>Добро пожаловать, ${state.nickname || 'игрок'}.</p>
      </div>

      <button class="home-reset-btn" id="resetBtn" type="button">Сбросить</button>
    </div>

    <div class="city-map-shell">
      <img class="city-map-image" src="${city.map}?v=${V}" alt="${city.name}" />

      <button class="map-icon profile-icon" id="profileBtn" type="button">
        <span class="map-icon-emoji">П</span>
        <span class="map-icon-label">Профиль</span>
      </button>

      <button class="map-icon jobs-icon" id="jobsBtn" type="button">
        <span class="map-icon-emoji">Р</span>
        <span class="map-icon-label">Работы</span>
      </button>

      <button class="map-icon house-icon" id="houseBtn" type="button">
        <span class="map-icon-emoji">Д</span>
        <span class="map-icon-label">Дома</span>
      </button>

      <button class="map-icon settings-icon" id="settingsBtn" type="button">
        <span class="map-icon-emoji">Н</span>
        <span class="map-icon-label">Настройки</span>
      </button>
    </div>

    <section class="home-city-panel" id="homeInfo">
      <div class="home-city-heading">
        <span>${city.region}</span>
        <h3>${city.tagline}</h3>
      </div>

      ${renderFeature(city)}

      <div class="home-jobs-list">
        ${renderJobs(city)}
      </div>
    </section>
  `;

  const cityMapImage = root.querySelector('.city-map-image');

  cityMapImage.addEventListener('error', () => {
    cityMapImage.onerror = null;
    cityMapImage.src = './UkraineMap.png?v=' + V;
  });

  root.querySelector('#resetBtn').onclick = resetProgress;
  root.querySelector('#profileBtn').onclick = () => showProfile(root, city);
  root.querySelector('#jobsBtn').onclick = () => showJobs(root, city);
  root.querySelector('#houseBtn').onclick = () => showHousing(root, city);
  root.querySelector('#settingsBtn').onclick = () => showSettings(root, city);

  root.querySelector('#homeInfo').addEventListener('click', (event) => {
    const button = event.target.closest('.home-job');

    if (!button) return;

    const job = city.jobs.find((item) => item.id === button.dataset.jobId);

    if (job) {
      showJob(root, city, job);
    }
  });
});

function showJob(root, city, job) {
  setPanel(root, `
    <div class="home-city-heading">
      <span>Работа</span>
      <h3>${job.title}</h3>
    </div>
    <div class="home-detail-card">
      <b>${money(job.pay)} за смену</b>
      <p>${job.description}</p>
      <small>Бонус города: ${city.specialty.value}</small>
    </div>
  `);
}

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

function showJobs(root, city) {
  setPanel(root, `
    <div class="home-city-heading">
      <span>Работы города</span>
      <h3>${city.name}: ${city.jobs.length} варианта заработка</h3>
    </div>
    <div class="home-jobs-list">
      ${renderJobs(city)}
    </div>
  `);
}

function showHousing(root, city) {
  setPanel(root, `
    <div class="home-city-heading">
      <span>Недвижимость</span>
      <h3>${city.housing.title}</h3>
    </div>
    <div class="home-detail-card">
      <b>От ${money(city.housing.minPrice)}</b>
      <p>${city.housing.description}</p>
      <small>${city.housing.bonus}</small>
    </div>
  `);
}

function showSettings(root, city) {
  setPanel(root, `
    <div class="home-city-heading">
      <span>Городской модуль</span>
      <h3>${city.name}</h3>
    </div>
    <div class="home-detail-card">
      <b>Папка: src/cities/${city.id}</b>
      <p>В этой папке теперь лежит отдельный конфиг города. Дальше сюда можно добавлять свои магазины, работы, события, цены и правила.</p>
      <small>Текущий тип экономики: ${city.economyType}</small>
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
