import { handleHouseAction } from '../houses/houseActions.js';
import { handleBusinessAction } from './businessActions.js';
import { handleNpcAction } from './npcActions.js';

export function getEntityKind(object) {
  const rawKind = object?.category || object?.payload?.kind || object?.type || 'marker';
  const type = object?.type || object?.payload?.type || object?.payload?.serviceType || '';

  if (rawKind === 'hospital' || type === 'hospital') return 'service';

  return rawKind;
}

export function getEntityType(object) {
  return object?.type || object?.payload?.type || object?.payload?.serviceType || '';
}

export function getEntityKindLabel(object) {
  const kind = getEntityKind(object);
  const type = getEntityType(object);

  if (kind === 'house') return 'Дом';
  if (kind === 'business') return 'Бизнес';
  if (kind === 'service' && type === 'hospital') return 'Больница';
  if (kind === 'service') return 'Сервис';
  if (kind === 'decor') return 'Декор';
  if (kind === 'npc') return 'NPC';
  if (kind === 'marker') return 'Маркер';
  if (kind === 'job') return 'Работа';

  return 'Сущность';
}

export function getEntityPrimaryActionLabel(object) {
  const kind = getEntityKind(object);
  const type = getEntityType(object);

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

  if (kind === 'service' && type === 'hospital') {
    if (object?.payload?.locked) return 'Закрыто';
    return 'Войти';
  }

  if (kind === 'npc') return 'Говорить';
  if (kind === 'decor') return 'Осмотреть';
  if (kind === 'marker') return 'Выбрать';
  if (kind === 'job') return 'Работать';

  return 'Выбрать';
}

export function getEntityMetaText(object) {
  const kindLabel = getEntityKindLabel(object);
  const kind = getEntityKind(object);
  const type = getEntityType(object);

  if (kind === 'service' && type === 'hospital') {
    return object?.payload?.locked
      ? `${kindLabel} · вход закрыт`
      : `${kindLabel} · серверный объект · вход свободный`;
  }


  if (kind === 'job') {
    if (type === 'farm_station') return 'Ферма · инструменты и продажа урожая';
    if (type === 'farm_wheat_plant') return 'Ферма · растение пшеницы';
    if (type === 'farm_apple_plant') return 'Ферма · яблоня';
    return 'Рабочая точка';
  }

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
  const type = getEntityType(object);

  window.dispatchEvent(new CustomEvent('mn:entity-action', {
    detail: {
      kind,
      object,
    },
  }));

  if (kind === 'house') {
    handleHouseAction(object);
    return;
  }

  if (kind === 'business') {
    handleBusinessAction(object);
    return;
  }

  if (kind === 'npc') {
    handleNpcAction(object);
    return;
  }

  if (kind === 'service' && type === 'hospital') {
    window.dispatchEvent(new CustomEvent('mn:hospital-enter-request', {
      detail: {
        hospital: object,
        object,
        action: 'enter',
      },
    }));
    return;
  }


  if (kind === 'job') {
    window.dispatchEvent(new CustomEvent('mn:farm-object-action', {
      detail: { object, action: type },
    }));
    return;
  }

  window.dispatchEvent(new CustomEvent('mn:map-object-selected', {
    detail: {
      object,
      action: 'select',
    },
  }));
}
