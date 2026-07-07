export const MAP_OBJECT_CATEGORIES = {
  DECOR: 'decor',
  HOUSE: 'house',
  BUSINESS: 'business',
  NPC: 'npc',
  MARKER: 'marker',
};

export const HOUSE_CLASSES = {
  standard: {
    value: 'standard',
    label: 'Стандарт',
    shortLabel: 'STD',
    icon: '🏠',
    asset: 'house_standard_01',
    scale: 1.12,
    price: 15000,
    rentPerHour: 15,
    statusText: 'Базовый дом',
    visualClass: 'standard',
  },

  premium: {
    value: 'premium',
    label: 'Премиум',
    shortLabel: 'PREM',
    icon: '🏡',
    asset: 'house_premium_01',
    scale: 1.24,
    price: 85000,
    rentPerHour: 85,
    statusText: 'Премиум жильё',
    visualClass: 'premium',
  },

  ultra_lux: {
    value: 'ultra_lux',
    label: 'Ультра люкс',
    shortLabel: 'ULTRA',
    icon: '🏛️',
    asset: 'house_lux_01',
    scale: 1.38,
    price: 250000,
    rentPerHour: 250,
    statusText: 'Ультра-люксовая недвижимость',
    visualClass: 'ultra_lux',
  },
};

export const MAP_OBJECT_TYPES = {
  tree: {
    type: 'tree',
    category: MAP_OBJECT_CATEGORIES.DECOR,
    label: 'Дерево',
    icon: '🌳',
    defaultScale: 1,
    defaultRotation: 0,
    defaultAsset: 'tree_01',
  },

  rock: {
    type: 'rock',
    category: MAP_OBJECT_CATEGORIES.DECOR,
    label: 'Камень',
    icon: '🪨',
    defaultScale: 1,
    defaultRotation: 0,
    defaultAsset: 'rock_01',
  },

  bench: {
    type: 'bench',
    category: MAP_OBJECT_CATEGORIES.DECOR,
    label: 'Лавка',
    icon: '🪑',
    defaultScale: 0.9,
    defaultRotation: 0,
    defaultAsset: 'bench_01',
  },

  lamp: {
    type: 'lamp',
    category: MAP_OBJECT_CATEGORIES.DECOR,
    label: 'Фонарь',
    icon: '💡',
    defaultScale: 0.85,
    defaultRotation: 0,
    defaultAsset: 'lamp_01',
  },

  house: {
    type: 'house',
    category: MAP_OBJECT_CATEGORIES.HOUSE,
    label: 'Дом',
    icon: '🏠',
    defaultScale: 1,
    defaultRotation: 0,
    defaultAsset: 'house_standard_01',
    variants: HOUSE_CLASSES,
  },

  shop: {
    type: 'shop',
    category: MAP_OBJECT_CATEGORIES.BUSINESS,
    label: 'Магазин',
    icon: '🛒',
    defaultScale: 1.12,
    defaultRotation: 0,
    defaultAsset: 'business_shop_01',
  },

  cafe: {
    type: 'cafe',
    category: MAP_OBJECT_CATEGORIES.BUSINESS,
    label: 'Кафе',
    icon: '☕',
    defaultScale: 1.08,
    defaultRotation: 0,
    defaultAsset: 'business_cafe_01',
  },

  gas_station: {
    type: 'gas_station',
    category: MAP_OBJECT_CATEGORIES.BUSINESS,
    label: 'Заправка',
    icon: '⛽',
    defaultScale: 1.16,
    defaultRotation: 0,
    defaultAsset: 'business_gas_01',
  },

  bank: {
    type: 'bank',
    category: MAP_OBJECT_CATEGORIES.BUSINESS,
    label: 'Банк',
    icon: '🏦',
    defaultScale: 1.18,
    defaultRotation: 0,
    defaultAsset: 'business_bank_01',
  },

  warehouse: {
    type: 'warehouse',
    category: MAP_OBJECT_CATEGORIES.BUSINESS,
    label: 'Склад',
    icon: '📦',
    defaultScale: 1.15,
    defaultRotation: 0,
    defaultAsset: 'business_warehouse_01',
  },

  office: {
    type: 'office',
    category: MAP_OBJECT_CATEGORIES.BUSINESS,
    label: 'Офис',
    icon: '🏢',
    defaultScale: 1.14,
    defaultRotation: 0,
    defaultAsset: 'business_office_01',
  },

  market: {
    type: 'market',
    category: MAP_OBJECT_CATEGORIES.BUSINESS,
    label: 'Рынок',
    icon: '🏪',
    defaultScale: 1.1,
    defaultRotation: 0,
    defaultAsset: 'business_market_01',
  },

  npc: {
    type: 'npc',
    category: MAP_OBJECT_CATEGORIES.NPC,
    label: 'NPC',
    icon: '●',
    defaultScale: 1,
    defaultRotation: 0,
    defaultAsset: 'npc_01',
  },

  quest_npc: {
    type: 'quest_npc',
    category: MAP_OBJECT_CATEGORIES.NPC,
    label: 'NPC квест',
    icon: '❗',
    defaultScale: 1,
    defaultRotation: 0,
    defaultAsset: 'npc_quest_01',
  },

  marker: {
    type: 'marker',
    category: MAP_OBJECT_CATEGORIES.MARKER,
    label: 'Маркер',
    icon: '◆',
    defaultScale: 1,
    defaultRotation: 0,
    defaultAsset: 'marker_01',
  },

  spawn: {
    type: 'spawn',
    category: MAP_OBJECT_CATEGORIES.MARKER,
    label: 'Спавн',
    icon: '📍',
    defaultScale: 1,
    defaultRotation: 0,
    defaultAsset: 'marker_spawn_01',
  },
};

