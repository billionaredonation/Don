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
        .map((house, index) => {
          const isOwned = Boolean(house?.payload?.ownerId);
          const isLocked = Boolean(house?.payload?.locked);
          const isFree = !isOwned && !isLocked;
          const status = getHouseStatus(house);
          const price = formatMoney(house?.payload?.price);

          return `
            <li class="${isFree ? 'house-free' : 'house-owned'}">
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
              <span class="house-arrow">›</span>
            </li>
          `;
        })
        .join('')}
    </ul>
  `;
}
