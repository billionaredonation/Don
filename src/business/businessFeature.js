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
  findBusinessTransferPlayer,
  fineBusiness,
  getBusinessUserErrorMessage,
  loadBusinessSnapshot,
  loadPendingBusinessTransfer,
  purchaseBusiness,
  rejectBusinessTransfer,
  removeBusinessCartItem,
  removeBusinessEmployee,
  submitBusinessDeclaration,
  updateBusinessEmployee,
  updateBusinessShelf,
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

function productOptions(selected = '') {
  return BUSINESS_PRODUCTS.map((product) => (
    `<option value="${product.itemType}"${selected === product.itemType ? ' selected' : ''}>${product.icon} ${escapeHtml(product.label)}</option>`
  )).join('');
}

function supplierOptions(selected = 'state_wholesale') {
  return [
    ['state_wholesale', 'Государственный опт'],
    ['local_farms', 'Местные фермеры'],
    ['import_distributor', 'Импортный дистрибьютор'],
  ].map(([value, label]) => `<option value="${value}"${selected === value ? ' selected' : ''}>${label} · заготовка</option>`).join('');
}

function shelvesMarkup(snapshot) {
  const canStock = roleCanStock(snapshot.role);
  return (snapshot.shelves || []).map((shelf) => {
    const product = shelf.product || getBusinessProduct(shelf.productType);
    const empty = !product || !shelf.productType;
    return `
      <button type="button" class="mn-business-shelf${empty ? ' is-empty' : ''}" data-business-shelf="${Number(shelf.shelfNo)}">
        <small>Полка ${Number(shelf.shelfNo)}</small>
        <i>${empty ? '＋' : escapeHtml(product.icon)}</i>
        <strong>${empty ? 'Пустая полка' : escapeHtml(product.label)}</strong>
        <span>${empty ? (canStock ? 'Расставить товар' : 'Товар закончился') : `${formatBusinessMoney(shelf.salePrice)} · ${Number(shelf.stock)} шт.`}</span>
        ${canStock ? '<em>Настроить</em>' : empty ? '' : '<em>Взять</em>'}
      </button>`;
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
  return `
    <aside class="mn-business-drawer" data-business-drawer>
      <header><span><small>Ручная расстановка</small><strong>Полка ${Number(shelf.shelfNo)}</strong></span><button type="button" data-business-drawer-close>×</button></header>
      <label><span>Товар</span><select data-business-shelf-product>${productOptions(shelf.productType)}</select></label>
      <div class="mn-business-drawer-grid">
        <label><span>Цена продажи</span><input type="number" min="1" max="1000000" value="${Number(shelf.salePrice) || getBusinessProduct(shelf.productType)?.suggestedPrice || 32}" data-business-shelf-price></label>
        <label><span>Количество на полке</span><input type="number" min="0" max="1000000" value="${Number(shelf.stock) || 0}" data-business-shelf-stock></label>
      </div>
      <label><span>Поставщик · заготовка</span><select data-business-shelf-supplier>${supplierOptions(shelf.supplierCode)}</select><small>Выбор сохраняется, но закупочная цена и реальные поставки пока не списывают деньги.</small></label>
      <footer><button type="button" class="is-danger" data-business-shelf-clear>Убрать товар</button><button type="button" class="is-primary" data-business-shelf-save="${Number(shelf.shelfNo)}">Поставить на полку</button></footer>
    </aside>`;
}

function staffDrawer(snapshot) {
  const employees = snapshot.employees || [];
  return `
    <aside class="mn-business-drawer" data-business-drawer>
      <header><span><small>Владелец</small><strong>Сотрудники</strong></span><button type="button" data-business-drawer-close>×</button></header>
      <div class="mn-business-employee-form"><input type="text" maxlength="40" placeholder="Ник или Telegram ID" data-business-employee-target><select data-business-employee-role><option value="accountant">Бухгалтерия</option><option value="merchandiser">Расстановка товара</option></select><button type="button" class="is-primary" data-business-employee-save>Назначить</button></div>
      <div class="mn-business-employees">${employees.length ? employees.map((employee) => `
        <article><i>${employee.role === 'accountant' ? '🧾' : '📦'}</i><span><strong>${escapeHtml(employee.nickname || employee.tgId)}</strong><small>${escapeHtml(BUSINESS_ROLE_LABELS[employee.role] || employee.role)} · ID ${escapeHtml(employee.tgId)}</small></span><button type="button" data-business-employee-remove="${escapeHtml(employee.tgId)}">Уволить</button></article>`).join('') : '<p>Сотрудников пока нет.</p>'}</div>
      <p class="mn-business-drawer-note">Бухгалтер может сдавать декларации. Сотрудник по расстановке может менять товар, остаток и цену на полках.</p>
    </aside>`;
}

function taxDrawer(snapshot) {
  const preview = snapshot.taxPreview || {};
  const declarations = snapshot.declarations || [];
  const legal = getBusinessLegalPayload(snapshot);
  const declarationOpen = !snapshot.declarationAvailableAt || Date.now() >= new Date(snapshot.declarationAvailableAt).getTime();
  return `
    <aside class="mn-business-drawer" data-business-drawer>
      <header><span><small>Игровая налоговая · 2026</small><strong>${escapeHtml(legal.legalFormLabel)} · ${escapeHtml(legal.taxGroupLabel)}</strong></span><button type="button" data-business-drawer-close>×</button></header>
      <div class="mn-business-tax-summary">
        <article><small>Оборот недели</small><strong>${formatBusinessMoney(snapshot.revenueCurrentWeek)}</strong></article>
        <article><small>Начисление сейчас</small><strong>${formatBusinessMoney(preview.total)}</strong></article>
        <article><small>Налоговый долг</small><strong>${formatBusinessMoney(snapshot.taxDebt)}</strong></article>
        <article><small>Штрафы</small><strong>${formatBusinessMoney(snapshot.fineDebt)}</strong></article>
      </div>
      <div class="mn-business-tax-locked"><span>Установлено администрацией</span><strong>${escapeHtml(legal.legalFormLabel)} · ${escapeHtml(legal.taxGroupLabel)}</strong><small>Владелец и бухгалтер не могут менять форму или налоговый режим.</small></div>
      <div class="mn-business-tax-lines"><p><span>Единый налог</span><b>${formatBusinessMoney(preview.singleTax)}</b></p><p><span>Военный сбор</span><b>${formatBusinessMoney(preview.militaryLevy)}</b></p><p><span>ЕСВ</span><b>${formatBusinessMoney(preview.socialContribution)}</b></p><p><span>Срок</span><b>${formatDate(snapshot.declarationDueAt)}</b></p></div>
      <button type="button" class="is-primary mn-business-declare" data-business-declare${declarationOpen ? '' : ' disabled'}>${declarationOpen ? 'Сдать недельную декларацию' : `Откроется ${formatDate(snapshot.declarationAvailableAt)}`}</button>
      <p class="mn-business-drawer-note">Ставки 2026 пересчитаны в недельный игровой цикл. Просроченные недели автоматически переходят в долг; администрация может отдельно назначить штраф.</p>
      <div class="mn-business-declarations"><strong>Последние декларации</strong>${declarations.length ? declarations.map((entry) => `<p data-status="${escapeHtml(entry.status)}"><span>${formatDate(entry.submittedAt)} · ${escapeHtml(legal.legalFormLabel)} ${Number(entry.taxGroup)}</span><b>${formatBusinessMoney(entry.assessedTotal)} / оплачено ${formatBusinessMoney(entry.paidTotal)}</b></p>`).join('') : '<small>Деклараций пока нет.</small>'}</div>
    </aside>`;
}

function transferDrawer(snapshot, foundPlayer = null) {
  return `
    <aside class="mn-business-drawer" data-business-drawer>
      <header><span><small>Передача как у домов</small><strong>Продать игроку</strong></span><button type="button" data-business-drawer-close>×</button></header>
      <label><span>Ник или Telegram ID покупателя</span><div class="mn-business-inline"><input type="text" maxlength="40" value="${escapeHtml(foundPlayer?.nickname || '')}" data-business-transfer-target><button type="button" data-business-transfer-find>Проверить</button></div></label>
      ${foundPlayer ? `<div class="mn-business-found-player"><i>●</i><span><strong>${escapeHtml(foundPlayer.nickname)}</strong><small>Онлайн · ID ${escapeHtml(foundPlayer.tgId)}</small></span></div><label><span>Цена сделки</span><input type="number" min="1" max="1000000000" data-business-transfer-price placeholder="Введите цену"></label><button type="button" class="is-primary" data-business-transfer-send="${escapeHtml(foundPlayer.tgId)}">Отправить предложение</button>` : ''}
      <p class="mn-business-drawer-note">Покупатель получает окно Y/N и может подтвердить сделку через 10 секунд. Из цены удерживается 10% налога. Передача невозможна при долгах бизнеса.</p>
    </aside>`;
}

function fineDrawer() {
  return `
    <aside class="mn-business-drawer" data-business-drawer>
      <header><span><small>Администрация · налоговая</small><strong>Назначить штраф</strong></span><button type="button" data-business-drawer-close>×</button></header>
      <label><span>Сумма штрафа</span><input type="number" min="1" max="1000000000" data-business-fine-amount></label>
      <label><span>Основание по правилам проекта</span><textarea maxlength="300" rows="4" data-business-fine-reason></textarea></label>
      <button type="button" class="is-danger" data-business-fine-send>Начислить штраф</button>
    </aside>`;
}

function storeMarkup(snapshot, drawerMode = '', drawerData = null) {
  const quantity = cartQuantity(snapshot);
  const role = snapshot.role || 'customer';
  const financeVisible = roleCanAccount(role);
  let drawer = '';
  if (drawerMode === 'shelf') drawer = shelfDrawer(snapshot, drawerData);
  if (drawerMode === 'staff') drawer = staffDrawer(snapshot);
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
        <div class="mn-business-aisle-title"><span><small>Торговый зал</small><strong>${roleCanStock(role) ? 'Нажмите на полку для расстановки' : 'Выберите товар и идите на кассу'}</strong></span><i>Холодильники · заготовка</i></div>
        <div class="mn-business-shelves">${shelvesMarkup(snapshot)}</div>
        <div class="mn-business-checkout-counter"><i>▤</i><span><small>Касса</small><strong>${quantity ? `${quantity} товар(а) к оплате` : 'Покупок пока нет'}</strong></span><button type="button" data-business-checkout${quantity ? '' : ' disabled'}>Оплатить ${formatBusinessMoney(cartTotal(snapshot))}</button></div>
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
      ${role === 'owner' ? '<button type="button" data-business-open-staff>👥 Сотрудники</button><button type="button" data-business-open-transfer>⇄ Передать</button>' : ''}
      ${financeVisible ? '<button type="button" data-business-open-tax>🧾 Налоги</button>' : ''}
      ${isAdmin() ? '<button type="button" class="is-danger" data-business-open-fine>⚖ Штраф</button>' : ''}
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
      ? (isOwner(activeObject) ? 'Вы владелец. Внутри доступны полки, сотрудники, касса, налоги и передача игроку.' : 'Зайдите, выберите товар на полках и оплатите его на кассе. С неоплаченной корзиной выйти нельзя.')
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
      if (result?.role && Array.isArray(result?.shelves)) snapshot = result;
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

  async function handleStoreClick(event) {
    const target = event.target;
    if (!(target instanceof Element) || busy) return;
    if (target.closest('[data-business-store-exit]')) { tryCloseStore(); return; }
    if (target.closest('[data-business-refresh]')) { await runStoreAction(() => refreshStore({ preserveDrawer: false }), 'Магазин обновлён.'); return; }
    if (target.closest('[data-business-drawer-close]')) { drawerMode = ''; drawerData = null; renderStore(); return; }
    if (target.closest('[data-business-open-staff]')) { drawerMode = 'staff'; drawerData = null; renderStore(); return; }
    if (target.closest('[data-business-open-tax]')) { drawerMode = 'tax'; drawerData = null; renderStore(); return; }
    if (target.closest('[data-business-open-transfer]')) { drawerMode = 'transfer'; drawerData = null; renderStore(); return; }
    if (target.closest('[data-business-open-fine]')) { drawerMode = 'fine'; drawerData = null; renderStore(); return; }

    const shelfButton = target.closest('[data-business-shelf]');
    if (shelfButton) {
      const shelfNo = Number(shelfButton.dataset.businessShelf);
      const shelf = (snapshot.shelves || []).find((item) => Number(item.shelfNo) === shelfNo);
      if (roleCanStock(snapshot.role)) { drawerMode = 'shelf'; drawerData = shelfNo; renderStore(); return; }
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
      const supplierCode = storeContent.querySelector('[data-business-shelf-supplier]')?.value || 'state_wholesale';
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
