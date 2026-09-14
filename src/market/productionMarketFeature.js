import './productionMarket.css';
import { state, save } from '../state.js';
import { sellToFactory, loadProductionExchange, createStoreRequest, getFactoryError } from '../factory/factoryApi.js';
import { getMetallurgyError, loadMetallurgyRawMarket, sellMineRawToMetallurgy } from '../metallurgy/metallurgyApi.js';
import { getWoodProcessingError, loadWoodProcessingRawMarket, sellLumberToWoodProcessing } from '../woodProcessing/woodProcessingApi.js';
import { createTextileStoreRequest, getTextileError, loadTextileExchange, sellFarmRawToTextile } from '../textile/textileApi.js';
import { FACTORY_PROCUREMENT_ITEMS } from '../factory/factoryConfig.js';
import { METALLURGY_RAW_ITEMS } from '../metallurgy/metallurgyConfig.js';
import { WOOD_PROCESSING_RAW_ITEMS } from '../woodProcessing/woodProcessingConfig.js';
import { TEXTILE_RAW_ITEMS } from '../textile/textileConfig.js';
import { PRODUCTION_CHAINS, canonicalProductionChainForProduct, productionChain, productionProduct } from './productionChains.js';
import { getProcurementError, loadProcurementMarket, sellToProcurementBuyer } from '../procurement/procurementApi.js';
import { acceptProductionRequest, buyProductionOffer, completeProductionDelivery, getProductionExchangeError, loadProductionExchangeV2, publishProductionOffer } from './productionExchangeApi.js';
import { playCargoTransferMiniGame } from '../logistics/cargoTransferMiniGame.js';

const rawCatalogEntries=(items,chainId,groupId)=>items.map((item)=>[item.itemType,{...item,chainId,groupId}]);
const RAW_ITEMS=Object.fromEntries([
  ...rawCatalogEntries(FACTORY_PROCUREMENT_ITEMS,'fruit','farm'),
  ...rawCatalogEntries(TEXTILE_RAW_ITEMS,'textile','textile_farm'),
  ...rawCatalogEntries(METALLURGY_RAW_ITEMS,'metallurgy','mine'),
  ...rawCatalogEntries(WOOD_PROCESSING_RAW_ITEMS,'wood_processing','lumber'),
]);
const TEXTILE_RAW_TYPES=new Set(TEXTILE_RAW_ITEMS.map(item=>item.itemType));

const STORE_FOR_PRODUCT=Object.freeze({
 grocery_bread:'grocery',grocery_pasta:'grocery',grocery_diet_fruit_salad:'grocery',grocery_universal_fruit_salad:'grocery',grocery_multifruit_juice:'grocery',
});

const RAW_GROUPS={farm:{icon:'🌾',label:'Пищевое сырьё с фермы',chainId:'fruit'},textile_farm:{icon:'🧵',label:'Текстильное сырьё с фермы',chainId:'textile'},mine:{icon:'⛏️',label:'Сырьё с шахты',chainId:'metallurgy'},lumber:{icon:'🌲',label:'Сырьё лесоруба',chainId:'wood_processing'}};
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const money=(v)=>`${Math.max(0,Math.round(Number(v)||0)).toLocaleString('ru-RU')} ₴`;
const quantity=(v)=>Math.max(0,Math.floor(Number(v)||0));
const dealTotal=(entry)=>money(quantity(entry?.quantity)*Math.max(0,Number(entry?.unitPrice)||0));
const toast=(message,type='info')=>window.dispatchEvent(new CustomEvent('mn:toast',{detail:{message,type}}));
const entityName=(entry,fallback)=>{const value=String(entry?.name||entry?.factoryName||entry?.storeName||entry?.businessName||'').trim();return !value||/[0-9a-f]{8}-[0-9a-f-]{27,}/i.test(value)||value==='Завод'||value==='Магазин'?`${fallback}${entry?.cityName||entry?.cityId?` · ${entry.cityName||entry.cityId}`:''}`:value;};
const sourceOffers=(source)=>{
  if(Array.isArray(source))return source;
  const direct=source?.offers||source?.rawOffers||source?.raw_offers||source?.items||source?.data?.offers||source?.result?.offers;
  if(Array.isArray(direct))return direct;
  const containers=source?.factories||source?.industries||source?.businesses||[];
  if(!Array.isArray(containers))return [];
  return containers.flatMap((container)=>{
    const items=container?.offers||container?.rawItems||container?.raw_items||container?.acceptedItems||container?.accepted_items||[];
    return Array.isArray(items)?items.map((item)=>typeof item==='string'?{...container,itemType:item}:{...container,...item}):[];
  });
};
const RAW_ITEM_ALIASES={apple:'farm_apple',orange:'farm_orange',wheat:'farm_wheat',corn:'farm_corn',flax:'farm_flax',cotton:'farm_cotton',log:'lumber_log',beam:'lumber_beam'};
const canonicalRawItemType=(value)=>{
  const itemType=String(value||'').trim().toLowerCase();
  return RAW_ITEM_ALIASES[itemType]||itemType;
};
const normalizeRawOffer=(item)=>({
  ...item,
  factoryId:item?.factoryId||item?.factory_id||item?.businessId||item?.business_id||item?.mapObjectId||item?.map_object_id||item?.objectId||item?.object_id||item?.id||'',
  cityId:item?.cityId||item?.city_id||'',
  cityName:item?.cityName||item?.city_name||'',
  itemType:canonicalRawItemType(item?.itemType||item?.item_type||item?.rawItemType||item?.raw_item_type||item?.resourceType||item?.resource_type||item?.productType||item?.product_type||''),
  itemLabel:item?.itemLabel||item?.item_label||item?.resourceLabel||item?.resource_label||item?.label||'',
  itemIcon:item?.itemIcon||item?.item_icon||item?.resourceIcon||item?.resource_icon||item?.icon||'',
  industryId:item?.industryId||item?.industry_id||item?.chainId||item?.chain_id||'',
  unitPrice:item?.unitPrice??item?.unit_price??item?.buyPrice??item?.buy_price??0,
  capacityLeft:item?.capacityLeft??item?.capacity_left??item?.availableCapacity??item?.available_capacity??0,
  factoryName:item?.factoryName||item?.factory_name||item?.industryName||item?.industry_name||'',
});
const INDUSTRY_CHAIN_ALIASES={food:'fruit',fruit_factory:'fruit',fruit:'fruit',metallurgy_factory:'metallurgy',metallurgy:'metallurgy',wood_factory:'wood_processing',wood_processing_factory:'wood_processing',wood_processing:'wood_processing',tool_factory:'tool_assembly',tool_assembly_factory:'tool_assembly',tool_assembly:'tool_assembly',textile_factory:'textile',textile:'textile'};
const chainForRawOffer=(offer,fallback='')=>INDUSTRY_CHAIN_ALIASES[String(offer?.industryId||'').toLowerCase()]||RAW_ITEMS[offer?.itemType]?.chainId||fallback||'fruit';

