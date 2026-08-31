export const FACTORY_CONFIG = Object.freeze({
  purchasePrice: 3_500_000,
  rawCapacity: 2_000,
  productCapacity: 1_500,
  legalForms: Object.freeze(['ТОВ', 'АТ', 'Кооператив']),
});

export const FACTORY_RECIPES = Object.freeze({
  bread: Object.freeze({ id: 'bread', label: 'Хлеб', icon: '🍞', input: 'farm_wheat', inputLabel: 'Пшеница', inputIcon: '🌾', inputQty: 3, outputQty: 1, seconds: 3, wage: 20 }),
  pasta: Object.freeze({ id: 'pasta', label: 'Макароны (1 кг)', icon: '🍝', input: 'farm_wheat', inputLabel: 'Пшеница', inputIcon: '🌾', inputQty: 10, outputQty: 1, seconds: 3, wage: 35 }),
  diet_fruit_salad: Object.freeze({ id: 'diet_fruit_salad', label: 'Салат диетический', icon: '🥗', anyFruit: true, inputLabel: 'Любые фрукты/ягоды', inputIcon: '🍎🍊', inputQty: 3, outputQty: 1, seconds: 3, wage: 25 }),
  universal_fruit_salad: Object.freeze({ id: 'universal_fruit_salad', label: 'Салат универсальный фруктовый', icon: '🥙', inputs: Object.freeze({ farm_apple: 2, farm_orange: 2 }), inputLabel: 'По 2 каждого доступного фрукта/ягоды', inputIcon: '🍎🍊', inputQty: 4, outputQty: 1, seconds: 3, wage: 40 }),
  multifruit_juice: Object.freeze({ id: 'multifruit_juice', label: 'Сок мультифрукт', icon: '🧃', anyFruit: true, inputLabel: 'Любой фрукт или ягода', inputIcon: '🍎🍊', inputQty: 1, outputQty: 3, seconds: 3, wage: 20 }),
});

export const FACTORY_RAW_ITEMS = Object.freeze([
  { itemType: 'farm_apple', label: 'Яблоки', icon: '🍎' },
  { itemType: 'farm_orange', label: 'Апельсины', icon: '🍊' },
  { itemType: 'farm_wheat', label: 'Пшеница', icon: '🌾' },
]);

export const FACTORY_ROLES = Object.freeze([
  { id: 'loader', label: 'Грузчик', icon: '📦' },
  { id: 'cook', label: 'Повар', icon: '👨‍🍳' },
  { id: 'packer', label: 'Упаковщик', icon: '📫' },
]);

export function getFactoryRecipe(id) { return FACTORY_RECIPES[String(id || '').trim()] || null; }
export function formatFactoryMoney(value) { return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ru-RU')} ₴`; }
