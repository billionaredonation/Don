import { supabase } from '../supabaseClient.js';

function normalizeIdentifier(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function getPlayerTelegramId(row = {}) {
  return normalizeIdentifier(row.tg_id || row.telegram_id || row.telegramId);
}

function getPlayerRowId(row = {}) {
  return normalizeIdentifier(row.id || row.player_id || row.playerId);
}

const PLAYER_VITAL_FIELDS = Object.freeze(['health', 'food', 'water']);

function getPlayerVitalsFromRow(row = {}) {
  return PLAYER_VITAL_FIELDS.reduce((vitals, field) => {
    const value = Number(row?.[field]);

    if (Number.isFinite(value)) {
      vitals[field] = value;
    }

    return vitals;
  }, {});
}

function hasPlayerVitals(row = {}) {
  return Object.keys(getPlayerVitalsFromRow(row)).length > 0;
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

function createBalanceSignature(row = {}) {
  const rowId = getPlayerRowId(row);
  const telegramId = getPlayerTelegramId(row);
  const balance = Number(row.balance);
  const vitals = getPlayerVitalsFromRow(row);
  const updatedAt = normalizeIdentifier(row.updated_at || row.updatedAt);

  return [
    rowId,
    telegramId,
    Number.isFinite(balance) ? balance : '',
    vitals.health ?? '',
    vitals.food ?? '',
    vitals.water ?? '',
    updatedAt,
  ].join('|');
}

function dispatchPlayerVitalsChanged(row, payload = {}, source = 'realtime') {
  const vitals = getPlayerVitalsFromRow(row);

  if (!Object.keys(vitals).length) {
    return null;
  }

  window.dispatchEvent(new CustomEvent('mn:player-vitals-changed', {
    detail: {
      player: row,
      oldPlayer: payload?.old || null,
      vitals,
      source,
      payload,
    },
  }));

  return {
    vitals,
    source,
    payload,
  };
}

function dispatchPlayerBalanceChanged(row, payload = {}, source = 'realtime') {
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
      source,
      payload,
    },
  }));

  dispatchPlayerVitalsChanged(row, payload, source);

  return {
    balance,
    oldBalance: hasOldBalance ? oldBalance : undefined,
    delta,
    source,
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
  const normalizedTelegramId = normalizeIdentifier(telegramId);
  const normalizedPlayerRowId = normalizeIdentifier(playerRowId);

  if (!normalizedCityId) {
    console.warn('[realtime] setup skipped: cityId missing');
    return () => {};
  }

  let destroyed = false;
  let deferredMapObjectsPayload = null;
  let deferredFlushTimer = null;
  let lastBalanceSignature = '';
  let realtimeSubscribedEventSent = false;
  let assetsSubscribed = false;

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

    // Получатели берут свежий snapshot города, поэтому короткую серию UPDATE
    // сворачиваем в одно событие и не запускаем лишние перерисовки карты.
    deferredMapObjectsPayload = payload;

    scheduleDeferredRealtimeFlush(isMobileGameplayDevice() ? 140 : 80);
  }

  function announceBalanceRealtimeSubscribed(transport) {
    if (realtimeSubscribedEventSent || destroyed) return;

    realtimeSubscribedEventSent = true;

    window.dispatchEvent(new CustomEvent('mn:realtime-subscribed', {
      detail: {
        cityId: normalizedCityId,
        telegramId: normalizedTelegramId,
        playerRowId: normalizedPlayerRowId,
        transport,
      },
    }));
  }

  function handleBalanceUpdate(row = {}, payload = {}, source = 'realtime') {
    if (destroyed) return;

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

    const balance = Number(row.balance);
    const hasBalance = Number.isFinite(balance);
    const hasVitals = hasPlayerVitals(row);

    if (!hasBalance && !hasVitals) return;

    const signature = createBalanceSignature(row);

    // Одно изменение может одновременно прийти через Broadcast и
    // postgres_changes. В интерфейс отправляем его только один раз.
    if (signature && signature === lastBalanceSignature) return;
    lastBalanceSignature = signature;

    const meta = hasBalance
      ? dispatchPlayerBalanceChanged(row, payload, source)
      : dispatchPlayerVitalsChanged(row, payload, source);

    if (hasBalance && typeof onBalanceChanged === 'function') {
      onBalanceChanged(row, meta);
    }
  }

  /*
    Баланс и имущество живут в независимых каналах. Ошибка или RLS-блокировка
    одного binding не останавливает остальные подписки.
  */
  const channels = [];
  const assetsChannel = supabase.channel(`mn-assets:${normalizedCityId}`);
  channels.push(assetsChannel);

  assetsChannel.on(
    'broadcast',
    { event: 'map_object_state_changed' },
    ({ payload: broadcastPayload }) => {
      if (destroyed || !broadcastPayload) return;
      if (
        broadcastPayload.cityId &&
        String(broadcastPayload.cityId) !== normalizedCityId
      ) return;

      const objectId = normalizeIdentifier(
        broadcastPayload.mapObjectId || broadcastPayload.houseId
      );
      if (!objectId) return;

      dispatchMapObjectsChanged(normalizedCityId, {
        eventType: 'UPDATE',
        source: 'broadcast',
        new: {
          id: objectId,
          city_id: normalizedCityId,
          type: 'house',
          category: 'house',
          updated_at: broadcastPayload.updatedAt || new Date().toISOString(),
          payload: {
            kind: 'house',
            type: 'house',
            category: 'house',
            houseId: objectId,
            mapObjectId: objectId,
            ownerId: broadcastPayload.ownerId || null,
            owner_id: broadcastPayload.ownerId || null,
            ownerName: broadcastPayload.ownerName || null,
            owner_name: broadcastPayload.ownerName || null,
            owned: Boolean(broadcastPayload.ownerId),
            locked: false,
            buyable: true,
          },
        },
      });
    }
  );

  assetsChannel.on(
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

  assetsChannel.subscribe((status) => {
    assetsSubscribed = status === 'SUBSCRIBED';
    window.dispatchEvent(new CustomEvent('mn:assets-realtime-status', {
      detail: { cityId: normalizedCityId, status },
    }));
  });

  function handleMapObjectBroadcastRequest(event) {
    const detail = event?.detail || {};
    if (destroyed || !assetsSubscribed) return;
    if (detail.cityId && String(detail.cityId) !== normalizedCityId) return;

    const mapObjectId = normalizeIdentifier(detail.mapObjectId || detail.houseId);
    if (!mapObjectId) return;

    assetsChannel.send({
      type: 'broadcast',
      event: 'map_object_state_changed',
      payload: {
        cityId: normalizedCityId,
        mapObjectId,
        houseId: normalizeIdentifier(detail.houseId || mapObjectId),
        ownerId: normalizeIdentifier(detail.ownerId) || null,
        ownerName: detail.ownerName || null,
        updatedAt: new Date().toISOString(),
      },
    }).catch((error) => {
      console.warn('[realtime] map object broadcast failed:', error);
    });
  }

  window.addEventListener('mn:map-object-broadcast-request', handleMapObjectBroadcastRequest);

  if (normalizedTelegramId) {
    /*
      Основная postgres_changes-подписка всегда фильтруется по tg_id.
      Раньше при наличии устаревшего state.player.id канал подписывался на
      неверный id и корректное UPDATE проходило мимо клиента.
    */
    const postgresBalanceChannel = supabase.channel(
      `mn-balance-postgres:${normalizedTelegramId}`
    );
    channels.push(postgresBalanceChannel);

    postgresBalanceChannel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'players',
        filter: `tg_id=eq.${normalizedTelegramId}`,
      },
      (payload) => {
        handleBalanceUpdate(payload?.new || {}, payload, 'realtime_postgres');
      }
    );

    postgresBalanceChannel.subscribe((status, error) => {
      window.dispatchEvent(new CustomEvent('mn:balance-realtime-status', {
        detail: {
          telegramId: normalizedTelegramId,
          playerRowId: normalizedPlayerRowId,
          transport: 'postgres_changes',
          status,
          error: error || null,
        },
      }));

      if (status === 'SUBSCRIBED') {
        console.log('[realtime] balance postgres subscribed:', normalizedTelegramId);
        announceBalanceRealtimeSubscribed('postgres_changes');
      }
    });

    /*
      Публичный Broadcast по UUID строки игрока обходит ситуацию, когда
      postgres_changes недоступен клиенту из-за RLS/custom Telegram auth.
      SQL-триггер отправляет сюда id/tg_id/balance/health/food/water/updated_at.
    */
    if (normalizedPlayerRowId) {
      const broadcastTopic = `mn-player-balance:${normalizedPlayerRowId}`;
      const broadcastBalanceChannel = supabase.channel(broadcastTopic, {
        config: {
          broadcast: { self: false },
          private: false,
        },
      });
      channels.push(broadcastBalanceChannel);

      broadcastBalanceChannel.on(
        'broadcast',
        { event: 'balance_changed' },
        (message) => {
          const change = message?.payload || {};
          const row = change?.new || change?.record || {};
          const oldRow = change?.old || change?.old_record || {};

          handleBalanceUpdate(
            row,
            {
              ...change,
              new: row,
              old: oldRow,
              transport: 'broadcast',
            },
            'realtime_broadcast'
          );
        }
      );

      broadcastBalanceChannel.subscribe((status, error) => {
        window.dispatchEvent(new CustomEvent('mn:balance-realtime-status', {
          detail: {
            telegramId: normalizedTelegramId,
            playerRowId: normalizedPlayerRowId,
            transport: 'broadcast',
            status,
            error: error || null,
          },
        }));

        if (status === 'SUBSCRIBED') {
          console.log('[realtime] balance broadcast subscribed:', normalizedPlayerRowId);
          announceBalanceRealtimeSubscribed('broadcast');
        }
      });
    }
  }

  return () => {
    destroyed = true;
    window.removeEventListener('mn:map-object-broadcast-request', handleMapObjectBroadcastRequest);
    clearDeferredFlushTimer();
    deferredMapObjectsPayload = null;

    channels.forEach((channel) => {
      supabase.removeChannel(channel);
    });
  };
}
