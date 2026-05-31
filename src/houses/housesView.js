export function renderHousesFeatureHtml({ city, houses }) {
  return `
    <div class="city-stats-modal houses-stats-modal" hidden>
      <div class="city-stats-backdrop" data-houses-stats-close></div>

      <section class="city-stats-panel" role="dialog" aria-modal="true" aria-label="${city.name} — недвижимость">
        <header class="city-stats-header">
          <strong>${city.name} — недвижимость</strong>
          <button type="button" data-houses-stats-close>×</button>
        </header>

        <div class="city-stats-grid">
          <article class="city-stat-card city-stat-purple">
            <span class="city-stat-icon">▥</span>
            <em>Дома</em>
            <strong>${houses.housesTotal}</strong>
            <small>Свободно: ${houses.housesFree}</small>
            <div class="city-stat-progress">
              <i style="width:${houses.housesFreePercent}%"></i>
            </div>
            <b>${houses.housesFreePercent}%</b>
          </article>

          <article class="city-stat-card city-stat-green">
            <span class="city-stat-icon">▤</span>
            <em>Бизнесы</em>
            <strong>${houses.businessTotal}</strong>
            <small>Свободно: ${houses.businessFree}</small>
            <div class="city-stat-progress">
              <i style="width:${houses.businessFreePercent}%"></i>
            </div>
            <b>${houses.businessFreePercent}%</b>
          </article>

          <article class="city-stat-card city-stat-orange">
            <span class="city-stat-icon">◎</span>
            <em>Свободные слоты</em>
            <strong>${houses.freeSlots}</strong>
            <small>дома + бизнесы</small>
            <div class="city-stat-progress">
              <i style="width:${houses.freeSlotsPercent}%"></i>
            </div>
            <b>${houses.freeSlotsPercent}%</b>
          </article>
        </div>

        <button class="city-stats-close-button" type="button" data-houses-stats-close>
          Закрыть
        </button>
      </section>
    </div>
  `;
}

export function enableHousesStatsModal(root) {
  const modal = root.querySelector('.houses-stats-modal');
  const openButton = root.querySelector('.player-city-button');
  const closeButtons = root.querySelectorAll('[data-houses-stats-close]');

  function open() {
    if (!modal) return;

    modal.hidden = false;
    root.dataset.housesStatsOpen = 'true';
  }

  function close() {
    if (!modal) return;

    modal.hidden = true;
    delete root.dataset.housesStatsOpen;
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
