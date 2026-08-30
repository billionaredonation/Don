import './productionMarket.css';
import { state, save } from '../state.js';
import { loadRawMarket, sellToFactory, loadProductionExchange, createFactoryOffer, createStoreRequest, acceptStoreRequest, buyFactoryOffer, getFactoryError } from '../factory/factoryApi.js';
import { loadConstructionExchange, loadConstructionRawMarket, sellLumberToConstructionFactory, createConstructionOffer, createConstructionStoreRequest, acceptConstructionStoreRequest, buyConstructionOffer, getConstructionError } from '../construction/constructionApi.js';
import { PRODUCTION_CHAINS, productionChain, productionProduct } from './productionChains.js';
import { loadIndustryExchange,loadIndustryRawMarket,sellIndustryRaw,createIndustryOffer,createIndustryRequest,acceptIndustryRequest,buyIndustryOffer,buyIndustryOfferForFactory } from '../industry/industryApi.js';

const RAW_ITEMS={farm_apple:{icon:'🍎',label:'Яблоки',chainId:'food',groupId:'fruit'},farm_orange:{icon:'🍊',label:'Апельсины',chainId:'food',groupId:'fruit'},farm_wheat:{icon:'🌾',label:'Пшеница',chainId:'mill',groupId:'grain'},farm_corn:{icon:'🌽',label:'Кукуруза',chainId:'mill',groupId:'grain'},lumber_log:{icon:'🪵',label:'Брёвна',chainId:'sawmill',groupId:'wood'},lumber_beam:{icon:'▰',label:'Брус лесоруба',chainId:'sawmill',groupId:'wood'},mine_stone:{icon:'🪨',label:'Камень',chainId:'cement',groupId:'mine'},mine_coal:{icon:'⚫',label:'Уголь',chainId:'cement',groupId:'mine'},mine_metal:{icon:'⚙️',label:'Металлическая руда',chainId:'metallurgy',groupId:'mine'},mine_copper:{icon:'🟠',label:'Медная руда',chainId:'metallurgy',groupId:'mine'}};

const NEXT_FACTORY_CHAINS=Object.freeze({
  construction_cement:['cement'],metal_steel:['tools'],metal_copper:['cable'],
  electric_copper_wire:['cable'],electric_power_cable:['tools'],wood_dry_board:['tools']
});
const nextFactoryChains=(itemType)=>NEXT_FACTORY_CHAINS[String(itemType||'')]||[];

const STORE_FOR_PRODUCT=Object.freeze({
 grocery_apple_juice:'grocery',grocery_orange_juice:'grocery',grocery_fruit_puree:'grocery',
 food_wheat_flour:'bakery',food_corn_flour:'bakery',wood_dry_board:'furniture_store',wood_furniture_panel:'furniture_store',
 construction_board:'building_store',construction_timber:'building_store',construction_plywood:'building_store',construction_cement:'building_store',construction_concrete:'building_store',
 metal_steel:'metal_store',metal_copper:'metal_store',electric_copper_wire:'electric_store',electric_power_cable:'electric_store',
 mine_tool_pickaxe:'tool_store',lumber_tool_axe:'tool_store',lumber_tool_chainsaw:'tool_store'
});


const RAW_GROUPS={fruit:{icon:'🍎',label:'Фрукты',chainId:'food'},grain:{icon:'🌾',label:'Зерновые',chainId:'mill'},wood:{icon:'🪵',label:'Древесина',chainId:'sawmill'},mine:{icon:'⛏️',label:'Руда и минералы',chainId:'metallurgy'}};
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const money=(v)=>`${Math.max(0,Math.round(Number(v)||0)).toLocaleString('ru-RU')} ₴`;
const quantity=(v)=>Math.max(0,Math.floor(Number(v)||0));
const dealTotal=(entry)=>money(quantity(entry?.quantity)*Math.max(0,Number(entry?.unitPrice)||0));
const toast=(message,type='info')=>window.dispatchEvent(new CustomEvent('mn:toast',{detail:{message,type}}));
const entityName=(entry,fallback)=>{const value=String(entry?.name||entry?.factoryName||entry?.storeName||entry?.businessName||'').trim();return !value||/[0-9a-f]{8}-[0-9a-f-]{27,}/i.test(value)||value==='Завод'||value==='Магазин'?`${fallback}${entry?.cityName||entry?.cityId?` · ${entry.cityName||entry.cityId}`:''}`:value;};

