import { supabase } from '../supabaseClient.js';
import { state, save } from '../state.js';
import {
  countPlayerOwnedHouses,
  PLAYER_HOUSE_SLOT_LIMIT,
} from './housesRepository.js';

const POLL_MS = 2000;

function tgId() {
  return String(state.telegramId || state.player?.tg_id || state.player?.telegramId || '').trim();
}

function money(value) {
  return `${Math.max(0, Math.round(Number(value || 0))).toLocaleString('ru-RU')} ₴`;
}

function classLabel(value) {
  const key = String(value || 'standard').toLowerCase();
  if (key.includes('premium') || key === 'prem') return 'Премиум';
  if (key.includes('lux') || key === 'vip') return 'Ультра люкс';
  return 'Стандарт';
}

function rpcError(error, fallback) {
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  throw new Error(text || fallback);
}

export async function findOnlineTradePlayer(nickname) {
  const { data, error } = await supabase.rpc('find_online_player_for_house_trade', {
    p_nickname: String(nickname || '').trim(),
    p_seller_tg_id: tgId(),
  });
  if (error) rpcError(error, 'TRADE_PLAYER_LOOKUP_FAILED');
  return data;
}

export async function createPlayerHouseTrade({ houseId, buyerTgId, price }) {
  const { data, error } = await supabase.rpc('create_house_trade_offer', {
    p_house_id: String(houseId || ''),
    p_seller_tg_id: tgId(),
    p_buyer_tg_id: String(buyerTgId || ''),
    p_price: Math.round(Number(price || 0)),
  });
  if (error) rpcError(error, 'TRADE_CREATE_FAILED');
  await sendTargetedTradeEvent(data?.buyerTgId, 'offer_created', data);
  return data;
}

async function sendTargetedTradeEvent(targetTgId, event, payload) {
  const target = String(targetTgId || '').trim();
  if (!target) return;

  const channel = supabase.channel(`mn-house-trades:${target}`);
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 1200);
    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      clearTimeout(timeout);
      try {
        await channel.send({ type: 'broadcast', event, payload });
      } finally {
        resolve();
      }
    });
  });
  supabase.removeChannel(channel);
}

async function sendHouseStateBroadcast(result) {
  const cityId = String(result?.cityId || '').trim();
  if (!cityId) return;
  const channel = supabase.channel(`mn-assets:${cityId}`);
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 1200);
    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      clearTimeout(timeout);
      try {
        await channel.send({
          type: 'broadcast',
          event: 'map_object_state_changed',
          payload: {
            cityId,
            mapObjectId: result.mapObjectId || result.houseId,
            houseId: result.houseId,
            ownerId: result.buyerTgId,
            ownerName: result.buyerNickname,
            updatedAt: new Date().toISOString(),
          },
        });
      } finally {
        resolve();
      }
    });
  });
  supabase.removeChannel(channel);
}

function overlayHtml() {
  return `
    <div class="house-trade-offer" hidden data-house-trade-offer>
      <div class="house-trade-offer-backdrop"></div>
      <section class="house-trade-offer-card" role="dialog" aria-modal="true">
        <span class="house-trade-offer-kicker">Предложение недвижимости</span>
        <h3>Вам предлагают купить дом</h3>
        <div class="house-trade-offer-info">
          <p><span>Тип</span><b>Дом</b></p>
          <p><span>Класс</span><b data-trade-class>Стандарт</b></p>
          <p><span>Продавец</span><b data-trade-seller>Игрок</b></p>
          <p><span>Цена</span><b data-trade-price>0 ₴</b></p>
        </div>
        <p class="house-trade-wait" data-trade-wait>Проверка сделки: 10 сек.</p>
        <div class="house-trade-result" hidden data-trade-result></div>
        <div class="house-trade-offer-actions">
          <button type="button" data-trade-reject><span class="pc-label">N</span><span>Отказаться</span></button>
          <button type="button" class="is-accept" data-trade-accept disabled><span class="pc-label">Y / I</span><span>Купить</span></button>
        </div>
      </section>
    </div>`;
}

