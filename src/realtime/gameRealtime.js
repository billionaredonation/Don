import { supabase } from '../supabaseClient.js';

function normalizeTelegramId(value) {
  return value === undefined || value === null ? '' : String(value);
}

function getPlayerTelegramId(row = {}) {
  return normalizeTelegramId(row.tg_id || row.telegram_id || row.telegramId);
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

function dispatchPlayerBalanceChanged(row, payload = {}) {
  const balance = Number(row?.balance || 0);
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
}

export function setupGameRealtime({
  cityId,
  telegramId,
  onBalanceChanged,
} = {}) {
  const normalizedCityId = String(cityId || '').trim();
  const normalizedTelegramId = normalizeTelegramId(telegramId);

  if (!normalizedCityId) {
    console.warn('[realtime] setup skipped: cityId missing');
    return () => {};
  }

  let destroyed = false;

  const channel = supabase.channel(
    `mn-game:${normalizedCityId}:${normalizedTelegramId || 'guest'}`
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

      dispatchMapObjectsChanged(normalizedCityId, payload);
    }
  );

  channel.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'players',
    },
    (payload) => {
      if (destroyed) return;

      const row = payload?.new || {};
      const changedTelegramId = getPlayerTelegramId(row);

      if (!normalizedTelegramId || changedTelegramId !== normalizedTelegramId) {
        return;
      }

      dispatchPlayerBalanceChanged(row, payload);

      if (typeof onBalanceChanged === 'function') {
        onBalanceChanged(row);
      }
    }
  );

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[realtime] subscribed:', normalizedCityId);
    }
  });

  return () => {
    destroyed = true;
    supabase.removeChannel(channel);
  };
}
