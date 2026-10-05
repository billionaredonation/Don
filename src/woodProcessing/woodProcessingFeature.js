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
  getWoodProcessingError,
  loadWoodProcessingSnapshot,
  produceWoodProcessingBatch,
  purchaseWoodProcessingFactory,
  withdrawWoodProcessingCash,
} from './woodProcessingApi.js';
import { procurementControlsMarkup, renderProcurementControls } from '../procurement/procurementControls.js';
import { getProcurementError, loadProcurementSnapshot, setProcurementBudget, setProcurementItem } from '../procurement/procurementApi.js';
import { getPublicBusinessId } from '../business/publicBusinessId.js';
import { getProductionExchangeError, publishProductionOffer } from '../market/productionExchangeApi.js';
import { supabase as __workplaceTheftSupabase } from '../supabaseClient.js';

const __WORKPLACE_THEFT_FUNCTION = 'workplace-theft';

function __workplaceTheftInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function __workplaceTheftInvoke(action, payload = {}) {
  const initData = __workplaceTheftInitData();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');

  const { data, error } = await __workplaceTheftSupabase.functions.invoke(__WORKPLACE_THEFT_FUNCTION, {
    body: { initData, action, ...payload },
  });

  if (error) {
    let remote = '';
    const source = error?.context || error;

    if (typeof source?.clone === 'function') {
      try {
        const body = await source.clone().json();
        remote = [body?.error, body?.message, body?.reason].filter(Boolean).join(' ');
      } catch {}
    }

    throw new Error(
      [remote, error?.message, error?.details, source?.message].filter(Boolean).join(' ')
      || 'WORKPLACE_THEFT_FAILED',
    );
  }

  if (!data?.ok) throw new Error(data?.error || data?.reason || 'WORKPLACE_THEFT_FAILED');
  return data.result;
}

function __workplaceTheftError(error) {
  const raw = String(error?.message || error || 'WORKPLACE_THEFT_FAILED');

  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите игру.',
    WORKPLACE_THEFT_INVALID_REQUEST: 'Не удалось создать попытку кражи для этой продукции.',
    WORKPLACE_THEFT_ACCESS_DENIED: 'У вас нет доступа к рабочей операции этого предприятия.',
    WORKPLACE_THEFT_PRODUCT_NOT_FOUND: 'Готовая продукция уже не находится на складе предприятия.',
    WORKPLACE_THEFT_OFFER_NOT_FOUND: 'Попытка кражи больше недоступна.',
    WORKPLACE_THEFT_OFFER_ALREADY_RESOLVED: 'Эта попытка уже обработана.',
    WORKPLACE_THEFT_OFFER_EXPIRED: 'Вы слишком долго думали. Продукция уже ушла дальше.',
  };

  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

