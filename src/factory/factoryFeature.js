import './factory.css';
import './factoryRedesign.css';
import { FACTORY_CONFIG, FACTORY_PROCUREMENT_ITEMS, FACTORY_RAW_ITEMS, FACTORY_RECIPES, FACTORY_ROLES, formatFactoryMoney } from './factoryConfig.js';
import { loadFactorySnapshot, purchaseFactory, transferFruitToFactory, startFactoryBatch, cookFactoryBatch, finishFactoryBatch, depositFactory, withdrawFactory, setFactoryStaff, removeFactoryStaff, setFactoryWholesalePrice, setFactoryProductionWage, getFactoryError } from './factoryApi.js';
import { getProductionExchangeError, publishProductionOffer } from '../market/productionExchangeApi.js';
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

const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const objectType = (o) => String(o?.type || o?.payload?.jobType || '');
// A map object can have its own technical id while pointing at an existing
// factory row. Always prefer the explicit binding so the market sale and the
// factory modal read/write the same warehouse.
const objectId = (o) => String(
  o?.payload?.factoryId ||
  o?.payload?.factory_id ||
  o?.factoryId ||
  o?.factory_id ||
  o?.id ||
  ''
).trim();
const notify = (message, type = 'info') => window.dispatchEvent(new CustomEvent('mn:game-toast', { detail: { message, type } }));
const exchangeProductType = (recipeId) => `grocery_${String(recipeId || '').trim()}`;

