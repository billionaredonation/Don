export function getEntityKind(object) {
  return object?.category || object?.payload?.kind || object?.type || 'marker';
}

export function getEntityKindLabel(object) {
  const kind = getEntityKind(object);

  if (kind === 'house') return 'Дом';
  if (kind === 'business') return 'Бизнес';
  if (kind === 'decor') return 'Декор';
  if (kind === 'npc') return 'NPC';
  if (kind === 'marker') return 'Маркер';

  return 'Сущность';
}

export function getEntityPrimaryActionLabel(object) {
  const kind = getEntityKind(object);

  if (kind === 'house') {
    if (object?.payload?.ownerId) return 'Информация';
    if (object?.payload?.locked) return 'Закрыто';
    return 'Купить дом';
  }

  if (kind === 'business') {
    if (object?.payload?.ownerId) return 'Информация';
    if (object?.payload?.locked) return 'Закрыто';
    return 'Купить бизнес';
  }

  if (kind === 'npc') return 'Говорить';
  if (kind === 'decor') return 'Осмотреть';
  if (kind === 'marker') return 'Выбрать';

  return 'Выбрать';
}

export function getEntityMetaText(object) {
  const kindLabel = getEntityKindLabel(object);

  const classLabel =
    object?.payload?.houseClassLabel ||
    object?.payload?.businessLabel ||
    object?.payload?.kind ||
    object?.variant ||
    object?.type ||
    'object';

  const price = Number(object?.payload?.price || 0);
  const ownerId = object?.payload?.ownerId || '';
  const locked = Boolean(object?.payload?.locked);

  const statusText = ownerId
    ? 'занят'
    : locked
      ? 'закрыт'
      : 'свободен';

  const priceText = price > 0
    ? ` · ${price.toLocaleString('ru-RU')} $`
    : '';

  return `${kindLabel} · ${classLabel} · ${statusText}${priceText}`;
}

export function dispatchEntityAction(object) {
  const kind = getEntityKind(object);

  window.dispatchEvent(new CustomEvent('mn:entity-action', {
    detail: {
      kind,
      object,
    },
  }));

  if (kind === 'house') {
    window.dispatchEvent(new CustomEvent('mn:house-action', {
      detail: { object },
    }));
    return;
  }

  if (kind === 'business') {
    window.dispatchEvent(new CustomEvent('mn:business-action', {
      detail: { object },
    }));
    return;
  }

  if (kind === 'npc') {
    window.dispatchEvent(new CustomEvent('mn:npc-action', {
      detail: { object },
    }));
    return;
  }

  window.dispatchEvent(new CustomEvent('mn:map-object-selected', {
    detail: { object },
  }));
}
