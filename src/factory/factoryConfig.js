export const FACTORY_CONFIG = Object.freeze({
  purchasePrice: 3_500_000,
  rawCapacity: 2_000,
  productCapacity: 1_500,
  legalForms: Object.freeze(['ТОВ', 'АТ', 'Кооператив']),
});

export const FACTORY_RECIPES = Object.freeze({
  apple_juice: Object.freeze({ id: 'apple_juice', label: 'Яблочный сок', icon: '🧃', input: 'farm_apple', inputLabel: 'Яблоки', inputIcon: '🍎', inputQty: 5, outputQty: 3, seconds: 60, wage: 45 }),
  orange_juice: Object.freeze({ id: 'orange_juice', label: 'Апельсиновый сок', icon: '🥤', input: 'farm_orange', inputLabel: 'Апельсины', inputIcon: '🍊', inputQty: 5, outputQty: 3, seconds: 75, wage: 50 }),
  fruit_salad: Object.freeze({ id: 'fruit_salad', label: 'Фруктовый салат', icon: '🥗', inputs: Object.freeze({ farm_apple: 4, farm_orange: 4 }), inputLabel: 'Яблоки + апельсины', inputIcon: '🍎🍊', inputQty: 8, outputQty: 4, seconds: 90, wage: 65 }),
  bread: Object.freeze({ id: 'bread', label: 'Хлеб', icon: '🍞', input: 'farm_wheat', inputLabel: 'Пшеница', inputIcon: '🌾', inputQty: 8, outputQty: 5, seconds: 85, wage: 58 }),
  corn_snack: Object.freeze({ id: 'corn_snack', label: 'Кукурузные снеки', icon: '🍿', input: 'farm_corn', inputLabel: 'Кукуруза', inputIcon: '🌽', inputQty: 8, outputQty: 5, seconds: 80, wage: 55 }),
});

export const FACTORY_RAW_ITEMS = Object.freeze([
  { itemType: 'farm_apple', label: 'Яблоки', icon: '🍎' },
  { itemType: 'farm_orange', label: 'Апельсины', icon: '🍊' },
  { itemType: 'farm_wheat', label: 'Пшеница', icon: '🌾' },
  { itemType: 'farm_corn', label: 'Кукуруза', icon: '🌽' },
]);

export const FACTORY_ROLES = Object.freeze([
  { id: 'loader', label: 'Грузчик', icon: '📦' },
  { id: 'operator', label: 'Оператор станка', icon: '⚙️' },
  { id: 'packer', label: 'Упаковщик', icon: '📫' },
  { id: 'quality', label: 'Контролёр качества', icon: '✅' },
]);

export function getFactoryRecipe(id) { return FACTORY_RECIPES[String(id || '').trim()] || null; }
export function formatFactoryMoney(value) { return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ru-RU')} ₴`; }
