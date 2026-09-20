import './coalPower.css';
import { formatBusinessMoney } from '../business/businessConfig.js';
import {
  loadCoalPowerSnapshot,
  purchaseCoalPowerPlant,
  purchaseCoalPowerEquipment,
  loadCoalPowerFuel,
  startCoalPowerPlant,
  stopCoalPowerPlant,
  discardCoalPowerEnergy,
  createCoalPowerContract,
  getCoalPowerError,
} from './coalPowerApi.js';

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const notify = (message, type = 'info') => window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
const plantIdOf = (object) => String(object?.payload?.coalPlantId || object?.payload?.coal_plant_id || object?.id || '').trim();
const equipment = [
  ['storage', '🔋', 'Накопитель 12 500 кВт·ч', 10_000_000, 'Хранение произведённой электроэнергии'],
  ['transmission', '⚡', 'Провода и линии передачи', 1_000_000, 'Передача энергии будущим подстанциям'],
  ['fuses', '🛡️', 'Промышленные предохранители', 2_500_000, 'Защита станции и энергосети'],
];

function markup() {
  return `<div class="mn-coal-backdrop" data-coal-power-modal hidden><section class="mn-coal-panel">
    <header><div><small>ЧАСТНОЕ ЭНЕРГЕТИЧЕСКОЕ ПРЕДПРИЯТИЕ</small><h2>🏭 Угольная электростанция</h2><p>Уголь → котёл → турбина → генератор → накопитель → подстанции</p></div><button type="button" data-coal-power-close aria-label="Закрыть">×</button></header>
    <nav><button type="button" class="is-active" data-coal-power-tab="station">Станция</button><button type="button" data-coal-power-tab="infrastructure">Инфраструктура</button><button type="button" data-coal-power-tab="contracts">Контракты</button></nav>
    <main>
      <section data-coal-power-page="station"><div class="mn-coal-stats"><article><small>Статус</small><strong data-coal-power-status>Загрузка…</strong></article><article><small>Энергия</small><strong data-coal-power-energy>—</strong></article><article><small>Уголь на станции</small><strong data-coal-power-coal>—</strong></article><article><small>Выработка</small><strong>1,5 кВт·ч / сек.</strong></article></div>
      <div class="mn-coal-core"><div class="mn-coal-smoke"><i></i><i></i><i></i></div><div class="mn-coal-machine"><b>🔥</b><span><strong>Котёл и турбогенератор</strong><small data-coal-power-core-label>Ожидает запуска</small></span></div><div class="mn-coal-flow"><span>⚫ Уголь</span><b>→</b><span>🔥 Котёл</span><b>→</b><span>⚙️ Турбина</span><b>→</b><span>🔋 Накопитель</span></div></div>
      <div class="mn-coal-storage"><div><strong>Накопитель</strong><span data-coal-power-storage-text>0 / 12 500 кВт·ч</span></div><progress data-coal-power-storage-progress max="100" value="0"></progress><small data-coal-power-free>Свободно: 12 500 кВт·ч</small></div>
      <div class="mn-coal-actions"><button type="button" data-coal-power-start>▶ Запустить УЭС</button><button type="button" data-coal-power-stop>■ Остановить</button><button type="button" class="is-danger" data-coal-power-discard>Утилизировать накопленное</button></div><p class="mn-coal-note" data-coal-power-note>Для запуска купите инфраструктуру и загрузите минимум 20 единиц угля.</p></section>
      <section data-coal-power-page="infrastructure" hidden><div class="mn-coal-buy" data-coal-power-buy><span><small>ГОСУДАРСТВЕННАЯ УЭС</small><strong>20 000 000 ₴</strong><p>После покупки станция станет частным предприятием.</p></span><button type="button" data-coal-power-purchase>Купить предприятие</button></div><div data-coal-power-owned hidden><h3>Обязательная инфраструктура</h3><div class="mn-coal-equipment">${equipment.map(([id, icon, title, price, description]) => `<article><i>${icon}</i><span><strong>${title}</strong><small>${description}</small><b>${formatBusinessMoney(price)}</b></span><button type="button" data-coal-power-equipment="${id}">Купить</button></article>`).join('')}</div><div class="mn-coal-fuel"><span><strong>⚫ Загрузить обыкновенный уголь</strong><small>Расход: 20 угля на 10 кВт·ч. На час работы при мощности 1,5 кВт·ч/сек требуется 10 800 угля.</small><b>В вашем инвентаре: <em data-coal-power-player-coal>0</em></b></span><input data-coal-power-load-quantity type="number" min="1" step="1" value="10800"><button type="button" data-coal-power-load>Загрузить</button></div><div class="mn-coal-owner"><span>Владелец: <b data-coal-power-owner>—</b></span><span>Публичный ID: <b data-coal-power-public-id>—</b></span></div></div></section>
      <section data-coal-power-page="contracts" hidden><h3>Контракты с подстанциями</h3><p class="mn-coal-note">Владелец назначает цену кВт·ч и подготавливает договор. Реальная передача включится вместе с модулем подстанций.</p><div class="mn-coal-contract"><input data-coal-power-target maxlength="80" placeholder="ID подстанции"><input data-coal-power-price type="number" min="0.01" step="0.01" value="2" placeholder="Цена за кВт·ч"><input data-coal-power-amount type="number" min="20000" max="2000000" value="20000" placeholder="Сумма договора"><button type="button" data-coal-power-contract-create>Сохранить договор</button></div><div data-coal-power-contract-list></div></section>
    </main></section></div>`;
}

