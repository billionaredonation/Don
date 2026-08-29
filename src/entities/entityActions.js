import { handleHouseAction } from '../houses/houseActions.js';
import { handleBusinessAction } from './businessActions.js';
import { handleNpcAction } from './npcActions.js';

const BUSINESS_ENTITY_TYPES = new Set([
  'shop',
  'grocery',
  'tool_store',
  'cafe',
  'gas_station',
  'bank',
  'warehouse',
  'office',
  'market',
  'bakery','building_store','furniture_store','metal_store','electric_store','logistics_hub',
]);

export function getEntityKind(object) {
  const payload = object?.payload || {};
  const outerCategory = String(object?.category || '').trim();
  const payloadCategory = String(payload.category || '').trim();
  const payloadKind = String(payload.kind || '').trim();
  const businessType = String(payload.businessType || payload.business_type || '').trim();
  const rawKind = outerCategory || payloadKind || String(object?.type || '').trim() || 'marker';
  const type = getEntityType(object);

  if (rawKind === 'hospital' || type === 'hospital') return 'service';

  // Some older/admin-created rows are stored as a technical `marker`, while
  // their payload contains the real entity kind. Prefer the semantic payload
  // so Y never routes a shop into the empty marker action.
  if (
    outerCategory === 'business' ||
    payloadCategory === 'business' ||
    payloadKind === 'business' ||
    BUSINESS_ENTITY_TYPES.has(type) ||
    BUSINESS_ENTITY_TYPES.has(businessType)
  ) return 'business';

  if (outerCategory === 'house' || payloadCategory === 'house' || payloadKind === 'house' || type === 'house') return 'house';
  if (outerCategory === 'job' || payloadCategory === 'job' || payloadKind === 'job') return 'job';
  if (outerCategory === 'service' || payloadCategory === 'service' || payloadKind === 'service') return 'service';
  if (outerCategory === 'npc' || payloadCategory === 'npc' || payloadKind === 'npc') return 'npc';
  if (outerCategory === 'decor' || payloadCategory === 'decor' || payloadKind === 'decor') return 'decor';

  return outerCategory || payloadCategory || payloadKind || type || 'marker';
}

export function getEntityType(object) {
  const payload = object?.payload || {};
  const outerType = String(object?.type || '').trim();
  const semanticType = String(
    payload.serviceType ||
    payload.jobType ||
    payload.businessType ||
    payload.business_type ||
    payload.type ||
    ''
  ).trim();

  return outerType === 'marker' && semanticType
    ? semanticType
    : outerType || semanticType;
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
    if (object?.owner_id || object?.ownerId || object?.payload?.ownerId || object?.payload?.owner_id) return 'Открыть бизнес';
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
    if (type === 'farm_station') return 'Фермерское ООО · инструменты, скупщик и управление';
    if (type === 'farm_water_tower') return 'Ферма · водонапорная башня · 500 л';
    if (type === 'farm_water_barrel') return 'Ферма · бесконечная вода · наполнение ведер';
    if (type === 'farm_wheat_plant') return 'Ферма · растение пшеницы';
    if (type === 'farm_apple_plant') return 'Ферма · яблоня';
    if (type === 'farm_orange_plant') return 'Ферма · апельсиновое дерево';
    if (type === 'farm_corn_plant') return 'Ферма · кукуруза';
    if (type === 'mine_station') return 'Шахта · кирка и продажа сырья';
    if (type === 'mine_stone_node') return 'Шахта · месторождение камня';
    if (type === 'mine_coal_node') return 'Шахта · месторождение угля';
    if (type === 'mine_metal_node') return 'Шахта · месторождение металла';
    if (type === 'mine_copper_node') return 'Шахта · месторождение меди';
    if (type === 'lumber_station') return 'Лесоруб · топор, бензопила, распил и продажа';
    if (type === 'lumber_deciduous_tree') return 'Лесоруб · лиственное дерево';
    if (type === 'lumber_pine_tree') return 'Лесоруб · сосна';
    if (type === 'fruit_factory') return 'Фруктовый завод · переработка и хранение продукции';
    if (type === 'construction_factory') return 'Завод стройматериалов · древесина, производство и оптовые поставки';
    if (type.startsWith('industry_')) return 'Промышленное предприятие · работа, производство, склады и управление';
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
  const ownerId = object?.owner_id || object?.ownerId || object?.payload?.ownerId || object?.payload?.owner_id || '';
  const locked = Boolean(object?.payload?.locked);

  const statusText = ownerId
    ? 'занят'
    : locked
      ? 'закрыт'
      : 'свободен';

  const priceText = price > 0
    ? ` · ${price.toLocaleString('ru-RU')} ₴`
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
    const cleanType = String(type || '');
    const eventName = cleanType.startsWith('industry_')
      ? 'mn:industry-object-action'
      : cleanType === 'fruit_factory'
      ? 'mn:factory-object-action'
      : cleanType === 'construction_factory'
      ? 'mn:construction-object-action'
      : cleanType.startsWith('mine_')
      ? 'mn:mine-object-action'
      : cleanType.startsWith('lumber_')
        ? 'mn:lumber-object-action'
        : 'mn:farm-object-action';
    window.dispatchEvent(new CustomEvent(eventName, {
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
