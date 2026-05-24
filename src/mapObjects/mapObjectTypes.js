export const MAP_OBJECT_CATEGORIES = {
  DECOR: 'decor',
  HOUSE: 'house',
  BUSINESS: 'business',
  NPC: 'npc',
  MARKER: 'marker',
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
    icon: '⌂',
    defaultScale: 1,
    defaultRotation: 0,
    defaultAsset: 'house_01',
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

export function createMapObjectDraft({
  cityId,
  type = 'marker',
  x = 50,
  y = 50,
  name = '',
  payload = {},
}) {
  const config = getMapObjectType(type);

  return {
    id: `${type}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    cityId,
    type: config.type,
    category: config.category,
    name: name || config.label,
    icon: config.icon,
    asset: config.defaultAsset,
    x: Number(x),
    y: Number(y),
    rotation: config.defaultRotation,
    scale: config.defaultScale,
    payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
