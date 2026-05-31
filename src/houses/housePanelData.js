function formatMoney(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) {
    return '';
  }

  return `${number.toLocaleString('ru-RU')} $`;
}

export function getHousePanelData(object) {
  const price = formatMoney(object?.payload?.price);
  const ownerId = object?.payload?.ownerId || '';
  const locked = Boolean(object?.payload?.locked);

  return {
    icon: object?.icon || '🏠',
    title: object?.name || 'Дом',
    meta: [
      object?.payload?.houseClassLabel || object?.payload?.houseClass || object?.variant || 'standard',
      ownerId ? 'занят' : locked ? 'закрыт' : 'свободен',
      price,
    ].filter(Boolean).join(' · '),
    actionLabel: ownerId ? 'Информация' : locked ? 'Закрыто' : 'Купить дом',
  };
}
