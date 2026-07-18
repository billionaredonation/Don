import { supabase } from '../supabaseClient.js';

export const INTERIOR_SEAT_STATE_TABLE = 'interior_seat_states';

// Около 22 пакетов/с: движение заметно живее, но без бессмысленных 60
// broadcast-сообщений в секунду от каждого игрока.
const MOVE_SEND_INTERVAL_MS = 45;

function safeText(value, maxLength = 180) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function finitePercent(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, number));
}

function topicHash(value) {
  let hash = 2166136261;
  const text = String(value || 'interior');

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function normalizeRemotePlayer(player = {}) {
  const playerId = safeText(player.playerId || player.player_id || player.id, 120);
  const sessionId = safeText(player.sessionId || player.session_id, 160);

  if (!playerId) return null;

  return {
    playerId,
    sessionId,
    nickname: safeText(player.nickname || player.name || 'Игрок', 32) || 'Игрок',
    instanceId: safeText(player.instanceId || player.instance_id, 180),
    templateId: safeText(player.templateId || player.template_id, 48),
    x: finitePercent(player.x),
    y: finitePercent(player.y),
    seatedObjectId: safeText(player.seatedObjectId || player.seated_object_id, 160) || null,
    packetSequence: Number(player.packetSequence || player.packet_sequence || 0) || 0,
    connectionId: safeText(player.connectionId || player.connection_id, 96),
    updatedAt: player.updatedAt || player.updated_at || new Date().toISOString(),
  };
}

function samePlayerSession(player, playerId, sessionId) {
  if (!player || String(player.playerId || '') !== String(playerId || '')) return false;

  const remoteSessionId = String(player.sessionId || '');
  return !remoteSessionId || !sessionId || remoteSessionId === String(sessionId);
}

export function normalizeInteriorSeatState(row = {}) {
  const instanceId = safeText(row.instance_id || row.instanceId, 180);
  const objectId = safeText(row.object_id || row.objectId, 160);

  if (!instanceId || !objectId) return null;

  return {
    instanceId,
    objectId,
    templateId: safeText(row.template_id || row.templateId, 48),
    playerId: safeText(row.player_id || row.playerId, 120),
    tgId: safeText(row.tg_id || row.tgId, 32) || null,
    nickname: safeText(row.nickname || 'Игрок', 32) || 'Игрок',
    sessionId: safeText(row.session_id || row.sessionId, 160),
    occupiedAt: row.occupied_at || row.occupiedAt || null,
    heartbeatAt: row.heartbeat_at || row.heartbeatAt || null,
  };
}

export async function loadInteriorSeatStates(instanceId) {
  const safeInstanceId = safeText(instanceId);
  if (!safeInstanceId) return [];

  const { data, error } = await supabase
    .from(INTERIOR_SEAT_STATE_TABLE)
    .select('instance_id, object_id, template_id, player_id, tg_id, nickname, session_id, occupied_at, heartbeat_at')
    .eq('instance_id', safeInstanceId);

  if (error) throw error;

  return (Array.isArray(data) ? data : [])
    .map(normalizeInteriorSeatState)
    .filter(Boolean);
}

export function subscribeInteriorSeatStates(instanceId, handlers = {}) {
  const safeInstanceId = safeText(instanceId);
  if (!safeInstanceId) return () => {};

  const channel = supabase
    .channel(`mn-interior-seats-${topicHash(safeInstanceId)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: INTERIOR_SEAT_STATE_TABLE,
        filter: `instance_id=eq.${safeInstanceId}`,
      },
      (payload) => {
        const row = normalizeInteriorSeatState(payload?.new || payload?.old);
        if (!row || row.instanceId !== safeInstanceId) return;

        if (payload.eventType === 'DELETE') handlers.onDelete?.(row, payload);
        else handlers.onChange?.(row, payload);
      }
    )
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        handlers.onError?.(error || new Error(status));
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function claimInteriorSeat({
  instanceId,
  templateId,
  objectId,
  playerId,
  tgId,
  nickname,
  sessionId,
} = {}) {
  const { data, error } = await supabase.rpc('claim_interior_seat', {
    p_instance_id: safeText(instanceId),
    p_template_id: safeText(templateId, 48),
    p_object_id: safeText(objectId, 160),
    p_player_id: safeText(playerId, 120),
    p_tg_id: safeText(tgId, 32) || null,
    p_nickname: safeText(nickname || 'Игрок', 32) || 'Игрок',
    p_session_id: safeText(sessionId, 160),
  });

  if (error) throw error;

  const seat = normalizeInteriorSeatState(data?.seat || data);

  return {
    ...(data && typeof data === 'object' ? data : {}),
    ok: data?.ok !== false,
    seat,
  };
}

export async function releaseInteriorSeat({
  instanceId,
  objectId,
  playerId,
  sessionId,
} = {}) {
  const { data, error } = await supabase.rpc('release_interior_seat', {
    p_instance_id: safeText(instanceId),
    p_object_id: safeText(objectId, 160),
    p_player_id: safeText(playerId, 120),
    p_session_id: safeText(sessionId, 160),
  });

  if (error) throw error;
  return data || { ok: true };
}

export async function heartbeatInteriorSeat({
  instanceId,
  objectId,
  playerId,
  sessionId,
} = {}) {
  const { data, error } = await supabase.rpc('heartbeat_interior_seat', {
    p_instance_id: safeText(instanceId),
    p_object_id: safeText(objectId, 160),
    p_player_id: safeText(playerId, 120),
    p_session_id: safeText(sessionId, 160),
  });

  if (error) throw error;
  return data || { ok: true };
}

export function createInteriorRealtimeRoom({
  instanceId,
  templateId,
  playerId,
  nickname,
  sessionId,
  getLocalState,
  onRemotePlayer,
  onRemoteLeave,
  onStatus,
} = {}) {
  const safeInstanceId = safeText(instanceId);
  const safeTemplateId = safeText(templateId, 48);
  const safePlayerId = safeText(playerId, 120);
  const safeSessionId = safeText(sessionId, 160);
  const presenceKey = `${safePlayerId}:${safeSessionId || 'session'}`.slice(0, 240);

  if (!safeInstanceId || !safePlayerId) {
    return {
      sendPosition() {},
      refreshPresence() {},
      destroy() {},
    };
  }

  let destroyed = false;
  let subscribed = false;
  let sendTimer = 0;
  let queuedPlayer = null;
  let lastSendAt = 0;
  let lastSignature = '';
  let packetSequence = 0;
  let presencePlayerIds = new Set();
  const connectionId = globalThis.crypto?.randomUUID?.() ||
    `interior-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const channel = supabase.channel(`mn-interior-room-${topicHash(safeInstanceId)}`, {
    config: {
      broadcast: { self: false, ack: false },
      presence: { key: presenceKey },
    },
  });

  function localSnapshot(extra = {}) {
    const state = typeof getLocalState === 'function' ? getLocalState() || {} : {};
    return normalizeRemotePlayer({
      ...state,
      ...extra,
      instanceId: safeInstanceId,
      templateId: safeTemplateId,
      playerId: safePlayerId,
      sessionId: safeSessionId,
      nickname: nickname || state.nickname || 'Игрок',
      connectionId,
      packetSequence,
      updatedAt: new Date().toISOString(),
    });
  }

  function isRemotePlayer(player) {
    return player &&
      player.instanceId === safeInstanceId &&
      !samePlayerSession(player, safePlayerId, safeSessionId);
  }

  function receivePlayer(rawPlayer) {
    const player = normalizeRemotePlayer(rawPlayer);
    if (!isRemotePlayer(player)) return;
    onRemotePlayer?.(player);
  }

  function sendNow(player, force = false) {
    if (!subscribed || destroyed || !player) return;

    const signature = [
      player.x.toFixed(2),
      player.y.toFixed(2),
      player.seatedObjectId || '',
    ].join('|');

    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    lastSendAt = Date.now();

    const outgoingPlayer = {
      ...player,
      connectionId,
      packetSequence: ++packetSequence,
      updatedAt: new Date().toISOString(),
    };

    const result = channel.send({
      type: 'broadcast',
      event: 'player_move',
      payload: outgoingPlayer,
    });

    result?.catch?.((error) => {
      console.warn('[interiors] room movement broadcast failed:', error);
    });
  }

  function flushQueuedPosition() {
    sendTimer = 0;
    const player = queuedPlayer;
    queuedPlayer = null;
    sendNow(player);
  }

  function syncPresence() {
    if (destroyed) return;

    const nextPlayerIds = new Set();
    const presenceState = channel.presenceState?.() || {};

    Object.values(presenceState).flat().forEach((presence) => {
      const player = normalizeRemotePlayer(presence);
      if (!isRemotePlayer(player)) return;
      nextPlayerIds.add(player.playerId);
      onRemotePlayer?.(player);
    });

    presencePlayerIds.forEach((remotePlayerId) => {
      if (!nextPlayerIds.has(remotePlayerId)) onRemoteLeave?.(remotePlayerId);
    });
    presencePlayerIds = nextPlayerIds;
  }

  channel
    .on('presence', { event: 'sync' }, syncPresence)
    .on('broadcast', { event: 'player_move' }, (message) => {
      receivePlayer(message?.payload);
    })
    .on('broadcast', { event: 'player_leave' }, (message) => {
      const player = normalizeRemotePlayer(message?.payload);
      if (!isRemotePlayer(player)) return;
      presencePlayerIds.delete(player.playerId);
      onRemoteLeave?.(player.playerId);
    })
    .subscribe((status, error) => {
      if (destroyed) return;
      onStatus?.(status, error);

      if (status === 'SUBSCRIBED') {
        subscribed = true;
        const player = localSnapshot();
        if (player) {
          channel.track(player).catch((trackError) => {
            console.warn('[interiors] room presence track failed:', trackError);
          });
          sendNow(player, true);
        }
      }
    });

  return {
    sendPosition(extra = {}, { force = false } = {}) {
      const player = localSnapshot(extra);
      if (!player || destroyed) return;

      if (!subscribed) {
        queuedPlayer = player;
        return;
      }

      const elapsed = Date.now() - lastSendAt;
      if (force || elapsed >= MOVE_SEND_INTERVAL_MS) {
        sendNow(player, force);
        return;
      }

      queuedPlayer = player;
      if (!sendTimer) {
        sendTimer = window.setTimeout(flushQueuedPosition, MOVE_SEND_INTERVAL_MS - elapsed);
      }
    },

    refreshPresence(extra = {}) {
      if (!subscribed || destroyed) return;
      const player = localSnapshot(extra);
      if (!player) return;
      channel.track(player).catch((error) => {
        console.warn('[interiors] room presence refresh failed:', error);
      });
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      subscribed = false;
      queuedPlayer = null;
      window.clearTimeout(sendTimer);
      sendTimer = 0;

      const player = localSnapshot();
      if (player) {
        try {
          channel.send({ type: 'broadcast', event: 'player_leave', payload: player });
        } catch {
          // The socket may already be closed during pagehide/cleanup.
        }
      }

      try {
        channel.untrack?.();
      } catch {
        // Supabase removes presence automatically with the channel as a fallback.
      }
      supabase.removeChannel(channel);
      presencePlayerIds.clear();
    },
  };
}
