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

            <button type="button" class="houses-filter-button">
              Все дома
              <span>⌄</span>
            </button>
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
  }

  openButton?.addEventListener('click', open);

  closeButtons.forEach((button) => {
    button.addEventListener('click', close);
  });

  return () => {
    close();
    openButton?.removeEventListener('click', open);

    closeButtons.forEach((button) => {
      button.removeEventListener('click', close);
    });
  };
}
