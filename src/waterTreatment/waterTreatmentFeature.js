import './waterTreatment.css';
import {
  loadWaterTreatment,
  buyWaterTreatment,
  buyWaterEquipment,
  startWaterTreatment,
  stopWaterTreatment,
  withdrawWaterTreatment,
  offerHouseWater,
  getWaterError,
} from './waterTreatmentApi.js';

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const money = (value) => `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`;
const liters = (value) => `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} л`;
const notify = (message, type = 'info') => window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
const plantIdOf = (object) => String(object?.payload?.waterTreatmentPlantId || object?.payload?.water_treatment_plant_id || object?.id || '').trim();

const equipment = [
  ['collection', '🌊', 'Система сбора воды', 2_500_000, 'Водозабор у рек, озёр и водохранилищ'],
  ['purification', '🧪', 'Система очистки воды', 4_000_000, 'Превращает сырую воду в питьевую'],
  ['transport', '🚰', 'Система транспортировки', 4_000_000, 'Подаёт очищенную воду подключённым домам'],
];

function shell() {
  return `<div class="mn-water-backdrop" data-water-modal hidden><section class="mn-water-panel">
    <header><div><small>КОММУНАЛЬНОЕ ПРЕДПРИЯТИЕ</small><h2>Водоочистное сооружение</h2><p>Водоём → водозабор → очистка → резервуар → водопровод → дома</p></div><button data-water-close aria-label="Закрыть">×</button></header>
    <nav><button class="is-active" data-water-tab="overview">Предприятие</button><button data-water-tab="equipment">Системы</button><button data-water-tab="consumers">Абоненты</button></nav>
    <main data-water-content></main>
  </section></div>`;
}

