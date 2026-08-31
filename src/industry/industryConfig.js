export const INDUSTRY_ROLES = Object.freeze({
  loader: { id: 'loader', label: 'Грузчик', icon: '🏋️', game: 'loading' },
  operator: { id: 'operator', label: 'Оператор станка', icon: '⚙️', game: 'operator' },
  quality: { id: 'quality', label: 'Контролёр качества', icon: '✅', game: 'inspection' },
});

const recipe = (id, label, icon, inputs, output, seconds, wage, operatorGame = 'timing') =>
  Object.freeze({
    id,
    label,
    icon,
    inputs: Object.freeze(inputs),
    output: Object.freeze(output),
    seconds,
    wage,
    operatorGame,
  });

const factory = (id, label, icon, storeType, rawGroups, recipes) =>
  Object.freeze({
    id,
    objectType: `industry_${id}`,
    label,
    icon,
    storeType,
    rawGroups: Object.freeze(rawGroups),
    recipes: Object.freeze(recipes),
    roles: Object.freeze(Object.keys(INDUSTRY_ROLES)),
  });

export const INDUSTRIES = Object.freeze({
  sawmill: factory('sawmill', 'Лесопильный завод', '🪚', 'furniture_store', ['lumber'], [
    recipe('dry_board', 'Сухая доска', '🪵', { lumber_log: 2 }, { wood_dry_board: 6 }, 80, 58, 'timing'),
    recipe('furniture_panel', 'Мебельный щит', '🟫', { lumber_beam: 6 }, { wood_furniture_panel: 2 }, 100, 72, 'sequence'),
  ]),
  building_materials: factory('building_materials', 'Завод стройматериалов', '🏗️', 'building_store', ['lumber', 'mine'], [
    recipe('board', 'Обрезная доска', '🪚', { lumber_log: 2 }, { construction_board: 6 }, 75, 55, 'timing'),
    recipe('timber', 'Строительный брус', '▰', { lumber_beam: 4 }, { construction_timber: 2 }, 90, 65, 'timing'),
    recipe('plywood', 'Фанерный лист', '🟫', { lumber_beam: 5 }, { construction_plywood: 3 }, 110, 75, 'sequence'),
  ]),
  cement: factory('cement', 'Цементный завод', '🏭', 'building_store', ['mine'], [
    recipe('cement', 'Цемент', '⚪', { mine_stone: 8, mine_coal: 2 }, { construction_cement: 5 }, 100, 78, 'cement'),
    recipe('concrete', 'Бетонная смесь', '🧱', { mine_stone: 6, construction_cement: 2 }, { construction_concrete: 4 }, 115, 88, 'concrete'),
  ]),
  metallurgy: factory('metallurgy', 'Металлургический комбинат', '🔥', 'metal_store', ['mine'], [
    recipe('steel', 'Стальной прокат', '🔩', { mine_metal: 8, mine_coal: 3 }, { metal_steel: 5 }, 120, 95, 'mixing'),
    recipe('copper', 'Медная катанка', '🟠', { mine_copper: 7, mine_coal: 2 }, { metal_copper: 4 }, 110, 92, 'timing'),
  ]),
  cable: factory('cable', 'Кабельный завод', '⚡', 'electric_store', ['metal'], [
    recipe('copper_wire', 'Медный провод', '🧵', { metal_copper: 3 }, { electric_copper_wire: 12 }, 80, 70, 'sequence'),
    recipe('power_cable', 'Силовой кабель', '🔌', { electric_copper_wire: 10 }, { electric_power_cable: 4 }, 105, 86, 'sequence'),
  ]),
  tools: factory('tools', 'Завод инструментов', '🛠️', 'tool_store', ['metal', 'wood'], [
    recipe('pickaxe', 'Кирка', '⛏️', { metal_steel: 2, wood_dry_board: 1 }, { mine_tool_pickaxe: 1 }, 100, 85, 'sequence'),
    recipe('axe', 'Топор', '🪓', { metal_steel: 2, wood_dry_board: 1 }, { lumber_tool_axe: 1 }, 100, 85, 'sequence'),
    recipe('chainsaw', 'Бензопила', '🪚', { metal_steel: 4, electric_power_cable: 1 }, { lumber_tool_chainsaw: 1 }, 150, 125, 'mixing'),
  ]),
});

export const INDUSTRY_STORES = Object.freeze({
  grocery: { type: 'grocery', label: 'Продуктовый магазин', icon: '🛒' },
  bakery: { type: 'bakery', label: 'Пекарня', icon: '🥖' },
  building_store: { type: 'building_store', label: 'Строительный магазин', icon: '🧱' },
  furniture_store: { type: 'furniture_store', label: 'Мебельный магазин', icon: '🛋️' },
  metal_store: { type: 'metal_store', label: 'Металлобаза', icon: '🔩' },
  electric_store: { type: 'electric_store', label: 'Магазин электрики', icon: '💡' },
  tool_store: { type: 'tool_store', label: 'Магазин инструментов', icon: '🧰' },
  logistics_hub: { type: 'logistics_hub', label: 'Логистический центр', icon: '🚚' },
});

export const getIndustry = id => INDUSTRIES[String(id || '').replace(/^industry_/, '')] || null;
