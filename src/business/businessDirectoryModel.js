const BUSINESS_TYPES = new Set([
  'shop',
  'construction_store',
  'weapon_store',
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
  'nuclear_power_plant',
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
  weapon_store: ['🛡️', 'Магазин оружия'],
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

export function payloadOf(row) {
  if (row?.payload && typeof row.payload === 'object') return row.payload;
  try {
    return JSON.parse(String(row?.payload || '{}')) || {};
  } catch {
    return {};
  }
}

export function typeOf(row) {
  const payload = payloadOf(row);
  const candidates = [payload.jobType, payload.job_type, payload.businessType,
    payload.business_type, payload.type, row?.type].map(value => String(value || '').trim().toLowerCase());
  return candidates.find(type => LABELS[type]) || candidates.find(Boolean) || '';
}

export function categoryOf(row) {
  const payload = payloadOf(row);
  return String(
    row?.category ||
    payload.category ||
    payload.kind ||
    ''
  ).trim();
}

export function ownerOf(row) {
  const payload = payloadOf(row);
  return [row?.owner_tg_id, row?.ownerTgId, payload.ownerTgId, payload.owner_tg_id,
    row?.owner_id, row?.ownerId, payload.ownerId, payload.owner_id]
    .map(value => String(value ?? '').trim()).find(Boolean) || null;
}

export function businessInfo(row) {
  const type = typeOf(row);
  const [icon, label] = LABELS[type] || ['🏢', 'Предприятие'];
  return { type, icon, label };
}

export function isDirectoryBusiness(row) {
  return BUSINESS_TYPES.has(typeOf(row)) || categoryOf(row) === 'business';
}

export function isDirectoryJob(row) {
  return JOB_TYPES.has(typeOf(row)) || categoryOf(row) === 'job';
}

