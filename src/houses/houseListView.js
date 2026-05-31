function formatMoney(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) {
    return 'Цена не указана';
  }

  return `${number.toLocaleString('ru-RU')}₴`;
}

function getHouseClass(house) {
  return (
    house?.payload?.houseClassShortLabel ||
    house?.payload?.houseClassLabel ||
    house?.payload?.houseClass ||
    house?.variant ||
    'STD'
  );
}

function getHouseStatus(house) {
  if (house?.payload?.ownerId) return 'Занят';
  if (house?.payload?.locked) return 'Закрыт';
  return 'Свободен';
}

function getHouseState(house) {
  if (house?.payload?.ownerId || house?.payload?.locked) return 'owned';
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
          const price = formatMoney(house?.payload?.price);

          return `
            <li class="${state === 'free' ? 'house-free' : 'house-owned'}" data-house-state="${state}">
              <span class="house-card-icon">${house.icon || '🏠'}</span>

              <span class="house-card-main">
                <span class="house-card-title-row">
                  <b>Дом #${index + 1}</b>
                  <i>${getHouseClass(house)}</i>
                </span>

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
