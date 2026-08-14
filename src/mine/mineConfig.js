export const MINE_QUALITY_LEVELS = Object.freeze({
  1: Object.freeze({ level: 1, label: 'Грязное сырьё', shortLabel: 'Грязное', purityPercent: 10, priceMultiplier: 0.72, washingRequired: true }),
  2: Object.freeze({ level: 2, label: 'Промытое сырьё', shortLabel: 'Промытое', purityPercent: 35, priceMultiplier: 1, washingRequired: false }),
  3: Object.freeze({ level: 3, label: 'Отборное сырьё', shortLabel: 'Отборное', purityPercent: 55, priceMultiplier: 1.18, washingRequired: false }),
  4: Object.freeze({ level: 4, label: 'Обогащённое сырьё', shortLabel: 'Обогащённое', purityPercent: 75, priceMultiplier: 1.42, washingRequired: false }),
  5: Object.freeze({ level: 5, label: 'Почти чистое сырьё', shortLabel: 'Почти чистое', purityPercent: 95, priceMultiplier: 1.72, washingRequired: false }),
});

export const MINE_RESOURCES = Object.freeze({
  stone: Object.freeze({
    resourceType: 'stone', objectType: 'mine_stone_node', label: 'Камень', icon: '🪨',
    unlockLevel: 1, respawnSeconds: 45, subtypeCodes: ['mine_stone_common', 'mine_stone_dense'],
  }),
  coal: Object.freeze({
    resourceType: 'coal', objectType: 'mine_coal_node', label: 'Уголь', icon: '⚫',
    unlockLevel: 2, respawnSeconds: 75, subtypeCodes: ['mine_coal_common', 'mine_coal_technical'],
  }),
  metal: Object.freeze({
    resourceType: 'metal', objectType: 'mine_metal_node', label: 'Металл', icon: '⚙️',
    unlockLevel: 3, respawnSeconds: 105, subtypeCodes: ['mine_metal_raw', 'mine_metal_technical'],
  }),
  copper: Object.freeze({
    resourceType: 'copper', objectType: 'mine_copper_node', label: 'Медь', icon: '🟠',
    unlockLevel: 4, respawnSeconds: 150, subtypeCodes: ['mine_copper_raw', 'mine_copper_conductive'],
  }),
});

export const MINE_SUBTYPES = Object.freeze({
  mine_stone_common: Object.freeze({
    subtypeCode: 'mine_stone_common', resourceType: 'stone', label: 'Обычный камень', icon: '🪨',
    unlockLevel: 1, baseSellPrice: 6, useLabel: 'Продажа · базовые крафты',
    future: Object.freeze({ crafting: true, industry: false, fire: false, electronics: false, craftChanceBonus: 0 }),
  }),
  mine_stone_dense: Object.freeze({
    subtypeCode: 'mine_stone_dense', resourceType: 'stone', label: 'Плотный камень', icon: '🗿',
    unlockLevel: 3, baseSellPrice: 11, useLabel: 'Дорогая продажа · +1,5% к шансу крафта',
    future: Object.freeze({ crafting: true, industry: false, fire: false, electronics: false, craftChanceBonus: 1.5 }),
  }),
  mine_coal_common: Object.freeze({
    subtypeCode: 'mine_coal_common', resourceType: 'coal', label: 'Обыкновенный уголь', icon: '⚫',
    unlockLevel: 1, baseSellPrice: 18, useLabel: 'Продажа · огонь · обычные крафты',
    future: Object.freeze({ crafting: true, industry: false, fire: true, electronics: false, craftChanceBonus: 0 }),
  }),
  mine_coal_technical: Object.freeze({
    subtypeCode: 'mine_coal_technical', resourceType: 'coal', label: 'Технический уголь', icon: '⬛',
    unlockLevel: 3, baseSellPrice: 31, useLabel: 'Продажа · производства · технические крафты',
    future: Object.freeze({ crafting: true, industry: true, fire: false, electronics: false, craftChanceBonus: 0 }),
  }),
  mine_metal_raw: Object.freeze({
    subtypeCode: 'mine_metal_raw', resourceType: 'metal', label: 'Сырой металл', icon: '🔩',
    unlockLevel: 1, baseSellPrice: 42, useLabel: '10% очистки на старте · продажа · крафты',
    future: Object.freeze({ crafting: true, industry: false, smelting: false, construction: false, electronics: false }),
  }),
  mine_metal_technical: Object.freeze({
    subtypeCode: 'mine_metal_technical', resourceType: 'metal', label: 'Технический металл', icon: '⛓️',
    unlockLevel: 3, baseSellPrice: 70, useLabel: 'Переплавка · производства · улучшения',
    future: Object.freeze({ crafting: true, industry: true, smelting: true, construction: true, electronics: false }),
  }),
  mine_copper_raw: Object.freeze({
    subtypeCode: 'mine_copper_raw', resourceType: 'copper', label: 'Медная руда', icon: '🟤',
    unlockLevel: 1, baseSellPrice: 220, useLabel: 'Продажа · крафты · электроника после обработки',
    future: Object.freeze({ crafting: true, industry: false, smelting: true, construction: false, electronics: true }),
  }),
  mine_copper_conductive: Object.freeze({
    subtypeCode: 'mine_copper_conductive', resourceType: 'copper', label: 'Богатая медная руда', icon: '🟠',
    unlockLevel: 3, baseSellPrice: 340, useLabel: 'Электроника · производства · дорогая продажа',
    future: Object.freeze({ crafting: true, industry: true, smelting: true, construction: false, electronics: true }),
  }),
});

export const MINE_ITEMS = Object.freeze({
  mine_tool_pickaxe: Object.freeze({
    itemType: 'mine_tool_pickaxe', label: 'Шахтёрская кирка', icon: '⛏️',
    kind: 'tool', permanent: true, price: 450,
  }),
});

export function normalizeMineQualityLevel(value) {
  return Math.max(1, Math.min(5, Math.floor(Number(value) || 1)));
}

export function getMineQuality(value) {
  return MINE_QUALITY_LEVELS[normalizeMineQualityLevel(value)];
}

export function getMineResource(resourceType) {
  return MINE_RESOURCES[String(resourceType || '').trim().toLowerCase()] || null;
}

export function getMineResourceByObjectType(objectType) {
  const cleanType = String(objectType || '').trim();
  return Object.values(MINE_RESOURCES).find((resource) => resource.objectType === cleanType) || null;
}

export function getMineSubtype(subtypeCode) {
  return MINE_SUBTYPES[String(subtypeCode || '').trim().toLowerCase()] || null;
}

export function getMineGradeItemType(subtypeCode, qualityLevel) {
  const subtype = getMineSubtype(subtypeCode);
  if (!subtype) return '';
  return `${subtype.subtypeCode}_q${normalizeMineQualityLevel(qualityLevel)}`;
}

export function parseMineGradeItemType(itemType) {
  const match = String(itemType || '').trim().toLowerCase().match(/^(mine_[a-z_]+)_q([1-5])$/);
  if (!match) return null;
  const subtype = getMineSubtype(match[1]);
  if (!subtype) return null;
  const qualityLevel = normalizeMineQualityLevel(match[2]);
  return { subtype, qualityLevel, quality: getMineQuality(qualityLevel) };
}

export function getMineBaseGradePrice(subtypeCode, qualityLevel) {
  const subtype = getMineSubtype(subtypeCode);
  const quality = getMineQuality(qualityLevel);
  return subtype ? Math.max(1, Math.round(subtype.baseSellPrice * quality.priceMultiplier)) : 0;
}
