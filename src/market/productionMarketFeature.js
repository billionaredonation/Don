import './productionMarket.css';
import { state, save } from '../state.js';
import { loadRawMarket, sellToFactory, loadProductionExchange, createFactoryOffer, createStoreRequest, acceptStoreRequest, buyFactoryOffer, getFactoryError } from '../factory/factoryApi.js';
import { getMetallurgyError, loadMetallurgyRawMarket, sellMineRawToMetallurgy } from '../metallurgy/metallurgyApi.js';
import { PRODUCTION_CHAINS, productionChain, productionProduct } from './productionChains.js';

const RAW_ITEMS={farm_apple:{icon:'🍎',label:'Яблоки',chainId:'fruit',groupId:'farm'},farm_orange:{icon:'🍊',label:'Апельсины',chainId:'fruit',groupId:'farm'},farm_wheat:{icon:'🌾',label:'Пшеница',chainId:'fruit',groupId:'farm'},farm_corn:{icon:'🌽',label:'Кукуруза',chainId:'fruit',groupId:'farm'},mine_coal_common:{icon:'⚫',label:'Обыкновенный уголь',chainId:'metallurgy',groupId:'mine'},mine_coal_technical:{icon:'🧱',label:'Технический уголь',chainId:'metallurgy',groupId:'mine'},mine_metal_raw:{icon:'🔩',label:'Сырой металл',chainId:'metallurgy',groupId:'mine'},mine_metal_technical:{icon:'⛓️',label:'Технический металл',chainId:'metallurgy',groupId:'mine'},mine_copper_raw:{icon:'🟤',label:'Медная руда',chainId:'metallurgy',groupId:'mine'},mine_copper_conductive:{icon:'🟠',label:'Богатая медная руда',chainId:'metallurgy',groupId:'mine'}};

const STORE_FOR_PRODUCT=Object.freeze({
 grocery_bread:'grocery',grocery_pasta:'grocery',grocery_diet_fruit_salad:'grocery',grocery_universal_fruit_salad:'grocery',grocery_multifruit_juice:'grocery',
});

const RAW_GROUPS={farm:{icon:'🌾',label:'Сырьё с фермы',chainId:'fruit'},mine:{icon:'⛏️',label:'Сырьё с шахты',chainId:'metallurgy'}};
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const money=(v)=>`${Math.max(0,Math.round(Number(v)||0)).toLocaleString('ru-RU')} ₴`;
const quantity=(v)=>Math.max(0,Math.floor(Number(v)||0));
const dealTotal=(entry)=>money(quantity(entry?.quantity)*Math.max(0,Number(entry?.unitPrice)||0));
const toast=(message,type='info')=>window.dispatchEvent(new CustomEvent('mn:toast',{detail:{message,type}}));
const entityName=(entry,fallback)=>{const value=String(entry?.name||entry?.factoryName||entry?.storeName||entry?.businessName||'').trim();return !value||/[0-9a-f]{8}-[0-9a-f-]{27,}/i.test(value)||value==='Завод'||value==='Магазин'?`${fallback}${entry?.cityName||entry?.cityId?` · ${entry.cityName||entry.cityId}`:''}`:value;};

function shell(){return `<div class="mn-production-shortcuts"><button data-raw-market-open><b>O</b><span>Продать сырьё</span></button><button data-exchange-open><b>M</b><span>Биржа продукции</span></button></div><div class="mn-production-market" data-production-market hidden><button class="mn-production-backdrop" data-market-close></button><section><header><div><small data-market-eyebrow>РЫНОК</small><h2 data-market-title>Производственная экономика</h2></div><button data-market-close>×</button></header><main data-market-content></main></section></div>`;}

