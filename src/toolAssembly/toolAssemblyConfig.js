export const TOOL_ASSEMBLY_CONFIG = Object.freeze({
  type: 'tool_assembly_factory', label: 'Завод по сборке инструментов', icon: '🛠️', purchasePrice: 3_500_000, legalForm: 'ТОВ',
});

export const TOOL_ASSEMBLY_INPUT_ITEMS = Object.freeze([
  { itemType: 'rake_head', label: 'Металлическая часть граблей', icon: 'Г' },
  { itemType: 'rake_handle', label: 'Держатель для граблей', icon: '▰' },
  { itemType: 'pickaxe_metal_part', label: 'Металлическая часть кирки', icon: '⛏️' },
  { itemType: 'pickaxe_handle', label: 'Ручка кирки', icon: '▰' },
  { itemType: 'scissors_metal_part', label: 'Металлическая часть ножниц', icon: '✂️' },
  { itemType: 'scissors_handles', label: 'Пара ручек для ножниц', icon: '▰' },
  { itemType: 'hand_saw_metal_part', label: 'Металлическая часть ручной пилы', icon: '🪚' },
  { itemType: 'hand_saw_handle', label: 'Ручка для пилы', icon: '▰' },
  { itemType: 'axe_head', label: 'Металлическая часть топора', icon: '🪓' },
  { itemType: 'axe_handle', label: 'Ручка топора', icon: '▰' },
  { itemType: 'chainsaw_chain', label: 'Цепь бензопилы', icon: '⛓️' },
  { itemType: 'chainsaw_engine', label: 'Двигатель бензопилы', icon: '⚙️' },
].map(Object.freeze));

const recipe = (id, label, icon, inputs) => Object.freeze({ id, label, icon, outputQty: 1, inputs: Object.freeze(inputs), destinations: Object.freeze(['construction_store']) });
export const TOOL_ASSEMBLY_RECIPES = Object.freeze({
  farm_rake: recipe('farm_rake', 'Готовые грабли', 'Г', { rake_head: 1, rake_handle: 1 }),
  mine_tool_pickaxe: recipe('mine_tool_pickaxe', 'Готовая кирка', '⛏️', { pickaxe_metal_part: 1, pickaxe_handle: 1 }),
  farm_scissors: recipe('farm_scissors', 'Готовые ножницы', '✂️', { scissors_metal_part: 1, scissors_handles: 1 }),
  construction_hand_saw: recipe('construction_hand_saw', 'Готовая ручная пила', '🪚', { hand_saw_metal_part: 1, hand_saw_handle: 1 }),
  lumber_tool_axe: recipe('lumber_tool_axe', 'Готовый топор', '🪓', { axe_head: 1, axe_handle: 1 }),
  lumber_tool_chainsaw: recipe('lumber_tool_chainsaw', 'Готовая бензопила', '⚙️', { chainsaw_chain: 1, chainsaw_engine: 1 }),
});

export const TOOL_ASSEMBLY_DESTINATIONS = Object.freeze({ construction_store: 'Магазин стройматериалов' });
export const TOOL_ASSEMBLY_INPUT_BY_TYPE = Object.freeze(Object.fromEntries(TOOL_ASSEMBLY_INPUT_ITEMS.map((item) => [item.itemType, item])));
export function formatToolInputs(inputs = {}) {
  return Object.entries(inputs).map(([type, quantity]) => { const item = TOOL_ASSEMBLY_INPUT_BY_TYPE[type]; return `${item?.icon || '▪'} ${item?.label || type} × ${quantity}`; }).join(' + ');
}
export const formatToolMoney = (value) => `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ru-RU')} ₴`;
