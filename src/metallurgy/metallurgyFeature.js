import './metallurgy.css';
import {
  METALLURGY_CONFIG,
  METALLURGY_DESTINATIONS,
  METALLURGY_RAW_ITEMS,
  METALLURGY_RECIPES,
  formatMetallurgyInputs,
  formatMetallurgyMoney,
} from './metallurgyConfig.js';
import {
  depositMetallurgyCash,
  getMetallurgyError,
  loadMetallurgySnapshot,
  produceMetallurgyBatch,
  purchaseMetallurgyFactory,
  withdrawMetallurgyCash,
  dispatchMetallurgyProduct,
} from './metallurgyApi.js';

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const objectType = (object) => String(object?.type || object?.payload?.jobType || object?.payload?.type || '');
const objectId = (object) => String(object?.payload?.metallurgyFactoryId || object?.payload?.factoryId || object?.id || '').trim();
const toast = (message, type = 'info') => window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));

function recipeMarkup(recipe) {
  const destinations = recipe.destinations.map((id) => METALLURGY_DESTINATIONS[id] || id).join(' · ');
  return `<article class="mn-metallurgy-recipe" data-destinations="${esc(recipe.destinations.join(' '))}">
    <i>${esc(recipe.icon)}</i><span><strong>${esc(recipe.label)}</strong>
    <small>${esc(formatMetallurgyInputs(recipe.inputs))}</small><em>Выход: ${recipe.outputQty} · ${esc(destinations)}</em></span>
    <div><input type="number" min="1" max="100" value="1" inputmode="numeric" data-metallurgy-batches="${esc(recipe.id)}"><button type="button" data-metallurgy-produce="${esc(recipe.id)}">Произвести</button></div>
  </article>`;
}

function markup() {
  const raw = METALLURGY_RAW_ITEMS.map((item) => `<article><i>${item.icon}</i><span><small>${esc(item.label)}</small><strong data-metallurgy-raw="${item.itemType}">0</strong></span></article>`).join('');
  const products = Object.values(METALLURGY_RECIPES).map((item) => `<article><i>${item.icon}</i><span><small>${esc(item.label)}</small><strong data-metallurgy-product="${item.id}">0</strong></span><button type="button" data-metallurgy-withdraw-product="${item.id}">Снять</button></article>`).join('');
  const recipes = Object.values(METALLURGY_RECIPES).map(recipeMarkup).join('');
  return `<div class="mn-metallurgy-backdrop" data-metallurgy-modal hidden><section class="mn-metallurgy-panel">
    <header><div><small>ПРОИЗВОДСТВЕННОЕ ПРЕДПРИЯТИЕ</small><h2>${METALLURGY_CONFIG.icon} ${METALLURGY_CONFIG.label}</h2><p>Сырьё шахты → металлургическая деталь → заводы и магазин стройматериалов</p></div><button type="button" data-metallurgy-close aria-label="Закрыть">×</button></header>
    <nav><button type="button" class="is-active" data-metallurgy-tab="production">Рецептура</button><button type="button" data-metallurgy-tab="warehouse">Склады</button><button type="button" data-metallurgy-tab="management">Управление</button></nav>
    <main>
      <section data-metallurgy-page="production"><div class="mn-metallurgy-status"><span><small>Статус</small><strong data-metallurgy-state>Загрузка…</strong></span><span><small>Ваша роль</small><strong data-metallurgy-role>Посетитель</strong></span><span><small>Бюджет</small><strong data-metallurgy-cash>Скрыто</strong></span></div><div class="mn-metallurgy-recipes">${recipes}</div></section>
      <section data-metallurgy-page="warehouse" hidden><h3>Сырьевой склад</h3><p class="mn-metallurgy-note">Сюда поступают подтверждённые партии со склада шахты через логистику. Сырьё не создаётся кнопкой в интерфейсе.</p><div class="mn-metallurgy-stock">${raw}</div><h3>Склад готовых компонентов</h3><div class="mn-metallurgy-stock">${products}</div></section>
      <section data-metallurgy-page="management" hidden><div class="mn-metallurgy-buy" data-metallurgy-buy><span><small>ГОСУДАРСТВЕННЫЙ ЗАВОД</small><strong>${formatMetallurgyMoney(METALLURGY_CONFIG.purchasePrice)}</strong><p>После покупки владелец управляет производством, бюджетом и складами.</p></span><button type="button" data-metallurgy-purchase>Купить завод</button></div><div data-metallurgy-owned hidden><div class="mn-metallurgy-owner"><span><small>Владелец</small><strong data-metallurgy-owner>—</strong></span><span><small>Форма</small><strong>ТОВ</strong></span></div><article class="mn-metallurgy-money"><h3>Бюджет предприятия</h3><input type="number" min="1" inputmode="numeric" placeholder="Сумма" data-metallurgy-amount><div><button type="button" data-metallurgy-deposit>Пополнить</button><button type="button" data-metallurgy-withdraw>Снять</button></div></article></div></section>
    </main>
    <div class="mn-metallurgy-transfer" data-metallurgy-transfer hidden><section><header><span><small>ОТПРАВКА СО СКЛАДА</small><h3 data-metallurgy-transfer-title>Компонент</h3></span><button type="button" data-metallurgy-transfer-close>×</button></header><label>Количество<input type="number" min="1" value="1" inputmode="numeric" data-metallurgy-transfer-quantity></label><label>Куда отправляем<select data-metallurgy-transfer-destination></select></label><footer><button type="button" class="is-ghost" data-metallurgy-transfer-cancel>Отмена</button><button type="button" data-metallurgy-transfer-send>Отправить</button></footer></section></div>
    </section></div>`;
}

