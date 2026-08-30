import { supabase } from '../supabaseClient.js';

const ADMIN_INVENTORY_FUNCTION = 'admin-inventory';

const KNOWN_ITEMS = Object.freeze([
  'food', 'water_bottle',
  'medicine_light', 'medicine_strong', 'medicine_resuscitation',
  'farm_rake', 'farm_scissors', 'farm_water_bottle', 'farm_apple', 'farm_orange', 'farm_wheat', 'farm_corn',
  'mine_tool_pickaxe',
  'mine_stone_common_q1','mine_stone_common_q2','mine_stone_common_q3','mine_stone_common_q4','mine_stone_common_q5',
  'mine_stone_dense_q1','mine_stone_dense_q2','mine_stone_dense_q3','mine_stone_dense_q4','mine_stone_dense_q5',
  'mine_coal_common_q1','mine_coal_common_q2','mine_coal_common_q3','mine_coal_common_q4','mine_coal_common_q5',
  'mine_coal_technical_q1','mine_coal_technical_q2','mine_coal_technical_q3','mine_coal_technical_q4','mine_coal_technical_q5',
  'mine_metal_raw_q1','mine_metal_raw_q2','mine_metal_raw_q3','mine_metal_raw_q4','mine_metal_raw_q5',
  'mine_metal_technical_q1','mine_metal_technical_q2','mine_metal_technical_q3','mine_metal_technical_q4','mine_metal_technical_q5',
  'mine_copper_raw_q1','mine_copper_raw_q2','mine_copper_raw_q3','mine_copper_raw_q4','mine_copper_raw_q5',
  'mine_copper_conductive_q1','mine_copper_conductive_q2','mine_copper_conductive_q3','mine_copper_conductive_q4','mine_copper_conductive_q5',
  'lumber_tool_axe', 'lumber_tool_chainsaw', 'lumber_log', 'lumber_beam',
  'construction_board', 'construction_timber', 'construction_plywood', 'construction_cement', 'construction_concrete',
  'grocery_bread', 'grocery_milk', 'grocery_apple', 'grocery_canned_food', 'grocery_water', 'grocery_snack',
  'grocery_apple_juice', 'grocery_orange_juice', 'grocery_fruit_puree',
  'food_wheat_flour', 'food_corn_flour', 'wood_dry_board', 'wood_furniture_panel',
  'metal_steel', 'metal_copper', 'electric_copper_wire', 'electric_power_cable',
]);

export function getAdminInventoryCatalog() {
  return [...KNOWN_ITEMS].sort((a, b) => a.localeCompare(b));
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

  const { data, error } = await supabase.functions.invoke(ADMIN_INVENTORY_FUNCTION, {
    body: {
      initData,
      action: 'grant_self',
      itemType: String(itemType || '').trim(),
      quantity: Math.floor(Number(quantity || 0)),
      storage: String(storage || 'auto').trim().toLowerCase(),
    },
  });

  if (error) throw await normalizeFunctionError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'ADMIN_GRANT_FAILED');
  return data.result || {};
}
