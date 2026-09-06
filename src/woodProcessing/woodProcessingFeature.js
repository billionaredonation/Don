import '../metallurgy/metallurgy.css';
import {
  WOOD_PROCESSING_CONFIG,
  WOOD_PROCESSING_DESTINATIONS,
  WOOD_PROCESSING_RAW_ITEMS,
  WOOD_PROCESSING_RECIPES,
  formatWoodInputs,
  formatWoodMoney,
} from './woodProcessingConfig.js';
import {
  depositWoodProcessingCash,
  dispatchWoodProcessingProduct,
  getWoodProcessingError,
  loadWoodProcessingSnapshot,
  produceWoodProcessingBatch,
  purchaseWoodProcessingFactory,
  withdrawWoodProcessingCash,
} from './woodProcessingApi.js';

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const objectType = (object) => String(object?.type || object?.payload?.jobType || object?.payload?.type || '');
const objectId = (object) => String(object?.payload?.woodProcessingFactoryId || object?.payload?.factoryId || object?.id || '').trim();
const toast = (message, type = 'info') => window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));

function recipeMarkup(recipe) {
  const destinations = recipe.destinations.map((id) => WOOD_PROCESSING_DESTINATIONS[id] || id).join(' · ');
  return `<article class="mn-metallurgy-recipe"><i>${esc(recipe.icon)}</i><span><strong>${esc(recipe.label)}</strong><small>${esc(formatWoodInputs(recipe.inputs))}</small><em>Выход: ${recipe.outputQty} · ${esc(destinations)}</em></span><div><input type="number" min="1" max="100" value="1" inputmode="numeric" data-wood-batches="${esc(recipe.id)}"><button type="button" data-wood-produce="${esc(recipe.id)}">Произвести</button></div></article>`;
}

function markup() {
  const raw = WOOD_PROCESSING_RAW_ITEMS.map((item) => `<article><i>${item.icon}</i><span><small>${esc(item.label)}</small><strong data-wood-raw="${item.itemType}">0</strong></span></article>`).join('');
  const products = Object.values(WOOD_PROCESSING_RECIPES).map((item) => `<article><i>${item.icon}</i><span><small>${esc(item.label)}</small><strong data-wood-product="${item.id}">0</strong></span><button type="button" data-wood-dispatch-open="${item.id}">Снять</button></article>`).join('');
  const recipes = Object.values(WOOD_PROCESSING_RECIPES).map(recipeMarkup).join('');
  return `<div class="mn-metallurgy-backdrop" data-wood-modal hidden><section class="mn-metallurgy-panel"><header><div><small>ПРОИЗВОДСТВЕННОЕ ПРЕДПРИЯТИЕ</small><h2>${WOOD_PROCESSING_CONFIG.icon} ${WOOD_PROCESSING_CONFIG.label}</h2><p>Древесина лесоруба → деревянные детали → завод инструментов</p></div><button type="button" data-wood-close aria-label="Закрыть">×</button></header><nav><button type="button" class="is-active" data-wood-tab="production">Рецептура</button><button type="button" data-wood-tab="warehouse">Склады</button><button type="button" data-wood-tab="management">Управление</button></nav><main>
    <section data-wood-page="production"><div class="mn-metallurgy-status"><span><small>Статус</small><strong data-wood-state>Загрузка…</strong></span><span><small>Ваша роль</small><strong data-wood-role>Посетитель</strong></span><span><small>Бюджет</small><strong data-wood-cash>Скрыто</strong></span></div><div class="mn-metallurgy-recipes">${recipes}</div></section>
    <section data-wood-page="warehouse" hidden><h3>Сырьевой склад</h3><p class="mn-metallurgy-note">Брёвна и брус поступают от лесорубов через рынок сырья.</p><div class="mn-metallurgy-stock">${raw}</div><h3>Склад готовых деталей</h3><div class="mn-metallurgy-stock">${products}</div></section>
    <section data-wood-page="management" hidden><div class="mn-metallurgy-buy" data-wood-buy><span><small>ГОСУДАРСТВЕННЫЙ ЗАВОД</small><strong>${formatWoodMoney(WOOD_PROCESSING_CONFIG.purchasePrice)}</strong><p>После покупки владелец управляет бюджетом, сырьём и выпуском деталей.</p></span><button type="button" data-wood-purchase>Купить завод</button></div><div data-wood-owned hidden><div class="mn-metallurgy-owner"><span><small>Владелец</small><strong data-wood-owner>—</strong></span><span><small>Форма</small><strong>ТОВ</strong></span></div><article class="mn-metallurgy-money"><h3>Бюджет предприятия</h3><input type="number" min="1" inputmode="numeric" placeholder="Сумма" data-wood-amount><div><button type="button" data-wood-deposit>Пополнить</button><button type="button" data-wood-withdraw>Снять</button></div></article></div></section>
  </main><div class="mn-metallurgy-transfer" data-wood-transfer hidden><section><header><span><small>ОТПРАВКА СО СКЛАДА</small><h3 data-wood-transfer-title>Деталь</h3></span><button type="button" data-wood-transfer-close>×</button></header><label>Количество<input type="number" min="1" value="1" inputmode="numeric" data-wood-transfer-quantity></label><label>Куда отправляем<select data-wood-transfer-destination></select></label><footer><button type="button" class="is-ghost" data-wood-transfer-cancel>Отмена</button><button type="button" data-wood-transfer-send>Отправить</button></footer></section></div></section></div>`;
}

