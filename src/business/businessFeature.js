import { state, save } from '../state.js';
import { supabase } from '../supabaseClient.js';
import { getCityConfig } from '../cities/index.js';
import {
  BUSINESS_PRODUCTS,
  BUSINESS_ROLE_LABELS,
  formatBusinessMoney,
  getBusinessLegalPayload,
  getBusinessProduct,
} from './businessConfig.js';
import {
  acceptBusinessTransfer,
  addBusinessCartItem,
  checkoutBusinessCart,
  createBusinessTransfer,
  deleteBusinessProcurementPlan,
  findBusinessTransferPlayer,
  fineBusiness,
  getBusinessUserErrorMessage,
  loadBusinessSnapshot,
  loadPendingBusinessTransfer,
  purchaseBusiness,
  rejectBusinessTransfer,
  removeBusinessCartItem,
  removeBusinessEmployee,
  saveBusinessProcurementPlan,
  submitBusinessDeclaration,
  updateBusinessEmployee,
  updateBusinessShelf,
  withdrawBusinessProfit,
} from './businessApi.js';
import {
  applyBusinessOwner,
  getBusinessOwnerId,
  isBusinessObject,
  normalizeBusinessForUi,
} from './businessRepository.js';
import './business.css';

// Realtime delivers normal offers immediately. The slow fallback only repairs
// a missed broadcast and avoids another permanent 2-second request per player.
const TRANSFER_POLL_MS = 15000;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function currentPlayerId() {
  return String(state.telegramId || state.player?.tg_id || state.player?.telegramId || '').trim();
}

function businessId(object) {
  return String(object?.mapObjectId || object?.objectId || object?.id || object?.payload?.mapObjectId || '').trim();
}

function businessPrice(object) {
  return Math.max(0, Math.round(Number(object?.price ?? object?.payload?.price ?? 0) || 0));
}

function isOwner(object) {
  return Boolean(currentPlayerId() && String(getBusinessOwnerId(object) || '') === currentPlayerId());
}

function cityName(cityId) {
  const value = String(cityId || '').trim();
  return value ? (getCityConfig?.(value)?.name || value) : 'Город';
}

function formatDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function isAdmin() {
  const value = state.player?.is_admin ?? state.player?.isAdmin;
  return value === true || value === 1 || value === '1' || value === 'true';
}

function toast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
}

async function sendTransferBroadcast(targetTgId, event, payload) {
  const target = String(targetTgId || '').trim();
  if (!target) return;
  const channel = supabase.channel(`mn-business-trades:${target}`);
  await new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, 1200);
    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      window.clearTimeout(timeout);
      try { await channel.send({ type: 'broadcast', event, payload }); } finally { resolve(); }
    });
  });
  supabase.removeChannel(channel);
}

function modalMarkup() {
  return `
    <div class="mn-business-details" data-business-details hidden aria-hidden="true">
      <button type="button" class="mn-business-backdrop" data-business-details-close aria-label="Закрыть"></button>
      <section class="mn-business-details-card" role="dialog" aria-modal="true">
        <header><span><small>Коммерческая недвижимость</small><strong data-business-details-name>Продуктовый магазин</strong></span><button type="button" data-business-details-close>×</button></header>
        <div class="mn-business-details-hero"><i data-business-details-icon>🛒</i><span><strong data-business-details-price>0 ₴</strong><small data-business-details-status>Свободен</small></span></div>
        <div class="mn-business-details-grid">
          <article><small>Город</small><strong data-business-details-city>—</strong></article>
          <article><small>Владелец</small><strong data-business-details-owner>Государство</strong></article>
          <article><small>Формат</small><strong>Продуктовый</strong></article>
        </div>
        <p data-business-details-copy>После покупки вы сможете вручную расставлять товар, назначать цены и нанимать сотрудников.</p>
        <div class="mn-business-legal-fixed" data-business-purchase-tax>
          <span><small>Юридическая форма</small><strong data-business-details-legal-form>ФОП</strong></span>
          <span><small>Налоговый режим</small><strong data-business-details-tax-group>2 группа · фиксированные платежи</strong></span>
          <em>Условия назначены администрацией и не меняются при покупке.</em>
        </div>
        <div class="mn-business-message" data-business-details-message hidden></div>
        <footer>
          <button type="button" data-business-details-close>Назад</button>
          <button type="button" class="is-primary" data-business-buy>Купить бизнес</button>
          <button type="button" class="is-primary" data-business-enter hidden>Войти в магазин</button>
        </footer>
      </section>
    </div>

    <div class="mn-business-store" data-business-store hidden aria-hidden="true">
      <div class="mn-business-store-shell" role="dialog" aria-modal="true">
        <div data-business-store-content></div>
      </div>
    </div>

    <div class="mn-business-transfer-offer" data-business-transfer-offer hidden aria-hidden="true">
      <div class="mn-business-backdrop"></div>
      <section role="dialog" aria-modal="true">
        <small>Предложение бизнеса</small>
        <h3 data-business-offer-name>Продуктовый магазин</h3>
        <div><span>Город</span><b data-business-offer-city>—</b></div>
        <div><span>Продавец</span><b data-business-offer-seller>Игрок</b></div>
        <div><span>Цена</span><b data-business-offer-price>0 ₴</b></div>
        <p data-business-offer-timer>Проверка сделки: 10 сек.</p>
        <p class="mn-business-offer-result" data-business-offer-result hidden></p>
        <footer><button type="button" data-business-offer-reject>N · Отказаться</button><button type="button" class="is-primary" data-business-offer-accept disabled>Y / I · Купить</button></footer>
      </section>
    </div>`;
}

function roleCanStock(role) {
  return role === 'owner' || role === 'merchandiser';
}

function roleCanAccount(role) {
  return role === 'owner' || role === 'accountant';
}

function cartQuantity(snapshot) {
  return (snapshot?.cart || []).reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
}

function cartTotal(snapshot) {
  return (snapshot?.cart || []).reduce((sum, item) => (
    sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0)
  ), 0);
}

function warehouseQuantity(snapshot, itemType) {
  const item = (snapshot?.warehouseItems || []).find((entry) => entry.itemType === itemType);
  return Math.max(0, Number(item?.quantity) || 0);
}

function productOptions(selected = '') {
  return BUSINESS_PRODUCTS.map((product) => (
    `<option value="${product.itemType}"${selected === product.itemType ? ' selected' : ''}>${product.icon} ${escapeHtml(product.label)}</option>`
  )).join('');
}

function procurementSupplierOptions(selected = 'player_checkpoint') {
  return [
    ['player_checkpoint', 'Игроки через пункт приёма'],
    ['local_farms', 'Местные фермеры'],
    ['state_wholesale', 'Государственный опт'],
    ['import_distributor', 'Импортный дистрибьютор'],
  ].map(([value, label]) => `<option value="${value}"${selected === value ? ' selected' : ''}>${label}</option>`).join('');
}