function shell(){return `<div class="mn-production-shortcuts"><button data-raw-market-open><b>O</b><span>Продать сырьё</span></button><button data-exchange-open hidden><b>M</b><span>Биржа продукции</span></button></div><div class="mn-production-market" data-production-market hidden><button class="mn-production-backdrop" data-market-close></button><section><header><div><small data-market-eyebrow>РЫНОК</small><h2 data-market-title>Производственная экономика</h2></div><button data-market-close>×</button></header><main data-market-content></main></section></div>`;}

async function loadUniversalRaw(){
  const source=await loadProcurementMarket();
  const merged=sourceOffers(source).map(normalizeRawOffer).map(item=>({...item,chainId:chainForRawOffer(item),rawProvider:'procurement'})).filter(item=>RAW_ITEMS[item.itemType]&&item.factoryId);

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
function rawMarkup(data){const offers=data.offers||[],availableItems=Object.entries(RAW_ITEMS),selected=availableItems[0]?.[0]||'',chainIds=[...new Set(availableItems.map(([,item])=>item.chainId).filter(Boolean))],selectedHasOffers=offers.some(o=>o.itemType===selected);return `<div class="mn-raw-navigation"><div><small>1. Направление производства</small><div class="mn-market-chain-filter"><button class="is-active" data-raw-chain="all">Все направления</button>${chainIds.map(id=>{const chain=productionChain(id);return `<button data-raw-chain="${esc(id)}">${chain.factoryIcon||'🏭'} ${esc(chain.factoryLabel||id)}</button>`;}).join('')}</div></div><div><small>2. Категория сырья</small><div class="mn-raw-group-filter"><button class="is-active" data-raw-group="all">Все категории</button>${Object.entries(RAW_GROUPS).filter(([,group])=>chainIds.includes(group.chainId)).map(([id,group])=>`<button data-raw-group="${id}" data-parent-chain="${group.chainId}">${group.icon} ${group.label}</button>`).join('')}</div></div></div><div class="mn-market-hero"><i>📦</i><span><strong>Продажа сырья производственным предприятиям</strong><small>В списке — всё разрешённое для продажи сырьё. Ниже показываются только предприятия с активной закупкой.</small></span></div><div class="mn-market-form"><label><span>3. Выберите конкретное сырьё</span><select data-raw-item>${availableItems.map(([id,item])=>`<option value="${id}">${item.icon} ${item.label}</option>`).join('')}</select></label><label><span>Количество</span><input type="number" min="1" value="10" data-raw-qty></label></div><div class="mn-market-list" data-raw-offers>${offers.map(o=>{const item=RAW_ITEMS[o.itemType],chain=productionChain(o.chainId);return `<article data-item="${esc(o.itemType)}" data-chain="${esc(o.chainId)}"${o.itemType===selected?'':' hidden'}><i>${item.icon}</i><span><strong>${esc(entityName(o,chain.factoryLabel))}</strong><small>${esc(o.cityName||o.cityId)} · принимает до ${Number(o.capacityLeft)} ед.</small></span><b>${money(o.unitPrice)} / ед.</b><button data-raw-sell="${esc(o.factoryId)}" data-provider="${esc(o.rawProvider)}" data-chain="${esc(o.chainId)}" data-city="${esc(o.cityId)}" data-item="${esc(o.itemType)}">Продать</button></article>`;}).join('')}<p class="mn-raw-no-buyers" data-raw-empty${selectedHasOffers?' hidden':''}>Нет активной закупки: цена может быть 0, бюджет меньше цены одной единицы или склад предприятия заполнен.</p></div>`;}

function normalizeExchange(source,chainId){const chain=productionChain(chainId),data=source||{};return {factories:(data.myFactories||[]).map(item=>({...item,chainId,name:entityName(item,chain.factoryLabel)})),stores:(data.myStores||[]).filter(item=>!item.businessType||item.businessType===chain.storeType).map(item=>({...item,chainId,name:entityName(item,chain.storeLabel)})),offers:(data.offers||[]).map(item=>({...item,chainId})),requests:(data.requests||[]).map(item=>({...item,chainId}))};}
function normalizeUniversalExchange(source){const data=source||{},chainOf=(item,fallback='')=>canonicalProductionChainForProduct(item?.productType||item?.product_type,INDUSTRY_CHAIN_ALIASES[String(item?.industryId||item?.industry_id||item?.factoryType||item?.businessType||'').toLowerCase()]||fallback||'fruit');return {
  factories:(data.myFactories||data.factories||[]).map(item=>{const chainId=chainOf(item);return {...item,chainId,entityKind:'factory',factoryType:item.factoryType||item.businessType||productionChain(chainId).factoryType,name:entityName(item,productionChain(chainId).factoryLabel)};}),
  stores:(data.myStores||data.stores||[]).map(item=>({...item,entityKind:'store',businessType:item.businessType==='shop'?'grocery':item.businessType,name:entityName(item,'Магазин')})),
  offers:(data.offers||[]).map(item=>({...item,chainId:chainOf(item)})),
  requests:(data.requests||[]).map(item=>({...item,chainId:chainOf(item)})),
  deliveries:(data.deliveries||[]).map(item=>({...item,chainId:chainOf(item)})),
};}
async function loadUniversalExchange(){
  try{return normalizeUniversalExchange(await loadProductionExchangeV2());}catch(error){console.warn('[market] universal production exchange unavailable, using compatibility sources:',error);}
  const result={factories:[],stores:[],offers:[],requests:[],deliveries:[]};
  let loadedSources=0,lastError=null;
  try {
    const production=normalizeExchange(await loadProductionExchange(),'fruit');
    result.factories.push(...production.factories);
    result.stores.push(...production.stores);
    result.offers.push(...production.offers);
    result.requests.push(...production.requests);
    loadedSources+=1;
  } catch (error) { lastError=error; console.warn('[market] production exchange unavailable:',error); }
  try {
    const textile=normalizeExchange(await loadTextileExchange(),'textile');
    result.factories.push(...textile.factories.filter(item=>!item.industryId||item.industryId==='textile'));
    result.stores.push(...textile.stores);
    result.offers.push(...textile.offers.filter(item=>String(item.productType||'').startsWith('textile_')));
    result.requests.push(...textile.requests.filter(item=>String(item.productType||'').startsWith('textile_')));
    loadedSources+=1;
  } catch (error) { lastError=error; console.warn('[market] textile exchange unavailable:', error); }

  if(!loadedSources)throw lastError||new Error('EXCHANGE_UNAVAILABLE');

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
const destinationLabel=(entry,fallback)=>`${entityName(entry,fallback)} · ${entry.cityName||entry.cityId||'город не указан'}${entry.publicBusinessId?` · ID ${entry.publicBusinessId}`:''}`;
function factoryOptions(items){return items.map(f=>`<option value="${esc(f.id||f.factoryId)}" data-city="${esc(f.cityId)}" data-chain="${esc(f.chainId)}" data-public-id="${esc(f.publicBusinessId||'')}">${productionChain(f.chainId).factoryIcon} ${esc(destinationLabel(f,productionChain(f.chainId).factoryLabel))}</option>`).join('');}
function storeOptions(items){return items.map(s=>`<option value="${esc(s.id||s.businessId)}" data-city="${esc(s.cityId)}" data-chain="${esc(s.chainId)}" data-business-type="${esc(s.businessType||'')}" data-public-id="${esc(s.publicBusinessId||'')}">🏪 ${esc(destinationLabel(s,productionChain(s.chainId).storeLabel))}</option>`).join('');}

function storeProductOptions(businessType, fallbackChainId=''){
  const type=String(businessType||'').trim();
  const normalizedType=type==='shop'?'grocery':type;
  const products=[];

  for(const chain of Object.values(PRODUCTION_CHAINS)){
    const chainStoreType=chain.storeType==='shop'?'grocery':chain.storeType;
    for(const product of chain.products||[]){
      const buyerTypes=(product.buyerTypes?.length?product.buyerTypes:[chainStoreType]).filter(Boolean);
      if(normalizedType&&!buyerTypes.includes(normalizedType))continue;
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
const takeExchangeRequest=(chain,id,factoryId,cityId)=>acceptProductionRequest({requestId:id,factoryId,cityId,industryId:chain});
const publishFactoryOffer=(chain,payload)=>publishProductionOffer({industryId:chain,...payload});
const publishStoreRequest=(chain,payload)=>chain==='textile'?createTextileStoreRequest(payload):createStoreRequest(payload);

function emptyState(icon,title,text){return `<div class="mn-market-empty"><i>${icon}</i><strong>${title}</strong><small>${text}</small></div>`;}
function productBuyerTypes(chainId,productType){const chain=productionChain(chainId),product=productionProduct(chainId,productType),fallback=chain.storeType==='shop'?'grocery':chain.storeType;return (product?.buyerTypes?.length?product.buyerTypes:[fallback]).filter(Boolean);}
function compatibleDestinations(actors,chainId,productType){
  const allowed=new Set(productBuyerTypes(chainId,productType));
  const stores=(actors.stores||[])
    .map(item=>({...item,entityKind:'store'}))
    .filter(item=>{const type=String(item.businessType==='shop'?'grocery':item.businessType||'').trim();return allowed.has(type);});
  const factories=(actors.factories||[])
    .map(item=>({...item,entityKind:'factory'}))
    .filter(item=>{const type=String(item.factoryType||item.businessType||'').trim();return type.endsWith('_factory')&&allowed.has(type);});
  return [...stores,...factories];
}
function destinationPickerMarkup(){return `<div class="mn-destination-picker" data-destination-picker hidden><button type="button" class="mn-destination-picker-backdrop" data-destination-picker-cancel aria-label="Закрыть"></button><section role="dialog" aria-modal="true" aria-labelledby="mn-destination-picker-title"><header><span><small>ВАШИ СОВМЕСТИМЫЕ ПРЕДПРИЯТИЯ</small><h3 id="mn-destination-picker-title">Куда оформить поставку</h3></span><button type="button" data-destination-picker-cancel>×</button></header><div class="mn-destination-picker-product" data-destination-picker-product></div><div class="mn-destination-picker-list" data-destination-picker-list></div><footer><button type="button" data-destination-picker-cancel>Отмена</button><button type="button" class="is-primary" data-destination-picker-confirm>Оплатить и создать доставку</button></footer></section></div>`;}
function destinationPickerRows(destinations){return destinations.map((entry,index)=>{const id=entry.id||entry.businessId||entry.factoryId,type=entry.entityKind==='factory'?(entry.factoryType||entry.businessType):entry.businessType;return `<label class="mn-destination-option"><input type="radio" name="mn-destination-store" value="${esc(id)}" data-kind="${esc(entry.entityKind)}" data-city="${esc(entry.cityId||'')}" data-type="${esc(type||'')}"${index===0?' checked':''}><i>${entry.entityKind==='factory'?'🏭':'🏪'}</i><span><strong>${esc(entityName(entry,entry.entityKind==='factory'?'Производственное предприятие':'Магазин'))}</strong><small>${esc(entry.cityName||entry.cityId||'Город не указан')}${entry.publicBusinessId?` · ID ${esc(entry.publicBusinessId)}`:''}</small></span><b>Выбрать</b></label>`;}).join('');}
function dealCard(entry,type,actors){const chainId=entry.chainId||'fruit',isRequest=type==='request',chain=productionChain(chainId),product=productionProduct(chainId,entry.productType),compatibleFactories=actors.factories.filter(f=>f.chainId===chainId),compatible=isRequest?compatibleFactories:compatibleDestinations(actors,chainId,entry.productType),id=esc(entry.id),actor=entityName(entry,isRequest?chain.storeLabel:chain.factoryLabel);return `<article class="mn-deal-card ${isRequest?'is-request':'is-offer'}" data-chain="${esc(chainId)}">
  <div class="mn-deal-product"><i>${product?.icon||'📦'}</i><span><em>${isRequest?'МАГАЗИН ПОКУПАЕТ':'ЗАВОД ПРОДАЁТ'}</em><strong>${esc(product?.label||entry.productType)}</strong><small>${esc(actor)} · ${esc(entry.cityName||entry.cityId||'город не указан')}</small></span></div>
  <div class="mn-deal-numbers"><span><small>Количество</small><b>${quantity(entry.quantity)} ед.</b></span><span><small>Цена за единицу</small><b>${money(entry.unitPrice)}</b></span><span class="is-total"><small>${isRequest?'Магазин заплатит':'Стоимость партии'}</small><b>${dealTotal(entry)}</b></span></div>
  <div class="mn-deal-action">${compatible.length?(isRequest?`<label><span>От какого завода поставляем</span><select data-request-factory="${id}">${factoryOptions(compatible)}</select></label><button data-request-accept="${id}" data-chain="${esc(entry.chainId)}">Принять заказ <span>→</span></button>`:`<button class="mn-send-to-stock" data-offer-destination-open="${id}" data-chain="${esc(entry.chainId)}">Купить и заказать доставку <span>→</span></button>`):`<p>${isRequest?'Нужен совместимый завод, которым вы управляете.':'У вас нет совместимого предприятия для этой продукции.'}</p>`}</div>
</article>`;}
function createCard(kind,items){const isFactory=kind==='factory',first=items[0];const firstProducts=first?(isFactory?productOptions(first.chainId):storeProductOptions(first.businessType,first.chainId)):'';return `<article class="mn-create-card ${isFactory?'is-supply':'is-demand'}"><header><i>${isFactory?'🏭':'🏪'}</i><span><em>${isFactory?'ПРОДАЖА':'ЗАКУПКА'}</em><h3>${isFactory?'Предложить товар':'Заказать поставку'}</h3><small>${isFactory?'Товар резервируется на складе завода и появляется в продаже.':'Заявка появляется в заказах магазинов, где завод может её принять.'}</small></span></header>${first?`<div class="mn-create-fields"><label><span>${isFactory?'Производство':'Магазин-заказчик'}</span><select ${isFactory?'data-create-factory':'data-create-store'}>${isFactory?factoryOptions(items):storeOptions(items)}</select></label><label><span>Товар</span><select ${isFactory?'data-create-factory-product':'data-create-store-product'}>${firstProducts}</select></label><label><span>Количество, ед.</span><input type="number" min="1" value="${isFactory?10:50}" ${isFactory?'data-create-factory-qty':'data-create-store-qty'}></label><label><span>Цена за единицу, ₴</span><input type="number" min="1" value="${isFactory?50:55}" ${isFactory?'data-create-factory-price':'data-create-store-price'}></label></div><button class="mn-create-submit" ${isFactory?'data-create-factory-offer':'data-create-store-request'}>${isFactory?'Выставить товар':'Опубликовать заказ'} <span>→</span></button>`:`<p class="mn-create-unavailable">${isFactory?'У вас нет производственного предприятия.':'У вас нет совместимого магазина.'}</p>`}</article>`;}
function deliveryCard(entry){const chain=productionChain(entry.chainId),product=productionProduct(entry.chainId,entry.productType);return `<article class="mn-delivery-card" data-chain="${esc(entry.chainId)}"><i>${product?.icon||'📦'}</i><span><em>ОПЛАЧЕННАЯ ПОСТАВКА</em><strong>${esc(product?.label||entry.productType)}</strong><small>${quantity(entry.quantity)} ед. · ${esc(entry.targetName||'Предприятие')} · ${esc(entry.targetCityId||'город не указан')}${entry.publicBusinessId?` · ID ${esc(entry.publicBusinessId)}`:''}</small></span><b>${money(entry.totalPrice)}</b><button type="button" data-delivery-complete="${esc(entry.id)}">Выполнить доставку →</button></article>`;}
function exchangeMarkup(data){const {factories,stores,offers,requests}=data,deliveries=data.deliveries||[],requestStores=stores.filter(store=>Object.values(PRODUCTION_CHAINS).some(chain=>chain.supportsRequests&&(chain.storeType==='shop'?'grocery':chain.storeType)===(store.businessType==='shop'?'grocery':store.businessType)));return `<div class="mn-exchange-summary"><div><em>ТОРГОВАЯ ПЛОЩАДКА</em><strong>Найдите покупателя или поставщика</strong><small>Завод выставляет готовую партию, совместимое предприятие оплачивает её, а товар попадает на склад только после отдельного этапа доставки.</small></div><dl><span><dt>${offers.length}</dt><dd>партий в продаже</dd></span><span><dt>${deliveries.length}</dt><dd>поставок ожидают</dd></span></dl></div>
<div class="mn-market-chain-filter"><button class="is-active" data-chain-filter="all">Все отрасли</button>${Object.values(PRODUCTION_CHAINS).filter(c=>!c.rawOnly).map(c=>`<button data-chain-filter="${c.id}">${c.factoryIcon} ${esc(c.factoryLabel)}</button>`).join('')}</div>
<div class="mn-market-tabs"><button class="is-active" data-ex-tab="offers"><span>Готовые партии</span><b>${offers.length}</b></button><button data-ex-tab="deliveries"><span>Логистика</span><b>${deliveries.length}</b></button><button data-ex-tab="requests"><span>Заказы магазинов</span><b>${requests.length}</b></button><button data-ex-tab="create"><span>Создать объявление</span><b>＋</b></button></div>
<div data-ex-page="offers"><div class="mn-page-intro"><span><strong>Предложения заводов</strong><small>После оплаты создаётся поставка. Товар не телепортируется на склад.</small></span></div><div class="mn-deal-list">${offers.length?offers.map(o=>dealCard(o,'offer',{factories,stores})).join(''):emptyState('📦','Пока нет готовых партий','Заводы ещё не выставили продукцию на продажу.')}</div></div>
<div data-ex-page="deliveries" hidden><div class="mn-page-intro"><span><strong>Ожидают доставки</strong><small>Выполните этап логистики — только после него партия будет зачислена на склад получателя.</small></span></div><div class="mn-delivery-list">${deliveries.length?deliveries.map(deliveryCard).join(''):emptyState('🚚','Активных поставок нет','Оплаченные на бирже партии появятся здесь до фактической доставки.')}</div></div>
<div data-ex-page="requests" hidden><div class="mn-page-intro is-demand"><span><strong>Заказы от магазинов</strong><small>Это заявки на поставку. Выберите свой завод и примите подходящий заказ.</small></span></div><div class="mn-deal-list">${requests.length?requests.map(r=>dealCard(r,'request',{factories,stores})).join(''):emptyState('🧾','Новых заказов пока нет','Когда магазин закажет поставку, его заявка появится здесь.')}</div></div>
<div data-ex-page="create" hidden><div class="mn-create-grid">${createCard('factory',factories)}${createCard('store',requestStores)}</div></div>${destinationPickerMarkup()}`;}

export function enableProductionMarketFeature({root}){root.insertAdjacentHTML('beforeend',shell());const modal=root.querySelector('[data-production-market]'),content=modal.querySelector('[data-market-content]'),exchangeButton=root.querySelector('[data-exchange-open]');let mode='',busy=false,marketAccess=false,exchangeCache=null,currentExchangeData=null;
const applyMarketAccess=(data)=>{marketAccess=Boolean(data?.factories?.length||data?.stores?.length);exchangeButton.hidden=!marketAccess;return marketAccess;};
const primeMarketAccess=async()=>{try{exchangeCache=await loadUniversalExchange();applyMarketAccess(exchangeCache);}catch(error){marketAccess=false;exchangeButton.hidden=true;console.warn('[market] access check failed:',error);}};
void primeMarketAccess();
const open=async(next)=>{if(busy)return;if(next==='exchange'&&!marketAccess){try{exchangeCache=await loadUniversalExchange();applyMarketAccess(exchangeCache);}catch(error){console.warn('[market] access retry failed:',error);}if(!marketAccess){toast('Биржа доступна владельцам и управляющим предприятий.','error');return;}}busy=true;mode=next;modal.hidden=false;content.innerHTML='<div class="mn-market-loading">Загружаем предложения…</div>';try{const data=next==='raw'?await loadUniversalRaw():await loadUniversalExchange();if(next==='exchange'){exchangeCache=null;currentExchangeData=data;applyMarketAccess(data);}content.innerHTML=next==='raw'?rawMarkup(data):exchangeMarkup(data);modal.querySelector('[data-market-title]').textContent=next==='raw'?'Продать сырьё':'Биржа готовой продукции';modal.querySelector('[data-market-eyebrow]').textContent=next==='raw'?'КЛАВИША O':'КЛАВИША M';}catch(e){content.innerHTML=`<div class="mn-market-error">${esc(next==='raw'?getProcurementError(e):getFactoryError(e))}</div>`;}finally{busy=false;}};
const close=()=>{modal.hidden=true;};root.querySelector('[data-raw-market-open]').onclick=()=>open('raw');exchangeButton.onclick=()=>open('exchange');modal.querySelectorAll('[data-market-close]').forEach(b=>b.onclick=close);
const key=e=>{if(e.key==='Escape'&&!modal.hidden){const picker=content.querySelector('[data-destination-picker]');if(picker&&!picker.hidden)picker.hidden=true;else close();return;}if(e.repeat||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||''))return;if(e.code==='KeyO'){e.preventDefault();void open('raw');}if(e.code==='KeyM'&&marketAccess){e.preventDefault();void open('exchange');}};window.addEventListener('keydown',key,true);
content.addEventListener('change',e=>{if(e.target.matches('[data-raw-item]')){const articles=[...content.querySelectorAll('[data-raw-offers] article')],selected=e.target.value;articles.forEach(a=>a.hidden=a.dataset.item!==selected);const empty=content.querySelector('[data-raw-empty]');if(empty)empty.hidden=articles.some(a=>a.dataset.item===selected);}if(e.target.matches('[data-create-factory]'))content.querySelector('[data-create-factory-product]').innerHTML=productOptions(e.target.selectedOptions[0]?.dataset.chain||'fruit');if(e.target.matches('[data-create-store]')){const option=e.target.selectedOptions[0];content.querySelector('[data-create-store-product]').innerHTML=storeProductOptions(option?.dataset.businessType||'',option?.dataset.chain||'fruit');}});
const applyRawFilters=()=>{const chain=content.querySelector('[data-raw-chain].is-active')?.dataset.rawChain||'all',group=content.querySelector('[data-raw-group].is-active')?.dataset.rawGroup||'all',select=content.querySelector('[data-raw-item]');if(!select)return;const entries=Object.entries(RAW_ITEMS).filter(([,item])=>(chain==='all'||item.chainId===chain)&&(group==='all'||item.groupId===group));select.innerHTML=entries.map(([id,item])=>`<option value="${id}">${item.icon} ${item.label}</option>`).join('');select.disabled=!entries.length;if(entries.length){select.dispatchEvent(new Event('change',{bubbles:true}));}else{content.querySelectorAll('[data-raw-offers] article').forEach(article=>article.hidden=true);const empty=content.querySelector('[data-raw-empty]');if(empty)empty.hidden=false;}};
content.addEventListener('click',e=>{const chainButton=e.target.closest('[data-raw-chain]'),groupButton=e.target.closest('[data-raw-group]');if(!chainButton&&!groupButton)return;e.stopImmediatePropagation();if(chainButton){content.querySelectorAll('[data-raw-chain]').forEach(button=>button.classList.toggle('is-active',button===chainButton));const chain=chainButton.dataset.rawChain;content.querySelectorAll('[data-parent-chain]').forEach(button=>button.hidden=chain!=='all'&&button.dataset.parentChain!==chain);const activeGroup=content.querySelector('[data-raw-group].is-active');if(activeGroup?.hidden){content.querySelectorAll('[data-raw-group]').forEach(button=>button.classList.toggle('is-active',button.dataset.rawGroup==='all'));}}if(groupButton){content.querySelectorAll('[data-raw-group]').forEach(button=>button.classList.toggle('is-active',button===groupButton));const parent=groupButton.dataset.parentChain;if(parent){content.querySelectorAll('[data-raw-chain]').forEach(button=>button.classList.toggle('is-active',button.dataset.rawChain===parent));content.querySelectorAll('[data-parent-chain]').forEach(button=>button.hidden=button.dataset.parentChain!==parent);}}applyRawFilters();});
content.addEventListener('click',async e=>{const t=e.target;if(busy)return;const rawFilter=t.closest('[data-raw-chain]');if(rawFilter){content.querySelectorAll('[data-raw-chain]').forEach(b=>b.classList.toggle('is-active',b===rawFilter));const allowed=Object.entries(RAW_ITEMS).filter(([,item])=>rawFilter.dataset.rawChain==='all'||item.chainId===rawFilter.dataset.rawChain).map(([id])=>id),select=content.querySelector('[data-raw-item]');[...select.options].forEach(option=>option.hidden=!allowed.includes(option.value));const first=[...select.options].find(option=>!option.hidden);if(first){select.value=first.value;select.dispatchEvent(new Event('change',{bubbles:true}));}return;}const tab=t.closest('[data-ex-tab]');if(tab){content.querySelectorAll('[data-ex-tab]').forEach(b=>b.classList.toggle('is-active',b===tab));content.querySelectorAll('[data-ex-page]').forEach(p=>p.hidden=p.dataset.exPage!==tab.dataset.exTab);return;}const filter=t.closest('[data-chain-filter]');if(filter){content.querySelectorAll('[data-chain-filter]').forEach(b=>b.classList.toggle('is-active',b===filter));content.querySelectorAll('.mn-market-list article[data-chain],.mn-deal-list article[data-chain],.mn-delivery-list article[data-chain]').forEach(a=>a.hidden=filter.dataset.chainFilter!=='all'&&a.dataset.chain!==filter.dataset.chainFilter);return;}let task=null,msg='',errorMessage=getFactoryError,refreshMineInventory=false;const sell=t.closest('[data-raw-sell]');if(sell){
  const quantity=Number(content.querySelector('[data-raw-qty]').value);
  if(sell.dataset.provider==='procurement'){
    task=()=>sellToProcurementBuyer({buyerKind:'factory',buyerId:sell.dataset.rawSell,cityId:sell.dataset.city,buyerType:sell.dataset.chain,itemType:sell.dataset.item,quantity});
    errorMessage=getProcurementError;
    refreshMineInventory=sell.dataset.chain==='metallurgy';
  }else if(sell.dataset.provider==='metallurgy'){
    task=()=>sellMineRawToMetallurgy(sell.dataset.rawSell,sell.dataset.city,sell.dataset.item,quantity);
    errorMessage=getMetallurgyError;
    refreshMineInventory=true;
  }else if(sell.dataset.provider==='wood_processing'){
    task=()=>sellLumberToWoodProcessing(sell.dataset.rawSell,sell.dataset.city,sell.dataset.item,quantity);
    errorMessage=getWoodProcessingError;
  }else if(sell.dataset.provider==='industry'||sell.dataset.provider==='textile'){
    task=()=>sellFarmRawToTextile(sell.dataset.rawSell,sell.dataset.city,sell.dataset.item,quantity);
    errorMessage=getTextileError;
  }else{
    task=()=>sellToFactory(sell.dataset.rawSell,sell.dataset.city,sell.dataset.item,quantity);
  }

  msg='Сырьё продано производству.';
}const openDestination=t.closest('[data-offer-destination-open]');if(openDestination){const chain=openDestination.dataset.chain||'fruit',offer=(currentExchangeData?.offers||[]).find(item=>String(item.id)===String(openDestination.dataset.offerDestinationOpen)),destinations=compatibleDestinations({factories:currentExchangeData?.factories||[],stores:currentExchangeData?.stores||[]},chain,offer?.productType),picker=content.querySelector('[data-destination-picker]');if(!destinations.length||!picker){toast('У вас нет подходящего предприятия для этой продукции.','error');return;}const product=productionProduct(chain,offer?.productType);picker.dataset.offerId=openDestination.dataset.offerDestinationOpen;picker.dataset.chain=chain;picker.querySelector('[data-destination-picker-product]').innerHTML=`<i>${product?.icon||'📦'}</i><span><small>ПАРТИЯ С БИРЖИ</small><strong>${esc(product?.label||offer?.productType||'Готовая продукция')}</strong><em>${quantity(offer?.quantity)} ед. · ${dealTotal(offer)}</em></span>`;picker.querySelector('[data-destination-picker-list]').innerHTML=destinationPickerRows(destinations);picker.hidden=false;return;}if(t.closest('[data-destination-picker-cancel]')){const picker=content.querySelector('[data-destination-picker]');if(picker)picker.hidden=true;return;}const confirmDestination=t.closest('[data-destination-picker-confirm]');if(confirmDestination){const picker=content.querySelector('[data-destination-picker]'),selected=picker?.querySelector('input[name="mn-destination-store"]:checked'),offerId=picker?.dataset.offerId;if(!selected||!offerId)return;picker.hidden=true;task=()=>buyProductionOffer({offerId,targetKind:selected.dataset.kind,targetId:selected.value,targetCityId:selected.dataset.city,targetType:selected.dataset.type});errorMessage=getProductionExchangeError;msg='Партия оплачена. Доставка создана — товар ещё не поступил на склад.';}const deliveryButton=t.closest('[data-delivery-complete]');if(deliveryButton){const delivery=(currentExchangeData?.deliveries||[]).find(item=>String(item.id)===String(deliveryButton.dataset.deliveryComplete));if(!delivery)return;const game=await playCargoTransferMiniGame({direction:'factory_to_store',productType:delivery.productType,quantity:delivery.quantity});if(!game.success)return;task=()=>completeProductionDelivery(delivery.id);errorMessage=getProductionExchangeError;msg='Доставка завершена. Товар принят на склад предприятия.';}const accept=t.closest('[data-request-accept]');if(accept){const chain=accept.dataset.chain||'fruit',select=content.querySelector(`[data-request-factory="${accept.dataset.requestAccept}"]`),opt=select.selectedOptions[0];if(!opt||!window.confirm(`Принять заказ и создать доставку от:\n${opt.textContent.trim()}?`))return;task=()=>takeExchangeRequest(chain,accept.dataset.requestAccept,select.value,opt.dataset.city);errorMessage=getProductionExchangeError;msg='Заказ принят. Товар зарезервирован, поставка ожидает доставки.';}if(t.closest('[data-create-factory-offer]')){const s=content.querySelector('[data-create-factory]'),opt=s.selectedOptions[0],chain=opt.dataset.chain||'fruit',payload={factoryId:s.value,cityId:opt.dataset.city,productType:content.querySelector('[data-create-factory-product]').value,quantity:Number(content.querySelector('[data-create-factory-qty]').value),unitPrice:Number(content.querySelector('[data-create-factory-price]').value)};task=()=>publishFactoryOffer(chain,payload);errorMessage=getProductionExchangeError;msg='Предложение опубликовано.';}if(t.closest('[data-create-store-request]')){const s=content.querySelector('[data-create-store]'),opt=s.selectedOptions[0],chain=opt.dataset.chain||'fruit',payload={businessId:s.value,cityId:opt.dataset.city,productType:content.querySelector('[data-create-store-product]').value,quantity:Number(content.querySelector('[data-create-store-qty]').value),unitPrice:Number(content.querySelector('[data-create-store-price]').value)};if(!opt||!window.confirm(`Создать заказ для:\n${opt.textContent.trim()}?`))return;task=()=>publishStoreRequest(chain,payload);errorMessage=chain==='textile'?getTextileError:getFactoryError;msg='Заявка выбранного магазина опубликована.';}if(!task)return;busy=true;try{const result=await task(),balance=Number(result?.playerBalance);if(Number.isFinite(balance)){state.player={...(state.player||{}),balance};save();window.dispatchEvent(new CustomEvent('mn:player-balance-changed',{detail:{balance,source:'production_market'}}));}if(refreshMineInventory)window.dispatchEvent(new CustomEvent('mn:mine-inventory-changed'));if(sell?.dataset.chain==='wood_processing')window.dispatchEvent(new CustomEvent('mn:lumber-inventory-changed'));if(['fruit','textile'].includes(sell?.dataset.chain)){window.dispatchEvent(new CustomEvent('mn:farm-inventory-changed'));window.dispatchEvent(new CustomEvent('mn:player-inventory-changed'));}if(deliveryButton){window.dispatchEvent(new CustomEvent('mn:business-stock-changed'));window.dispatchEvent(new CustomEvent('mn:tool-assembly-stock-changed'));}toast(msg,'success');busy=false;await open(mode);}catch(err){toast(errorMessage(err),'error');}finally{busy=false;}});
return()=>{window.removeEventListener('keydown',key,true);modal.remove();root.querySelector('.mn-production-shortcuts')?.remove();};}
