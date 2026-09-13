export const PRODUCTION_CHAINS = {
  fruit: Object.freeze({
    id: 'fruit', factoryType: 'fruit_factory', factoryLabel: 'Завод по производству питания', factoryIcon: '🏭',
    storeType: 'grocery', storeLabel: 'Продуктовый магазин', supportsRequests: true,
    products: Object.freeze([
      { id: 'grocery_bread', label: 'Хлеб', icon: '🍞' },
      { id: 'grocery_pasta', label: 'Макароны (1 кг)', icon: '🍝' },
      { id: 'grocery_diet_fruit_salad', label: 'Салат диетический', icon: '🥗' },
      { id: 'grocery_universal_fruit_salad', label: 'Салат универсальный фруктовый', icon: '🥙' },
      { id: 'grocery_multifruit_juice', label: 'Сок мультифрукт', icon: '🧃' },
    ]),
  }),
  metallurgy: Object.freeze({
    id: 'metallurgy', factoryType: 'metallurgy_factory', factoryLabel: 'Металлургический завод', factoryIcon: '🔥',
    storeType: '', storeLabel: 'Совместимое предприятие',
    products: Object.freeze([
      { id: 'scissors_metal_part', label: 'Металлическая часть ножниц', icon: '✂️', buyerTypes: ['tool_assembly_factory'] },
      { id: 'chainsaw_chain', label: 'Цепь бензопилы', icon: '⛓️', buyerTypes: ['tool_assembly_factory'] },
      { id: 'chainsaw_engine', label: 'Двигатель бензопилы', icon: '⚙️', buyerTypes: ['tool_assembly_factory'] },
      { id: 'axe_head', label: 'Голова топора', icon: '🪓', buyerTypes: ['tool_assembly_factory'] },
      { id: 'rake_head', label: 'Насадка граблей', icon: 'Г', buyerTypes: ['tool_assembly_factory'] },
      { id: 'hand_saw_metal_part', label: 'Металлическая часть ручной пилы', icon: '🪚', buyerTypes: ['tool_assembly_factory'] },
      { id: 'pickaxe_metal_part', label: 'Металлическая часть кирки', icon: '⛏️', buyerTypes: ['tool_assembly_factory'] },
      { id: 'support_beam', label: 'Опорная балка', icon: '🏗️', buyerTypes: ['car_factory', 'construction_store'] },
      { id: 'rebar', label: 'Арматура', icon: '〰️', buyerTypes: ['construction_store'] },
      { id: 'nails', label: 'Гвозди', icon: '📌', buyerTypes: ['tool_assembly_factory', 'accessory_factory', 'car_factory'] },
      { id: 'screws', label: 'Шурупы', icon: '🔩', buyerTypes: ['tool_assembly_factory', 'accessory_factory', 'car_factory'] },
      { id: 'rivets', label: 'Заклёпки', icon: '⚙️', buyerTypes: ['accessory_factory', 'car_factory'] },
      { id: 'jewelry_chain', label: 'Цепочка', icon: '📿', buyerTypes: ['accessory_factory'] },
      { id: 'glasses_insert', label: 'Вставки для очков', icon: '👓', buyerTypes: ['tool_assembly_factory'] },
      { id: 'earrings_pair', label: 'Пара серёжек', icon: '💎', buyerTypes: ['accessory_factory'] },
      { id: 'watch_metal_part', label: 'Металлическая часть часов', icon: '⌚', buyerTypes: ['accessory_factory'] },
      { id: 'car_frame', label: 'Каркас автомобиля', icon: '🚘', buyerTypes: ['car_factory'] },
      { id: 'car_engine', label: 'Двигатель автомобиля', icon: '🏎️', buyerTypes: ['car_factory'] },
      { id: 'car_body', label: 'Кузов автомобиля', icon: '🚗', buyerTypes: ['car_factory'] },
    ].map(Object.freeze)),
  }),
  wood_processing: Object.freeze({
    id: 'wood_processing', factoryType: 'wood_processing_factory', factoryLabel: 'Деревоперерабатывающий завод', factoryIcon: '🪵',
    storeType: '', storeLabel: 'Завод по сборке инструментов',
    products: Object.freeze([
      { id: 'pickaxe_handle', label: 'Ручка кирки', icon: '⛏️', buyerTypes: ['tool_assembly_factory'] },
      { id: 'rake_handle', label: 'Держатель для граблей', icon: 'Г', buyerTypes: ['tool_assembly_factory'] },
      { id: 'scissors_handles', label: 'Пара ручек для ножниц', icon: '✂️', buyerTypes: ['tool_assembly_factory'] },
      { id: 'hand_saw_handle', label: 'Ручка для пилы', icon: '🪚', buyerTypes: ['tool_assembly_factory'] },
      { id: 'axe_handle', label: 'Ручка топора', icon: '🪓', buyerTypes: ['tool_assembly_factory'] },
    ].map(Object.freeze)),
  }),
  tool_assembly: Object.freeze({
    id: 'tool_assembly', factoryType: 'tool_assembly_factory', factoryLabel: 'Завод по сборке инструментов', factoryIcon: '🛠️',
    storeType: 'construction_store', storeLabel: 'Магазин стройматериалов',
    products: Object.freeze([
      { id: 'farm_rake', label: 'Готовые грабли', icon: 'Г' },
      { id: 'mine_tool_pickaxe', label: 'Готовая кирка', icon: '⛏️' },
      { id: 'farm_scissors', label: 'Готовые ножницы', icon: '✂️' },
      { id: 'construction_hand_saw', label: 'Готовая ручная пила', icon: '🪚' },
      { id: 'lumber_tool_axe', label: 'Готовый топор', icon: '🪓' },
      { id: 'lumber_tool_chainsaw', label: 'Готовая бензопила', icon: '⚙️' },
    ]),
  }),
  textile: Object.freeze({
    id: 'textile', factoryType: 'textile_factory', factoryLabel: 'Швейный завод', factoryIcon: '🧵',
    storeType: 'accessory_store', storeLabel: 'Магазин одежды и аксессуаров', supportsRequests: true,
    products: Object.freeze([
      { id: 'textile_jacket_spring', label: 'Куртка · весенняя', icon: '🧥' },
      { id: 'textile_jacket_summer', label: 'Куртка · летняя', icon: '🧥' },
      { id: 'textile_jacket_autumn', label: 'Куртка · осенняя', icon: '🧥' },
      { id: 'textile_jacket_winter', label: 'Куртка · зимняя', icon: '🧥' },
      { id: 'textile_tshirt', label: 'Футболка', icon: '👕' },
      { id: 'textile_pants_spring', label: 'Штаны · весенние', icon: '👖' },
      { id: 'textile_pants_summer', label: 'Штаны · летние', icon: '👖' },
      { id: 'textile_pants_autumn', label: 'Штаны · осенние', icon: '👖' },
      { id: 'textile_pants_winter', label: 'Штаны · зимние', icon: '👖' },
      { id: 'textile_shorts', label: 'Шорты', icon: '🩳' },
      { id: 'textile_sneakers', label: 'Кроссовки', icon: '👟' },
      { id: 'textile_dress_shoes', label: 'Туфли', icon: '👞' },
    ]),
  }),
};

