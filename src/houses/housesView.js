import {
  createHouseDetailsController,
  renderHouseDetailsModal,
} from './houseDetailsView.js';

function formatMoney(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) {
    return '0 ₴';
  }

  return `${number.toLocaleString('ru-RU')} ₴`;
}

function formatPercent(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return '0%';
  }

  return `${Math.max(0, Math.round(number))}%`;
}

function formatNumber(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return '0';
  }

  return number.toLocaleString('ru-RU');
}

function getCityStatValue(cityStats, key, fallback = 0) {
  const value = cityStats?.[key];

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return value;
}

function getSectionButtons(houses) {
  return [
    {
      id: 'city',
      icon: '📊',
      title: 'Статистика',
      text: 'Экономика города',
      count: 'LIVE',
    },
    {
      id: 'houses',
      icon: '🏠',
      title: 'Дома',
      text: 'Недвижимость',
      count: houses.housesTotal,
    },
    {
      id: 'businesses',
      icon: '💵',
      title: 'Бизнесы',
      text: 'Скоро',
      count: 0,
      disabled: true,
    },
    {
      id: 'jobs',
      icon: '🤝',
      title: 'Работы',
      text: 'Скоро',
      count: 0,
      disabled: true,
    },
  ];
}

function renderCityStatCards({
  budget,
  inflation,
  registeredPlayers,
  taxBurned,
}) {
  return `
    <div class="city-stat-grid">
      <article class="city-stat-card city-stat-card-budget">
        <span class="city-stat-icon">💰</span>

        <div class="city-stat-body">
          <small>Бюджет</small>
          <strong>${formatMoney(budget)}</strong>
          <em>Баланс города</em>
        </div>
      </article>

      <article class="city-stat-card city-stat-card-tax">
        <span class="city-stat-icon">🔥</span>

        <div class="city-stat-body">
          <small>Налог 20%</small>
          <strong>${formatMoney(taxBurned)}</strong>
          <em>Выведено из игры</em>
        </div>
      </article>

      <article class="city-stat-card city-stat-card-inflation">
        <span class="city-stat-icon">📈</span>

        <div class="city-stat-body">
          <small>Инфляция</small>
          <strong>${formatPercent(inflation)}</strong>
          <em>Игровой индекс</em>
        </div>
      </article>

      <article class="city-stat-card city-stat-card-players">
        <span class="city-stat-icon">👥</span>

        <div class="city-stat-body">
          <small>Игроки</small>
          <strong>${formatNumber(registeredPlayers)}</strong>
          <em>В этом городе</em>
        </div>
      </article>
    </div>
  `;
}

function renderHousesSummaryCards(houses) {
  return `
    <div class="city-stat-grid houses-summary-grid">
      <article class="city-stat-card city-stat-card-total">
        <span class="city-stat-icon">🏘️</span>

        <div class="city-stat-body">
          <small>Всего домов</small>
          <strong>${formatNumber(houses.housesTotal)}</strong>
          <em>Всего объектов</em>
        </div>
      </article>

      <article class="city-stat-card city-stat-card-free">
        <span class="city-stat-icon">✅</span>

        <div class="city-stat-body">
          <small>Свободных</small>
          <strong>${formatNumber(houses.housesFree)}</strong>
          <em>Доступно к покупке</em>
        </div>
      </article>

      <article class="city-stat-card city-stat-card-owned">
        <span class="city-stat-icon">🔒</span>

        <div class="city-stat-body">
          <small>Купленных</small>
          <strong>${formatNumber(houses.housesOwned)}</strong>
          <em>Занято игроками</em>
        </div>
      </article>
    </div>
  `;
}

export function renderHousesFeatureHtml({ city, houses, cityStats = {} }) {
  const budget = getCityStatValue(cityStats, 'budget', 0);
  const inflation = getCityStatValue(cityStats, 'inflation', 0);
  const registeredPlayers = getCityStatValue(cityStats, 'registeredPlayers', 0);
  const taxBurned = getCityStatValue(cityStats, 'taxBurned', 0);

  return `
    <div class="houses-modal" hidden aria-hidden="true" data-houses-modal>
      <div class="houses-modal-backdrop" data-houses-stats-close></div>

      <section class="houses-panel" role="dialog" aria-modal="true" aria-label="${city.name} — город">
        <header class="houses-header houses-header-clean">
          <div class="houses-title-wrap">
            <span class="houses-title-icon">🏙️</span>

            <div class="houses-title-text">
              <h2>${city.name}</h2>
              <p>Городская статистика, недвижимость, бизнесы и работы</p>
            </div>
          </div>
        </header>

        <nav class="houses-section-cards houses-section-tabs" aria-label="Разделы города">
          ${getSectionButtons(houses)
            .map((section) => `
              <button
                type="button"
                class="houses-section-card ${section.id === 'city' ? 'is-active' : ''} ${section.disabled ? 'is-disabled' : ''}"
                data-houses-section-tab="${section.id}"
                ${section.disabled ? 'aria-disabled="true"' : ''}
              >
                <span class="houses-section-card-icon">${section.icon}</span>

                <span class="houses-section-card-text">
                  <strong>${section.title}</strong>
                  <small>${section.text}</small>
                </span>

                <b>${section.count}</b>
              </button>
            `)
            .join('')}
        </nav>

        <div class="houses-section-content is-active" data-houses-section-content="city">
          ${renderCityStatCards({
            budget,
            inflation,
            registeredPlayers,
            taxBurned,
          })}
        </div>

        <div class="houses-section-content" data-houses-section-content="houses" hidden>
          ${renderHousesSummaryCards(houses)}

          <p class="houses-section-note">
            Покупка работает через иконки домов на карте: подойди к дому и нажми на него.
          </p>
        </div>

        <div class="houses-section-content" data-houses-section-content="businesses" hidden>
          <div class="houses-placeholder-section">
            <span>💵</span>
            <strong>Бизнесы</strong>
            <p>Раздел подготовлен под будущие доходные объекты. Сейчас активных бизнесов: <b>0</b>.</p>
          </div>
        </div>

        <div class="houses-section-content" data-houses-section-content="jobs" hidden>
          <div class="houses-placeholder-section">
            <span>🤝</span>
            <strong>Работы</strong>
            <p>Раздел подготовлен под будущие работы. Сейчас активных работ: <b>0</b>.</p>
          </div>
        </div>

        ${renderHouseDetailsModal()}

        <footer class="houses-footer houses-footer-clean">
          <button class="houses-close-button" type="button" data-houses-stats-close>
            Закрыть
          </button>
        </footer>
      </section>
    </div>
  `;
}

