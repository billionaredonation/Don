import '../metallurgy/metallurgy.css';
import { TEXTILE_CONFIG, TEXTILE_RAW_ITEMS, TEXTILE_RECIPES, formatTextileInputs, formatTextileMoney } from './textileConfig.js';
import { createTextileBatch, depositTextileCash, finishTextileBatch, getTextileError, loadTextileSnapshot, publishTextileOffer, purchaseTextileFactory, setTextileRawBuyPrice, transferTextileRaw, withdrawTextileCash } from './textileApi.js';
import { procurementControlsMarkup, renderProcurementControls } from '../procurement/procurementControls.js';
import { getProcurementError, loadProcurementSnapshot, setProcurementBudget, setProcurementItem } from '../procurement/procurementApi.js';
import { getPublicBusinessId } from '../business/publicBusinessId.js';
import { getBusinessLegalPayload } from '../business/businessConfig.js';

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const objectType = (object) => String(object?.type || object?.payload?.jobType || object?.payload?.type || '');
const objectId = (object) => String(object?.payload?.textileFactoryId || object?.payload?.factoryId || object?.id || '').trim();
const toast = (message, type = 'info') => window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');

function textileOwnership(snapshot, business) {
  const ownerId = firstValue(
    business?.ownerId,
    business?.owner_id,
    business?.ownerTgId,
    business?.owner_tg_id,
    snapshot?.ownerId,
    snapshot?.owner_id,
    snapshot?.ownerTgId,
    snapshot?.owner_tg_id,
  );
  const ownerName = String(firstValue(
    business?.ownerName,
    business?.owner_name,
    business?.ownerNickname,
    business?.owner_nickname,
    snapshot?.ownerName,
    snapshot?.owner_name,
  ) || '').trim();
  const normalizedName = ownerName.toLocaleLowerCase('ru-RU');
  const stateOwner = !ownerName || ['государство', 'государственный', 'state'].includes(normalizedName);
  const owned = Boolean(ownerId || snapshot?.isOwner || business?.owned === true || !stateOwner);
  return { ownerName: owned ? (ownerName || String(ownerId || 'Владелец')) : 'Государство', owned };
}

function textileBuyPrice(snapshot, itemType) {
  const source = snapshot?.buyPrices || snapshot?.buy_prices || snapshot?.rawBuyPrices || snapshot?.raw_buy_prices || snapshot?.business?.buyPrices || snapshot?.business?.buy_prices || {};
  if (Array.isArray(source)) {
    const entry = source.find((item) => String(item?.itemType || item?.item_type || '') === itemType);
    return Number(entry?.unitPrice ?? entry?.unit_price ?? entry?.price ?? 0);
  }
  const entry = source?.[itemType];
  return Number(typeof entry === 'object' ? (entry?.unitPrice ?? entry?.unit_price ?? entry?.price ?? 0) : entry || 0);
}

function markup() {
  const raw = TEXTILE_RAW_ITEMS.map((item) => `<article><i>${item.icon}</i><span><small>${item.label}</small><strong data-textile-raw="${item.itemType}">0</strong></span><div class="mn-textile-raw-controls"><label><small>Передать со своего склада</small><input type="number" min="1" value="10" data-textile-raw-qty="${item.itemType}"></label><button data-textile-raw-transfer="${item.itemType}">Передать</button><label><small>Цена закупки за 1 ед.</small><input type="number" min="1" value="10" data-textile-buy-price="${item.itemType}"></label><button data-textile-buy-price-save="${item.itemType}">Установить цену</button></div></article>`).join('');
  const recipes = Object.values(TEXTILE_RECIPES).map((item) => `<article class="mn-metallurgy-recipe"><i>${item.icon}</i><span><strong>${esc(item.label)}</strong><small>${esc(formatTextileInputs(item.inputs))}</small><em>Слот: ${item.slot === 'upper' ? 'верх' : item.slot === 'lower' ? 'низ' : 'обувь'} · цвет выбирается в инвентаре</em></span><button data-textile-produce="${item.id}">Запустить</button></article>`).join('');
  const products = Object.values(TEXTILE_RECIPES).map((item) => `<article><i>${item.icon}</i><span><small>${esc(item.label)}</small><strong data-textile-product="${item.id}">0</strong></span><div><input type="number" min="1" value="1" data-textile-offer-qty="${item.id}"><input type="number" min="1" value="300" data-textile-offer-price="${item.id}"><button data-textile-offer="${item.id}">На биржу</button></div></article>`).join('');
  return `<div class="mn-metallurgy-backdrop" data-textile-modal hidden><section class="mn-metallurgy-panel"><header><div><small>ТЕКСТИЛЬНОЕ ПРОИЗВОДСТВО</small><h2>🧵 Швейный завод</h2><p>Лён и хлопок → одежда и обувь → магазин одежды и аксессуаров</p></div><button data-textile-close>×</button></header><nav><button class="is-active" data-textile-tab="production">Рецептура</button><button data-textile-tab="warehouse">Склады</button><button data-textile-tab="management">Управление</button></nav><main>
    <section data-textile-page="production"><div class="mn-metallurgy-status"><span><small>Статус</small><strong data-textile-state>Загрузка…</strong></span><span><small>Ваша роль</small><strong data-textile-role>Посетитель</strong></span><span><small>Бюджет</small><strong data-textile-cash>Скрыто</strong></span></div><article class="mn-textile-active-batch" data-textile-batch hidden><i>🧵</i><span><strong data-textile-batch-title>Активная партия</strong><small>Изготовление завершено. Отправьте одежду на склад завода.</small></span><button type="button" data-textile-finish>Завершить и отправить на склад</button></article><div class="mn-metallurgy-recipes">${recipes}</div></section>
    <section data-textile-page="warehouse" hidden><h3>Сырьевой склад</h3><div class="mn-metallurgy-stock">${raw}</div><h3>Готовая одежда</h3><p class="mn-metallurgy-note">Количество и цена → «На биржу». Магазин аксессуаров закупает партию через производственную биржу.</p><div class="mn-metallurgy-stock">${products}</div></section>
    <section data-textile-page="management" hidden><div class="mn-metallurgy-buy" data-textile-buy><span><small>ГОСУДАРСТВЕННЫЙ ЗАВОД</small><strong>${formatTextileMoney(TEXTILE_CONFIG.purchasePrice)}</strong><p>Форма и налог заданы администратором: <b data-textile-purchase-legal>—</b></p></span><button data-textile-purchase>Купить завод</button></div><div data-textile-owned hidden><div class="mn-metallurgy-owner"><span><small>Владелец</small><strong data-textile-owner>—</strong></span><span><small>Форма</small><strong data-textile-legal-view>—</strong></span><span><small>Публичный ID</small><strong data-textile-public-id>—</strong></span></div>${procurementControlsMarkup('textile', TEXTILE_RAW_ITEMS, { priceFields:false })}<article class="mn-metallurgy-money"><h3>Баланс предприятия</h3><input type="number" min="1" placeholder="Сумма" data-textile-amount><div><button data-textile-deposit>Пополнить</button><button data-textile-withdraw>Снять</button></div></article></div></section>
  </main></section></div>`;
}

