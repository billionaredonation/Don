import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import { getRandomSpawnPoint } from '../spawn/spawnPoints.js';

const PLAYER_ID_KEY = 'mn_player_id';
const SESSION_ID_KEY = 'mn_session_id';
const STATE_KEY = 'mn-game-state';

let cachedPlayerId = null;
let cachedSessionId = null;
let playerIdToRetire = null;
let vitalsMutationQueue = Promise.resolve();

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

function normalizeVital(value, fallback = 100, min = 0) {
  const number = Number(value);
  const safeValue = Number.isFinite(number) ? number : fallback;

  return Math.min(100, Math.max(min, safeValue));
}

/**
 * Serializes survival mutations against the same player_positions row.
 * Movement already writes to this table from the client, so stamina and AFK
 * no longer depend on Telegram initData, an Edge Function deploy or an RPC
 * schema-cache refresh before the HUD can receive the real persisted values.
 */
export function applyPlayerPositionVitalCost({
  foodCost = 0,
  waterCost = 0,
  healthDamage = 0,
  minimumHealth = 10,
  foodBefore = null,
  waterBefore = null,
} = {}) {
  const safeFoodCost = Math.max(0, Math.floor(Number(foodCost) || 0));
  const safeWaterCost = Math.max(0, Math.floor(Number(waterCost) || 0));
  const safeHealthDamage = Math.max(0, Math.floor(Number(healthDamage) || 0));
  const safeMinimumHealth = Math.min(100, Math.max(0, Number(minimumHealth) || 0));
  const safeFoodBefore = foodBefore !== null && foodBefore !== undefined && foodBefore !== '' && Number.isFinite(Number(foodBefore))
    ? normalizeVital(foodBefore, 100)
    : null;
  const safeWaterBefore = waterBefore !== null && waterBefore !== undefined && waterBefore !== '' && Number.isFinite(Number(waterBefore))
    ? normalizeVital(waterBefore, 100)
    : null;

  const mutate = async () => {
    const playerId = getLocalPlayerId();
    const { data: current, error: selectError } = await supabase
      .from('player_positions')
      .select('health, food, water')
      .eq('player_id', playerId)
      .maybeSingle();

    if (selectError) throw selectError;
    if (!current) throw new Error('PLAYER_POSITION_NOT_FOUND');

    const health = normalizeVital(current.health, state.player?.health ?? 100, safeMinimumHealth);
    const food = normalizeVital(current.food, state.player?.food ?? 100);
    const water = normalizeVital(current.water, state.player?.water ?? 100);
    const nextHealth = Math.max(safeMinimumHealth, health - safeHealthDamage);
    // With a supplied pre-action snapshot this becomes an idempotent ensure:
    // an Edge Function may already have spent part or all of the cost, and we
    // only bring player_positions down to the required target without charging
    // the same medicine twice.
    const nextFood = safeFoodBefore === null
      ? Math.max(0, food - safeFoodCost)
      : Math.min(food, Math.max(0, safeFoodBefore - safeFoodCost));
    const nextWater = safeWaterBefore === null
      ? Math.max(0, water - safeWaterCost)
      : Math.min(water, Math.max(0, safeWaterBefore - safeWaterCost));

    const { data: updated, error: updateError } = await supabase
      .from('player_positions')
      .update({
        health: nextHealth,
        food: nextFood,
        water: nextWater,
        updated_at: new Date().toISOString(),
      })
      .eq('player_id', playerId)
      .select('health, food, water')
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) throw new Error('PLAYER_POSITION_VITALS_UPDATE_FAILED');

    const result = {
      health: normalizeVital(updated.health, nextHealth, safeMinimumHealth),
      food: normalizeVital(updated.food, nextFood),
      water: normalizeVital(updated.water, nextWater),
      foodCost: safeFoodCost,
      waterCost: safeWaterCost,
      healthDamage: safeHealthDamage,
      playerId,
      transport: 'player_positions_direct_update',
    };

    result.sprintBlocked = result.food < 10 || result.water < 15;
    result.knockStateRequired = result.health <= safeMinimumHealth;
    result.hospitalizationRequired = result.knockStateRequired;

    return result;
  };

  const result = vitalsMutationQueue.then(mutate, mutate);
  vitalsMutationQueue = result.catch(() => undefined);

  return result;
}