export function enableHouseTradeFeature() {
  const playerTgId = tgId();
  if (!playerTgId) return () => {};

  document.querySelectorAll('[data-house-trade-offer]').forEach((el) => el.remove());
  document.body.insertAdjacentHTML('beforeend', overlayHtml());
  const overlay = document.querySelector('[data-house-trade-offer]');
  const acceptButton = overlay.querySelector('[data-trade-accept]');
  const rejectButton = overlay.querySelector('[data-trade-reject]');
  const waitEl = overlay.querySelector('[data-trade-wait]');
  const resultEl = overlay.querySelector('[data-trade-result]');
  let activeOffer = null;
  let timer = null;
  let busy = false;
  let lastOfferId = '';
  let slotBlocked = false;

  function close() {
    clearInterval(timer);
    timer = null;
    activeOffer = null;
    overlay.hidden = true;
    document.body.classList.remove('mn-house-trade-open');
  }

  function renderTimer() {
    if (!activeOffer) return;
    const left = Math.max(0, Math.ceil((new Date(activeOffer.unlockAt).getTime() - Date.now()) / 1000));
    acceptButton.disabled = busy || slotBlocked || left > 0;

    if (slotBlocked) {
      waitEl.textContent = `Лимит домов занят: ${PLAYER_HOUSE_SLOT_LIMIT}/${PLAYER_HOUSE_SLOT_LIMIT}. Освободи слот, чтобы купить дом.`;
      waitEl.dataset.ready = 'false';
      return;
    }

    waitEl.textContent = left > 0
      ? `На обдумывание: ${left} сек. После таймера Y / I станет активной.`
      : 'Решение доступно: Y на ПК или I на мобильном.';
    waitEl.dataset.ready = left > 0 ? 'false' : 'true';
  }

  async function checkHouseSlotForActiveOffer(offerId) {
    try {
      const ownedCount = await countPlayerOwnedHouses(playerTgId);

      if (!activeOffer || String(activeOffer.offerId) !== String(offerId)) return;

      slotBlocked = ownedCount >= PLAYER_HOUSE_SLOT_LIMIT;

      if (slotBlocked) {
        resultEl.hidden = false;
        resultEl.textContent = `Нельзя принять сделку: заняты все ${PLAYER_HOUSE_SLOT_LIMIT} слота домов.`;
      }

      renderTimer();
    } catch (error) {
      console.warn('[houseTrade] house slot check failed:', error);
    }
  }

  function show(offer) {
    if (!offer?.offerId || offer.status !== 'pending') return;
    activeOffer = offer;
    lastOfferId = String(offer.offerId);
    slotBlocked = false;
    overlay.querySelector('[data-trade-class]').textContent = classLabel(offer.houseClass);
    overlay.querySelector('[data-trade-seller]').textContent = offer.sellerNickname || 'Игрок';
    overlay.querySelector('[data-trade-price]').textContent = money(offer.price);
    resultEl.hidden = true;
    resultEl.textContent = '';
    overlay.hidden = false;
    document.body.classList.add('mn-house-trade-open');
    clearInterval(timer);
    renderTimer();
    timer = setInterval(renderTimer, 250);
    checkHouseSlotForActiveOffer(offer.offerId);
  }

  async function fetchPending() {
    if (busy) return;
    const { data, error } = await supabase.rpc('get_pending_house_trade_offer', {
      p_buyer_tg_id: playerTgId,
    });
    if (error) return;
    const offer = data?.offer === null ? null : data;
    if (offer?.offerId && String(offer.offerId) !== lastOfferId) show(offer);
  }

  async function accept() {
    if (!activeOffer || acceptButton.disabled || busy) return;
    busy = true;
    acceptButton.disabled = true;
    rejectButton.disabled = true;
    resultEl.hidden = false;
    resultEl.textContent = 'Проводим сделку...';
    try {
      const ownedCount = await countPlayerOwnedHouses(playerTgId);

      if (ownedCount >= PLAYER_HOUSE_SLOT_LIMIT) {
        throw new Error('HOUSE_SLOT_LIMIT_REACHED');
      }

      const { data, error } = await supabase.rpc('accept_house_trade_offer', {
        p_offer_id: activeOffer.offerId,
        p_buyer_tg_id: playerTgId,
      });
      if (error) rpcError(error, 'TRADE_ACCEPT_FAILED');

      state.player = { ...(state.player || {}), balance: Number(data.buyerBalance) };
      save();
      window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
        detail: { balance: Number(data.buyerBalance), source: 'house_trade', result: data },
      }));
      window.dispatchEvent(new CustomEvent('mn:house-purchased-local', {
        detail: {
          houseId: data.houseId, mapObjectId: data.mapObjectId,
          ownerId: playerTgId, ownerName: data.buyerNickname, result: data,
        },
      }));
      await Promise.allSettled([
        sendHouseStateBroadcast(data),
        sendTargetedTradeEvent(data.sellerTgId, 'offer_resolved', data),
      ]);
      resultEl.textContent = `Дом куплен. С баланса списано ${money(data.price)}.`;
      setTimeout(close, 1800);
    } catch (error) {
      const text = String(error?.message || error);
      resultEl.textContent = text.includes('NOT_ENOUGH_MONEY')
        ? 'Недостаточно денег для покупки.'
        : text.includes('HOUSE_OWNER_CHANGED')
          ? 'Сделка отменена: владелец дома уже изменился.'
          : text.includes('HOUSE_SLOT_LIMIT_REACHED')
            ? `Сделка не выполнена: заняты все ${PLAYER_HOUSE_SLOT_LIMIT} слота домов.`
            : `Сделка не выполнена: ${text}`;
    } finally {
      busy = false;
      rejectButton.disabled = false;
      renderTimer();
    }
  }

  async function reject() {
    if (!activeOffer || busy) return;
    busy = true;
    try {
      const { data, error } = await supabase.rpc('reject_house_trade_offer', {
        p_offer_id: activeOffer.offerId,
        p_buyer_tg_id: playerTgId,
      });
      if (error) rpcError(error, 'TRADE_REJECT_FAILED');
      await sendTargetedTradeEvent(data.sellerTgId, 'offer_resolved', data);
      close();
    } catch (error) {
      resultEl.hidden = false;
      resultEl.textContent = `Не удалось отказаться: ${error.message || error}`;
    } finally {
      busy = false;
    }
  }

  function keydown(event) {
    if (overlay.hidden || event.repeat) return;
    const key = String(event.key || '').toLowerCase();
    if (event.code === 'KeyN' || key === 'n' || key === 'т') {
      event.preventDefault(); event.stopImmediatePropagation(); reject();
    } else if (event.code === 'KeyY' || key === 'y' || key === 'н' || event.code === 'KeyI' || key === 'i' || key === 'ш') {
      event.preventDefault(); event.stopImmediatePropagation(); accept();
    }
  }

  const channel = supabase.channel(`mn-house-trades:${playerTgId}`);
  channel.on('broadcast', { event: 'offer_created' }, ({ payload }) => show(payload));
  channel.on('broadcast', { event: 'offer_resolved' }, () => fetchPending());
  channel.subscribe();
  const poll = setInterval(fetchPending, POLL_MS);

  acceptButton.addEventListener('click', accept);
  rejectButton.addEventListener('click', reject);
  window.addEventListener('keydown', keydown, true);
  fetchPending();

  return () => {
    clearInterval(poll);
    clearInterval(timer);
    acceptButton.removeEventListener('click', accept);
    rejectButton.removeEventListener('click', reject);
    window.removeEventListener('keydown', keydown, true);
    supabase.removeChannel(channel);
    overlay.remove();
    document.body.classList.remove('mn-house-trade-open');
  };
}
