const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export const componentNames={car_frame:'Каркас автомобиля',car_engine:'Двигатель автомобиля',car_body:'Кузов автомобиля',support_beam:'Опорная балка',screws:'Шурупы',rivets:'Заклёпки'};
const money=v=>Number(v||0).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₴';
export const assemblyItems=s=>[...new Set((s.models||[]).flatMap(m=>Object.keys(m.recipe||{})))];
export const stockQuantity=(s,item)=>(s.stock||[]).filter(t=>t.item===item).reduce((n,t)=>n+Number(t.quantity||0),0);
export function carStockSummary(s,id){
 const cars=(s.vehicles||[]).filter(v=>v.business_id===id&&!v.owner_id&&!v.route_id);
 const reserved=new Set([...(s.supplyOffers||[]),...(s.playerOffers||[])].map(o=>o.vehicle_id));
 return {total:cars.length,reserved:cars.filter(v=>reserved.has(v.id)).length,free:cars.filter(v=>!reserved.has(v.id)).length,
 models:(s.models||[]).map(m=>({label:m.label,count:cars.filter(v=>v.model===m.id).length}))};
}
export function autoMaterialsMarkup(s){
 const stock=new Set([...assemblyItems(s),...(s.stock||[]).map(t=>t.item)]);
 return `<h3>Склад материалов</h3><div class="mn-auto-stock-grid">${[...stock].map(item=>`<article><strong>${esc(componentNames[item]||item)}</strong><p>${stockQuantity(s,item).toLocaleString('ru-RU')} ед.</p></article>`).join('')}</div><h3>Обеспеченность сборки</h3>${(s.models||[]).map(m=>{
 const inputs=Object.entries(m.recipe||{});const possible=inputs.length?Math.min(...inputs.map(([k,q])=>Math.floor(stockQuantity(s,k)/Number(q)))):0;
 return `<article><strong>${esc(m.label)} · можно собрать: ${Math.max(0,possible)}</strong><p>${inputs.map(([k,q])=>`${esc(componentNames[k]||k)}: ${stockQuantity(s,k)} / ${Number(q)}${stockQuantity(s,k)<q?` — не хватает ${Number(q)-stockQuantity(s,k)}`:''}`).join('<br>')}</p></article>`;
 }).join('')}<h3>Материалы в пути</h3>${(s.procurement?.deliveries||[]).map(d=>`<article>${esc(componentNames[d.item]||d.item)} × ${Number(d.quantity)} · ${esc(d.sourceCity)} · ${esc(({open:'Ожидает водителя',pickup:'Едет на погрузку',unload:'Доставляется'})[d.status]||d.status)}</article>`).join('')||'<p>Активных поставок нет.</p>'}`;
}
export function autoCarsSummaryMarkup(s,id){const r=carStockSummary(s,id);return `<div class="mn-auto-stock-grid"><article>Всего готовых авто<strong>${r.total}</strong></article><article>Свободно<strong>${r.free}</strong></article><article>В предложениях<strong>${r.reserved}</strong></article></div><p>${r.models.map(m=>`${esc(m.label)}: ${m.count}`).join(' · ')}</p>`;}
export function autoProcurementMarkup(s,btn){
 const p=s.procurement||{},budget=Number(p.budget||0),reward=Number(p.reward??250);
 const input=(key,value,min=0)=>`<input data-field="${esc(key)}" type="number" min="${min}" step="0.01" value="${Number(value)||0}">`;
 return `<h3>Закупка материалов</h3><p>Касса: ${money(s.business?.cash)} · Выделено на закупки: <strong>${money(budget)}</strong></p><p>Бюджет включает стоимость деталей и оплату доставки каждой партии. Эти деньги нельзя снять или потратить на другие действия, пока вы не уменьшите бюджет.</p><label>Общий бюджет ${input('proc-budget',budget)}</label>${btn('procurement_budget','Сохранить бюджет')}
 <h3>Доставка от поставщиков</h3><label>Перевозчик <select data-field="proc-hub"><option value="">Выберите компанию</option>${(s.hubs||[]).map(h=>`<option value="${esc(h.id)}" ${h.id===p.hubId?'selected':''}>${esc(h.name||h.id)} · ${esc(h.city)}</option>`).join('')}</select></label><label>Водителю за партию ${input('proc-reward',reward,10)}</label>${btn('procurement_logistics','Сохранить доставку')}
 ${!p.hubId?'<p>Выберите и сохраните перевозчика, чтобы поставщики увидели закупки.</p>':''}
 <h3>Цены закупки</h3><p>Цена 0 отключает закупку материала. Заявки видны владельцам металлургических заводов в разделе управления.</p>${assemblyItems(s).map(item=>{const price=Number((p.items||[]).find(i=>i.item===item)?.price||0);const max=price>0?Math.max(0,Math.floor((budget-reward)/price)):0;return `<article><strong>${esc(componentNames[item]||item)}</strong><p>На складе: ${stockQuantity(s,item)} ед. · ${price>0?`Закупка по ${money(price)} · бюджет на ${max} ед. с одной доставкой`:'Закупка отключена'}</p><label>Цена за единицу ${input('proc-price-'+item,price)}</label>${btn('procurement_item','Сохранить цену',`data-item="${esc(item)}"`)}</article>`;}).join('')}`;
}

