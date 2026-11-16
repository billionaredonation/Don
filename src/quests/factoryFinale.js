import {invokeLumberAction} from '../lumber/lumberApi.js';
import {getMapObjects} from '../mapObjects/mapObjectsRepository.js';
import {state} from '../state.js';
import './factoryFinale.css';
const types=o=>[o?.type,o?.payload?.type,o?.payload?.serviceType,o?.payload?.jobType,o?.category];
export const questNpc=o=>types(o).find(t=>['lumber_vitya','station_sasha'].includes(t));
const key=()=>'mn-factory-lesson:'+String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id||state.telegramId||state.playerId);
function mark(id){
 document.getElementById('mn-lesson-pin')?.remove();
 if(!id)return;
 const style=document.createElement('style'); style.id='mn-lesson-pin';
 style.textContent='[data-map-object-id="'+CSS.escape(String(id))+'"]{outline:3px solid #ffd363!important;outline-offset:3px;border-radius:50%}';
 document.head.append(style);
}
export const isLessonFactory=o=>types(o).includes('fruit_factory') && String(o.id)===localStorage.getItem(key());
export async function resumeFactoryLesson(){
 const q=await invokeLumberAction('factory_finale',{op:'status'});
 if(q.factory && q.step!=='done')localStorage.setItem(key(),q.factory);else localStorage.removeItem(key());
 mark(q.step==='done'?null:q.factory);
 if(q.step==='tour' && !document.querySelector('dialog[open]')){
   await openFactoryFinale({id:q.factory,cityId:q.city,...q.position});
 }
}
const slides=[
 ['🚘 Личный автомобиль','В автосалоне выбираешь машину, которую поставил завод. Она станет твоей после покупки. За ней придётся следить: топливо на АЗС, ремонт на СТО.',['car_dealer','auto_service']],
 ['⛽ От скважины до бака','Скважина даёт нефть, НПЗ выпускает бензин и дизель. На АЗС выбирай топливо под свой двигатель.',['oil_well','oil_refinery','fuel_station']],
 ['🏦 Деньги и контракты','Зарплатный счёт нужен для выплат за работу. Владельцы выбирают партнёров, договариваются о поставках и заказывают перевозку.',['bank','logistics_center']],
 ['🏠 Дом и дело','Дома и предприятия можно покупать и продавать. Частному бизнесу нужны коммунальные услуги и деньги на работу.',['house','fruit_factory']],
 ['🏥 Здоровье','Еда и вода расходуются. В больнице есть лекарства, а игрок-медик может предложить лечение.',['hospital']],
 ['🤝 Люди города','Сообщества объединяют игроков и дают бонусы. Есть и мелкие банды. Кем стать, где работать и с кем играть — теперь решаешь ты.',['community','station_sasha','lumber_vitya']]
];
export async function openFactoryFinale(o){
 if(document.querySelector('dialog.mn-finale'))return;
 const city=o.cityId||o.city_id||state.cityId;
 const rpc=(op,page=-1)=>invokeLumberAction('factory_finale',{op,cityId:city,objectId:o.id,page});
 const d=document.createElement('dialog');d.className='mn-finale';d.innerHTML='<div class="mn-flight" hidden><div></div><b></b></div><section><small></small><h2></h2><p aria-live="polite"></p><footer></footer></section>';
 const $=s=>d.querySelector(s),p=$('p'),footer=$('footer'),flight=$('.mn-flight'),plane=flight.firstElementChild;
 let q={},objects=[],busy=false,watch=0;
 const pos=(v)=>Math.min(100,Math.max(0,Number(v)||0));
 function camera(x,y){plane.style.left=(50-pos(x)*2.5)+'%';plane.style.top=(50-pos(y)*2.5)+'%';}
 const map=document.querySelector('.gta-map-image:not(.gta-map-glow)'),url=document.querySelector('.gta-map-viewport')?.dataset.mapSrc||map?.dataset.mapSrc||map?.currentSrc||map?.src;
 if(url)plane.style.backgroundImage='url('+JSON.stringify(url)+')';
 camera(o.x,o.y);
 function act(label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=()=>run(fn);footer.append(b);}
 async function run(fn){if(busy)return;busy=true;footer.inert=true;try{await fn();}
 catch(e){if(!d.open)return;p.textContent=String(e?.message||e);footer.replaceChildren();act('Проверить ещё раз',()=>go('status'));act('Закрыть',()=>d.close());}
 finally{busy=false;footer.inert=false;}}
 async function go(op){q=await rpc(op,q.page);if(!d.open)return;render();
 if(op==='pack' && q.step==='tour')window.dispatchEvent(new CustomEvent('mn:player-inventory-changed'));}
 function render(){
 clearTimeout(watch);footer.replaceChildren();flight.hidden=true;d.classList.toggle('tour',q.step==='tour');
 $('small').textContent='ОСВОЕНИЕ ГОРОДА · ЗАВОД';$('h2').textContent=questNpc(o)==='station_sasha'?'Саша':questNpc(o)?'Дядя Витя':'Мастер смены';
 if(q.factory && q.step!=='done')localStorage.setItem(key(),q.factory);
 mark(q.step==='done'?null:q.factory);
 if(q.step==='offer'){p.textContent='С первой продажей! Теперь посмотрим, как из сырья делают товар. Пойдёшь на смену?';act('Взять направление на завод',()=>go('accept'));}
 else if(q.step==='tour'){
   const [title,line,targets]=slides[q.page];$('small').textContent='ЭКСКУРСИЯ · '+(q.page+1)+' / 6';$('h2').textContent=title;p.textContent=line;flight.hidden=false;
   const spot=targets.map(t=>objects.find(v=>types(v).includes(t))).find(Boolean);
   const point=spot||q.position||o;camera(point.x,point.y);flight.lastElementChild.textContent=spot?title:'Обзор города';
   act(q.page===5?'Начать свободную игру':'Далее',()=>go('next'));act('Пропустить экскурсию',()=>go('skip'));return;
 }else if(q.step==='done'){localStorage.removeItem(key());$('h2').textContent='Добро пожаловать в город!';p.textContent='Обучение завершено. Удачной смены — уже на твоих условиях.';act('В город',()=>d.close());return;}
 else if(q.step==='trade'){p.textContent='Сначала добудь и продай ресурс по заданию Вити.';}
 else if(String(o.id)!==q.factory){
   const point=q.position;if(point){flight.hidden=false;camera(point.x,point.y);flight.lastElementChild.textContent='📍 Пищевой завод';}
   p.textContent='Тебя ждут на пищевом заводе ('+q.city+'). Нужен зарплатный счёт. На отмеченном заводе открой производство, выбери рецепт, приготовь и упакуй партию. Сырьё государственное, зарплата придёт после упаковки.';
   act('Проверить направление',()=>go('accept'));
 }else if(q.step==='arrive'){p.textContent='Заказ на один хлеб. Мастер выделил 3 порции пшеницы для этой партии. Загрузи их на линию.';act('Загрузить 3 пшеницы',()=>go('load'));}
 else if(q.step==='loaded'){p.textContent='Сырьё загружено. Теперь запусти печь.';act('Начать выпечку',()=>go('cook'));}
 else if(q.step==='baking'){const ms=Date.parse(q.ready_at)-Date.now();p.textContent=ms>0?'Партия в печи. Через несколько секунд хлеб можно упаковать.':'Хлеб готов. Упакуй его, чтобы закончить смену.';if(ms>0)watch=setTimeout(()=>{if(d.open)render();},Math.min(ms+80,4000));else act('Упаковать хлеб и закончить смену',()=>go('pack'));}
 act('Закрыть',()=>d.close());
 }
 const stopKeys=e=>{if(d.open && ['KeyW','KeyA','KeyS','KeyD','KeyE','KeyF','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();}};
 document.body.append(d);d.onclose=()=>{window.removeEventListener('keydown',stopKeys,true);clearTimeout(watch);d.remove();};d.oncancel=e=>{if(q.step==='tour')e.preventDefault();};d.showModal();window.addEventListener('keydown',stopKeys,true);p.textContent='Проверяем задание…';
 void getMapObjects(city).then(rows=>{objects=rows||[];if(d.open && q.step==='tour')render();}).catch(()=>{});
 await run(()=>go('status'));
}
