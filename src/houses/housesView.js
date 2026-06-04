import { renderHouseList } from './houseListView.js';

const FILTER_LABELS = {
  all: 'Все дома',
  free: 'Свободные',
  owned: 'Купленные',
};

const HOUSES_FILTER_STORAGE_KEY = 'mn_houses_active_filter';

function getValidFilter(value) {
  return Object.hasOwn(FILTER_LABELS, value) ? value : 'all';
}

function getSavedFilter() {
  try {
    return getValidFilter(
      sessionStorage.getItem(HOUSES_FILTER_STORAGE_KEY) || 'all'
    );
  } catch {
    return 'all';
  }
}

function saveFilter(filter) {
  try {
    sessionStorage.setItem(HOUSES_FILTER_STORAGE_KEY, getValidFilter(filter));
  } catch {
    // ignore
  }
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
              <h2>${city.name} — <span>город</span></h2>
              <p>Недвижимость, бизнесы, работы и экономика города</p>
            </div>
          </div>

          <button class="houses-x-button" type="button" data-houses-stats-close aria-label="Закрыть">
            ×
          </button>
        </header>

        <div class="houses-section-cards" aria-label="Разделы города">
          <button type="button" class="houses-section-card houses-section-card-houses is-active" data-houses-section="houses">
            <span class="houses-section-card-icon">🏠</span>
            <span class="houses-section-card-text">
              <strong>Дома</strong>
              <small>Недвижимость игроков</small>
            </span>
            <b>${houses.housesTotal}</b>
          </button>

          <button type="button" class="houses-section-card houses-section-card-business is-disabled" data-houses-section="businesses" disabled>
            <span class="houses-section-card-icon">💵</span>
            <span class="houses-section-card-text">
              <strong>Бизнесы</strong>
              <small>Доходные объекты · скоро</small>
            </span>
            <b>0</b>
          </button>

          <button type="button" class="houses-section-card houses-section-card-jobs is-disabled" data-houses-section="jobs" disabled>
            <span class="houses-section-card-icon">🤝</span>
            <span class="houses-section-card-text">
              <strong>Работы</strong>
              <small>Заработок игрока · скоро</small>
            </span>
            <b>0</b>
          </button>
        </div>

        <div class="houses-section-content" data-houses-section-content="houses">
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
                  <span data-houses-filter-label>${FILTER_LABELS[getSavedFilter()]}</span>
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
        </div>

        <footer class="houses-footer">
          <span>ⓘ Сейчас активен только раздел домов. Бизнесы и работы будут добавлены позже.</span>
          <button class="houses-close-button" type="button" data-houses-stats-close>
            Закрыть
          </button>
        </footer>
      </section>
    </div>
  `;
}

export function enableHousesStatsModal(root) {
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

  let activeFilter = getSavedFilter();

  function setFilterMenuOpen(nextOpen) {
    if (!filterMenu || !filterButton) return;

    filterMenu.hidden = !nextOpen;
    filterButton.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  }

  function applyFilter(nextFilter = 'all') {
    const filter = getValidFilter(nextFilter);

    activeFilter = filter;
    saveFilter(filter);

    let visibleCount = 0;

    houseItems.forEach((item) => {
      const itemState = String(item.dataset.houseState || '');
      const isVisible = filter === 'all' || itemState === filter;

      item.hidden = !isVisible;
      item.style.display = isVisible ? '' : 'none';

      if (isVisible) visibleCount += 1;
    });

    if (filterLabel) {
      filterLabel.textContent = FILTER_LABELS[filter];
    }

    if (filterEmpty) {
      filterEmpty.hidden = visibleCount > 0;
      filterEmpty.style.display = visibleCount > 0 ? 'none' : '';
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
  }

  function handleGlobalHouseAction(event) {
    event?.preventDefault?.();
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

  applyFilter(activeFilter);

  return () => {
    close();

    openButton?.removeEventListener('click', open);
    window.removeEventListener('mn:house-action', handleGlobalHouseAction);
    filterButton?.removeEventListener('click', toggleFilterMenu);
    filterMenu?.removeEventListener('click', handleFilterMenuClick);
    modal?.removeEventListener('click', handleHouseClick);
    document.removeEventListener('click', handleOutsideClick);
    document.removeEventListener('keydown', handleKeydown);

    closeButtons.forEach((button) => {
      button.removeEventListener('click', close);
    });

    modal?.remove();
    modal = null;
  };
}