export function getMapObjectType(type) {
  return MAP_OBJECT_TYPES[type] || MAP_OBJECT_TYPES.marker;
}

export function getMapObjectTypesList() {
  return Object.values(MAP_OBJECT_TYPES);
}

export function getHouseClass(value) {
  return HOUSE_CLASSES[value] || HOUSE_CLASSES.standard;
}

export function getHouseClassesList() {
  return Object.values(HOUSE_CLASSES);
}

export function createMapObjectDraft({
  cityId,
  type = 'marker',
  variant = '',
  x = 50,
  y = 50,
  name = '',
  payload = {},
}) {
  const config = getMapObjectType(type);

  let icon = config.icon;
  let asset = config.defaultAsset;
  let scale = config.defaultScale;
  let objectName = name || config.label;
  let nextPayload = { ...payload };

  if (config.category === MAP_OBJECT_CATEGORIES.HOUSE) {
    const houseClass = getHouseClass(variant || 'standard');

    icon = houseClass.icon;
    asset = houseClass.asset;
    scale = houseClass.scale;
    objectName = name || `Дом · ${houseClass.label}`;

    nextPayload = {
      ...nextPayload,
      kind: 'house',
      houseClass: houseClass.value,
      houseClassLabel: houseClass.label,
      houseClassShortLabel: houseClass.shortLabel,
      visualClass: houseClass.visualClass,
      statusText: houseClass.statusText,
      price: nextPayload.price || houseClass.price,
      rentPerHour: nextPayload.rentPerHour || houseClass.rentPerHour,
      buyable: nextPayload.buyable ?? true,
      ownerId: nextPayload.ownerId || null,
      locked: nextPayload.locked || false,
    };
  }

  if (config.category === MAP_OBJECT_CATEGORIES.BUSINESS) {
    objectName = name || config.label;

    nextPayload = {
      ...nextPayload,
      kind: 'business',
      businessType: config.type,
      businessLabel: config.label,
      ownerId: nextPayload.ownerId || null,
      incomePerHour: nextPayload.incomePerHour || 0,
      price: nextPayload.price || 0,
      buyable: nextPayload.buyable ?? true,
    };
  }

  if (config.category === MAP_OBJECT_CATEGORIES.DECOR) {
    nextPayload = {
      ...nextPayload,
      kind: 'decor',
      collision: nextPayload.collision || false,
    };
  }

  return {
    id: `${config.type}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    cityId,
    type: config.type,
    category: config.category,
    variant: variant || '',
    name: objectName,
    icon,
    asset,
    x: Number(x),
    y: Number(y),
    rotation: config.defaultRotation,
    scale,
    payload: nextPayload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

