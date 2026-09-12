import { supabase } from '../supabaseClient.js';
import { TEXTILE_PRODUCTS } from '../textile/textileConfig.js';

const ADMIN_INVENTORY_FUNCTION = 'admin-inventory';

function mineQualityItems(prefix, label, icon = '⛏️') {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `${prefix}_q${index + 1}`,
    label: `${icon} ${label} · качество ${index + 1}`,
    category: 'Шахта · добыча',
  }));
}

// Только предметы, которые реально существуют в текущей игре.
// Заводские полуфабрикаты остаются на складах предприятий и в админ-каталог не попадают.
const ADMIN_ITEMS = Object.freeze([
  { id: 'food', label: '🍔 Обед', category: 'Игрок' },
  { id: 'water_bottle', label: '💧 Бутылка воды', category: 'Игрок' },
  { id: 'medicine_light', label: '💊 Простые таблетки', category: 'Медицина' },
  { id: 'medicine_strong', label: '💉 Среднеседативные таблетки', category: 'Медицина' },
  { id: 'medicine_resuscitation', label: '⚕ Сильные седативные таблетки', category: 'Медицина' },
  { id: 'farm_rake', label: '🧹 Грабли', category: 'Ферма' },
  { id: 'farm_scissors', label: '✂️ Садовые ножницы', category: 'Ферма' },
  { id: 'farm_water_bottle', label: '💧 Вода для полива', category: 'Ферма' },
  { id: 'farm_water_bucket', label: '🪣 Ведро', category: 'Ферма' },
  { id: 'farm_apple', label: '🍎 Яблоко', category: 'Ферма · урожай' },
  { id: 'farm_orange', label: '🍊 Апельсин', category: 'Ферма · урожай' },
  { id: 'farm_wheat', label: '🌾 Пшеница', category: 'Ферма · урожай' },
  { id: 'farm_corn', label: '🌽 Кукуруза', category: 'Ферма · урожай' },
  { id: 'farm_flax', label: '🪻 Лён', category: 'Ферма · урожай' },
  { id: 'farm_cotton', label: '☁️ Хлопок', category: 'Ферма · урожай' },
  { id: 'mine_tool_pickaxe', label: '⛏️ Шахтёрская кирка', category: 'Шахта' },
  ...mineQualityItems('mine_stone_common', 'Обычный камень', '🪨'),
  ...mineQualityItems('mine_stone_dense', 'Плотный камень', '🗿'),
  ...mineQualityItems('mine_coal_common', 'Обыкновенный уголь', '⚫'),
  ...mineQualityItems('mine_coal_technical', 'Технический уголь', '🧱'),
  ...mineQualityItems('mine_metal_raw', 'Сырой металл', '🔩'),
  ...mineQualityItems('mine_metal_technical', 'Технический металл', '⛓️'),
  ...mineQualityItems('mine_copper_raw', 'Медная руда', '🟤'),
  ...mineQualityItems('mine_copper_conductive', 'Богатая медная руда', '🟠'),
  { id: 'lumber_tool_axe', label: '🪓 Топор лесоруба', category: 'Лесорубка' },
  { id: 'lumber_tool_chainsaw', label: '🪚 Бензопила', category: 'Лесорубка' },
  { id: 'lumber_log', label: '🪵 Бревно', category: 'Лесорубка' },
  { id: 'lumber_beam', label: '▰ Брус', category: 'Лесорубка' },
  { id: 'construction_hand_saw', label: '🪚 Ручная пила', category: 'Инструменты' },
  { id: 'grocery_bread', label: '🍞 Хлеб', category: 'Еда' },
  { id: 'grocery_pasta', label: '🍝 Макароны (1 кг)', category: 'Еда' },
  { id: 'grocery_diet_fruit_salad', label: '🥗 Салат диетический', category: 'Еда' },
  { id: 'grocery_universal_fruit_salad', label: '🥙 Салат универсальный фруктовый', category: 'Еда' },
  { id: 'grocery_multifruit_juice', label: '🧃 Сок мультифрукт', category: 'Еда' },
  ...TEXTILE_PRODUCTS.filter(Boolean).map((item) => ({
    id: item.itemType,
    label: `${item.icon} ${item.label}`,
    category: 'Одежда и обувь',
  })),
]);

export function getAdminInventoryCatalog() {
  const uniqueItems = new Map();
  ADMIN_ITEMS.filter(Boolean).forEach((item) => {
    if (!uniqueItems.has(item.id)) uniqueItems.set(item.id, { ...item, storage: 'business' });
  });
  return [...uniqueItems.values()].sort((left, right) => (
    left.category.localeCompare(right.category, 'ru') || left.label.localeCompare(right.label, 'ru')
  ));
}

function normalizeAdminItemSearch(value) {
  return String(value || '').toLocaleLowerCase('ru')
    .replace(/[^\p{L}\p{N}_]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function resolveAdminInventoryItem(value) {
  const normalized = normalizeAdminItemSearch(value);
  if (!normalized) return null;
  return getAdminInventoryCatalog().find((item) => (
    normalizeAdminItemSearch(item.id) === normalized ||
    normalizeAdminItemSearch(item.label) === normalized ||
    normalizeAdminItemSearch(`${item.label} ${item.id}`) === normalized
  )) || null;
}

async function normalizeFunctionError(error) {
  const source = error?.context || error;
  let remote = '';
  if (typeof source?.clone === 'function') {
    try {
      const payload = await source.clone().json();
      remote = [payload?.error, payload?.message, payload?.reason].filter(Boolean).join(' ');
    } catch {}
  }
  return new Error([remote, error?.message, error?.details].filter(Boolean).join(' ') || 'ADMIN_GRANT_FAILED');
}

export function getAdminInventoryErrorMessage(error) {
  const raw = String(error?.message || error || 'ADMIN_GRANT_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите игру.',
    SERVER_NOT_CONFIGURED: 'Сервер админской выдачи предметов не настроен.',
    ADMIN_REQUIRED: 'Выдавать предметы может только администратор.',
    ADMIN_ITEM_TYPE_INVALID: 'Такого предмета нет в текущем игровом каталоге.',
    ADMIN_QUANTITY_INVALID: 'Введите количество от 1 до 1 000 000 000.',
  };
  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

export async function grantAdminInventoryItem({ itemType, quantity }) {
  const initData = String(window.Telegram?.WebApp?.initData || '').trim();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const resolved = resolveAdminInventoryItem(itemType);
  if (!resolved) throw new Error('ADMIN_ITEM_TYPE_INVALID');

  const { data, error } = await supabase.functions.invoke(ADMIN_INVENTORY_FUNCTION, {
    body: { initData, action: 'grant_self', itemType: resolved.id, quantity: Math.floor(Number(quantity || 0)) },
  });
  if (error) throw await normalizeFunctionError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'ADMIN_GRANT_FAILED');
  return data.result || {};
}

