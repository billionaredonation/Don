import {invokeLumberAction} from '../lumber/lumberApi.js';
import {state} from '../state.js';
import './factoryFinale.css';
const roles=o=>[o?.type,o?.payload?.type,o?.payload?.serviceType,o?.payload?.jobType];
export const questNpc=o=>roles(o).find(t=>t==='lumber_vitya'||t==='station_sasha');
// No quest-specific factory routing. Every blip opens its native production panel.
export const isLessonFactory=()=>false;
const labels={fruit_factory:'пищевой',wood_processing_factory:'деревообрабатывающий',metallurgy_factory:'металлургический',tool_assembly_factory:'сборка инструментов',textile_factory:'швейный',construction_factory:'производство стройматериалов',car_factory:'автозавод',oil_refinery:'НПЗ'};
const lines={
 oil_well:['Нефтяная скважина','Здесь добывают сырую нефть. Чтобы получить топливо, нефть везут на завод.'],
 oil_refinery:['Нефтеперерабатывающий завод','Вот НПЗ. Здесь из нефти получают А-92, А-95 и дизель, а потом поставляют топливо на заправки.'],
 fuel_station:['АЗС','Здесь заправляешь машину. Цену устанавливает владелец заправки.'],
 car_dealer:['Автосалон','Хочешь свою машину — сюда. Заводы поставляют автомобили, а ты выбираешь из тех, что салон выставил на продажу.'],
 auto_service:['СТО','Если машина износилась, приезжай сюда на ремонт. Дорожный ремкомплект полноценный ремонт не заменяет.'],
 bank:['Банк','Здесь открываешь счета. Первую заводскую зарплату ищи на зарплатном счёте, а не в наличных.'],
 hospital:['Больница','Здесь можно получить лечение. В игре врачом может работать другой игрок.'],
 logistics_center:['Логистический центр','Хочешь работать водителем? Здесь берут заявки на перевозку между предприятиями.'],
 house:['Жильё','Дома в городе можно покупать и продавать. Владельцу нужно следить за коммунальными услугами.'],
 lumber_vitya:['Лесорубка','А это место ты уже знаешь. Дальше сам решаешь: освоить профессию, купить своё дело или найти сообщество. Удачи!']
};
const rpc=(op,o={},i=-1)=>invokeLumberAction('factory_finale',{op,cityId:o.cityId||o.city_id||state.cityId,objectId:o.id||'',page:i});
const tell=message=>window.dispatchEvent(new CustomEvent('mn:toast',{detail:{message,type:'info'}}));
let pending=0,notified=false;
function observe(q){
 clearTimeout(pending);
 if(q.step==='return'&&!notified){notified=true;tell('Смена оплачена. Вернись к Виталию на лесорубку и поговори с ним.');}
 if(q.step==='work')pending=setTimeout(()=>{if(document.hidden){observe(q);return;}resumeFactoryLesson().catch(()=>observe(q));},15000);
}
export async function resumeFactoryLesson(){
 const q=await rpc('status');observe(q);
 if(q.step==='tour' && !document.querySelector('dialog[open]') && String(state.cityId||q.city)===String(q.city))
   await openFactoryFinale({cityId:q.city});
}
export async function openFactoryFinale(o){
 if(document.querySelector('dialog.mn-finale'))return;
 const d=document.createElement('dialog');d.className='mn-finale';
 d.innerHTML='<section><small></small><h2></h2><p aria-live="polite"></p><footer></footer></section>';
 document.body.append(d);d.showModal();
 const $=s=>d.querySelector(s),footer=$('footer');
 let timer=0,q={},busy=false,cameraCity=null;
 const camera=detail=>window.dispatchEvent(new CustomEvent('mn:quest-camera',{detail}));
 function stop(){clearTimeout(timer);if(cameraCity!==null)camera({city:cameraCity,end:true});cameraCity=null;}
 d.onclose=()=>{stop();window.removeEventListener('keydown',keys,true);d.remove();};
 d.oncancel=e=>{if(q.step==='tour')e.preventDefault();};
 function keys(e){if(q.step==='tour'&&['KeyW','KeyA','KeyS','KeyD','KeyE','KeyF','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();}}
 window.addEventListener('keydown',keys,true);
 function btn(label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=fn;footer.append(b);}
 async function go(op){
  if(busy||!d.open)return;busy=true;clearTimeout(timer);footer.inert=true;
  try{q=await rpc(op,o,q.page??-1);if(!d.open)return;
   if(q.step==='return'&&op==='status'&&questNpc(o)==='lumber_vitya')q=await rpc('visit',o);
   if(d.open){observe(q);render();}}
  catch(e){stop();$('p').textContent=String(e?.message||e);footer.replaceChildren();btn('Повторить',()=>go('status'));btn('Закрыть',()=>d.close());}
  finally{busy=false;footer.inert=false;}
 }
 function render(){footer.replaceChildren();d.classList.toggle('tour',q.step==='tour');$('small').textContent='ОСВОЕНИЕ ГОРОДА';$('h2').textContent=questNpc(o)==='station_sasha'?'Саша':'Виталий';
  if(q.step==='tour'){
   const s=q.route[q.page];if(!s){$('p').textContent='Маршрут завершён.';btn('В город',()=>go('skip'));return;}
   cameraCity=q.city;camera({city:q.city,x:Number(s.x),y:Number(s.y)});
   const [title,text]=lines[s.kind]||['Город','Посмотри на отмеченный объект.'];
   $('small').textContent='ВИТАЛИЙ · '+(q.page+1)+' / '+q.route.length+' · 10 сек.';$('h2').textContent=title;$('p').textContent=text;
   btn(q.page+1===q.route.length?'В свободную игру':'Далее',()=>go('next'));btn('Пропустить экскурсию',()=>go('skip'));
   timer=setTimeout(()=>go('next'),10000);return;
  }
  stop();
  if(q.step==='offer'){
   $('p').textContent=questNpc(o)==='lumber_vitya'?'Первую продажу освоил. Теперь выбери любой завод, отработай одну смену и получи зарплату на счёт. Потом возвращайся ко мне.':'Поговори с Виталием на лесорубке — он расскажет, где заработать на первой смене.';
   if(questNpc(o)==='lumber_vitya')btn('Взять задание',()=>go('accept'));
  }else if(q.step==='work')$('p').textContent='Нужна одна завершённая и оплаченная смена. Нужен зарплатный счёт. Госзавод питания принимает без найма; на частных заводах действуют условия владельца.'+(q.options?.length?' В городе есть: '+q.options.map(k=>labels[k]||k).join(', ')+'.':'');
  else if(q.step==='return')$('p').textContent='Первые деньги заработаны. Вернись к Виталию на лесорубку.';
  else if(q.step==='done'){tell('Обучение завершено. Добро пожаловать в открытый мир!');d.close();return;}
  else $('p').textContent='Сначала добудь и продай ресурс по заданию Виталия.';
  btn('Закрыть',()=>d.close());
 }
 await go('status');
}
