import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import './stationBreakfast.css';

const names = { bun:'Булочка с творогом', tea:'Чай', coffee:'Кофе' };
const messages = { STATION_NEAR:'Подойдите ближе к ларьку и повторите.',
  STATION_LEVEL:'Ларёк обслуживает игроков до 3-го уровня включительно. Теперь продукты можно купить в магазине.',
  STATION_STALE:'Инвентарь изменился. Откройте его заново и повторите.',
  STATION_EMPTY:'Этот предмет уже закончился.', STATION_FUNDS:'На этот завтрак не хватает денег.',
  STATION_POSITION:'Позиция персонажа ещё не сохранена. Подождите немного.',
  STATION_MEET:'Сначала поговорите с Сашей у ларька.' };
async function call(op,extra={}) {
  const initData=window.Telegram?.WebApp?.initData;
  if (!initData) throw new Error('Откройте игру в Telegram.');
  const {data,error}=await supabase.functions.invoke('player-interaction',{body:{initData,action:'station_breakfast',op,...extra}});
  if(error || !data?.ok) throw new Error(messages[data?.error] || 'Не удалось загрузить данные ларька. Попробуйте ещё раз.');
  return data.result;
}
function step(q) {
  if(q.completed) return 'Глава завершена. Награда за завтрак получена.';
  if(!q.purchases) return '1. Купите булочку с творогом и чай или кофе одним чеком.';
  return '2. Откройте инвентарь и примените: '+[!q.ate && 'булочку',!q.drank && 'чай или кофе'].filter(Boolean).join(' и ')+'.';
}
function emit(event,detail){window.dispatchEvent(new CustomEvent(event,{detail}));}
export async function stationArrivalHint(){
  try{
    const {quest,level}=await call('status');
    if(!quest?.completed && level<=3) emit('mn:toast',{type:'info',message:quest?step(quest):'На вокзале вас ждёт Саша 🧑. Подойдите и выберите «Поговорить с Сашей».'});
  }catch{/* Game entry must not depend on the quest server. */}
}
function syncMoney(r){state.player={...state.player,balance:r.balance};emit('mn:player-balance-changed',{balance:r.balance,source:'station_breakfast'});}
export async function stationInventory(){
  const {quest:q}=await call('status');
  if(!q) return [];
  const items=Object.entries(names).filter(([k])=>q[k]>0).map(([k,label])=>({
    itemType:'station_'+k,label,icon:k==='bun'?'🥐':'☕',quantity:q[k],rev:q.rev,stationInfo:step(q)
  }));
  if(q.coupons) items.push({itemType:'station_coupon',label:'Талон Саши · '+q.coupons+'/3',icon:'🎟️',quantity:1,
    stationInfo:'Скидка 10% на завтрак в вокзальном ларьке. Применяется автоматически. Осталось покупок: '+q.coupons+'.'});
  return items;
}
export async function useStationItem(item){
  const r=await call('use',{item:item.itemType.slice(8),rev:item.rev});
  syncMoney(r);
  const vitals={food:r.food,water:r.water}; Object.assign(state.player,vitals);
  emit('mn:player-vitals-changed',{vitals,source:'station_breakfast'});
  const message=r.reward?'Первый завтрак завершён! +50 ₴ и +10 общего опыта.':(r.quest.completed?'Готово.':step(r.quest));
  emit('mn:toast',{message,type:'success'});return message;
}
export async function openStation(object){
  const npc=[object?.type,object?.payload?.serviceType].includes('station_sasha');
  if(document.querySelector('.mn-station'))return;
  const d=document.createElement('dialog'); d.className='mn-station';
  d.innerHTML='<small>ВОКЗАЛ · ГЛАВА 1</small><h2>Первый завтрак</h2><p data-story></p><p data-step aria-live="polite">Загружаем…</p><div data-actions></div><button data-close>Закрыть</button>';
  document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();
  d.querySelector('[data-close]').onclick=()=>d.close();
  const story=d.querySelector('[data-story]'),desc=d.querySelector('[data-step]'),actions=d.querySelector('[data-actions]');
  function button(label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{
    for(const btn of actions.children) btn.disabled=true;
    try{await fn();}catch(e){desc.textContent=e.message;actions.replaceChildren();button('Обновить',load);}
  };actions.append(b);}
  function render(r,notice=''){
    if(!d.isConnected)return;
    actions.replaceChildren();const q=r.quest;
    if(r.level>3){story.textContent=messages.STATION_LEVEL;desc.textContent=q && !q.completed && q.purchases?'Купленный завтрак всё ещё можно применить в инвентаре.':'';return;}
    if(!q && !npc){story.textContent='Сначала поговорите с Сашей 🧑 у вокзала — он даст талон на завтрак.';desc.textContent='';return;}
    if(!q){story.textContent='Саша: «Здорово! Давно не виделись. Долго добирался? Ну ещё бы — такой город выбрал: '+(state.cityName||object.city_id||state.cityId||'наш город')+'! Вон у вокзала мой знакомый торгует. Держи талон на три завтрака».';
      desc.textContent='Талон даёт скидку 10%. Награда за съеденную булочку и выпитый напиток: 50 ₴ и 10 опыта.';
      button('Взять талон',async()=>render(await call('meet',{blip:object.id})));return;}
    if(npc){story.textContent=q.completed?'Саша: «Ну вот, теперь другое дело!»':'Саша: «Загляни в ларёк 🥐, он рядом».';
      desc.textContent=step(q);return;}
    const price=q.coupons?45:50;
    story.textContent='Завтрак: булочка с творогом + напиток. '+price+' ₴ за комплект. '+(q.coupons?'Талон −10% · осталось '+q.coupons+' из 3.':'Без скидки.')+
      (!q.purchases && r.balance<price?' На первый чек Саша добавит '+(price-r.balance)+' ₴.':'');
    desc.textContent=(notice?notice+' ':'')+step(q);
    for(const item of ['tea','coffee'])button('Купить с '+(item==='tea'?'чаем':'кофе'),async()=>{
      const next=await call('buy',{item,blip:object.id,rev:q.rev});syncMoney(next);
      render(next,'В инвентаре: булочка и '+names[item].toLowerCase()+'. Списано '+next.charged+' ₴.');
    });
    if(q.purchases)button('Открыть инвентарь',()=>{d.close();if(!window.__MN_INVENTORY_OPEN__)emit('mn:inventory-toggle-request',{});});
  }
  async function load(){render(await call('status'));}
  try{await load();}catch(e){desc.textContent=e.message;button('Повторить',load);}
}
