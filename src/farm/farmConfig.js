export const FARM_PLANT_TYPES = Object.freeze({
  farm_wheat_plant: Object.freeze({
    objectType: 'farm_wheat_plant',
    cropType: 'wheat',
    label: 'Пшеница',
    icon: '🌾',
    harvestItemType: 'farm_wheat',
    respawnSeconds: 180,
  }),
  farm_apple_plant: Object.freeze({
    objectType: 'farm_apple_plant',
    cropType: 'apple',
    label: 'Яблоня',
    icon: '🍎',
    harvestItemType: 'farm_apple',
    respawnSeconds: 120,
  }),
  farm_orange_plant: Object.freeze({
    objectType: 'farm_orange_plant',
    cropType: 'orange',
    label: 'Апельсиновое дерево',
    icon: '🍊',
    harvestItemType: 'farm_orange',
    respawnSeconds: 120,
  }),
  farm_corn_plant: Object.freeze({
    objectType: 'farm_corn_plant',
    cropType: 'corn',
    label: 'Кукуруза',
    icon: '🌽',
    harvestItemType: 'farm_corn',
    respawnSeconds: 180,
  }),
});

export const FARM_ITEMS = Object.freeze({
  farm_rake: Object.freeze({ itemType: 'farm_rake', label: 'Грабли', price: 100, minPrice: 100, kind: 'tool', durability: 100, durabilityCost: 2.5 }),
  farm_scissors: Object.freeze({ itemType: 'farm_scissors', label: 'Ножницы', price: 100, minPrice: 100, kind: 'tool', durability: 100, durabilityCost: 2.5 }),
  farm_water_bottle: Object.freeze({ itemType: 'farm_water_bottle', label: 'Вода для полива', price: 5, kind: 'water', waterUses: 2 }),
  farm_apple: Object.freeze({ itemType: 'farm_apple', label: 'Яблоко', icon: '🍎', sellPrice: 10, kind: 'harvest' }),
  farm_wheat: Object.freeze({ itemType: 'farm_wheat', label: 'Пшеница', icon: '🌾', sellPrice: 35, kind: 'harvest' }),
  farm_orange: Object.freeze({ itemType: 'farm_orange', label: 'Апельсин', icon: '🍊', sellPrice: 15, kind: 'harvest' }),
  farm_corn: Object.freeze({ itemType: 'farm_corn', label: 'Кукуруза', icon: '🌽', sellPrice: 30, kind: 'harvest' }),
});

export function getFarmItem(itemType) {
  return FARM_ITEMS[String(itemType || '').trim()] || null;
}

export function getFarmPlantType(objectType) {
  return FARM_PLANT_TYPES[String(objectType || '').trim()] || null;
}

