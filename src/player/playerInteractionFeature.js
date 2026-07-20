import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import {
  getHospitalUserErrorMessage,
  issueMedicineFromInteraction,
  loadMyHospitalEmployments,
} from '../hospital/hospitalWarehouseFeature.js';
import './playerInteraction.css';

const FUNCTION_NAME = 'player-interaction';
const CITY_DISTANCE = 3.4;
const INTERIOR_DISTANCE = 5.2;
const MEDICINES = Object.freeze([
  { type: 'medicine_light', label: 'Слабоседативные / простые таблетки' },
  { type: 'medicine_strong', label: 'Среднеседативные / сильные таблетки' },
  { type: 'medicine_resuscitation', label: 'Сильные седативные / реанимационные таблетки' },
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

function rankLevel(rank) {
  return ({ junior: 1, middle: 2, senior: 3, admin: 4 })[String(rank || '').toLowerCase()] || 0;
}

function markup() {
  return `
    <button type="button" class="mn-player-interaction-hint" data-player-interaction-hint hidden>
      <b>G</b><span>Взаимодействовать с игроком</span>
    </button>
    <div class="mn-player-interaction" data-player-interaction hidden aria-hidden="true">
      <button type="button" class="mn-player-interaction-backdrop" data-player-interaction-close aria-label="Закрыть"></button>
      <section class="mn-player-interaction-panel" role="dialog" aria-modal="true">
        <header>
          <span><small>Игрок рядом</small><strong data-player-interaction-name>Игрок</strong></span>
          <button type="button" data-player-interaction-close aria-label="Закрыть">×</button>
        </header>
        <nav data-player-interaction-actions>
          <button type="button" data-player-action="heal"><i>✚</i><span>Вылечить<small>Применить препарат</small></span></button>
          <button type="button" data-player-action="money"><i>₴</i><span>Передать деньги<small>Мгновенный перевод</small></span></button>
          <button type="button" data-player-action="trade"><i>⇄</i><span>Совершить трейд<small>Деньги и препараты</small></span></button>
        </nav>
        <div class="mn-player-interaction-content" data-player-interaction-content>
          <p>Выберите действие с игроком.</p>
        </div>
        <div class="mn-player-interaction-message" data-player-interaction-message hidden></div>
      </section>
    </div>`;
}

function tradeFieldsMarkup(inventory = {}) {
  const items = inventory.items || {};
  return `
    <div class="mn-player-trade-fields">
      <label><span>Деньги <small>доступно ${Number(inventory.balance || 0).toLocaleString('ru-RU')} ₴</small></span><input type="number" min="0" step="1" value="0" data-trade-value="money"></label>
      ${MEDICINES.map((item) => `<label><span>${item.label}<small>доступно ${Number(items[item.type] || 0)}</small></span><input type="number" min="0" step="1" value="0" data-trade-value="${item.type}"></label>`).join('')}
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
  const closeButtons = Array.from(overlay?.querySelectorAll('[data-player-interaction-close]') || []);
  if (!overlay || !panel || !hint || !actions || !content) return () => {};

  let target = null;
  let busy = false;
  let incomingOffer = null;
  let destroyed = false;

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
      element.disabled = busy;
    });
  }

  function close() {
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mn-player-interaction-open');
    incomingOffer = null;
    target = null;
    setMessage('');
  }

  function openFor(nextTarget) {
    target = nextTarget;
    incomingOffer = null;
    name.textContent = target.nickname;
    actions.hidden = false;
    content.innerHTML = '<p>Выберите действие с игроком.</p>';
    setMessage('');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-player-interaction-open');
  }

  async function showHeal() {
    content.innerHTML = '<p>Проверяю место работы и личные препараты…</p>';
    setMessage('');
    try {
      const employments = await loadMyHospitalEmployments();
      if (!employments.length) {
        content.innerHTML = '<p>Лечение доступно только сотруднику больницы. Назначение старшего состава выполняется командой Telegram.</p>';
        return;
      }
      content.innerHTML = `
        <div class="mn-player-action-form">
          <label><span>Больница</span><select data-heal-hospital>${employments.map((employment, index) => `<option value="${index}">${employment.displayName || 'Больница'}</option>`).join('')}</select></label>
          <label><span>Препарат</span><select data-heal-medicine></select></label>
          <label><span>Цена для игрока <small>можно 0</small></span><input type="number" min="0" step="1" inputmode="numeric" value="0" data-heal-price></label>
          <button type="button" class="is-primary" data-heal-submit>Выдать препарат</button>
          <small>Сервер проверит должность врача, личные таблетки, HP пациента, еду и воду. Игрок получит таблетку в инвентарь и применит её сам.</small>
        </div>`;
      const hospitalSelect = content.querySelector('[data-heal-hospital]');
      const medicineSelect = content.querySelector('[data-heal-medicine]');
      const priceInput = content.querySelector('[data-heal-price]');
      const submit = content.querySelector('[data-heal-submit]');
      const renderMedicines = () => {
        const employment = employments[Number(hospitalSelect.value || 0)] || employments[0];
        const level = rankLevel(employment.rank);
        const available = (employment.items || []).filter((item) =>
          Number(item.personalQuantity || 0) > 0 && level >= Number(item.minTreatRank || 1)
        );
        medicineSelect.innerHTML = available.map((item) =>
          `<option value="${item.itemType}">${item.label} · ${Number(item.personalQuantity || 0)} шт.</option>`
        ).join('');
        submit.disabled = !available.length;
        if (!available.length) setMessage('Нет доступных препаратов. Получите их со склада больницы.', 'error');
        else setMessage('');
      };
      hospitalSelect.addEventListener('change', renderMedicines);
      renderMedicines();
      submit.addEventListener('click', async () => {
        if (busy || !medicineSelect.value || !target) return;
        const employment = employments[Number(hospitalSelect.value || 0)] || employments[0];
        const price = Math.max(0, Math.floor(Number(priceInput.value || 0)));
        setBusy(true);
        try {
          const result = await issueMedicineFromInteraction({
            hospitalId: employment.hospitalId,
            target: target.target,
            medicineType: medicineSelect.value,
            price,
          });
          await broadcastTo(result?.patientTgId, 'medicine_received', {
            medicineLabel: result?.medicineLabel,
            doctorNickname: state.nickname || 'Врач',
            price: result?.price || 0,
          });
          setMessage(
            `${result?.medicineLabel || 'Препарат'} выдан игроку ${result?.patientNickname || target.nickname}. Игрок должен открыть инвентарь и применить таблетку.`,
            'success'
          );
        } catch (error) {
          setMessage(getHospitalUserErrorMessage(error), 'error');
        } finally {
          setBusy(false);
        }
      });
    } catch (error) {
      content.innerHTML = '<p>Не удалось загрузить данные больницы.</p>';
      setMessage(getHospitalUserErrorMessage(error), 'error');
    }
  }

  function showMoney() {
    content.innerHTML = `
      <div class="mn-player-action-form">
        <label><span>Сумма перевода</span><input type="number" min="1" step="1" inputmode="numeric" placeholder="0" data-money-amount></label>
        <button type="button" class="is-primary" data-money-submit>Передать деньги</button>
        <small>Деньги сразу списываются с вашего баланса и зачисляются игроку.</small>
      </div>`;
    const amount = content.querySelector('[data-money-amount]');
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
    amount.focus();
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
    incomingOffer = offer;
    target = {
      tgId: String(offer.initiatorTgId || ''),
      target: String(offer.initiatorTgId || ''),
      nickname: offer.initiatorNickname || 'Игрок',
    };
    name.textContent = target.nickname;
    actions.hidden = true;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-player-interaction-open');
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
    actions.querySelectorAll('[data-player-action]').forEach((element) => {
      element.dataset.active = element === button ? 'true' : 'false';
    });
    if (button.dataset.playerAction === 'heal') void showHeal();
    if (button.dataset.playerAction === 'money') showMoney();
    if (button.dataset.playerAction === 'trade') void showTrade();
  });
  closeButtons.forEach((button) => button.addEventListener('click', close));
  hint.addEventListener('click', openNearest);
  document.addEventListener('click', handleMarkerPointer, true);
  window.addEventListener('keydown', handleKeyDown, true);

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
  channel?.subscribe();

  const hintTimer = window.setInterval(updateHint, 260);
  const pollTimer = window.setInterval(checkIncoming, 4200);
  window.setTimeout(checkIncoming, 1200);
  updateHint();

  return () => {
    destroyed = true;
    window.clearInterval(hintTimer);
    window.clearInterval(pollTimer);
    window.removeEventListener('keydown', handleKeyDown, true);
    closeButtons.forEach((button) => button.removeEventListener('click', close));
    hint.removeEventListener('click', openNearest);
    document.removeEventListener('click', handleMarkerPointer, true);
    if (channel) supabase.removeChannel(channel);
    overlay.remove();
    hint.remove();
    document.body.classList.remove('mn-player-interaction-open');
  };
}


