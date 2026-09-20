import './nuclearPower.css';
import { formatBusinessMoney } from '../business/businessConfig.js';
import { loadNuclearSnapshot, setNuclearRunning, discardNuclearEnergy, createNuclearContract, getNuclearError } from './nuclearPowerApi.js';

const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const toast = (message, type='info') => window.dispatchEvent(new CustomEvent('mn:toast',{detail:{message,type}}));
const contractDate = (value) => value ? new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeZone:'Europe/Kyiv'}).format(new Date(value)) : '—';
const defaultEndDate = () => { const date=new Date(); date.setUTCDate(date.getUTCDate()+7); return date.toISOString().slice(0,10); };
const plantIdOf = (o) => String(o?.payload?.nuclearPlantId || o?.payload?.nuclear_plant_id || o?.id || '').trim();

function markup() {
  return `<div class="mn-nuclear-backdrop" data-nuclear-modal hidden><section class="mn-nuclear-panel">
    <header><div><small>ГОСУДАРСТВЕННЫЙ ЭНЕРГЕТИЧЕСКИЙ ОБЪЕКТ</small><h2>☢️ Атомная электростанция</h2><p>Реакторный блок → генератор → государственный накопитель → подстанции</p></div><button type="button" data-nuclear-close aria-label="Закрыть">×</button></header>
    <nav><button type="button" class="is-active" data-nuclear-tab="station">Станция</button><button type="button" data-nuclear-tab="contracts">Контракты</button></nav>
    <main>
      <section data-nuclear-page="station"><div class="mn-nuclear-stats"><article><small>Статус</small><strong data-nuclear-status>Загрузка…</strong></article><article><small>Энергия</small><strong data-nuclear-energy>—</strong></article><article><small>Выработка</small><strong data-nuclear-rate>10 кВт·ч / сек.</strong></article><article><small>Владелец</small><strong>Государство</strong></article></div>
      <div class="mn-nuclear-core"><div class="mn-nuclear-reactor"><i>☢️</i><span><strong>Реакторный блок</strong><small data-nuclear-core-label>Стабильный режим</small></span></div><div class="mn-nuclear-pulse"></div><div class="mn-nuclear-chain"><span>⚛️ Реактор</span><b>→</b><span>⚙️ Генератор</span><b>→</b><span>🔋 100 000 кВт·ч</span><b>→</b><span>⚡ Подстанции</span></div></div>
      <div class="mn-nuclear-storage"><div><strong>Государственный накопитель</strong><span data-nuclear-storage-text>0 / 100 000 кВт·ч</span></div><progress data-nuclear-storage-progress max="100" value="0"></progress><small data-nuclear-free>Свободно: 100 000 кВт·ч</small></div>
      <div class="mn-nuclear-actions"><button type="button" data-nuclear-start>▶ Запустить</button><button type="button" data-nuclear-stop>■ Остановить</button><button type="button" class="is-danger" data-nuclear-discard>Утилизировать накопленное</button></div><p class="mn-nuclear-note">При заполнении накопителя АЭС автоматически остановится. Утилизация полностью очищает накопитель и доступна только администрации.</p></section>
      <section data-nuclear-page="contracts" hidden><h3>Государственные договоры поставки</h3><p class="mn-nuclear-note">Администрация назначает стоимость, сумму и дату окончания. В 00:00 выбранной даты поставка автоматически прекращается.</p><div class="mn-nuclear-contract"><input data-nuclear-target maxlength="80" placeholder="Публичный ID подстанции"><input data-nuclear-price type="number" min="0.01" step="0.01" value="2" placeholder="Цена за кВт·ч"><input data-nuclear-amount type="number" min="20000" max="2000000" value="20000" placeholder="Сумма договора"><input data-nuclear-end type="date"><button type="button" data-nuclear-contract-create>Предложить договор</button></div><div data-nuclear-contract-list></div></section>
    </main></section></div>`;
}

