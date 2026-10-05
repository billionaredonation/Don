import '../metallurgy/metallurgy.css';
import { TEXTILE_CONFIG, TEXTILE_RAW_ITEMS, TEXTILE_RECIPES, formatTextileInputs, formatTextileMoney } from './textileConfig.js';
import { createTextileBatch, depositTextileCash, finishTextileBatch, getTextileError, loadTextileSnapshot, publishTextileOffer, purchaseTextileFactory, setTextileRawBuyPrice, transferTextileRaw, withdrawTextileCash } from './textileApi.js';
import { procurementControlsMarkup, renderProcurementControls } from '../procurement/procurementControls.js';
import { getProcurementError, loadProcurementSnapshot, setProcurementBudget, setProcurementItem } from '../procurement/procurementApi.js';
import { getPublicBusinessId } from '../business/publicBusinessId.js';
import { getBusinessLegalPayload } from '../business/businessConfig.js';
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
  q('[data-textile-finish]').onclick = () => {
    const batch = snapshot?.activeBatch || snapshot?.batch || null;
    const recipeId = batch?.recipeId || '';
    const recipe = TEXTILE_RECIPES[recipeId];

    run(async () => {
      await finishTextileBatch(factoryId, cityId, q('[data-textile-finish]').dataset.batchId);
      await askWorkplaceTheft({
        enterpriseKind:'textile',
        enterpriseId:factoryId,
        cityId,
        itemType:recipeId,
        itemLabel:recipe?.label || recipeId || 'Готовая одежда',
        producedQuantity:recipe?.outputQty || 1,
      });
    }, 'Одежда изготовлена.');
  };
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