function shell(){return `<div class="mn-production-shortcuts"><button data-raw-market-open><b>O</b><span>Продать сырьё</span></button><button data-exchange-open><b>M</b><span>Биржа продукции</span></button></div><div class="mn-production-market" data-production-market hidden><button class="mn-production-backdrop" data-market-close></button><section><header><div><small data-market-eyebrow>РЫНОК</small><h2 data-market-title>Производственная экономика</h2></div><button data-market-close>×</button></header><main data-market-content></main></section></div>`;}

async function loadUniversalRaw(){
  const providers=await Promise.allSettled([
    loadRawMarket(),
    loadConstructionRawMarket(''),
    loadIndustryRawMarket()
  ]);

  const merged=[];

  if(providers[0].status==='fulfilled'){
    merged.push(...(providers[0].value?.offers||[]).map(item=>({
      ...item,
      chainId:'fruit',
      rawProvider:'fruit'
    })));
  }

  if(providers[1].status==='fulfilled'){
    merged.push(...(providers[1].value?.offers||[]).map(item=>({
      ...item,
      chainId:'construction',
      rawProvider:'construction'
    })));
  }

  if(providers[2].status==='fulfilled'){
    merged.push(...(providers[2].value?.offers||[])
      .filter(item=>[
        'food','mill','sawmill','building_materials',
        'cement','metallurgy','cable','tools'
      ].includes(String(item?.industryId||item?.chainId||'')))
      .map(item=>({
        ...item,
        chainId:item.industryId||item.chainId,
        rawProvider:'industry'
      })));
  }

  if(providers.every(result=>result.status==='rejected')){
    throw providers[2].reason||providers[0].reason||providers[1].reason;
  }

  const seen=new Set();
  const offers=[];
  for(const offer of merged){
    const key=[
      String(offer.factoryId||''),
      String(offer.cityId||''),
      String(offer.itemType||'')
    ].join('|');

    if(seen.has(key))continue;
    seen.add(key);
    offers.push(offer);
  }

  return {offers};
}
function rawMarkup(data){const offers=data.offers||[],availableItems=Object.entries(RAW_ITEMS).filter(([id])=>offers.some(o=>o.itemType===id)),selected=availableItems[0]?.[0]||'',chainIds=[...new Set(offers.map(o=>o.chainId).filter(Boolean))];return `<div class="mn-raw-navigation"><div><small>1. Направление производства</small><div class="mn-market-chain-filter"><button class="is-active" data-raw-chain="all">Все направления</button>${chainIds.map(id=>{const chain=productionChain(id);return `<button data-raw-chain="${esc(id)}">${chain.factoryIcon||'🏭'} ${esc(chain.factoryLabel||id)}</button>`;}).join('')}</div></div><div><small>2. Категория сырья</small><div class="mn-raw-group-filter"><button class="is-active" data-raw-group="all">Все категории</button>${Object.entries(RAW_GROUPS).filter(([,group])=>chainIds.includes(group.chainId)).map(([id,group])=>`<button data-raw-group="${id}" data-parent-chain="${group.chainId}">${group.icon} ${group.label}</button>`).join('')}</div></div></div><div class="mn-market-hero"><i>📦</i><span><strong>Продажа сырья производствам</strong><small>Направления формируются автоматически из работающих производств.</small></span></div><div class="mn-market-form"><label><span>3. Выберите конкретное сырьё</span><select data-raw-item>${availableItems.map(([id,item])=>`<option value="${id}">${item.icon} ${item.label}</option>`).join('')}</select></label><label><span>Количество</span><input type="number" min="1" value="10" data-raw-qty></label></div><div class="mn-market-list" data-raw-offers>${offers.length?offers.map(o=>{const item=RAW_ITEMS[o.itemType]||{icon:'📦',label:o.itemType};return `<article data-item="${esc(o.itemType)}" data-chain="${esc(o.chainId)}"${o.itemType===selected?'':' hidden'}><i>${item.icon}</i><span><strong>${esc(entityName(o,productionChain(o.chainId).factoryLabel))}</strong><small>${esc(o.cityName||o.cityId)} · принимает до ${Number(o.capacityLeft)} ед.</small></span><b>${money(o.unitPrice)} / ед.</b><button data-raw-sell="${esc(o.factoryId)}" data-chain="${esc(o.chainId)}" data-city="${esc(o.cityId)}" data-item="${esc(o.itemType)}" data-provider="${esc(o.rawProvider||'industry')}">Продать</button></article>`;}).join(''):'<p>Предприятия пока не принимают сырьё.</p>'}</div>`;}