export function enableNuclearPowerFeature({root,cityId}={}) {
  if(!root)return()=>{};
  root.insertAdjacentHTML('beforeend',markup());
  const modal=root.querySelector('[data-nuclear-modal]');
  const q=(s)=>modal.querySelector(s),qa=(s)=>[...modal.querySelectorAll(s)];
  let currentId='',snapshot=null,snapshotAt=Date.now(),busy=false,accessChecking=false,liveTimer=0,resyncTimer=0;
  const setTab=(name)=>{qa('[data-nuclear-tab]').forEach(b=>b.classList.toggle('is-active',b.dataset.nuclearTab===name));qa('[data-nuclear-page]').forEach(p=>{p.hidden=p.dataset.nuclearPage!==name;});};
  const refresh=async()=>{snapshot=await loadNuclearSnapshot(currentId,cityId);snapshotAt=Date.now();render();};
  const run=async(task,success='')=>{if(busy)return;busy=true;modal.classList.add('is-busy');try{await task();await refresh();if(success)toast(success,'success');}catch(e){toast(getNuclearError(e),'error');}finally{busy=false;modal.classList.remove('is-busy');}};
  function render(){
    const s=snapshot||{},capacity=Number(s.capacityKwh||100000),rate=Number(s.generationPerSecond||10),base=Number(s.energyKwh||0),elapsed=s.running?Math.max(0,(Date.now()-snapshotAt)/1000):0,energy=Math.min(capacity,Math.floor(base+elapsed*rate)),generating=Boolean(s.running&&energy<capacity);
    modal.classList.toggle('is-generating',generating);
    q('[data-nuclear-status]').textContent=generating?'Работает':energy>=capacity?'Накопитель заполнен':'Остановлена';
    q('[data-nuclear-energy]').textContent=`${energy.toLocaleString('ru-RU')} / ${capacity.toLocaleString('ru-RU')} кВт·ч`;
    q('[data-nuclear-storage-text]').textContent=`${energy.toLocaleString('ru-RU')} / ${capacity.toLocaleString('ru-RU')} кВт·ч`;
    q('[data-nuclear-storage-progress]').value=capacity>0?(energy/capacity)*100:0;
    q('[data-nuclear-free]').textContent=`Свободно: ${Math.max(0,capacity-energy).toLocaleString('ru-RU')} кВт·ч`;
    q('[data-nuclear-rate]').textContent=`${rate.toLocaleString('ru-RU')} кВт·ч / сек.`;
    q('[data-nuclear-core-label]').textContent=generating?'Стабильная генерация':energy>=capacity?'Ожидание разгрузки сети':'Генерация остановлена';
    q('[data-nuclear-start]').disabled=busy||Boolean(s.running)||energy>=capacity;q('[data-nuclear-stop]').disabled=busy||!s.running;q('[data-nuclear-discard]').disabled=busy||energy<=0;
    q('[data-nuclear-contract-list]').innerHTML=(s.contracts||[]).length?(s.contracts||[]).map(c=>`<article><span><strong>${esc(c.targetId)}</strong><small>${c.status==='expired'?'Завершён':c.status==='active'?'Действует':'Ожидает решения'} · до ${contractDate(c.endsAt)}</small></span><b>${Number(c.unitPrice||0).toLocaleString('ru-RU')} ₴/кВт·ч</b><em>${formatBusinessMoney(c.contractAmount||0)}</em></article>`).join(''):'<p class="mn-nuclear-note">Договоров пока нет.</p>';
  }
  const stopLive=()=>{clearInterval(liveTimer);clearInterval(resyncTimer);liveTimer=0;resyncTimer=0;modal.classList.remove('is-generating');};
  const startLive=()=>{stopLive();liveTimer=setInterval(()=>{if(!modal.hidden&&snapshot)render();},250);resyncTimer=setInterval(()=>{if(!modal.hidden&&!busy&&currentId)refresh().catch(()=>{});},15000);};
  const close=()=>{modal.hidden=true;stopLive();};
  q('[data-nuclear-close]').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close();});
  const onKey=e=>{if(e.key==='Escape'&&!modal.hidden)close();};window.addEventListener('keydown',onKey);
  qa('[data-nuclear-tab]').forEach(b=>{b.onclick=()=>setTab(b.dataset.nuclearTab);});
  q('[data-nuclear-start]').onclick=()=>run(()=>setNuclearRunning(currentId,cityId,true),'Генерация АЭС запущена.');
  q('[data-nuclear-stop]').onclick=()=>run(()=>setNuclearRunning(currentId,cityId,false),'Генерация АЭС остановлена.');
  q('[data-nuclear-discard]').onclick=()=>{if(window.confirm('Полностью утилизировать всю накопленную электроэнергию АЭС?'))run(()=>discardNuclearEnergy(currentId,cityId),'Накопленная энергия утилизирована.');};
  const nuclearEnd=q('[data-nuclear-end]');if(nuclearEnd){nuclearEnd.min=new Date(Date.now()+86400000).toISOString().slice(0,10);nuclearEnd.value=defaultEndDate();}
  q('[data-nuclear-contract-create]').onclick=()=>run(()=>createNuclearContract(currentId,cityId,{targetId:q('[data-nuclear-target]').value,unitPrice:Number(q('[data-nuclear-price]').value),contractAmount:Number(q('[data-nuclear-amount]').value),endDate:q('[data-nuclear-end]').value}),'Договор сохранён.');
  const onAction=async(event)=>{
    const object=event.detail?.object;
    if(String(object?.type||object?.payload?.jobType||'')!=='nuclear_power_plant'||accessChecking)return;
    currentId=plantIdOf(object);
    if(!currentId)return;
    accessChecking=true;
    try{
      // Серверная RPC-проверка является окончательной: панель показывается
      // только после успешного admin-only snapshot.
      snapshot=await loadNuclearSnapshot(currentId,cityId);
      snapshotAt=Date.now();
      setTab('station');
      render();
      modal.hidden=false;
      startLive();
    }catch(error){
      close();
      const message=getNuclearError(error);
      toast(message.includes('администрац')?'У вас нет доступа к управлению государственным объектом':message,'error');
    }finally{accessChecking=false;}
  };
  window.addEventListener('mn:nuclear-power-object-action',onAction);
  return()=>{stopLive();window.removeEventListener('keydown',onKey);window.removeEventListener('mn:nuclear-power-object-action',onAction);modal.remove();};
}
