export const FARM_MAX_ACTIVE_PLOTS = 5;
export const FARM_ACTION_DURATION_MS = 3000;

export const FARM_ITEMS = Object.freeze({
  farm_hoe: Object.freeze({ itemType: 'farm_hoe', label: 'Тяпка', price: 2, kind: 'tool', permanent: true }),
  farm_rake: Object.freeze({ itemType: 'farm_rake', label: 'Грабли', price: 2, kind: 'tool', permanent: true }),
  farm_water_bottle: Object.freeze({ itemType: 'farm_water_bottle', label: 'Вода для полива', price: 5, kind: 'water', waterUses: 2 }),
  farm_seed_apple: Object.freeze({ itemType: 'farm_seed_apple', label: 'Семена яблони', price: 0, kind: 'seed', cropType: 'apple' }),
  farm_seed_wheat: Object.freeze({ itemType: 'farm_seed_wheat', label: 'Семена пшеницы', price: 0, kind: 'seed', cropType: 'wheat' }),
  farm_apple: Object.freeze({ itemType: 'farm_apple', label: 'Яблоко', sellPrice: 10, kind: 'harvest' }),
  farm_wheat: Object.freeze({ itemType: 'farm_wheat', label: 'Пшеница', sellPrice: 35, kind: 'harvest' }),
});

export function getFarmItem(itemType) {
  return FARM_ITEMS[String(itemType || '').trim()] || null;
}
