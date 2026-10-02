import {registerCanisterInventory,publishCanisters,planCanisterPour} from './canisterInventory.js';
import './vehicleIndustry.css';
import {state,save} from '../state.js';
import {vehicleRequest,vehicleError} from './vehicleIndustryApi.js';
import {playCargoTransferMiniGame} from '../logistics/cargoTransferMiniGame.js';
import {getMapObjects} from '../mapObjects/mapObjectsRepository.js';
import { loadBusinessUtilityStatus, renderBusinessUtilityGate } from '../utilities/businessUtilityGate.js';
export const AUTO_TYPES=['car_factory','car_dealer','auto_service'];
const labels={car_factory:'Автомобильный завод',car_dealer:'Автосалон',auto_service:'СТО',light:'Легковые',medium:'Средние',heavy:'Тягачи',petrol:'А-95',petrol92:'А-92',diesel:'Дизель',car_frame:'Каркас автомобиля',car_engine:'Двигатель автомобиля',car_body:'Кузов автомобиля',support_beam:'Опорная балка',screws:'Шурупы',rivets:'Заклёпки'};
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const carSvg=color=>`<svg viewBox="0 0 32 52" width="30" height="48"><rect x="2" y="9" width="28" height="9" rx="2" fill="#111"/><rect x="2" y="35" width="28" height="9" rx="2" fill="#111"/><rect x="5" y="2" width="22" height="48" rx="7" fill="${/^#[0-9a-f]{6}$/i.test(color)?color:'#ffffff'}" stroke="#182731"/><path d="M8 14h16v10H8zM8 35h16v8H8z" fill="#376278"/><path d="M8 6h5m6 0h5" stroke="#fff3a0" stroke-width="3"/></svg>`;
const money=v=>Number(v||0).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₴';
export function enableVehicleIndustry({root,cityId,playerPosition,playerMarker}) {
 const actor=String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id||'');
 const dialog=document.createElement('dialog');dialog.className='mn-auto-dialog';root.append(dialog);
 const launch=document.createElement('button');launch.className='mn-auto-launch';launch.textContent='🚘 Мои машины';root.append(launch);
 const hud=document.createElement('div');hud.className='mn-auto-status';root.append(hud);
 const layer=document.createElement('div');layer.className='mn-auto-map-layer';root.querySelector('.gta-map-entities')?.append(layer);
 let s=null,id='',type='',utilityStatus=null,busy=false,destroyed=false,tab='garage',notice='',objects=[],moving=false,retry=null,moveTask=null,revision=0,routeHub='';
 const btn=(a,label,data='',disabled=false)=>`<button data-action="${a}" ${data} ${busy||disabled?'disabled':''}>${label}</button>`;
 const field=(name,val=1)=>`<input data-field="${name}" type="number" value="${val}" min="1">`;
 const val=k=>dialog.querySelector(`[data-field="${k}"]`)?.value;
 const placePlayer=c=>{playerPosition.x=Number(c.x);playerPosition.y=Number(c.y);window.dispatchEvent(new CustomEvent('mn:player-teleported',{detail:{x:Number(c.x),y:Number(c.y)}}));};
 const current=()=>s?.vehicles?.find(v=>v.owner_id===actor&&v.driving);
 const model=v=>s.models.find(m=>m.id===v.model);
 const stopReason=v=>v.transit_ready?'Междугородняя поездка ещё не завершена':Number(v.fuel)<=0?'Бак пуст. Купите и наполните канистру на АЗС, затем перелейте топливо в меню машины':Number(v.condition)<=Number(model(v)?.stop_condition)?'Двигатель заглох: требуется ремонт':'';
 const hubs=()=>`<label>Перевозчик <select data-field="hub"><option value="">Выберите компанию</option>${(s.hubs||[]).map(h=>`<option value="${esc(h.id)}">${esc(h.name||h.id)} · ${esc(h.city)}</option>`).join('')}</select></label><label>Оплата водителю ${field('reward',250)}</label>`;
 function componentSupply(){
  if(!(s.offers||[]).length)return '<details class="mn-auto-components"><summary>Закупка комплектующих</summary><p>На бирже пока нет предложений комплектующих для сборки. Готовые автомобили отправляются выбранному автосалону напрямую, без перевозчика.</p></details>';
  return `<details class="mn-auto-components"><summary>Закупка комплектующих · предложений: ${s.offers.length}</summary><p>Этот раздел только для доставки деталей с металлургического завода на автозавод. Для продажи готовых автомобилей перевозчик не нужен.</p>${hubs()}${s.offers.map(o=>`<article>${esc(o.factory_id)} · ${esc(o.city_id)} · ${labels[o.product_type]||esc(o.product_type)} × ${o.quantity} · ${money(o.quantity*o.unit_price)}${btn('components_buy','Купить комплектующие с доставкой',`data-offer="${o.id}"`)}</article>`).join('')}</details>`;
 }
 function factorySupply(){
 const reserved=v=>[...(s.supplyOffers||[]),...(s.playerOffers||[])].some(o=>o.vehicle_id===v.id);
 const dealerCities=[...new Set((s.dealers||[]).map(d=>d.city))];const chosen=val('dealer-city')||dealerCities[0]||'';
 return `<h3>Склад готовых автомобилей</h3><p>Машины хранятся здесь и не появляются на карте до покупки игроком. Заправка необязательна: полный бак — 1 000 ₴ из кассы завода.</p><label>Город получателя <select data-field="dealer-city">${dealerCities.map(c=>`<option value="${esc(c)}" ${c===chosen?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label>Автосалон <select data-field="dealer"><option value="">Выберите автосалон</option>${(s.dealers||[]).filter(d=>d.city===chosen).map(d=>`<option value="${esc(d.id)}">${esc(d.name||d.id)} · ${esc(d.id)}</option>`).join('')}</select></label>${!dealerCities.length?'<p>Пока нет купленных автосалонов. Можно предложить машину игроку напрямую.</p>':''}
 ${s.vehicles.filter(v=>v.business_id===id).map(v=>`<article><h3>${esc(model(v).label)} · № ${esc(v.id.slice(0,8))}</h3><p>${labels[model(v).fuel_type]} · ${Number(v.fuel)} / ${model(v).tank} л · состояние ${Number(v.condition)} / ${model(v).max_condition}</p>${reserved(v)?'<p>Зарезервировано предложением. Для изменения условий сначала отмените его.</p>':`${btn('warehouse_refuel','Заправить полный бак — 1 000 ₴',`data-vehicle="${v.id}"`,Number(v.fuel)>=Number(model(v).tank)||Number(s.business.cash)<1000)}<label>Цена продажи ${field('sale-'+v.id,model(v).wholesale)}</label>${btn('supply_send','Предложить выбранному автосалону',`data-vehicle="${v.id}"`)}<label>ID или ник покупателя <input data-field="buyer-${v.id}" type="text" placeholder="Telegram ID или точный ник"></label>${btn('player_offer','Предложить игроку',`data-vehicle="${v.id}"`)}`}</article>`).join('')||'<p>Склад пока пуст.</p>'}
 <h3>Ожидают решения покупателя</h3>${(s.supplyOffers||[]).filter(o=>o.factory_id===id).map(o=>`<article>${esc(s.models.find(m=>m.id===o.model)?.label)} → ${esc(o.dealer?.name||o.dealer_id)} · ${esc(o.dealer?.city)} · ${money(o.price)}${btn('supply_cancel','Отменить',`data-offer="${o.id}"`)}</article>`).join('')}${(s.playerOffers||[]).filter(o=>o.factory_id===id).map(o=>`<article>${esc(s.models.find(m=>m.id===o.model)?.label)} → игрок ${esc(o.buyer_id)} · ${money(o.price)}${btn('player_cancel','Отменить',`data-offer="${o.id}"`)}</article>`).join('')}`;
 }
 function playerOffers(){return `<h3>Предложения от автозаводов</h3>${(s.playerOffers||[]).filter(o=>o.buyer_id===actor).map(o=>`<article>${esc(s.models.find(m=>m.id===o.model)?.label)} · ${money(o.price)} · топливо ${Number(o.fuel)} л<p>Завод ${esc(o.factory?.name||o.factory_id)} · ${esc(o.factory?.city)}. Для получения подойдите к заводу.</p>${btn('player_accept','Купить и получить',`data-offer="${o.id}"`)}${btn('player_decline','Отказаться',`data-offer="${o.id}"`)}</article>`).join('')||'<p>Новых предложений нет.</p>'}`;}
 function pourCanister(v){const cans=(s.canisters||[]).filter(c=>c.fuel_type===model(v).fuel_type&&Number(c.liters)>0);return `<h4>Заправить из канистры</h4>${cans.length?`<select data-field="can-${v.id}">${cans.map(c=>`<option value="${c.id}">№ ${c.id.slice(0,8)} · ${Number(c.liters)} л ${labels[c.fuel_type]}</option>`).join('')}</select>${field('pour-'+v.id,Math.min(5,Number(cans[0].liters),Math.max(0,model(v).tank-v.fuel)))}${btn('canister_pour','Перелить в бак',`data-vehicle="${v.id}"`)}`:'<p>Нет канистры с подходящим топливом. Купите и наполните её на АЗС.</p>'}`;}
 function canisterShop(){return `<h3>Канистры · 20 л</h3><p>Пустая канистра многоразовая. Топливо оплачивается отдельно по тарифу АЗС; разные марки не смешиваются.</p>${btn('canister_buy',`Купить пустую канистру — ${money(s.station?.canisterPrice)}`)}${s.station?.owner===actor?`<label>Цена пустой канистры ${field('canisterPrice',s.station.canisterPrice)}</label>${btn('canister_price','Сохранить цену канистры')}`:''}${(s.canisters||[]).map(c=>`<article>Канистра № ${c.id.slice(0,8)} · ${Number(c.liters)} / 20 л · ${labels[c.fuel_type]||'пустая'}<select data-field="grade-${c.id}">${['petrol','petrol92','diesel'].map(f=>`<option value="${f}" ${c.fuel_type===f?'selected':''}>${labels[f]} · ${money(s.station?.[f])}/л</option>`).join('')}</select>${field('fill-'+c.id,Math.max(0,20-Number(c.liters)))}${btn('canister_fill','Купить топливо в канистру',`data-canister="${c.id}"`,Number(c.liters)>=20)}</article>`).join('')}`;}
 function assemblyStatus(){
  const b=s?.business;if(!b?.batch_ready)return '<section class="mn-auto-assembly"><strong>✓ Линия свободна</strong><p>Выберите модель ниже, чтобы начать сборку.</p></section>';
  const label=s.models.find(m=>m.id===b.batch_model)?.label||b.batch_model;
  return `<section class="mn-auto-assembly is-active"><strong>⚙ Собирается: ${esc(label)}</strong><p data-assembly-time role="status"></p><progress data-assembly-progress max="60" value="0" aria-label="Прогресс сборки"></progress><p>Комплектующие уже списаны. Готовая машина поступит на склад завода для продажи автосалону.</p></section>`;
 }
 function tickAssembly(){
  const b=s?.business,clock=dialog.querySelector('[data-assembly-time]'),bar=dialog.querySelector('[data-assembly-progress]');
  if(!b?.batch_ready||!clock||!bar)return;
  const left=Math.max(0,Math.ceil((Date.parse(b.batch_ready)-Date.now())/1000));
  clock.textContent=left?`Осталось: ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`:'Время сборки истекло. Ожидаем подтверждение сервера…';
  bar.value=Math.max(0,Math.min(60,60-left));
 }
 function render(){if(!s||destroyed)return;
 const componentsOpen=dialog.querySelector('.mn-auto-components')?.open;
 const scrollTop=dialog.scrollTop,scrollLeft=dialog.scrollLeft;
 const focused=document.activeElement?.dataset?.field;
 const drafts=new Map([...dialog.querySelectorAll('[data-field]')].map(e=>[e.dataset.field,e.value]));
 const b=s.business,own=b?.owner_id===actor,car=current();let html='';
 if(tab==='garage')html=`<p>F — сесть рядом с машиной / выйти. WASD — движение. H рядом с АЗС — заправка в бак. Клавиши работают по физическому расположению.</p><p>Аварийных ремкомплектов: ${s.kits}. Каждый +50 состояния, максимум 70% полной прочности; дальше нужен ремонт на СТО.</p>`+s.vehicles.filter(v=>v.owner_id===actor).map(v=>{const m=model(v);return `<article><h3>${esc(m.label)} ${v.used?'· б/у':''} ${v.route_id?'· служебный':''}</h3><p>${esc(v.city_id)} · координаты ${Number(v.x).toFixed(1)}, ${Number(v.y).toFixed(1)} · ${Number(v.condition).toFixed(1)} / ${m.max_condition} · глохнет при ≤ ${m.stop_condition}</p><p>${labels[m.fuel_type]} · ${Number(v.fuel).toFixed(2)} / ${m.tank} л · ${m.consumption} л/100 км</p>${stopReason(v)?`<p class="mn-auto-stop">⚠ ${esc(stopReason(v))}</p>`:''}${btn(v.driving?'exit':'enter',v.driving?'Выйти':'Сесть',`data-vehicle="${v.id}"`)}${btn('repair_kit','Использовать аварийный комплект',`data-vehicle="${v.id}"`)}<p>При пустом баке можно купить подходящее топливо пешком на АЗС и перелить из личного запаса.</p>${field('reserve-'+v.id,5)}${btn('reserve_refuel','Залить из личного запаса',`data-vehicle="${v.id}"`)}${pourCanister(v)}<input data-field="color-${v.id}" type="color" value="${esc(v.color)}">${btn('paint','Покрасить',`data-vehicle="${v.id}"`)}${v.driving?`<p>Межгород: подъедьте к краю карты. Условный участок — 50 км / 60 сек.</p><select data-field="city">${s.cities.filter(c=>c!==cityId).map(c=>`<option>${esc(c)}</option>`).join('')}</select>${v.transit_ready?`<p>В пути до ${new Date(v.transit_ready).toLocaleTimeString()}</p>${btn('arrive','Прибыть',`data-vehicle="${v.id}"`,Date.parse(v.transit_ready)>Date.now())}`:btn('travel','Выехать из города',`data-vehicle="${v.id}"`)}`:''}</article>`;}).join('');
 if(tab==='garage')html+=playerOffers()+`<h3>Мои канистры</h3>${(s.canisters||[]).map(c=>`<p>№ ${c.id.slice(0,8)} · ${labels[c.fuel_type]||'пустая'} · ${Number(c.liters)} / 20 л</p>`).join('')||'<p>Канистр пока нет.</p>'}`;
 if(tab==='business'){
 html=`<div data-business-utility-anchor></div><h3>${labels[type]||'Предприятие'}</h3><p>ID для коммунальных подключений: <code>${esc(id)}</code></p>`;
 if(!b?.owner_id)html+=`<p>Стоимость: ${money(type==='car_factory'?5000000:type==='car_dealer'?2000000:1000000)}</p>${btn('purchase','Купить предприятие')}`;
 if(own){html+=`<p>Счёт: ${money(b.cash)}</p>${field('amount',10000)}${btn('deposit','Пополнить')}${btn('withdraw','Снять')}<hr>`;
 if(type==='car_factory')html+=!b.equipment?`<p>Сборочная линия: 1 000 000 ₴</p>${btn('equipment','Установить линию','',Number(b.cash)<1000000)}`:`<p>Склад: ${s.stock.map(t=>`${labels[t.item]||esc(t.item)} × ${t.quantity}`).join(', ')||'пусто'}</p>${assemblyStatus()}${factorySupply()}<h3>Выбор модели для сборки</h3>${s.models.map(m=>`<article><b>${esc(m.label)} · опт ${money(m.wholesale)}</b><p>${Object.entries(m.recipe).map(([k,q])=>`${labels[k]||esc(k)} × ${q}`).join(' + ')}</p>${btn('assemble',b.batch_ready?(b.batch_model===m.id?'Собирается сейчас':'Линия занята'):'Собрать за 60 секунд',`data-model="${m.id}"`,!!b.batch_ready)}</article>`).join('')}${componentSupply()}`;

 if(type==='car_dealer')html+=`<h3>Поставки от автозаводов</h3><p>Салон принимает любые модели. Оплата из кассы, доставка через мини-игру без машины и логистического центра. После приёмки машина поступит на склад. Отдельно выставьте её на витрину по своей цене.</p>${(s.supplyOffers||[]).filter(o=>o.dealer_id===id).map(o=>`<article>${esc(s.models.find(m=>m.id===o.model)?.label)} · ${esc(o.factory?.name||o.factory_id)} · ${esc(o.factory?.city)} · ${money(o.price)} · топливо ${Number(o.fuel||0)} л${btn('supply_accept','Оплатить и принять поставку',`data-offer="${o.id}"`,Number(b.cash)<Number(o.price))}${btn('supply_cancel','Отклонить',`data-offer="${o.id}"`)}</article>`).join('')||'<p>Пока нет предложений от заводов.</p>'}<h3>Подержанные автомобили</h3><p>Закупка у государственного поставщика: 15 000 ₴. Рекомендуемая розничная цена: 20 000 ₴; состояние 200/500, в баке 5 л.</p>${['compact','sedan'].map(m=>btn('used_stock','Закупить б/у '+s.models.find(x=>x.id===m).label,`data-model="${m}"`)).join('')}`;
 if(type==='auto_service')html+=`<h3>Закупка полных ремкомплектов за кассовые деньги</h3>${['light','medium','heavy'].map((c,i)=>`<article>${labels[c]} · ${[1500,2000,4000][i]} ₴/шт · остаток ${b.kits[c]} ${field('qty-'+c,1)}${btn('kits_stock','Закупить',`data-class="${c}"`)}</article>`).join('')}`;
 if(type==='auto_service')html+=`<h3>Тарифы</h3>${(type==='auto_service'?['light','medium','heavy']:s.models.map(m=>m.id)).map(k=>`<label>${labels[k]||s.models.find(m=>m.id===k)?.label}${field('price-'+k,b.prices[k])}${btn('prices','Сохранить',`data-key="${k}"`)}</label>`).join('')}`;
 }
 if(type==='car_dealer'&&b?.owner_id)html+=`<h3>Витрина автосалона</h3>${s.vehicles.filter(v=>v.business_id===id&&v.listing_price!=null).map(v=>`<article>${esc(model(v).label)} ${v.used?'б/у':''} · ${money(v.listing_price)}<p>Топливо: ${Number(v.fuel)} / ${model(v).tank} л · ${labels[model(v).fuel_type]} · состояние ${Number(v.condition)} / ${model(v).max_condition}</p>${btn('buy_car','Купить',`data-vehicle="${v.id}" data-price="${v.listing_price}"`)}</article>`).join('')||'<p>Владелец ещё не выставил машины на продажу.</p>'}`;

 if(type==='auto_service'&&b?.owner_id)html+=car?`<p>Полный ремонт: ${money(b.prices[model(car).class])}</p>${btn('repair','Отремонтировать полностью',`data-vehicle="${car.id}"`)}`:'<p>Подъедьте на автомобиле к СТО.</p>';
 }
 if(tab==='warehouse'&&type==='car_dealer')html=own?`<h3>Склад автосалона</h3><p>Принятые автомобили сначала находятся на складе. Укажите цену конкретной машины и выставьте её на витрину.</p>${s.vehicles.filter(v=>v.business_id===id).map(v=>`<article>${esc(model(v).label)} · № ${v.id.slice(0,8)} · ${Number(v.fuel)} / ${model(v).tank} л<p>${v.listing_price==null?'На складе · не продаётся':'На витрине · '+money(v.listing_price)}</p>${field('listing-'+v.id,v.listing_price??(v.used?20000:b.prices[v.model]))}${btn('dealer_list',v.listing_price==null?'Выставить на витрину':'Изменить цену',`data-vehicle="${v.id}"`)}${v.listing_price!=null?btn('dealer_unlist','Снять с витрины',`data-vehicle="${v.id}"`):''}</article>`).join('')||'<p>Склад пуст.</p>'}`:'<p>Склад доступен только владельцу автосалона.</p>';
 if(tab==='station')html=`<h3>АЗС · ${esc(id)}</h3><p>Заправляется только подходящее модели топливо, прямо в бак.</p>${car?`<p>${labels[model(car).fuel_type]} · ${money(s.station?.[model(car).fuel_type])}/л · свободно ${(model(car).tank-car.fuel).toFixed(2)} л</p>${field('liters',10)}${btn('refuel','Заправить по тарифу АЗС',`data-vehicle="${car.id}"`)}`:'<p>Сначала сядьте в автомобиль.</p>'}${btn('buy_kit',`Аварийный ремкомплект · ${money(s.station?.kitPrice)}`)}${s.station?.owner===actor?`${field('kitPrice',s.station.kitPrice)}${btn('kit_price','Сохранить цену ремкомплекта')}`:''}`;
 if(tab==='station')html+=canisterShop();
 if(tab==='routes')html=`<h3>Заказать транспортную компанию</h3><p>Выберите перевозчика и вознаграждение. Для нефти оплата резервируется со счёта получателя, для партий общей биржи — с личного баланса заказчика.</p>${hubs()}${[...(s.pendingOil||[]).map(d=>({...d,kind:'oil',label:d.product,qty:d.quantity})),...(s.pendingProduction||[]).map(d=>({...d,kind:'production',label:d.product_type,qty:d.quantity}))].map(d=>`<article>${esc(d.label)} × ${d.qty} ${btn('route_create','Создать рейс',`data-kind="${d.kind}" data-delivery="${d.id}"`)}</article>`).join('')}<h3>Рейсы</h3>${s.routes.filter(r=>!routeHub||r.hub_id===routeHub).map(r=>`<article><b>${esc(r.cargo)} × ${r.quantity} · ${money(r.reward)}</b><p>${esc(r.hub?.name||r.hub_id)} · ${esc(r.hub?.city)}</p><p>${esc(r.source?.name||r.source_id)} (${esc(r.source_city)}) → ${esc(r.target?.name||r.target_id)} (${esc(r.target_city)})</p><p>${({open:'Ожидает водителя',pickup:'Ехать на погрузку',unload:'Ехать на выгрузку',done:'Доставлено'})[r.status]||r.status}</p>${r.status==='open'?btn('route_accept','Взять рейс',`data-route="${r.id}"`):r.driver===actor&&['pickup','unload'].includes(r.status)?btn(r.status==='pickup'?'route_load':'route_unload',r.status==='pickup'?'Погрузить на месте':'Разгрузить на месте',`data-route="${r.id}"`):''}</article>`).join('')}`;
 dialog.innerHTML=`<header><h2>${tab==='routes'?'Логистический центр':'Автомобили'}</h2><button data-close>×</button></header><nav>${['garage',...(tab==='routes'?['routes']:[]),...(type?['business']:[]),...(type==='car_dealer'&&own?['warehouse']:[])].map(t=>`<button data-tab="${t}" aria-pressed="${tab===t}">${{garage:'Мои машины',routes:'Логистика',business:type==='car_dealer'?'Автосалон':'Предприятие',warehouse:'Склад'}[t]}</button>`).join('')}</nav><p role="status">${esc(busy?'Выполняется…':notice)}</p>${html}`;
 for(const el of dialog.querySelectorAll('[data-field]'))if(drafts.has(el.dataset.field))el.value=drafts.get(el.dataset.field);
 if(componentsOpen&&dialog.querySelector('.mn-auto-components'))dialog.querySelector('.mn-auto-components').open=true;
 tickAssembly();
 if(focused)[...dialog.querySelectorAll('[data-field]')].find(el=>el.dataset.field===focused)?.focus({preventScroll:true});
 if(tab==='business')renderBusinessUtilityGate(dialog, utilityStatus, { isOwner:own, objectId:id });
 dialog.scrollTop=scrollTop;dialog.scrollLeft=scrollLeft;
 }
 function mapRender(){if(!s)return;publishCanisters(s.canisters||[]);const car=current();const m=car&&model(car);window.__MN_VEHICLE_RUNTIME__=car?{id:car.id,canMove:!car.transit_ready&&car.condition>m.stop_condition&&car.fuel>0,speed:.15}:null;
 playerMarker?.classList.toggle('mn-auto-driving',!!car);let carView=playerMarker?.querySelector('.mn-auto-driving-view');if(car&&!carView){carView=document.createElement('span');carView.className='mn-auto-driving-view';playerMarker?.append(carView);}if(carView){if(car)carView.innerHTML=carSvg(car.color);else carView.remove();}hud.textContent=car?`${m.label} · ${Number(car.fuel).toFixed(1)} л · ${Math.floor(car.condition)}/${m.max_condition} · ${stopReason(car)||'Двигатель готов'} · F выйти · H АЗС`:'';
 layer.innerHTML=s.vehicles.filter(v=>v.owner_id&&v.city_id===cityId&&(!v.driving||v.owner_id!==actor)).map(v=>`<div class="mn-auto-car ${v.owner_id===actor?'is-owned':v.business_id?'is-stock':'is-other'}" data-car-id="${esc(v.id)}" style="left:${Number(v.x)}%;top:${Number(v.y)}%;color:${esc(v.color)}">${carSvg(v.color)}<b>${esc(model(v)?.label)}<small>${v.owner_id===actor?(v.route_id?'Ваш служебный автомобиль':'Ваш автомобиль · F'):v.business_id?'Склад предприятия · не личное авто':'Автомобиль другого игрока'}</small></b></div>`).join('');
 const r=s.routes.find(r=>r.driver===actor&&['pickup','unload'].includes(r.status));if(r){const pt=r.status==='pickup'?r.source:r.target;if(pt?.city===cityId)layer.innerHTML+=`<div class="mn-auto-marker" style="left:${Number(pt.x)}%;top:${Number(pt.y)}%">${r.status==='pickup'?'📦 Погрузка':'🏁 Выгрузка'}</div>`;else hud.textContent+=` · Цель: ${pt?.city||'другой город'}`;}
 }
 async function refresh(){const requestedRevision=revision,requestedId=id,previous=s?.business;const next=await vehicleRequest(cityId,requestedId);if(destroyed||requestedId!==id||busy||requestedRevision!==revision)return;if(previous?.id===next.business?.id&&previous?.batch_ready&&!next.business.batch_ready&&next.vehicles.some(v=>v.business_id===requestedId&&v.model===previous.batch_model)){notice=`✓ ${s.models.find(m=>m.id===previous.batch_model)?.label||previous.batch_model}: сборка завершена. Машина на складе завода.`;}s=next;utilityStatus=s?.business?.owner_id===actor&&id?await loadBusinessUtilityStatus([id]):null;mapRender();if(dialog.open)render();}
 async function act(a,data={}){
  if(busy)return;
  if(a==='enter'){
   const c=s?.vehicles.find(v=>v.id===data.vehicle);
   if(c&&c.city_id!==cityId){notice='Автомобиль находится в другом городе.';hud.textContent=notice;render();return;}
   if(c&&Math.hypot(Number(playerPosition.x)-Number(c.x),Number(playerPosition.y)-Number(c.y))>2){notice=`Подойдите пешком к машине: координаты ${Number(c.x).toFixed(1)}, ${Number(c.y).toFixed(1)}. Ваши: ${Number(playerPosition.x).toFixed(1)}, ${Number(playerPosition.y).toFixed(1)}.`;hud.textContent=notice;render();return;}
  }
  busy=true;revision++;render();
  const signature=JSON.stringify([id,a,data]);const request=retry?.signature===signature?retry.request:crypto.randomUUID();retry={signature,request};
  try{
   if(a==='exit'){
    if(window.__MN_VEHICLE_RUNTIME__)window.__MN_VEHICLE_RUNTIME__.canMove=false;
    if(moveTask)await moveTask;
    const c=current();
    if(c&&!c.transit_ready&&Math.hypot(Number(c.x)-Number(playerPosition.x),Number(c.y)-Number(playerPosition.y))>0.00001){const r=await vehicleRequest(cityId,'','move',{vehicle:c.id,x:Number(playerPosition.x),y:Number(playerPosition.y)});if(r.moved)Object.assign(c,r.moved);}
   }
   s=await vehicleRequest(cityId,id,a,data,request);retry=null;
   notice=a==='assemble'?`✓ Сборка запущена: ${s.models.find(m=>m.id===data.model)?.label||data.model}. Комплектующие списаны.`:a==='enter'?'✓ Вы за рулём. WASD — движение, F — выйти.':a==='exit'?'✓ Вы вышли из машины.':'✓ Выполнено';
   if(['enter','exit'].includes(a)){const c=s.vehicles.find(v=>v.id===data.vehicle);if(c)placePlayer(c);if(dialog.open)dialog.close();}
   window.dispatchEvent(new CustomEvent('mn:player-balance-refresh'));mapRender();
   if(a==='exit')hud.textContent=notice;
   if(a==='arrive'){const c=current();if(c){state.city=c.city_id;state.cityId=c.city_id;state.player={...state.player,city:c.city_id};save();location.reload();}}
  }catch(e){mapRender();notice=a==='enter'&&String(e?.message).includes('AUTO_NEAR')?'Подойдите пешком ближе к машине и нажмите F.':vehicleError(e);hud.textContent=notice;}
  finally{busy=false;if(!destroyed)render();}
 }

 async function open(nextId='',nextType='',nextTab='garage'){id=nextId;type=nextType;tab=nextTab;notice='';dialog.scrollTop=0;await refresh();if(!destroyed){render();if(!dialog.open)dialog.showModal();}}
 launch.onclick=()=>open().catch(e=>{hud.textContent=vehicleError(e);});
 const onOpen=e=>{const o=e.detail?.object;if(o)open(String(o.id),o.type==='marker'?o.payload?.jobType:o.type,'business').catch(e=>hud.textContent=vehicleError(e));};
 const onRoutes=e=>{routeHub=String(e.detail?.hubId||'');return open('','','routes').catch(e=>hud.textContent=vehicleError(e));};
 const onStation=e=>open(String(e.detail?.id||''),'','station').catch(e=>hud.textContent=vehicleError(e));
 window.addEventListener('mn:auto-station-open',onStation);
 window.addEventListener('mn:auto-object-action',onOpen);window.addEventListener('mn:auto-routes-open',onRoutes);
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('keydown',e=>{if(e.code==='KeyF'&&tab==='garage')key(e);e.stopPropagation();});dialog.addEventListener('keyup',e=>e.stopPropagation());
 dialog.addEventListener('change',e=>{if(e.target.dataset.field==='dealer-city'){const d=dialog.querySelector('[data-field="dealer"]');if(d)d.value='';render();}});
 dialog.onclick=async e=>{const b=e.target.closest('button');if(!b||b.disabled||busy)return;if(b.hasAttribute('data-close')){dialog.close();return;}if(b.dataset.tab){tab=b.dataset.tab;dialog.scrollTop=0;render();return;}const a=b.dataset.action;if(!a)return;let data={vehicle:b.dataset.vehicle,model:b.dataset.model};
 if(['deposit','withdraw'].includes(a))data={amount:Number(val('amount'))};if(a==='prices')data={key:b.dataset.key,price:Number(val('price-'+b.dataset.key))};if(a==='kits_stock')data={class:b.dataset.class,quantity:Number(val('qty-'+b.dataset.class))};
 if(['components_buy','car_order','route_create'].includes(a))data={...data,offer:b.dataset.offer,hub:val('hub'),reward:Number(val('reward')),kind:b.dataset.kind,delivery:b.dataset.delivery};
 if(a==='supply_send')data={vehicle:b.dataset.vehicle,dealer:val('dealer'),price:Number(val('sale-'+b.dataset.vehicle))};if(['supply_accept','supply_cancel'].includes(a))data={offer:b.dataset.offer};
 if(a==='player_offer')data={vehicle:b.dataset.vehicle,buyer:val('buyer-'+b.dataset.vehicle),price:Number(val('sale-'+b.dataset.vehicle))};
 if(['player_accept','player_decline','player_cancel'].includes(a))data={offer:b.dataset.offer,x:playerPosition.x,y:playerPosition.y};
 if(a==='dealer_list')data={vehicle:b.dataset.vehicle,price:Number(val('listing-'+b.dataset.vehicle))};
 if(a==='buy_car')data.price=Number(b.dataset.price);
 if(a==='canister_buy')data={price:Number(s.station?.canisterPrice)};
 if(a==='canister_price')data={price:Number(val('canisterPrice'))};
 if(a==='canister_fill'){const fuel=val('grade-'+b.dataset.canister);data={canister:b.dataset.canister,fuel,liters:Number(val('fill-'+b.dataset.canister)),unitPrice:Number(s.station?.[fuel])};}
 if(a==='canister_pour')data={vehicle:b.dataset.vehicle,canister:val('can-'+b.dataset.vehicle),liters:Number(val('pour-'+b.dataset.vehicle)),x:playerPosition.x,y:playerPosition.y};
 if(a==='enter')data={...data,x:playerPosition.x,y:playerPosition.y};if(a==='paint')data.color=val('color-'+data.vehicle);if(a==='reserve_refuel')data.liters=Number(val('reserve-'+data.vehicle));if(a==='refuel'){data.liters=Number(val('liters'));data.unitPrice=Number(s.station?.[model(current()).fuel_type]);}if(a==='buy_kit')data={unitPrice:Number(s.station?.kitPrice)};if(a==='kit_price')data={price:Number(val('kitPrice'))};if(a==='travel')data.city=val('city');
 if(a.startsWith('route_')&&a!=='route_create')data={route:b.dataset.route};
 if(a==='supply_accept'){const offer=(s.supplyOffers||[]).find(o=>o.id===data.offer);if(!offer)return;busy=true;dialog.close();let result;try{result=await playCargoTransferMiniGame({direction:'vehicle_to_store',productType:offer.model,quantity:1});}finally{busy=false;if(!destroyed)dialog.showModal();}if(!result?.success)return;}
 if(['route_load','route_unload'].includes(a)){const r=s.routes.find(r=>r.id===data.route);const pt=a==='route_load'?r.source:r.target;const c=current();if(!c||pt?.city!==cityId||Math.hypot(playerPosition.x-pt.x,playerPosition.y-pt.y)>2){notice='Подъедьте на служебной машине к метке.';render();return;}busy=true;dialog.close();let result;try{result=await playCargoTransferMiniGame({direction:a==='route_load'?'factory_to_vehicle':'vehicle_to_store',productType:['crude','petrol','petrol92','diesel'].includes(r.cargo)?'oil_'+r.cargo:r.cargo,quantity:r.quantity});}finally{busy=false;if(!destroyed)dialog.showModal();}if(!result?.success)return;}
 await act(a,data);};
 const honk=()=>{try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ctx=new C(),gain=ctx.createGain();gain.gain.value=.06;gain.connect(ctx.destination);for(const frequency of [370,490]){const osc=ctx.createOscillator();osc.type='square';osc.frequency.value=frequency;osc.connect(gain);osc.start();osc.stop(ctx.currentTime+.18);}setTimeout(()=>ctx.close(),250);}catch{}};
 const key=async e=>{if(e.repeat||(dialog.open&&!(e.code==='KeyF'&&tab==='garage'))||[...document.querySelectorAll('dialog[open]')].some(d=>d!==dialog)||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)||busy||!s)return;try{if(e.code==='KeyF'){e.preventDefault();const car=current()||s.vehicles.filter(v=>v.owner_id===actor&&v.city_id===cityId).sort((a,b)=>Math.hypot(a.x-playerPosition.x,a.y-playerPosition.y)-Math.hypot(b.x-playerPosition.x,b.y-playerPosition.y))[0]; if(car)await act(car.driving?'exit':'enter',{vehicle:car.id,x:playerPosition.x,y:playerPosition.y});else{notice='В этом городе нет вашей машины.';hud.textContent=notice;render();}}if(e.code==='KeyH'&&current()){e.preventDefault();honk();objects=await getMapObjects(cityId);const station=objects.filter(o=>(o.type==='fuel_station'||o.payload?.jobType==='fuel_station')&&Math.hypot(o.x-playerPosition.x,o.y-playerPosition.y)<=2).sort((a,b)=>Math.hypot(a.x-playerPosition.x,a.y-playerPosition.y)-Math.hypot(b.x-playerPosition.x,b.y-playerPosition.y))[0];if(station)await open(String(station.id),'','station');else hud.textContent='Подъедьте к выбранной АЗС.';}}catch(err){hud.textContent=vehicleError(err);}};
 window.addEventListener('keydown',key);
 const timer=setInterval(()=>{
  if(destroyed||busy||moving||!s)return;
  const c=current();if(!c||c.city_id!==cityId||c.transit_ready)return;
  if(Math.hypot(Number(c.x)-Number(playerPosition.x),Number(c.y)-Number(playerPosition.y))<0.00001)return;
  moving=true;
  moveTask=(async()=>{try{const result=await vehicleRequest(cityId,'','move',{vehicle:c.id,x:playerPosition.x,y:playerPosition.y});if(result.moved){Object.assign(c,result.moved);if(!busy)mapRender();}}catch(e){placePlayer(c);hud.textContent=vehicleError(e);}finally{moving=false;}})();
 },1500);
 const unregisterCanisters=registerCanisterInventory({
  load:async()=>{const snapshot=await vehicleRequest(cityId);return snapshot.canisters||[];},
  use:async canisterId=>{
   if(busy)throw Error('Дождитесь завершения текущего действия.');
   busy=true;revision++;
   try{
    if(moveTask)await moveTask;
    const snapshot=await vehicleRequest(cityId,id);
    if(destroyed)throw Error('Карта сменилась. Откройте инвентарь заново.');
    const data=planCanisterPour(snapshot,canisterId,actor,cityId,playerPosition);
    s=await vehicleRequest(cityId,id,'canister_pour',data);
    mapRender();
    return {liters:data.liters,remaining:Number(s.canisters.find(c=>c.id===canisterId)?.liters||0)};
   }catch(e){throw Error(vehicleError(e));}
   finally{busy=false;if(!destroyed&&dialog.open)render();}
  }
 });
 const assemblyTimer=setInterval(()=>{if(dialog.open)tickAssembly();},1000);
 const poll=setInterval(()=>{if(!busy&&!moving&&dialog.open)refresh().catch(()=>{});},5000);
 refresh().then(()=>{const c=current();if(c?.city_id===cityId)window.dispatchEvent(new CustomEvent('mn:player-teleported',{detail:{x:c.x,y:c.y}}));}).catch(()=>{});
 return()=>{destroyed=true;unregisterCanisters();clearInterval(timer);clearInterval(poll);clearInterval(assemblyTimer);window.__MN_VEHICLE_RUNTIME__=null;window.removeEventListener('keydown',key);window.removeEventListener('mn:auto-object-action',onOpen);window.removeEventListener('mn:auto-routes-open',onRoutes);window.removeEventListener('mn:auto-station-open',onStation);dialog.remove();launch.remove();hud.remove();layer.remove();playerMarker?.classList.remove('mn-auto-driving');};
}
