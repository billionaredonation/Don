function formatMoney(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) {
    return '';
  }

  return `${number.toLocaleString('ru-RU')} ₴`;
}

function getHouseClass(object) {
  const raw = String(
    object?.class ||
      object?.payload?.houseClass ||
      object?.variant ||
      object?.payload?.houseClassLabel ||
      'standard'
  ).trim().toLowerCase();

  const labels = {
    standard: 'Стандарт',
    std: 'Стандарт',
    comfort: 'Стандарт',
    premium: 'Премиум',
    prem: 'Премиум',
    ultra_lux: 'Ультра люкс',
    ultra: 'Ультра люкс',
    lux: 'Ультра люкс',
    luxe: 'Ультра люкс',
    luxury: 'Ультра люкс',
    elite: 'Ультра люкс',
  };

  return labels[raw] || object?.payload?.houseClassLabel || 'Стандарт';
}

function getHouseOwnerId(object) {
  return object?.owner_id || object?.payload?.ownerId || null;
}

function getHouseOwnerName(object) {
  return object?.ownerName || object?.payload?.ownerName || null;
}

function getHousePrice(object) {
  return object?.price || object?.payload?.price || 0;
}

export function getHousePanelData(object) {
  const price = formatMoney(getHousePrice(object));
  const ownerId = getHouseOwnerId(object);
  const ownerName = getHouseOwnerName(object);
  const locked = Boolean(object?.payload?.locked);
  const houseClass = getHouseClass(object);

  return {
    icon: object?.icon || '🏠',
    title: object?.name || 'Дом',
    meta: [
      houseClass,
      ownerId ? `куплен: ${ownerName || 'игрок'}` : locked ? 'закрыт' : 'свободен',
      price,
    ].filter(Boolean).join(' · '),
    actionLabel: ownerId ? 'Информация' : locked ? 'Закрыто' : 'Купить дом',
  };
}
