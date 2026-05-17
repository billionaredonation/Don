import { supabase } from '../supabaseClient.js';
import { getRandomSpawnPoint } from '../spawn/spawnPoints.js';

const PLAYER_ID_KEY = 'mn_player_id';

let cachedPlayerId = null;

function getTelegramUserId() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || null;
}

function createLocalPlayerId() {
  return `player_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getLocalPlayerId() {
  if (cachedPlayerId) {
    return cachedPlayerId;
  }

  const telegramId = getTelegramUserId();

  if (telegramId) {
    cachedPlayerId = `tg_${telegramId}`;
    localStorage.setItem(PLAYER_ID_KEY, cachedPlayerId);
    return cachedPlayerId;
  }

  let playerId = localStorage.getItem(PLAYER_ID_KEY);

  if (!playerId) {
    playerId = createLocalPlayerId();
    localStorage.setItem(PLAYER_ID_KEY, playerId);
  }

  cachedPlayerId = playerId;

  return cachedPlayerId;
}

function normalizePosition(row) {
  return {
    playerId: row.player_id,
    nickname: row.nickname,
    cityId: row.city_id,
    x: Number(row.x),
    y: Number(row.y),
    angle: Number(row.angle || 0),
    isOnline: row.is_online ?? true,
    updatedAt: row.updated_at,
  };
}

export async function getOrCreatePlayerPosition(cityId, nickname) {
  const playerId = getLocalPlayerId();

  const { data: currentPosition, error: selectError } = await supabase
    .from('player_positions')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle();

  if (!selectError && currentPosition && currentPosition.city_id === cityId) {
    const angle = Number(currentPosition.angle || 0);

    const nextPosition = {
      player_id: playerId,
      nickname: nickname || 'Игрок',
      city_id: cityId,
      x: currentPosition.x,
      y: currentPosition.y,
      angle,
      is_online: true,
      updated_at: new Date().toISOString(),
    };

    const { data: refreshedPosition, error: refreshError } = await supabase
      .from('player_positions')
      .upsert(nextPosition, {
        onConflict: 'player_id',
      })
      .select('*')
      .single();

    if (!refreshError && refreshedPosition) {
      return normalizePosition(refreshedPosition);
    }

    return normalizePosition({
      ...currentPosition,
      angle,
      is_online: true,
      updated_at: new Date().toISOString(),
    });
  }

  const spawn = getRandomSpawnPoint(cityId);

  const nextPosition = {
    player_id: playerId,
    nickname: nickname || 'Игрок',
    city_id: cityId,
    x: spawn.x,
    y: spawn.y,
    angle: 0,
    is_online: true,
    updated_at: new Date().toISOString(),
  };

  const { data: savedPosition, error: upsertError } = await supabase
    .from('player_positions')
    .upsert(nextPosition, {
      onConflict: 'player_id',
    })
    .select('*')
    .single();

  if (upsertError) {
    console.warn('[playerPosition] upsert failed:', upsertError);

    return {
      playerId,
      nickname: nickname || 'Игрок',
      cityId,
      x: spawn.x,
      y: spawn.y,
      angle: 0,
      isOnline: true,
      updatedAt: new Date().toISOString(),
    };
  }

  return normalizePosition(savedPosition);
}

export async function updatePlayerPosition({ cityId, nickname, x, y, angle = 0 }) {
  const playerId = getLocalPlayerId();

  const nextPosition = {
    player_id: playerId,
    nickname: nickname || 'Игрок',
    city_id: cityId,
    x,
    y,
    angle,
    is_online: true,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('player_positions')
    .upsert(nextPosition, {
      onConflict: 'player_id',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return normalizePosition(data);
}

export async function getCityPlayers(cityId) {
  const aliveSince = new Date(Date.now() - 5000).toISOString();

  const { data, error } = await supabase
    .from('player_positions')
    .select('*')
    .eq('city_id', cityId)
    .eq('is_online', true)
    .gte('updated_at', aliveSince)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return (data || []).map(normalizePosition);
}

export function subscribeCityPlayers(cityId, handlers = {}) {
  const channel = supabase
    .channel(`city_players_${cityId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'player_positions',
        filter: `city_id=eq.${cityId}`,
      },
      (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          const player = normalizePosition(payload.new);

          if (player.isOnline) {
            handlers.onInsert?.(player);
          }

          return;
        }

        if (payload.eventType === 'UPDATE' && payload.new) {
          const player = normalizePosition(payload.new);

          if (player.isOnline) {
            handlers.onUpdate?.(player);
          } else {
            handlers.onDelete?.(player.playerId);
          }

          return;
        }

        if (payload.eventType === 'DELETE' && payload.old) {
          handlers.onDelete?.(payload.old.player_id);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function createCityMovementChannel(cityId, handlers = {}) {
  const channel = supabase.channel(`city_movement_${cityId}`, {
    config: {
      broadcast: {
        self: false,
      },
    },
  });

  channel.on('broadcast', { event: 'player_move' }, (payload) => {
    handlers.onMove?.(payload.payload);
  });

  channel.subscribe();

  return {
    sendMove(player) {
      channel.send({
        type: 'broadcast',
        event: 'player_move',
        payload: player,
      });
    },

    unsubscribe() {
      supabase.removeChannel(channel);
    },
  };
}

export async function setPlayerOffline() {
  const playerId = getLocalPlayerId();

  const { error } = await supabase
    .from('player_positions')
    .update({
      is_online: false,
      updated_at: new Date().toISOString(),
    })
    .eq('player_id', playerId);

  if (error) {
    throw error;
  }
}