export function enableTextileFeature({ root, cityId } = {}) {
  if (!root) return () => {};
  root.insertAdjacentHTML('beforeend', markup());
  const modal = root.querySelector('[data-textile-modal]');
  const q = (selector) => modal.querySelector(selector), qa = (selector) => [...modal.querySelectorAll(selector)];
  let factoryId = '', currentPublicId = '—', currentLegal = getBusinessLegalPayload({ legalForm:'tov' }), snapshot = null, procurement = null, busy = false;
  function render() {
    const business = snapshot?.business || snapshot?.factory || {}, raw = snapshot?.raw || {}, products = snapshot?.products || {};
    const ownership = textileOwnership(snapshot, business);
    q('[data-textile-state]').textContent = ownership.owned ? (snapshot?.activeBatch ? 'Линия работает' : 'Готов к работе') : 'Государственный';
    q('[data-textile-role]').textContent = snapshot?.isOwner ? 'Владелец' : (snapshot?.roleLabel || 'Посетитель');
    q('[data-textile-cash]').textContent = snapshot?.isOwner ? formatTextileMoney(business.cash) : 'Скрыто';
    q('[data-textile-buy]').hidden = ownership.owned;
    q('[data-textile-owned]').hidden = !ownership.owned;
    q('[data-textile-owner]').textContent = ownership.ownerName;
    q('[data-textile-public-id]').textContent = currentPublicId;
    q('[data-textile-purchase-legal]').textContent = `${currentLegal.legalFormLabel} · ${currentLegal.taxGroupLabel}`;
    q('[data-textile-legal-view]').textContent = currentLegal.legalFormLabel;
    q('[data-textile-purchase]').disabled = busy || ownership.owned;
    TEXTILE_RAW_ITEMS.forEach((item) => {
      q(`[data-textile-raw="${item.itemType}"]`).textContent = `${Number(raw[item.itemType] || 0)} ед.`;
      const priceInput = q(`[data-textile-buy-price="${item.itemType}"]`), currentPrice = textileBuyPrice(snapshot, item.itemType);
      if (currentPrice > 0 && document.activeElement !== priceInput) priceInput.value = String(currentPrice);
    });
    Object.keys(TEXTILE_RECIPES).forEach((id) => { q(`[data-textile-product="${id}"]`).textContent = `${Number(products[id] || 0)} ед.`; });
    const batch = snapshot?.activeBatch || snapshot?.batch || null; q('[data-textile-batch]').hidden = !batch; q('[data-textile-finish]').dataset.batchId = batch?.id || ''; q('[data-textile-batch-title]').textContent = TEXTILE_RECIPES[batch?.recipeId]?.label || 'Активная партия';
    qa('[data-textile-produce]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner || Boolean(batch); });
    qa('[data-textile-offer]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner || Number(products[button.dataset.textileOffer] || 0) < 1; });
    qa('[data-textile-buy-price-save],[data-textile-raw-transfer]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner; });
    renderProcurementControls(modal, 'textile', procurement, TEXTILE_RAW_ITEMS, { canManage:snapshot?.isOwner, busy });
  }
  async function refresh() { snapshot = await loadTextileSnapshot(factoryId, cityId); procurement = snapshot?.isOwner ? await loadProcurementSnapshot({ buyerKind:'factory', buyerId:factoryId, cityId, buyerType:'textile' }) : null; render(); }
  async function run(task, success = '') { if (busy) return; busy = true; modal.classList.add('is-busy'); try { await task(); await refresh(); if (success) toast(success, 'success'); } catch (error) { toast(String(error?.message || error || '').includes('PROCUREMENT_') ? getProcurementError(error) : getTextileError(error), 'error'); } finally { busy = false; modal.classList.remove('is-busy'); render(); } }
  function tab(name) { qa('[data-textile-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.textileTab === name)); qa('[data-textile-page]').forEach((page) => { page.hidden = page.dataset.textilePage !== name; }); }
  q('[data-textile-close]').onclick = () => { modal.hidden = true; }; qa('[data-textile-tab]').forEach((button) => { button.onclick = () => tab(button.dataset.textileTab); });
  qa('[data-textile-produce]').forEach((button) => { button.onclick = () => run(() => createTextileBatch(factoryId, cityId, button.dataset.textileProduce), 'Партия запущена.'); });
  q('[data-textile-finish]').onclick = () => run(() => finishTextileBatch(factoryId, cityId, q('[data-textile-finish]').dataset.batchId), 'Одежда передана на склад завода.');
  qa('[data-textile-raw-transfer]').forEach((button) => { button.onclick = () => run(() => transferTextileRaw(factoryId, cityId, button.dataset.textileRawTransfer, Number(q(`[data-textile-raw-qty="${button.dataset.textileRawTransfer}"]`).value)), 'Сырьё передано на завод.'); });
  qa('[data-textile-buy-price-save]').forEach((button) => { button.onclick = () => { const itemType = button.dataset.textileBuyPriceSave; run(async () => { const unitPrice=Number(q(`[data-textile-buy-price="${itemType}"]`).value); await setTextileRawBuyPrice(factoryId, cityId, itemType, unitPrice); const enabled=q(`[data-textile-procurement-item="${itemType}"]`)?.checked===true; await setProcurementItem({ buyerKind:'factory', buyerId:factoryId, cityId, buyerType:'textile', itemType, enabled, unitPrice }); }, 'Цена закупки обновлена. Теперь фермеры видят предложение в меню O.'); }; });
  qa('[data-textile-offer]').forEach((button) => { button.onclick = () => { const id = button.dataset.textileOffer; run(() => publishTextileOffer(factoryId, cityId, id, Number(q(`[data-textile-offer-qty="${id}"]`).value), Number(q(`[data-textile-offer-price="${id}"]`).value)), 'Партия выставлена на биржу.'); }; });
  q('[data-textile-purchase]').onclick = () => run(() => purchaseTextileFactory(factoryId, cityId), 'Швейный завод куплен.');
  q('[data-textile-deposit]').onclick = () => run(() => depositTextileCash(factoryId, cityId, Number(q('[data-textile-amount]').value)), 'Баланс пополнен.');
  q('[data-textile-withdraw]').onclick = () => run(() => withdrawTextileCash(factoryId, cityId, Number(q('[data-textile-amount]').value)), 'Средства выведены.');
  q('[data-textile-procurement-budget-save]').onclick = () => {
    const budget = Number(q('[data-textile-procurement-budget]').value);
    const settings = qa('[data-textile-procurement-item]').map((input) => {
      const itemType = input.dataset.textileProcurementItem;
      return { itemType, enabled:input.checked, unitPrice:Number(q(`[data-textile-buy-price="${itemType}"]`)?.value) };
    });
    run(async () => { await setProcurementBudget({ buyerKind:'factory', buyerId:factoryId, cityId, buyerType:'textile', budget }); for(const setting of settings){await setProcurementItem({buyerKind:'factory',buyerId:factoryId,cityId,buyerType:'textile',...setting});} }, 'Бюджет и цены скупа обновлены.');
  };
  qa('[data-textile-procurement-item]').forEach((input) => { input.onchange = () => {
    const itemType=input.dataset.textileProcurementItem;
    const enabled=input.checked;
    const unitPrice=Number(q(`[data-textile-buy-price="${itemType}"]`)?.value);
    run(() => setProcurementItem({ buyerKind:'factory', buyerId:factoryId, cityId, buyerType:'textile', itemType, enabled, unitPrice }), enabled ? 'Сырьё добавлено в скуп.' : 'Закупка сырья отключена.');
  }; });
  const onAction = (event) => { const object = event.detail?.object; if (objectType(object) !== TEXTILE_CONFIG.type) return; factoryId = objectId(object); currentPublicId = getPublicBusinessId(object); currentLegal = getBusinessLegalPayload({ legalForm:'tov', ...(object?.payload || {}) }); modal.hidden = false; tab('production'); refresh().catch((error) => toast(getTextileError(error), 'error')); };
  window.addEventListener('mn:textile-object-action', onAction);
  return () => { window.removeEventListener('mn:textile-object-action', onAction); modal.remove(); };
}
