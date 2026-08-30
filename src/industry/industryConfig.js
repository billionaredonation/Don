export const INDUSTRY_ROLES=Object.freeze({operator:{id:'operator',label:'Оператор линии',icon:'⚙️',game:'timing'},sorter:{id:'sorter',label:'Сортировщик',icon:'🔎',game:'sorting'},packer:{id:'packer',label:'Упаковщик',icon:'📦',game:'packing'},quality:{id:'quality',label:'Контролёр качества',icon:'✅',game:'inspection'},loader:{id:'loader',label:'Грузчик',icon:'🏋️',game:'loading'},forklift:{id:'forklift',label:'Водитель погрузчика',icon:'🚜',game:'forklift'}});

const recipe=(id,label,icon,inputs,output,seconds,wage,roles=['operator','packer'])=>Object.freeze({id,label,icon,inputs:Object.freeze(inputs),output:Object.freeze(output),seconds,wage,roles:Object.freeze(roles)});
const factory=(id,label,icon,storeType,rawGroups,recipes)=>Object.freeze({id,objectType:`industry_${id}`,label,icon,storeType,rawGroups:Object.freeze(rawGroups),recipes:Object.freeze(recipes),roles:Object.freeze(Object.keys(INDUSTRY_ROLES))});

export const INDUSTRIES=Object.freeze({
 food:factory('food','Пищевой комбинат','🏭','grocery',['farm'],[
  recipe('apple_juice','Яблочный сок','🧃',{farm_apple:5},{grocery_apple_juice:3},60,45),recipe('orange_juice','Апельсиновый сок','🥤',{farm_orange:5},{grocery_orange_juice:3},75,50),recipe('fruit_puree','Фруктовое пюре','🥫',{farm_apple:4,farm_orange:4},{grocery_fruit_puree:4},90,65,['sorter','operator','packer','quality'])]),
 mill:factory('mill','Мукомольный завод','🌾','bakery',['farm'],[
  recipe('wheat_flour','Пшеничная мука','🥣',{farm_wheat:8},{food_wheat_flour:5},70,48,['sorter','operator','packer']),recipe('corn_flour','Кукурузная мука','🟡',{farm_corn:8},{food_corn_flour:5},70,48,['sorter','operator','packer'])]),
 sawmill:factory('sawmill','Лесопильный завод','🪚','furniture_store',['lumber'],[
  recipe('dry_board','Сухая доска','🪵',{lumber_log:2},{wood_dry_board:6},80,58,['loader','operator','quality']),recipe('furniture_panel','Мебельный щит','🟫',{lumber_beam:6},{wood_furniture_panel:2},100,72,['operator','packer','quality'])]),
 building_materials:factory('building_materials','Завод стройматериалов','🏗️','building_store',['lumber','mine'],[
  recipe('board','Обрезная доска','🪚',{lumber_log:2},{construction_board:6},75,55),recipe('timber','Строительный брус','▰',{lumber_beam:4},{construction_timber:2},90,65),recipe('plywood','Фанерный лист','🟫',{lumber_beam:5},{construction_plywood:3},110,75,['operator','packer','quality'])]),
 cement:factory('cement','Цементный завод','🏭','building_store',['mine'],[
  recipe('cement','Цемент','⚪',{mine_stone:8,mine_coal:2},{construction_cement:5},100,78,['loader','operator','packer','quality']),recipe('concrete','Бетонная смесь','🧱',{mine_stone:6,construction_cement:2},{construction_concrete:4},115,88,['loader','operator','quality'])]),
 metallurgy:factory('metallurgy','Металлургический комбинат','🔥','metal_store',['mine'],[
  recipe('steel','Стальной прокат','🔩',{mine_metal:8,mine_coal:3},{metal_steel:5},120,95,['loader','sorter','operator','quality']),recipe('copper','Медная катанка','🟠',{mine_copper:7,mine_coal:2},{metal_copper:4},110,92,['sorter','operator','quality'])]),
 cable:factory('cable','Кабельный завод','⚡','electric_store',['metal'],[
  recipe('copper_wire','Медный провод','🧵',{metal_copper:3},{electric_copper_wire:12},80,70,['operator','packer','quality']),recipe('power_cable','Силовой кабель','🔌',{electric_copper_wire:10},{electric_power_cable:4},105,86,['operator','packer','quality'])]),
 tools:factory('tools','Завод инструментов','🛠️','tool_store',['metal','wood'],[
  recipe('pickaxe','Кирка','⛏️',{metal_steel:2,wood_dry_board:1},{mine_tool_pickaxe:1},100,85,['operator','quality','packer']),recipe('axe','Топор','🪓',{metal_steel:2,wood_dry_board:1},{lumber_tool_axe:1},100,85,['operator','quality','packer']),recipe('chainsaw','Бензопила','🪚',{metal_steel:4,electric_power_cable:1},{lumber_tool_chainsaw:1},150,125,['operator','quality','packer'])]),
});

export const INDUSTRY_STORES=Object.freeze({grocery:{type:'grocery',label:'Продуктовый магазин',icon:'🛒'},bakery:{type:'bakery',label:'Пекарня',icon:'🥖'},building_store:{type:'building_store',label:'Строительный магазин',icon:'🧱'},furniture_store:{type:'furniture_store',label:'Мебельный магазин',icon:'🛋️'},metal_store:{type:'metal_store',label:'Металлобаза',icon:'🔩'},electric_store:{type:'electric_store',label:'Магазин электрики',icon:'💡'},tool_store:{type:'tool_store',label:'Магазин инструментов',icon:'🧰'},logistics_hub:{type:'logistics_hub',label:'Логистический центр',icon:'🚚'}});
export const getIndustry=(id)=>INDUSTRIES[String(id||'').replace(/^industry_/,'')]||null;
