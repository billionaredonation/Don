import { supabase } from '../supabaseClient.js';
import { getRandomSpawnPoint } from '../spawn/spawnPoints.js';

const PLAYER_ID_KEY = 'mn_player_id';
const SESSION_ID_KEY = 'mn_session_id';

let cachedPlayerId = null;
let cachedSessionId = null;

function getTelegramUserId() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || null;
}

function createLocalPlayerId() {
  return `player_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createSessionId() {
  return `session_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getSafeNickname(nickname) {
  const value = String(nickname || '').trim();
  return value || 'Игрок';
}

function isTruthyAdmin(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function getLocalPlayerId() {
  if (cachedPlayerId) return cachedPlayerId;

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

export function getSessionId() {
  if (cachedSessionId) return cachedSessionId;

  let sessionId = localStorage.getItem(SESSION_ID_KEY);

  if (!sessionId) {
    sessionId = createSessionId();
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }

  cachedSessionId = sessionId;
  return cachedSessionId;
}

async function getPlayerAdminFlag(playerId, nickname) {
  const safeNickname = getSafeNickname(nickname);

  const { data, error } = await supabase
    .from('players')
    .select('id, player_id, tg_id, nickname, is_admin')
    .or(`player_id.eq.${playerId},nickname.ilike.${safeNickname}`)
    .maybeSingle();

  if (error) {
    console.warn('[playerPosition] admin flag loading failed:', error);
    return false;
  }

  return isTruthyAdmin(data?.is_admin);
}

function normalizePosition(row, extra = {}) {
  const adminFlag = extra.is_admin ?? row.is_admin;

  return {
    playerId: row.player_id,
    nickname: getSafeNickname(row.nickname),
    cityId: row.city_id,
    x: Number(row.x),
    y: Number(row.y),
    angle: Number(row.angle || 0),
    isOnline: row.is_online ?? true,
    sessionId: row.session_id || null,
    is_admin: isTruthyAdmin(adminFlag),
    isAdmin: isTruthyAdmin(adminFlag),
    updatedAt: row.updated_at,
  };
}

export async function getOrCreatePlayerPosition(cityId, nickname) {
  const playerId = getLocalPlayerId();
  const sessionId = getSessionId();
  const safeNickname = getSafeNickname(nickname);
  const isAdmin = await getPlayerAdminFlag(playerId, safeNickname);

  const { data: currentPosition, error: selectError } = await supabase
    .from('player_positions')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle();

  if (!selectError && currentPosition && currentPosition.city_id === cityId) {
    const angle = Number(currentPosition.angle || 0);

    const nextPosition = {
      player_id: playerId,
      nickname: safeNickname,
      city_id: cityId,
      x: currentPosition.x,
      y: currentPosition.y,
      angle,
      is_online: true,
      is_admin: isAdmin,
      session_id: sessionId,
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

    return normalizePosition(nextPosition);
  }

  const spawn = getRandomSpawnPoint(cityId);

  const nextPosition = {
    player_id: playerId,
    nickname: safeNickname,
    city_id: cityId,
    x: spawn.x,
    y: spawn.y,
    angle: 0,
    is_online: true,
    is_admin: isAdmin,
    session_id: sessionId,
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
      nickname: safeNickname,
      cityId,
      x: spawn.x,
      y: spawn.y,
      angle: 0,
      isOnline: true,
      sessionId,
      is_admin: isAdmin,
      isAdmin,
      updatedAt: new Date().toISOString(),
    };
  }

  return normalizePosition(savedPosition);
}

export async function updatePlayerPosition({ cityId, nickname, x, y, angle = 0 }) {
  const playerId = getLocalPlayerId();
  const sessionId = getSessionId();
  const safeNickname = getSafeNickname(nickname);
  const isAdmin = await getPlayerAdminFlag(playerId, safeNickname);

  const nextPosition = {
    player_id: playerId,
    nickname: safeNickname,
    city_id: cityId,
    x,
    y,
    angle,
    is_online: true,
    is_admin: isAdmin,
    session_id: sessionId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('player_positions')
    .upsert(nextPosition, {
      onConflict: 'player_id',
    })
    .select('*')
    .single();

  if (error) throw error;

  return normalizePosition(data);
}

export async function getCityPlayers(cityId) {
  /*
    Не фильтруем игроков по updated_at на клиенте.
    У разных телефонов время может отличаться на несколько секунд/минут,
    и тогда один игрок видит второго, а второй первого — нет.
    Актуальность держим через is_online + heartbeat + локальную очистку DOM.
  */
  const { data, error } = await supabase
    .from('player_positions')
    .select('*')
    .eq('city_id', cityId)
    .eq('is_online', true)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data || []).map((row) => normalizePosition(row));
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

export async function getActivePlayerSession() {
  const playerId = getLocalPlayerId();

  const { data, error } = await supabase
    .from('player_positions')
    .select('session_id')
    .eq('player_id', playerId)
    .maybeSingle();

  if (error) throw error;

  return data?.session_id || null;
}

export async function setPlayerOffline() {
  const playerId = getLocalPlayerId();
  const sessionId = getSessionId();

  const { error } = await supabase
    .from('player_positions')
    .update({
      is_online: false,
      updated_at: new Date().toISOString(),
    })
    .eq('player_id', playerId)
    .eq('session_id', sessionId);

  if (error) throw error;
}