function markup() {
  const recipes = Object.values(FACTORY_RECIPES).map((r) => `<article class="mn-factory-recipe"><i>${r.icon}</i><span><strong>${r.label}</strong><small>${r.inputIcon} ${r.inputLabel}: ${r.inputQty} → ${r.outputQty} ед. · готовка 3 сек.</small>${r.anyFruit ? `<select data-factory-ingredient="${r.id}" aria-label="Выберите фрукт или ягоду"><option value="farm_apple">🍎 Яблоки</option><option value="farm_orange">🍊 Апельсины</option></select>` : ''}</span><button data-factory-start="${r.id}">Начать цепочку</button></article>`).join('');
  const raw = FACTORY_RAW_ITEMS.map((i) => `<article><i>${i.icon}</i><span><small>${i.label}</small><strong data-factory-raw="${i.itemType}">0</strong></span><div><input type="number" min="1" value="1" inputmode="numeric" data-factory-deliver-qty="${i.itemType}" aria-label="Количество"><button data-factory-deliver="${i.itemType}">Сдать</button></div></article>`).join('');
  return `<div class="mn-factory-backdrop" data-factory-modal hidden><section class="mn-factory-panel">
    <header><div><small>ПРОИЗВОДСТВЕННОЕ ПРЕДПРИЯТИЕ</small><h2>Завод по производству питания</h2><p>Ферма → производство → склад завода → биржа → покупка магазином → доставка → склад магазина → полка</p></div><button data-factory-close aria-label="Закрыть">×</button></header>
    <nav><button data-factory-tab="production" class="is-active">Производство</button><button data-factory-tab="warehouse">Склады</button><button data-factory-tab="management">Управление</button></nav>
    <main>
      <section data-factory-page="production"><div class="mn-factory-status"><span><small>Статус</small><strong data-factory-state>Загрузка…</strong></span><span><small>Ваша роль</small><strong data-factory-role>Посетитель</strong></span><span><small>Бюджет</small><strong data-factory-cash>—</strong></span></div><div class="mn-factory-workflow">${FACTORY_ROLES.map((role, index) => `<span><i>${role.icon}</i><b>${index + 1}. ${role.label}</b></span>`).join('<em>→</em>')}<em>→</em><span><i>🏬</i><b>Склад</b></span><em>→</em><span><i>📈</i><b>Биржа</b></span><em>→</em><span><i>🚚</i><b>Доставка</b></span></div><div class="mn-factory-line" data-factory-line><i>⚙️</i><span><strong>Линия свободна</strong><small>Выберите рецепт и запустите смену</small></span><button data-factory-cook hidden>Повар: готовить</button><button data-factory-finish hidden>Упаковать на склад</button></div><h3>Технологические карты</h3><div class="mn-factory-recipes">${recipes}</div></section>
      <section data-factory-page="warehouse" hidden><h3>Сырьевой склад</h3><div class="mn-factory-warehouse">${raw}</div><h3>Готовая продукция</h3><p class="mn-factory-exchange-note">Готовый товар не отправляется в магазин напрямую. Владелец выставляет партию на биржу, а продуктовый магазин сам выбирает нужное предложение и оплачивает доставку.</p><div class="mn-factory-products">${Object.values(FACTORY_RECIPES).map((r) => `<article><i>${r.icon}</i><span><small>${r.label}</small><strong data-factory-product="${r.id}">0</strong></span><div class="mn-factory-offer-controls"><input type="number" min="1" value="1" data-factory-offer-qty="${r.id}" aria-label="Количество партии"><input type="number" min="1" value="${Math.max(1, Math.round(r.wage / r.outputQty * 1.8))}" data-factory-offer-price="${r.id}" aria-label="Цена за единицу"><button data-factory-offer="${r.id}">На биржу</button></div></article>`).join('')}</div></section>
      <section data-factory-page="management" hidden><div class="mn-factory-buy" data-factory-buy><span><small>ГОСУДАРСТВЕННЫЙ ЗАВОД</small><strong>${formatFactoryMoney(FACTORY_CONFIG.purchasePrice)}</strong><p>Форма и налог заданы администратором: <b data-factory-purchase-legal>—</b></p></span><button data-factory-purchase>Купить завод</button></div><div data-factory-owned hidden><div class="mn-factory-owner"><span><small>Владелец</small><strong data-factory-owner>—</strong></span><span><small>Юр. форма</small><strong data-factory-legal-view>—</strong></span><span><small>Публичный ID</small><strong data-factory-public-id>—</strong></span></div>${procurementControlsMarkup('factory', FACTORY_PROCUREMENT_ITEMS)}<div class="mn-factory-manage-grid"><article><h3>Баланс предприятия</h3><input type="number" min="1" placeholder="Сумма" data-factory-money><div><button data-factory-deposit>Пополнить</button><button data-factory-withdraw>Снять</button></div></article><article><h3>Персонал</h3><input placeholder="Ник игрока" data-factory-staff-target><select data-factory-staff-role>${FACTORY_ROLES.map((role) => `<option value="${role.id}">${role.label}</option>`).join('')}</select><div><button data-factory-staff-save>Назначить</button><button data-factory-staff-remove>Снять</button></div></article><article class="is-wide"><h3>Базовые цены для биржи</h3><div class="mn-factory-price-list">${Object.values(FACTORY_RECIPES).map((r) => `<label><span>${r.icon} ${r.label}</span><input type="number" min="1" value="${Math.max(1, Math.round(r.wage / r.outputQty * 1.8))}" data-factory-wholesale-price="${r.id}"><button data-factory-wholesale-save="${r.id}">Сохранить</button></label>`).join('')}</div></article><article class="is-wide"><h3>Оплата за изготовление партии</h3><div class="mn-factory-price-list">${Object.values(FACTORY_RECIPES).map((r) => `<label><span>${r.icon} ${r.label}</span><input type="number" min="0" value="${r.wage}" data-factory-production-wage="${r.id}"><button data-factory-wage-save="${r.id}">Сохранить</button></label>`).join('')}</div></article></div></div></section>
    </main></section></div>`;
}

