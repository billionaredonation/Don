import {getMapObjects} from '../mapObjects/mapObjectsRepository.js';
import {invokeLumberAction,getLumberUserErrorMessage} from '../lumber/lumberApi.js';
import './stationBreakfast.css';

const lines={
  breakfast:'Саша тебя ещё на вокзале ждёт. Поешь, выпей чай или кофе и возвращайся.',
  meet:'Здорово, работяга! Саша говорил, ты работу ищешь. Держи топор. Видишь дерево? С него и начнём.',
  chop:'Подойди к дереву на лесорубке и сруби его топором.',
  saw:'Теперь распил. Дорасти до 2-го уровня лесоруба, возьми бензопилу и распили одно бревно на этой лесорубке. Получишь четыре бруса.',
  sell:'Открой рынок (O/Щ на ПК) и продай древесину заводу. Нет покупателя? Я возьму четыре целых бревна по 30 ₴. Брусья оставь себе.',
  done:'С первой сменой! Теперь знаешь, как дерево превращается в товар.',
};
function human(err){
  const s=String(err?.message||err);
  if(s.includes('VITYA_NEEDS_FOUR_LOGS'))return 'Нужно четыре целых бревна. Брусья для этой продажи не подходят.';
  if(s.includes('VITYA_NOT_READY'))return 'Эта продажа пока недоступна. Проверь свой этап задания и лесорубку.';
  if(s.includes('FINISH_BREAKFAST_FIRST'))return lines.breakfast;
  return getLumberUserErrorMessage(err);
}
export async function openVitya(npc){
  if(document.querySelector('dialog.mn-station'))return;
  const cityId=npc.cityId||npc.city_id||npc.payload?.cityId;
  const d=document.createElement('dialog');d.className='mn-station';d.setAttribute('aria-label','Дядя Витя');
  d.innerHTML='<small>ЛЕСОРУБКА · ГЛАВА 2</small><h2>🧔 Дядя Витя</h2><p aria-live="polite">Загружаем…</p><div></div><button data-close>Закрыть</button>';
  document.body.append(d);d.onclose=()=>d.remove();d.showModal();d.querySelector('[data-close]').onclick=()=>d.close();
  const p=d.querySelector('p'),actions=d.querySelector('div');
  function button(label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=()=>run(fn);actions.append(b);}
  async function run(fn){actions.replaceChildren();try{await fn();}catch(err){if(!d.open)return;p.textContent=human(err);button('Проверить ещё раз',load);}}
  async function load(){
    const q=await invokeLumberAction('vitya_status');if(!d.open)return;
    p.textContent=lines[q.step]||'Неизвестный этап задания.';
    if(['breakfast','done'].includes(q.step))return;
    const objects=await getMapObjects(cityId,{centerX:npc.x,centerY:npc.y,radiusPercent:3});
    if(!d.open)return;
    const stations=objects.filter(o=>(o.payload?.jobType||o.payload?.type||o.type)==='lumber_station' && o.cityId===cityId &&
      Math.hypot(o.x-npc.x,o.y-npc.y)<=2);
    if(stations.length!==1){p.textContent='Витя должен стоять рядом с одной лесорубкой. Сообщи администратору, чтобы он поправил точку на карте.';return;}
    const stationObjectId=stations[0].id;
    if(q.stationId && (q.stationId!==stationObjectId || q.cityId!==cityId)){p.textContent='Ты начал смену на другой лесорубке. Вернись туда для продолжения.';return;}
    const payload={cityId,stationObjectId};
    if(q.step==='meet')button('Взять топор и начать смену',async()=>{await invokeLumberAction('vitya_meet',payload);await load();});
    if(q.step==='sell')button('Продать 4 бревна за 120 ₴',async()=>{
      const r=await invokeLumberAction('vitya_sell_four',payload);if(!d.open)return;
      p.textContent=r.sold===4?'Получено 120 ₴ за брёвна. Награда за смену: 500 ₴ и 250 опыта.':lines[r.step]||'Проверь свой этап задания.';
    });
  }
  await run(load);
}
