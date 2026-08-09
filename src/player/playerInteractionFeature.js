import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import {
  invalidateProfessionalPlayerActions,
  loadAvailableProfessionalPlayerActions,
} from './professionalActions.js';
import './playerInteraction.css';

const FUNCTION_NAME = 'player-interaction';
const CITY_DISTANCE = 3.4;
const INTERIOR_DISTANCE = 5.2;
const TRADE_SLOT_COUNT = 9;
const TRADE_CONFIRM_DELAY_MS = 4000;
const MEDICINES = Object.freeze([
  { type: 'medicine_light', label: 'Простые таблетки', shortLabel: 'Простые таблетки' },
  { type: 'medicine_strong', label: 'Среднеседативные таблетки', shortLabel: 'Средние таблетки' },
  { type: 'medicine_resuscitation', label: 'Сильные седативные таблетки', shortLabel: 'Сильные таблетки' },
]);

function telegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

function localTelegramId() {
  return String(
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id || state.telegramId || state.player?.tg_id || ''
  ).trim();
}

async function normalizeInvokeError(error) {
  let responseMessage = '';
  const response = error?.context;
  if (typeof response?.clone === 'function') {
    try {
      const payload = await response.clone().json();
      responseMessage = String(payload?.error || payload?.message || '');
    } catch {
      // Supabase may return a plain-text network error.
    }
  }
  return new Error([responseMessage, error?.message, error?.details].filter(Boolean).join(' ') || 'PLAYER_INTERACTION_FAILED');
}

async function invokePlayerAction(action, payload = {}) {
  const initData = telegramInitData();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { initData, action, ...payload },
  });
  if (error) throw await normalizeInvokeError(error);
  if (!data?.ok) throw new Error(data?.error || 'PLAYER_INTERACTION_FAILED');
  return data.result;
}

