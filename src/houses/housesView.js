import { renderHouseList } from './houseListView.js';

export function renderHousesFeatureHtml({ city, houses }) {
  return `
    <div class="houses-modal" hidden>
      <div class="houses-modal-backdrop" data-houses-stats-close></div>

      <section class="houses-panel" role="dialog" aria-modal="true" aria-label="${city.name} — недвижимость">
        <header class="houses-header">
          <div class="houses-title-wrap">
            <span class="houses-title-icon">🏢</span>

            <div>
              <h2>${city.name} — <span>недвижимость</span></h2>
              <p>Дома, бизнесы и свободные слоты города</p>
            </div>
          </div>

          <button class="houses-x-button" type="button" data-houses-stats-close>×</button>
        </header>

        <div class="houses-stats-grid">
          <article class="houses-stat-card houses-stat-purple">
            <span class="houses-stat-icon">🏠</span>

            <div class="houses-stat-main">
              <em>Дома</em>
              <strong>${houses.housesTotal}</strong>
              <small>Свободно: ${houses.housesFree}</small>
            </div>

            <div class="houses-progress">
              <i style="width:${houses.housesFreePercent}%"></i>
              <b>${houses.housesFreePercent}%</b>
            </div>
          </article>

          <article class="houses-stat-card houses-stat-green">
            <span class="houses-stat-icon">🏪</span>

            <div class="houses-stat-main">
              <em>Бизнесы</em>
              <strong>${houses.businessTotal}</strong>
              <small>Свободно: ${houses.businessFree}</small>
            </div>

            <div class="houses-progress">
              <i style="width:${houses.businessFreePercent}%"></i>
              <b>${houses.businessFreePercent}%</b>
            </div>
          </article>

          <article class="houses-stat-card houses-stat-orange">
            <span class="houses-stat-icon">◎</span>

            <div class="houses-stat-main">
              <em>Слоты</em>
              <strong>${houses.freeSlots}</strong>
              <small>дома + бизнесы</small>
            </div>

            <div class="houses-progress">
              <i style="width:${houses.freeSlotsPercent}%"></i>
              <b>${houses.freeSlotsPercent}%</b>
            </div>
          </article>
        </div>

        <section class="houses-list-section">
          <div class="houses-list-header">
            <h3>⌂ Список домов</h3>

            <div class="houses-filter">
              <button type="button" class="houses-filter-button" data-houses-filter-button>
                <span data-houses-filter-label>Все дома</span>
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

        <footer class="houses-footer">
          <span>ⓘ Цены указаны в ₴</span>
          <button class="houses-close-button" type="button" data-houses-stats-close>Закрыть</button>
        </footer>
      </section>
    </div>
  `;
}

export function enableHousesStatsModal(root) {
  const modal = root.querySelector('.houses-modal');
  const openButton = root.querySelector('.player-city-button');
  const closeButtons = root.querySelectorAll('[data-houses-stats-close]');

  const filterButton = root.querySelector('[data-houses-filter-button]');
  const filterMenu = root.querySelector('[data-houses-filter-menu]');
  const filterLabel = root.querySelector('[data-houses-filter-label]');
  const houseItems = Array.from(root.querySelectorAll('[data-house-state]'));
  const filterEmpty = root.querySelector('[data-house-filter-empty]');

  const filterLabels = {
    all: 'Все дома',
    free: 'Свободные',
    owned: 'Купленные',
  };

  function applyFilter(filter = 'all') {
    let visibleCount = 0;

    houseItems.forEach((item) => {
      const state = item.dataset.houseState;
      const isVisible = filter === 'all' || state === filter;

      item.hidden = !isVisible;

      if (isVisible) {
        visibleCount += 1;
      }
    });

    if (filterLabel) {
      filterLabel.textContent = filterLabels[filter] || filterLabels.all;
    }

    if (filterEmpty) {
      filterEmpty.hidden = visibleCount > 0;
    }

    if (filterMenu) {
      filterMenu.hidden = true;
    }
  }

  function toggleFilterMenu(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!filterMenu) return;

    filterMenu.hidden = !filterMenu.hidden;
  }

  function handleFilterClick(event) {
    const button = event.target.closest('[data-houses-filter]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    applyFilter(button.dataset.housesFilter || 'all');
  }

  function handleOutsideFilterClick(event) {
    if (!filterMenu || filterMenu.hidden) return;
    if (event.target.closest('.houses-filter')) return;

    filterMenu.hidden = true;
  }

  function open() {
    if (!modal) return;

    modal.hidden = false;
    root.dataset.housesStatsOpen = 'true';
    document.body.classList.add('mn-houses-modal-open');
  }

  function close() {
    if (!modal) return;

    modal.hidden = true;
    delete root.dataset.housesStatsOpen;
    document.body.classList.remove('mn-houses-modal-open');

    if (filterMenu) {
      filterMenu.hidden = true;
    }
  }

  openButton?.addEventListener('click', open);
  filterButton?.addEventListener('click', toggleFilterMenu);
  filterMenu?.addEventListener('click', handleFilterClick);
  document.addEventListener('click', handleOutsideFilterClick);

  closeButtons.forEach((button) => {
    button.addEventListener('click', close);
  });

  applyFilter('all');

  return () => {
    close();

    openButton?.removeEventListener('click', open);
    filterButton?.removeEventListener('click', toggleFilterMenu);
    filterMenu?.removeEventListener('click', handleFilterClick);
    document.removeEventListener('click', handleOutsideFilterClick);

    closeButtons.forEach((button) => {
      button.removeEventListener('click', close);
    });
  };
}
