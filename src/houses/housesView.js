import { renderHouseList } from './houseListView.js';
import {
  createHouseDetailsController,
  renderHouseDetailsModal,
} from './houseDetailsView.js';

const FILTER_LABELS = {
  all: 'Все дома',
  free: 'Свободные',
  owned: 'Купленные',
};

function getValidFilter(value) {
  return Object.hasOwn(FILTER_LABELS, value) ? value : 'all';
}

export function renderHousesFeatureHtml({ city, houses }) {
  return `
    <div class="houses-modal" hidden>
      <div class="houses-modal-backdrop" data-houses-stats-close></div>

      <section class="houses-panel" role="dialog" aria-modal="true" aria-label="${city.name} — недвижимость">
        <header class="houses-header">
          <div class="houses-title-wrap">
            <span class="houses-title-icon">🏢</span>

            <div class="houses-title-text">
              <h2>${city.name} — <span>недвижимость</span></h2>
              <p>Дома, свободные объекты и купленная недвижимость</p>
            </div>
          </div>

          <button class="houses-x-button" type="button" data-houses-stats-close aria-label="Закрыть">
            ×
          </button>
        </header>

        <div class="houses-stats-grid">
          <article class="houses-stat-card houses-stat-purple">
            <span class="houses-stat-icon">🏠</span>
            <div class="houses-stat-main">
              <em>Дома</em>
              <strong>${houses.housesTotal}</strong>
              <small>Всего объектов</small>
            </div>
            <div class="houses-progress">
              <i style="width:100%"></i>
              <b>${houses.housesTotal}</b>
            </div>
          </article>

          <article class="houses-stat-card houses-stat-green">
            <span class="houses-stat-icon">✅</span>
            <div class="houses-stat-main">
              <em>Свободно</em>
              <strong>${houses.housesFree}</strong>
              <small>Можно купить</small>
            </div>
            <div class="houses-progress">
              <i style="width:${houses.housesFreePercent}%"></i>
              <b>${houses.housesFreePercent}%</b>
            </div>
          </article>

          <article class="houses-stat-card houses-stat-orange">
            <span class="houses-stat-icon">🔒</span>
            <div class="houses-stat-main">
              <em>Куплено</em>
              <strong>${houses.housesOwned}</strong>
              <small>Уже занято</small>
            </div>
            <div class="houses-progress">
              <i style="width:${houses.housesOwnedPercent}%"></i>
              <b>${houses.housesOwnedPercent}%</b>
            </div>
          </article>
        </div>

        <section class="houses-list-section">
          <div class="houses-list-header">
            <h3>⌂ Список домов</h3>

            <div class="houses-filter">
              <button type="button" class="houses-filter-button" data-houses-filter-button>
                <span data-houses-filter-label>${FILTER_LABELS.all}</span>
                <b>⌄</b>
              </button>

              <div class="houses-filter-menu" hidden data-houses-filter-menu>
                <button type="button" data-houses-filter="all">Все дома</button>
                <button type="button" data-houses-filter="free">Свободные</button>
                <button type="button" data-houses-filter="owned">Купленные</button>
              </div>
            </div>
          </div>

          ${renderHouseList(houses.houses)}
        </section>

        ${renderHouseDetailsModal()}

        <footer class="houses-footer">
          <span>ⓘ Покупка происходит у государства</span>
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

  const filterButton = modal?.querySelector('[data-houses-filter-button]');
  const filterMenu = modal?.querySelector('[data-houses-filter-menu]');
  const filterLabel = modal?.querySelector('[data-houses-filter-label]');
  const houseItems = Array.from(modal?.querySelectorAll('[data-house-state]') || []);
  const filterEmpty = modal?.querySelector('[data-house-filter-empty]');

  const housesById = new Map();

  houseItems.forEach((item) => {
    housesById.set(String(item.dataset.houseId), item);
  });

  const detailsController = createHouseDetailsController(modal, {
    onBuy: onBuyHouse,
  });


  function handleGlobalHouseAction(event) {
    const house = event.detail?.house;
    if (!house) return;

    // ВАЖНО:
    // не открываем большую модалку списка домов.
    // Клик по дому на карте открывает только detail-модалку.
    detailsController.open(house);
  }

  
  let activeFilter = 'all';

  function setFilterMenuOpen(nextOpen) {
    if (!filterMenu || !filterButton) return;

    filterMenu.hidden = !nextOpen;
    filterButton.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  }

  function applyFilter(nextFilter = 'all') {
    const filter = getValidFilter(nextFilter);
    activeFilter = filter;

    let visibleCount = 0;

    houseItems.forEach((item) => {
      const isVisible = filter === 'all' || item.dataset.houseState === filter;
      item.hidden = !isVisible;
      if (isVisible) visibleCount += 1;
    });

    if (filterLabel) {
      filterLabel.textContent = FILTER_LABELS[filter];
    }

    if (filterEmpty) {
      filterEmpty.hidden = visibleCount > 0;
    }

    setFilterMenuOpen(false);
  }

  function open(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (!modal) return;

    modal.hidden = false;
    root.dataset.housesStatsOpen = 'true';
    document.body.classList.add('mn-houses-modal-open');

    applyFilter(activeFilter);
  }

  function close(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (!modal) return;

    modal.hidden = true;
    delete root.dataset.housesStatsOpen;
    document.body.classList.remove('mn-houses-modal-open');

    setFilterMenuOpen(false);
    detailsController.close();
  }

  function toggleFilterMenu(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!filterMenu) return;

    setFilterMenuOpen(filterMenu.hidden);
  }

  function handleFilterMenuClick(event) {
    const button = event.target.closest('[data-houses-filter]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    applyFilter(button.dataset.housesFilter);
  }

  function handleHouseClick(event) {
    const item = event.target.closest('[data-house-id]');
    if (!item) return;

    event.preventDefault();
    event.stopPropagation();

    const houseId = String(item.dataset.houseId);
    const house = window.__MN_HOUSES__?.get(houseId);

    if (!house) return;

    detailsController.open(house);
  }

  function handleOutsideClick(event) {
    if (!filterMenu || filterMenu.hidden) return;
    if (event.target.closest('.houses-filter')) return;

    setFilterMenuOpen(false);
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      close(event);
    }
  }

  window.__MN_HOUSES__ = window.__MN_HOUSES__ || new Map();

  houseItems.forEach((item) => {
    const houseId = String(item.dataset.houseId);
    const houseElement = item;

    const house = {
      id: houseId,
      name: houseElement.querySelector('.house-card-title-row b')?.textContent || 'Дом',
      icon: houseElement.querySelector('.house-card-icon')?.textContent || '🏠',
      payload: {
        price: Number(
          houseElement
            .querySelector('.house-price')
            ?.textContent
            ?.replace(/\D/g, '') || 0
        ),
        ownerId: item.dataset.houseState === 'owned' ? 'player' : '',
      },
    };

    window.__MN_HOUSES__.set(houseId, house);
  });

  openButton?.addEventListener('click', open);
  window.addEventListener('mn:house-action', handleGlobalHouseAction);
  filterButton?.addEventListener('click', toggleFilterMenu);
  filterMenu?.addEventListener('click', handleFilterMenuClick);
  modal?.addEventListener('click', handleHouseClick);
  document.addEventListener('click', handleOutsideClick);
  document.addEventListener('keydown', handleKeydown);

  closeButtons.forEach((button) => {
    button.addEventListener('click', close);
  });

  applyFilter('all');

  return () => {
    close();

    openButton?.removeEventListener('click', open);
    filterButton?.removeEventListener('click', toggleFilterMenu);
    filterMenu?.removeEventListener('click', handleFilterMenuClick);
    modal?.removeEventListener('click', handleHouseClick);
    document.removeEventListener('click', handleOutsideClick);
    document.removeEventListener('keydown', handleKeydown);

    closeButtons.forEach((button) => {
      button.removeEventListener('click', close);
    });

    detailsController.cleanup();
    window.removeEventListener('mn:house-action', handleGlobalHouseAction);
    modal?.remove();
    modal = null;
  };
}
