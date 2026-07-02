import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import { getRandomSpawnPoint } from '../spawn/spawnPoints.js';

const PLAYER_ID_KEY = 'mn_player_id';
const SESSION_ID_KEY = 'mn_session_id';
const STATE_KEY = 'mn-game-state';

let cachedPlayerId = null;
let cachedSessionId = null;
let playerIdToRetire = null;

const ADMIN_FLAG_CACHE_TTL_MS = 5 * 60 * 1000;
const adminFlagCache = new Map();

function readSavedTelegramId() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;

    const saved = JSON.parse(raw);

    return (
      saved?.telegramId ||
      saved?.player?.telegramId ||
      saved?.player?.tg_id ||
      null
    );
  } catch {
    return null;
  }
}

function getTelegramUserId() {
  const tgUserId =
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
    window.Telegram?.WebApp?.initDataUnsafe?.receiver?.id ||
    null;

  const value =
    tgUserId ||
    state.telegramId ||
    state.player?.telegramId ||
    state.player?.tg_id ||
    readSavedTelegramId() ||
    null;

  return value ? String(value) : null;
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


function clampPercent(value, fallback = 50) {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  return Math.min(100, Math.max(0, number));
}

function normalizeRangeOptions(options = {}) {
  const centerX = Number(options.centerX);
  const centerY = Number(options.centerY);
  const radius = Number(options.radiusPercent ?? options.radius);

  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    radius >= 100
  ) {
    return null;
  }

  const safeX = clampPercent(centerX);
  const safeY = clampPercent(centerY);
  const safeRadius = Math.min(100, Math.max(1, radius));

  return {
    minX: Math.max(0, safeX - safeRadius),
    maxX: Math.min(100, safeX + safeRadius),
    minY: Math.max(0, safeY - safeRadius),
    maxY: Math.min(100, safeY + safeRadius),
  };
}

