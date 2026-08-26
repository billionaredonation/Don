export const FACTORY_CONFIG = Object.freeze({
  purchasePrice: 3_500_000,
  rawCapacity: 2_000,
  productCapacity: 1_500,
  legalForms: Object.freeze(['ТОВ', 'АТ', 'Кооператив']),
});

export const FACTORY_RECIPES = Object.freeze({
  apple_juice: Object.freeze({ id: 'apple_juice', label: 'Яблочный сок', icon: '🧃', input: 'farm_apple', inputLabel: 'Яблоки', inputIcon: '🍎', inputQty: 5, outputQty: 3, seconds: 60, wage: 45 }),
  orange_juice: Object.freeze({ id: 'orange_juice', label: 'Апельсиновый сок', icon: '🥤', input: 'farm_orange', inputLabel: 'Апельсины', inputIcon: '🍊', inputQty: 5, outputQty: 3, seconds: 75, wage: 50 }),
  fruit_puree: Object.freeze({ id: 'fruit_puree', label: 'Фруктовое пюре', icon: '🥫', input: 'farm_apple', inputLabel: 'Яблоки', inputIcon: '🍎', inputQty: 8, outputQty: 4, seconds: 90, wage: 65 }),
});

export const FACTORY_RAW_ITEMS = Object.freeze([
  { itemType: 'farm_apple', label: 'Яблоки', icon: '🍎' },
  { itemType: 'farm_orange', label: 'Апельсины', icon: '🍊' },
]);

export function getFactoryRecipe(id) { return FACTORY_RECIPES[String(id || '').trim()] || null; }
export function formatFactoryMoney(value) { return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ru-RU')} ₴`; }

