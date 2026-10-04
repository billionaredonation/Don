import './oilIndustry.css';
import { renderStatePurchaseBenefit } from '../community/statePurchaseBenefit.js';
import '../community/statePurchaseBenefit.css';
import { renderBusinessStateSaleControl } from '../businessStateSale/businessStateSaleControl.js';
import {vehicleRequest} from '../vehicles/vehicleIndustryApi.js';
import { oilRequest, oilError } from './oilIndustryApi.js';
import { playCargoTransferMiniGame } from '../logistics/cargoTransferMiniGame.js';
export const OIL_TYPES = { oil_well: ['🛢️', 'Нефтескважина', 'Буровая установка и резервуар'], oil_refinery: ['🏭', 'Нефтеперерабатывающий завод', 'Линия перегонки и резервуары'], fuel_station: ['⛽', 'АЗС', 'Топливные колонки и резервуары'] };
const names = { crude: 'Нефть', petrol: 'Бензин А-95', petrol92: 'Бензин А-92', diesel: 'Дизель' };
const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const num = v => Number(v || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const money = v => `${num(v)} ₴`;
export function enableOilIndustryFeature({ root, cityId }) {
  const dialog = document.createElement('dialog'); dialog.className = 'mn-oil-dialog'; root.append(dialog);
  let carriers=[], id='', s=null, tab='overview', busy=false, timer=0, generation=0, destroyed=false, notice='', retry=null;
  const input = key => dialog.querySelector(`[data-input="${CSS.escape(key)}"]`);
  const field = (key, value, min=1, max=1000000000, step=1) => `<input data-input="${esc(key)}" aria-label="${esc(key)}" type="number" min="${min}" max="${max}" step="${step}" value="${value}">`;
  const actionButton = (action, label, disabled=false, data='') => `<button type="button" data-action="${action}" ${data} ${disabled||busy?'disabled':''}>${label}</button>`;
  const products = () => s.kind==='oil_well'?['crude']:s.kind==='fuel_station'?['petrol','petrol92','diesel']:Object.keys(names);
  const saleProducts = () => s.kind==='oil_well'?['crude']:['petrol','petrol92','diesel'];
  const equipmentShortfall = () => Math.max(0, Math.round((Number(s.equipmentPrice)-Number(s.cash))*100)/100);
  function setupHelp() {
    if(!s.isOwner)return '';
    const steps = s.kind==='oil_well'
      ? 'Купите оборудование → запустите добычу → откройте продажи в «Управлении». НПЗ сможет закупать накопленную нефть.'
      : s.kind==='oil_refinery'
      ? 'Купите оборудование → закупите нефть у работающей скважины → примите партию в «Доставках» → переработайте 20 л → откройте продажи для АЗС.'
      : 'Купите оборудование → закупите топливо у НПЗ → примите партию в «Доставках» → откройте продажи игрокам.';
    return `<article><h3>Как запустить цепочку</h3><p>${steps}</p><p>Поставщик и перевозчик выбираются при закупке; доступны разные города. Закупки и оборудование оплачиваются со счёта покупающего предприятия.</p>${!s.equipment?`<p><b>Запуск недоступен: оборудование ещё не куплено.</b></p><button type="button" data-tab="management">Перейти к оборудованию</button>`:''}${s.kind==='oil_refinery'&&s.equipment&&Number(s.crude)<20?'<p>Для запуска партии нужно минимум 20 л нефти на складе. Оплаченную закупку сначала нужно доставить.</p>':''}</article>`;
  }
  function overview() {
    const total=Number(s.crude)+Number(s.petrol)+Number(s.petrol92||0)+Number(s.diesel);
    return `${setupHelp()}<p>ID для подключения коммунальных услуг: <code>${esc(s.id)}</code></p><div class="mn-oil-grid"><article><small>Владелец</small><strong>${esc(s.ownerName||'Государство')}</strong></article><article><small>Заполнено / ёмкость</small><strong>${num(total)} / ${num(s.capacity)} л</strong></article><article><small>В пути на склад</small><strong>${num(s.reservedIncoming)} л</strong></article></div>
    <div class="mn-oil-grid">${products().map(p=>`<article><small>${names[p]}</small><strong>${num(s[p])} л</strong></article>`).join('')}</div>
    ${!s.ownerId?`<p>Покупка предприятия: <b data-oil-state-price>${money(s.purchasePrice)}</b>. Оборудование приобретается отдельно за ${money(s.equipmentPrice)} со счёта предприятия.</p>${actionButton('purchase','Купить предприятие')}`:''}
    ${s.kind==='oil_well'?`<p>Добыча: 1 л за 2 секунды (1 800 л/час). ${s.maintenanceRequired?'🛠 Требуется обслуживание':s.running?(Number(s.crude)>=Number(s.capacity)?'Резервуар заполнен, добыча приостановлена.':'🟢 Добыча работает.'):'⏸ Добыча остановлена.'}</p>${s.isOwner?actionButton('start','Запустить добычу',s.running||!s.equipment||s.maintenanceRequired)+actionButton('stop','Остановить',!s.running):''}`:''}
    ${s.kind==='oil_refinery'?`<p>Партия: <b>20 л нефти → 18 л выбранного топлива</b>. Технологические потери: 2 л. Перегонка занимает 60 секунд.</p><p>${s.batchReadyAt?`⏳ Партия готовится: осталось ${Math.max(0,Math.ceil((Date.parse(s.batchReadyAt)-Date.now())/1000))} сек. · ${num(s.batchPetrol)} л А-95 · ${num(s.batchPetrol92)} л А-92 · ${num(s.batchDiesel)} л дизеля`:'Линия свободна.'}</p>${s.isOwner?['petrol','petrol92','diesel'].map(p=>actionButton('refine',`20 л нефти → 18 л ${names[p]}`,!s.equipment||s.maintenanceRequired||!!s.batchReadyAt||Number(s.crude)<20,`data-product="${p}"`)).join(''):''}`:''}
    ${s.kind==='fuel_station'?`<button type="button" data-canister-shop>Канистры и товары АЗС</button><p>${s.selling&&s.equipment&&!s.maintenanceRequired?'🟢 АЗС открыта':'⛔ АЗС закрыта или требует обслуживания'}</p><p>Ваш запас: А-95 — ${num(s.playerFuel.petrol)} л, А-92 — ${num(s.playerFuel.petrol92)} л, дизель — ${num(s.playerFuel.diesel)} л. Общая ёмкость — 200 л. Это прежний личный запас топлива. Для перевозки топлива в канистре откройте товары АЗС.</p>${['petrol','petrol92','diesel'].map(p=>`<article class="mn-oil-row"><b>${names[p]} · ${money(s[p+'Price'])}/л</b>${field('retail-'+p,10,1,Math.max(1,Math.min(200,Math.floor((86400-Number(s.workSeconds))/60))))}${actionButton('retail_buy','Купить топливо',!s.selling||!s.equipment||s.maintenanceRequired,`data-product="${p}"`)}</article>`).join('')}`:''}`;
  }
  function management() {
    return `<div class="mn-oil-grid"><article><small>Счёт предприятия</small><strong>${money(s.cash)}</strong></article><article><small>Выручка</small><strong>${money(s.revenue)}</strong></article><article><small>Оплачено обслуживание</small><strong>${money(s.maintenancePaid)}</strong></article></div>
    <p>Пополнение — с личного баланса. Выручка остаётся на предприятии до ручного снятия.</p><div class="mn-oil-row">${field('amount',10000,1,1000000000,.01)}${actionButton('deposit','Пополнить')}${actionButton('withdraw','Снять прибыль')}</div>
    <h3>${OIL_TYPES[s.kind][2]}</h3>${!s.equipment?`<p>Оплата со счёта предприятия, отдельно от личного баланса.</p>${equipmentShortfall()>0?`<p role="status">Для покупки не хватает <b>${money(equipmentShortfall())}</b>. Подставьте эту сумму и нажмите «Пополнить».</p><button type="button" data-fill-equipment ${busy?'disabled':''}>Подставить недостающие ${money(equipmentShortfall())}</button>`:'<p>Средств достаточно — можно купить оборудование.</p>'}`:''}<p>${s.equipment?'✓ Оборудование установлено':`Стоимость: ${money(s.equipmentPrice)}`}</p>${!s.equipment?actionButton('equipment','Купить оборудование',Number(s.cash)<Number(s.equipmentPrice)):''}
    <p>${s.kind==='fuel_station'?`Ресурс колонок: продано ${num(Number(s.workSeconds)/60)} / 1 440 л.`:`Наработка: ${num(Number(s.workSeconds)/3600)} / 24 часа.`} Обслуживание: ${money(s.maintenancePrice)}. Только вручную со счёта предприятия.</p>
    ${s.maintenanceRequired?actionButton('maintenance','Оплатить обслуживание',Number(s.cash)<Number(s.maintenancePrice)):'<p>Обслуживание пока не требуется.</p>'}
    <h3>Продажи ${s.kind==='fuel_station'?'игрокам':'предприятиям'}</h3><p>Выбирайте поставщика и транспортную компанию из доступных городов. Деньги за товар поступают при закупке; доставка завершается вручную.</p>
    ${saleProducts().map(p=>`<label>${names[p]} · ₴/л ${field('price-'+p,s[p+'Price'],.01,1000000,.01)}</label>`).join('')}
    ${actionButton('set_prices','Сохранить цены')}${actionButton('selling',s.selling?'Закрыть продажи':'Открыть продажи',!s.equipment)}
    <p>Для запуска или покупки оборудования сначала пополните счёт. Личные деньги списываются только при подтверждённом пополнении; обслуживание оплачивается со счёта предприятия вручную.</p>`;
  }
  function supply() {
    return `<label>Транспортная компания <select data-input="carrier"><option value="">Выберите перевозчика</option>${carriers.map(h=>`<option value="${esc(h.id)}">${esc(h.name||h.id)} · ${esc(h.city)}</option>`).join('')}</select></label><label>Оплата водителю ${field('freight',250,10,1000000,.01)}</label><h3>Закупка ${s.kind==='oil_refinery'?'нефти':'топлива'}</h3><p>Нефть для НПЗ закупается от 20 л. Цена фиксируется при покупке. Место на складе резервируется до доставки. Партия доступна к перевозке через 60 секунд.</p>${s.offers.length?s.offers.map(o=>`<article><h4>${esc(o.name)} · ${esc(o.ownerName)} · ${esc(o.cityId)}</h4>${(s.kind==='oil_refinery'?['crude']:['petrol','petrol92','diesel']).map(p=>`<div class="mn-oil-row"><span>${names[p]}: ${num(o[p])} л · ${money(o[p+'Price'])}/л</span>${field('buy-'+o.id+'-'+p,Math.min(100,Math.max(p==='crude'?20:1,Math.floor(o[p]))),p==='crude'?20:1,10000)}${actionButton('buy_supply','Закупить',!s.equipment||Number(o[p])<(p==='crude'?20:1),`data-seller-city="${esc(o.cityId)}" data-seller="${esc(o.id)}" data-product="${p}" data-price="${o[p+'Price']}"`)}</div>`).join('')}</article>`).join(''):'<p>Нет открытых поставщиков. Купите и оборудуйте предыдущее звено цепочки, затем включите в нём продажи.</p>'}`;
  }
  function deliveries() {
    return `<h3>Партии в пути и последние доставки</h3><p>Для оплаченной партии выберите транспортную компанию и оплату водителю.</p><button type="button" data-auto-routes>Выбрать перевозчика</button>${s.shipments.length?s.shipments.map(d=>`<article class="mn-oil-row"><span><b>${names[d.product]} · ${num(d.quantity)} л</b><small>От ${esc(d.seller_id)} · оплачено ${money(d.total)}</small><small>${d.status==='delivered'?'✓ Принято на склад':Date.parse(d.ready_at)>Date.now()?`⏳ Подготовка партии: ${Math.max(0,Math.ceil((Date.parse(d.ready_at)-Date.now())/1000))} сек.`:'Готово к ручной доставке'}</small></span>${''}</article>`).join(''):'<p>Закупленных партий пока нет.</p>'}`;
  }
  function render() {
    if(!s||destroyed)return;
    const drafts=new Map([...dialog.querySelectorAll('[data-input]')].map(el=>[el.dataset.input,el.value]));
    const focused=document.activeElement?.dataset?.input;
    dialog.innerHTML=`<header><div><small>НЕФТЯНАЯ ПРОМЫШЛЕННОСТЬ</small><h2>${OIL_TYPES[s.kind][0]} ${OIL_TYPES[s.kind][1]}</h2></div><button type="button" data-close aria-label="Закрыть">×</button></header>
    <nav>${[['overview','Обзор / покупка'],...(s.isOwner?[['management','Управление'],...(s.kind!=='oil_well'?[['supply','Закупки'],['deliveries','Доставки']]:[])]:[])].map(([key,label])=>`<button type="button" data-tab="${key}" class="${tab===key?'active':''}">${label}</button>`).join('')}<button data-refresh type="button">Обновить</button></nav>
    <p role="status" class="mn-oil-notice">${esc(busy?'Выполняется действие…':notice)}</p><main>${tab==='management'?management():tab==='supply'?supply():tab==='deliveries'?deliveries():overview()}</main>`;
    renderBusinessStateSaleControl(dialog, { businessId: id, isOwner: Boolean(s?.isOwner) });
    if(!s?.ownerId)void renderStatePurchaseBenefit(dialog,{basePrice:Number(s?.purchasePrice||0),priceSelector:'[data-oil-state-price]'});
    for(const el of dialog.querySelectorAll('[data-input]'))if(drafts.has(el.dataset.input))el.value=drafts.get(el.dataset.input);
    if(focused)[...dialog.querySelectorAll('[data-input]')].find(el=>el.dataset.input===focused)?.focus({preventScroll:true});
  }
  async function refresh() {
    const g=generation, key=id, result=await oilRequest(key,cityId);
    if(result.isOwner&&result.kind!=='oil_well'){const fleet=await vehicleRequest(cityId);carriers=fleet.hubs||[];}
    if(g!==generation||destroyed)return;
    s=result; if(!s.isOwner)tab='overview';render();
  }
  async function act(action,data) {
    if(busy)return;
    const key=id,g=generation,signature=JSON.stringify([key,action,data]);
    const requestId=retry?.signature===signature?retry.requestId:crypto.randomUUID();
    retry={signature,requestId};busy=true;render();
    try {
      const result=await oilRequest(key,cityId,action,data,requestId);
      retry=null;
      window.dispatchEvent(new CustomEvent('mn:player-balance-refresh'));
      if(g!==generation||destroyed)return;
      s=result;notice=action==='buy_supply'?'✓ Закупка оплачена. Создан рейс выбранной транспортной компании.':action==='deliver'?'✓ Товар принят на склад.':action==='refine'?'✓ Перегонка запущена.':'✓ Действие выполнено.';
    } catch(e) { if(g===generation)notice=oilError(e); }
    finally {busy=false;if(g===generation)render();}
  }
  const close=()=>{if(busy)return;dialog.close();clearInterval(timer);generation++;};
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('keydown',e=>e.stopPropagation());
  dialog.addEventListener('keyup',e=>e.stopPropagation());
  dialog.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b||busy)return;
    if(b.hasAttribute('data-canister-shop')){const stationId=id;close();window.dispatchEvent(new CustomEvent('mn:auto-station-open',{detail:{id:stationId}}));return;}
    if(b.hasAttribute('data-auto-routes')){close();window.dispatchEvent(new CustomEvent('mn:auto-routes-open'));return;}
    if(b.hasAttribute('data-close')){close();return;}
    if(b.dataset.tab){tab=b.dataset.tab;notice='';dialog.querySelector('main').innerHTML='';render();return;}
    if(b.hasAttribute('data-fill-equipment')){const el=input('amount');el.value=equipmentShortfall().toFixed(2);el.focus();el.scrollIntoView?.({block:'center'});return;}
    if(b.hasAttribute('data-refresh')){await refresh().catch(err=>{notice=oilError(err);render();});return;}
    const a=b.dataset.action;if(!a)return;let data={};
    if(a==='deposit'||a==='withdraw')data={amount:Number(input('amount').value)};
    if(a==='set_prices')data=Object.fromEntries(saleProducts().map(p=>[p,Number(input('price-'+p).value)]));
    if(a==='refine')data={product:b.dataset.product};
    if(a==='selling')data={enabled:!s.selling};
    if(a==='retail_buy')data={product:b.dataset.product,quantity:Number(input('retail-'+b.dataset.product).value),unitPrice:Number(s[b.dataset.product+'Price'])};
    if(a==='buy_supply')data={hub:input('carrier').value,reward:Number(input('freight').value),sellerCity:b.dataset.sellerCity,sellerId:b.dataset.seller,product:b.dataset.product,quantity:Number(input('buy-'+b.dataset.seller+'-'+b.dataset.product).value),unitPrice:Number(b.dataset.price)};
    if(a==='deliver'){
      const d=s.shipments.find(x=>x.id===b.dataset.shipment);if(!d)return;
      busy=true;render();const g=generation;let game;
      // Native modal dialogs sit above body overlays and make them inert.
      // Release the modal top layer while the cargo game owns interaction.
      dialog.close();
      try {
        game=await playCargoTransferMiniGame({direction:'factory_to_store',productType:'oil_'+d.product,quantity:d.quantity});
        if(!game?.success)notice='Доставка отменена. Оплаченная партия остаётся в «Доставках».';
      } catch(err) { notice=oilError(err); }
      finally {
        busy=false;
        if(g===generation&&!destroyed){render();if(!dialog.open)dialog.showModal();}
      }
      if(!game?.success||g!==generation||destroyed)return;data={shipmentId:d.id};
    }
    await act(a,data);
  });
  const onOpen=async e=>{
    const o=e.detail?.object,type=o?.type==='marker'?(o.payload?.jobType||o.payload?.type):o?.type;
    if(!OIL_TYPES[type]||busy)return;
    generation++;const openGeneration=generation;id=String(o.id);s=null;tab='overview';notice='';retry=null;dialog.innerHTML='<p>Загрузка предприятия…</p>';
    if(!dialog.open)dialog.showModal();clearInterval(timer);
    try {await refresh();if(openGeneration!==generation||destroyed)return;timer=setInterval(()=>{if(dialog.open&&!busy)refresh().catch(()=>{});},5000);}
    catch(err){if(openGeneration!==generation||destroyed)return;dialog.innerHTML=`<p>${esc(oilError(err))}</p><button data-close>Закрыть</button>`;}
  };
  window.addEventListener('mn:oil-industry-object-action',onOpen);
  return ()=>{destroyed=true;generation++;clearInterval(timer);window.removeEventListener('mn:oil-industry-object-action',onOpen);dialog.remove();};
}