function isTruthyAdmin(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function rememberAdminFlag(playerId, value) {
  if (!playerId) return;

  adminFlagCache.set(String(playerId), {
    value: isTruthyAdmin(value),
    savedAt: Date.now(),
  });
}

function readCachedAdminFlag(playerId) {
  const safePlayerId = String(playerId || '');
  const cached = adminFlagCache.get(safePlayerId);

  if (cached && Date.now() - cached.savedAt <= ADMIN_FLAG_CACHE_TTL_MS) {
    return cached.value;
  }

  return isTruthyAdmin(state.player?.is_admin || state.player?.isAdmin);
}

function rememberPlayerIdToRetire(oldPlayerId, nextPlayerId) {
  if (!oldPlayerId || !nextPlayerId) return;
  if (String(oldPlayerId) === String(nextPlayerId)) return;
  if (!String(oldPlayerId).startsWith('player_')) return;

  playerIdToRetire = String(oldPlayerId);
}

async function retirePreviousPlayerIdIfNeeded() {
  if (!playerIdToRetire) return;

  const oldPlayerId = playerIdToRetire;
  playerIdToRetire = null;

  try {
    await supabase
      .from('player_positions')
      .update({
        is_online: false,
        updated_at: new Date().toISOString(),
      })
      .eq('player_id', oldPlayerId);
  } catch (error) {
    console.warn('[playerPosition] old local player retire failed:', error);
  }
}

export function getLocalPlayerId() {
  const telegramId = getTelegramUserId();

  if (telegramId) {
    const nextPlayerId = `tg_${telegramId}`;
    const storedPlayerId = localStorage.getItem(PLAYER_ID_KEY);

    rememberPlayerIdToRetire(storedPlayerId || cachedPlayerId, nextPlayerId);

    cachedPlayerId = nextPlayerId;
    localStorage.setItem(PLAYER_ID_KEY, nextPlayerId);

    return cachedPlayerId;
  }

  if (cachedPlayerId) return cachedPlayerId;

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
  const safeNickname = getSafeNickname(nickname).replaceAll(',', '');
  const telegramId = getTelegramUserId();

  let query = supabase
    .from('players')
    .select('id, player_id, tg_id, nickname, is_admin')
    .limit(1);

  if (telegramId) {
    query = query.or(`tg_id.eq.${telegramId},player_id.eq.${playerId},nickname.ilike.${safeNickname}`);
  } else {
    query = query.or(`player_id.eq.${playerId},nickname.ilike.${safeNickname}`);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.warn('[playerPosition] admin flag loading failed:', error);
    return false;
  }

  const isAdmin = isTruthyAdmin(data?.is_admin);
  rememberAdminFlag(playerId, isAdmin);

  return isAdmin;
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

  await retirePreviousPlayerIdIfNeeded();

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

  await retirePreviousPlayerIdIfNeeded();

  /*
    ВАЖНО ДЛЯ МОБИЛКИ:
    раньше каждый save позиции делал дополнительный SELECT в players,
    чтобы перечитать is_admin, а потом ещё upsert + select. Это легко давало
    микрофриз раз в несколько секунд. Во время движения админ-флаг не меняется,
    поэтому берём его из кеша, который заполняется при входе/создании позиции.
  */
  const isAdmin = readCachedAdminFlag(playerId);

  const nextPosition = {
    player_id: playerId,
    nickname: safeNickname,
    city_id: cityId,
    x: clampPercent(x),
    y: clampPercent(y),
    angle: Number.isFinite(Number(angle)) ? Number(angle) : 0,
    is_online: true,
    is_admin: isAdmin,
    session_id: sessionId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('player_positions')
    .upsert(nextPosition, {
      onConflict: 'player_id',
    });

  if (error) throw error;

  return normalizePosition(nextPosition);
}

export async function getCityPlayers(cityId, options = {}) {
  const range = normalizeRangeOptions(options);

  let query = supabase
    .from('player_positions')
    .select('*')
    .eq('city_id', cityId)
    .eq('is_online', true);

  if (range) {
    query = query
      .gte('x', range.minX)
      .lte('x', range.maxX)
      .gte('y', range.minY)
      .lte('y', range.maxY);
  }

  const { data, error } = await query
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
  let subscribed = false;
  let destroyed = false;
  let lastSendAt = 0;
  let sendTimer = null;
  let queuedPayload = null;

  const pendingPayloads = [];
  const MIN_CHANNEL_SEND_INTERVAL_MS = 45;

  const channel = supabase.channel(`city_movement_${cityId}`, {
    config: {
      broadcast: {
        self: false,
      },
    },
  });

  channel.on('broadcast', { event: 'player_move' }, (payload) => {
    if (destroyed) return;
    handlers.onMove?.(payload.payload);
  });

  function safeSend(payload) {
    if (destroyed || !payload) return;

    try {
      const result = channel.send({
        type: 'broadcast',
        event: 'player_move',
        payload,
      });

      if (result?.catch) {
        result.catch((error) => {
          console.warn('[playerPosition] movement broadcast failed:', error);
        });
      }
    } catch (error) {
      console.warn('[playerPosition] movement broadcast crashed:', error);
    }
  }

  function flushQueuedSend() {
    if (destroyed) return;

    sendTimer = null;

    const payload = queuedPayload;
    queuedPayload = null;

    if (!payload) return;

    lastSendAt = Date.now();
    safeSend(payload);
  }

  channel.subscribe((status) => {
    if (destroyed || status !== 'SUBSCRIBED') return;

    subscribed = true;

    while (pendingPayloads.length) {
      queuedPayload = pendingPayloads.shift();
    }

    flushQueuedSend();
  });

  return {
    sendMove(player) {
      if (destroyed || !player) return;

      if (!subscribed) {
        pendingPayloads.push(player);

        if (pendingPayloads.length > 3) {
          pendingPayloads.shift();
        }

        return;
      }

      const now = Date.now();
      const elapsed = now - lastSendAt;

      if (elapsed >= MIN_CHANNEL_SEND_INTERVAL_MS) {
        lastSendAt = now;
        safeSend(player);
        return;
      }

      queuedPayload = player;

      if (!sendTimer) {
        sendTimer = window.setTimeout(
          flushQueuedSend,
          MIN_CHANNEL_SEND_INTERVAL_MS - elapsed
        );
      }
    },

    unsubscribe() {
      destroyed = true;
      pendingPayloads.length = 0;
      queuedPayload = null;

      if (sendTimer) {
        clearTimeout(sendTimer);
        sendTimer = null;
      }

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
