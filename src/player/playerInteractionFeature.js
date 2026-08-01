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
const MEDICINES = Object.freeze([
  { type: 'medicine_light', label: 'Слабоседативные / простые таблетки', shortLabel: 'Простые таблетки' },
  { type: 'medicine_strong', label: 'Среднеседативные / сильные таблетки', shortLabel: 'Сильные таблетки' },
  { type: 'medicine_resuscitation', label: 'Сильные седативные / реанимационные таблетки', shortLabel: 'Реанимационные таблетки' },
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
    TRADE_OFFER_EMPTY: 'Добавьте в предложение деньги или препарат.',
    TRADE_ALREADY_PENDING: 'У вас уже есть активное предложение обмена.',
    TRADE_BALANCE_NOT_ENOUGH: 'Для этой сделки недостаточно денег.',
    TRADE_ITEM_NOT_ENOUGH: 'Для этой сделки недостаточно препаратов.',
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

function tradeOfferFrom(container) {
  const read = (key) => Math.max(0, Math.floor(Number(container.querySelector(`[data-trade-value="${key}"]`)?.value || 0)));
  return {
    money: read('money'),
    medicine_light: read('medicine_light'),
    medicine_strong: read('medicine_strong'),
    medicine_resuscitation: read('medicine_resuscitation'),
  };
}

function formatOffer(offer = {}) {
  const parts = [];
  const money = Math.max(0, Math.floor(Number(offer.money || 0)));
  if (money) parts.push(`${money.toLocaleString('ru-RU')} ₴`);
  MEDICINES.forEach((item) => {
    const quantity = Math.max(0, Math.floor(Number(offer[item.type] || 0)));
    if (quantity) parts.push(`${item.label}: ${quantity}`);
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

function tradeFieldsMarkup(inventory = {}) {
  const items = inventory.items || {};
  return `
    <div class="mn-player-trade-fields">
      <label><span>Деньги <small>доступно ${Number(inventory.balance || 0).toLocaleString('ru-RU')} ₴</small></span><input type="number" min="0" max="1000000000" step="1" value="0" data-trade-value="money"></label>
      ${MEDICINES.map((item) => `<label><span>${item.shortLabel}<small>доступно ${Number(items[item.type] || 0)}</small></span><input type="number" min="0" max="1000" step="1" value="0" data-trade-value="${item.type}"></label>`).join('')}
    </div>`;
}

function toast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
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
    content.innerHTML = '<p>Загружаю доступные предметы…</p>';
    setMessage('');
    try {
      const inventory = await invokePlayerAction('trade_inventory');
      content.innerHTML = `
        <div class="mn-player-action-form" data-trade-form>
          <strong>Вы отдаёте</strong>
          ${tradeFieldsMarkup(inventory)}
          <button type="button" class="is-primary" data-trade-submit>Предложить трейд</button>
          <small>Второй игрок увидит ваше предложение и сможет добавить встречные предметы или деньги.</small>
        </div>`;
      const form = content.querySelector('[data-trade-form]');
      prepareCustomNumberFields(form);
      form.querySelector('[data-trade-submit]').addEventListener('click', async () => {
        if (!target || busy) return;
        setBusy(true);
        try {
          const result = await invokePlayerAction('create_trade', { target: target.target, offer: tradeOfferFrom(form) });
          await broadcastTo(result.targetTgId, 'trade_created', result);
          setMessage(`Предложение отправлено игроку ${result.targetNickname || target.nickname}.`, 'success');
        } catch (error) {
          setMessage(errorText(error), 'error');
        } finally {
          setBusy(false);
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
    incomingOffer = offer;
    target = {
      tgId: String(offer.initiatorTgId || ''),
      target: String(offer.initiatorTgId || ''),
      nickname: offer.initiatorNickname || 'Игрок',
    };
    name.textContent = target.nickname;
    actions.hidden = true;
    panel.dataset.mode = 'detail';
    content.hidden = false;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-player-interaction-open');
    scheduleRadialLayout();
    setMessage('');
    content.innerHTML = '<p>Загружаю ваши предметы…</p>';
    try {
      const inventory = await invokePlayerAction('trade_inventory');
      content.innerHTML = `
        <div class="mn-player-action-form" data-trade-counter-form>
          <span class="mn-player-trade-incoming"><small>${target.nickname} предлагает</small><b>${formatOffer(offer.initiatorOffer)}</b></span>
          <strong>Вы отдаёте взамен</strong>
          ${tradeFieldsMarkup(inventory)}
          <div class="mn-player-trade-actions">
            <button type="button" data-trade-reject>Отказаться</button>
            <button type="button" class="is-primary" data-trade-accept>Принять трейд</button>
          </div>
          <small>При принятии сервер ещё раз проверит деньги и препараты у обоих игроков.</small>
        </div>`;
      const form = content.querySelector('[data-trade-counter-form]');
      prepareCustomNumberFields(form);
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
      form.querySelector('[data-trade-accept]').addEventListener('click', async () => {
        if (busy || !incomingOffer) return;
        setBusy(true);
        try {
          const result = await invokePlayerAction('accept_trade', {
            offerId: incomingOffer.offerId,
            offer: tradeOfferFrom(form),
          });
          state.player = { ...(state.player || {}), balance: Number(result.actorBalance) };
          window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
            detail: { balance: Number(result.actorBalance), source: 'player_trade' },
          }));
          window.dispatchEvent(new CustomEvent('mn:medical-inventory-changed'));
          await broadcastTo(result.initiatorTgId, 'trade_resolved', result);
          setMessage('Трейд успешно завершён.', 'success');
          incomingOffer = null;
        } catch (error) {
          setMessage(errorText(error), 'error');
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
    if (payload?.status === 'accepted' && Number.isFinite(Number(payload.initiatorBalance))) {
      state.player = { ...(state.player || {}), balance: Number(payload.initiatorBalance) };
      window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
        detail: { balance: Number(payload.initiatorBalance), source: 'player_trade' },
      }));
      window.dispatchEvent(new CustomEvent('mn:medical-inventory-changed'));
      toast('Трейд завершён.', 'success');
    } else toast('Предложение трейда закрыто.');
  });
  channel?.on('broadcast', { event: 'money_received' }, ({ payload }) => {
    toast(`${payload?.senderNickname || 'Игрок'} передал вам ${Number(payload?.amount || 0).toLocaleString('ru-RU')} ₴.`, 'success');
  });
  channel?.on('broadcast', { event: 'medicine_received' }, ({ payload }) => {
    const price = Number(payload?.price || 0);
    toast(`${payload?.doctorNickname || 'Врач'} выдал препарат: ${payload?.medicineLabel || 'таблетка'}${price ? ` за ${price.toLocaleString('ru-RU')} ₴` : ''}. Откройте инвентарь, чтобы применить.`, 'success');
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
    overlay.remove();
    hint.remove();
    document.body.classList.remove('mn-player-interaction-open');
  };
}
