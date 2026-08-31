export const PRODUCTION_CHAINS = {
  fruit: Object.freeze({
    id: 'fruit', factoryType: 'fruit_factory', factoryLabel: 'Завод по производству питания', factoryIcon: '🏭',
    storeType: 'grocery', storeLabel: 'Продуктовый магазин',
    products: Object.freeze([
      { id: 'grocery_apple_juice', label: 'Яблочный сок', icon: '🧃' },
      { id: 'grocery_orange_juice', label: 'Апельсиновый сок', icon: '🥤' },
      { id: 'grocery_fruit_salad', label: 'Фруктовый салат', icon: '🥗' },
      { id: 'grocery_bread', label: 'Хлеб', icon: '🍞' },
      { id: 'grocery_snack', label: 'Кукурузные снеки', icon: '🍿' },
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
  grocery_apple_juice: 'fruit',
  grocery_orange_juice: 'fruit',
  grocery_fruit_salad: 'fruit',
  grocery_bread: 'fruit',
  grocery_snack: 'fruit',
});

export function canonicalProductionChainForProduct(productId, fallbackChainId = '') {
  const product = String(productId || '').trim();
  return PRODUCT_CHAIN_OVERRIDES[product] || String(fallbackChainId || '').trim();
}
