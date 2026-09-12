export const TEXTILE_CONFIG = Object.freeze({
  industryId: 'textile', type: 'textile_factory', label: 'Швейный завод', icon: '🧵',
  purchasePrice: 3_500_000, legalForm: 'ТОВ', storeType: 'accessory_store',
});

export const TEXTILE_RAW_ITEMS = Object.freeze([
  Object.freeze({ itemType: 'farm_flax', label: 'Лён', icon: '🪻' }),
  Object.freeze({ itemType: 'farm_cotton', label: 'Хлопок', icon: '☁️' }),
]);

export const TEXTILE_SEASONS = Object.freeze({
  spring: 'Весенняя', summer: 'Летняя', autumn: 'Осенняя', winter: 'Зимняя',
});

const garment = (id, label, icon, slot, inputs, season = '') => Object.freeze({
  id, itemType: id, label, icon, slot, season, outputQty: 1,
  inputs: Object.freeze(inputs), destinations: Object.freeze(['accessory_store']),
});

export const TEXTILE_RECIPES = Object.freeze({
  textile_jacket_spring: garment('textile_jacket_spring', 'Куртка · весенняя', '🧥', 'upper', { farm_flax: 3, farm_cotton: 1 }, 'spring'),
  textile_jacket_summer: garment('textile_jacket_summer', 'Куртка · летняя', '🧥', 'upper', { farm_flax: 2, farm_cotton: 1 }, 'summer'),
  textile_jacket_autumn: garment('textile_jacket_autumn', 'Куртка · осенняя', '🧥', 'upper', { farm_flax: 3, farm_cotton: 1 }, 'autumn'),
  textile_jacket_winter: garment('textile_jacket_winter', 'Куртка · зимняя', '🧥', 'upper', { farm_flax: 4, farm_cotton: 2 }, 'winter'),
  textile_tshirt: garment('textile_tshirt', 'Футболка', '👕', 'upper', { farm_cotton: 2 }),
  textile_pants_spring: garment('textile_pants_spring', 'Штаны · весенние', '👖', 'lower', { farm_flax: 2, farm_cotton: 1 }, 'spring'),
  textile_pants_summer: garment('textile_pants_summer', 'Штаны · летние', '👖', 'lower', { farm_flax: 1, farm_cotton: 2 }, 'summer'),
  textile_pants_autumn: garment('textile_pants_autumn', 'Штаны · осенние', '👖', 'lower', { farm_flax: 2, farm_cotton: 1 }, 'autumn'),
  textile_pants_winter: garment('textile_pants_winter', 'Штаны · зимние', '👖', 'lower', { farm_flax: 3, farm_cotton: 2 }, 'winter'),
  textile_shorts: garment('textile_shorts', 'Шорты', '🩳', 'lower', { farm_cotton: 2 }),
  textile_sneakers: garment('textile_sneakers', 'Кроссовки', '👟', 'shoes', { farm_flax: 1, farm_cotton: 2 }),
  textile_dress_shoes: garment('textile_dress_shoes', 'Туфли', '👞', 'shoes', { farm_flax: 3, farm_cotton: 1 }),
});

export const TEXTILE_PRODUCTS = Object.freeze(Object.values(TEXTILE_RECIPES).map((item) => Object.freeze({
  itemType: item.itemType, label: item.label, icon: item.icon, suggestedPrice: 300,
  kind: 'clothing', slot: item.slot, season: item.season, permanent: true,
})));

export const TEXTILE_PRODUCT_BY_TYPE = Object.freeze(Object.fromEntries(TEXTILE_PRODUCTS.map((item) => [item.itemType, item])));
export const TEXTILE_RAW_BY_TYPE = Object.freeze(Object.fromEntries(TEXTILE_RAW_ITEMS.map((item) => [item.itemType, item])));
export const formatTextileInputs = (inputs = {}) => Object.entries(inputs).map(([type, qty]) => `${TEXTILE_RAW_BY_TYPE[type]?.icon || '▪'} ${TEXTILE_RAW_BY_TYPE[type]?.label || type} × ${qty}`).join(' + ');
export const formatTextileMoney = (value) => `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ru-RU')} ₴`;
export const isTextileProduct = (itemType) => Boolean(TEXTILE_PRODUCT_BY_TYPE[String(itemType || '').trim()]);
