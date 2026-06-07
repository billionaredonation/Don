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

export function renderHousesFeatureHtml({ city, houses, cityStats = {} }) {
  const budget = getCityStatValue(cityStats, 'budget', 0);
  const inflation = getCityStatValue(cityStats, 'inflation', 0);
  const registeredPlayers = getCityStatValue(cityStats, 'registeredPlayers', 0);
  const onlinePlayers = getCityStatValue(cityStats, 'onlinePlayers', 0);

  return `
    <div class="houses-modal" hidden aria-hidden="true">
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
          <div class="houses-mini-stats-grid houses-city-stats-grid">
            <article class="houses-mini-stat houses-mini-stat-purple">
              <span>Бюджет города</span>
              <strong>${formatMoney(budget)}</strong>
              <small>Баланс городской экономики</small>
            </article>

            <article class="houses-mini-stat houses-mini-stat-orange">
              <span>Инфляция</span>
              <strong>${formatPercent(inflation)}</strong>
              <small>Текущий игровой показатель</small>
            </article>

            <article class="houses-mini-stat houses-mini-stat-green">
              <span>Игроков зарегистрировано</span>
              <strong>${Number(registeredPlayers || 0).toLocaleString('ru-RU')}</strong>
              <small>Всего в этом городе</small>
            </article>

            <article class="houses-mini-stat">
              <span>Сейчас онлайн</span>
              <strong>${Number(onlinePlayers || 0).toLocaleString('ru-RU')}</strong>
              <small>Активные игроки города</small>
            </article>
          </div>
        </div>

        <div class="houses-section-content" data-houses-section-content="houses" hidden>
          <div class="houses-mini-stats-grid">
            <article class="houses-mini-stat houses-mini-stat-purple">
              <span>Всего домов</span>
              <strong>${houses.housesTotal}</strong>
              <small>Общее количество объектов</small>
            </article>

            <article class="houses-mini-stat houses-mini-stat-green">
              <span>Свободных</span>
              <strong>${houses.housesFree}</strong>
              <small>Можно купить на карте</small>
            </article>

            <article class="houses-mini-stat houses-mini-stat-orange">
              <span>Купленных</span>
              <strong>${houses.housesOwned}</strong>
              <small>Уже заняты игроками</small>
            </article>
          </div>

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
  let modal = root.querySelector('.houses-modal');

  if (modal && modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  const openButton = root.querySelector('.player-city-button');
  const closeButtons = modal?.querySelectorAll('[data-houses-stats-close]') || [];
  const sectionTabs = Array.from(modal?.querySelectorAll('[data-houses-section-tab]') || []);
  const sectionContents = Array.from(modal?.querySelectorAll('[data-houses-section-content]') || []);

  const detailsController = createHouseDetailsController(modal, {
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
    const button = event.target.closest('[data-houses-section-tab]');
    if (!button) return;

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

    detailsController.open(house);
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      close(event);
    }
  }

  openButton?.addEventListener('click', open);
  modal?.addEventListener('click', handleSectionClick);
  window.addEventListener('mn:house-action', handleGlobalHouseAction);
  document.addEventListener('keydown', handleKeydown);

  closeButtons.forEach((button) => {
    button.addEventListener('click', close);
    button.addEventListener('pointerup', close);
  });

  setActiveSection('city');

  return () => {
    close();

    openButton?.removeEventListener('click', open);
    modal?.removeEventListener('click', handleSectionClick);
    window.removeEventListener('mn:house-action', handleGlobalHouseAction);
    document.removeEventListener('keydown', handleKeydown);

    closeButtons.forEach((button) => {
      button.removeEventListener('click', close);
      button.removeEventListener('pointerup', close);
    });

    detailsController.cleanup();
    modal?.remove();
    modal = null;
  };
}