function contractsMarkup(contracts = [], actorId = '') {
  if (!contracts.length) return '<p class="mn-factory-contract-empty">Договоров пока нет. Сырьё без согласованной поставки завод не принимает.</p>';
  return contracts.map((contract) => {
    const remaining = Math.max(0, Number(contract.quantity) - Number(contract.deliveredQuantity || 0));
    const isSupplier = String(contract.supplierTgId || '') === String(actorId || '');
    const status = { pending:'Ожидает решения', active:'Действует', rejected:'Отклонён', completed:'Выполнен', cancelled:'Отменён' }[contract.status] || contract.status;
    return `<article data-status="${esc(contract.status)}"><header><i>${contract.itemType === 'farm_orange' ? '🍊' : '🍎'}</i><span><strong>${contract.itemType === 'farm_orange' ? 'Апельсины' : 'Яблоки'} · ${Number(contract.quantity)} ед.</strong><small>${esc(contract.supplierName || contract.supplierTgId)} · ${esc(contract.supplierType === 'farm' ? 'владелец фермы' : 'игрок')}</small></span><b>${esc(status)}</b></header><div><span>Цена: <b>${formatFactoryMoney(contract.unitPrice)} / ед.</b></span><span>Качество: <b>${contract.qualityGrade === 'premium' ? 'Премиум' : 'Стандарт'}</b></span><span>Свежесть: <b>от ${Number(contract.minFreshness)}%</b></span><span>Осталось: <b>${remaining} ед.</b></span></div>${contract.terms ? `<p>${esc(contract.terms)}</p>` : ''}<footer>${isSupplier && contract.status === 'pending' ? `<button data-factory-contract-respond="${esc(contract.id)}" data-decision="accepted">Принять</button><button class="is-danger" data-factory-contract-respond="${esc(contract.id)}" data-decision="rejected">Отказаться</button>` : ''}${isSupplier && contract.status === 'active' && remaining > 0 ? `<input type="number" min="1" max="${remaining}" value="${Math.min(remaining,100)}" data-factory-contract-deliver-qty="${esc(contract.id)}"><button data-factory-contract-deliver="${esc(contract.id)}">Сдать партию</button>` : ''}</footer></article>`;
  }).join('');
}