/**
 * Restores canonical vitals in player_positions. Consumable inventory RPCs
 * from older deployments still update the legacy players row, while every
 * gameplay HUD and survival system reads player_positions.
 */
export function applyPlayerPositionVitalRestore({
  foodRestore = 0,
  waterRestore = 0,
  healthRestore = 0,
} = {}) {
  const safeFoodRestore = Math.max(0, Math.floor(Number(foodRestore) || 0));
  const safeWaterRestore = Math.max(0, Math.floor(Number(waterRestore) || 0));
  const safeHealthRestore = Math.max(0, Math.floor(Number(healthRestore) || 0));

  const mutate = async () => {
    const playerId = getLocalPlayerId();
    const { data: current, error: selectError } = await supabase
      .from('player_positions')
      .select('health, food, water, knock_state')
      .eq('player_id', playerId)
      .maybeSingle();

    if (selectError) throw selectError;
    if (!current) throw new Error('PLAYER_POSITION_NOT_FOUND');

    const health = normalizeVital(current.health, state.player?.health ?? 100);
    const food = normalizeVital(current.food, state.player?.food ?? 100);
    const water = normalizeVital(current.water, state.player?.water ?? 100);
    const nextHealth = Math.min(100, health + safeHealthRestore);
    const nextFood = Math.min(100, food + safeFoodRestore);
    const nextWater = Math.min(100, water + safeWaterRestore);
    const invalidCountdown = String(current.knock_state || 'conscious') === 'countdown' && nextHealth > 10;
    const updates = {
      health: nextHealth,
      food: nextFood,
      water: nextWater,
      updated_at: new Date().toISOString(),
    };

    if (invalidCountdown) {
      Object.assign(updates, {
        knock_state: 'conscious',
        knock_started_at: null,
        hospitalized_at: null,
        hospital_id: null,
        hospital_bed_id: null,
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from('player_positions')
      .update(updates)
      .eq('player_id', playerId)
      .select('health, food, water, knock_state')
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) throw new Error('PLAYER_POSITION_VITALS_UPDATE_FAILED');

    return {
      health: normalizeVital(updated.health, nextHealth),
      food: normalizeVital(updated.food, nextFood),
      water: normalizeVital(updated.water, nextWater),
      knockState: String(updated.knock_state || (invalidCountdown ? 'conscious' : current.knock_state || 'conscious')),
      foodRestore: safeFoodRestore,
      waterRestore: safeWaterRestore,
      healthRestore: safeHealthRestore,
      playerId,
      transport: 'player_positions_direct_restore',
    };
  };

  const result = vitalsMutationQueue.then(mutate, mutate);
  vitalsMutationQueue = result.catch(() => undefined);

  return result;
}

async function getPlayerAdminFlag(playerId, nickname) {
  const safeNickname = getSafeNickname(nickname).replaceAll(',', '');
  const telegramId = getTelegramUserId();

  const checks = [];

  if (telegramId) checks.push({ table: 'players', column: 'tg_id', value: telegramId });
  if (playerId) checks.push({ table: 'players', column: 'player_id', value: playerId });
  if (safeNickname) checks.push({ table: 'players', column: 'nickname', value: safeNickname, ilike: true });
  if (playerId) checks.push({ table: 'player_positions', column: 'player_id', value: playerId });
  if (safeNickname) checks.push({ table: 'player_positions', column: 'nickname', value: safeNickname, ilike: true });

  for (const check of checks) {
    try {
      let query = supabase
        .from(check.table)
        .select('*')
        .limit(1);

      query = check.ilike
        ? query.ilike(check.column, check.value)
        : query.eq(check.column, check.value);

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.warn('[playerPosition] admin flag loading failed:', check.table, error);
        continue;
      }

      if (!data) continue;

      const isAdmin = isTruthyAdmin(data.is_admin || data.isAdmin);

      if (isAdmin) {
        rememberAdminFlag(playerId, true);
        return true;
      }
    } catch (error) {
      console.warn('[playerPosition] admin flag check crashed:', check.table, error);
    }
  }

  const cached = readCachedAdminFlag(playerId);
  rememberAdminFlag(playerId, cached);

  return cached;
}

function normalizePosition(row, extra = {}) {
  const adminFlag = extra.is_admin ?? row.is_admin;
  const position = {
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

  // Survival values are canonical in player_positions. Keep them on the
  // normalized local player as soon as the position row is loaded, otherwise
  // the older values from players briefly overwrite the HUD on every entry.
  ['health', 'food', 'water'].forEach((key) => {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) position[key] = clampPercent(value, 100);
  });

  position.knockState = String(row?.knock_state || 'conscious');
  position.knockStartedAt = row?.knock_started_at || null;
  position.hospitalizedAt = row?.hospitalized_at || null;
  position.hospitalId = row?.hospital_id || null;
  position.hospitalBedId = row?.hospital_bed_id || null;
  position.bedsideTreatmentType = row?.bedside_treatment_type || null;
  position.bedsideTreatmentStartedAt = row?.bedside_treatment_started_at || null;
  position.bedsideTreatmentLastTickAt = row?.bedside_treatment_last_tick_at || null;

  return position;
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
    // Интерьер — отдельная realtime-комната. Пока игрок внутри, его строка
    // города сохраняется для будущего выхода, но не должна отображаться на улице.
    is_online: window.__MN_INTERIOR_ACTIVE__ !== true,
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

  // Запрос движения мог стартовать за миллисекунду до входа в интерьер и
  // завершиться уже после offline-пакета. Повторно закрепляем offline, чтобы
  // такая гонка не возвращала призрак игрока на улицу.
  if (window.__MN_INTERIOR_ACTIVE__ === true && nextPosition.is_online === true) {
    await setPlayerOffline();
    nextPosition.is_online = false;
  }

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
  let presenceTracked = false;
  let lastSendAt = 0;
  let sendTimer = null;
  let queuedPayload = null;

  const pendingPayloads = [];
  const pendingTreatmentPayloads = [];
  const MIN_CHANNEL_SEND_INTERVAL_MS = 45;
  const localPlayerId = getLocalPlayerId();
  const localSessionId = getSessionId();
  let latestPresencePayload = {
    playerId: localPlayerId,
    player_id: localPlayerId,
    sessionId: localSessionId,
    session_id: localSessionId,
    cityId,
    city_id: cityId,
    isOnline: true,
    is_online: true,
    updatedAt: new Date().toISOString(),
  };

  const channel = supabase.channel(`city_movement_${cityId}`, {
    config: {
      broadcast: {
        self: false,
      },
      presence: {
        key: `${localPlayerId}:${localSessionId}`,
      },
    },
  });

  function getPresencePlayerId(presence = {}) {
    return String(
      presence.playerId || presence.player_id || presence.id || ''
    ).trim();
  }

  function hasActivePresence(playerId) {
    if (!playerId) return false;
    const presenceState = channel.presenceState?.() || {};

    return Object.values(presenceState)
      .flat()
      .some((presence) => getPresencePlayerId(presence) === String(playerId));
  }

  function trackLocalPresence(payload = latestPresencePayload) {
    if (destroyed || !subscribed) return;
    latestPresencePayload = {
      ...latestPresencePayload,
      ...payload,
      playerId: localPlayerId,
      player_id: localPlayerId,
      sessionId: localSessionId,
      session_id: localSessionId,
      cityId,
      city_id: cityId,
      isOnline: true,
      is_online: true,
      updatedAt: new Date().toISOString(),
    };

    const result = channel.track(latestPresencePayload);
    presenceTracked = true;
    result?.catch?.((error) => {
      presenceTracked = false;
      console.warn('[playerPosition] city presence track failed:', error);
    });
  }

  function untrackLocalPresence() {
    if (!subscribed || !presenceTracked) return;
    presenceTracked = false;
    const result = channel.untrack();
    result?.catch?.((error) => {
      console.warn('[playerPosition] city presence untrack failed:', error);
    });
  }

  channel.on('broadcast', { event: 'player_move' }, (payload) => {
    if (destroyed) return;
    handlers.onMove?.(payload.payload);
  });

  channel.on('broadcast', { event: 'player_treatment' }, (payload) => {
    if (destroyed) return;
    handlers.onTreatment?.(payload.payload);
  });

  channel.on('presence', { event: 'join' }, ({ newPresences = [] }) => {
    if (destroyed) return;
    newPresences.forEach((presence) => {
      const playerId = getPresencePlayerId(presence);
      if (playerId) handlers.onPresenceJoin?.(playerId, presence);
    });
  });

  channel.on('presence', { event: 'leave' }, ({ leftPresences = [] }) => {
    if (destroyed) return;

    leftPresences.forEach((presence) => {
      const playerId = getPresencePlayerId(presence);
      if (!playerId) return;

      // Presence state is updated together with the leave event. Defer one
      // microtask so another active tab/session of the same player can remain.
      queueMicrotask(() => {
        if (!destroyed && !hasActivePresence(playerId)) {
          handlers.onPresenceLeave?.(playerId, presence);
        }
      });
    });
  });

  function safeSend(payload, event = 'player_move') {
    if (destroyed || !payload) return;

    try {
      const result = channel.send({
        type: 'broadcast',
        event,
        payload,
      });

      if (result?.catch) {
        result.catch((error) => {
          console.warn(`[playerPosition] ${event} broadcast failed:`, error);
        });
      }
    } catch (error) {
      console.warn(`[playerPosition] ${event} broadcast crashed:`, error);
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
    if (destroyed) return;
    if (status !== 'SUBSCRIBED') {
      subscribed = false;
      presenceTracked = false;
      return;
    }

    subscribed = true;

    while (pendingPayloads.length) {
      queuedPayload = pendingPayloads.shift();
    }

    const shouldTrackPresence = !(
      latestPresencePayload.isOnline === false ||
      latestPresencePayload.is_online === false ||
      queuedPayload?.isOnline === false ||
      queuedPayload?.is_online === false
    );
    if (shouldTrackPresence) trackLocalPresence();
    else untrackLocalPresence();

    flushQueuedSend();
    while (pendingTreatmentPayloads.length) {
      safeSend(pendingTreatmentPayloads.shift(), 'player_treatment');
    }
  });

  return {
    sendMove(player) {
      if (destroyed || !player) return;

      latestPresencePayload = {
        ...latestPresencePayload,
        ...player,
        isOnline: true,
        is_online: true,
      };

      if (subscribed && !presenceTracked) trackLocalPresence(latestPresencePayload);

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

    sendPresence(player, isOnline) {
      if (destroyed || !player) return;

      const presencePayload = {
        ...player,
        isOnline: isOnline === true,
        is_online: isOnline === true,
        updatedAt: player.updatedAt || new Date().toISOString(),
      };
      latestPresencePayload = {
        ...latestPresencePayload,
        ...presencePayload,
      };

      queuedPayload = null;
      if (sendTimer) {
        clearTimeout(sendTimer);
        sendTimer = null;
      }

      if (!subscribed) {
        pendingPayloads.length = 0;
        pendingPayloads.push(presencePayload);
        return;
      }

      lastSendAt = Date.now();
      safeSend(presencePayload);

      if (isOnline === true) trackLocalPresence(presencePayload);
      else untrackLocalPresence();
    },

    sendTreatment(treatment) {
      if (destroyed || !treatment) return;
      if (!subscribed) {
        pendingTreatmentPayloads.push(treatment);
        if (pendingTreatmentPayloads.length > 2) pendingTreatmentPayloads.shift();
        return;
      }
      safeSend(treatment, 'player_treatment');
    },

    unsubscribe() {
      untrackLocalPresence();
      destroyed = true;
      pendingPayloads.length = 0;
      pendingTreatmentPayloads.length = 0;
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