function shelvesMarkup(snapshot) {
  const canStock = roleCanStock(snapshot.role);
  return (snapshot.shelves || []).map((shelf) => {
    const product = shelf.product || getBusinessProduct(shelf.productType);
    const empty = !product || !shelf.productType;
    const available = !empty && Number(shelf.stock) > 0;
    return `
      <article class="mn-business-shelf${empty ? ' is-empty' : ''}${available ? '' : ' is-unavailable'}">
        <small>Полка ${Number(shelf.shelfNo)}</small>
        <i>${empty ? '＋' : escapeHtml(product.icon)}</i>
        <strong>${empty ? 'Пустая полка' : escapeHtml(product.label)}</strong>
        <span>${empty ? (canStock ? 'Можно заполнить товаром' : 'Товара нет') : `${formatBusinessMoney(shelf.salePrice)} · ${Number(shelf.stock)} шт.`}</span>
        <div class="mn-business-shelf-actions">
          ${available ? `<button type="button" class="is-primary" data-business-shelf-buy="${Number(shelf.shelfNo)}">Купить</button>` : ''}
          ${canStock ? `<button type="button" data-business-shelf-configure="${Number(shelf.shelfNo)}">Управлять</button>` : ''}
        </div>
      </article>`;
  }).join('');
}

function cartMarkup(snapshot) {
  const cart = snapshot.cart || [];
  if (!cart.length) return '<div class="mn-business-cart-empty"><i>🧺</i><span><strong>Корзина пуста</strong><small>Выберите товар на полке</small></span></div>';
  return cart.map((item) => {
    const product = item.product || getBusinessProduct(item.productType) || {};
    return `<article><i>${escapeHtml(product.icon || '□')}</i><span><strong>${escapeHtml(product.label || item.productType)}</strong><small>${Number(item.quantity)} × ${formatBusinessMoney(item.unitPrice)}</small></span><b>${formatBusinessMoney(Number(item.quantity) * Number(item.unitPrice))}</b><button type="button" data-business-cart-remove="${Number(item.shelfNo)}">−</button></article>`;
  }).join('');
}

function shelfDrawer(snapshot, shelfNo) {
  const shelf = (snapshot.shelves || []).find((item) => Number(item.shelfNo) === Number(shelfNo)) || { shelfNo };
  const selectedProductType = shelf.productType || BUSINESS_PRODUCTS[0]?.itemType || '';
  const availableToPlace = warehouseQuantity(snapshot, selectedProductType)
    + (shelf.productType === selectedProductType ? Math.max(0, Number(shelf.stock) || 0) : 0);
  return `
    <aside class="mn-business-drawer" data-business-drawer>
      <header><span><small>Ручная расстановка</small><strong>Полка ${Number(shelf.shelfNo)}</strong></span><button type="button" data-business-drawer-close>×</button></header>
      <label><span>Товар со склада</span><select data-business-shelf-product>${productOptions(selectedProductType)}</select><small data-business-shelf-available>Доступно для выкладки: ${availableToPlace} шт.</small></label>
      <div class="mn-business-drawer-grid">
        <label><span>Цена продажи</span><input type="number" min="1" max="1000000" value="${Number(shelf.salePrice) || getBusinessProduct(shelf.productType)?.suggestedPrice || 32}" data-business-shelf-price></label>
        <label><span>Количество на полке</span><input type="number" min="0" max="${availableToPlace}" value="${Math.min(availableToPlace, Number(shelf.stock) || 0)}" data-business-shelf-stock></label>
      </div>
      <p class="mn-business-drawer-note">При сохранении товар переносится со склада на полку. Лишний остаток и снятый товар автоматически возвращаются на склад.</p>
      <footer><button type="button" class="is-danger" data-business-shelf-clear>Убрать товар</button><button type="button" class="is-primary" data-business-shelf-save="${Number(shelf.shelfNo)}">Поставить на полку</button></footer>
    </aside>`;
}

function staffDrawer(snapshot) {
  const employees = snapshot.employees || [];
  return `
    <aside class="mn-business-drawer" data-business-drawer>
      <header><span><small>Управление магазином</small><strong>Персонал</strong></span><button type="button" data-business-drawer-close>×</button></header>
      <div class="mn-business-employee-form"><input type="text" maxlength="40" placeholder="Ник или Telegram ID" aria-label="Ник или Telegram ID сотрудника" data-business-employee-target><select aria-label="Должность сотрудника" data-business-employee-role><option value="accountant">Бухгалтер</option><option value="merchandiser">Товаровед</option></select><button type="button" class="is-primary" data-business-employee-save>Назначить</button></div>
      <div class="mn-business-employees">${employees.length ? employees.map((employee) => `
        <article><i>${employee.role === 'accountant' ? '🧾' : '📦'}</i><span><strong>${escapeHtml(employee.nickname || employee.tgId)}</strong><small>${escapeHtml(BUSINESS_ROLE_LABELS[employee.role] || employee.role)} · ID ${escapeHtml(employee.tgId)}</small></span><button type="button" data-business-employee-remove="${escapeHtml(employee.tgId)}">Уволить</button></article>`).join('') : '<p>Сотрудников пока нет.</p>'}</div>
      <p class="mn-business-drawer-note">Бухгалтер сдаёт декларации. Товаровед работает со складом, ассортиментом, остатком и ценой на полках.</p>
    </aside>`;
}

function managementDrawer(snapshot) {
  const role = snapshot.role || 'customer';
  const actions = [];
  if (role === 'owner' || role === 'merchandiser') {
    actions.push(['warehouse', '📦', 'Склад', 'Остатки товара и выкладка на полки']);
  }
  if (role === 'owner') {
    actions.push(['procurement', '🚚', 'Закупки', 'Планы поставок и бюджет']);
    actions.push(['profit', '💸', 'Прибыль', 'Перевод денег владельцу']);
    actions.push(['staff', '👥', 'Сотрудники', 'Должности и доступы']);
    actions.push(['transfer', '⇄', 'Передача бизнеса', 'Продажа другому игроку']);
  }
  if (roleCanAccount(role)) {
    actions.push(['tax', '🧾', 'Бухгалтерия', 'Налоги и декларации']);
  }
  if (isAdmin()) {
    actions.push(['fine', '⚖', 'Администрирование', 'Назначить штраф бизнесу']);
  }
  return `
    <aside class="mn-business-drawer is-management" data-business-drawer>
      <header><span><small>${escapeHtml(BUSINESS_ROLE_LABELS[role] || 'Управление')}</small><strong>Управление магазином</strong></span><button type="button" data-business-drawer-close>×</button></header>
      <div class="mn-business-management-grid">
        ${actions.map(([mode, icon, title, copy]) => `<button type="button" data-business-management-open="${mode}"><i>${icon}</i><span><strong>${title}</strong><small>${copy}</small></span><b>›</b></button>`).join('')}
      </div>
      <p class="mn-business-drawer-note">Здесь показаны только разделы, доступные вашей должности. Покупка товаров остаётся в обычном торговом зале.</p>
    </aside>`;
}

