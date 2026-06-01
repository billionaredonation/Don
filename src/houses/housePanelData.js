function formatMoney(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) {
    return '';
  }

  return `${number.toLocaleString('ru-RU')} ₴`;
}

function getHouseClass(object) {
  return (
    object?.class ||
    object?.payload?.houseClassLabel ||
    object?.payload?.houseClass ||
    object?.variant ||
    'standard'
  );
}

function getHouseOwnerId(object) {
  return object?.owner_id || object?.payload?.ownerId || null;
}

function getHousePrice(object) {
  return object?.price || object?.payload?.price || 0;
}

export function getHousePanelData(object) {
  const price = formatMoney(getHousePrice(object));
  const ownerId = getHouseOwnerId(object);
  const locked = Boolean(object?.payload?.locked);
  const houseClass = getHouseClass(object);

  return {
    icon: object?.icon || '🏠',
    title: object?.name || `Дом · ${houseClass}`,
    meta: [
      houseClass,
      ownerId ? 'куплен' : locked ? 'закрыт' : 'свободен',
      price,
    ].filter(Boolean).join(' · '),
    actionLabel: ownerId ? 'Информация' : locked ? 'Закрыто' : 'Купить дом',
  };
}
