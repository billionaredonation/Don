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
    icon: '🏠',
    asset: 'house_standard_01',
    scale: 1,
  },

  premium: {
    value: 'premium',
    label: 'Премиум',
    icon: '🏡',
    asset: 'house_premium_01',
    scale: 1.15,
  },

  lux: {
    value: 'lux',
    label: 'Люкс',
    icon: '🏛',
    asset: 'house_lux_01',
    scale: 1.35,
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

  business: {
    type: 'business',
    category: MAP_OBJECT_CATEGORIES.BUSINESS,
    label: 'Бизнес',
    icon: '$',
    defaultScale: 1,
    defaultRotation: 0,
    defaultAsset: 'business_01',
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

  marker: {
    type: 'marker',
    category: MAP_OBJECT_CATEGORIES.MARKER,
    label: 'Маркер',
    icon: '◆',
    defaultScale: 1,
    defaultRotation: 0,
    defaultAsset: 'marker_01',
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

  if (config.type === 'house') {
    const houseClass = getHouseClass(variant || 'standard');

    icon = houseClass.icon;
    asset = houseClass.asset;
    scale = houseClass.scale;
    objectName = name || `Дом · ${houseClass.label}`;

    nextPayload = {
      ...nextPayload,
      houseClass: houseClass.value,
      houseClassLabel: houseClass.label,
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
