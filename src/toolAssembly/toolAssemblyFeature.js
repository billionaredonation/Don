import '../metallurgy/metallurgy.css';
import {
  TOOL_ASSEMBLY_CONFIG,
  TOOL_ASSEMBLY_DESTINATIONS,
  TOOL_ASSEMBLY_INPUT_ITEMS,
  TOOL_ASSEMBLY_RECIPES,
  formatToolInputs,
  formatToolMoney,
} from './toolAssemblyConfig.js';
import {
  depositToolAssemblyCash,
  getToolAssemblyError,
  loadToolAssemblySnapshot,
  produceToolAssemblyBatch,
  purchaseToolAssemblyFactory,
  withdrawToolAssemblyCash,
} from './toolAssemblyApi.js';
import { getPublicBusinessId } from '../business/publicBusinessId.js';
import { getProductionExchangeError, publishProductionOffer } from '../market/productionExchangeApi.js';

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const objectType = (object) => String(object?.type || object?.payload?.jobType || object?.payload?.type || '');
const objectId = (object) => String(object?.payload?.toolAssemblyFactoryId || object?.payload?.factoryId || object?.id || '').trim();
const toast = (message, type = 'info') => window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));

function recipeMarkup(recipe) {
  const destinations = recipe.destinations.map((id) => TOOL_ASSEMBLY_DESTINATIONS[id] || id).join(' · ');
  return `<article class="mn-metallurgy-recipe"><i>${esc(recipe.icon)}</i><span><strong>${esc(recipe.label)}</strong><small>${esc(formatToolInputs(recipe.inputs))}</small><em>Выход: ${recipe.outputQty} · ${esc(destinations)}</em></span><div><input type="number" min="1" max="100" value="1" inputmode="numeric" data-tool-batches="${esc(recipe.id)}"><button type="button" data-tool-produce="${esc(recipe.id)}">Произвести</button></div></article>`;
}

function markup() {
  const raw = TOOL_ASSEMBLY_INPUT_ITEMS.map((item) => `<article><i>${item.icon}</i><span><small>${esc(item.label)}</small><strong data-tool-raw="${item.itemType}">0</strong></span></article>`).join('');
  const products = Object.values(TOOL_ASSEMBLY_RECIPES).map((item) => `<article><i>${item.icon}</i><span><small>${esc(item.label)}</small><strong data-tool-product="${item.id}">0</strong></span><div><input type="number" min="1" value="1" inputmode="numeric" aria-label="Количество" data-tool-offer-qty="${item.id}"><input type="number" min="1" value="100" inputmode="numeric" aria-label="Цена" data-tool-offer-price="${item.id}"><button type="button" data-tool-offer="${item.id}">На биржу</button></div></article>`).join('');
  const recipes = Object.values(TOOL_ASSEMBLY_RECIPES).map(recipeMarkup).join('');
  return `<div class="mn-metallurgy-backdrop" data-tool-modal hidden><section class="mn-metallurgy-panel"><header><div><small>СБОРОЧНОЕ ПРЕДПРИЯТИЕ</small><h2>${TOOL_ASSEMBLY_CONFIG.icon} ${TOOL_ASSEMBLY_CONFIG.label}</h2><p>Металлические и деревянные детали → готовые инструменты → магазин стройматериалов</p></div><button type="button" data-tool-close aria-label="Закрыть">×</button></header><nav><button type="button" class="is-active" data-tool-tab="production">Рецептура</button><button type="button" data-tool-tab="warehouse">Склады</button><button type="button" data-tool-tab="management">Управление</button></nav><main>
    <section data-tool-page="production"><div class="mn-metallurgy-status"><span><small>Статус</small><strong data-tool-state>Загрузка…</strong></span><span><small>Ваша роль</small><strong data-tool-role>Посетитель</strong></span><span><small>Бюджет</small><strong data-tool-cash>Скрыто</strong></span></div><div class="mn-metallurgy-recipes">${recipes}</div></section>
    <section data-tool-page="warehouse" hidden><h3>Склад комплектующих</h3><p class="mn-metallurgy-note">Детали поступают с металлургического и деревоперерабатывающего заводов.</p><div class="mn-metallurgy-stock">${raw}</div><h3>Склад готовых инструментов</h3><div class="mn-metallurgy-stock">${products}</div></section>
    <section data-tool-page="management" hidden><div class="mn-metallurgy-buy" data-tool-buy><span><small>ГОСУДАРСТВЕННЫЙ ЗАВОД</small><strong>${formatToolMoney(TOOL_ASSEMBLY_CONFIG.purchasePrice)}</strong><p>После покупки владелец управляет бюджетом, комплектующими и сборкой инструментов.</p></span><button type="button" data-tool-purchase>Купить завод</button></div><div data-tool-owned hidden><div class="mn-metallurgy-owner"><span><small>Владелец</small><strong data-tool-owner>—</strong></span><span><small>Форма</small><strong>ТОВ</strong></span><span><small>Публичный ID</small><strong data-tool-public-id>—</strong></span></div><article class="mn-metallurgy-money"><h3>Бюджет предприятия</h3><input type="number" min="1" inputmode="numeric" placeholder="Сумма" data-tool-amount><div><button type="button" data-tool-deposit>Пополнить</button><button type="button" data-tool-withdraw>Снять</button></div></article></div></section>
  </main></section></div>`;
}