export function enableWoodProcessingFeature({ root, cityId } = {}) {
  if (!root) return () => {};
  root.insertAdjacentHTML('beforeend', markup());
  const modal = root.querySelector('[data-wood-modal]');
  const q = (selector) => modal.querySelector(selector);
  const qa = (selector) => [...modal.querySelectorAll(selector)];
  let currentFactoryId = '';
  let snapshot = null;
  let busy = false;
  let transferProductId = '';

  function render() {
    const business = snapshot?.business || {}, raw = snapshot?.raw || {}, products = snapshot?.products || {};
    q('[data-wood-state]').textContent = business.ownerId ? 'Готов к производству' : 'Государственный';
    q('[data-wood-role]').textContent = snapshot?.isOwner ? 'Владелец' : 'Посетитель';
    q('[data-wood-cash]').textContent = snapshot?.isOwner ? formatWoodMoney(business.cash) : 'Скрыто';
    q('[data-wood-buy]').hidden = Boolean(business.ownerId);
    q('[data-wood-owned]').hidden = !business.ownerId;
    q('[data-wood-owner]').textContent = business.ownerName || 'Государство';
    WOOD_PROCESSING_RAW_ITEMS.forEach((item) => { q(`[data-wood-raw="${item.itemType}"]`).textContent = `${Number(raw[item.itemType] || 0)} ед.`; });
    Object.keys(WOOD_PROCESSING_RECIPES).forEach((id) => { q(`[data-wood-product="${id}"]`).textContent = `${Number(products[id] || 0)} ед.`; });
    qa('[data-wood-produce]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner; });
    qa('[data-wood-dispatch-open]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner || Number(products[button.dataset.woodDispatchOpen] || 0) < 1; });
    qa('[data-wood-deposit],[data-wood-withdraw]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner; });
  }

  async function refresh() { snapshot = await loadWoodProcessingSnapshot(currentFactoryId, cityId); render(); }
  async function run(task, success = '') {
    if (busy) return;
    busy = true; modal.classList.add('is-busy'); render();
    try { await task(); await refresh(); if (success) toast(success, 'success'); }
    catch (error) { toast(getWoodProcessingError(error), 'error'); }
    finally { busy = false; modal.classList.remove('is-busy'); render(); }
  }
  function setTab(name) {
    qa('[data-wood-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.woodTab === name));
    qa('[data-wood-page]').forEach((page) => { page.hidden = page.dataset.woodPage !== name; });
  }
  function closeTransfer() { q('[data-wood-transfer]').hidden = true; transferProductId = ''; }
  function onObjectAction(event) {
    const object = event.detail?.object;
    if (objectType(object) !== WOOD_PROCESSING_CONFIG.type) return;
    currentFactoryId = objectId(object); modal.hidden = false; setTab('production');
    refresh().catch((error) => toast(getWoodProcessingError(error), 'error'));
  }

  q('[data-wood-close]').onclick = () => { modal.hidden = true; };
  qa('[data-wood-tab]').forEach((button) => { button.onclick = () => setTab(button.dataset.woodTab); });
  qa('[data-wood-produce]').forEach((button) => { button.onclick = () => {
    const recipeId = button.dataset.woodProduce;
    const batches = Math.max(1, Math.min(100, Math.floor(Number(q(`[data-wood-batches="${recipeId}"]`).value) || 1)));
    const recipe = WOOD_PROCESSING_RECIPES[recipeId];
    const missing = Object.entries(recipe?.inputs || {}).find(([itemType, perBatch]) => Number(snapshot?.raw?.[itemType] || 0) < Number(perBatch) * batches);
    if (missing) {
      const [itemType, perBatch] = missing, item = WOOD_PROCESSING_RAW_ITEMS.find((entry) => entry.itemType === itemType);
      toast(`Недостаточно сырья: ${item?.label || itemType}. На складе ${Number(snapshot?.raw?.[itemType] || 0)}, нужно ${Number(perBatch) * batches}.`, 'error');
      return;
    }
    run(() => produceWoodProcessingBatch(currentFactoryId, cityId, recipeId, batches), 'Деревянные детали произведены и отправлены на склад.');
  }; });
  qa('[data-wood-dispatch-open]').forEach((button) => { button.onclick = () => {
    const productId = button.dataset.woodDispatchOpen, recipe = WOOD_PROCESSING_RECIPES[productId];
    const available = Number(snapshot?.products?.[productId] || 0);
    if (!recipe || available < 1) return;
    transferProductId = productId;
    q('[data-wood-transfer-title]').textContent = `${recipe.icon} ${recipe.label} · доступно ${available}`;
    const quantity = q('[data-wood-transfer-quantity]'); quantity.max = String(available); quantity.value = '1';
    q('[data-wood-transfer-destination]').innerHTML = recipe.destinations.map((id) => `<option value="${esc(id)}">${esc(WOOD_PROCESSING_DESTINATIONS[id] || id)}</option>`).join('');
    q('[data-wood-transfer]').hidden = false;
  }; });
  q('[data-wood-transfer-close]').onclick = closeTransfer;
  q('[data-wood-transfer-cancel]').onclick = closeTransfer;
  q('[data-wood-transfer-send]').onclick = () => {
    const productId = transferProductId, available = Number(snapshot?.products?.[productId] || 0);
    const quantity = Math.max(1, Math.min(available, Math.floor(Number(q('[data-wood-transfer-quantity]').value) || 1)));
    const destination = q('[data-wood-transfer-destination]').value;
    closeTransfer();
    run(() => dispatchWoodProcessingProduct(currentFactoryId, cityId, productId, quantity, destination), 'Детали сняты со склада и отправлены по назначению.');
  };
  q('[data-wood-purchase]').onclick = () => run(() => purchaseWoodProcessingFactory(currentFactoryId, cityId), 'Деревоперерабатывающий завод куплен.');
  q('[data-wood-deposit]').onclick = () => run(() => depositWoodProcessingCash(currentFactoryId, cityId, Number(q('[data-wood-amount]').value)), 'Баланс завода пополнен.');
  q('[data-wood-withdraw]').onclick = () => run(() => withdrawWoodProcessingCash(currentFactoryId, cityId, Number(q('[data-wood-amount]').value)), 'Средства выведены.');
  window.addEventListener('mn:wood-processing-object-action', onObjectAction);
  return () => { window.removeEventListener('mn:wood-processing-object-action', onObjectAction); modal.remove(); };
}
