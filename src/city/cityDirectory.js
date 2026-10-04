import { supabase } from '../supabaseClient.js';

const BUSINESS_TYPES = new Set([
  'shop',
  'construction_store',
  'cafe',
  'gas_station',
  'bank',
  'warehouse',
  'office',
  'market',
  'accessory_store',
  'logistics_hub',
  'farm_station',
  'mine_station',
  'lumber_station',
  'fruit_factory',
  'textile_factory',
  'metallurgy_factory',
  'wood_processing_factory',
  'tool_assembly_factory',
  'hydro_power_plant',
  'coal_power_plant',
  'energy_substation',
  'water_treatment_plant',
  'car_factory',
  'car_dealer',
  'auto_service',
  'oil_well',
  'oil_refinery',
  'fuel_station',
  'ukrgaz_plant',
]);

const JOB_TYPES = new Set([
  'hospital',
  'farm_station',
  'mine_station',
  'lumber_station',
  'fruit_factory',
  'textile_factory',
  'metallurgy_factory',
  'wood_processing_factory',
  'tool_assembly_factory',
  'hydro_power_plant',
  'nuclear_power_plant',
  'coal_power_plant',
  'energy_substation',
  'water_treatment_plant',
  'car_factory',
  'car_dealer',
  'auto_service',
  'oil_well',
  'oil_refinery',
  'fuel_station',
  'ukrgaz_plant',
]);

const LABELS = Object.freeze({
  shop: ['🛒', 'Продуктовый магазин'],
  construction_store: ['🧰', 'Магазин стройматериалов'],
  cafe: ['☕', 'Кафе'],
  gas_station: ['⛽', 'Заправка'],
  bank: ['🏦', 'Банк'],
  warehouse: ['📦', 'Склад'],
  office: ['🏢', 'Офис'],
  market: ['🏪', 'Рынок'],
  accessory_store: ['👕', 'Магазин одежды и аксессуаров'],
  logistics_hub: ['🚚', 'Логистический центр'],
  hospital: ['🏥', 'Больница'],
  farm_station: ['🌾', 'Ферма'],
  mine_station: ['⛏️', 'Шахта'],
  lumber_station: ['🪓', 'Лесозаготовка'],
  fruit_factory: ['🏭', 'Пищевой завод'],
  textile_factory: ['🧵', 'Швейный завод'],
  metallurgy_factory: ['🔥', 'Металлургический завод'],
  wood_processing_factory: ['🪵', 'Деревоперерабатывающий завод'],
  tool_assembly_factory: ['🛠️', 'Завод инструментов'],
  hydro_power_plant: ['⚡', 'ГЭС'],
  nuclear_power_plant: ['☢️', 'АЭС'],
  coal_power_plant: ['🏭', 'УЭС'],
  energy_substation: ['⚡', 'Электрическая подстанция'],
  water_treatment_plant: ['💧', 'Водоочистное предприятие'],
  car_factory: ['🚗', 'Автомобильный завод'],
  car_dealer: ['🚘', 'Автосалон'],
  auto_service: ['🔧', 'СТО'],
  oil_well: ['🛢️', 'Нефтескважина'],
  oil_refinery: ['🏭', 'НПЗ'],
  fuel_station: ['⛽', 'АЗС'],
  ukrgaz_plant: ['🔥', 'УкрГаз'],
});

function payloadOf(row) {
  if (row?.payload && typeof row.payload === 'object') return row.payload;
  try {
    return JSON.parse(String(row?.payload || '{}')) || {};
  } catch {
    return {};
  }
}

function typeOf(row) {
  const payload = payloadOf(row);
  return String(
    row?.type ||
    payload.type ||
    payload.jobType ||
    payload.job_type ||
    payload.businessType ||
    payload.business_type ||
    ''
  ).trim();
}

function categoryOf(row) {
  const payload = payloadOf(row);
  return String(
    row?.category ||
    payload.category ||
    payload.kind ||
    ''
  ).trim();
}

function ownerOf(row) {
  const payload = payloadOf(row);
  return String(
    row?.owner_id ||
    row?.ownerId ||
    payload.ownerId ||
    payload.owner_id ||
    ''
  ).trim() || null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeObject(row) {
  const payload = payloadOf(row);
  const type = typeOf(row);
  const [icon = '•', defaultLabel = type || 'Объект'] = LABELS[type] || [];
  const label = String(
    payload.displayName ||
    payload.name ||
    payload.title ||
    row?.name ||
    defaultLabel
  ).trim() || defaultLabel;

  const x = numberOrNull(row?.x ?? payload.x);
  const y = numberOrNull(row?.y ?? payload.y);
  const ownerId = ownerOf(row);

  return {
    id: String(row?.id || payload.mapObjectId || payload.objectId || '').trim(),
    cityId: String(row?.city_id || payload.cityId || payload.city_id || '').trim(),
    type,
    category: categoryOf(row),
    icon,
    label,
    x,
    y,
    ownerId,
    ownerLabel: ownerId ? 'Игрок' : 'Государство',
  };
}

function isBusiness(row) {
  const type = typeOf(row);
  const category = categoryOf(row);
  return category === 'business' || BUSINESS_TYPES.has(type);
}

function isJob(row) {
  const type = typeOf(row);
  const category = categoryOf(row);
  return category === 'job' || JOB_TYPES.has(type);
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.id || `${item.type}:${item.x}:${item.y}:${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortItems(items) {
  return [...items].sort((a, b) =>
    a.label.localeCompare(b.label, 'ru') ||
    a.type.localeCompare(b.type, 'ru')
  );
}

export function getEmptyCityDirectory() {
  return {
    businesses: [],
    jobs: [],
    businessCount: 0,
    jobCount: 0,
  };
}

export async function fetchCityDirectory(cityId) {
  const safeCityId = String(cityId || '').trim();
  if (!safeCityId) return getEmptyCityDirectory();

  const { data, error } = await supabase
    .from('map_objects')
    .select('id,city_id,type,category,x,y,payload')
    .eq('city_id', safeCityId)
    .limit(1000);

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const businesses = sortItems(uniqueById(rows.filter(isBusiness).map(normalizeObject)));
  const jobs = sortItems(uniqueById(rows.filter(isJob).map(normalizeObject)));

  return {
    businesses,
    jobs,
    businessCount: businesses.length,
    jobCount: jobs.length,
  };
}