export function enableToolAssemblyFeature({ root, cityId } = {}) {
  if (!root) return () => {};
  root.insertAdjacentHTML('beforeend', markup());
  const modal = root.querySelector('[data-tool-modal]');
  const q = (selector) => modal.querySelector(selector);
  const qa = (selector) => [...modal.querySelectorAll(selector)];
  let currentFactoryId = '';
  let currentPublicId = '—';
  let snapshot = null;
  let busy = false;

  function render() {
    const business = snapshot?.business || {}, raw = snapshot?.raw || {}, products = snapshot?.products || {};
    q('[data-tool-state]').textContent = business.ownerId ? 'Готов к производству' : 'Государственный';
    q('[data-tool-role]').textContent = snapshot?.isOwner ? 'Владелец' : 'Посетитель';
    q('[data-tool-cash]').textContent = snapshot?.isOwner ? formatToolMoney(business.cash) : 'Скрыто';
    q('[data-tool-buy]').hidden = Boolean(business.ownerId);
    q('[data-tool-owned]').hidden = !business.ownerId;
    q('[data-tool-owner]').textContent = business.ownerName || 'Государство';
    q('[data-tool-public-id]').textContent = currentPublicId;
    TOOL_ASSEMBLY_INPUT_ITEMS.forEach((item) => { q(`[data-tool-raw="${item.itemType}"]`).textContent = `${Number(raw[item.itemType] || 0)} ед.`; });
    Object.keys(TOOL_ASSEMBLY_RECIPES).forEach((id) => { q(`[data-tool-product="${id}"]`).textContent = `${Number(products[id] || 0)} ед.`; });
    qa('[data-tool-produce]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner; });
    qa('[data-tool-offer]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner || Number(products[button.dataset.toolOffer] || 0) < 1; });
    qa('[data-tool-deposit],[data-tool-withdraw]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner; });
  }

  async function refresh() { snapshot = await loadToolAssemblySnapshot(currentFactoryId, cityId); render(); }
  async function run(task, success = '', errorFormatter = getToolAssemblyError) {
    if (busy) return;
    busy = true; modal.classList.add('is-busy'); render();
    try { await task(); await refresh(); if (success) toast(success, 'success'); }
    catch (error) { toast(errorFormatter(error), 'error'); }
    finally { busy = false; modal.classList.remove('is-busy'); render(); }
  }
  function setTab(name) {
    qa('[data-tool-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.toolTab === name));
    qa('[data-tool-page]').forEach((page) => { page.hidden = page.dataset.toolPage !== name; });
  }
  function onObjectAction(event) {
    const object = event.detail?.object;
    if (objectType(object) !== TOOL_ASSEMBLY_CONFIG.type) return;
    currentFactoryId = objectId(object); modal.hidden = false; setTab('production');
    currentPublicId = getPublicBusinessId(object);
    refresh().catch((error) => toast(getToolAssemblyError(error), 'error'));
  }

  q('[data-tool-close]').onclick = () => { modal.hidden = true; };
  qa('[data-tool-tab]').forEach((button) => { button.onclick = () => setTab(button.dataset.toolTab); });
  qa('[data-tool-produce]').forEach((button) => { button.onclick = () => {
    const recipeId = button.dataset.toolProduce;
    const batches = Math.max(1, Math.min(100, Math.floor(Number(q(`[data-tool-batches="${recipeId}"]`).value) || 1)));
    const recipe = TOOL_ASSEMBLY_RECIPES[recipeId];
    const missing = Object.entries(recipe?.inputs || {}).find(([itemType, perBatch]) => Number(snapshot?.raw?.[itemType] || 0) < Number(perBatch) * batches);
    if (missing) {
      const [itemType, perBatch] = missing, item = TOOL_ASSEMBLY_INPUT_ITEMS.find((entry) => entry.itemType === itemType);
      toast(`Недостаточно комплектующих: ${item?.label || itemType}. На складе ${Number(snapshot?.raw?.[itemType] || 0)}, нужно ${Number(perBatch) * batches}.`, 'error');
      return;
    }
    run(() => produceToolAssemblyBatch(currentFactoryId, cityId, recipeId, batches), 'Инструменты собраны и отправлены на склад.');
  }; });
  qa('[data-tool-offer]').forEach((button) => { button.onclick = () => {
    const productId = button.dataset.toolOffer;
    const available = Number(snapshot?.products?.[productId] || 0);
    const quantity = Math.max(1, Math.min(available, Math.floor(Number(q(`[data-tool-offer-qty="${productId}"]`).value) || 1)));
    const unitPrice = Math.max(1, Math.floor(Number(q(`[data-tool-offer-price="${productId}"]`).value) || 1));
    run(() => publishProductionOffer({ industryId:'tool_assembly', factoryId:currentFactoryId, cityId, productType:productId, quantity, unitPrice }), 'Партия выставлена на биржу.', getProductionExchangeError);
  }; });
  q('[data-tool-purchase]').onclick = () => run(() => purchaseToolAssemblyFactory(currentFactoryId, cityId), 'Завод по сборке инструментов куплен.');
  q('[data-tool-deposit]').onclick = () => run(() => depositToolAssemblyCash(currentFactoryId, cityId, Number(q('[data-tool-amount]').value)), 'Баланс завода пополнен.');
  q('[data-tool-withdraw]').onclick = () => run(() => withdrawToolAssemblyCash(currentFactoryId, cityId, Number(q('[data-tool-amount]').value)), 'Средства выведены.');
  window.addEventListener('mn:tool-assembly-object-action', onObjectAction);
  return () => { window.removeEventListener('mn:tool-assembly-object-action', onObjectAction); modal.remove(); };
}
