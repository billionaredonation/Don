export const FARM_ACTION_DURATION_MS = 3000;

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
});

export const FARM_ITEMS = Object.freeze({
  farm_rake: Object.freeze({ itemType: 'farm_rake', label: 'Грабли', price: 2, kind: 'tool', permanent: true }),
  farm_scissors: Object.freeze({ itemType: 'farm_scissors', label: 'Ножницы', price: 2, kind: 'tool', permanent: true }),
  farm_water_bottle: Object.freeze({ itemType: 'farm_water_bottle', label: 'Вода для полива', price: 5, kind: 'water', waterUses: 2 }),
  farm_apple: Object.freeze({ itemType: 'farm_apple', label: 'Яблоко', sellPrice: 10, kind: 'harvest' }),
  farm_wheat: Object.freeze({ itemType: 'farm_wheat', label: 'Пшеница', sellPrice: 35, kind: 'harvest' }),
});

export function getFarmItem(itemType) {
  return FARM_ITEMS[String(itemType || '').trim()] || null;
}

export function getFarmPlantType(objectType) {
  return FARM_PLANT_TYPES[String(objectType || '').trim()] || null;
}