function warehouseDrawer(snapshot) {
  const warehouseItems = BUSINESS_PRODUCTS.map((product) => ({
    ...product,
    quantity: warehouseQuantity(snapshot, product.itemType),
  }));
  const warehouseTotal = warehouseItems.reduce((sum, item) => sum + item.quantity, 0);
  const shelfTotal = (snapshot.shelves || []).reduce((sum, shelf) => sum + Math.max(0, Number(shelf.stock) || 0), 0);
  return `
    <aside class="mn-business-drawer is-warehouse" data-business-drawer>
      <header><span><small>Учёт товара</small><strong>Склад магазина</strong></span><button type="button" data-business-drawer-close>×</button></header>
      <div class="mn-business-warehouse-summary">
        <span><small>На складе</small><strong>${warehouseTotal} шт.</strong></span>
        <span><small>На полках</small><strong>${shelfTotal} шт.</strong></span>
      </div>
      <div class="mn-business-warehouse-list">
        ${warehouseItems.map((item) => `<article${item.quantity > 0 ? '' : ' class="is-empty"'}><i>${escapeHtml(item.icon)}</i><span><strong>${escapeHtml(item.label)}</strong><small>${item.quantity > 0 ? 'Можно разместить на полке' : 'Нет на складе'}</small></span><b>${item.quantity} шт.</b></article>`).join('')}
      </div>
      <p class="mn-business-drawer-note">Чтобы выложить товар, закройте управление и нажмите «Управлять» на нужной полке. Поставки по планам закупок будут поступать сюда после подключения пункта приёма.</p>
    </aside>`;
}

function procurementDrawer(snapshot, selectedProductType = '') {
  const plans = Array.isArray(snapshot.procurementPlans) ? snapshot.procurementPlans : [];
  const productType = String(selectedProductType || plans[0]?.productType || BUSINESS_PRODUCTS[0]?.itemType || '');
  const product = getBusinessProduct(productType) || BUSINESS_PRODUCTS[0];
  const plan = plans.find((entry) => entry.productType === productType) || null;
  const targetQuantity = Math.max(1, Number(plan?.targetQuantity) || 100);
  const unitPrice = Math.max(1, Number(plan?.unitPrice) || Math.max(1, Math.round(Number(product?.suggestedPrice || 10) * 0.65)));
  const requiredBudget = targetQuantity * unitPrice;
  const allocatedBudget = Math.max(requiredBudget, Number(plan?.allocatedBudget) || requiredBudget);
  return `
    <aside class="mn-business-drawer is-procurement" data-business-drawer>
      <header><span><small>Только для владельца</small><strong>План закупки</strong></span><button type="button" data-business-drawer-close>×</button></header>
      <label><span>Какой товар закупаем</span><select data-business-procurement-product>${productOptions(productType)}</select></label>
      <div class="mn-business-drawer-grid">
        <label><span>Количество</span><input type="number" min="1" max="1000000" inputmode="numeric" value="${targetQuantity}" data-business-procurement-quantity></label>
        <label><span>Цена за единицу</span><input type="number" min="1" max="1000000" inputmode="numeric" value="${unitPrice}" data-business-procurement-price></label>
      </div>
      <label><span>У кого закупаем</span><select data-business-procurement-supplier>${procurementSupplierOptions(plan?.supplierCode)}</select></label>
      <label><span>Выделенный бюджет</span><input type="number" min="1" max="1000000000" inputmode="numeric" value="${allocatedBudget}" data-business-procurement-budget><small>Сейчас сумма только записывается в план и не списывается со счёта бизнеса.</small></label>
      <div class="mn-business-procurement-preview" data-business-procurement-preview>
        <span><small>Стоимость партии</small><strong data-business-procurement-required>${formatBusinessMoney(requiredBudget)}</strong></span>
        <span><small>Запас бюджета</small><strong data-business-procurement-reserve>${formatBusinessMoney(allocatedBudget - requiredBudget)}</strong></span>
      </div>
      <button type="button" class="is-primary mn-business-procurement-save" data-business-procurement-save>Сохранить план закупки</button>
      <p class="mn-business-drawer-note">Это подготовка под будущие поставки. Позже игрок сможет привезти выбранный товар на пункт приёма и получить оплату из указанного бюджета.</p>
      <div class="mn-business-procurement-list">
        <header><strong>Сохранённые планы</strong><span>${formatBusinessMoney(snapshot.plannedProcurementBudget || 0)} всего</span></header>
        ${plans.length ? plans.map((entry) => {
          const entryProduct = entry.product || getBusinessProduct(entry.productType) || {};
          return `<article${entry.productType === productType ? ' class="is-selected"' : ''}>
            <i>${escapeHtml(entryProduct.icon || '📦')}</i>
            <span><strong>${escapeHtml(entryProduct.label || entry.productType)}</strong><small>${Number(entry.targetQuantity)} шт. × ${formatBusinessMoney(entry.unitPrice)} · ${escapeHtml(entry.supplierName || 'Поставщик')}</small></span>
            <b>${formatBusinessMoney(entry.allocatedBudget)}</b>
            <button type="button" data-business-procurement-edit="${escapeHtml(entry.productType)}">Изменить</button>
            <button type="button" class="is-danger" data-business-procurement-delete="${escapeHtml(entry.productType)}">Удалить</button>
          </article>`;
        }).join('') : '<p>Планов закупки пока нет.</p>'}
      </div>
    </aside>`;
}

function taxDrawer(snapshot) {
  const preview = snapshot.taxPreview || {};
  const declarations = snapshot.declarations || [];
  const legal = getBusinessLegalPayload(snapshot);
  const declarationOpen = !snapshot.declarationAvailableAt || Date.now() >= new Date(snapshot.declarationAvailableAt).getTime();
  return `
    <aside class="mn-business-drawer" data-business-drawer>
      <header><span><small>Налоговая отчётность · 2026</small><strong>${escapeHtml(legal.legalFormLabel)} · ${escapeHtml(legal.taxGroupLabel)}</strong></span><button type="button" data-business-drawer-close>×</button></header>
      <div class="mn-business-tax-summary">
        <article><small>Оборот недели</small><strong>${formatBusinessMoney(snapshot.revenueCurrentWeek)}</strong></article>
        <article><small>К уплате за период</small><strong>${formatBusinessMoney(preview.total)}</strong></article>
        <article><small>Налоговый долг</small><strong>${formatBusinessMoney(snapshot.taxDebt)}</strong></article>
        <article><small>Штрафы</small><strong>${formatBusinessMoney(snapshot.fineDebt)}</strong></article>
      </div>
      <div class="mn-business-tax-locked"><span>Условия регистрации</span><strong>${escapeHtml(legal.legalFormLabel)} · ${escapeHtml(legal.taxGroupLabel)}</strong><small>Юридическую форму и налоговый режим назначает администрация при размещении бизнеса.</small></div>
      <div class="mn-business-tax-lines"><p><span>Единый налог</span><b>${formatBusinessMoney(preview.singleTax)}</b></p><p><span>Военный сбор</span><b>${formatBusinessMoney(preview.militaryLevy)}</b></p><p><span>ЕСВ</span><b>${formatBusinessMoney(preview.socialContribution)}</b></p><p><span>Срок</span><b>${formatDate(snapshot.declarationDueAt)}</b></p></div>
      <button type="button" class="is-primary mn-business-declare" data-business-declare${declarationOpen ? '' : ' disabled'}>${declarationOpen ? 'Сдать недельную декларацию' : `Откроется ${formatDate(snapshot.declarationAvailableAt)}`}</button>
      <p class="mn-business-drawer-note">Налоговый период длится 7 игровых дней. После пропуска срока начисление переходит в задолженность. Штраф назначается отдельно по правилам проекта.</p>
      <div class="mn-business-declarations"><strong>Последние декларации</strong>${declarations.length ? declarations.map((entry) => `<p data-status="${escapeHtml(entry.status)}"><span>${formatDate(entry.submittedAt)} · ${escapeHtml(legal.legalFormLabel)} ${Number(entry.taxGroup)}</span><b>${formatBusinessMoney(entry.assessedTotal)} / оплачено ${formatBusinessMoney(entry.paidTotal)}</b></p>`).join('') : '<small>Деклараций пока нет.</small>'}</div>
    </aside>`;
}

