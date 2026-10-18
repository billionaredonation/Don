import {vehicleRequest,vehicleError} from './vehicleIndustryApi.js';
import {componentNames} from './autoFactoryPanels.js';
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function mountAutoMaterialMarket(host,{getContext,onChange}){
 let orders=[],busy=false,loading=false,destroyed=false,message='',key='',generation=0,retry=null;
 const contextKey=c=>`${c.id}|${c.cityId}|${c.isOwner}`;
 function sync(){const c=getContext(),next=contextKey(c);if(next!==key){key=next;generation++;orders=[];message='';retry=null;}host.hidden=!c.isOwner;render();}
 function render(){if(destroyed)return;const c=getContext();host.hidden=!c.isOwner;
 host.innerHTML=`<h3>Закупки автозаводов</h3><p>Продажа готовых деталей со склада этой металлургии. Выручка поступает в кассу завода. Доставку оплачивает покупатель.</p><button type="button" data-auto-market-refresh ${busy||loading?'disabled':''}>Обновить заявки</button><p role="status">${esc(message)}</p>${orders.map((o,i)=>{const max=Math.min(100000,Number(o.stock),Number(o.maxQuantity));return `<article><strong>${esc(o.name)} · ${esc(o.cityId)}</strong><p>${esc(componentNames[o.item]||o.item)} · ${Number(o.price).toLocaleString('ru-RU')} ₴/ед.</p><p>На вашем складе: ${Number(o.stock)} · Покупатель может принять: ${Number(o.maxQuantity)}</p><label>Количество <input data-auto-market-qty="${i}" type="number" min="1" max="${max}" step="1" value="${Math.max(1,Math.min(max,10))}"></label><button type="button" data-auto-market-sell="${i}" ${busy||loading||!c.isOwner||max<1?'disabled':''}>Продать и передать в доставку</button></article>`;}).join('')||'<p>Доступных закупок пока нет. Автозавод должен сохранить бюджет, цены и перевозчика.</p>'}`;
 }
 async function refresh(){if(destroyed||busy||loading)return;sync();const c={...getContext()},version=generation;if(!c.isOwner||!c.id)return;loading=true;render();
 try{const r=await vehicleRequest(c.cityId,c.id,'procurement_market');if(destroyed||version!==generation||contextKey(getContext())!==key)return;orders=r.orders||[];message='';}
 catch(e){if(!destroyed&&version===generation)message=vehicleError(e);}
 finally{loading=false;if(!destroyed){render();if(version!==generation)void refresh();}}
 }
 async function click(e){const button=e.target.closest('button');if(!button||button.disabled||busy)return;
 if(button.hasAttribute('data-auto-market-refresh')){await refresh();return;}
 if(!button.hasAttribute('data-auto-market-sell'))return;
 const index=Number(button.dataset.autoMarketSell),o=orders[index],c={...getContext()};if(!o||!c.isOwner||contextKey(c)!==key)return;
 const quantity=Number(host.querySelector(`[data-auto-market-qty="${index}"]`)?.value);
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>Math.min(100000,Number(o.stock),Number(o.maxQuantity))){message='Укажите целое количество в пределах склада и бюджета покупателя.';render();return;}
 const data={sourceId:c.id,sourceCity:c.cityId,item:o.item,quantity,price:o.price};const signature=JSON.stringify([o.factoryId,o.cityId,data]);
 if(retry?.signature!==signature)retry={signature,id:crypto.randomUUID()};const request=retry.id,version=generation;
 busy=true;message='Отправляем поставку…';render();
 try{await vehicleRequest(o.cityId,o.factoryId,'procurement_sell',data,request);retry=null;
  if(destroyed||version!==generation||contextKey(getContext())!==key)return;
  message='Детали проданы. Заказ передан перевозчику.';orders=[];await onChange?.();
 }catch(error){if(!destroyed&&version===generation)message=vehicleError(error);}
 finally{busy=false;if(!destroyed){render();if(version!==generation)void refresh();}}
 }
 host.addEventListener('click',click);sync();
 return {sync,refresh,destroy(){destroyed=true;generation++;host.removeEventListener('click',click);host.innerHTML='';}};
}

