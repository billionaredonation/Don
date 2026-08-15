export const LUMBER_MAX_LEVEL = 3;

export const LUMBER_LEVELS = Object.freeze({
  1: Object.freeze({
    level: 1,
    label: 'Заготовщик',
    description: 'Рубка деревьев и продажа целых брёвен.',
    unlocks: Object.freeze(['lumber_tool_axe', 'lumber_log']),
  }),
  2: Object.freeze({
    level: 2,
    label: 'Распиловщик',
    description: 'Бензопила и распил одного бревна на четыре бруса.',
    unlocks: Object.freeze(['lumber_tool_chainsaw', 'lumber_beam']),
  }),
  3: Object.freeze({
    level: 3,
    label: 'Поставщик производств',
    description: 'Брусья отмечаются как доступные для производств.',
    unlocks: Object.freeze(['lumber_industry_sales']),
  }),
});

export const LUMBER_TREES = Object.freeze({
  deciduous: Object.freeze({
    treeType: 'deciduous',
    objectType: 'lumber_deciduous_tree',
    label: 'Лиственное дерево',
    icon: '🌳',
    respawnSeconds: 90,
  }),
  pine: Object.freeze({
    treeType: 'pine',
    objectType: 'lumber_pine_tree',
    label: 'Сосна',
    icon: '🌲',
    respawnSeconds: 105,
  }),
});

export const LUMBER_ITEMS = Object.freeze({
  lumber_tool_axe: Object.freeze({
    itemType: 'lumber_tool_axe', label: 'Топор лесоруба', icon: '🪓', kind: 'tool', permanent: true, unlockLevel: 1,
  }),
  lumber_tool_chainsaw: Object.freeze({
    itemType: 'lumber_tool_chainsaw', label: 'Бензопила', icon: '🪚', kind: 'tool', permanent: true, unlockLevel: 2,
    asset: 'benzopila.png',
  }),
  lumber_log: Object.freeze({
    itemType: 'lumber_log', label: 'Бревно', icon: '🪵', kind: 'resource', unitWeightKg: 20, sellPrice: 200, unlockLevel: 1,
  }),
  lumber_beam: Object.freeze({
    itemType: 'lumber_beam', label: 'Брус', icon: '▰', kind: 'resource', unitWeightKg: 5, sellPrice: 55, unlockLevel: 2,
    asset: 'brus.png', industryUnlockLevel: 3,
  }),
});

export const LUMBER_SAW_RECIPE = Object.freeze({
  inputItemType: 'lumber_log',
  inputQuantity: 1,
  outputItemType: 'lumber_beam',
  outputQuantity: 4,
  unlockLevel: 2,
  toolItemType: 'lumber_tool_chainsaw',
});

export function getLumberTreeByObjectType(objectType) {
  const cleanType = String(objectType || '').trim();
  return Object.values(LUMBER_TREES).find((tree) => tree.objectType === cleanType) || null;
}

export function getLumberItem(itemType) {
  return LUMBER_ITEMS[String(itemType || '').trim().toLowerCase()] || null;
}