export function productionChain(id) { return PRODUCTION_CHAINS[String(id || '').trim()] || PRODUCTION_CHAINS.fruit; }
export function productionProduct(chainId, productId) { return productionChain(chainId).products.find((item) => item.id === productId) || null; }
export function registerProductionChain(chain) {
  // Future server-provided chains can use the same shape without changing the market UI.
  if (!chain?.id || !Array.isArray(chain.products)) return false;
  PRODUCTION_CHAINS[chain.id] = Object.freeze({ ...chain, products: Object.freeze(chain.products.map(Object.freeze)) });
  return true;
}


const PRODUCT_CHAIN_OVERRIDES = Object.freeze({
  grocery_bread: 'fruit',
  grocery_pasta: 'fruit',
  grocery_diet_fruit_salad: 'fruit',
  grocery_universal_fruit_salad: 'fruit',
  grocery_multifruit_juice: 'fruit',
  textile_jacket_spring: 'textile', textile_jacket_summer: 'textile', textile_jacket_autumn: 'textile', textile_jacket_winter: 'textile',
  textile_tshirt: 'textile', textile_pants_spring: 'textile', textile_pants_summer: 'textile', textile_pants_autumn: 'textile', textile_pants_winter: 'textile',
  textile_shorts: 'textile', textile_sneakers: 'textile', textile_dress_shoes: 'textile',
  scissors_metal_part: 'metallurgy', chainsaw_chain: 'metallurgy', chainsaw_engine: 'metallurgy', axe_head: 'metallurgy', rake_head: 'metallurgy',
  hand_saw_metal_part: 'metallurgy', pickaxe_metal_part: 'metallurgy', support_beam: 'metallurgy', rebar: 'metallurgy', nails: 'metallurgy', screws: 'metallurgy',
  rivets: 'metallurgy', jewelry_chain: 'metallurgy', glasses_insert: 'metallurgy', earrings_pair: 'metallurgy', watch_metal_part: 'metallurgy',
  car_frame: 'metallurgy', car_engine: 'metallurgy', car_body: 'metallurgy',
  pickaxe_handle: 'wood_processing', rake_handle: 'wood_processing', scissors_handles: 'wood_processing', hand_saw_handle: 'wood_processing', axe_handle: 'wood_processing',
  farm_rake: 'tool_assembly', mine_tool_pickaxe: 'tool_assembly', farm_scissors: 'tool_assembly', construction_hand_saw: 'tool_assembly', lumber_tool_axe: 'tool_assembly', lumber_tool_chainsaw: 'tool_assembly',
});

export function canonicalProductionChainForProduct(productId, fallbackChainId = '') {
  const product = String(productId || '').trim();
  return PRODUCT_CHAIN_OVERRIDES[product] || String(fallbackChainId || '').trim();
}
