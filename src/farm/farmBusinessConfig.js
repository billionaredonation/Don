export const FARM_BUSINESS_PRICE = 1_000_000;
export const FARM_BUSINESS_LEGAL_FORM = 'ooo';
export const FARM_BUSINESS_LEGAL_LABEL = 'ООО';
export const FARM_TOWER_CAPACITY_LITERS = 500;
export const FARM_BUCKET_CAPACITY_LITERS = 10;
export const FARM_WAREHOUSE_CAPACITY = 100;
export const FARM_PLOT_INCOME = 300;
export const FARM_TOOL_DURABILITY_MAX = 100;
export const FARM_TOOL_DURABILITY_COST = 2.5;
export const FARM_TOOL_MIN_PRICE = 100;
export const FARM_SUPPLY_COSTS = Object.freeze({
  farm_rake: 70,
  farm_scissors: 70,
});

export function getFarmBusinessId(object = {}) {
  const payload = object?.payload || {};
  const type = String(object?.type || payload.jobType || payload.type || '');
  if (type === 'farm_station') return String(object?.id || payload.farmBusinessId || payload.farm_business_id || '').trim();
  return String(payload.farmBusinessId || payload.farm_business_id || '').trim();
}

export function isFarmBusinessLinkedObject(object = {}) {
  const type = String(object?.type || object?.payload?.jobType || object?.payload?.type || '');
  return type === 'farm_station' || type === 'farm_water_tower' || type === 'farm_water_barrel' || type.startsWith('farm_') && type.endsWith('_plant');
}
