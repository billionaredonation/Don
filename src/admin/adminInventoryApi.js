import { supabase } from '../supabaseClient.js';

const ADMIN_INVENTORY_FUNCTION = 'admin-inventory';

function mineQualityItems(prefix, label, icon = '⛏️') {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `${prefix}_q${index + 1}`,
    label: `${icon} ${label} · качество ${index + 1}`,
    category: 'Шахта · добыча',
  }));
}

/*
 * Единый админ-каталог предметов MN-GAME.
 * Включает:
 * - текущие игровые предметы из frontend-конфигов;
 * - все 40 вариантов шахтного сырья q1-q5;
 * - производственные полуфабрикаты;
 * - legacy-предметы, которые всё ещё присутствуют в RPC/БД.
 *
 * Object types (farm_*_plant, mine_*_node и т.п.) сюда намеренно НЕ входят:
 * это объекты карты, а не предметы инвентаря.
 */
const ADMIN_ITEMS = Object.freeze([
  // Игрок / медицина
  { id: 'food', label: '🍔 Обед', category: 'Игрок' },
  { id: 'water_bottle', label: '💧 Бутылка воды', category: 'Игрок' },
  { id: 'medicine_light', label: '💊 Простые таблетки', category: 'Медицина' },
  { id: 'medicine_strong', label: '💉 Среднеседативные таблетки', category: 'Медицина' },
  { id: 'medicine_resuscitation', label: '⚕ Сильные седативные таблетки', category: 'Медицина' },

  // Ферма — актуальная система
  { id: 'farm_rake', label: '🧹 Грабли', category: 'Ферма' },
  { id: 'farm_scissors', label: '✂️ Садовые ножницы', category: 'Ферма' },
  { id: 'farm_water_bottle', label: '💧 Вода для полива', category: 'Ферма' },
  { id: 'farm_water_bucket', label: '🪣 Ведро', category: 'Ферма' },
  { id: 'farm_apple', label: '🍎 Яблоко', category: 'Ферма · урожай' },
  { id: 'farm_orange', label: '🍊 Апельсин', category: 'Ферма · урожай' },
  { id: 'farm_wheat', label: '🌾 Пшеница', category: 'Ферма · урожай' },
  { id: 'farm_corn', label: '🌽 Кукуруза', category: 'Ферма · урожай' },

  // Ферма — legacy, всё ещё существует в RPC/БД
  { id: 'farm_hoe', label: '⌁ Тяпка · legacy', category: 'Ферма · старые предметы' },
  { id: 'farm_water_charge', label: '💧 Заряд воды · legacy', category: 'Ферма · старые предметы' },
  { id: 'farm_seed_apple', label: '🌱 Семена яблони · legacy', category: 'Ферма · старые предметы' },
  { id: 'farm_seed_wheat', label: '🌱 Семена пшеницы · legacy', category: 'Ферма · старые предметы' },

  // Шахта
  { id: 'mine_tool_pickaxe', label: '⛏️ Шахтёрская кирка', category: 'Шахта · инструменты' },

  ...mineQualityItems('mine_stone_common', 'Обычный камень', '🪨'),
  ...mineQualityItems('mine_stone_dense', 'Плотный камень', '🪨'),
  ...mineQualityItems('mine_coal_common', 'Обыкновенный уголь', '⚫'),
  ...mineQualityItems('mine_coal_technical', 'Технический уголь', '🧱'),
  ...mineQualityItems('mine_metal_raw', 'Сырой металл', '🔩'),
  ...mineQualityItems('mine_metal_technical', 'Технический металл', '⛓️'),
  ...mineQualityItems('mine_copper_raw', 'Медная руда', '🟤'),
  ...mineQualityItems('mine_copper_conductive', 'Богатая медная руда', '🟠'),

  // Нормализованное сырьё промышленности.
  // Это не добываемые q-предметы, но эти item_type реально используются заводскими RPC.
  { id: 'mine_stone', label: '🪨 Камень · сырьё завода', category: 'Промышленность · служебное сырьё', storage: 'industry' },
  { id: 'mine_coal', label: '⚫ Уголь · сырьё завода', category: 'Промышленность · служебное сырьё', storage: 'industry' },
  { id: 'mine_metal', label: '⚙️ Металл · сырьё завода', category: 'Промышленность · служебное сырьё', storage: 'industry' },
  { id: 'mine_copper', label: '🟠 Медь · сырьё завода', category: 'Промышленность · служебное сырьё', storage: 'industry' },

  // Лесозаготовка
  { id: 'lumber_tool_axe', label: '🪓 Топор лесоруба', category: 'Лесозаготовка' },
  { id: 'lumber_tool_chainsaw', label: '🪚 Бензопила', category: 'Лесозаготовка' },
  { id: 'lumber_log', label: '🪵 Бревно', category: 'Лесозаготовка' },
  { id: 'lumber_beam', label: '▰ Брус', category: 'Лесозаготовка' },

  // Продуктовый магазин / старые базовые товары
  { id: 'grocery_bread', label: '🍞 Хлеб', category: 'Продуктовый магазин' },
  { id: 'grocery_milk', label: '🥛 Молоко', category: 'Продуктовый магазин' },
  { id: 'grocery_apple', label: '🍎 Яблоко · магазин', category: 'Продуктовый магазин' },
  { id: 'grocery_canned_food', label: '🥫 Консервы', category: 'Продуктовый магазин' },
  { id: 'grocery_water', label: '💧 Вода · магазин', category: 'Продуктовый магазин' },
  { id: 'grocery_snack', label: '🍪 Снеки', category: 'Продуктовый магазин' },

  // Единый завод по производству питания
  { id: 'grocery_bread', label: '🍞 Хлеб', category: 'Завод питания' },
  { id: 'grocery_pasta', label: '🍝 Макароны (1 кг)', category: 'Завод питания' },
  { id: 'grocery_diet_fruit_salad', label: '🥗 Салат диетический', category: 'Завод питания' },
  { id: 'grocery_universal_fruit_salad', label: '🥙 Салат универсальный фруктовый', category: 'Завод питания' },
  { id: 'grocery_multifruit_juice', label: '🧃 Сок мультифрукт', category: 'Завод питания' },

]);

export function getAdminInventoryCatalog() {
  return [...ADMIN_ITEMS];
}

export function resolveAdminInventoryItem(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const lower = raw.toLocaleLowerCase('ru');
  const found = ADMIN_ITEMS.find((item) =>
    item.id.toLocaleLowerCase('ru') === lower ||
    item.label.toLocaleLowerCase('ru') === lower ||
    `${item.label} — ${item.id}`.toLocaleLowerCase('ru') === lower
  );
  return found || { id: raw, label: raw, category: 'Ручной item_type', storage: 'auto' };
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

export async function grantAdminInventoryItem({ itemType, quantity, storage = 'auto' }) {
  const initData = String(window.Telegram?.WebApp?.initData || '').trim();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');

  const resolved = resolveAdminInventoryItem(itemType);
  const resolvedStorage = storage === 'auto' && resolved?.storage ? resolved.storage : storage;

  const { data, error } = await supabase.functions.invoke(ADMIN_INVENTORY_FUNCTION, {
    body: {
      initData,
      action: 'grant_self',
      itemType: String(resolved?.id || itemType || '').trim(),
      quantity: Math.floor(Number(quantity || 0)),
      storage: String(resolvedStorage || 'auto').trim().toLowerCase(),
    },
  });

  if (error) throw await normalizeFunctionError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'ADMIN_GRANT_FAILED');
  return data.result || {};
}