function profitDrawer(snapshot) {
  const cashBalance = Math.max(0, Number(snapshot.cashBalance) || 0);
  const playerBalance = Math.max(0, Number(snapshot.playerBalance ?? state.player?.balance) || 0);
  const taxDebt = Math.max(0, Number(snapshot.taxDebt) || 0);
  const fineDebt = Math.max(0, Number(snapshot.fineDebt) || 0);
  const hasDebt = taxDebt + fineDebt > 0;
  return `
    <aside class="mn-business-drawer is-profit" data-business-drawer>
      <header><span><small>Финансы владельца</small><strong>Снять прибыль</strong></span><button type="button" data-business-drawer-close>×</button></header>
      <div class="mn-business-profit-summary">
        <article><small>Доступно на счёте бизнеса</small><strong>${formatBusinessMoney(cashBalance)}</strong></article>
        <article><small>Личный баланс сейчас</small><strong>${formatBusinessMoney(playerBalance)}</strong></article>
      </div>
      ${hasDebt ? `<div class="mn-business-profit-blocked"><strong>Снятие временно недоступно</strong><span>Налоговый долг: ${formatBusinessMoney(taxDebt)} · штрафы: ${formatBusinessMoney(fineDebt)}. Сначала закройте задолженность.</span></div>` : ''}
      <label><span>Сумма снятия</span><input type="number" min="1" max="${cashBalance}" inputmode="numeric" placeholder="Введите сумму" data-business-profit-amount${cashBalance > 0 && !hasDebt ? '' : ' disabled'}><small>Деньги будут переведены со счёта бизнеса на ваш личный баланс.</small></label>
      <footer>
        <button type="button" data-business-profit-all${cashBalance > 0 && !hasDebt ? '' : ' disabled'}>Снять всё</button>
        <button type="button" class="is-primary" data-business-profit-withdraw${cashBalance > 0 && !hasDebt ? '' : ' disabled'}>Снять прибыль</button>
      </footer>
      <p class="mn-business-drawer-note">Снять прибыль может только владелец. Операция записывается в историю бизнеса и не отменяется после подтверждения.</p>
    </aside>`;
}

function transferDrawer(snapshot, foundPlayer = null) {
  return `
    <aside class="mn-business-drawer" data-business-drawer>
      <header><span><small>Сделка между игроками</small><strong>Продать бизнес</strong></span><button type="button" data-business-drawer-close>×</button></header>
      <label><span>Ник или Telegram ID покупателя</span><div class="mn-business-inline"><input type="text" maxlength="40" value="${escapeHtml(foundPlayer?.nickname || '')}" data-business-transfer-target><button type="button" data-business-transfer-find>Проверить</button></div></label>
      ${foundPlayer ? `<div class="mn-business-found-player"><i>●</i><span><strong>${escapeHtml(foundPlayer.nickname)}</strong><small>Онлайн · ID ${escapeHtml(foundPlayer.tgId)}</small></span></div><label><span>Цена сделки</span><input type="number" min="1" max="1000000000" data-business-transfer-price placeholder="Введите цену"></label><button type="button" class="is-primary" data-business-transfer-send="${escapeHtml(foundPlayer.tgId)}">Отправить предложение</button>` : ''}
      <p class="mn-business-drawer-note">Покупатель получит предложение сделки. Подтверждение станет доступно через 10 секунд. Комиссия — 10% от цены. Бизнес с налоговой задолженностью передать нельзя.</p>
    </aside>`;
}

function fineDrawer() {
  return `
    <aside class="mn-business-drawer" data-business-drawer>
      <header><span><small>Контроль бизнеса</small><strong>Назначить штраф</strong></span><button type="button" data-business-drawer-close>×</button></header>
      <label><span>Сумма штрафа</span><input type="number" min="1" max="1000000000" data-business-fine-amount></label>
      <label><span>Основание по правилам проекта</span><textarea maxlength="300" rows="4" data-business-fine-reason></textarea></label>
      <button type="button" class="is-danger" data-business-fine-send>Начислить штраф</button>
    </aside>`;
}

function storeMarkup(snapshot, drawerMode = '', drawerData = null) {
  const quantity = cartQuantity(snapshot);
  const role = snapshot.role || 'customer';
  const financeVisible = roleCanAccount(role);
  const managementVisible = ['owner', 'accountant', 'merchandiser'].includes(role) || isAdmin();
  let drawer = '';
  if (drawerMode === 'management') drawer = managementDrawer(snapshot);
  if (drawerMode === 'warehouse') drawer = warehouseDrawer(snapshot);
  if (drawerMode === 'shelf') drawer = shelfDrawer(snapshot, drawerData);
  if (drawerMode === 'staff') drawer = staffDrawer(snapshot);
  if (drawerMode === 'procurement') drawer = procurementDrawer(snapshot, drawerData);
  if (drawerMode === 'profit') drawer = profitDrawer(snapshot);
  if (drawerMode === 'tax') drawer = taxDrawer(snapshot);
  if (drawerMode === 'transfer') drawer = transferDrawer(snapshot, drawerData);
  if (drawerMode === 'fine') drawer = fineDrawer();
  return `
    <header class="mn-business-store-header">
      <span><small>${escapeHtml(cityName(snapshot.cityId))} · продуктовый</small><strong>🛒 ${escapeHtml(snapshot.name || 'Продуктовый магазин')}</strong></span>
      <div><b>${escapeHtml(BUSINESS_ROLE_LABELS[role] || 'Покупатель')}</b>${financeVisible ? `<em>Счёт ${formatBusinessMoney(snapshot.cashBalance)}</em>` : ''}</div>
    </header>
    <main class="mn-business-store-main">
      <section class="mn-business-sales-floor">
        <div class="mn-business-aisle-title"><span><small>Торговый зал</small><strong>${roleCanStock(role) ? 'Покупайте товар или управляйте полками' : 'Выберите товары и оплатите их на кассе'}</strong></span></div>
        <div class="mn-business-shelves">${shelvesMarkup(snapshot)}</div>
        <div class="mn-business-checkout-counter"><i>▤</i><span><small>Касса</small><strong>${quantity ? `${quantity} шт. в корзине` : 'Корзина пуста'}</strong></span><button type="button" data-business-checkout${quantity ? '' : ' disabled'}>Оплатить ${formatBusinessMoney(cartTotal(snapshot))}</button></div>
      </section>
      <aside class="mn-business-cart">
        <header><span><small>До оплаты</small><strong>Корзина</strong></span><b>${quantity} шт.</b></header>
        <div>${cartMarkup(snapshot)}</div>
        <footer><span>Итого</span><strong>${formatBusinessMoney(cartTotal(snapshot))}</strong></footer>
      </aside>
    </main>
    <div class="mn-business-store-message" data-business-store-message hidden></div>
    <footer class="mn-business-store-footer">
      <button type="button" data-business-store-exit>🚪 Выйти</button>
      <span></span>
      ${managementVisible ? '<button type="button" class="is-primary" data-business-open-management>⚙ Управление</button>' : ''}
      <button type="button" data-business-refresh>↻</button>
    </footer>
    ${drawer}`;
}

