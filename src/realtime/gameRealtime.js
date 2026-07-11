import { supabase } from '../supabaseClient.js';

function normalizeTelegramId(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function getPlayerTelegramId(row = {}) {
  return normalizeTelegramId(row.tg_id || row.telegram_id || row.telegramId);
}

function getPlayerRowId(row = {}) {
  return normalizeTelegramId(row.id || row.player_id || row.playerId);
}

function dispatchMapObjectsChanged(cityId, payload) {
  window.dispatchEvent(new CustomEvent('mn:map-objects-changed', {
    detail: {
      cityId,
      source: 'realtime',
      payload,
    },
  }));

  window.dispatchEvent(new CustomEvent('mn:houses-realtime-changed', {
    detail: {
      cityId,
      source: 'realtime',
      payload,
    },
  }));
}


function isMobileGameplayDevice() {
  const hasTouch = navigator.maxTouchPoints > 0;
  const narrowScreen =
    Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 920;

  return hasTouch && narrowScreen;
}

function isMobilePlayerBusy() {
  if (!isMobileGameplayDevice()) return false;

  const now = performance.now();
  const pauseUntil = Number(window.__MN_MOBILE_NETWORK_PAUSE_UNTIL__ || 0);

  return window.__MN_MOBILE_PLAYER_MOVING__ === true || pauseUntil > now;
}

function dispatchPlayerBalanceChanged(row, payload = {}) {
  const balance = Number(row?.balance ?? 0);
  const oldBalance = Number(payload?.old?.balance);
  const hasOldBalance = Number.isFinite(oldBalance);
  const delta = hasOldBalance ? balance - oldBalance : undefined;

  window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
    detail: {
      player: row,
      oldPlayer: payload?.old || null,
      balance,
      oldBalance: hasOldBalance ? oldBalance : undefined,
      delta,
      source: 'realtime',
      payload,
    },
  }));

  return {
    balance,
    oldBalance: hasOldBalance ? oldBalance : undefined,
    delta,
    source: 'realtime',
    payload,
  };
}

export function setupGameRealtime({
  cityId,
  telegramId,
  playerRowId,
  onBalanceChanged,
} = {}) {
  const normalizedCityId = String(cityId || '').trim();
  const normalizedTelegramId = normalizeTelegramId(telegramId);
  const normalizedPlayerRowId = normalizeTelegramId(playerRowId);

  if (!normalizedCityId) {
    console.warn('[realtime] setup skipped: cityId missing');
    return () => {};
  }

  let destroyed = false;
  let deferredMapObjectsPayload = null;
  let deferredFlushTimer = null;

  function clearDeferredFlushTimer() {
    if (!deferredFlushTimer) return;

    window.clearTimeout(deferredFlushTimer);
    deferredFlushTimer = null;
  }

  function flushDeferredRealtime() {
    deferredFlushTimer = null;

    if (destroyed) {
      deferredMapObjectsPayload = null;
      return;
    }

    if (isMobilePlayerBusy()) {
      scheduleDeferredRealtimeFlush(900);
      return;
    }

    const mapPayload = deferredMapObjectsPayload;

    deferredMapObjectsPayload = null;

    if (mapPayload) {
      dispatchMapObjectsChanged(normalizedCityId, mapPayload);
    }
  }

  function scheduleDeferredRealtimeFlush(delay = 1200) {
    if (destroyed || deferredFlushTimer) return;

    deferredFlushTimer = window.setTimeout(flushDeferredRealtime, delay);
  }

  function queueMapObjectsRealtime(payload) {
    if (destroyed) return;

    // Храним последнее событие из короткой серии. Получатели всё равно берут
    // свежий snapshot города, поэтому десять UPDATE подряд не должны вызывать
    // десять запросов и десять перерисовок карты.
    deferredMapObjectsPayload = payload;

    if (isMobilePlayerBusy()) {
      scheduleDeferredRealtimeFlush(650);
      return;
    }

    scheduleDeferredRealtimeFlush(isMobileGameplayDevice() ? 180 : 80);
  }

  const channel = supabase.channel(
    `mn-game:${normalizedCityId}:${normalizedPlayerRowId || normalizedTelegramId || 'guest'}`
  );

  channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'map_objects',
      filter: `city_id=eq.${normalizedCityId}`,
    },
    (payload) => {
      if (destroyed) return;
      queueMapObjectsRealtime(payload);
    }
  );

  if (normalizedTelegramId) {
    const playerFilter = normalizedPlayerRowId
      ? `id=eq.${normalizedPlayerRowId}`
      : `tg_id=eq.${normalizedTelegramId}`;

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'players',
        filter: playerFilter,
      },
      (payload) => {
        if (destroyed) return;

        const row = payload?.new || {};
        const changedTelegramId = getPlayerTelegramId(row);
        const changedPlayerRowId = getPlayerRowId(row);

        if (
          normalizedPlayerRowId &&
          changedPlayerRowId &&
          changedPlayerRowId !== normalizedPlayerRowId
        ) {
          return;
        }

        if (changedTelegramId && changedTelegramId !== normalizedTelegramId) {
          return;
        }

        const meta = dispatchPlayerBalanceChanged(row, payload);

        if (typeof onBalanceChanged === 'function') {
          onBalanceChanged(row, meta);
        }
      }
    );
  }

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[realtime] subscribed:', normalizedCityId);

      window.dispatchEvent(new CustomEvent('mn:realtime-subscribed', {
        detail: {
          cityId: normalizedCityId,
          telegramId: normalizedTelegramId,
          playerRowId: normalizedPlayerRowId,
        },
      }));
    }
  });

  return () => {
    destroyed = true;
    clearDeferredFlushTimer();
    deferredMapObjectsPayload = null;
    supabase.removeChannel(channel);
  };
}