export function enableCoalPowerFeature({ root, cityId } = {}) {
  if (!root) return () => {};
  root.insertAdjacentHTML('beforeend', markup());
  const modal = root.querySelector('[data-coal-power-modal]');
  const q = (selector) => modal.querySelector(selector);
  const qa = (selector) => [...modal.querySelectorAll(selector)];
  let currentId = '', snapshot = null, snapshotAt = Date.now(), busy = false, liveTimer = 0, resyncTimer = 0;
  const setTab = (name) => { qa('[data-coal-power-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.coalPowerTab === name)); qa('[data-coal-power-page]').forEach((page) => { page.hidden = page.dataset.coalPowerPage !== name; }); };
  const refresh = async () => { snapshot = await loadCoalPowerSnapshot(currentId, cityId); snapshotAt = Date.now(); render(); };
  const run = async (task, success = '') => { if (busy) return; busy = true; modal.classList.add('is-busy'); try { await task(); await refresh(); if (success) notify(success, 'success'); } catch (error) { notify(getCoalPowerError(error), 'error'); } finally { busy = false; modal.classList.remove('is-busy'); } };

  function liveValues() {
    const state = snapshot || {};
    const capacity = Number(state.capacityKwh || 12500);
    const rate = Number(state.generationPerSecond || 1.5);
    const coalPerKwh = Number(state.coalPerKwh || 2);
    const baseEnergy = Math.max(0, Number(state.energyKwh || 0));
    const baseCoal = Math.max(0, Number(state.coalQuantity || 0));
    const elapsed = state.running ? Math.max(0, (Date.now() - snapshotAt) / 1000) : 0;
    const produced = Math.max(0, Math.min(elapsed * rate, capacity - baseEnergy, baseCoal / coalPerKwh));
    return { capacity, rate, coalPerKwh, energy: Math.min(capacity, baseEnergy + produced), coal: Math.max(0, baseCoal - produced * coalPerKwh) };
  }

  function render() {
    const state = snapshot || {}, plant = state.plant || {}, installed = state.equipment || {};
    const { capacity, energy, coal } = liveValues();
    const generating = Boolean(state.running && energy < capacity && coal > 0);
    modal.classList.toggle('is-generating', generating);
    q('[data-coal-power-status]').textContent = !plant.ownerId ? 'Продаётся' : generating ? 'Работает' : energy >= capacity ? 'Накопитель заполнен' : coal <= 0 ? 'Нет угля' : 'Готова к запуску';
    q('[data-coal-power-energy]').textContent = `${Math.floor(energy).toLocaleString('ru-RU')} / ${capacity.toLocaleString('ru-RU')} кВт·ч`;
    q('[data-coal-power-coal]').textContent = `${Math.floor(coal).toLocaleString('ru-RU')} ед.`;
    q('[data-coal-power-storage-text]').textContent = `${Math.floor(energy).toLocaleString('ru-RU')} / ${capacity.toLocaleString('ru-RU')} кВт·ч`;
    q('[data-coal-power-storage-progress]').value = capacity > 0 ? energy / capacity * 100 : 0;
    q('[data-coal-power-free]').textContent = `Свободно: ${Math.max(0, Math.floor(capacity - energy)).toLocaleString('ru-RU')} кВт·ч`;
    q('[data-coal-power-core-label]').textContent = generating ? 'Идёт выработка электроэнергии' : energy >= capacity ? 'Требуется разгрузка накопителя' : coal < 20 ? 'Загрузите минимум 20 угля' : 'Ожидает запуска';
    q('[data-coal-power-note]').textContent = generating ? 'УЭС вырабатывает 1,5 кВт·ч/сек. и расходует 3 единицы угля в секунду.' : 'Для запуска нужны все три узла инфраструктуры и минимум 20 единиц обыкновенного угля.';
    q('[data-coal-power-buy]').hidden = Boolean(plant.ownerId); q('[data-coal-power-owned]').hidden = !plant.ownerId;
    q('[data-coal-power-owner]').textContent = plant.ownerName || 'Государство'; q('[data-coal-power-public-id]').textContent = state.publicId || '—';
    q('[data-coal-power-player-coal]').textContent = Number(state.playerCoalQuantity || 0).toLocaleString('ru-RU');
    q('[data-coal-power-start]').disabled = busy || !state.isOwner || Boolean(state.running) || energy >= capacity;
    q('[data-coal-power-stop]').disabled = busy || !state.isOwner || !state.running;
    q('[data-coal-power-discard]').disabled = busy || !state.isOwner || energy <= 0;
    q('[data-coal-power-load]').disabled = busy || !state.isOwner;
    qa('[data-coal-power-equipment]').forEach((button) => { const done = Boolean(installed[button.dataset.coalPowerEquipment]); button.disabled = busy || !state.isOwner || done; button.textContent = done ? 'Куплено' : 'Купить'; });
    q('[data-coal-power-contract-create]').disabled = busy || !state.isOwner;
    q('[data-coal-power-contract-list]').innerHTML = (state.contracts || []).length ? state.contracts.map((contract) => `<article><span><strong>${esc(contract.targetId)}</strong><small>Будущая подстанция</small></span><b>${Number(contract.unitPrice || 0).toLocaleString('ru-RU')} ₴/кВт·ч</b><em>${formatBusinessMoney(contract.contractAmount || 0)}</em></article>`).join('') : '<p class="mn-coal-note">Договоров пока нет.</p>';
  }

  const stopLive = () => { window.clearInterval(liveTimer); window.clearInterval(resyncTimer); liveTimer = 0; resyncTimer = 0; modal.classList.remove('is-generating'); };
  const startLive = () => { stopLive(); liveTimer = window.setInterval(() => { if (!modal.hidden && snapshot) render(); }, 250); resyncTimer = window.setInterval(() => { if (!modal.hidden && !busy && currentId) refresh().catch(() => {}); }, 15000); };
  const close = () => { modal.hidden = true; stopLive(); };
  q('[data-coal-power-close]').onclick = close;
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  const onKey = (event) => { if (event.key === 'Escape' && !modal.hidden) close(); };
  window.addEventListener('keydown', onKey);
  qa('[data-coal-power-tab]').forEach((button) => { button.onclick = () => setTab(button.dataset.coalPowerTab); });
  q('[data-coal-power-purchase]').onclick = () => run(() => purchaseCoalPowerPlant(currentId, cityId), 'УЭС приобретена.');
  qa('[data-coal-power-equipment]').forEach((button) => { button.onclick = () => run(() => purchaseCoalPowerEquipment(currentId, cityId, button.dataset.coalPowerEquipment), 'Оборудование установлено.'); });
  q('[data-coal-power-load]').onclick = () => run(() => loadCoalPowerFuel(currentId, cityId, Number(q('[data-coal-power-load-quantity]').value)), 'Уголь загружен на станцию.');
  q('[data-coal-power-start]').onclick = () => run(() => startCoalPowerPlant(currentId, cityId), 'УЭС запущена.');
  q('[data-coal-power-stop]').onclick = () => run(() => stopCoalPowerPlant(currentId, cityId), 'УЭС остановлена.');
  q('[data-coal-power-discard]').onclick = () => { if (window.confirm('Полностью утилизировать накопленную электроэнергию УЭС?')) run(() => discardCoalPowerEnergy(currentId, cityId), 'Накопленная энергия утилизирована.'); };
  q('[data-coal-power-contract-create]').onclick = () => run(() => createCoalPowerContract(currentId, cityId, { targetId: q('[data-coal-power-target]').value, unitPrice: Number(q('[data-coal-power-price]').value), contractAmount: Number(q('[data-coal-power-amount]').value) }), 'Договор сохранён.');
  const onAction = (event) => { const object = event.detail?.object; const rawType = String(object?.type || ''); const objectType = rawType === 'marker' ? String(object?.payload?.jobType || object?.payload?.type || rawType) : String(rawType || object?.payload?.jobType || object?.payload?.type || ''); if (objectType !== 'coal_power_plant') return; currentId = plantIdOf(object); if (!currentId) return; modal.hidden = false; setTab('station'); startLive(); refresh().catch((error) => notify(getCoalPowerError(error), 'error')); };
  window.addEventListener('mn:coal-power-object-action', onAction);
  return () => { stopLive(); window.removeEventListener('keydown', onKey); window.removeEventListener('mn:coal-power-object-action', onAction); modal.remove(); };
}