function normalizeExchange(source,chainId){const chain=productionChain(chainId),data=source||{};return {factories:(data.myFactories||[]).map(item=>({...item,chainId,name:entityName(item,chain.factoryLabel)})),stores:(data.myStores||[]).filter(item=>!item.businessType||item.businessType===chain.storeType).map(item=>({...item,chainId,name:entityName(item,chain.storeLabel)})),offers:(data.offers||[]).map(item=>({...item,chainId})),requests:(data.requests||[]).map(item=>({...item,chainId}))};}
async function loadUniversalExchange(){
  const [fruitResult,constructionResult,industryResult]=await Promise.allSettled([
    loadProductionExchange(),
    loadConstructionExchange(),
    loadIndustryExchange()
  ]);

  const result={factories:[],stores:[],offers:[],requests:[]};

  if(fruitResult.status==='fulfilled'){
    const fruit=normalizeExchange(fruitResult.value,'fruit');
    result.factories.push(...fruit.factories);
    result.stores.push(...fruit.stores);
    result.offers.push(...fruit.offers);
    result.requests.push(...fruit.requests);
  }

  if(constructionResult.status==='fulfilled'){
    const construction=normalizeExchange(constructionResult.value,'construction');
    result.factories.push(...construction.factories);
    result.stores.push(...construction.stores);
    result.offers.push(...construction.offers);
    result.requests.push(...construction.requests);
  }

  if(industryResult.status==='fulfilled'){
    const data=industryResult.value||{};
    const mapItems=(items=[])=>items.map(item=>({
      ...item,
      chainId:item.chainId||item.industryId
    }));

    result.factories.push(...mapItems(data.myFactories));
    result.stores.push(...mapItems(data.myStores));

    // Fruit juices/puree belong to legacy fruit_factory, not industry_food.
    const fruitProducts=new Set([
      'grocery_apple_juice',
      'grocery_orange_juice',
      'grocery_fruit_puree'
    ]);

    result.offers.push(...mapItems(data.offers).filter(item=>
      !(item.chainId==='food'&&fruitProducts.has(String(item.productType||'')))
    ));
    result.requests.push(...mapItems(data.requests).filter(item=>
      !(item.chainId==='food'&&fruitProducts.has(String(item.productType||'')))
    ));
  }

  const dedupe=(items,keyFn)=>{
    const seen=new Set();
    return items.filter(item=>{
      const key=keyFn(item);
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
  };

  result.factories=dedupe(
    result.factories,
    item=>`${item.chainId}|${item.id||item.factoryId}|${item.cityId||''}`
  );
  result.stores=dedupe(
    result.stores,
    item=>`${item.id||item.businessId}|${item.cityId||''}`
  );
  result.offers=dedupe(
    result.offers,
    item=>`${item.chainId}|${item.id}`
  );
  result.requests=dedupe(
    result.requests,
    item=>`${item.chainId}|${item.id}`
  );

  return result;
}
function productOptions(chainId){return productionChain(chainId).products.map(p=>`<option value="${esc(p.id)}">${p.icon} ${esc(p.label)}</option>`).join('');}
function factoryOptions(items){return items.map(f=>`<option value="${esc(f.id||f.factoryId)}" data-city="${esc(f.cityId)}" data-chain="${esc(f.chainId)}">${productionChain(f.chainId).factoryIcon} ${esc(f.name)}</option>`).join('');}
function storeOptions(items){return items.map(s=>`<option value="${esc(s.id||s.businessId)}" data-city="${esc(s.cityId)}" data-chain="${esc(s.chainId)}">🏪 ${esc(s.name)}</option>`).join('');}
const buyExchangeOffer=(chain,id,businessId)=>{
  if(chain==='fruit')return buyFactoryOffer(id,businessId);
  if(chain==='construction')return buyConstructionOffer(id,businessId);
  return buyIndustryOffer(id,businessId);
};

const takeExchangeRequest=(chain,id,factoryId,cityId)=>{
  if(chain==='fruit')return acceptStoreRequest(id,factoryId,cityId);
  if(chain==='construction')return acceptConstructionStoreRequest(id,factoryId,cityId);
  return acceptIndustryRequest(id,factoryId,cityId);
};

const publishFactoryOffer=(chain,payload)=>{
  if(chain==='fruit')return createFactoryOffer(payload);
  if(chain==='construction')return createConstructionOffer(payload);
  return createIndustryOffer(payload);
};

const publishStoreRequest=(chain,payload)=>{
  if(chain==='fruit')return createStoreRequest(payload);
  if(chain==='construction')return createConstructionStoreRequest(payload);
  return createIndustryRequest(payload);
};

function emptyState(icon,title,text){return `<div class="mn-market-empty"><i>${icon}</i><strong>${title}</strong><small>${text}</small></div>`;}
function dealCard(entry,type,actors){const isRequest=type==='request',chain=productionChain(entry.chainId),product=productionProduct(entry.chainId,entry.productType),compatibleStores=actors.stores.filter(s=>{const expected=STORE_FOR_PRODUCT[entry.productType];return !expected||s.businessType===expected||(expected==='grocery'&&s.businessType==='shop')}),compatibleFactories=actors.factories.filter(f=>nextFactoryChains(entry.productType).includes(f.chainId)),compatible=isRequest?actors.factories.filter(f=>f.chainId===entry.chainId):[...compatibleStores,...compatibleFactories],id=esc(entry.id),actor=entityName(entry,isRequest?chain.storeLabel:chain.factoryLabel);const destinationOptions=isRequest?'':`${compatibleStores.map(s=>`<option value="store:${esc(s.id||s.businessId)}">🏪 ${esc(s.name)}</option>`).join('')}${compatibleFactories.map(f=>`<option value="factory:${esc(f.id||f.factoryId)}:${esc(f.cityId)}">🏭 ${esc(entityName(f,productionChain(f.chainId).factoryLabel))}</option>`).join('')}`;return `<article class="mn-deal-card ${isRequest?'is-request':'is-offer'}" data-chain="${esc(entry.chainId)}">
  <div class="mn-deal-product"><i>${product?.icon||'📦'}</i><span><em>${isRequest?'МАГАЗИН ПОКУПАЕТ':'ЗАВОД ПРОДАЁТ'}</em><strong>${esc(product?.label||entry.productType)}</strong><small>${esc(actor)} · ${esc(entry.cityName||entry.cityId||'город не указан')}</small></span></div>
  <div class="mn-deal-numbers"><span><small>Количество</small><b>${quantity(entry.quantity)} ед.</b></span><span><small>Цена за единицу</small><b>${money(entry.unitPrice)}</b></span><span class="is-total"><small>${isRequest?'Магазин заплатит':'Стоимость партии'}</small><b>${dealTotal(entry)}</b></span></div>
  <div class="mn-deal-action">${compatible.length?`<label><span>${isRequest?'От какого завода поставляем':'Куда отправить партию'}</span><select ${isRequest?`data-request-factory="${id}"`:`data-offer-destination="${id}"`}>${isRequest?factoryOptions(compatible):destinationOptions}</select></label><button ${isRequest?`data-request-accept="${id}"`:`data-offer-buy="${id}"`} data-chain="${esc(entry.chainId)}">${isRequest?'Принять заказ':'Оформить поставку'} <span>→</span></button>`:`<p>${isRequest?'Нужен совместимый завод, которым вы управляете.':'Нужен совместимый магазин или следующий завод.'}</p>`}</div>
</article>`;}
function createCard(kind,items){const isFactory=kind==='factory',first=items[0];return `<article class="mn-create-card ${isFactory?'is-supply':'is-demand'}"><header><i>${isFactory?'🏭':'🏪'}</i><span><em>${isFactory?'ПРОДАЖА':'ЗАКУПКА'}</em><h3>${isFactory?'Предложить товар':'Заказать поставку'}</h3><small>${isFactory?'Товар резервируется на складе завода и появляется в продаже.':'Заявка появляется в заказах магазинов, где завод может её принять.'}</small></span></header>${first?`<div class="mn-create-fields"><label><span>${isFactory?'Производство':'Магазин-заказчик'}</span><select ${isFactory?'data-create-factory':'data-create-store'}>${isFactory?factoryOptions(items):storeOptions(items)}</select></label><label><span>Товар</span><select ${isFactory?'data-create-factory-product':'data-create-store-product'}>${productOptions(first.chainId)}</select></label><label><span>Количество, ед.</span><input type="number" min="1" value="${isFactory?10:50}" ${isFactory?'data-create-factory-qty':'data-create-store-qty'}></label><label><span>Цена за единицу, ₴</span><input type="number" min="1" value="${isFactory?50:55}" ${isFactory?'data-create-factory-price':'data-create-store-price'}></label></div><button class="mn-create-submit" ${isFactory?'data-create-factory-offer':'data-create-store-request'}>${isFactory?'Выставить товар':'Опубликовать заказ'} <span>→</span></button>`:`<p class="mn-create-unavailable">${isFactory?'У вас нет производственного предприятия.':'У вас нет совместимого магазина.'}</p>`}</article>`;}
function exchangeMarkup(data){const {factories,stores,offers,requests}=data;return `<div class="mn-exchange-summary"><div><em>ТОРГОВАЯ ПЛОЩАДКА</em><strong>Найдите покупателя или поставщика</strong><small>Магазины публикуют заказы, заводы предлагают готовые партии. Промежуточный товар можно передать следующему заводу, а конечный товар после покупки уходит в логистику и приезжает на склад магазина.</small></div><dl><span><dt>${offers.length}</dt><dd>партий в продаже</dd></span><span><dt>${requests.length}</dt><dd>заказов магазинов</dd></span></dl></div>
<div class="mn-market-chain-filter"><button class="is-active" data-chain-filter="all">Все отрасли</button>${Object.values(PRODUCTION_CHAINS).map(c=>`<button data-chain-filter="${c.id}">${c.factoryIcon} ${esc(c.factoryLabel)}</button>`).join('')}</div>
<div class="mn-market-tabs"><button class="is-active" data-ex-tab="offers"><span>Готовые партии</span><b>${offers.length}</b></button><button data-ex-tab="requests"><span>Заказы магазинов</span><b>${requests.length}</b></button><button data-ex-tab="create"><span>Создать объявление</span><b>＋</b></button></div>
<div data-ex-page="offers"><div class="mn-page-intro"><span><strong>Предложения заводов</strong><small>Готовый товар, который можно сразу закупить на склад магазина.</small></span></div><div class="mn-deal-list">${offers.length?offers.map(o=>dealCard(o,'offer',{factories,stores})).join(''):emptyState('📦','Пока нет готовых партий','Заводы ещё не выставили продукцию на продажу.')}</div></div>
<div data-ex-page="requests" hidden><div class="mn-page-intro is-demand"><span><strong>Заказы от магазинов</strong><small>Это заявки на поставку. Выберите свой завод и примите подходящий заказ.</small></span></div><div class="mn-deal-list">${requests.length?requests.map(r=>dealCard(r,'request',{factories,stores})).join(''):emptyState('🧾','Новых заказов пока нет','Когда магазин закажет поставку, его заявка появится здесь.')}</div></div>
<div data-ex-page="create" hidden><div class="mn-create-grid">${createCard('factory',factories)}${createCard('store',stores)}</div></div>`;}

export function enableProductionMarketFeature({root}){root.insertAdjacentHTML('beforeend',shell());const modal=root.querySelector('[data-production-market]'),content=modal.querySelector('[data-market-content]');let mode='',busy=false;
const open=async(next)=>{if(busy)return;busy=true;mode=next;modal.hidden=false;content.innerHTML='<div class="mn-market-loading">Загружаем предложения…</div>';try{const data=next==='raw'?await loadUniversalRaw():await loadUniversalExchange();content.innerHTML=next==='raw'?rawMarkup(data):exchangeMarkup(data);modal.querySelector('[data-market-title]').textContent=next==='raw'?'Продать сырьё':'Биржа готовой продукции';modal.querySelector('[data-market-eyebrow]').textContent=next==='raw'?'КЛАВИША O':'КЛАВИША M';}catch(e){content.innerHTML=`<div class="mn-market-error">${esc(getFactoryError(e))}</div>`;}finally{busy=false;}};
const close=()=>{modal.hidden=true;};root.querySelector('[data-raw-market-open]').onclick=()=>open('raw');root.querySelector('[data-exchange-open]').onclick=()=>open('exchange');modal.querySelectorAll('[data-market-close]').forEach(b=>b.onclick=close);
const key=e=>{if(e.repeat||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||''))return;if(e.code==='KeyO'){e.preventDefault();void open('raw');}if(e.code==='KeyM'){e.preventDefault();void open('exchange');}if(e.key==='Escape'&&!modal.hidden)close();};window.addEventListener('keydown',key,true);
content.addEventListener('change',e=>{if(e.target.matches('[data-raw-item]'))content.querySelectorAll('[data-raw-offers] article').forEach(a=>a.hidden=a.dataset.item!==e.target.value);if(e.target.matches('[data-create-factory]'))content.querySelector('[data-create-factory-product]').innerHTML=productOptions(e.target.selectedOptions[0]?.dataset.chain||'fruit');if(e.target.matches('[data-create-store]'))content.querySelector('[data-create-store-product]').innerHTML=productOptions(e.target.selectedOptions[0]?.dataset.chain||'fruit');});
const applyRawFilters=()=>{const chain=content.querySelector('[data-raw-chain].is-active')?.dataset.rawChain||'all',group=content.querySelector('[data-raw-group].is-active')?.dataset.rawGroup||'all',select=content.querySelector('[data-raw-item]');if(!select)return;const entries=Object.entries(RAW_ITEMS).filter(([id,item])=>(chain==='all'||item.chainId===chain)&&(group==='all'||item.groupId===group)&&content.querySelector(`[data-raw-offers] article[data-item="${id}"]`));select.innerHTML=entries.map(([id,item])=>`<option value="${id}">${item.icon} ${item.label}</option>`).join('');select.disabled=!entries.length;if(entries.length){select.dispatchEvent(new Event('change',{bubbles:true}));}else{content.querySelectorAll('[data-raw-offers] article').forEach(article=>article.hidden=true);}};
content.addEventListener('click',e=>{const chainButton=e.target.closest('[data-raw-chain]'),groupButton=e.target.closest('[data-raw-group]');if(!chainButton&&!groupButton)return;e.stopImmediatePropagation();if(chainButton){content.querySelectorAll('[data-raw-chain]').forEach(button=>button.classList.toggle('is-active',button===chainButton));const chain=chainButton.dataset.rawChain;content.querySelectorAll('[data-parent-chain]').forEach(button=>button.hidden=chain!=='all'&&button.dataset.parentChain!==chain);const activeGroup=content.querySelector('[data-raw-group].is-active');if(activeGroup?.hidden){content.querySelectorAll('[data-raw-group]').forEach(button=>button.classList.toggle('is-active',button.dataset.rawGroup==='all'));}}if(groupButton){content.querySelectorAll('[data-raw-group]').forEach(button=>button.classList.toggle('is-active',button===groupButton));const parent=groupButton.dataset.parentChain;if(parent){content.querySelectorAll('[data-raw-chain]').forEach(button=>button.classList.toggle('is-active',button.dataset.rawChain===parent));content.querySelectorAll('[data-parent-chain]').forEach(button=>button.hidden=button.dataset.parentChain!==parent);}}applyRawFilters();});
content.addEventListener('click',async e=>{const t=e.target;if(busy)return;const rawFilter=t.closest('[data-raw-chain]');if(rawFilter){content.querySelectorAll('[data-raw-chain]').forEach(b=>b.classList.toggle('is-active',b===rawFilter));const allowed=Object.entries(RAW_ITEMS).filter(([,item])=>rawFilter.dataset.rawChain==='all'||item.chainId===rawFilter.dataset.rawChain).map(([id])=>id),select=content.querySelector('[data-raw-item]');[...select.options].forEach(option=>option.hidden=!allowed.includes(option.value));const first=[...select.options].find(option=>!option.hidden);if(first){select.value=first.value;select.dispatchEvent(new Event('change',{bubbles:true}));}return;}const tab=t.closest('[data-ex-tab]');if(tab){content.querySelectorAll('[data-ex-tab]').forEach(b=>b.classList.toggle('is-active',b===tab));content.querySelectorAll('[data-ex-page]').forEach(p=>p.hidden=p.dataset.exPage!==tab.dataset.exTab);return;}const filter=t.closest('[data-chain-filter]');if(filter){content.querySelectorAll('[data-chain-filter]').forEach(b=>b.classList.toggle('is-active',b===filter));content.querySelectorAll('.mn-market-list article[data-chain],.mn-deal-list article[data-chain]').forEach(a=>a.hidden=filter.dataset.chainFilter!=='all'&&a.dataset.chain!==filter.dataset.chainFilter);return;}let task=null,msg='';const sell=t.closest('[data-raw-sell]');if(sell){
  const quantity=Number(content.querySelector('[data-raw-qty]').value);
  const provider=String(sell.dataset.provider||'industry');

  if(provider==='fruit'){
    task=()=>sellToFactory(
      sell.dataset.rawSell,
      sell.dataset.city,
      sell.dataset.item,
      quantity
    );
  }else if(provider==='construction'){
    task=()=>sellLumberToConstructionFactory(
      sell.dataset.rawSell,
      sell.dataset.city,
      sell.dataset.item,
      quantity
    );
  }else{
    task=()=>sellIndustryRaw(
      sell.dataset.rawSell,
      sell.dataset.city,
      sell.dataset.item,
      quantity
    );
  }

  msg='Сырьё продано производству.';
}const buy=t.closest('[data-offer-buy]');if(buy){const dest=content.querySelector(`[data-offer-destination="${buy.dataset.offerBuy}"]`).value;if(dest.startsWith('factory:')){const [,factoryId,targetCityId]=dest.split(':');task=()=>buyIndustryOfferForFactory(buy.dataset.offerBuy,factoryId,targetCityId);msg='Партия передана следующему заводу.';}else{const businessId=dest.replace(/^store:/,'');task=()=>buyExchangeOffer(buy.dataset.chain,buy.dataset.offerBuy,businessId);msg=buy.dataset.chain==='fruit'||buy.dataset.chain==='construction'?'Товар закуплен на склад магазина.':'Поставка создана в логистике.';}}const accept=t.closest('[data-request-accept]');if(accept){const select=content.querySelector(`[data-request-factory="${accept.dataset.requestAccept}"]`),opt=select.selectedOptions[0];task=()=>takeExchangeRequest(accept.dataset.chain,accept.dataset.requestAccept,select.value,opt.dataset.city);msg='Производство приняло заказ.';}if(t.closest('[data-create-factory-offer]')){const s=content.querySelector('[data-create-factory]'),opt=s.selectedOptions[0],payload={factoryId:s.value,cityId:opt.dataset.city,productType:content.querySelector('[data-create-factory-product]').value,quantity:Number(content.querySelector('[data-create-factory-qty]').value),unitPrice:Number(content.querySelector('[data-create-factory-price]').value)};task=()=>publishFactoryOffer(opt.dataset.chain,payload);msg='Предложение опубликовано.';}if(t.closest('[data-create-store-request]')){const s=content.querySelector('[data-create-store]'),opt=s.selectedOptions[0],payload={businessId:s.value,cityId:opt.dataset.city,productType:content.querySelector('[data-create-store-product]').value,quantity:Number(content.querySelector('[data-create-store-qty]').value),unitPrice:Number(content.querySelector('[data-create-store-price]').value)};task=()=>publishStoreRequest(opt.dataset.chain,payload);msg='Заявка опубликована.';}if(!task)return;busy=true;try{const result=await task(),balance=Number(result?.playerBalance);if(Number.isFinite(balance)){state.player={...(state.player||{}),balance};save();window.dispatchEvent(new CustomEvent('mn:player-balance-changed',{detail:{balance,source:'production_market'}}));}toast(msg,'success');busy=false;await open(mode);}catch(err){const constructionMessage=getConstructionError(err);toast(constructionMessage!==String(err?.message||err)?constructionMessage:getFactoryError(err),'error');}finally{busy=false;}});
return()=>{window.removeEventListener('keydown',key,true);modal.remove();root.querySelector('.mn-production-shortcuts')?.remove();};}