function errorText(error) {
  const raw = String(error?.message || error || 'PLAYER_INTERACTION_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите игру.',
    BALANCE_NOT_ENOUGH: 'Недостаточно денег.',
    CANNOT_TRANSFER_TO_SELF: 'Нельзя перевести деньги самому себе.',
    TRADE_OFFER_EMPTY: 'Добавьте в предложение деньги или предмет.',
    TRADE_ALREADY_PENDING: 'У вас уже есть активное предложение обмена.',
    TRADE_BALANCE_NOT_ENOUGH: 'Для этой сделки недостаточно денег.',
    TRADE_ITEM_NOT_ENOUGH: 'Для этой сделки недостаточно предметов.',
    TRADE_NOT_PENDING: 'Предложение уже закрыто.',
    TRADE_EXPIRED: 'Время предложения истекло.',
    PLAYER_NOT_FOUND: 'Игрок не найден.',
    NOT_FOUND: 'Edge Function player-interaction не задеплоена.',
  };
  if (raw.toLowerCase().includes('requested function was not found')) return messages.NOT_FOUND;
  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

function number(value) {
  const result = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(result) ? result : 50;
}

function markerTarget(marker) {
  const playerId = String(marker?.dataset?.playerId || '').trim();
  const tgId = String(marker?.dataset?.tgId || playerId.replace(/^tg_/, '') || '').trim();
  const nickname = String(marker?.dataset?.nickname || marker?.querySelector?.('span, .gta-player-marker-name')?.textContent || 'Игрок').trim();
  return {
    playerId,
    tgId: /^\d+$/.test(tgId) ? tgId : '',
    nickname: nickname || 'Игрок',
    target: /^\d+$/.test(tgId) ? tgId : nickname,
    marker,
  };
}

function nearestMarker(playerPosition) {
  const interiorActive = window.__MN_INTERIOR_ACTIVE__ === true;
  const selector = interiorActive ? '.mn-interior-remote-player' : '.gta-player-marker-other';
  const markers = Array.from(document.querySelectorAll(selector));
  const localMarker = interiorActive ? document.querySelector('.mn-interior-player[data-interior-player]') : null;
  const local = interiorActive
    ? { x: number(localMarker?.style?.left), y: number(localMarker?.style?.top) }
    : { x: number(playerPosition?.x), y: number(playerPosition?.y) };
  const maxDistance = interiorActive ? INTERIOR_DISTANCE : CITY_DISTANCE;

  return markers
    .map((marker) => {
      const x = number(marker.dataset.x || marker.style.left);
      const y = number(marker.dataset.y || marker.style.top);
      return { marker, distance: Math.hypot(x - local.x, y - local.y) };
    })
    .filter((entry) => entry.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function tradeItemMeta(itemType, item = {}) {
  const medicine = MEDICINES.find((entry) => entry.type === itemType);
  if (medicine) return { label: item.label || medicine.shortLabel, icon: item.icon || '💊' };
  if (itemType === 'food') return { label: item.label || 'Обед', icon: item.icon || '🍔' };
  if (itemType === 'water_bottle') return { label: item.label || 'Бутылка воды', icon: item.icon || '💧' };
  return {
    label: item.label || item.name || itemType || 'Предмет',
    icon: item.icon || '◈',
  };
}

function tradeItemKey(item = {}) {
  return [item.itemType, item.source || 'personal', item.hospitalId || ''].join('::');
}

function rawTradeInventoryItems(inventory = {}) {
  if (Array.isArray(inventory)) return inventory;
  if (!inventory || typeof inventory !== 'object') return [];

  const nestedSources = [
    inventory.items,
    inventory.inventory,
    inventory.personalItems,
    inventory.personal_items,
    inventory.slots,
  ];
  const rawItems = [];

  nestedSources.forEach((source) => {
    if (Array.isArray(source)) {
      rawItems.push(...source);
      return;
    }
    if (!source || typeof source !== 'object') return;
    Object.entries(source).forEach(([itemType, value]) => {
      rawItems.push(
        value && typeof value === 'object'
          ? { ...value, itemType: value.itemType || value.type || itemType }
          : { itemType, quantity: value }
      );
    });
  });

  if (rawItems.length) return rawItems;

  const metadataKeys = new Set([
    'balance', 'money', 'health', 'food', 'water', 'playerId', 'player_id',
    'tgId', 'tg_id', 'nickname', 'updatedAt', 'updated_at',
  ]);
  return Object.entries(inventory)
    .filter(([key]) => !metadataKeys.has(key))
    .map(([itemType, value]) => (
      value && typeof value === 'object'
        ? { ...value, itemType: value.itemType || value.type || itemType }
        : { itemType, quantity: value }
    ));
}

function normalizeTradeInventory(inventory = {}) {
  const rawItems = rawTradeInventoryItems(inventory);

  return rawItems
    .map((item) => {
      const itemType = String(item?.itemType || item?.type || '').trim();
      const quantity = Math.max(0, Math.floor(Number(item?.quantity || 0)));
      const meta = tradeItemMeta(itemType, item || {});
      return {
        itemType,
        quantity,
        // The Edge Function returns only server-verified, player-owned items.
        // Keep its source metadata intact so current and future item types do
        // not need a client-side whitelist to participate in trade.
        source: String(item?.source || item?.inventorySource || 'personal').trim() || 'personal',
        hospitalId: String(item?.hospitalId || '').trim() || null,
        label: meta.label,
        icon: meta.icon,
      };
    })
    .filter((item) => item.itemType && item.quantity > 0);
}

function normalizeOfferItems(offer = {}) {
  if (Array.isArray(offer.items)) {
    return offer.items
      .map((item) => {
        const itemType = String(item?.itemType || item?.type || '').trim();
        const quantity = Math.max(0, Math.floor(Number(item?.quantity || 0)));
        const meta = tradeItemMeta(itemType, item || {});
        return {
          itemType,
          quantity,
          source: String(item?.source || 'personal').trim() || 'personal',
          hospitalId: String(item?.hospitalId || '').trim() || null,
          label: meta.label,
          icon: meta.icon,
        };
      })
      .filter((item) => item.itemType && item.quantity > 0)
      .slice(0, TRADE_SLOT_COUNT);
  }

  return Object.entries(offer || {})
    .filter(([itemType, quantity]) => itemType !== 'money' && itemType !== 'items' && Number(quantity) > 0)
    .map(([itemType, quantity]) => {
      const meta = tradeItemMeta(itemType);
      return {
        itemType,
        quantity: Math.max(0, Math.floor(Number(quantity || 0))),
        source: 'personal',
        hospitalId: null,
        label: meta.label,
        icon: meta.icon,
      };
    })
    .slice(0, TRADE_SLOT_COUNT);
}

function buildTradeOffer(money, slots = []) {
  const items = slots
    .filter((item) => item?.itemType && Number(item.quantity) > 0)
    .slice(0, TRADE_SLOT_COUNT)
    .map((item) => ({
      itemType: String(item.itemType),
      quantity: Math.max(1, Math.floor(Number(item.quantity))),
      source: String(item.source || 'personal'),
      hospitalId: item.hospitalId || null,
    }));
  const result = {
    money: Math.max(0, Math.floor(Number(money || 0))),
    items,
  };

  // Keep top-level quantities for the already deployed trade RPC while the
  // items array lets the same endpoint accept every current and future item.
  items.forEach((item) => {
    result[item.itemType] = Math.max(0, Math.floor(Number(result[item.itemType] || 0))) + item.quantity;
  });
  return result;
}

function formatOffer(offer = {}) {
  const parts = [];
  const money = Math.max(0, Math.floor(Number(offer.money || 0)));
  if (money) parts.push(`${money.toLocaleString('ru-RU')} ₴`);
  normalizeOfferItems(offer).forEach((item) => {
    parts.push(`${item.label}: ${item.quantity}`);
  });
  return parts.length ? parts.join(' · ') : 'Ничего';
}

function markup() {
  return `
    <button type="button" class="mn-player-interaction-hint" data-player-interaction-hint hidden>
      <b data-player-interaction-hint-key>G</b><span data-player-interaction-hint-text>Взаимодействовать с игроком</span>
    </button>
    <div class="mn-player-interaction" data-player-interaction hidden aria-hidden="true">
      <button type="button" class="mn-player-interaction-backdrop" data-player-interaction-close aria-label="Закрыть"></button>
      <section class="mn-player-interaction-panel" data-mode="radial" role="dialog" aria-modal="true">
        <header>
          <span><small>Игрок рядом</small><strong data-player-interaction-name>Игрок</strong></span>
          <button type="button" data-player-interaction-close aria-label="Закрыть">×</button>
        </header>
        <nav data-player-interaction-actions>
          <button type="button" data-player-action="money"><i>₴</i><span>Передать деньги<small>Мгновенный перевод</small></span></button>
          <button type="button" data-player-action="trade"><i>⇄</i><span>Передать предмет<small>Обмен предметами</small></span></button>
        </nav>
        <div class="mn-player-interaction-content" data-player-interaction-content hidden>
          <p>Выберите действие с игроком.</p>
        </div>
        <div class="mn-player-interaction-message" data-player-interaction-message hidden></div>
        <div class="mn-player-number-pad" data-player-number-pad hidden aria-hidden="true">
          <div class="mn-player-number-pad-display">
            <span data-player-number-pad-label>Введите число</span>
            <output data-player-number-pad-output>0</output>
          </div>
          <div class="mn-player-number-pad-grid">
            ${['1','2','3','4','5','6','7','8','9'].map((key) => `<button type="button" data-player-number-key="${key}">${key}</button>`).join('')}
            <button type="button" data-player-number-action="clear">C</button>
            <button type="button" data-player-number-key="0">0</button>
            <button type="button" data-player-number-action="backspace">⌫</button>
          </div>
          <div class="mn-player-number-pad-actions">
            <button type="button" data-player-number-action="cancel">Отмена</button>
            <button type="button" class="is-done" data-player-number-action="done">Готово</button>
          </div>
        </div>
      </section>
    </div>`;
}

function tradeSlotsMarkup(slots = [], { readonly = false } = {}) {
  return Array.from({ length: TRADE_SLOT_COUNT }, (_, index) => {
    const item = slots[index];
    if (!item) {
      return `<span class="mn-player-trade-slot is-empty" aria-label="Пустая ячейка ${index + 1}"></span>`;
    }
    const meta = tradeItemMeta(item.itemType, item);
    const label = escapeHtml(meta.label);
    const icon = escapeHtml(meta.icon);
    const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
    const tag = readonly ? 'span' : 'button';
    const attributes = readonly
      ? ''
      : ` type="button" data-trade-offer-slot="${index}" title="Убрать одну единицу"`;
    return `<${tag} class="mn-player-trade-slot is-filled"${attributes} aria-label="${label}: ${quantity}">
      <i aria-hidden="true">${icon}</i><b>${quantity}</b><small>${label}</small>
    </${tag}>`;
  }).join('');
}

function tradeInventoryMarkup(items = [], reserved = new Map()) {
  if (!items.length) {
    return '<p class="mn-player-trade-empty">Нет доступных предметов.</p>';
  }
  return items.map((item, index) => {
    const available = Math.max(0, item.quantity - Number(reserved.get(tradeItemKey(item)) || 0));
    const disabled = available <= 0 ? ' disabled' : '';
    return `<button type="button" class="mn-player-trade-inventory-item" data-trade-inventory-index="${index}"${disabled} aria-label="Добавить ${escapeHtml(item.label)}">
      <i aria-hidden="true">${escapeHtml(item.icon)}</i>
      <span><strong>${escapeHtml(item.label)}</strong><small>Доступно: ${available}</small></span>
      <b>+</b>
    </button>`;
  }).join('');
}

function readonlyTradeOfferMarkup(offer = {}, title = 'Игрок отдаёт') {
  const items = normalizeOfferItems(offer);
  const money = Math.max(0, Math.floor(Number(offer.money || 0)));
  return `<section class="mn-player-trade-offer-card is-readonly">
    <header><strong>${escapeHtml(title)}</strong><small>${escapeHtml(formatOffer(offer))}</small></header>
    <div class="mn-player-trade-slot-grid" aria-label="Предметы второго игрока">${tradeSlotsMarkup(items, { readonly: true })}</div>
    <div class="mn-player-trade-money-summary"><span>Деньги</span><b>${money.toLocaleString('ru-RU')} ₴</b></div>
  </section>`;
}

function editableTradeMarkup(inventory = {}, title = 'Вы отдаёте') {
  return `<section class="mn-player-trade-offer-card" data-trade-composer>
    <header><strong>${escapeHtml(title)}</strong><small>Нажмите предмет в инвентаре, чтобы положить его в обмен</small></header>
    <div class="mn-player-trade-slot-grid" data-trade-offer-grid aria-label="Ваше поле обмена"></div>
    <label class="mn-player-trade-money"><span>Деньги <small>доступно ${Number(inventory.balance || 0).toLocaleString('ru-RU')} ₴</small></span><input type="number" min="0" max="1000000000" step="1" value="0" data-trade-money></label>
  </section>
  <section class="mn-player-trade-inventory-card">
    <header><strong>Ваш инвентарь</strong><small>Предметы добавляются по одной единице</small></header>
    <div class="mn-player-trade-inventory-list" data-trade-inventory-list></div>
  </section>`;
}

function tradeSubmitMarkup() {
  return `<footer class="mn-player-trade-submit-row">
    <small class="mn-player-trade-help">Нажимайте на предмет, чтобы добавить количество. Нажатие по ячейке возвращает одну единицу.</small>
    <button type="button" class="is-primary" data-trade-submit>Предложить трейд</button>
  </footer>`;
}

async function loadTradeInventory() {
  // One authoritative snapshot only. Previously this UI mixed the Edge trade
  // inventory with medical inventory, window globals and local state, then
  // picked the largest quantity. That could display items the trade RPC could
  // not actually debit and caused false TRADE_ITEM_NOT_ENOUGH errors.
  const tradeInventory = await invokePlayerAction('trade_inventory');
  return {
    ...(tradeInventory && typeof tradeInventory === 'object' ? tradeInventory : {}),
    items: normalizeTradeInventory(tradeInventory),
  };
}

function toast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
}

function showTradeSuccessToast(message = 'Трейд успешно завершён.') {
  document.querySelectorAll('[data-player-trade-success-toast]').forEach((element) => element.remove());

  const notice = document.createElement('div');
  notice.className = 'mn-player-trade-success-toast';
  notice.dataset.playerTradeSuccessToast = 'true';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.innerHTML = '<i aria-hidden="true">✓</i><span></span>';
  notice.querySelector('span').textContent = message;
  document.body.appendChild(notice);

  window.requestAnimationFrame(() => {
    if (notice.isConnected) notice.dataset.state = 'open';
  });

  window.setTimeout(() => {
    if (!notice.isConnected) return;
    notice.dataset.state = 'closing';
    window.setTimeout(() => notice.remove(), 220);
  }, 2800);
}

async function broadcastTo(targetTgId, event, payload) {
  const target = String(targetTgId || '').trim();
  if (!target) return;
  const channel = supabase.channel(`mn-player-interactions:${target}`);
  await new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 800);
    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      window.clearTimeout(timer);
      try { await channel.send({ type: 'broadcast', event, payload }); } finally { resolve(); }
    });
  });
  supabase.removeChannel(channel);
}

