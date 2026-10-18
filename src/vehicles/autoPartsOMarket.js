import './autoPartsOMarket.css';
import { vehicleRequest, vehicleError } from './vehicleIndustryApi.js';
import { mountAutoMaterialMarket } from './autoMaterialMarket.js';
import { componentNames } from './autoFactoryPanels.js';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function mountAutoPartsOMarket(host){
 let destroyed=false,market=null,sources=[],selected=null;
 host.innerHTML=`<details open class="mn-auto-parts-o"><summary><strong>🚗 Детали для автозаводов</strong></summary><p>${Object.values(componentNames).map(esc).join(' · ')}</p><p>Выберите металлургию, со склада которой продаёте детали. Деньги поступят в её кассу, а поставка появится у перевозчика автозавода.</p><div data-auto-parts-source>Загружаем ваши заводы…</div><div data-auto-parts-orders></div></details>`;
 const picker=host.querySelector('[data-auto-parts-source]'),orders=host.querySelector('[data-auto-parts-orders]');
 function select(){const index=Number(picker.querySelector('select')?.value);selected=sources[index]||null;market?.sync();void market?.refresh();}
 async function load(){try{
  const data=await vehicleRequest('all','','procurement_sources');if(destroyed)return;sources=data.sources||[];
  if(!sources.length){picker.innerHTML='<p>У вас нет металлургического завода. Детали для продажи берутся со склада принадлежащей вам металлургии.</p>';return;}
  picker.innerHTML=`<label>Склад поставщика <select>${sources.map((s,i)=>`<option value="${i}">${esc(s.name)} · ${esc(s.cityId)} · ${esc(s.id)}</option>`).join('')}</select></label>`;
  selected=sources[0];market=mountAutoMaterialMarket(orders,{getContext:()=>({...selected,isOwner:!!selected}),onChange:()=>window.dispatchEvent(new CustomEvent('mn:metallurgy-stock-changed'))});
  picker.addEventListener('change',select);await market.refresh();
 }catch(e){if(!destroyed)picker.innerHTML=`<p role="alert">${esc(vehicleError(e))}</p><button type="button" data-auto-parts-retry>Повторить загрузку</button>`;}}
 const retry=e=>{if(e.target.closest('[data-auto-parts-retry]'))void load();};host.addEventListener('click',retry);void load();
 return {destroy(){destroyed=true;market?.destroy();picker.removeEventListener('change',select);host.removeEventListener('click',retry);host.innerHTML='';}};
}