export function enableFactoryFeature({ root, cityId }) {
  root.insertAdjacentHTML('beforeend', markup());
  const modal = root.querySelector('[data-factory-modal]');
  let currentId = '', currentPublicId = '—', currentLegal = getBusinessLegalPayload({ legalForm:'tov' }), snapshot = null, procurement = null, timer = 0, busy = false;
  const q = (s) => modal.querySelector(s);
  const qa = (s) => [...modal.querySelectorAll(s)];
  const run = async (task, errorFormatter = getFactoryError) => { if (busy) return; busy = true; modal.classList.add('is-busy'); try { await task(); await refresh(); } catch (e) { const raw=String(e?.message||e||''); notify(raw.includes('PROCUREMENT_')?getProcurementError(e):errorFormatter(e), 'error'); } finally { busy = false; modal.classList.remove('is-busy'); } };
  const refresh = async () => {
    snapshot = await loadFactorySnapshot(currentId, cityId);
    procurement = snapshot?.isOwner ? await loadProcurementSnapshot({ buyerKind:'factory', buyerId:currentId, cityId, buyerType:'food' }) : null;
    render();
  };
  function render() {
    const s = snapshot || {}, business = s.factory || {}, raw = s.raw || {}, products = s.products || {}, prices = s.wholesalePrices || {}, wages = s.productionWages || {}, batch = s.activeBatch || null;
    q('[data-factory-state]').textContent = business.ownerName ? (batch ? 'Линия работает' : 'Готов к работе') : 'Государственный';
    q('[data-factory-role]').textContent = s.roleLabel || 'Посетитель'; q('[data-factory-cash]').textContent = s.canManage ? formatFactoryMoney(business.cash) : 'Скрыто';
    q('[data-factory-buy]').hidden = Boolean(business.ownerId); q('[data-factory-owned]').hidden = !business.ownerId;
    q('[data-factory-owner]').textContent = business.ownerName || 'Государство'; q('[data-factory-legal-view]').textContent = business.legalForm || '—';
    q('[data-factory-public-id]').textContent = currentPublicId;
    q('[data-factory-purchase-legal]').textContent = `${currentLegal.legalFormLabel} · ${currentLegal.taxGroupLabel}`;
    FACTORY_RAW_ITEMS.forEach((i) => { q(`[data-factory-raw="${i.itemType}"]`).textContent = `${Number(raw[i.itemType] || 0)} ед.`; });
    Object.keys(FACTORY_RECIPES).forEach((id) => { q(`[data-factory-product="${id}"]`).textContent = `${Number(products[id] || 0)} ед.`; });
    qa('[data-factory-offer]').forEach((b) => { b.disabled = !s.canManage || Number(products[b.dataset.factoryOffer] || 0) < 1; });
    Object.keys(FACTORY_RECIPES).forEach((id) => { const input = q(`[data-factory-wholesale-price="${id}"]`); if (input && prices[id]) input.value = String(prices[id]); const offerPrice = q(`[data-factory-offer-price="${id}"]`); if (offerPrice && prices[id]) offerPrice.value = String(prices[id]); });
    Object.keys(FACTORY_RECIPES).forEach((id) => { const input = q(`[data-factory-production-wage="${id}"]`); if (input && wages[id] !== undefined) input.value = String(wages[id]); });
    qa('[data-factory-start]').forEach((b) => b.disabled = !business.ownerId || Boolean(batch));
    qa('[data-factory-deliver]').forEach((b) => b.disabled = !s.isOwner);
    renderProcurementControls(modal, 'factory', procurement, FACTORY_PROCUREMENT_ITEMS, { canManage:s.isOwner, busy });
    const line = q('[data-factory-line]'), cook = q('[data-factory-cook]'), finish = q('[data-factory-finish]');
    cook.hidden = true; finish.hidden = true;
    if (!batch) { line.querySelector('strong').textContent = 'Линия свободна'; line.querySelector('small').textContent = 'Грузчик может подать сырьё по выбранному рецепту'; }
    else {
      const recipe = FACTORY_RECIPES[batch.recipeId];
      const left = Math.max(0, Math.ceil((new Date(batch.readyAt).getTime() - Date.now()) / 1000));
      if (batch.stage === 'loaded') {
        line.querySelector('strong').textContent = `${recipe?.label || 'Партия'} · сырьё подано`;
        line.querySelector('small').textContent = 'Теперь повар должен разложить ингредиенты и начать готовку';
        cook.hidden = false; cook.disabled = !s.canCook; cook.dataset.batchId = batch.id;
      } else {
        line.querySelector('strong').textContent = `${recipe?.label || 'Партия'} · ${left ? `готовится ${left} сек.` : 'готово к упаковке'}`;
        line.querySelector('small').textContent = left ? 'Повар готовит блюдо' : 'Упаковщик может передать продукт на склад';
        finish.hidden = left > 0; finish.disabled = !s.canPack; finish.dataset.batchId = batch.id;
        clearTimeout(timer); if (left > 0) timer = setTimeout(render, 1000);
      }
    }
    qa('[data-factory-page="management"] input, [data-factory-page="management"] select, [data-factory-page="management"] button').forEach((el) => { if (!el.matches('[data-factory-purchase]')) el.disabled = !s.isOwner; });
  }
  function tab(name) { qa('[data-factory-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.factoryTab === name)); qa('[data-factory-page]').forEach((p) => p.hidden = p.dataset.factoryPage !== name); }
  const action = (selector, fn) => q(selector).addEventListener('click', () => run(fn));
  q('[data-factory-close]').onclick = () => { modal.hidden = true; clearTimeout(timer); };
  qa('[data-factory-tab]').forEach((b) => b.onclick = () => tab(b.dataset.factoryTab));
  action('[data-factory-purchase]', () => purchaseFactory(currentId, cityId));
  qa('[data-factory-start]').forEach((b) => b.onclick = () => run(() => startFactoryBatch(currentId, cityId, b.dataset.factoryStart, q(`[data-factory-ingredient="${b.dataset.factoryStart}"]`)?.value || '')));
  action('[data-factory-cook]', () => cookFactoryBatch(currentId, cityId, q('[data-factory-cook]').dataset.batchId));
  q('[data-factory-finish]').onclick = () => {
    const batch = snapshot?.batch || snapshot?.activeBatch || null;
    const recipeId = batch?.recipeId || '';
    const recipe = FACTORY_RECIPES[recipeId];

    void run(async () => {
      await finishFactoryBatch(currentId, cityId, q('[data-factory-finish]').dataset.batchId);
      await askWorkplaceTheft({
        enterpriseKind:'food_factory',
        enterpriseId:currentId,
        cityId,
        itemType:recipeId,
        itemLabel:recipe?.label || recipeId || 'Готовая продукция',
        producedQuantity:recipe?.outputQty || 1,
      });
    });
  };
  action('[data-factory-deposit]', () => depositFactory(currentId, cityId, Number(q('[data-factory-money]').value)));
  action('[data-factory-withdraw]', () => withdrawFactory(currentId, cityId, Number(q('[data-factory-money]').value)));
  qa('[data-factory-deliver]').forEach((b) => { b.onclick = () => run(async () => {
    const result = await transferFruitToFactory(currentId, cityId, b.dataset.factoryDeliver, Number(q(`[data-factory-deliver-qty="${b.dataset.factoryDeliver}"]`).value));
    window.dispatchEvent(new CustomEvent('mn:farm-inventory-changed', { detail: { inventory: result?.inventory } }));
    notify('Сырьё перемещено на склад предприятия.', 'success');
  }); });
  qa('[data-factory-offer]').forEach((b) => { b.onclick = () => {
    const recipeId = b.dataset.factoryOffer;
    const available = Number(snapshot?.products?.[recipeId] || 0);
    const quantity = Math.max(1, Math.floor(Number(q(`[data-factory-offer-qty="${recipeId}"]`).value) || 1));
    const unitPrice = Math.max(1, Math.floor(Number(q(`[data-factory-offer-price="${recipeId}"]`).value) || 1));
    if (quantity > available) {
      notify(`На складе только ${available} ед. готового товара.`, 'error');
      return;
    }
    run(async () => {
      await publishProductionOffer({
        industryId: 'fruit',
        factoryId: currentId,
        cityId,
        productType: exchangeProductType(recipeId),
        quantity,
        unitPrice,
      });
      notify(`Партия ${quantity} ед. выставлена на биржу.`, 'success');
    }, getProductionExchangeError);
  }; });
  action('[data-factory-staff-save]', () => setFactoryStaff(currentId, cityId, q('[data-factory-staff-target]').value, q('[data-factory-staff-role]').value));
  action('[data-factory-staff-remove]', () => removeFactoryStaff(currentId, cityId, q('[data-factory-staff-target]').value));
  qa('[data-factory-wholesale-save]').forEach((b) => b.onclick = () => run(() => setFactoryWholesalePrice(currentId, cityId, b.dataset.factoryWholesaleSave, Number(q(`[data-factory-wholesale-price="${b.dataset.factoryWholesaleSave}"]`).value))));
  qa('[data-factory-wage-save]').forEach((b) => b.onclick = () => run(() => setFactoryProductionWage(currentId, cityId, b.dataset.factoryWageSave, Number(q(`[data-factory-production-wage="${b.dataset.factoryWageSave}"]`).value))));
  q('[data-factory-procurement-budget-save]').onclick = () => {
    const budget = Number(q('[data-factory-procurement-budget]').value);
    run(async () => {
      await setProcurementBudget({ buyerKind:'factory', buyerId:currentId, cityId, buyerType:'food', budget });
      notify('Бюджет скупа обновлён.', 'success');
    });
  };
  const saveProcurementItem = (itemType) => {
    const unitPrice = Math.max(0, Math.floor(Number(q(`[data-factory-procurement-price="${itemType}"]`)?.value) || 0));
    const enabled = unitPrice > 0;
    const toggle = q(`[data-factory-procurement-item="${itemType}"]`);
    if (toggle) toggle.checked = enabled;
    run(async () => {
      await setProcurementItem({ buyerKind:'factory', buyerId:currentId, cityId, buyerType:'food', itemType, enabled, unitPrice });
      notify(enabled ? 'Сырьё и цена скупа сохранены.' : 'Закупка сырья отключена.', 'success');
    });
  };
  qa('[data-factory-procurement-item-save]').forEach((button) => { button.onclick = () => saveProcurementItem(button.dataset.factoryProcurementItemSave); });
  const onAction = (event) => { const object = event.detail?.object; if (objectType(object) !== 'fruit_factory') return; currentId = objectId(object); currentPublicId = getPublicBusinessId(object); currentLegal = getBusinessLegalPayload({ legalForm:'tov', ...(object?.payload || {}) }); modal.hidden = false; tab('production'); run(async () => { snapshot = await loadFactorySnapshot(currentId, cityId); render(); }); };
  window.addEventListener('mn:factory-object-action', onAction);
  return () => { clearTimeout(timer); window.removeEventListener('mn:factory-object-action', onAction); modal.remove(); };
}
