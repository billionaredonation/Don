export const WOOD_PROCESSING_CONFIG = Object.freeze({
  type: 'wood_processing_factory',
  label: 'Деревоперерабатывающий завод',
  icon: '🪵',
  purchasePrice: 3_500_000,
  legalForm: 'ТОВ',
});

export const WOOD_PROCESSING_RAW_ITEMS = Object.freeze([
  Object.freeze({ itemType: 'lumber_log', label: 'Бревно', icon: '🪵' }),
  Object.freeze({ itemType: 'lumber_beam', label: 'Брус', icon: '▰' }),
]);

const recipe = (id, label, icon, outputQty, inputs, destinations) => Object.freeze({
  id, label, icon, outputQty, inputs: Object.freeze(inputs), destinations: Object.freeze(destinations),
});

export const WOOD_PROCESSING_RECIPES = Object.freeze({
  pickaxe_handle: recipe('pickaxe_handle', 'Ручка кирки', '⛏️', 1, { lumber_beam: 2 }, ['tool_factory']),
  rake_handle: recipe('rake_handle', 'Держатель для граблей', 'Г', 1, { lumber_beam: 2 }, ['tool_factory']),
  scissors_handles: recipe('scissors_handles', 'Пара ручек для ножниц', '✂️', 1, { lumber_beam: 2 }, ['tool_factory']),
  hand_saw_handle: recipe('hand_saw_handle', 'Ручка для пилы', '🪚', 1, { lumber_log: 1 }, ['tool_factory']),
  axe_handle: recipe('axe_handle', 'Ручка топора', '🪓', 1, { lumber_beam: 2 }, ['tool_factory']),
});

export const WOOD_PROCESSING_DESTINATIONS = Object.freeze({
  tool_factory: 'Завод по сборке инструментов',
  construction_store: 'Магазин стройматериалов',
});

export const WOOD_PROCESSING_RAW_BY_TYPE = Object.freeze(
  Object.fromEntries(WOOD_PROCESSING_RAW_ITEMS.map((item) => [item.itemType, item])),
);

export function formatWoodInputs(inputs = {}) {
  return Object.entries(inputs).map(([itemType, quantity]) => {
    const item = WOOD_PROCESSING_RAW_BY_TYPE[itemType];
    return `${item?.icon || '▪'} ${item?.label || itemType} × ${quantity}`;
  }).join(' + ');
}

export function formatWoodMoney(value) {
  return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ru-RU')} ₴`;
}