function __ensureWorkplaceTheftStyles() {
  if (document.getElementById('mn-workplace-theft-inline-style')) return;

  const style = document.createElement('style');
  style.id = 'mn-workplace-theft-inline-style';
  style.textContent = `
    .mn-workplace-theft{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.76);backdrop-filter:blur(6px)}
    .mn-workplace-theft[hidden]{display:none!important}
    .mn-workplace-theft__panel{width:min(460px,100%);display:grid;gap:12px;padding:18px;border:1px solid rgba(235,87,87,.3);border-radius:16px;background:linear-gradient(180deg,#17100f,#0d0b0b);box-shadow:0 24px 70px rgba(0,0,0,.68)}
    .mn-workplace-theft__panel small{color:#dc8f72;font-size:9px;font-weight:900;letter-spacing:.14em}
    .mn-workplace-theft__panel h2{margin:0;color:#fff;font-size:18px}
    .mn-workplace-theft__item,.mn-workplace-theft__rules p{margin:0;color:rgba(255,255,255,.68);font-size:11px;line-height:1.5}
    .mn-workplace-theft__rules{display:grid;gap:5px;padding:11px;border-radius:12px;background:rgba(255,255,255,.035)}
    .mn-workplace-theft__rules strong{color:#ffd7b2;font-size:11px}
    .mn-workplace-theft__actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .mn-workplace-theft__actions button{min-height:42px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:rgba(255,255,255,.06);color:#fff;font-weight:800;cursor:pointer}
    .mn-workplace-theft__actions button.is-danger{border-color:rgba(235,87,87,.34);background:rgba(145,28,28,.42);color:#ffd3d3}
    .mn-workplace-theft.is-busy{pointer-events:none;opacity:.78}
    @media(max-width:560px){.mn-workplace-theft__actions{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

let __workplaceTheftRoot = null;
let __workplaceTheftOffer = null;
let __workplaceTheftResolve = null;
let __workplaceTheftBusy = false;

function __workplaceTheftToast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
  window.dispatchEvent(new CustomEvent('mn:game-toast', { detail: { message, type } }));
}

function __ensureWorkplaceTheftDialog() {
  __ensureWorkplaceTheftStyles();

  if (__workplaceTheftRoot?.isConnected) return __workplaceTheftRoot;

  const host = document.createElement('div');
  host.innerHTML = `
    <div class="mn-workplace-theft" data-workplace-theft-inline hidden>
      <section class="mn-workplace-theft__panel">
        <small>РИСКОВАННОЕ ДЕЙСТВИЕ</small>
        <h2>Попробовать украсть изготовленную деталь?</h2>
        <p class="mn-workplace-theft__item" data-workplace-theft-inline-item>Только что изготовлена продукция.</p>
        <div class="mn-workplace-theft__rules">
          <strong>Что произойдёт:</strong>
          <p>• «Нет» — продукция остаётся предприятию.</p>
          <p>• «Да» — сервер проводит попытку кражи.</p>
          <p>• Шанс успеха: <b>10%</b>.</p>
          <p>• Успех — 1 единица идёт в личный инвентарь.</p>
          <p>• Провал — увольнение и запись «Попытка кражи на рабочем месте».</p>
        </div>
        <div class="mn-workplace-theft__actions">
          <button type="button" data-workplace-theft-inline-no>Нет, оставить предприятию</button>
          <button type="button" class="is-danger" data-workplace-theft-inline-yes>Да, попробовать · 10%</button>
        </div>
      </section>
    </div>
  `;

  __workplaceTheftRoot = host.firstElementChild;
  document.body.appendChild(__workplaceTheftRoot);

  __workplaceTheftRoot.querySelector('[data-workplace-theft-inline-no]').onclick = () => {
    void __resolveWorkplaceTheft(false);
  };
  __workplaceTheftRoot.querySelector('[data-workplace-theft-inline-yes]').onclick = () => {
    void __resolveWorkplaceTheft(true);
  };

  return __workplaceTheftRoot;
}

function __closeWorkplaceTheft(result = null) {
  const dialog = __ensureWorkplaceTheftDialog();
  dialog.hidden = true;
  __workplaceTheftOffer = null;
  __workplaceTheftBusy = false;

  if (__workplaceTheftResolve) {
    __workplaceTheftResolve(result);
    __workplaceTheftResolve = null;
  }
}

async function __resolveWorkplaceTheft(trySteal) {
  if (__workplaceTheftBusy || !__workplaceTheftOffer?.id) return;

  __workplaceTheftBusy = true;
  const dialog = __ensureWorkplaceTheftDialog();
  dialog.classList.add('is-busy');

  try {
    if (!trySteal) {
      const result = await __workplaceTheftInvoke('decline', { offerId: __workplaceTheftOffer.id });
      __workplaceTheftToast('Продукция оставлена предприятию.', 'success');
      __closeWorkplaceTheft({ ...result, declined: true });
      return;
    }

    const result = await __workplaceTheftInvoke('attempt', { offerId: __workplaceTheftOffer.id });

    if (result?.success) {
      __workplaceTheftToast(
        `Кража удалась. ${result.itemLabel || 'Продукция'} ×1 добавлена в ваш инвентарь.`,
        'success',
      );

      window.dispatchEvent(new CustomEvent('mn:business-inventory-changed', {
        detail: {
          itemType: result.itemType,
          quantity: result.inventoryQuantity,
          source: 'workplace_theft',
        },
      }));
      window.dispatchEvent(new CustomEvent('mn:inventory-refresh'));
    } else {
      __workplaceTheftToast(
        result?.dismissed
          ? 'Вас поймали: вы уволены, а в уголовную книжку добавлена попытка кражи.'
          : 'Кража провалилась. В уголовную книжку добавлена попытка кражи.',
        'error',
      );
    }

    __closeWorkplaceTheft(result);
  } catch (error) {
    __workplaceTheftToast(__workplaceTheftError(error), 'error');
    __closeWorkplaceTheft({ error });
  } finally {
    dialog.classList.remove('is-busy');
    __workplaceTheftBusy = false;
  }
}

async function askWorkplaceTheft({
  enterpriseKind,
  enterpriseId,
  cityId,
  itemType,
  itemLabel,
  producedQuantity = 1,
} = {}) {
  try {
    const offer = await __workplaceTheftInvoke('prepare', {
      enterpriseKind,
      enterpriseId,
      cityId,
      itemType,
      itemLabel,
      producedQuantity,
    });

    if (!offer?.id) return null;

    __workplaceTheftOffer = offer;

    const dialog = __ensureWorkplaceTheftDialog();
    const item = dialog.querySelector('[data-workplace-theft-inline-item]');
    item.textContent = `Изготовлено: ${offer.itemLabel || itemLabel || itemType} · произведено ${Number(producedQuantity || 1)} ед. Украсть можно 1 единицу.`;
    dialog.hidden = false;

    return await new Promise((resolve) => {
      __workplaceTheftResolve = resolve;
    });
  } catch (error) {
    __workplaceTheftToast(__workplaceTheftError(error), 'error');
    return null;
  }
}

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
  const products = Object.values(WOOD_PROCESSING_RECIPES).map((item) => `<article><i>${item.icon}</i><span><small>${esc(item.label)}</small><strong data-wood-product="${item.id}">0</strong></span><div><input type="number" min="1" value="1" inputmode="numeric" aria-label="Количество" data-wood-offer-qty="${item.id}"><input type="number" min="1" value="100" inputmode="numeric" aria-label="Цена" data-wood-offer-price="${item.id}"><button type="button" data-wood-offer="${item.id}">На биржу</button></div></article>`).join('');
  const recipes = Object.values(WOOD_PROCESSING_RECIPES).map(recipeMarkup).join('');
  return `<div class="mn-metallurgy-backdrop" data-wood-modal hidden><section class="mn-metallurgy-panel"><header><div><small>ПРОИЗВОДСТВЕННОЕ ПРЕДПРИЯТИЕ</small><h2>${WOOD_PROCESSING_CONFIG.icon} ${WOOD_PROCESSING_CONFIG.label}</h2><p>Древесина лесоруба → деревянные детали → завод инструментов</p></div><button type="button" data-wood-close aria-label="Закрыть">×</button></header><nav><button type="button" class="is-active" data-wood-tab="production">Рецептура</button><button type="button" data-wood-tab="warehouse">Склады</button><button type="button" data-wood-tab="management">Управление</button></nav><main>
    <section data-wood-page="production"><div class="mn-metallurgy-status"><span><small>Статус</small><strong data-wood-state>Загрузка…</strong></span><span><small>Ваша роль</small><strong data-wood-role>Посетитель</strong></span><span><small>Бюджет</small><strong data-wood-cash>Скрыто</strong></span></div><div class="mn-metallurgy-recipes">${recipes}</div></section>
    <section data-wood-page="warehouse" hidden><h3>Сырьевой склад</h3><p class="mn-metallurgy-note">Брёвна и брус поступают от лесорубов через рынок сырья.</p><div class="mn-metallurgy-stock">${raw}</div><h3>Склад готовых деталей</h3><div class="mn-metallurgy-stock">${products}</div></section>
    <section data-wood-page="management" hidden><div class="mn-metallurgy-buy" data-wood-buy><span><small>ГОСУДАРСТВЕННЫЙ ЗАВОД</small><strong>${formatWoodMoney(WOOD_PROCESSING_CONFIG.purchasePrice)}</strong><p>После покупки владелец управляет бюджетом, сырьём и выпуском деталей.</p></span><button type="button" data-wood-purchase>Купить завод</button></div><div data-wood-owned hidden><div class="mn-metallurgy-owner"><span><small>Владелец</small><strong data-wood-owner>—</strong></span><span><small>Форма</small><strong>ТОВ</strong></span><span><small>Публичный ID</small><strong data-wood-public-id>—</strong></span></div>${procurementControlsMarkup('wood', WOOD_PROCESSING_RAW_ITEMS)}<article class="mn-metallurgy-money"><h3>Баланс предприятия</h3><input type="number" min="1" inputmode="numeric" placeholder="Сумма" data-wood-amount><div><button type="button" data-wood-deposit>Пополнить</button><button type="button" data-wood-withdraw>Снять</button></div></article></div></section>
  </main></section></div>`;
}

export function enableWoodProcessingFeature({ root, cityId } = {}) {
  if (!root) return () => {};
  root.insertAdjacentHTML('beforeend', markup());
  const modal = root.querySelector('[data-wood-modal]');
  const q = (selector) => modal.querySelector(selector);
  const qa = (selector) => [...modal.querySelectorAll(selector)];
  let currentFactoryId = '';
  let currentPublicId = '—';
  let snapshot = null;
  let procurement = null;
  let busy = false;

  function render() {
    const business = snapshot?.business || {}, raw = snapshot?.raw || {}, products = snapshot?.products || {};
    q('[data-wood-state]').textContent = business.ownerId ? 'Готов к производству' : 'Государственный';
    q('[data-wood-role]').textContent = snapshot?.isOwner ? 'Владелец' : 'Посетитель';
    q('[data-wood-cash]').textContent = snapshot?.isOwner ? formatWoodMoney(business.cash) : 'Скрыто';
    q('[data-wood-buy]').hidden = Boolean(business.ownerId);
    q('[data-wood-owned]').hidden = !business.ownerId;
    q('[data-wood-owner]').textContent = business.ownerName || 'Государство';
    q('[data-wood-public-id]').textContent = currentPublicId;
    WOOD_PROCESSING_RAW_ITEMS.forEach((item) => { q(`[data-wood-raw="${item.itemType}"]`).textContent = `${Number(raw[item.itemType] || 0)} ед.`; });
    Object.keys(WOOD_PROCESSING_RECIPES).forEach((id) => { q(`[data-wood-product="${id}"]`).textContent = `${Number(products[id] || 0)} ед.`; });
    qa('[data-wood-produce]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner; });
    qa('[data-wood-offer]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner || Number(products[button.dataset.woodOffer] || 0) < 1; });
    qa('[data-wood-deposit],[data-wood-withdraw]').forEach((button) => { button.disabled = busy || !snapshot?.isOwner; });
    renderProcurementControls(modal, 'wood', procurement, WOOD_PROCESSING_RAW_ITEMS, { canManage:snapshot?.isOwner, busy });
  }

  async function refresh() { snapshot = await loadWoodProcessingSnapshot(currentFactoryId, cityId); procurement = snapshot?.isOwner ? await loadProcurementSnapshot({ buyerKind:'factory', buyerId:currentFactoryId, cityId, buyerType:'wood_processing' }) : null; render(); }
  async function run(task, success = '', errorFormatter = getWoodProcessingError) {
    if (busy) return;
    busy = true; modal.classList.add('is-busy'); render();
    try { await task(); await refresh(); if (success) toast(success, 'success'); }
    catch (error) { toast(String(error?.message || error || '').includes('PROCUREMENT_') ? getProcurementError(error) : errorFormatter(error), 'error'); }
    finally { busy = false; modal.classList.remove('is-busy'); render(); }
  }
  function setTab(name) {
    qa('[data-wood-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.woodTab === name));
    qa('[data-wood-page]').forEach((page) => { page.hidden = page.dataset.woodPage !== name; });
  }
  function onObjectAction(event) {
    const object = event.detail?.object;
    if (objectType(object) !== WOOD_PROCESSING_CONFIG.type) return;
    currentFactoryId = objectId(object); modal.hidden = false; setTab('production');
    currentPublicId = getPublicBusinessId(object);
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
    run(async () => {
      await produceWoodProcessingBatch(currentFactoryId, cityId, recipeId, batches);
      const recipe = WOOD_PROCESSING_RECIPES[recipeId];
      await askWorkplaceTheft({
        enterpriseKind:'wood_processing',
        enterpriseId:currentFactoryId,
        cityId,
        itemType:recipeId,
        itemLabel:recipe?.label || recipeId,
        producedQuantity:(recipe?.outputQty || 1) * batches,
      });
    }, 'Деревянные детали произведены.');
  }; });
  qa('[data-wood-offer]').forEach((button) => { button.onclick = () => {
    const productId = button.dataset.woodOffer;
    const available = Number(snapshot?.products?.[productId] || 0);
    const quantity = Math.max(1, Math.min(available, Math.floor(Number(q(`[data-wood-offer-qty="${productId}"]`).value) || 1)));
    const unitPrice = Math.max(1, Math.floor(Number(q(`[data-wood-offer-price="${productId}"]`).value) || 1));
    run(() => publishProductionOffer({ industryId:'wood_processing', factoryId:currentFactoryId, cityId, productType:productId, quantity, unitPrice }), 'Партия выставлена на биржу.', getProductionExchangeError);
  }; });
  q('[data-wood-purchase]').onclick = () => run(() => purchaseWoodProcessingFactory(currentFactoryId, cityId), 'Деревоперерабатывающий завод куплен.');
  q('[data-wood-deposit]').onclick = () => run(() => depositWoodProcessingCash(currentFactoryId, cityId, Number(q('[data-wood-amount]').value)), 'Баланс завода пополнен.');
  q('[data-wood-withdraw]').onclick = () => run(() => withdrawWoodProcessingCash(currentFactoryId, cityId, Number(q('[data-wood-amount]').value)), 'Средства выведены.');
  q('[data-wood-procurement-budget-save]').onclick = () => {
    const budget = Number(q('[data-wood-procurement-budget]').value);
    run(() => setProcurementBudget({ buyerKind:'factory', buyerId:currentFactoryId, cityId, buyerType:'wood_processing', budget }), 'Бюджет скупа обновлён.');
  };
  const saveProcurementItem = (itemType) => {
    const unitPrice = Math.max(0, Math.floor(Number(q(`[data-wood-procurement-price="${itemType}"]`)?.value) || 0));
    const enabled = unitPrice > 0;
    const toggle = q(`[data-wood-procurement-item="${itemType}"]`);
    if (toggle) toggle.checked = enabled;
    run(() => setProcurementItem({ buyerKind:'factory', buyerId:currentFactoryId, cityId, buyerType:'wood_processing', itemType, enabled, unitPrice }), enabled ? 'Сырьё и цена скупа сохранены.' : 'Закупка сырья отключена.');
  };
  qa('[data-wood-procurement-item-save]').forEach((button) => { button.onclick = () => saveProcurementItem(button.dataset.woodProcurementItemSave); });
  window.addEventListener('mn:wood-processing-object-action', onObjectAction);
  return () => { window.removeEventListener('mn:wood-processing-object-action', onObjectAction); modal.remove(); };
}