export function enablePlayerInteractionFeature({ playerPosition } = {}) {
  document.querySelectorAll('[data-player-interaction], [data-player-interaction-hint]').forEach((element) => element.remove());
  document.body.insertAdjacentHTML('beforeend', markup());

  const overlay = document.querySelector('[data-player-interaction]');
  const panel = overlay?.querySelector('.mn-player-interaction-panel');
  const hint = document.querySelector('[data-player-interaction-hint]');
  const name = overlay?.querySelector('[data-player-interaction-name]');
  const actions = overlay?.querySelector('[data-player-interaction-actions]');
  const content = overlay?.querySelector('[data-player-interaction-content]');
  const message = overlay?.querySelector('[data-player-interaction-message]');
  const numberPad = overlay?.querySelector('[data-player-number-pad]');
  const numberPadLabel = numberPad?.querySelector('[data-player-number-pad-label]');
  const numberPadOutput = numberPad?.querySelector('[data-player-number-pad-output]');
  const hintKey = hint?.querySelector('[data-player-interaction-hint-key]');
  const hintText = hint?.querySelector('[data-player-interaction-hint-text]');
  const closeButtons = Array.from(overlay?.querySelectorAll('[data-player-interaction-close]') || []);
  if (!overlay || !panel || !hint || !actions || !content) return () => {};

  if (window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches) {
    if (hintKey) hintKey.textContent = '●';
    if (hintText) hintText.textContent = 'Игрок рядом — нажмите';
    hint.setAttribute('aria-label', 'Взаимодействовать с игроком рядом');
  }

  let target = null;
  let busy = false;
  let incomingOffer = null;
  let destroyed = false;
  let professionalRefreshToken = 0;
  let professionalActions = new Map();
  let layoutFrame = 0;
  let numberPadTarget = null;
  let numberPadInitialValue = '';
  let tradeCountdownTimer = 0;
  let tradeComposerCleanup = null;

  const customNumberPadEnabled = Boolean(
    numberPad &&
    navigator.maxTouchPoints > 0 &&
    Math.min(
      window.screen?.width || window.innerWidth,
      window.screen?.height || window.innerHeight
    ) <= 920
  );

  function numberPadFieldLabel(input) {
    const label = input?.closest?.('label')?.querySelector?.('span');
    const ownText = Array.from(label?.childNodes || [])
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(' ')
      .trim();
    return ownText || 'Введите число';
  }

  function renderNumberPadValue() {
    if (!numberPadOutput) return;
    const raw = String(numberPadTarget?.value || '').replace(/\D/g, '');
    const value = Number(raw || 0);
    numberPadOutput.textContent = Number.isFinite(value)
      ? value.toLocaleString('ru-RU')
      : '0';
  }

  function writeNumberPadValue(rawValue) {
    if (!numberPadTarget) return;

    let digits = String(rawValue || '').replace(/\D/g, '').slice(0, 10);
    digits = digits.replace(/^0+(?=\d)/, '');
    const max = Number(numberPadTarget.max);
    if (digits && Number.isFinite(max)) {
      digits = String(Math.min(max, Number(digits)));
    }

    numberPadTarget.value = digits;
    numberPadTarget.dispatchEvent(new Event('input', { bubbles: true }));
    renderNumberPadValue();
  }

  function closeNumberPad({ restore = false } = {}) {
    if (!numberPad || numberPad.hidden) return;
    const targetInput = numberPadTarget;
    if (restore && targetInput) {
      targetInput.value = numberPadInitialValue;
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    numberPad.hidden = true;
    numberPad.setAttribute('aria-hidden', 'true');
    delete panel.dataset.numberPad;
    numberPadTarget = null;
    numberPadInitialValue = '';
    scheduleRadialLayout();
  }

  function openNumberPad(input, event) {
    if (!customNumberPadEnabled || !numberPad || !input || input.disabled) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    input.blur();
    numberPadTarget = input;
    numberPadInitialValue = String(input.value || '');
    if (numberPadLabel) numberPadLabel.textContent = numberPadFieldLabel(input);
    renderNumberPadValue();
    numberPad.hidden = false;
    numberPad.setAttribute('aria-hidden', 'false');
    panel.dataset.numberPad = 'true';
    scheduleRadialLayout();
  }

  function prepareCustomNumberFields(root = content) {
    if (!customNumberPadEnabled) return;
    root?.querySelectorAll?.('input[type="number"]').forEach((input) => {
      input.readOnly = true;
      input.setAttribute('inputmode', 'none');
      input.setAttribute('data-player-custom-number', 'true');
    });
  }

  function clearTradeUi() {
    window.clearInterval(tradeCountdownTimer);
    tradeCountdownTimer = 0;
    tradeComposerCleanup?.();
    tradeComposerCleanup = null;
    delete panel.dataset.trade;
  }

  function createTradeComposer(root, inventory, { onChange } = {}) {
    const inventoryItems = normalizeTradeInventory(inventory);
    const offerGrid = root.querySelector('[data-trade-offer-grid]');
    const inventoryList = root.querySelector('[data-trade-inventory-list]');
    const moneyInput = root.querySelector('[data-trade-money]');
    let slots = [];
    let locked = false;

    function reservedItems() {
      return slots.reduce((result, item) => {
        result.set(tradeItemKey(item), Number(result.get(tradeItemKey(item)) || 0) + Number(item.quantity || 0));
        return result;
      }, new Map());
    }

    function render() {
      if (offerGrid) offerGrid.innerHTML = tradeSlotsMarkup(slots);
      if (inventoryList) inventoryList.innerHTML = tradeInventoryMarkup(inventoryItems, reservedItems());
      root.querySelectorAll('[data-trade-offer-slot], [data-trade-inventory-index], [data-trade-money]').forEach((element) => {
        if (element.matches('[data-trade-money], [data-trade-offer-slot]')) {
          element.disabled = locked;
        } else {
          element.disabled = locked || element.disabled;
        }
      });
      root.dataset.tradeLocked = locked ? 'true' : 'false';
    }

    function changed() {
      render();
      onChange?.();
    }

    function addItem(index) {
      if (locked) return;
      const item = inventoryItems[index];
      if (!item) return;
      const key = tradeItemKey(item);
      const reserved = Number(reservedItems().get(key) || 0);
      if (reserved >= item.quantity) return;
      const existing = slots.find((slot) => tradeItemKey(slot) === key);
      if (existing) existing.quantity += 1;
      else if (slots.length < TRADE_SLOT_COUNT) slots.push({ ...item, quantity: 1 });
      else {
        setMessage('Поле обмена заполнено: доступно 9 ячеек.', 'error');
        return;
      }
      setMessage('');
      changed();
    }

    function removeItem(index) {
      if (locked) return;
      const item = slots[index];
      if (!item) return;
      item.quantity -= 1;
      if (item.quantity <= 0) slots.splice(index, 1);
      changed();
    }

    function handleClick(event) {
      const inventoryButton = event.target.closest('[data-trade-inventory-index]');
      const offerButton = event.target.closest('[data-trade-offer-slot]');
      if (inventoryButton) addItem(Number(inventoryButton.dataset.tradeInventoryIndex));
      if (offerButton) removeItem(Number(offerButton.dataset.tradeOfferSlot));
    }

    function handleMoneyInput() {
      if (!locked) onChange?.();
    }

    root.addEventListener('click', handleClick);
    moneyInput?.addEventListener('input', handleMoneyInput);
    prepareCustomNumberFields(root);
    render();

    return {
      offer() {
        return buildTradeOffer(moneyInput?.value, slots);
      },
      setLocked(value) {
        locked = Boolean(value);
        render();
      },
      destroy() {
        root.removeEventListener('click', handleClick);
        moneyInput?.removeEventListener('input', handleMoneyInput);
      },
    };
  }

  function handleNumberFieldPointer(event) {
    const input = event.target?.closest?.('input[type="number"][data-player-custom-number]');
    if (!input || !content.contains(input)) return;
    if (numberPadTarget === input && !numberPad?.hidden) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    openNumberPad(input, event);
  }

  function handleNumberPadClick(event) {
    const keyButton = event.target?.closest?.('[data-player-number-key]');
    const actionButton = event.target?.closest?.('[data-player-number-action]');
    if (!numberPadTarget || (!keyButton && !actionButton)) return;
    event.preventDefault();
    event.stopPropagation();

    if (keyButton) {
      const current = String(numberPadTarget.value || '').replace(/\D/g, '');
      const key = String(keyButton.dataset.playerNumberKey || '');
      writeNumberPadValue(`${current === '0' ? '' : current}${key}`);
      return;
    }

    const action = actionButton.dataset.playerNumberAction;
    if (action === 'clear') writeNumberPadValue('');
    if (action === 'backspace') {
      writeNumberPadValue(String(numberPadTarget.value || '').slice(0, -1));
    }
    if (action === 'cancel') closeNumberPad({ restore: true });
    if (action === 'done') {
      const targetInput = numberPadTarget;
      closeNumberPad();
      targetInput?.dispatchEvent?.(new Event('change', { bubbles: true }));
    }
  }

  const numberFieldObserver = customNumberPadEnabled
    ? new MutationObserver(() => {
        if (numberPadTarget && !numberPadTarget.isConnected) closeNumberPad();
        prepareCustomNumberFields();
      })
    : null;
  numberFieldObserver?.observe(content, { childList: true, subtree: true });
  prepareCustomNumberFields();

  function setMessage(value, type = 'info') {
    message.hidden = !value;
    message.textContent = value || '';
    message.dataset.type = type;
  }

  function setBusy(value) {
    busy = Boolean(value);
    panel.dataset.busy = busy ? 'true' : 'false';
    panel.querySelectorAll('button, input, select').forEach((element) => {
      if (element.matches('[data-player-interaction-close]')) return;

      if (busy) {
        element.dataset.disabledBeforeBusy = element.disabled ? 'true' : 'false';
        element.disabled = true;
        return;
      }

      element.disabled = element.dataset.disabledBeforeBusy === 'true';
      delete element.dataset.disabledBeforeBusy;
    });
  }

  function layoutRadialActions() {
    if (overlay.hidden) return;

    const buttons = Array.from(actions.querySelectorAll('[data-player-action]'));
    const count = buttons.length;
    if (!count) return;

    // clientWidth/clientHeight stay in the panel's own coordinate system.
    // getBoundingClientRect swaps them when the mobile shell rotates portrait
    // Telegram into landscape, which used to stretch the radial menu sideways.
    const width = Math.max(1, panel.clientWidth);
    const height = Math.max(1, panel.clientHeight);
    const widestButton = Math.max(44, ...buttons.map((button) => button.offsetWidth || 0));
    const tallestButton = Math.max(44, ...buttons.map((button) => button.offsetHeight || 0));
    const maxRadiusX = Math.max(72, (width - widestButton) / 2 - 10);
    const maxRadiusY = Math.max(58, (height - tallestButton) / 2 - 10);
    const radiusX = Math.min(250, width * 0.37, maxRadiusX);
    const radiusY = Math.min(150, height * 0.31, maxRadiusY);
    const presets = {
      1: [-90],
      2: [180, 0],
      3: [-90, 150, 30],
      4: [-90, 0, 90, 180],
      5: [-90, -18, 54, 126, 198],
    };
    const angles = presets[count] || buttons.map((_, index) => -90 + (360 / count) * index);

    buttons.forEach((button, index) => {
      const radians = (angles[index] * Math.PI) / 180;
      button.style.setProperty('--mn-radial-x', `${Math.cos(radians) * radiusX}px`);
      button.style.setProperty('--mn-radial-y', `${Math.sin(radians) * radiusY}px`);
    });
  }

  function scheduleRadialLayout() {
    window.cancelAnimationFrame(layoutFrame);
    layoutFrame = window.requestAnimationFrame(() => {
      layoutFrame = 0;
      layoutRadialActions();
    });
  }

  function renderProfessionalActionButtons(entries) {
    actions.querySelectorAll('[data-professional-player-action]').forEach((element) => {
      element.remove();
    });

    const firstBaseAction = actions.querySelector('[data-player-action="money"]');

    entries.forEach(({ action }) => {
      const button = document.createElement('button');
      const icon = document.createElement('i');
      const labels = document.createElement('span');
      const label = document.createTextNode(action.button?.label || action.id);
      const description = document.createElement('small');

      button.type = 'button';
      button.dataset.playerAction = action.id;
      button.dataset.professionalPlayerAction = action.id;
      icon.textContent = action.button?.icon || '◆';
      description.textContent = action.button?.description || 'Профессиональное действие';
      labels.append(label, description);
      button.append(icon, labels);
      actions.insertBefore(button, firstBaseAction);
    });

    scheduleRadialLayout();
  }

  async function refreshProfessionalActions({ force = false } = {}) {
    const refreshToken = ++professionalRefreshToken;
    const entries = await loadAvailableProfessionalPlayerActions(
      { actorTgId: localTelegramId() },
      { force }
    );

    if (destroyed || refreshToken !== professionalRefreshToken) return;

    professionalActions = new Map(
      entries.map((entry) => [entry.action.id, entry])
    );
    renderProfessionalActionButtons(entries);
  }

  function close() {
    closeNumberPad();
    clearTradeUi();
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mn-player-interaction-open');
    incomingOffer = null;
    target = null;
    panel.dataset.mode = 'radial';
    content.hidden = true;
    setMessage('');
  }

  function openFor(nextTarget) {
    closeNumberPad();
    clearTradeUi();
    target = nextTarget;
    incomingOffer = null;
    name.textContent = target.nickname;
    actions.hidden = false;
    panel.dataset.mode = 'radial';
    content.innerHTML = '<p>Выберите действие с игроком.</p>';
    content.hidden = true;
    setMessage('');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-player-interaction-open');
    scheduleRadialLayout();
    void refreshProfessionalActions();
  }

  function showMoney() {
    clearTradeUi();
    content.innerHTML = `
      <div class="mn-player-action-form">
        <label><span>Сумма перевода</span><input type="number" min="1" max="1000000000" step="1" inputmode="numeric" placeholder="0" data-money-amount></label>
        <button type="button" class="is-primary" data-money-submit>Передать деньги</button>
        <small>Деньги сразу списываются с вашего баланса и зачисляются игроку.</small>
      </div>`;
    const amount = content.querySelector('[data-money-amount]');
    prepareCustomNumberFields(content);
    content.querySelector('[data-money-submit]').addEventListener('click', async () => {
      const value = Math.floor(Number(amount.value || 0));
      if (!target || busy || value <= 0) return;
      setBusy(true);
      try {
        const result = await invokePlayerAction('transfer_money', { target: target.target, amount: value });
        state.player = { ...(state.player || {}), balance: Number(result.senderBalance) };
        window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
          detail: { balance: Number(result.senderBalance), source: 'player_transfer' },
        }));
        await broadcastTo(result.recipientTgId, 'money_received', { amount: result.amount, senderNickname: state.nickname || 'Игрок' });
        setMessage(`Передано ${Number(result.amount).toLocaleString('ru-RU')} ₴ игроку ${result.recipientNickname || target.nickname}.`, 'success');
      } catch (error) {
        setMessage(errorText(error), 'error');
      } finally {
        setBusy(false);
      }
    });
    if (!customNumberPadEnabled) amount.focus();
  }

  async function showTrade() {
    clearTradeUi();
    panel.dataset.trade = 'true';
    content.innerHTML = '<p>Загружаю доступные предметы…</p>';
    setMessage('');
    try {
      const inventory = await loadTradeInventory();
      content.innerHTML = `
        <div class="mn-player-action-form mn-player-trade-workspace" data-trade-form>
          <div class="mn-player-trade-columns">
            ${editableTradeMarkup(inventory)}
          </div>
          ${tradeSubmitMarkup()}
        </div>`;
      const form = content.querySelector('[data-trade-form]');
      const composer = createTradeComposer(form, inventory);
      tradeComposerCleanup = () => composer.destroy();
      form.querySelector('[data-trade-submit]').addEventListener('click', async () => {
        if (!target || busy) return;
        const offer = composer.offer();
        if (!offer.money && !offer.items.length) {
          setMessage('Положите предмет в поле обмена или добавьте деньги.', 'error');
          return;
        }
        let sent = false;
        setBusy(true);
        try {
          const result = await invokePlayerAction('create_trade', { target: target.target, offer });
          await broadcastTo(result.targetTgId, 'trade_created', result);
          setMessage(`Предложение отправлено игроку ${result.targetNickname || target.nickname}.`, 'success');
          sent = true;
        } catch (error) {
          setMessage(errorText(error), 'error');
        } finally {
          setBusy(false);
          if (sent) {
            composer.setLocked(true);
            form.querySelector('[data-trade-submit]').disabled = true;
          }
        }
      });
    } catch (error) {
      content.innerHTML = '<p>Не удалось загрузить предметы для трейда.</p>';
      setMessage(errorText(error), 'error');
    }
  }

  async function showIncoming(offer) {
    if (!offer?.offerId || destroyed) return;
    closeNumberPad();
    clearTradeUi();
    incomingOffer = offer;
    target = {
      tgId: String(offer.initiatorTgId || ''),
      target: String(offer.initiatorTgId || ''),
      nickname: offer.initiatorNickname || 'Игрок',
    };
    name.textContent = target.nickname;
    actions.hidden = true;
    panel.dataset.mode = 'detail';
    panel.dataset.trade = 'true';
    content.hidden = false;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-player-interaction-open');
    scheduleRadialLayout();
    setMessage('');
    content.innerHTML = '<p>Загружаю ваши предметы…</p>';
    try {
      const inventory = await loadTradeInventory();
      content.innerHTML = `
        <div class="mn-player-action-form mn-player-trade-workspace" data-trade-counter-form>
          <div class="mn-player-trade-columns has-counter-offer">
            ${readonlyTradeOfferMarkup(offer.initiatorOffer, `${target.nickname} отдаёт`)}
            ${editableTradeMarkup(inventory, 'Вы отдаёте взамен')}
          </div>
          <div class="mn-player-trade-countdown" data-trade-countdown hidden>
            <i aria-hidden="true"></i><span>Предложение зафиксировано. Проверьте обе стороны обмена.</span>
          </div>
          <div class="mn-player-trade-actions">
            <button type="button" data-trade-reject>Отказаться</button>
            <button type="button" data-trade-change hidden>Изменить предложение</button>
            <button type="button" class="is-primary" data-trade-accept data-stage="ready">Готов к обмену</button>
          </div>
          <small>После готовности запустится обязательная проверка на 4 секунды. Сервер повторно проверит деньги и предметы у обоих игроков.</small>
        </div>`;
      const form = content.querySelector('[data-trade-counter-form]');
      const acceptButton = form.querySelector('[data-trade-accept]');
      const changeButton = form.querySelector('[data-trade-change]');
      const countdown = form.querySelector('[data-trade-countdown]');
      const composer = createTradeComposer(form, inventory, { onChange: resetCountdown });
      tradeComposerCleanup = () => composer.destroy();

      function resetCountdown() {
        window.clearInterval(tradeCountdownTimer);
        tradeCountdownTimer = 0;
        composer.setLocked(false);
        acceptButton.dataset.stage = 'ready';
        acceptButton.textContent = 'Готов к обмену';
        acceptButton.disabled = false;
        changeButton.hidden = true;
        countdown.hidden = true;
      }

      function startCountdown() {
        closeNumberPad();
        composer.setLocked(true);
        changeButton.hidden = false;
        countdown.hidden = false;
        acceptButton.dataset.stage = 'countdown';
        acceptButton.disabled = true;
        const readyAt = Date.now() + TRADE_CONFIRM_DELAY_MS;

        const update = () => {
          const remainingMs = Math.max(0, readyAt - Date.now());
          const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
          acceptButton.textContent = `Подтвердить через ${remainingSeconds}`;
          countdown.style.setProperty('--mn-trade-countdown-progress', `${100 - (remainingMs / TRADE_CONFIRM_DELAY_MS) * 100}%`);
          if (remainingMs > 0) return;
          window.clearInterval(tradeCountdownTimer);
          tradeCountdownTimer = 0;
          acceptButton.dataset.stage = 'confirm';
          acceptButton.textContent = 'Подтвердить обмен';
          acceptButton.disabled = false;
          countdown.querySelector('span').textContent = 'Проверка завершена. Подтвердите обмен.';
        };

        update();
        tradeCountdownTimer = window.setInterval(update, 100);
      }

      changeButton.addEventListener('click', resetCountdown);
      form.querySelector('[data-trade-reject]').addEventListener('click', async () => {
        if (busy || !incomingOffer) return;
        setBusy(true);
        try {
          const result = await invokePlayerAction('reject_trade', { offerId: incomingOffer.offerId });
          await broadcastTo(result.initiatorTgId, 'trade_resolved', result);
          close();
        } catch (error) {
          setMessage(errorText(error), 'error');
        } finally { setBusy(false); }
      });
      acceptButton.addEventListener('click', async () => {
        if (busy || !incomingOffer) return;
        if (acceptButton.dataset.stage !== 'confirm') {
          startCountdown();
          return;
        }
        const counterOffer = composer.offer();
        setBusy(true);
        try {
          const result = await invokePlayerAction('accept_trade', {
            offerId: incomingOffer.offerId,
            offer: counterOffer,
          });
          const actorBalance = Number(result.actorBalance);
          if (Number.isFinite(actorBalance)) {
            state.player = { ...(state.player || {}), balance: actorBalance };
            window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
              detail: { balance: actorBalance, source: 'player_trade' },
            }));
          }
          window.dispatchEvent(new CustomEvent('mn:player-inventory-changed'));
          await broadcastTo(result.initiatorTgId, 'trade_resolved', result);
          incomingOffer = null;
          close();
          showTradeSuccessToast();
        } catch (error) {
          setMessage(errorText(error), 'error');
          resetCountdown();
        } finally { setBusy(false); }
      });
    } catch (error) {
      setMessage(errorText(error), 'error');
    }
  }

  async function checkIncoming() {
    if (destroyed || busy || incomingOffer) return;
    try {
      const result = await invokePlayerAction('pending_trade');
      if (result?.offer) await showIncoming(result.offer);
    } catch (error) {
      if (!String(error?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerInteraction] pending trade check failed:', error);
      }
    }
  }

  function openNearest() {
    const nearest = nearestMarker(playerPosition);
    if (!nearest) {
      toast('Рядом нет игрока. Подойдите ближе.');
      return;
    }
    openFor(markerTarget(nearest.marker));
  }

  function handleMarkerPointer(event) {
    if (!overlay.hidden || document.body.classList.contains('mn-inventory-open') || window.__MN_HOSPITAL_WAREHOUSE_OPEN__ === true) return;
    const marker = event.target?.closest?.('.mn-interior-remote-player, .gta-player-marker-other');
    if (!marker) return;
    const nearest = nearestMarker(playerPosition);
    if (!nearest || nearest.marker !== marker) return;
    event.preventDefault();
    event.stopPropagation();
    openFor(markerTarget(marker));
  }

  function handleKeyDown(event) {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
    if (!overlay.hidden) {
      if (!numberPad?.hidden) {
        if (event.code === 'Escape' && !event.repeat) closeNumberPad({ restore: true });
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.code === 'Escape' && !event.repeat) close();
      if (!typing) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (typing || event.repeat || event.code !== 'KeyG') return;
    if (document.body.classList.contains('mn-inventory-open') || window.__MN_HOSPITAL_WAREHOUSE_OPEN__ === true) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openNearest();
  }

  function updateHint() {
    const blocked = !overlay.hidden || document.body.classList.contains('mn-inventory-open') || window.__MN_HOSPITAL_WAREHOUSE_OPEN__ === true;
    hint.hidden = blocked || !nearestMarker(playerPosition);
  }

  actions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-player-action]');
    if (!button || busy) return;
    closeNumberPad();
    clearTradeUi();
    actions.querySelectorAll('[data-player-action]').forEach((element) => {
      element.dataset.active = element === button ? 'true' : 'false';
    });

    const actionId = button.dataset.playerAction;
    const professionalEntry = professionalActions.get(actionId);

    panel.dataset.mode = 'detail';
    content.hidden = false;
    scheduleRadialLayout();

    if (professionalEntry) {
      const selectedTarget = target;

      void professionalEntry.action.render({
        access: professionalEntry.access,
        target: selectedTarget,
        content,
        setBusy,
        isBusy: () => busy,
        setMessage,
        broadcastTo,
        isTargetActive: () => (
          !overlay.hidden &&
          target === selectedTarget &&
          professionalActions.has(actionId)
        ),
      });
      return;
    }

    if (actionId === 'money') showMoney();
    if (actionId === 'trade') void showTrade();
  });

  function handleProfessionalActionsChanged() {
    invalidateProfessionalPlayerActions();
    void refreshProfessionalActions({ force: true });
  }

  function handlePanelFocusIn(event) {
    const field = event.target?.closest?.('input, textarea, select');
    if (!field) return;

    panel.dataset.textEntry = 'true';
    window.setTimeout(() => {
      if (destroyed || !field.isConnected || document.activeElement !== field) return;
      field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      scheduleRadialLayout();
    }, 320);
  }

  function handlePanelFocusOut() {
    window.setTimeout(() => {
      if (destroyed || panel.contains(document.activeElement)) return;
      delete panel.dataset.textEntry;
      scheduleRadialLayout();
    }, 80);
  }

  closeButtons.forEach((button) => button.addEventListener('click', close));
  hint.addEventListener('click', openNearest);
  content.addEventListener('pointerdown', handleNumberFieldPointer, true);
  content.addEventListener('click', handleNumberFieldPointer, true);
  numberPad?.addEventListener('click', handleNumberPadClick);
  panel.addEventListener('focusin', handlePanelFocusIn);
  panel.addEventListener('focusout', handlePanelFocusOut);
  document.addEventListener('click', handleMarkerPointer, true);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('resize', scheduleRadialLayout);
  window.addEventListener('orientationchange', scheduleRadialLayout);
  window.visualViewport?.addEventListener?.('resize', scheduleRadialLayout, { passive: true });
  window.visualViewport?.addEventListener?.('scroll', scheduleRadialLayout, { passive: true });
  window.addEventListener('mn:professional-actions-changed', handleProfessionalActionsChanged);

  const tgId = localTelegramId();
  const channel = tgId ? supabase.channel(`mn-player-interactions:${tgId}`) : null;
  channel?.on('broadcast', { event: 'trade_created' }, () => void checkIncoming());
  channel?.on('broadcast', { event: 'trade_resolved' }, ({ payload }) => {
    if (payload?.status === 'accepted') {
      const initiatorBalance = Number(payload.initiatorBalance);
      if (Number.isFinite(initiatorBalance)) {
        state.player = { ...(state.player || {}), balance: initiatorBalance };
        window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
          detail: { balance: initiatorBalance, source: 'player_trade' },
        }));
      }
      window.dispatchEvent(new CustomEvent('mn:player-inventory-changed'));
      if (panel.dataset.trade === 'true') close();
      showTradeSuccessToast();
    } else toast('Предложение трейда закрыто.');
  });
  channel?.on('broadcast', { event: 'money_received' }, ({ payload }) => {
    toast(`${payload?.senderNickname || 'Игрок'} передал вам ${Number(payload?.amount || 0).toLocaleString('ru-RU')} ₴.`, 'success');
  });
  channel?.on('broadcast', { event: 'medicine_received' }, ({ payload }) => {
    const price = Number(payload?.price || 0);
    toast(`${payload?.doctorNickname || 'Врач'} выдал препарат: ${payload?.medicineLabel || 'таблетка'}${price ? ` за ${price.toLocaleString('ru-RU')} ₴` : ''}. Самолечение из инвентаря отключено; препарат можно передать или использовать врачом через подсистему лечения.`, 'success');
    window.dispatchEvent(new CustomEvent('mn:medical-inventory-changed'));
  });
  channel?.on('broadcast', { event: 'treatment_applied' }, ({ payload }) => {
    const vitals = {};

    ['health', 'food', 'water'].forEach((key) => {
      const rawValue = payload?.[key];
      if (rawValue === undefined || rawValue === null) return;
      const value = Number(rawValue);
      if (Number.isFinite(value)) vitals[key] = value;
    });

    if (Object.keys(vitals).length) {
      state.player = { ...(state.player || {}), ...vitals };
      window.dispatchEvent(new CustomEvent('mn:player-vitals-changed', {
        detail: {
          vitals,
          source: 'doctor_treatment',
          animateDamage: false,
        },
      }));
    }

    const rawPatientBalance = payload?.patientBalance;
    const patientBalance = Number(rawPatientBalance);
    if (rawPatientBalance !== undefined && rawPatientBalance !== null && Number.isFinite(patientBalance)) {
      state.player = { ...(state.player || {}), balance: patientBalance };
      window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
        detail: {
          balance: patientBalance,
          source: 'doctor_treatment',
        },
      }));
    }

    window.dispatchEvent(new CustomEvent('mn:hospital-treatment-started-local'));

    const price = Number(payload?.price || 0);
    toast(
      `${payload?.doctorNickname || 'Врач'} применил ${payload?.medicineLabel || 'таблетку'}${price ? ` за ${price.toLocaleString('ru-RU')} ₴` : ''}. Восстановление HP началось.`,
      'success'
    );
  });
  channel?.subscribe();

  const hintTimer = window.setInterval(updateHint, 260);
  const pollTimer = window.setInterval(checkIncoming, 4200);
  window.setTimeout(checkIncoming, 1200);
  void refreshProfessionalActions();
  scheduleRadialLayout();
  updateHint();

  return () => {
    destroyed = true;
    clearTradeUi();
    window.cancelAnimationFrame(layoutFrame);
    window.clearInterval(hintTimer);
    window.clearInterval(pollTimer);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('resize', scheduleRadialLayout);
    window.removeEventListener('orientationchange', scheduleRadialLayout);
    window.visualViewport?.removeEventListener?.('resize', scheduleRadialLayout);
    window.visualViewport?.removeEventListener?.('scroll', scheduleRadialLayout);
    window.removeEventListener('mn:professional-actions-changed', handleProfessionalActionsChanged);
    closeButtons.forEach((button) => button.removeEventListener('click', close));
    hint.removeEventListener('click', openNearest);
    content.removeEventListener('pointerdown', handleNumberFieldPointer, true);
    content.removeEventListener('click', handleNumberFieldPointer, true);
    numberPad?.removeEventListener('click', handleNumberPadClick);
    numberFieldObserver?.disconnect();
    panel.removeEventListener('focusin', handlePanelFocusIn);
    panel.removeEventListener('focusout', handlePanelFocusOut);
    document.removeEventListener('click', handleMarkerPointer, true);
    if (channel) supabase.removeChannel(channel);
    document.querySelectorAll('[data-player-trade-success-toast]').forEach((element) => element.remove());
    overlay.remove();
    hint.remove();
    document.body.classList.remove('mn-player-interaction-open');
  };
}
