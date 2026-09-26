import './ukrGaz.css';
import {
  loadUkrGaz,
  buyUkrGaz,
  buyGasEquipment,
  startUkrGaz,
  stopUkrGaz,
  withdrawUkrGaz,
  offerHouseGas,
  getGasError,
  ukrGazWarehouseAction,
} from './ukrGazApi.js';

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const money = (value) => `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`;
const liters = (value) => `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ед.`;
const litersLive = (value) => `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ед.`;
const notify = (message, type = 'info') => window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
const plantIdOf = (object) => String(object?.payload?.ukrGazPlantId || object?.payload?.ukrgaz_plant_id || object?.id || '').trim();

const equipment = [
  ['purification','⚙️','Матрица переработки угля',1_000_000,'Производит газ для отопления из угля'],
  ['transport','🔥','Система поставки',250_000,'Доставка газа в дома и предприятия'],
];

function shell() {
  return `<div class="mn-gas-backdrop" data-gas-modal hidden><section class="mn-gas-panel">
    <header><div><small>КОММУНАЛЬНОЕ ПРЕДПРИЯТИЕ</small><h2>УкрГаз</h2><p>Уголь → переработка → газ → дома и предприятия</p></div><button data-gas-close aria-label="Закрыть">×</button></header>
    <nav><button class="is-active" data-gas-tab="overview">Предприятие</button><button data-gas-tab="equipment">Системы</button><button data-gas-tab="consumers">Абоненты</button><button data-gas-tab="warehouse">Уголь / бюджет</button></nav>
    <main data-gas-content></main>
  </section></div>`;
}