export function enableBusinessFeature(root, { cityId: activeCityId } = {}) {
  if (!root) return () => {};
  document.querySelectorAll('[data-business-details], [data-business-store], [data-business-transfer-offer]').forEach((element) => element.remove());
  document.body.insertAdjacentHTML('beforeend', modalMarkup());
  const detailsModal = document.querySelector('[data-business-details]');
  const storeModal = document.querySelector('[data-business-store]');
  const storeContent = storeModal?.querySelector('[data-business-store-content]');
  const offerModal = document.querySelector('[data-business-transfer-offer]');
  let activeObject = null;
  let snapshot = null;
  let drawerMode = '';
  let drawerData = null;
  let busy = false;
  let activeOffer = null;
  let lastOfferId = '';
  let offerTimer = 0;
  let destroyed = false;

  function setBodyOpen() {
    document.body.classList.toggle('mn-business-open', detailsModal?.hidden === false || storeModal?.hidden === false || offerModal?.hidden === false);
  }

  function setDetailsMessage(message = '', type = 'info') {
    const element = detailsModal?.querySelector('[data-business-details-message]');
    if (!element) return;
    element.hidden = !message;
    element.textContent = message;
    element.dataset.type = type;
  }

  function setStoreMessage(message = '', type = 'info') {
    const element = storeContent?.querySelector('[data-business-store-message]');
    if (!element) return;
    element.hidden = !message;
    element.textContent = message;
    element.dataset.type = type;
  }

  function renderDetails() {
    if (!activeObject || !detailsModal) return;
    const ownerId = getBusinessOwnerId(activeObject);
    const ownerName = activeObject.ownerName || activeObject.payload?.ownerName || activeObject.payload?.owner_name;
    const owned = Boolean(ownerId);
    const legal = getBusinessLegalPayload(activeObject);
    detailsModal.querySelector('[data-business-details-name]').textContent = activeObject.name || 'Продуктовый магазин';
    detailsModal.querySelector('[data-business-details-icon]').textContent = activeObject.icon || '🛒';
    detailsModal.querySelector('[data-business-details-price]').textContent = owned ? 'Действующий бизнес' : formatBusinessMoney(businessPrice(activeObject));
    detailsModal.querySelector('[data-business-details-status]').textContent = owned ? (isOwner(activeObject) ? 'Ваш бизнес' : 'Магазин открыт') : 'Продаётся государством';
    detailsModal.querySelector('[data-business-details-city]').textContent = cityName(activeObject.cityId || activeObject.city_id || activeObject.payload?.cityId || activeCityId);
    detailsModal.querySelector('[data-business-details-owner]').textContent = owned ? String(ownerName || ownerId) : 'Государство';
    detailsModal.querySelector('[data-business-details-legal-form]').textContent = legal.legalFormLabel;
    detailsModal.querySelector('[data-business-details-tax-group]').textContent = legal.taxGroupLabel;
    detailsModal.querySelector('[data-business-details-copy]').textContent = owned
      ? (isOwner(activeObject) ? 'Вы владелец. Внутри доступны полки, закупки, сотрудники, касса, налоги и передача игроку.' : 'Зайдите, выберите товар на полках и оплатите его на кассе. С неоплаченной корзиной выйти нельзя.')
      : 'После покупки вы сможете вручную расставлять товар, назначать цены, нанимать сотрудников и сдавать недельные декларации.';
    detailsModal.querySelector('[data-business-buy]').hidden = owned;
    detailsModal.querySelector('[data-business-enter]').hidden = !owned;
  }

  function openDetails(object) {
    activeObject = normalizeBusinessForUi(object);
    snapshot = null;
    setDetailsMessage('');
    renderDetails();
    detailsModal.hidden = false;
    detailsModal.setAttribute('aria-hidden', 'false');
    setBodyOpen();
  }

  function closeDetails() {
    if (!detailsModal) return;
    detailsModal.hidden = true;
    detailsModal.setAttribute('aria-hidden', 'true');
    setBodyOpen();
  }

  function renderStore() {
    if (!storeContent || !snapshot) return;
    storeContent.innerHTML = storeMarkup(snapshot, drawerMode, drawerData);
  }

  async function refreshStore({ preserveDrawer = true } = {}) {
    if (!activeObject) return;
    const next = await loadBusinessSnapshot(businessId(activeObject));
    if (destroyed) return;
    snapshot = next;
    if (!preserveDrawer) { drawerMode = ''; drawerData = null; }
    renderStore();
  }

  async function openStore() {
    if (!activeObject || busy) return;
    busy = true;
    setDetailsMessage('Загружаем магазин…');
    try {
      snapshot = await loadBusinessSnapshot(businessId(activeObject));
      drawerMode = '';
      drawerData = null;
      closeDetails();
      renderStore();
      storeModal.hidden = false;
      storeModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('mn-business-store-open');
      setBodyOpen();
    } catch (error) {
      setDetailsMessage(getBusinessUserErrorMessage(error), 'error');
    } finally { busy = false; }
  }

  function tryCloseStore() {
    if (!storeModal || storeModal.hidden) return true;
    if (cartQuantity(snapshot) > 0) {
      setStoreMessage('С неоплаченным товаром выйти нельзя. Оплатите корзину на кассе или уберите из неё все товары.', 'error');
      return false;
    }
    storeModal.hidden = true;
    storeModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mn-business-store-open');
    drawerMode = '';
    drawerData = null;
    setBodyOpen();
    return true;
  }

  async function runStoreAction(action, successMessage = '') {
    if (busy) return;
    busy = true;
    setStoreMessage('Выполняем действие…');
    try {
      const result = await action();
      if (result?.role && Array.isArray(result?.shelves)) snapshot = { ...(snapshot || {}), ...result };
      else if (result?.procurementPlans && snapshot) snapshot = { ...snapshot, ...result };
      else if (snapshot && Number.isFinite(Number(result?.businessCashBalance))) {
        snapshot = {
          ...snapshot,
          cashBalance: Number(result.businessCashBalance),
          playerBalance: Number(result.playerBalance ?? snapshot.playerBalance),
        };
      }
      renderStore();
      if (successMessage) { setStoreMessage(successMessage, 'success'); toast(successMessage, 'success'); }
      return result;
    } catch (error) {
      const message = getBusinessUserErrorMessage(error);
      setStoreMessage(message, 'error');
      toast(message, 'error');
      return null;
    } finally { busy = false; }
  }

  async function handleBuy() {
    if (!activeObject || busy) return;
    const legal = getBusinessLegalPayload(activeObject);
    busy = true;
    setDetailsMessage('Оформляем бизнес…');
    try {
      const result = await purchaseBusiness(businessId(activeObject));
      const ownerId = result.ownerTgId || currentPlayerId();
      const ownerName = result.ownerName || state.nickname || state.player?.nickname || 'Игрок';
      applyBusinessOwner(activeObject, { ownerId, ownerName });
      const nextBalance = Number(result.newBalance ?? result.playerBalance);
      if (Number.isFinite(nextBalance)) {
        state.player = { ...(state.player || {}), balance: nextBalance };
        save();
        window.dispatchEvent(new CustomEvent('mn:player-balance-changed', { detail: { balance: nextBalance, source: 'buy_business', result } }));
      }
      window.dispatchEvent(new CustomEvent('mn:map-object-broadcast-request', { detail: {
        cityId: result.cityId || activeObject.cityId || activeCityId,
        mapObjectId: businessId(activeObject), ownerId, ownerName,
      } }));
      window.dispatchEvent(new CustomEvent('mn:businesses-updated', { detail: { cityId: result.cityId || activeCityId, businessId: businessId(activeObject), result } }));
      renderDetails();
      setDetailsMessage(`Бизнес куплен. Условия: ${result.legalFormLabel || legal.legalFormLabel} · ${result.taxGroupLabel || legal.taxGroupLabel}.`, 'success');
    } catch (error) {
      setDetailsMessage(getBusinessUserErrorMessage(error), 'error');
    } finally { busy = false; }
  }

  function updateProcurementPreview() {
    const preview = storeContent?.querySelector('[data-business-procurement-preview]');
    if (!preview) return;
    const quantity = Math.max(0, Math.floor(Number(storeContent.querySelector('[data-business-procurement-quantity]')?.value || 0)));
    const unitPrice = Math.max(0, Math.floor(Number(storeContent.querySelector('[data-business-procurement-price]')?.value || 0)));
    const budget = Math.max(0, Math.floor(Number(storeContent.querySelector('[data-business-procurement-budget]')?.value || 0)));
    const required = quantity * unitPrice;
    const reserve = budget - required;
    const requiredElement = preview.querySelector('[data-business-procurement-required]');
    const reserveElement = preview.querySelector('[data-business-procurement-reserve]');
    if (requiredElement) requiredElement.textContent = formatBusinessMoney(required);
    if (reserveElement) reserveElement.textContent = reserve >= 0
      ? formatBusinessMoney(reserve)
      : `Не хватает ${formatBusinessMoney(Math.abs(reserve))}`;
    preview.dataset.state = reserve < 0 ? 'error' : 'ready';
  }

  function handleStoreInput(event) {
    if (event.target?.closest?.('[data-business-procurement-quantity], [data-business-procurement-price], [data-business-procurement-budget]')) {
      updateProcurementPreview();
    }
  }

  function handleStoreChange(event) {
    const productSelect = event.target?.closest?.('[data-business-procurement-product]');
    if (productSelect) {
      drawerMode = 'procurement';
      drawerData = productSelect.value || '';
      renderStore();
      return;
    }
    const shelfProductSelect = event.target?.closest?.('[data-business-shelf-product]');
    if (shelfProductSelect) {
      const shelf = (snapshot.shelves || []).find((entry) => Number(entry.shelfNo) === Number(drawerData));
      const productType = shelfProductSelect.value || '';
      const available = warehouseQuantity(snapshot, productType)
        + (shelf?.productType === productType ? Math.max(0, Number(shelf.stock) || 0) : 0);
      const availableLabel = storeContent.querySelector('[data-business-shelf-available]');
      const stockInput = storeContent.querySelector('[data-business-shelf-stock]');
      if (availableLabel) availableLabel.textContent = `Доступно для выкладки: ${available} шт.`;
      if (stockInput) {
        stockInput.max = String(available);
        if (Number(stockInput.value) > available) stockInput.value = String(available);
      }
    }
  }

  async function handleStoreClick(event) {
    const target = event.target;
    if (!(target instanceof Element) || busy) return;
    if (target.closest('[data-business-store-exit]')) { tryCloseStore(); return; }
    if (target.closest('[data-business-refresh]')) { await runStoreAction(() => refreshStore({ preserveDrawer: false }), 'Магазин обновлён.'); return; }
    if (target.closest('[data-business-drawer-close]')) { drawerMode = ''; drawerData = null; renderStore(); return; }
    if (target.closest('[data-business-open-management]')) {
      drawerMode = 'management';
      drawerData = null;
      renderStore();
      return;
    }
    const managementOpen = target.closest('[data-business-management-open]');
    if (managementOpen) {
      const mode = managementOpen.dataset.businessManagementOpen || '';
      const allowed = (mode === 'warehouse' && ['owner', 'merchandiser'].includes(snapshot.role))
        || (mode === 'procurement' && snapshot.role === 'owner')
        || (mode === 'profit' && snapshot.role === 'owner')
        || (mode === 'staff' && snapshot.role === 'owner')
        || (mode === 'transfer' && snapshot.role === 'owner')
        || (mode === 'tax' && roleCanAccount(snapshot.role))
        || (mode === 'fine' && isAdmin());
      if (!allowed) return;
      drawerMode = mode;
      drawerData = mode === 'procurement'
        ? (snapshot.procurementPlans?.[0]?.productType || BUSINESS_PRODUCTS[0]?.itemType || '')
        : null;
      renderStore();
      return;
    }
    if (target.closest('[data-business-profit-all]')) {
      if (snapshot.role !== 'owner') return;
      const input = storeContent.querySelector('[data-business-profit-amount]');
      if (input) {
        input.value = String(Math.max(0, Math.floor(Number(snapshot.cashBalance) || 0)));
        input.focus();
      }
      return;
    }
    if (target.closest('[data-business-profit-withdraw]')) {
      if (snapshot.role !== 'owner') return;
      const amount = Number(storeContent.querySelector('[data-business-profit-amount]')?.value || 0);
      const result = await runStoreAction(() => withdrawBusinessProfit({
        businessId: snapshot.businessId,
        amount,
      }), 'Прибыль переведена на личный баланс.');
      const balance = Number(result?.playerBalance);
      if (Number.isFinite(balance)) {
        state.player = { ...(state.player || {}), balance };
        save();
        window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
          detail: { balance, source: 'business_profit_withdrawal', result },
        }));
      }
      return;
    }

    const procurementEdit = target.closest('[data-business-procurement-edit]');
    if (procurementEdit) {
      drawerMode = 'procurement';
      drawerData = procurementEdit.dataset.businessProcurementEdit || '';
      renderStore();
      return;
    }
    const procurementDelete = target.closest('[data-business-procurement-delete]');
    if (procurementDelete) {
      const productType = procurementDelete.dataset.businessProcurementDelete || '';
      const result = await runStoreAction(() => deleteBusinessProcurementPlan({
        businessId: snapshot.businessId,
        productType,
      }), 'План закупки удалён.');
      if (result) {
        drawerMode = 'procurement';
        drawerData = result.procurementPlans?.[0]?.productType || BUSINESS_PRODUCTS[0]?.itemType || '';
        renderStore();
      }
      return;
    }
    if (target.closest('[data-business-procurement-save]')) {
      const productType = storeContent.querySelector('[data-business-procurement-product]')?.value || '';
      const targetQuantity = Number(storeContent.querySelector('[data-business-procurement-quantity]')?.value || 0);
      const unitPrice = Number(storeContent.querySelector('[data-business-procurement-price]')?.value || 0);
      const supplierCode = storeContent.querySelector('[data-business-procurement-supplier]')?.value || 'player_checkpoint';
      const allocatedBudget = Number(storeContent.querySelector('[data-business-procurement-budget]')?.value || 0);
      const result = await runStoreAction(() => saveBusinessProcurementPlan({
        businessId: snapshot.businessId,
        productType,
        targetQuantity,
        unitPrice,
        supplierCode,
        allocatedBudget,
      }), 'План закупки сохранён. Деньги пока не списываются.');
      if (result) {
        drawerMode = 'procurement';
        drawerData = productType;
        renderStore();
      }
      return;
    }

    const shelfConfigureButton = target.closest('[data-business-shelf-configure]');
    if (shelfConfigureButton) {
      const shelfNo = Number(shelfConfigureButton.dataset.businessShelfConfigure);
      if (!roleCanStock(snapshot.role)) return;
      drawerMode = 'shelf';
      drawerData = shelfNo;
      renderStore();
      return;
    }

    const shelfBuyButton = target.closest('[data-business-shelf-buy]');
    if (shelfBuyButton) {
      const shelfNo = Number(shelfBuyButton.dataset.businessShelfBuy);
      const shelf = (snapshot.shelves || []).find((item) => Number(item.shelfNo) === shelfNo);
      if (!shelf?.productType || Number(shelf.stock) < 1) { setStoreMessage('На этой полке товара нет.', 'error'); return; }
      await runStoreAction(() => addBusinessCartItem({ businessId: snapshot.businessId, shelfNo, quantity: 1 }), `${shelf.product?.label || 'Товар'} добавлен в корзину.`);
      return;
    }

    const removeButton = target.closest('[data-business-cart-remove]');
    if (removeButton) {
      const shelfNo = Number(removeButton.dataset.businessCartRemove);
      await runStoreAction(() => removeBusinessCartItem({ businessId: snapshot.businessId, shelfNo, quantity: 1 }));
      return;
    }

    if (target.closest('[data-business-checkout]')) {
      const result = await runStoreAction(() => checkoutBusinessCart(snapshot.businessId), 'Покупка оплачена. Товар добавлен в инвентарь.');
      const balance = Number(result?.newBalance ?? result?.playerBalance);
      if (Number.isFinite(balance)) {
        state.player = { ...(state.player || {}), balance };
        save();
        window.dispatchEvent(new CustomEvent('mn:player-balance-changed', { detail: { balance, source: 'business_checkout', result } }));
      }
      if (result) window.dispatchEvent(new CustomEvent('mn:business-inventory-changed', { detail: { result } }));
      return;
    }

    const shelfSave = target.closest('[data-business-shelf-save]');
    if (shelfSave) {
      const shelfNo = Number(shelfSave.dataset.businessShelfSave);
      const productType = storeContent.querySelector('[data-business-shelf-product]')?.value || '';
      const salePrice = Number(storeContent.querySelector('[data-business-shelf-price]')?.value || 0);
      const stock = Number(storeContent.querySelector('[data-business-shelf-stock]')?.value || 0);
      const currentShelf = (snapshot.shelves || []).find((entry) => Number(entry.shelfNo) === shelfNo);
      const supplierCode = currentShelf?.supplierCode || 'state_wholesale';
      const result = await runStoreAction(() => updateBusinessShelf({ businessId: snapshot.businessId, shelfNo, productType, salePrice, stock, supplierCode }), 'Товар вручную расставлен на полке.');
      if (result) { drawerMode = ''; drawerData = null; renderStore(); }
      return;
    }
    if (target.closest('[data-business-shelf-clear]')) {
      const shelfNo = Number(drawerData);
      const result = await runStoreAction(() => updateBusinessShelf({ businessId: snapshot.businessId, shelfNo, productType: '', salePrice: 0, stock: 0, supplierCode: 'state_wholesale' }), 'Товар убран с полки.');
      if (result) { drawerMode = ''; drawerData = null; renderStore(); }
      return;
    }

    if (target.closest('[data-business-employee-save]')) {
      const employeeTarget = storeContent.querySelector('[data-business-employee-target]')?.value || '';
      const role = storeContent.querySelector('[data-business-employee-role]')?.value || '';
      await runStoreAction(() => updateBusinessEmployee({ businessId: snapshot.businessId, target: employeeTarget, role }), 'Сотрудник назначен.');
      return;
    }
    const employeeRemove = target.closest('[data-business-employee-remove]');
    if (employeeRemove) {
      await runStoreAction(() => removeBusinessEmployee({ businessId: snapshot.businessId, targetTgId: employeeRemove.dataset.businessEmployeeRemove }), 'Сотрудник снят с должности.');
      return;
    }

    if (target.closest('[data-business-declare]')) {
      await runStoreAction(() => submitBusinessDeclaration(snapshot.businessId), 'Декларация передана в игровую налоговую.');
      return;
    }
    if (target.closest('[data-business-transfer-find]')) {
      const value = storeContent.querySelector('[data-business-transfer-target]')?.value || '';
      const player = await runStoreAction(() => findBusinessTransferPlayer(value));
      if (player) { drawerMode = 'transfer'; drawerData = player; renderStore(); }
      return;
    }
    const transferSend = target.closest('[data-business-transfer-send]');
    if (transferSend) {
      const price = Number(storeContent.querySelector('[data-business-transfer-price]')?.value || 0);
      const result = await runStoreAction(() => createBusinessTransfer({ businessId: snapshot.businessId, buyerTgId: transferSend.dataset.businessTransferSend, price }), 'Предложение отправлено покупателю.');
      if (result) {
        void sendTransferBroadcast(result.buyerTgId, 'offer_created', result);
        drawerMode = ''; drawerData = null; renderStore();
      }
      return;
    }
    if (target.closest('[data-business-fine-send]')) {
      const amount = Number(storeContent.querySelector('[data-business-fine-amount]')?.value || 0);
      const reason = storeContent.querySelector('[data-business-fine-reason]')?.value || '';
      const result = await runStoreAction(() => fineBusiness({ businessId: snapshot.businessId, amount, reason }), 'Штраф начислен бизнесу.');
      if (result) await refreshStore({ preserveDrawer: false });
    }
  }

  function renderOfferTimer() {
    if (!activeOffer || !offerModal || offerModal.hidden) return;
    const seconds = Math.max(0, Math.ceil((new Date(activeOffer.unlockAt).getTime() - Date.now()) / 1000));
    const accept = offerModal.querySelector('[data-business-offer-accept]');
    accept.disabled = busy || seconds > 0;
    offerModal.querySelector('[data-business-offer-timer]').textContent = seconds > 0
      ? `На обдумывание: ${seconds} сек. После таймера Y / I станет активной.`
      : 'Решение доступно: Y на ПК или I на мобильном.';
  }

  function showOffer(offer) {
    if (!offer?.offerId || offer.status !== 'pending' || !offerModal) return;
    activeOffer = offer;
    lastOfferId = String(offer.offerId);
    offerModal.querySelector('[data-business-offer-name]').textContent = offer.businessName || 'Продуктовый магазин';
    offerModal.querySelector('[data-business-offer-city]').textContent = cityName(offer.cityId);
    offerModal.querySelector('[data-business-offer-seller]').textContent = offer.sellerNickname || offer.sellerTgId || 'Игрок';
    offerModal.querySelector('[data-business-offer-price]').textContent = formatBusinessMoney(offer.price);
    offerModal.querySelector('[data-business-offer-result]').hidden = true;
    offerModal.hidden = false;
    offerModal.setAttribute('aria-hidden', 'false');
    window.clearInterval(offerTimer);
    renderOfferTimer();
    offerTimer = window.setInterval(renderOfferTimer, 250);
    setBodyOpen();
  }

  function closeOffer() {
    window.clearInterval(offerTimer);
    activeOffer = null;
    offerModal.hidden = true;
    offerModal.setAttribute('aria-hidden', 'true');
    setBodyOpen();
  }

  async function pollOffer() {
    if (busy || destroyed) return;
    try {
      const offer = await loadPendingBusinessTransfer();
      if (offer?.offerId && String(offer.offerId) !== lastOfferId) showOffer(offer);
    } catch (error) {
      if (!String(error?.message || '').includes('TELEGRAM_SESSION')) console.warn('[business] pending transfer failed:', error);
    }
  }

  async function resolveOffer(accept) {
    if (!activeOffer || busy) return;
    if (accept && offerModal.querySelector('[data-business-offer-accept]').disabled) return;
    busy = true;
    const resultElement = offerModal.querySelector('[data-business-offer-result]');
    resultElement.hidden = false;
    resultElement.textContent = accept ? 'Проводим сделку…' : 'Отказываемся…';
    try {
      const result = accept ? await acceptBusinessTransfer(activeOffer.offerId) : await rejectBusinessTransfer(activeOffer.offerId);
      if (accept) {
        const balance = Number(result.buyerBalance);
        if (Number.isFinite(balance)) {
          state.player = { ...(state.player || {}), balance };
          save();
          window.dispatchEvent(new CustomEvent('mn:player-balance-changed', { detail: { balance, source: 'business_transfer', result } }));
        }
        window.dispatchEvent(new CustomEvent('mn:map-object-broadcast-request', { detail: {
          cityId: result.cityId, mapObjectId: result.businessId,
          ownerId: result.buyerTgId, ownerName: result.buyerNickname,
        } }));
        window.dispatchEvent(new CustomEvent('mn:businesses-updated', { detail: result }));
        void sendTransferBroadcast(result.sellerTgId, 'offer_resolved', result);
        resultElement.textContent = `Бизнес куплен за ${formatBusinessMoney(result.price)}.`;
        window.setTimeout(closeOffer, 1600);
      } else {
        void sendTransferBroadcast(result.sellerTgId, 'offer_resolved', result);
        closeOffer();
      }
    } catch (error) {
      resultElement.textContent = getBusinessUserErrorMessage(error);
    } finally { busy = false; renderOfferTimer(); }
  }

  function handleKeyDown(event) {
    if (offerModal?.hidden === false && !event.repeat) {
      const key = String(event.key || '').toLowerCase();
      if (event.code === 'KeyN' || key === 'n' || key === 'т') { event.preventDefault(); void resolveOffer(false); }
      if (event.code === 'KeyY' || event.code === 'KeyI' || ['y', 'i', 'н', 'ш'].includes(key)) { event.preventDefault(); void resolveOffer(true); }
      return;
    }
    const businessModalOpen = storeModal?.hidden === false || detailsModal?.hidden === false;
    if (!businessModalOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (storeModal?.hidden === false) tryCloseStore();
      else closeDetails();
      return;
    }
    if (/^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|ShiftLeft|ShiftRight)$/.test(event.code)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function handleBusinessSelected(event) {
    if (event?.detail?.business) openDetails(event.detail.business);
  }

  function handleEntityAction(event) {
    const object = event?.detail?.object;
    if (!object) return;
    if (event?.detail?.kind === 'business' || isBusinessObject(object)) openDetails(object);
  }

  detailsModal?.addEventListener('click', (event) => {
    if (event.target.closest('[data-business-details-close]')) closeDetails();
    if (event.target.closest('[data-business-buy]')) void handleBuy();
    if (event.target.closest('[data-business-enter]')) void openStore();
  });
  storeModal?.addEventListener('click', handleStoreClick);
  storeModal?.addEventListener('input', handleStoreInput);
  storeModal?.addEventListener('change', handleStoreChange);
  offerModal?.querySelector('[data-business-offer-accept]')?.addEventListener('click', () => void resolveOffer(true));
  offerModal?.querySelector('[data-business-offer-reject]')?.addEventListener('click', () => void resolveOffer(false));
  window.addEventListener('mn:entity-action', handleEntityAction);
  window.addEventListener('mn:business-selected', handleBusinessSelected);
  window.addEventListener('keydown', handleKeyDown, true);
  const transferChannel = supabase.channel(`mn-business-trades:${currentPlayerId()}`);
  transferChannel.on('broadcast', { event: 'offer_created' }, ({ payload }) => showOffer(payload));
  transferChannel.on('broadcast', { event: 'offer_resolved' }, () => void pollOffer());
  transferChannel.subscribe();
  const poll = window.setInterval(pollOffer, TRANSFER_POLL_MS);
  void pollOffer();

  return () => {
    destroyed = true;
    window.clearInterval(poll);
    window.clearInterval(offerTimer);
    window.removeEventListener('mn:entity-action', handleEntityAction);
    window.removeEventListener('mn:business-selected', handleBusinessSelected);
    window.removeEventListener('keydown', handleKeyDown, true);
    supabase.removeChannel(transferChannel);
    document.body.classList.remove('mn-business-open', 'mn-business-store-open');
    detailsModal?.remove();
    storeModal?.remove();
    offerModal?.remove();
  };
}

