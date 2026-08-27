export const PRODUCTION_CHAINS = {
  fruit: Object.freeze({
    id: 'fruit', factoryType: 'fruit_factory', factoryLabel: 'Фруктовый завод', factoryIcon: '🏭',
    storeType: 'grocery', storeLabel: 'Продуктовый магазин',
    products: Object.freeze([
      { id: 'grocery_apple_juice', label: 'Яблочный сок', icon: '🧃' },
      { id: 'grocery_orange_juice', label: 'Апельсиновый сок', icon: '🥤' },
      { id: 'grocery_fruit_puree', label: 'Фруктовое пюре', icon: '🥫' },
    ]),
  }),
  construction: Object.freeze({
    id: 'construction', factoryType: 'construction_factory', factoryLabel: 'Завод стройматериалов', factoryIcon: '🏗️',
    storeType: 'tool_store', storeLabel: 'Инструментальный магазин',
    products: Object.freeze([
      { id: 'construction_board', label: 'Обрезная доска', icon: '🪚' },
      { id: 'construction_timber', label: 'Строительный брус', icon: '▰' },
      { id: 'construction_plywood', label: 'Фанерный лист', icon: '🟫' },
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