export function enableMetallurgyFeature({ root, cityId } = {}) {
  if (!root) return () => {};
  root.insertAdjacentHTML('beforeend', markup());
  const modal = root.querySelector('[data-metallurgy-modal]');
  const q = (selector) => modal.querySelector(selector);
  const qa = (selector) => [...modal.querySelectorAll(selector)];
  let currentFactoryId = '';
  let snapshot = null;
  let busy = false;
  let transferProductId = '';

  function render() {
    const business = snapshot?.business || {};
    const raw = snapshot?.raw || {};
    const products = snapshot?.products || {};
    q('[data-metallurgy-state]').textContent = business.ownerId ? 'Готов к производству' : 'Государственный';
    q('[data-metallurgy-role]').textContent = snapshot?.isOwner ? 'Владелец' : 'Посетитель';
    q('[data-metallurgy-cash]').textContent = snapshot?.isOwner ? formatMetallurgyMoney(business.cash) : 'Скрыто';
    q('[data-metallurgy-buy]').hidden = Boolean(business.ownerId);
    q('[data-metallurgy-owned]').hidden = !business.ownerId;
    q('[data-metallurgy-owner]').textContent = business.ownerName || 'Государство';
    METALLURGY_RAW_ITEMS.forEach((item) => { q(`[data-metallurgy-raw="${item.itemType}"]`).textContent = `${Number(raw[item.itemType] || 0)} ед.`; });
    Object.keys(METALLURGY_RECIPES).forEach((id) => { q(`[data-metallurgy-product="${id}"]`).textContent = `${Number(products[id] || 0)} ед.`; });
    qa('[data-metallurgy-produce]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner; });
    qa('[data-metallurgy-withdraw-product]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner || Number(products[button.dataset.metallurgyWithdrawProduct] || 0) < 1; });
    qa('[data-metallurgy-deposit],[data-metallurgy-withdraw]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner; });
  }

  async function refresh() {
    snapshot = await loadMetallurgySnapshot(currentFactoryId, cityId);
    render();
  }

  async function run(task, success = '') {
    if (busy) return;
    busy = true; modal.classList.add('is-busy'); render();
    try {
      await task();
      await refresh();
      if (success) toast(success, 'success');
    } catch (error) {
      toast(getMetallurgyError(error), 'error');
    } finally {
      busy = false; modal.classList.remove('is-busy'); render();
    }
  }

  function setTab(name) {
    qa('[data-metallurgy-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.metallurgyTab === name));
    qa('[data-metallurgy-page]').forEach((page) => { page.hidden = page.dataset.metallurgyPage !== name; });
  }

  function onObjectAction(event) {
    const object = event.detail?.object;
    if (objectType(object) !== METALLURGY_CONFIG.type) return;
    currentFactoryId = objectId(object);
    modal.hidden = false;
    setTab('production');
    refresh().catch((error) => toast(getMetallurgyError(error), 'error'));
  }

  q('[data-metallurgy-close]').onclick = () => { modal.hidden = true; };
  qa('[data-metallurgy-tab]').forEach((button) => { button.onclick = () => setTab(button.dataset.metallurgyTab); });
  function closeTransfer() {
    q('[data-metallurgy-transfer]').hidden = true;
    transferProductId = '';
  }

  qa('[data-metallurgy-withdraw-product]').forEach((button) => { button.onclick = () => {
    const productId = button.dataset.metallurgyWithdrawProduct;
    const recipe = METALLURGY_RECIPES[productId];
    const available = Number(snapshot?.products?.[productId] || 0);
    if (!recipe || available < 1) return;
    transferProductId = productId;
    q('[data-metallurgy-transfer-title]').textContent = `${recipe.icon} ${recipe.label} · доступно ${available}`;
    const quantity = q('[data-metallurgy-transfer-quantity]');
    quantity.max = String(available);
    quantity.value = '1';
    q('[data-metallurgy-transfer-destination]').innerHTML = recipe.destinations.map((id) => `<option value="${esc(id)}">${esc(METALLURGY_DESTINATIONS[id] || id)}</option>`).join('');
    q('[data-metallurgy-transfer]').hidden = false;
  }; });
  q('[data-metallurgy-transfer-close]').onclick = closeTransfer;
  q('[data-metallurgy-transfer-cancel]').onclick = closeTransfer;
  q('[data-metallurgy-transfer-send]').onclick = () => {
    const productId = transferProductId;
    const available = Number(snapshot?.products?.[productId] || 0);
    const quantity = Math.max(1, Math.min(available, Math.floor(Number(q('[data-metallurgy-transfer-quantity]').value) || 1)));
    const destination = q('[data-metallurgy-transfer-destination]').value;
    closeTransfer();
    run(() => dispatchMetallurgyProduct(currentFactoryId, cityId, productId, quantity, destination), 'Компоненты сняты со склада и отправлены по назначению.');
  };
  qa('[data-metallurgy-produce]').forEach((button) => { button.onclick = () => {
    const recipeId = button.dataset.metallurgyProduce;
    const batches = Math.max(1, Math.min(100, Math.floor(Number(q(`[data-metallurgy-batches="${recipeId}"]`).value) || 1)));
    const recipe = METALLURGY_RECIPES[recipeId];
    const missing = Object.entries(recipe?.inputs || {}).find(([itemType, perBatch]) => Number(snapshot?.raw?.[itemType] || 0) < Number(perBatch) * batches);
    if (missing) {
      const [itemType, perBatch] = missing;
      const item = METALLURGY_RAW_ITEMS.find((entry) => entry.itemType === itemType);
      const available = Number(snapshot?.raw?.[itemType] || 0);
      toast(`Недостаточно сырья: ${item?.label || itemType}. На складе ${available}, нужно ${Number(perBatch) * batches}.`, 'error');
      return;
    }
    run(() => produceMetallurgyBatch(currentFactoryId, cityId, recipeId, batches), 'Партия произведена и отправлена на склад.');
  }; });
  q('[data-metallurgy-purchase]').onclick = () => run(() => purchaseMetallurgyFactory(currentFactoryId, cityId), 'Металлургический завод куплен.');
  q('[data-metallurgy-deposit]').onclick = () => run(() => depositMetallurgyCash(currentFactoryId, cityId, Number(q('[data-metallurgy-amount]').value)), 'Баланс завода пополнен.');
  q('[data-metallurgy-withdraw]').onclick = () => run(() => withdrawMetallurgyCash(currentFactoryId, cityId, Number(q('[data-metallurgy-amount]').value)), 'Средства выведены.');
  window.addEventListener('mn:metallurgy-object-action', onObjectAction);
  return () => {
    window.removeEventListener('mn:metallurgy-object-action', onObjectAction);
    modal.remove();
  };
}
