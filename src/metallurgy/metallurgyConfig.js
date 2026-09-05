export const METALLURGY_CONFIG = Object.freeze({
  type: 'metallurgy_factory',
  label: 'Металлургический завод',
  icon: '🔥',
  purchasePrice: 3_500_000,
  legalForm: 'ТОВ',
});

export const METALLURGY_RAW_ITEMS = Object.freeze([
  Object.freeze({ itemType: 'mine_coal_common', label: 'Обыкновенный уголь', icon: '⚫' }),
  Object.freeze({ itemType: 'mine_coal_technical', label: 'Технический уголь', icon: '🧱' }),
  Object.freeze({ itemType: 'mine_metal_raw', label: 'Сырой металл', icon: '🔩' }),
  Object.freeze({ itemType: 'mine_metal_technical', label: 'Технический металл', icon: '⛓️' }),
  Object.freeze({ itemType: 'mine_copper_raw', label: 'Медная руда', icon: '🟤' }),
  Object.freeze({ itemType: 'mine_copper_conductive', label: 'Богатая медная руда', icon: '🟠' }),
]);

const recipe = (id, label, icon, outputQty, inputs, destinations) => Object.freeze({
  id,
  label,
  icon,
  outputQty,
  inputs: Object.freeze(inputs),
  destinations: Object.freeze(destinations),
});

export const METALLURGY_RECIPES = Object.freeze({
  scissors_metal_part: recipe('scissors_metal_part', 'Металлическая часть ножниц', '✂️', 1, { mine_metal_raw: 1, mine_coal_common: 1 }, ['tool_factory']),
  chainsaw_chain: recipe('chainsaw_chain', 'Цепь бензопилы', '⛓️', 1, { mine_metal_raw: 1, mine_coal_common: 1 }, ['tool_factory']),
  chainsaw_engine: recipe('chainsaw_engine', 'Двигатель бензопилы', '⚙️', 1, { mine_metal_technical: 3, mine_coal_technical: 3, mine_copper_raw: 3 }, ['tool_factory']),
  axe_head: recipe('axe_head', 'Голова топора', '🪓', 1, { mine_metal_raw: 3, mine_coal_common: 2 }, ['tool_factory']),
  rake_head: recipe('rake_head', 'Насадка граблей', 'Г', 1, { mine_metal_raw: 3, mine_coal_common: 2 }, ['tool_factory']),
  hand_saw_metal_part: recipe('hand_saw_metal_part', 'Металлическая часть ручной пилы', '🪚', 1, { mine_metal_raw: 1, mine_coal_common: 1 }, ['tool_factory']),
  pickaxe_metal_part: recipe('pickaxe_metal_part', 'Металлическая часть кирки', '⛏️', 1, { mine_metal_technical: 2, mine_coal_common: 1 }, ['tool_factory']),
  support_beam: recipe('support_beam', 'Опорная балка', '🏗️', 2, { mine_metal_technical: 5, mine_coal_technical: 10 }, ['car_factory', 'construction_store']),
  rebar: recipe('rebar', 'Арматура', '〰️', 1, { mine_metal_technical: 3, mine_coal_technical: 3 }, ['construction_store']),
  nails: recipe('nails', 'Гвозди', '📌', 5, { mine_metal_technical: 5, mine_coal_technical: 3 }, ['tool_factory', 'accessory_factory', 'car_factory']),
  screws: recipe('screws', 'Шурупы', '🔩', 3, { mine_metal_technical: 2, mine_coal_technical: 2 }, ['tool_factory', 'accessory_factory', 'car_factory']),
  rivets: recipe('rivets', 'Заклёпки', '⚙️', 3, { mine_metal_raw: 1, mine_coal_common: 2 }, ['accessory_factory', 'car_factory']),
  jewelry_chain: recipe('jewelry_chain', 'Цепочка', '📿', 1, { mine_metal_raw: 2, mine_coal_common: 2 }, ['accessory_factory']),
  glasses_insert: recipe('glasses_insert', 'Вставки для очков', '👓', 1, { mine_metal_raw: 2, mine_coal_common: 2 }, ['tool_factory']),
  earrings_pair: recipe('earrings_pair', 'Пара серёжек', '💎', 1, { mine_metal_raw: 2, mine_coal_common: 2 }, ['accessory_factory']),
  watch_metal_part: recipe('watch_metal_part', 'Металлическая часть часов', '⌚', 1, { mine_metal_raw: 3, mine_coal_common: 4, mine_copper_raw: 2 }, ['accessory_factory']),
  car_frame: recipe('car_frame', 'Каркас автомобиля', '🚘', 1, { mine_metal_technical: 5, mine_coal_technical: 10, mine_copper_conductive: 10 }, ['car_factory']),
  car_engine: recipe('car_engine', 'Двигатель автомобиля', '🏎️', 1, { mine_metal_technical: 10, mine_coal_technical: 10, mine_copper_raw: 11 }, ['car_factory']),
  car_body: recipe('car_body', 'Кузов автомобиля', '🚗', 1, { mine_metal_technical: 15, mine_coal_technical: 20, mine_copper_conductive: 20 }, ['car_factory']),
});

export const METALLURGY_DESTINATIONS = Object.freeze({
  tool_factory: 'Завод инструментов',
  accessory_factory: 'Завод аксессуаров',
  car_factory: 'Автомобильный завод',
  construction_store: 'Магазин стройматериалов',
});

export const METALLURGY_RAW_BY_TYPE = Object.freeze(
  Object.fromEntries(METALLURGY_RAW_ITEMS.map((item) => [item.itemType, item])),
);

export function getMetallurgyRecipe(recipeId) {
  return METALLURGY_RECIPES[String(recipeId || '').trim()] || null;
}

export function formatMetallurgyInputs(inputs = {}) {
  return Object.entries(inputs)
    .map(([itemType, quantity]) => {
      const item = METALLURGY_RAW_BY_TYPE[itemType];
      return `${item?.icon || '▪'} ${item?.label || itemType} × ${quantity}`;
    })
    .join(' + ');
}

export function formatMetallurgyMoney(value) {
  return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ru-RU')} ₴`;
}