export function enableWaterTreatmentFeature({ root, cityId } = {}) {
  if (!root) return () => {};
  root.insertAdjacentHTML('beforeend', shell());

  const modal = root.querySelector('[data-water-modal]');
  const content = modal.querySelector('[data-water-content]');
  let currentId = '';
  let activeTab = 'overview';
  let snapshot = null;
  let busy = false;
  let liveTimer = 0;
  let lastBalance = null;
  const consumerDraft = { houseId: '', unitPrice: '10' };

  const isEditingField = () => {
    const active = document.activeElement;
    return Boolean(active && modal.contains(active) && active.matches?.('input, textarea, select, [contenteditable="true"]'));
  };

  const syncBalance = (result) => {
    const balance = Number(result?.playerBalance);
    if (!Number.isFinite(balance) || (lastBalance !== null && Math.abs(lastBalance - balance) < 0.005)) return;
    lastBalance = balance;
    window.dispatchEvent(new CustomEvent('mn:player-balance-changed', { detail: { balance, source: 'water_treatment' } }));
  };

  const setTab = (name) => {
    activeTab = name;
    modal.querySelectorAll('[data-water-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.waterTab === name));
    render();
  };

  const refresh = async () => {
    snapshot = await loadWaterTreatment(currentId, cityId);
    syncBalance(snapshot);
    render();
  };

  const run = async (task, success = '') => {
    if (busy) return;
    busy = true;
    modal.querySelector('.mn-water-panel')?.classList.add('is-busy');
    try {
      const result = await task();
      syncBalance(result);
      await refresh();
      if (success) notify(success, 'success');
    } catch (error) {
      notify(getWaterError(error), 'error');
    } finally {
      busy = false;
      modal.querySelector('.mn-water-panel')?.classList.remove('is-busy');
    }
  };

  function overview() {
    const s = snapshot || {};
    const plant = s.plant || {};
    if (!plant.ownerId) {
      return `<section class="mn-water-page"><div class="mn-water-buy"><span><small>ГОСУДАРСТВЕННОЕ ВОДООЧИСТНОЕ СООРУЖЕНИЕ</small><strong>10 000 000 ₴</strong><p>После покупки установите три обязательные системы и запустите предприятие.</p></span><button data-water-purchase>Купить предприятие</button></div></section>`;
    }

    const ready = Boolean(s.equipment?.collection && s.equipment?.purification && s.equipment?.transport);
    const running = Boolean(s.running);
    const clean = Math.max(0, Number(s.cleanWaterLiters) || 0);
    const capacity = Math.max(1, Number(s.cleanCapacityLiters) || 25_000);
    const status = running ? (clean >= capacity ? 'Резервуар заполнен' : 'Сбор и очистка работают') : ready ? 'Готово к запуску' : 'Нужны обязательные системы';
    return `<section class="mn-water-page">
      <div class="mn-water-stats"><article><small>Статус</small><strong>${esc(status)}</strong></article><article><small>Сырая вода</small><strong>${liters(s.rawWaterLiters)}</strong></article><article><small>Питьевая вода</small><strong>${liters(clean)} / ${liters(capacity)}</strong></article><article><small>Абоненты</small><strong>${Number(s.subscriberCount || 0)} / 10</strong></article></div>
      <div class="mn-water-flow"><span><i>🌊</i> Водоём</span><b>→</b><span><i>⚙️</i> Водозабор</span><b>→</b><span><i>🧪</i> Очистка</span><b>→</b><span><i>💧</i> Резервуар</span><b>→</b><span><i>🏠</i> Дома</span></div>
      <div class="mn-water-ledger"><article><small>Собрано всего</small><b>${liters(s.totalCollectedLiters)}</b></article><article><small>Очищено</small><b>${liters(s.totalCleanedLiters)}</b></article><article><small>Поставлено домам</small><b>${liters(s.totalDeliveredLiters)}</b></article><article><small>Счёт предприятия</small><b>${money(s.cashBalance)}</b></article></div>
      <div class="mn-water-actions"><button data-water-start ${!s.isOwner || running || !ready ? 'disabled' : ''}>Запустить</button><button data-water-stop ${!s.isOwner || !running ? 'disabled' : ''}>Остановить</button><input data-water-withdraw type="number" min="1" value="1000" placeholder="Сумма"><button data-water-withdraw-button ${s.isOwner ? '' : 'disabled'}>Снять прибыль</button></div>
      <div class="mn-water-public-id"><span><small>Публичный ID предприятия</small><code>${esc(s.publicId || plant.id || '—')}</code></span><button data-water-copy>Копировать</button></div>
      <p class="mn-water-note">Сбор: ${liters(s.collectionLitersPerHour || 150)}/ч · очистка: ${liters(s.purificationLitersPerHour || 100)}/ч. Расчёт выполняется по реально прошедшему времени без постоянного серверного тика.</p>
    </section>`;
  }

  function equipmentView() {
    const s = snapshot || {};
    const plant = s.plant || {};
    if (!plant.ownerId) return overview();
    return `<section class="mn-water-page"><h3>Обязательные системы запуска</h3><div class="mn-water-equipment">${equipment.map(([id, icon, title, price, description]) => {
      const installed = Boolean(s.equipment?.[id]);
      return `<article><i>${icon}</i><span><strong>${title}</strong><small>${description}</small><b>${money(price)}</b></span><button data-water-equipment="${id}" ${!s.isOwner || installed ? 'disabled' : ''}>${installed ? 'Установлено' : 'Купить'}</button></article>`;
    }).join('')}</div><p class="mn-water-note">Предприятие не запускается, пока не куплены все три системы. Общая инфраструктура запуска стоит 10 500 000 ₴ сверх цены самого предприятия.</p></section>`;
  }

  function consumersView() {
    const s = snapshot || {};
    const consumers = Array.isArray(s.consumers) ? s.consumers : [];
    const openCount = consumers.filter((item) => item.status === 'active' || item.status === 'offered').length;
    const ready = Boolean(s.equipment?.collection && s.equipment?.purification && s.equipment?.transport);
    return `<section class="mn-water-page"><div class="mn-water-consumer-heading"><div><h3>Водоснабжение домов</h3><p>Подключение стоит фиксированные 1 000 ₴. Тариф задаёт владелец, но не ниже 10 ₴ за литр.</p></div><span>${openCount}/10 мест</span></div>
      ${s.isOwner ? `<div class="mn-water-offer"><input data-water-house maxlength="120" value="${esc(consumerDraft.houseId)}" placeholder="Публичный ID дома"><input data-water-price type="number" min="10" step="0.01" value="${esc(consumerDraft.unitPrice)}" placeholder="₴ за литр"><button data-water-offer ${openCount >= 10 || !ready ? 'disabled' : ''}>${ready ? 'Предложить договор' : 'Сначала установите все системы'}</button></div>` : ''}
      <div class="mn-water-consumers">${consumers.length ? consumers.map((item) => `<article><span><small>Дом ${esc(item.houseName || item.houseId)} · ${esc(item.consumerName || 'владелец')}</small><strong>${item.status === 'active' ? item.waterActive ? '💧 Вода поступает' : '⛔ Подача остановлена' : item.status === 'offered' ? '⏳ Ожидает решения' : 'Отказ'}</strong></span><span><small>Тариф</small><b>${money(item.unitPrice)} / л</b></span><span><small>Расход дома</small><b>${item.status === 'active' ? `${liters(item.dailyLiters)} / сутки` : 'Определится при подключении'}</b></span><span><small>Долг</small><b>${money(item.amountDue)}</b></span></article>`).join('') : '<div class="mn-water-empty">Абонентов пока нет.</div>'}</div>
    </section>`;
  }

  function bind() {
    const houseField = content.querySelector('[data-water-house]');
    const priceField = content.querySelector('[data-water-price]');
    houseField?.addEventListener('input', () => { consumerDraft.houseId = houseField.value; });
    priceField?.addEventListener('input', () => { consumerDraft.unitPrice = priceField.value; });
    content.querySelector('[data-water-purchase]')?.addEventListener('click', () => run(() => buyWaterTreatment(currentId, cityId), 'Водоочистное сооружение приобретено.'));
    content.querySelectorAll('[data-water-equipment]').forEach((button) => button.addEventListener('click', () => run(() => buyWaterEquipment(currentId, cityId, button.dataset.waterEquipment), 'Система установлена.')));
    content.querySelector('[data-water-start]')?.addEventListener('click', () => run(() => startWaterTreatment(currentId, cityId), 'Сбор и очистка воды запущены.'));
    content.querySelector('[data-water-stop]')?.addEventListener('click', () => run(() => stopWaterTreatment(currentId, cityId), 'Предприятие остановлено.'));
    content.querySelector('[data-water-withdraw-button]')?.addEventListener('click', () => run(() => withdrawWaterTreatment(currentId, cityId, Number(content.querySelector('[data-water-withdraw]')?.value)), 'Прибыль выведена.'));
    content.querySelector('[data-water-copy]')?.addEventListener('click', async () => {
      const id = String(snapshot?.publicId || snapshot?.plant?.id || '');
      try { await navigator.clipboard.writeText(id); notify('Публичный ID скопирован.', 'success'); } catch { window.prompt('Скопируйте ID:', id); }
    });
    content.querySelector('[data-water-offer]')?.addEventListener('click', () => {
      const houseId = String(houseField?.value || '').trim();
      const unitPrice = Number(priceField?.value);
      if (!houseId) { notify('Введите публичный ID дома.', 'error'); return; }
      if (!Number.isFinite(unitPrice) || unitPrice < 10) { notify('Цена воды должна быть не меньше 10 ₴ за литр.', 'error'); return; }
      run(() => offerHouseWater(currentId, cityId, houseId, unitPrice), 'Предложение отправлено владельцу дома.');
    });
  }

  function render() {
    modal.classList.toggle('is-running', Boolean(snapshot?.running));
    content.innerHTML = activeTab === 'equipment' ? equipmentView() : activeTab === 'consumers' ? consumersView() : overview();
    bind();
  }

  const close = () => { modal.hidden = true; window.clearInterval(liveTimer); liveTimer = 0; };
  modal.querySelector('[data-water-close]').addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  modal.querySelectorAll('[data-water-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.waterTab)));
  const stopGameKeysWhileTyping = (event) => {
    if (!event.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    if (/^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|ShiftLeft|ShiftRight)$/.test(event.code)) {
      event.stopPropagation();
    }
  };
  content.addEventListener('keydown', stopGameKeysWhileTyping);
  content.addEventListener('keyup', stopGameKeysWhileTyping);
  const onKey = (event) => { if (event.key === 'Escape' && !modal.hidden) close(); };
  window.addEventListener('keydown', onKey);

  const onAction = async (event) => {
    const object = event.detail?.object;
    const rawType = String(object?.type || '');
    const type = rawType === 'marker' ? String(object?.payload?.jobType || object?.payload?.type || rawType) : rawType;
    if (type !== 'water_treatment_plant') return;
    const nextId = plantIdOf(object);
    if (nextId !== currentId) {
      consumerDraft.houseId = '';
      consumerDraft.unitPrice = '10';
    }
    currentId = nextId;
    if (!currentId) return;
    activeTab = 'overview';
    modal.querySelectorAll('[data-water-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.waterTab === activeTab));
    modal.hidden = false;
    content.innerHTML = '<div class="mn-water-empty">Загрузка…</div>';
    try {
      await refresh();
      window.clearInterval(liveTimer);
      liveTimer = window.setInterval(() => {
        if (!modal.hidden && !busy && !isEditingField()) refresh().catch(() => {});
      }, 5000);
    } catch (error) {
      modal.hidden = true;
      notify(getWaterError(error), 'error');
    }
  };

  window.addEventListener('mn:water-treatment-object-action', onAction);
  return () => {
    window.clearInterval(liveTimer);
    content.removeEventListener('keydown', stopGameKeysWhileTyping);
    content.removeEventListener('keyup', stopGameKeysWhileTyping);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('mn:water-treatment-object-action', onAction);
    modal.remove();
  };
}
