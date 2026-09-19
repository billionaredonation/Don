import './hydroPower.css';
import { formatBusinessMoney, getBusinessLegalPayload } from '../business/businessConfig.js';
import { getPublicBusinessId } from '../business/publicBusinessId.js';
import { loadHydroSnapshot, purchaseHydroPlant, purchaseHydroEquipment, startHydroPlant, stopHydroPlant, repairHydroPlant, createHydroContract, getHydroError } from './hydroPowerApi.js';

const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const notify = (message, type = 'info') => window.dispatchEvent(new CustomEvent('mn:game-toast', { detail: { message, type } }));
const plantIdOf = (o) => String(o?.payload?.hydroPlantId || o?.payload?.hydro_plant_id || o?.id || '').trim();
const equipment = [
  ['storage', '🔋', 'Промышленный накопитель', 10_000_000, 'Ёмкость: до 10 000 кВт·ч'],
  ['transmission', '⚡', 'Линии электропередачи', 1_000_000, 'Передача энергии подстанциям'],
  ['fuses', '🛡️', 'Предохранители', 2_500_000, 'Защита сети при авариях'],
];

function markup() {
  return `<div class="mn-hydro-backdrop" data-hydro-modal hidden><section class="mn-hydro-panel">
    <header><div><small>ЭНЕРГЕТИЧЕСКОЕ ПРЕДПРИЯТИЕ</small><h2>Гидроэлектростанция</h2><p>Турбины у воды → генерация → накопитель → ЛЭП → будущие подстанции</p></div><button data-hydro-close aria-label="Закрыть">×</button></header>
    <nav><button class="is-active" data-hydro-tab="overview">Станция</button><button data-hydro-tab="infrastructure">Инфраструктура</button><button data-hydro-tab="contracts">Контракты</button></nav>
    <main>
      <section data-hydro-page="overview"><div class="mn-hydro-stats"><article><small>Статус</small><strong data-hydro-status>Загрузка…</strong></article><article><small>Энергия</small><strong data-hydro-energy>—</strong></article><article><small>Состояние</small><strong data-hydro-condition>—</strong></article><article><small>Выработка</small><strong>1 кВт·ч / сек.</strong></article></div>
      <div class="mn-hydro-flow"><span>🌊 Вода</span><b>→</b><span>⚙️ Турбины</span><b>→</b><span>🔋 Накопитель</span><b>→</b><span>⚡ Подстанции</span></div>
      <div class="mn-hydro-actions"><button data-hydro-start>Запустить ГЭС</button><button data-hydro-stop>Остановить</button><button data-hydro-repair>Ремонт · 1 000 ₴</button></div>
      <p class="mn-hydro-note" data-hydro-note>Сервер считает энергию по реальному прошедшему времени только при открытии или действии — постоянного тика и нагрузки на ОЗУ нет.</p></section>
      <section data-hydro-page="infrastructure" hidden><div class="mn-hydro-buy" data-hydro-buy><span><small>ГОСУДАРСТВЕННАЯ ГЭС</small><strong>25 000 000 ₴</strong><p>Юридическая форма задаётся администрацией: <b data-hydro-legal>—</b></p></span><button data-hydro-purchase>Купить предприятие</button></div><div data-hydro-owned hidden><h3>Обязательное оборудование запуска</h3><div class="mn-hydro-equipment">${equipment.map(([id, icon, title, price, description]) => `<article><i>${icon}</i><span><strong>${title}</strong><small>${description}</small><b>${formatBusinessMoney(price)}</b></span><button data-hydro-equipment="${id}">Купить</button></article>`).join('')}</div><p class="mn-hydro-note">Без всех трёх узлов запуск заблокирован. Это не декор: накопитель определяет лимит, ЛЭП — возможность будущих поставок, а предохранители — защиту сети.</p><div class="mn-hydro-owner"><span>Владелец: <b data-hydro-owner>—</b></span><span>Публичный ID: <b data-hydro-public-id>—</b></span></div></div></section>
      <section data-hydro-page="contracts" hidden><h3>Договоры с подстанциями</h3><p class="mn-hydro-note">Подстанции появятся следующим блоком. Уже сейчас договор хранит цену 1 кВт·ч и сумму от 20 000 до 2 000 000 ₴; когда появятся подстанции, одна ГЭС сможет питать несколько по доступной мощности.</p><div class="mn-hydro-contract"><input data-hydro-target placeholder="ID будущей подстанции" maxlength="80"><input data-hydro-price type="number" min="1" value="2" placeholder="Цена за кВт·ч"><input data-hydro-amount type="number" min="20000" max="2000000" value="20000" placeholder="Сумма контракта"><button data-hydro-contract-create>Подготовить контракт</button></div><div data-hydro-contract-list></div></section>
    </main></section></div>`;
}