export function enableUkrGazFeature({ root, cityId } = {}) {
  if (!root) return () => {};
  root.insertAdjacentHTML('beforeend', shell());

  const modal = root.querySelector('[data-gas-modal]');
  const content = modal.querySelector('[data-gas-content]');
  let currentId = '';
  let activeTab = 'overview';
  let snapshot = null;
  let busy = false;
  let liveTimer = 0;
  let lastBalance = null;
  const consumerDraft = { houseId: '', unitPrice: '10' };
  let withdrawDraft = '1000';

  const syncBalance = (result) => {
    const balance = Number(result?.playerBalance);
    if (!Number.isFinite(balance) || (lastBalance !== null && Math.abs(lastBalance - balance) < 0.005)) return;
    lastBalance = balance;
    window.dispatchEvent(new CustomEvent('mn:player-balance-changed', { detail: { balance, source: 'ukrgaz' } }));
  };

  const setTab = (name) => {
    activeTab = name;
    modal.querySelectorAll('[data-gas-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.gasTab === name));
    render();
  };

  const refresh = async () => {
    snapshot = await loadUkrGaz(currentId, cityId);
    syncBalance(snapshot);
    render();
  };

  const run = async (task, success = '') => {
    if (busy) return;
    busy = true;
    modal.querySelector('.mn-gas-panel')?.classList.add('is-busy');
    try {
      const result = await task();
      syncBalance(result);
      await refresh();
      if (success) notify(success, 'success');
    } catch (error) {
      notify(getGasError(error), 'error');
    } finally {
      busy = false;
      modal.querySelector('.mn-gas-panel')?.classList.remove('is-busy');
    }
  };

  function overview() {
    const s = snapshot || {};
    const plant = s.plant || {};
    if (!plant.ownerId) {
      return `<section class="mn-gas-page"><div class="mn-gas-buy"><span><small>УКРГАЗ · ПРЕДПРИЯТИЕ</small><strong>3 000 000 ₴</strong><p>После покупки установите станок и систему поставки и запустите предприятие.</p></span><button data-gas-purchase>Купить предприятие</button></div></section>`;
    }

    const ready = Boolean(s.equipment?.collection && s.equipment?.purification && s.equipment?.transport);
    const running = Boolean(s.running);
    const clean = Math.max(0, Number(s.gasUnits) || 0);
    const capacity = Math.max(1, Number(s.gasCapacity) || 25_000);
    const status = running ? (clean >= capacity ? 'Резервуар заполнен' : 'Переработка работает') : ready ? 'Готово к запуску' : 'Нужны обязательные системы';
    return `<section class="mn-gas-page">
      <div class="mn-gas-stats"><article><small>Статус</small><strong>${esc(status)}</strong></article><article><small>Уголь</small><strong>${liters(s.coalQuantity)}</strong></article><article><small>Запас газа</small><strong>${liters(clean)} / ${liters(capacity)}</strong></article><article><small>Абоненты</small><strong>${Number(s.subscriberCount || 0)} / 10</strong></article></div>
      <div class="mn-gas-ledger"><article><small>Угля переработано</small><b>${liters(s.totalCoalUsed)}</b></article><article><small>Газа произведено</small><b>${liters(s.totalGasProduced)}</b></article><article><small>Поставлено абонентам</small><b>${litersLive(s.totalGasDelivered)}</b></article>${s.isOwner ? `<article><small>Счёт предприятия</small><b>${money(s.cashBalance)}</b></article>` : ''}</div>
      <div class="mn-gas-actions"><button data-gas-start ${!s.isOwner || running || !ready ? 'disabled' : ''}>Запустить</button><button data-gas-stop ${!s.isOwner || !running ? 'disabled' : ''}>Остановить</button><input data-gas-withdraw type="number" min="1" value="${esc(withdrawDraft)}" placeholder="Сумма"><button data-gas-withdraw-button ${s.isOwner ? '' : 'disabled'}>Снять прибыль</button></div>
      <div class="mn-gas-public-id"><span><small>Публичный ID предприятия</small><code>${esc(s.publicId || plant.id || '—')}</code></span><button data-gas-copy>Копировать</button></div>
      <p class="mn-gas-note">Расход угля: ${liters(s.coalPerHour || 20)}/ч · производство газа: ${liters(s.gasPerHour || 100)}/ч. Для запуска нужен уголь. Управление поставкой — в разделе «Абоненты».</p>
    </section>`;
  }

  function equipmentView() {
    const s = snapshot || {};
    const plant = s.plant || {};
    if (!plant.ownerId) return overview();
    return `<section class="mn-gas-page"><h3>Обязательные системы запуска</h3><div class="mn-gas-equipment">${equipment.map(([id, icon, title, price, description]) => {
      const installed = Boolean(s.equipment?.[id]);
      return `<article><i>${icon}</i><span><strong>${title}</strong><small>${description}</small><b>${money(price)}</b></span><button data-gas-equipment="${id}" ${!s.isOwner || installed ? 'disabled' : ''}>${installed ? 'Установлено' : 'Купить'}</button></article>`;
    }).join('')}</div><p class="mn-gas-note">Предприятие не запускается, пока не куплены станок и система поставки. Общая инфраструктура запуска стоит 1 250 000 ₴ сверх цены самого предприятия.</p></section>`;
  }

  const drafts={quantity:'10',price:'1',budget:'1000'};
  function warehouseView(){const s=snapshot||{};return `<section class="mn-gas-page"><h3>Склад обычного угля</h3><p>На складе: ${Number(s.coalQuantity||0).toFixed(2)} / ${Number(s.coalCapacity||10000)}. У вас: ${Number(s.playerCoalQuantity||0)}.</p><p>Скупка: ${s.procurementEnabled?'открыта':'остановлена'}, цена: ${money(s.coalBuyPrice)}. ${s.isOwner?'Бюджет: '+money(s.cashBalance):'Оплата из бюджета предприятия'}.</p><div class="mn-gas-offer"><input data-gas-draft="quantity" type="number" min="1" step="1" value="${esc(drafts.quantity)}"><button data-gas-warehouse="sell_coal">Продать уголь</button>${s.isOwner?'<button data-gas-warehouse="load_coal">Загрузить свой уголь</button>':''}</div>${s.isOwner?`<div class="mn-gas-offer"><input data-gas-draft="price" type="number" min="0.01" step="0.01" value="${esc(drafts.price)}"><button data-gas-warehouse="set_coal_price">Цена скупки</button><button data-gas-warehouse="set_procurement" data-value="${s.procurementEnabled?0:1}">${s.procurementEnabled?'Остановить скупку':'Открыть скупку'}</button></div><div class="mn-gas-offer"><input data-gas-draft="budget" type="number" min="1" value="${esc(drafts.budget)}"><button data-gas-warehouse="add_budget">Пополнить бюджет</button></div>`:''}</section>`;}
  function consumersView() {
    const s = snapshot || {};
    const consumers = Array.isArray(s.consumers) ? s.consumers : [];
    const openCount = consumers.filter((item) => item.status === 'active' || item.status === 'offered').length;
    const ready = Boolean(s.equipment?.collection && s.equipment?.purification && s.equipment?.transport);
    return `<section class="mn-gas-page"><div class="mn-gas-consumer-heading"><div><h3>Газоснабжение домов и предприятий</h3><p>Подключение стоит фиксированные 1 000 ₴. Тариф задаёт владелец, но не ниже 10 ₴ за единицу.</p></div><span>${openCount}/10 мест</span></div>
      ${s.isOwner ? `<div class="mn-gas-offer"><input data-gas-house maxlength="120" value="${esc(consumerDraft.houseId)}" placeholder="Публичный ID дома / предприятия"><input data-gas-price type="number" min="10" step="0.01" value="${esc(consumerDraft.unitPrice)}" placeholder="₴ за единицу"><button data-gas-offer ${openCount >= 10 || !ready ? 'disabled' : ''}>${ready ? 'Предложить договор' : 'Сначала установите все системы'}</button></div>` : ''}
      ${s.isOwner ? `<button data-gas-warehouse="${s.supplyRunning?'supply_stop':'supply_start'}" data-value="0">${s.supplyRunning?'Остановить поставку':'Запустить поставку'}</button>` : ''}<div class="mn-gas-consumers">${consumers.length ? consumers.map((item) => `<article><span><small>Объект ${esc(item.houseName || item.houseId)} · ${esc(item.consumerName || 'владелец')}</small><strong>${item.status === 'active' ? item.gasActive ? '🔥 Газ поступает' : '⛔ Подача остановлена' : item.status === 'offered' ? '⏳ Ожидает решения' : 'Отказ'}</strong></span><span><small>Тариф</small><b>${money(item.unitPrice)} / ед.</b></span><span><small>Расход объекта</small><b>${item.status === 'active' ? `${liters(item.dailyUnits)} / сутки` : 'Определится при подключении'}</b></span><span><small>Долг</small><b>${money(item.amountDue)}</b></span></article>`).join('') : '<div class="mn-gas-empty">Абонентов пока нет.</div>'}</div>
    </section>`;
  }

  function bind() {
    content.querySelectorAll('[data-gas-draft]').forEach(el=>el.addEventListener('input',()=>{drafts[el.dataset.gasDraft]=el.value;}));
    content.querySelectorAll('[data-gas-warehouse]').forEach(el=>el.addEventListener('click',()=>{const a=el.dataset.gasWarehouse;const value=el.dataset.value??drafts[a==='set_coal_price'?'price':a==='add_budget'?'budget':'quantity'];run(()=>ukrGazWarehouseAction(currentId,cityId,a,Number(value)),'Готово.');}));
    const houseField = content.querySelector('[data-gas-house]');
    const priceField = content.querySelector('[data-gas-price]');
    const withdrawField = content.querySelector('[data-gas-withdraw]');
    houseField?.addEventListener('input', () => { consumerDraft.houseId = houseField.value; });
    priceField?.addEventListener('input', () => { consumerDraft.unitPrice = priceField.value; });
    withdrawField?.addEventListener('input', () => { withdrawDraft = withdrawField.value; });
    content.querySelector('[data-gas-purchase]')?.addEventListener('click', () => run(() => buyUkrGaz(currentId, cityId), 'УкрГаз приобретено.'));
    content.querySelectorAll('[data-gas-equipment]').forEach((button) => button.addEventListener('click', () => run(() => buyGasEquipment(currentId, cityId, button.dataset.gasEquipment), 'Система установлена.')));
    content.querySelector('[data-gas-start]')?.addEventListener('click', () => run(() => startUkrGaz(currentId, cityId), 'Переработка угля запущена.'));
    content.querySelector('[data-gas-stop]')?.addEventListener('click', () => run(() => stopUkrGaz(currentId, cityId), 'Предприятие остановлено.'));
    content.querySelector('[data-gas-withdraw-button]')?.addEventListener('click', () => run(() => withdrawUkrGaz(currentId, cityId, Number(withdrawField?.value)), 'Прибыль выведена.'));
    content.querySelector('[data-gas-copy]')?.addEventListener('click', async () => {
      const id = String(snapshot?.publicId || snapshot?.plant?.id || '');
      try { await navigator.clipboard.writeText(id); notify('Публичный ID скопирован.', 'success'); } catch { window.prompt('Скопируйте ID:', id); }
    });
    content.querySelector('[data-gas-offer]')?.addEventListener('click', () => {
      const houseId = String(houseField?.value || '').trim();
      const unitPrice = Number(priceField?.value);
      if (!houseId) { notify('Введите публичный ID дома.', 'error'); return; }
      if (!Number.isFinite(unitPrice) || unitPrice < 10) { notify('Цена газа должна быть не меньше 10 ₴ за единицу.', 'error'); return; }
      run(() => offerHouseGas(currentId, cityId, houseId, unitPrice), 'Предложение отправлено владельцу объекта.');
    });
  }

  function render() {
    const active = document.activeElement;
    const focusState = active && content.contains(active) && active.matches?.('[data-gas-house], [data-gas-price], [data-gas-withdraw]')
      ? {
          selector: active.hasAttribute('data-gas-house')
            ? '[data-gas-house]'
            : active.hasAttribute('data-gas-price')
              ? '[data-gas-price]'
              : '[data-gas-withdraw]',
          start: active.selectionStart,
          end: active.selectionEnd,
          direction: active.selectionDirection,
        }
      : null;
    modal.classList.toggle('is-running', Boolean(snapshot?.running));
    content.innerHTML = activeTab === 'warehouse' ? warehouseView() : activeTab === 'equipment' ? equipmentView() : activeTab === 'consumers' ? consumersView() : overview();
    bind();
    if (focusState) {
      const next = content.querySelector(focusState.selector);
      next?.focus({ preventScroll: true });
      try {
        if (focusState.start !== null && focusState.end !== null) {
          next?.setSelectionRange(focusState.start, focusState.end, focusState.direction || 'none');
        }
      } catch {}
    }
  }

  const close = () => { modal.hidden = true; window.clearInterval(liveTimer); liveTimer = 0; };
  modal.querySelector('[data-gas-close]').addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  modal.querySelectorAll('[data-gas-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.gasTab)));
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
    if (type !== 'ukrgaz_plant') return;
    const nextId = plantIdOf(object);
    if (nextId !== currentId) {
      consumerDraft.houseId = '';
      consumerDraft.unitPrice = '10';
      withdrawDraft = '1000';
    }
    currentId = nextId;
    if (!currentId) return;
    activeTab = 'overview';
    modal.querySelectorAll('[data-gas-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.gasTab === activeTab));
    modal.hidden = false;
    content.innerHTML = '<div class="mn-gas-empty">Загрузка…</div>';
    try {
      await refresh();
      window.clearInterval(liveTimer);
      liveTimer = window.setInterval(() => {
        if (!modal.hidden && !busy && !content.contains(document.activeElement)) refresh().catch(() => {});
      }, 5000);
    } catch (error) {
      modal.hidden = true;
      notify(getGasError(error), 'error');
    }
  };

  window.addEventListener('mn:ukrgaz-object-action', onAction);
  return () => {
    window.clearInterval(liveTimer);
    content.removeEventListener('keydown', stopGameKeysWhileTyping);
    content.removeEventListener('keyup', stopGameKeysWhileTyping);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('mn:ukrgaz-object-action', onAction);
    modal.remove();
  };
}
