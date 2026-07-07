function formatMoney(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) {
    return 'Цена не указана';
  }

  return `${number.toLocaleString('ru-RU')}₴`;
}

function getHouseClass(house) {
  const houseClass = house?.class || 'standard';

  const labels = {
    standard: 'STD',
    comfort: 'STD',
    premium: 'PRM',
    ultra_lux: 'ULTRA',
    luxe: 'ULTRA',
    lux: 'ULTRA',
    luxury: 'ULTRA',
    elite: 'ULTRA',
  };

  return labels[houseClass] || String(houseClass).toUpperCase();
}

function getHouseClassLabel(house) {
  const houseClass = house?.class || 'standard';

  const labels = {
    standard: 'Стандарт',
    comfort: 'Стандарт',
    premium: 'Премиум',
    ultra_lux: 'Ультра люкс',
    luxe: 'Ультра люкс',
    lux: 'Ультра люкс',
    luxury: 'Ультра люкс',
    elite: 'Ультра люкс',
  };

  return labels[houseClass] || String(houseClass);
}

function getHouseStatus(house) {
  if (house?.owner_id) return 'Куплен';
  return 'Свободен';
}

function getHouseState(house) {
  if (house?.owner_id) return 'owned';
  return 'free';
}

export function renderHouseList(houses = []) {
  if (!houses.length) {
    return `
      <div class="house-empty">
        <b>Домов пока нет</b>
        <span>Добавь дома через админку, и они появятся здесь.</span>
      </div>
    `;
  }

  return `
    <ul class="house-list" data-house-list>
      ${houses
        .map((house, index) => {
          const state = getHouseState(house);
          const status = getHouseStatus(house);
          const price = formatMoney(house?.price);
          const classShort = getHouseClass(house);
          const classLabel = getHouseClassLabel(house);

          return `
            <li
              class="${state === 'free' ? 'house-free' : 'house-owned'}"
              data-house-state="${state}"
              data-house-id="${house.id}"
            >
              <span class="house-card-icon">🏠</span>

              <span class="house-card-main">
                <span class="house-card-title-row">
                  <b>Дом #${index + 1}</b>
                  <i title="${classLabel}">${classShort}</i>
                </span>

                <small>Класс: <strong>${classLabel}</strong></small>
                <small>Статус: <em>${status}</em></small>
                <small>Цена: <strong>${price}</strong></small>
              </span>

              <span class="house-status-badge">${status}</span>
              <strong class="house-price">${price}</strong>
            </li>
          `;
        })
        .join('')}
    </ul>

    <div class="house-empty house-filter-empty" hidden data-house-filter-empty>
      <b>Таких домов нет</b>
      <span>Выбери другой фильтр.</span>
    </div>
  `;
}
