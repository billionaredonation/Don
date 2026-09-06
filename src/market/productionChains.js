export const PRODUCTION_CHAINS = {
  fruit: Object.freeze({
    id: 'fruit', factoryType: 'fruit_factory', factoryLabel: 'Завод по производству питания', factoryIcon: '🏭',
    storeType: 'grocery', storeLabel: 'Продуктовый магазин',
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
    storeType: '', storeLabel: '', rawOnly: true, products: Object.freeze([]),
  }),
  wood_processing: Object.freeze({
    id: 'wood_processing', factoryType: 'wood_processing_factory', factoryLabel: 'Деревоперерабатывающий завод', factoryIcon: '🪵',
    storeType: '', storeLabel: '', rawOnly: true, products: Object.freeze([]),
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
});

export function canonicalProductionChainForProduct(productId, fallbackChainId = '') {
  const product = String(productId || '').trim();
  return PRODUCT_CHAIN_OVERRIDES[product] || String(fallbackChainId || '').trim();
}
