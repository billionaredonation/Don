export const PRODUCTION_CHAINS = {
  food:Object.freeze({id:'food',factoryType:'industry_food',factoryLabel:'Пищевой комбинат',factoryIcon:'🏭',storeType:'grocery',storeLabel:'Продуктовый магазин',products:Object.freeze([])}),
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
  mill:Object.freeze({id:'mill',factoryType:'industry_mill',factoryLabel:'Мукомольный завод',factoryIcon:'🌾',storeType:'bakery',storeLabel:'Пекарня',products:Object.freeze([{id:'food_wheat_flour',label:'Пшеничная мука',icon:'🥣'},{id:'food_corn_flour',label:'Кукурузная мука',icon:'🟡'}])}),
  sawmill:Object.freeze({id:'sawmill',factoryType:'industry_sawmill',factoryLabel:'Лесопильный завод',factoryIcon:'🪚',storeType:'furniture_store',storeLabel:'Мебельный магазин',products:Object.freeze([{id:'wood_dry_board',label:'Сухая доска',icon:'🪵'},{id:'wood_furniture_panel',label:'Мебельный щит',icon:'🟫'}])}),
  building_materials:Object.freeze({id:'building_materials',factoryType:'industry_building_materials',factoryLabel:'Завод стройматериалов',factoryIcon:'🏗️',storeType:'building_store',storeLabel:'Строительный магазин',products:Object.freeze([{id:'construction_board',label:'Обрезная доска',icon:'🪚'},{id:'construction_timber',label:'Строительный брус',icon:'▰'},{id:'construction_plywood',label:'Фанерный лист',icon:'🟫'}])}),
  cement:Object.freeze({id:'cement',factoryType:'industry_cement',factoryLabel:'Цементный завод',factoryIcon:'🏭',storeType:'building_store',storeLabel:'Строительный магазин',products:Object.freeze([{id:'construction_cement',label:'Цемент',icon:'⚪'},{id:'construction_concrete',label:'Бетонная смесь',icon:'🧱'}])}),
  metallurgy:Object.freeze({id:'metallurgy',factoryType:'industry_metallurgy',factoryLabel:'Металлургический комбинат',factoryIcon:'🔥',storeType:'metal_store',storeLabel:'Металлобаза',products:Object.freeze([{id:'metal_steel',label:'Стальной прокат',icon:'🔩'},{id:'metal_copper',label:'Медная катанка',icon:'🟠'}])}),
  cable:Object.freeze({id:'cable',factoryType:'industry_cable',factoryLabel:'Кабельный завод',factoryIcon:'⚡',storeType:'electric_store',storeLabel:'Магазин электрики',products:Object.freeze([{id:'electric_copper_wire',label:'Медный провод',icon:'🧵'},{id:'electric_power_cable',label:'Силовой кабель',icon:'🔌'}])}),
  tools:Object.freeze({id:'tools',factoryType:'industry_tools',factoryLabel:'Завод инструментов',factoryIcon:'🛠️',storeType:'tool_store',storeLabel:'Магазин инструментов',products:Object.freeze([{id:'mine_tool_pickaxe',label:'Кирка',icon:'⛏️'},{id:'lumber_tool_axe',label:'Топор',icon:'🪓'},{id:'lumber_tool_chainsaw',label:'Бензопила',icon:'🪚'}])}),
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
  grocery_fruit_puree: 'fruit',
});

export function canonicalProductionChainForProduct(productId, fallbackChainId = '') {
  const product = String(productId || '').trim();
  return PRODUCT_CHAIN_OVERRIDES[product] || String(fallbackChainId || '').trim();
}

