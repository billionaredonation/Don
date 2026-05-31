function formatMoney(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) {
    return 'Цена не указана';
  }

  return `${number.toLocaleString('ru-RU')} ₴`;
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
    <ul class="house-list">
      ${houses
        .map((house) => {
          const isOwned = Boolean(house?.payload?.ownerId);
          const isLocked = Boolean(house?.payload?.locked);
          const statusClass = isOwned || isLocked ? 'house-owned' : 'house-free';

          return `
            <li class="${statusClass}">
              <span class="house-list-icon">${house.icon || '🏠'}</span>

              <span class="house-list-main">
                <b>${house.name || 'Дом'}</b>
                <small>${getHouseClass(house)} · ${getHouseStatus(house)}</small>
              </span>

              <strong>${formatMoney(house?.payload?.price)}</strong>
            </li>
          `;
        })
        .join('')}
    </ul>
  `;
}
