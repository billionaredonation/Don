import { supabase } from '../supabaseClient.js';
import { METALLURGY_RAW_ITEMS } from '../metallurgy/metallurgyConfig.js';
import './mineFactoryTrade.css';
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const labels=Object.fromEntries(METALLURGY_RAW_ITEMS.map(i=>[i.itemType,i.label]));
const statuses={pending:'Ожидает решения',in_transit:'Передано в логистику',delivered:'Доставлено',cancelled:'Отменено',rejected:'Отклонено'};
const errors={MINE_OFFER_INVALID:'Укажите целое количество и цену больше нуля.',MINE_BUSINESS_STOCK_NOT_ENOUGH:'На складе шахты недостаточно этого сырья.',JOB_BUSINESS_OWNER_REQUIRED:'Продажа доступна владельцу шахты.',MINE_FACTORY_OWNER_REQUIRED:'Принять предложение может владелец завода.',MINE_SOURCE_OWNER_CHANGED:'Владелец шахты изменился. Создайте новое предложение.',MINE_PROCUREMENT_OWNER_CHANGED:'Новый владелец завода должен настроить бюджет скупки.',MINE_TARGET_UNAVAILABLE:'Выберите действующий металлургический завод.',PROCUREMENT_BUDGET_NOT_ENOUGH:'В бюджете скупки завода недостаточно денег.',METALLURGY_CASH_NOT_ENOUGH:'В кассе завода недостаточно денег.',LOGISTICS_HUB_UNAVAILABLE:'В городе завода нет доступного логистического центра с бюджетом на работу.',MINE_OFFER_NOT_PENDING:'Предложение уже обработано. Обновите список.',MINE_OFFERS_SERVER_ERROR:'Не удалось обработать предложение. Попробуйте ещё раз.'};
async function action(action,payload={}){
 const initData=String(window.Telegram?.WebApp?.initData||'');
 if(!initData)throw Error('Откройте игру через Telegram.');
 const {data,error}=await supabase.functions.invoke('mine-offers',{body:{initData,action,...payload}});
 let code=data?.error;
 if(error){try{code=(await error.context?.clone?.().json())?.error;}catch{}code=code||error.message;}
 if(error||!data?.ok)throw Error(errors[code]||code||'Не удалось загрузить предложения.');
 return data.result;
}
export function mountMineFactoryTrade(host,{incoming=false,getContext,onChange=async()=>{}}){
 let key='',version=0,busy=false,disposed=false,offers=[],targets=[];
 const contextKey=c=>`${c.id||''}:${c.cityId||''}:${Boolean(c.isOwner)}`;
 const current=()=>getContext();
 const notice=message=>{const node=host.querySelector('[data-trade-message]');if(node)node.textContent=message;};
 function rows(){
  const c=current(),visible=offers.filter(o=>incoming?o.factoryId===c.id&&o.cityId===c.cityId:o.sourceBusinessId===c.id);
  const box=host.querySelector('[data-trade-list]');if(!box)return;
  box.innerHTML=visible.map(o=>`<article><strong>${esc(labels[o.itemType]||o.itemType)} · ${Number(o.quantity)} шт. · ${Number(o.totalPrice).toLocaleString('ru-RU')} ₴</strong><small>${esc(statuses[o.status]||o.status)} · ${esc(o.cityId)}</small>${o.status==='pending'?(incoming&&o.canAccept?`<button data-trade-action="accept" data-id="${esc(o.id)}">Принять</button><button data-trade-action="reject" data-id="${esc(o.id)}">Отклонить</button>`:!incoming&&o.canCancel?`<button data-trade-action="cancel" data-id="${esc(o.id)}">Отменить</button>`:''):''}</article>`).join('')||'<p>Предложений пока нет.</p>';
 }
 function stock(){
  if(incoming)return;
  const c=current(),select=host.querySelector('[data-trade-item]');if(!select)return;
  for(const opt of select.options)opt.textContent=`${labels[opt.value]} — на складе ${Number(c.items?.[opt.value]||0)}`;
  const count=Number(c.items?.[select.value]||0),input=host.querySelector('[data-trade-qty]');input.max=String(Math.min(count,100000));
  host.querySelector('[data-trade-stock]').textContent=`Доступно со склада предприятия: ${count} шт.`;
  const qty=Number(input.value),price=Number(host.querySelector('[data-trade-price]').value);
  host.querySelector('[data-trade-total]').textContent=`Сумма: ${Number.isFinite(qty*price)?(qty*price).toLocaleString('ru-RU'):0} ₴`;
 }
 function sync(){
  const c=current(),next=contextKey(c);host.hidden=!c.isOwner||!c.id;
  if(next!==key){key=next;version++;offers=[];targets=[];
   host.innerHTML=`<section class="mn-mine-trade"><h3>${incoming?'Предложения шахт':'Продажа запасов металлургическим заводам'}</h3>${incoming?'':`<p>Продажа со склада предприятия. Выручка поступает в кассу шахты.</p><div class="mn-mine-trade-form"><label>Сырьё<select data-trade-item>${METALLURGY_RAW_ITEMS.map(i=>`<option value="${i.itemType}">${esc(i.label)}</option>`).join('')}</select></label><label>Завод<select data-trade-target><option value="">Загрузка заводов…</option></select></label><label>Количество<input data-trade-qty type="number" min="1" step="1" value="1"></label><label>Цена за единицу, ₴<input data-trade-price type="number" min="1" max="1000000000" step="1" value="100"></label></div><p data-trade-stock></p><strong data-trade-total></strong><button data-trade-action="create">Отправить предложение</button>`}<button data-trade-action="refresh">Обновить предложения</button><p role="status" data-trade-message></p><div data-trade-list></div></section>`;
   if(c.isOwner&&c.id)void refresh();
  }
  stock();
 }
 async function refresh(){
  const c=current(),requestKey=contextKey(c),v=++version;
  if(!c.isOwner||!c.id)return;
  try{
   const results=await Promise.all([action('snapshot'),incoming?Promise.resolve([]):action('targets')]);
   if(disposed||v!==version||contextKey(current())!==requestKey)return;
   [offers,targets]=results;rows();
   if(!incoming){const s=host.querySelector('[data-trade-target]'),old=s.value;s.innerHTML='<option value="">Выберите завод</option>'+targets.map(f=>`<option value="${esc(f.factoryId)}">${esc(f.name)} · ${esc(f.cityId)}${f.isOwn?' · Ваш завод':''}</option>`).join('');if(old!==''&&targets.some(f=>f.factoryId===old))s.value=old;if(!targets.length)notice('Доступных металлургических заводов пока нет.');}
   stock();
  }catch(e){if(v===version&&!disposed)notice(e.message);}
 }
 async function click(e){
  const button=e.target.closest('[data-trade-action]');if(!button||busy)return;
  const a=button.dataset.tradeAction;if(a==='refresh'){await refresh();return;}
  const c=current(),requestKey=contextKey(c);if(!c.isOwner)return;
  let payload={offerId:button.dataset.id};
  if(a==='create'){
   const index=host.querySelector('[data-trade-target]').value,f=index!==''?targets.find(f=>f.factoryId===index):null;
   const itemType=host.querySelector('[data-trade-item]').value,quantity=Number(host.querySelector('[data-trade-qty]').value),unitPrice=Number(host.querySelector('[data-trade-price]').value);
   if(!f){notice('Выберите металлургический завод.');return;}
   if(!Number.isInteger(quantity)||quantity<1||quantity>100000||!Number.isInteger(unitPrice)||unitPrice<1||unitPrice>1000000000){notice(errors.MINE_OFFER_INVALID);return;}
   if(quantity>Number(c.items?.[itemType]||0)){notice(errors.MINE_BUSINESS_STOCK_NOT_ENOUGH);return;}
   payload={sourceBusinessId:c.id,factoryId:f.factoryId,cityId:f.cityId,itemType,quantity,unitPrice};
  }
  busy=true;host.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await action(a,payload);if(disposed||contextKey(current())!==requestKey)return;await onChange();await refresh();notice(a==='accept'?'Партия оплачена. Заявка передана в логистику.':a==='create'?'Предложение отправлено.':'Предложение обновлено.');}
  catch(e){if(!disposed&&contextKey(current())===requestKey)notice(e.message);}
  finally{busy=false;if(!disposed)host.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 host.addEventListener('click',click);host.addEventListener('input',stock);host.addEventListener('change',stock);
 return {sync,refresh,destroy(){disposed=true;version++;host.removeEventListener('click',click);host.removeEventListener('input',stock);host.removeEventListener('change',stock);}};
}