export function enableHousesStatsModal(root, { onBuyHouse } = {}) {
  let modal = root.querySelector('[data-houses-modal]') || root.querySelector('.houses-modal');

  if (modal && modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  const openButton = root.querySelector('.player-city-button');
  const sectionTabs = Array.from(modal?.querySelectorAll('[data-houses-section-tab]') || []);
  const sectionContents = Array.from(modal?.querySelectorAll('[data-houses-section-content]') || []);

  const detailsController = createHouseDetailsController(modal || root, {
    onBuy: onBuyHouse,
  });

  let activeSection = 'city';

  function setActiveSection(sectionId = 'city') {
    activeSection = sectionId;

    sectionTabs.forEach((button) => {
      const isActive = button.dataset.housesSectionTab === sectionId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    sectionContents.forEach((content) => {
      const isActive = content.dataset.housesSectionContent === sectionId;
      content.hidden = !isActive;
      content.classList.toggle('is-active', isActive);
    });
  }

  function open(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (!modal) return;

    detailsController.close();

    modal.hidden = false;
    modal.removeAttribute('aria-hidden');

    root.dataset.housesStatsOpen = 'true';

    document.body.classList.add('mn-houses-modal-open');
    document.body.classList.remove('mn-house-details-open');

    setActiveSection(activeSection || 'city');

    window.dispatchEvent(new CustomEvent('mn:houses-list-opened'));
  }

  function close(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (!modal) return;

    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');

    delete root.dataset.housesStatsOpen;

    detailsController.close();

    document.body.classList.remove('mn-houses-modal-open');
    document.body.classList.remove('mn-house-details-open');

    window.dispatchEvent(new CustomEvent('mn:houses-list-closed'));
  }

  function handleSectionClick(event) {
    const button = event.target?.closest?.('[data-houses-section-tab]');
    if (!button || !modal?.contains(button)) return;

    event.preventDefault();
    event.stopPropagation();

    if (button.classList.contains('is-disabled') || button.disabled) {
      return;
    }

    setActiveSection(button.dataset.housesSectionTab || 'city');
  }

  function handleGlobalHouseAction(event) {
    const house = event.detail?.house;
    if (!house) return;

    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      delete root.dataset.housesStatsOpen;
    }

    document
      .querySelectorAll('.house-selection-panel')
      .forEach((panel) => {
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
      });

    document.body.classList.remove('mn-houses-modal-open');
    document.body.classList.add('mn-house-details-open');

    detailsController.open(house);
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape') return;

    close(event);
  }

  function handleDocumentClose(event) {
    const closeTarget = event.target?.closest?.('[data-houses-stats-close]');
    if (!closeTarget) return;
    if (!modal?.contains(closeTarget)) return;

    close(event);
  }

  function handleOpenButton(event) {
    open(event);
  }

  openButton?.addEventListener('click', handleOpenButton);
  openButton?.addEventListener('pointerup', handleOpenButton);

  modal?.addEventListener('click', handleSectionClick);

  document.addEventListener('click', handleDocumentClose, true);
  document.addEventListener('pointerup', handleDocumentClose, true);
  document.addEventListener('touchend', handleDocumentClose, true);

  window.addEventListener('mn:house-action', handleGlobalHouseAction);
  document.addEventListener('keydown', handleKeydown);

  setActiveSection('city');

  return () => {
    close();

    openButton?.removeEventListener('click', handleOpenButton);
    openButton?.removeEventListener('pointerup', handleOpenButton);

    modal?.removeEventListener('click', handleSectionClick);

    document.removeEventListener('click', handleDocumentClose, true);
    document.removeEventListener('pointerup', handleDocumentClose, true);
    document.removeEventListener('touchend', handleDocumentClose, true);

    window.removeEventListener('mn:house-action', handleGlobalHouseAction);
    document.removeEventListener('keydown', handleKeydown);

    detailsController.cleanup();

    modal?.remove();
    modal = null;
  };
}