async function loadUniversalRaw(){
  const [fruitResult,metallurgyResult]=await Promise.allSettled([loadRawMarket(),loadMetallurgyRawMarket()]);
  if(fruitResult.status==='rejected'&&metallurgyResult.status==='rejected')throw fruitResult.reason;
  const fruitSource=fruitResult.status==='fulfilled'?fruitResult.value:{};
  const metallurgySource=metallurgyResult.status==='fulfilled'?metallurgyResult.value:{};
  const merged=[
    ...(fruitSource?.offers||[]).map(item=>({...item,chainId:'fruit',rawProvider:'fruit'})),
    ...(metallurgySource?.offers||[]).map(item=>({...item,chainId:'metallurgy',rawProvider:'metallurgy'})),
  ].filter(item=>RAW_ITEMS[item.itemType]);

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
function rawMarkup(data){const offers=data.offers||[],availableItems=Object.entries(RAW_ITEMS).filter(([id])=>offers.some(o=>o.itemType===id)),selected=availableItems[0]?.[0]||'',chainIds=[...new Set(offers.map(o=>o.chainId).filter(Boolean))];return `<div class="mn-raw-navigation"><div><small>1. Направление производства</small><div class="mn-market-chain-filter"><button class="is-active" data-raw-chain="all">Все направления</button>${chainIds.map(id=>{const chain=productionChain(id);return `<button data-raw-chain="${esc(id)}">${chain.factoryIcon||'🏭'} ${esc(chain.factoryLabel||id)}</button>`;}).join('')}</div></div><div><small>2. Категория сырья</small><div class="mn-raw-group-filter"><button class="is-active" data-raw-group="all">Все категории</button>${Object.entries(RAW_GROUPS).filter(([,group])=>chainIds.includes(group.chainId)).map(([id,group])=>`<button data-raw-group="${id}" data-parent-chain="${group.chainId}">${group.icon} ${group.label}</button>`).join('')}</div></div></div><div class="mn-market-hero"><i>📦</i><span><strong>Продажа сырья производственным предприятиям</strong><small>Выберите отрасль — будут показаны только заводы, принимающие это сырьё.</small></span></div><div class="mn-market-form"><label><span>3. Выберите конкретное сырьё</span><select data-raw-item>${availableItems.map(([id,item])=>`<option value="${id}">${item.icon} ${item.label}</option>`).join('')}</select></label><label><span>Количество</span><input type="number" min="1" value="10" data-raw-qty></label></div><div class="mn-market-list" data-raw-offers>${offers.length?offers.map(o=>{const item=RAW_ITEMS[o.itemType]||{icon:'📦',label:o.itemType},chain=productionChain(o.chainId);return `<article data-item="${esc(o.itemType)}" data-chain="${esc(o.chainId)}"${o.itemType===selected?'':' hidden'}><i>${item.icon}</i><span><strong>${esc(entityName(o,chain.factoryLabel))}</strong><small>${esc(o.cityName||o.cityId)} · принимает до ${Number(o.capacityLeft)} ед.</small></span><b>${money(o.unitPrice)} / ед.</b><button data-raw-sell="${esc(o.factoryId)}" data-provider="${esc(o.rawProvider)}" data-chain="${esc(o.chainId)}" data-city="${esc(o.cityId)}" data-item="${esc(o.itemType)}">Продать</button></article>`;}).join(''):'<p>Сейчас ни один завод не принимает сырьё.</p>'}</div>`;}

function normalizeExchange(source,chainId){const chain=productionChain(chainId),data=source||{};return {factories:(data.myFactories||[]).map(item=>({...item,chainId,name:entityName(item,chain.factoryLabel)})),stores:(data.myStores||[]).filter(item=>!item.businessType||item.businessType===chain.storeType).map(item=>({...item,chainId,name:entityName(item,chain.storeLabel)})),offers:(data.offers||[]).map(item=>({...item,chainId})),requests:(data.requests||[]).map(item=>({...item,chainId}))};}
async function loadUniversalExchange(){
  const result=normalizeExchange(await loadProductionExchange(),'fruit');

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
function storeOptions(items){return items.map(s=>`<option value="${esc(s.id||s.businessId)}" data-city="${esc(s.cityId)}" data-chain="${esc(s.chainId)}" data-business-type="${esc(s.businessType||'')}">🏪 ${esc(s.name)}</option>`).join('');}

function storeProductOptions(businessType, fallbackChainId=''){
  const type=String(businessType||'').trim();
  const normalizedType=type==='shop'?'grocery':type;
  const products=[];

  for(const chain of Object.values(PRODUCTION_CHAINS)){
    const chainStoreType=chain.storeType==='shop'?'grocery':chain.storeType;
    if(normalizedType && chainStoreType!==normalizedType)continue;
    for(const product of chain.products||[]){
      if(!products.some(item=>item.id===product.id))products.push(product);
    }
  }

  if(!products.length){
    return productOptions(fallbackChainId||'fruit');
  }

  return products
    .map(product=>`<option value="${esc(product.id)}">${product.icon||'📦'} ${esc(product.label)}</option>`)
    .join('');
}
const buyExchangeOffer=(_chain,id,businessId)=>buyFactoryOffer(id,businessId);
const takeExchangeRequest=(_chain,id,factoryId,cityId)=>acceptStoreRequest(id,factoryId,cityId);
const publishFactoryOffer=(_chain,payload)=>createFactoryOffer(payload);
const publishStoreRequest=(_chain,payload)=>createStoreRequest(payload);

function emptyState(icon,title,text){return `<div class="mn-market-empty"><i>${icon}</i><strong>${title}</strong><small>${text}</small></div>`;}
function dealCard(entry,type,actors){entry={...entry,chainId:'fruit'};const isRequest=type==='request',chain=productionChain('fruit'),product=productionProduct('fruit',entry.productType),compatibleStores=actors.stores.filter(s=>['grocery','shop',''].includes(String(s.businessType||''))),compatible=isRequest?actors.factories:compatibleStores,id=esc(entry.id),actor=entityName(entry,isRequest?chain.storeLabel:chain.factoryLabel);const destinationOptions=isRequest?'':compatibleStores.map(s=>`<option value="store:${esc(s.id||s.businessId)}">🏪 ${esc(s.name)}</option>`).join('');return `<article class="mn-deal-card ${isRequest?'is-request':'is-offer'}" data-chain="fruit">
  <div class="mn-deal-product"><i>${product?.icon||'📦'}</i><span><em>${isRequest?'МАГАЗИН ПОКУПАЕТ':'ЗАВОД ПРОДАЁТ'}</em><strong>${esc(product?.label||entry.productType)}</strong><small>${esc(actor)} · ${esc(entry.cityName||entry.cityId||'город не указан')}</small></span></div>
  <div class="mn-deal-numbers"><span><small>Количество</small><b>${quantity(entry.quantity)} ед.</b></span><span><small>Цена за единицу</small><b>${money(entry.unitPrice)}</b></span><span class="is-total"><small>${isRequest?'Магазин заплатит':'Стоимость партии'}</small><b>${dealTotal(entry)}</b></span></div>
  <div class="mn-deal-action">${compatible.length?`<label><span>${isRequest?'От какого завода поставляем':'Куда отправить партию'}</span><select ${isRequest?`data-request-factory="${id}"`:`data-offer-destination="${id}"`}>${isRequest?factoryOptions(compatible):destinationOptions}</select></label><button ${isRequest?`data-request-accept="${id}"`:`data-offer-buy="${id}"`} data-chain="${esc(entry.chainId)}">${isRequest?'Принять заказ':'Оформить поставку'} <span>→</span></button>`:`<p>${isRequest?'Нужен совместимый завод, которым вы управляете.':'Нужен совместимый магазин или следующий завод.'}</p>`}</div>
</article>`;}
function createCard(kind,items){const isFactory=kind==='factory',first=items[0];const firstProducts=first?(isFactory?productOptions(first.chainId):storeProductOptions(first.businessType,first.chainId)):'';return `<article class="mn-create-card ${isFactory?'is-supply':'is-demand'}"><header><i>${isFactory?'🏭':'🏪'}</i><span><em>${isFactory?'ПРОДАЖА':'ЗАКУПКА'}</em><h3>${isFactory?'Предложить товар':'Заказать поставку'}</h3><small>${isFactory?'Товар резервируется на складе завода и появляется в продаже.':'Заявка появляется в заказах магазинов, где завод может её принять.'}</small></span></header>${first?`<div class="mn-create-fields"><label><span>${isFactory?'Производство':'Магазин-заказчик'}</span><select ${isFactory?'data-create-factory':'data-create-store'}>${isFactory?factoryOptions(items):storeOptions(items)}</select></label><label><span>Товар</span><select ${isFactory?'data-create-factory-product':'data-create-store-product'}>${firstProducts}</select></label><label><span>Количество, ед.</span><input type="number" min="1" value="${isFactory?10:50}" ${isFactory?'data-create-factory-qty':'data-create-store-qty'}></label><label><span>Цена за единицу, ₴</span><input type="number" min="1" value="${isFactory?50:55}" ${isFactory?'data-create-factory-price':'data-create-store-price'}></label></div><button class="mn-create-submit" ${isFactory?'data-create-factory-offer':'data-create-store-request'}>${isFactory?'Выставить товар':'Опубликовать заказ'} <span>→</span></button>`:`<p class="mn-create-unavailable">${isFactory?'У вас нет производственного предприятия.':'У вас нет совместимого магазина.'}</p>`}</article>`;}
function exchangeMarkup(data){const {factories,stores,offers,requests}=data;return `<div class="mn-exchange-summary"><div><em>ТОРГОВАЯ ПЛОЩАДКА</em><strong>Найдите покупателя или поставщика</strong><small>Магазины публикуют заказы, заводы предлагают готовые партии. Промежуточный товар можно передать следующему заводу, а конечный товар после покупки уходит в логистику и приезжает на склад магазина.</small></div><dl><span><dt>${offers.length}</dt><dd>партий в продаже</dd></span><span><dt>${requests.length}</dt><dd>заказов магазинов</dd></span></dl></div>
<div class="mn-market-chain-filter"><button class="is-active" data-chain-filter="all">Все отрасли</button>${Object.values(PRODUCTION_CHAINS).filter(c=>!c.rawOnly).map(c=>`<button data-chain-filter="${c.id}">${c.factoryIcon} ${esc(c.factoryLabel)}</button>`).join('')}</div>
<div class="mn-market-tabs"><button class="is-active" data-ex-tab="offers"><span>Готовые партии</span><b>${offers.length}</b></button><button data-ex-tab="requests"><span>Заказы магазинов</span><b>${requests.length}</b></button><button data-ex-tab="create"><span>Создать объявление</span><b>＋</b></button></div>
<div data-ex-page="offers"><div class="mn-page-intro"><span><strong>Предложения заводов</strong><small>Готовый товар, который можно сразу закупить на склад магазина.</small></span></div><div class="mn-deal-list">${offers.length?offers.map(o=>dealCard(o,'offer',{factories,stores})).join(''):emptyState('📦','Пока нет готовых партий','Заводы ещё не выставили продукцию на продажу.')}</div></div>
<div data-ex-page="requests" hidden><div class="mn-page-intro is-demand"><span><strong>Заказы от магазинов</strong><small>Это заявки на поставку. Выберите свой завод и примите подходящий заказ.</small></span></div><div class="mn-deal-list">${requests.length?requests.map(r=>dealCard(r,'request',{factories,stores})).join(''):emptyState('🧾','Новых заказов пока нет','Когда магазин закажет поставку, его заявка появится здесь.')}</div></div>
<div data-ex-page="create" hidden><div class="mn-create-grid">${createCard('factory',factories)}${createCard('store',stores)}</div></div>`;}

export function enableProductionMarketFeature({root}){root.insertAdjacentHTML('beforeend',shell());const modal=root.querySelector('[data-production-market]'),content=modal.querySelector('[data-market-content]');let mode='',busy=false;
const open=async(next)=>{if(busy)return;busy=true;mode=next;modal.hidden=false;content.innerHTML='<div class="mn-market-loading">Загружаем предложения…</div>';try{const data=next==='raw'?await loadUniversalRaw():await loadUniversalExchange();content.innerHTML=next==='raw'?rawMarkup(data):exchangeMarkup(data);modal.querySelector('[data-market-title]').textContent=next==='raw'?'Продать сырьё':'Биржа готовой продукции';modal.querySelector('[data-market-eyebrow]').textContent=next==='raw'?'КЛАВИША O':'КЛАВИША M';}catch(e){content.innerHTML=`<div class="mn-market-error">${esc(getFactoryError(e))}</div>`;}finally{busy=false;}};
const close=()=>{modal.hidden=true;};root.querySelector('[data-raw-market-open]').onclick=()=>open('raw');root.querySelector('[data-exchange-open]').onclick=()=>open('exchange');modal.querySelectorAll('[data-market-close]').forEach(b=>b.onclick=close);
const key=e=>{if(e.repeat||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||''))return;if(e.code==='KeyO'){e.preventDefault();void open('raw');}if(e.code==='KeyM'){e.preventDefault();void open('exchange');}if(e.key==='Escape'&&!modal.hidden)close();};window.addEventListener('keydown',key,true);
content.addEventListener('change',e=>{if(e.target.matches('[data-raw-item]'))content.querySelectorAll('[data-raw-offers] article').forEach(a=>a.hidden=a.dataset.item!==e.target.value);if(e.target.matches('[data-create-factory]'))content.querySelector('[data-create-factory-product]').innerHTML=productOptions(e.target.selectedOptions[0]?.dataset.chain||'fruit');if(e.target.matches('[data-create-store]')){const option=e.target.selectedOptions[0];content.querySelector('[data-create-store-product]').innerHTML=storeProductOptions(option?.dataset.businessType||'',option?.dataset.chain||'fruit');}});
const applyRawFilters=()=>{const chain=content.querySelector('[data-raw-chain].is-active')?.dataset.rawChain||'all',group=content.querySelector('[data-raw-group].is-active')?.dataset.rawGroup||'all',select=content.querySelector('[data-raw-item]');if(!select)return;const entries=Object.entries(RAW_ITEMS).filter(([id,item])=>(chain==='all'||item.chainId===chain)&&(group==='all'||item.groupId===group)&&content.querySelector(`[data-raw-offers] article[data-item="${id}"]`));select.innerHTML=entries.map(([id,item])=>`<option value="${id}">${item.icon} ${item.label}</option>`).join('');select.disabled=!entries.length;if(entries.length){select.dispatchEvent(new Event('change',{bubbles:true}));}else{content.querySelectorAll('[data-raw-offers] article').forEach(article=>article.hidden=true);}};
content.addEventListener('click',e=>{const chainButton=e.target.closest('[data-raw-chain]'),groupButton=e.target.closest('[data-raw-group]');if(!chainButton&&!groupButton)return;e.stopImmediatePropagation();if(chainButton){content.querySelectorAll('[data-raw-chain]').forEach(button=>button.classList.toggle('is-active',button===chainButton));const chain=chainButton.dataset.rawChain;content.querySelectorAll('[data-parent-chain]').forEach(button=>button.hidden=chain!=='all'&&button.dataset.parentChain!==chain);const activeGroup=content.querySelector('[data-raw-group].is-active');if(activeGroup?.hidden){content.querySelectorAll('[data-raw-group]').forEach(button=>button.classList.toggle('is-active',button.dataset.rawGroup==='all'));}}if(groupButton){content.querySelectorAll('[data-raw-group]').forEach(button=>button.classList.toggle('is-active',button===groupButton));const parent=groupButton.dataset.parentChain;if(parent){content.querySelectorAll('[data-raw-chain]').forEach(button=>button.classList.toggle('is-active',button.dataset.rawChain===parent));content.querySelectorAll('[data-parent-chain]').forEach(button=>button.hidden=button.dataset.parentChain!==parent);}}applyRawFilters();});
content.addEventListener('click',async e=>{const t=e.target;if(busy)return;const rawFilter=t.closest('[data-raw-chain]');if(rawFilter){content.querySelectorAll('[data-raw-chain]').forEach(b=>b.classList.toggle('is-active',b===rawFilter));const allowed=Object.entries(RAW_ITEMS).filter(([,item])=>rawFilter.dataset.rawChain==='all'||item.chainId===rawFilter.dataset.rawChain).map(([id])=>id),select=content.querySelector('[data-raw-item]');[...select.options].forEach(option=>option.hidden=!allowed.includes(option.value));const first=[...select.options].find(option=>!option.hidden);if(first){select.value=first.value;select.dispatchEvent(new Event('change',{bubbles:true}));}return;}const tab=t.closest('[data-ex-tab]');if(tab){content.querySelectorAll('[data-ex-tab]').forEach(b=>b.classList.toggle('is-active',b===tab));content.querySelectorAll('[data-ex-page]').forEach(p=>p.hidden=p.dataset.exPage!==tab.dataset.exTab);return;}const filter=t.closest('[data-chain-filter]');if(filter){content.querySelectorAll('[data-chain-filter]').forEach(b=>b.classList.toggle('is-active',b===filter));content.querySelectorAll('.mn-market-list article[data-chain],.mn-deal-list article[data-chain]').forEach(a=>a.hidden=filter.dataset.chainFilter!=='all'&&a.dataset.chain!==filter.dataset.chainFilter);return;}let task=null,msg='',errorMessage=getFactoryError,refreshMineInventory=false;const sell=t.closest('[data-raw-sell]');if(sell){
  const quantity=Number(content.querySelector('[data-raw-qty]').value);
  if(sell.dataset.provider==='metallurgy'){
    task=()=>sellMineRawToMetallurgy(sell.dataset.rawSell,sell.dataset.city,sell.dataset.item,quantity);
    errorMessage=getMetallurgyError;
    refreshMineInventory=true;
  }else{
    task=()=>sellToFactory(sell.dataset.rawSell,sell.dataset.city,sell.dataset.item,quantity);
  }

  msg='Сырьё продано производству.';
}const buy=t.closest('[data-offer-buy]');if(buy){const dest=content.querySelector(`[data-offer-destination="${buy.dataset.offerBuy}"]`).value;const businessId=dest.replace(/^store:/,'');task=()=>buyExchangeOffer('fruit',buy.dataset.offerBuy,businessId);msg='Товар закуплен на склад продуктового магазина.';}const accept=t.closest('[data-request-accept]');if(accept){const select=content.querySelector(`[data-request-factory="${accept.dataset.requestAccept}"]`),opt=select.selectedOptions[0];task=()=>takeExchangeRequest('fruit',accept.dataset.requestAccept,select.value,opt.dataset.city);msg='Продуктовый завод принял заказ.';}if(t.closest('[data-create-factory-offer]')){const s=content.querySelector('[data-create-factory]'),opt=s.selectedOptions[0],payload={factoryId:s.value,cityId:opt.dataset.city,productType:content.querySelector('[data-create-factory-product]').value,quantity:Number(content.querySelector('[data-create-factory-qty]').value),unitPrice:Number(content.querySelector('[data-create-factory-price]').value)};task=()=>publishFactoryOffer('fruit',payload);msg='Предложение опубликовано.';}if(t.closest('[data-create-store-request]')){const s=content.querySelector('[data-create-store]'),opt=s.selectedOptions[0],payload={businessId:s.value,cityId:opt.dataset.city,productType:content.querySelector('[data-create-store-product]').value,quantity:Number(content.querySelector('[data-create-store-qty]').value),unitPrice:Number(content.querySelector('[data-create-store-price]').value)};task=()=>publishStoreRequest('fruit',payload);msg='Заявка продуктового магазина опубликована.';}if(!task)return;busy=true;try{const result=await task(),balance=Number(result?.playerBalance);if(Number.isFinite(balance)){state.player={...(state.player||{}),balance};save();window.dispatchEvent(new CustomEvent('mn:player-balance-changed',{detail:{balance,source:'production_market'}}));}if(refreshMineInventory)window.dispatchEvent(new CustomEvent('mn:mine-inventory-changed'));toast(msg,'success');busy=false;await open(mode);}catch(err){toast(errorMessage(err),'error');}finally{busy=false;}});
return()=>{window.removeEventListener('keydown',key,true);modal.remove();root.querySelector('.mn-production-shortcuts')?.remove();};}