export function enableHydroPowerFeature({ root, cityId } = {}) {
  root.insertAdjacentHTML('beforeend', markup());
  const modal = root.querySelector('[data-hydro-modal]'); let currentId = '', snapshot = null, busy = false;
  const q = (s) => modal.querySelector(s), qa = (s) => [...modal.querySelectorAll(s)];
  const tab = (name) => { qa('[data-hydro-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.hydroTab === name)); qa('[data-hydro-page]').forEach(p => p.hidden = p.dataset.hydroPage !== name); };
  const refresh = async () => { snapshot = await loadHydroSnapshot(currentId, cityId); render(); };
  const run = async (task) => { if (busy) return; busy=true; modal.classList.add('is-busy'); try { await task(); await refresh(); } catch(e) { notify(getHydroError(e), 'error'); } finally { busy=false; modal.classList.remove('is-busy'); } };
  function render() {
    const s=snapshot||{}, plant=s.plant||{}, installed=s.equipment||{}, energy=Math.floor(Number(s.energyKwh||0)), capacity=Number(s.capacityKwh||10000), condition=Math.max(0,Math.floor(Number(s.condition||0))), maxCondition=Number(s.maxCondition||4000);
    q('[data-hydro-status]').textContent = !plant.ownerId ? 'Государственная' : s.running ? 'Работает' : condition <= 0 ? 'Остановлена · нужен ремонт' : 'Готова к запуску';
    q('[data-hydro-energy]').textContent = `${energy.toLocaleString('ru-RU')} / ${capacity.toLocaleString('ru-RU')} кВт·ч`;
    q('[data-hydro-condition]').textContent = `${condition.toLocaleString('ru-RU')} / ${maxCondition.toLocaleString('ru-RU')}`;
    q('[data-hydro-buy]').hidden=Boolean(plant.ownerId); q('[data-hydro-owned]').hidden=!plant.ownerId;
    q('[data-hydro-owner]').textContent=plant.ownerName||'Государство'; q('[data-hydro-public-id]').textContent=s.publicId||'—';
    q('[data-hydro-start]').disabled=!s.isOwner || Boolean(s.running); q('[data-hydro-stop]').disabled=!s.isOwner || !s.running; q('[data-hydro-repair]').disabled=!s.isOwner;
    q('[data-hydro-note]').textContent = s.running ? 'ГЭС генерирует 1 кВт·ч/сек. Каждый произведённый кВт·ч списывает 0,2 состояния: 720 в час.' : 'Для запуска купите три обязательных узла инфраструктуры. Энергия не пропадает: лимит задаёт накопитель.';
    qa('[data-hydro-equipment]').forEach(b => { const done=Boolean(installed[b.dataset.hydroEquipment]); b.disabled=!s.isOwner||done; b.textContent=done?'Куплено':'Купить'; });
    q('[data-hydro-contract-list]').innerHTML=(s.contracts||[]).length ? (s.contracts||[]).map(c=>`<article class="mn-hydro-contract-row"><b>${esc(c.targetId)}</b><span>${Number(c.unitPrice||0)} ₴/кВт·ч · лимит ${formatBusinessMoney(c.contractAmount||0)}</span><small>Ожидает появления подстанции</small></article>`).join('') : '<p class="mn-hydro-note">Контрактов пока нет.</p>';
  }
  q('[data-hydro-close]').onclick=()=>{modal.hidden=true;}; qa('[data-hydro-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.hydroTab));
  q('[data-hydro-purchase]').onclick=()=>run(()=>purchaseHydroPlant(currentId, cityId)); q('[data-hydro-start]').onclick=()=>run(()=>startHydroPlant(currentId, cityId)); q('[data-hydro-stop]').onclick=()=>run(()=>stopHydroPlant(currentId, cityId)); q('[data-hydro-repair]').onclick=()=>run(()=>repairHydroPlant(currentId, cityId));
  qa('[data-hydro-equipment]').forEach(b=>b.onclick=()=>run(()=>purchaseHydroEquipment(currentId, cityId, b.dataset.hydroEquipment)));
  q('[data-hydro-contract-create]').onclick=()=>run(()=>createHydroContract(currentId, cityId,{ targetId:q('[data-hydro-target]').value, unitPrice:Number(q('[data-hydro-price]').value), contractAmount:Number(q('[data-hydro-amount]').value) }));
  const onAction=(event)=>{const object=event.detail?.object; if(String(object?.type||object?.payload?.jobType||'')!=='hydro_power_plant')return; currentId=plantIdOf(object); modal.hidden=false; tab('overview'); run(async()=>{snapshot=await loadHydroSnapshot(currentId,cityId);render();});};
  window.addEventListener('mn:hydro-power-object-action',onAction); return ()=>{window.removeEventListener('mn:hydro-power-object-action',onAction);modal.remove();};
}
