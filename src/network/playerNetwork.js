import {
  subscribeCityPlayers,
  createCityMovementChannel,
  setPlayerOffline,
  getCityPlayers,
} from '../player/playerPosition.js';

import { supabase } from '../supabaseClient.js';
import { NETWORK_CONFIG } from '../config/networkConfig.js';

import {
  createPlayerMarkerHtml,
  updatePlayerMarkerView,
} from '../player/playerMarkerView.js';

const remoteMarkers = new Map();

const ONLINE_TTL_MS =
  NETWORK_CONFIG.movement.onlineTtlMs || 18000;

const STALE_OFFLINE_MS =
  NETWORK_CONFIG.movement.staleOfflineMs || 24000;

const SNAPSHOT_REFRESH_INTERVAL_MS = 5000;

function percentToNumber(value, fallback = 50) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isSamePlayer(a, b) {
  return String(a || '') === String(b || '');
}

function escapeCss(value) {
  if (window.CSS?.escape) {
    return CSS.escape(String(value));
  }

  return String(value).replaceAll('"', '\\"');
}

function getPlayerId(player) {
  return String(
    player?.playerId ||
    player?.player_id ||
    player?.id ||
    ''
  );
}

function getNickname(player) {
  return String(
    player?.nickname ||
    player?.name ||
    ''
  ).trim();
}

function getUpdatedAtMs(player) {
  const raw =
    player?.updatedAt ||
    player?.updated_at ||
    player?.sentAt ||
    player?.sent_at ||
    null;

  if (!raw) return Date.now();

  const parsed = Date.parse(raw);

  return Number.isFinite(parsed) ? parsed : Date.now();
}

function isPlayerFresh(player) {
  if (!player) return false;

  if (player.isOnline === false || player.is_online === false) {
    return false;
  }

  const updatedAt = getUpdatedAtMs(player);

  return Date.now() - updatedAt <= ONLINE_TTL_MS;
}

function getPacketTime(player) {
  const raw =
    player?.updatedAt ||
    player?.updated_at ||
    player?.sentAt ||
    player?.sent_at;

  const parsed = raw ? Date.parse(raw) : NaN;

  return Number.isFinite(parsed) ? parsed : Date.now();
}

function shortestAngleDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function normalizeRemotePlayer(player) {
  const playerId = getPlayerId(player);

  return {
    ...player,
    playerId,
    nickname: getNickname(player) || 'Игрок',
    x: percentToNumber(player?.x),
    y: percentToNumber(player?.y),
    angle: percentToNumber(player?.angle, 0),
    isOnline: player?.isOnline ?? player?.is_online ?? true,
    updatedAt:
      player?.updatedAt ||
      player?.updated_at ||
      new Date().toISOString(),
  };
}

function cleanupLocalDuplicates(entities, localPlayerId) {
  if (!entities || !localPlayerId) return;

  entities
    .querySelectorAll('.gta-player-marker-other')
    .forEach((marker) => {
      const markerPlayerId = marker.dataset.playerId;

      if (!isSamePlayer(markerPlayerId, localPlayerId)) {
        return;
      }

      const state = remoteMarkers.get(markerPlayerId);

      if (state?.animationId) {
        cancelAnimationFrame(state.animationId);
      }

      remoteMarkers.delete(markerPlayerId);
      marker.remove();
    });
}

function getRemoteState(marker, player) {
  const playerId = player.playerId;

  let state = remoteMarkers.get(playerId);

  if (!state) {
    const startX = percentToNumber(marker.dataset.x, player.x);
    const startY = percentToNumber(marker.dataset.y, player.y);
    const startAngle = percentToNumber(player.angle, 0);

    state = {
      marker,

      currentX: startX,
      currentY: startY,
      currentAngle: startAngle,

      targetX: startX,
      targetY: startY,
      targetAngle: startAngle,

      animationId: null,

      lastUpdateAt: 0,
      lastPacketTime: 0,
    };

    remoteMarkers.set(playerId, state);
  }

  return state;
}

function paintRemoteMarker(state) {
  state.marker.style.left = `${state.currentX}%`;
  state.marker.style.top = `${state.currentY}%`;

  state.marker.dataset.x = String(state.currentX);
  state.marker.dataset.y = String(state.currentY);
  state.marker.dataset.angle = String(state.currentAngle);

  state.marker.style.setProperty(
    '--player-angle',
    `${state.currentAngle}deg`
  );
}

function animateRemoteMarker(playerId) {
  const state = remoteMarkers.get(playerId);

  if (!state) return;

  const smoothing =
    NETWORK_CONFIG.movement.remoteSmoothing ?? 0.16;

  const snapDistance =
    NETWORK_CONFIG.movement.remoteSnapDistance ?? 18;

  const idleThreshold =
    NETWORK_CONFIG.movement.remoteIdleThreshold ?? 0.03;

  const now = performance.now();

  if (now - state.lastUpdateAt > 1600) {
    state.animationId = null;
    return;
  }

  const dx = state.targetX - state.currentX;
  const dy = state.targetY - state.currentY;
  const distance = Math.hypot(dx, dy);

  const angleDelta = shortestAngleDelta(
    state.currentAngle,
    state.targetAngle
  );

  if (distance > snapDistance) {
    state.currentX = state.targetX;
    state.currentY = state.targetY;
  } else {
    state.currentX += dx * smoothing;
    state.currentY += dy * smoothing;
  }

  state.currentAngle += angleDelta * Math.min(0.35, smoothing * 1.8);

  if (state.currentAngle < 0) {
    state.currentAngle += 360;
  }

  if (state.currentAngle >= 360) {
    state.currentAngle -= 360;
  }

  paintRemoteMarker(state);

  if (
    distance <= idleThreshold &&
    Math.abs(angleDelta) <= 0.25
  ) {
    state.currentX = state.targetX;
    state.currentY = state.targetY;
    state.currentAngle = state.targetAngle;

    paintRemoteMarker(state);

    state.animationId = null;
    return;
  }

  state.animationId =
    requestAnimationFrame(() => animateRemoteMarker(playerId));
}

export function upsertPlayerMarker(
  entities,
  rawPlayer,
  localPlayerId,
  options = {}
) {
  if (!entities || !rawPlayer) return;

  const player = normalizeRemotePlayer(rawPlayer);
  const playerId = player.playerId;

  if (!playerId) return;

  if (isSamePlayer(playerId, localPlayerId)) {
    cleanupLocalDuplicates(entities, localPlayerId);
    return;
  }

  if (!isPlayerFresh(player)) {
    removePlayerMarker(entities, playerId);
    return;
  }

  const selector =
    `.gta-player-marker-other[data-player-id="${escapeCss(playerId)}"]`;

  let marker = entities.querySelector(selector);

  if (!marker) {
    entities.insertAdjacentHTML(
      'beforeend',
      createPlayerMarkerHtml(player, localPlayerId)
    );

    marker = entities.querySelector(selector);
  }

  if (!marker) return;

  const nextX = percentToNumber(player.x);
  const nextY = percentToNumber(player.y);
  const nextAngle = percentToNumber(player.angle, 0);

  const packetTime = getPacketTime(player);
  const packetMaxAge =
    NETWORK_CONFIG.movement.remotePacketMaxAge ?? 3500;

  const state = getRemoteState(marker, player);

  if (!options.instant) {
    if (packetTime < state.lastPacketTime) {
      return;
    }

    if (Date.now() - packetTime > packetMaxAge) {
      removePlayerMarker(entities, playerId);
      return;
    }
  }

  state.lastPacketTime = Math.max(
    state.lastPacketTime,
    packetTime
  );

  marker.dataset.updatedAt = String(Date.now());
  marker.dataset.playerId = playerId;
  marker.dataset.nickname = player.nickname;

  updatePlayerMarkerView(marker, player);

  if (options.instant) {
    if (state.animationId) {
      cancelAnimationFrame(state.animationId);
    }

    state.currentX = nextX;
    state.currentY = nextY;
    state.currentAngle = nextAngle;

    state.targetX = nextX;
    state.targetY = nextY;
    state.targetAngle = nextAngle;

    state.lastUpdateAt = performance.now();

    paintRemoteMarker(state);

    state.animationId = null;
    return;
  }

  if (
    Math.abs(state.targetX - nextX) < 0.001 &&
    Math.abs(state.targetY - nextY) < 0.001 &&
    Math.abs(shortestAngleDelta(state.targetAngle, nextAngle)) < 0.001
  ) {
    return;
  }

  state.targetX = nextX;
  state.targetY = nextY;
  state.targetAngle = nextAngle;

  state.lastUpdateAt = performance.now();

  if (!state.animationId) {
    state.animationId =
      requestAnimationFrame(() =>
        animateRemoteMarker(playerId)
      );
  }
}

export function removePlayerMarker(entities, playerId) {
  if (!entities || !playerId) return;

  const safePlayerId = String(playerId);
  const state = remoteMarkers.get(safePlayerId);

  if (state?.animationId) {
    cancelAnimationFrame(state.animationId);
  }

  remoteMarkers.delete(safePlayerId);

  const marker = entities.querySelector(
    `.gta-player-marker-other[data-player-id="${escapeCss(safePlayerId)}"]`
  );

  if (marker) {
    marker.remove();
  }
}

function startStalePlayersCleanup(entities, localPlayerId) {
  const staleAfter =
    NETWORK_CONFIG.movement.staleAfter || ONLINE_TTL_MS;

  const checkInterval =
    NETWORK_CONFIG.movement.staleCheckInterval || 2000;

  const timer = setInterval(() => {
    const now = Date.now();

    cleanupLocalDuplicates(entities, localPlayerId);

    entities
      .querySelectorAll('.gta-player-marker-other')
      .forEach((marker) => {
        const updatedAt =
          Number(marker.dataset.updatedAt || 0);

        const playerId =
          marker.dataset.playerId;

        if (
          updatedAt &&
          now - updatedAt > staleAfter
        ) {
          removePlayerMarker(entities, playerId);
        }
      });
  }, checkInterval);

  return () => clearInterval(timer);
}

function enableOfflineOnExit() {
  const goOffline = () => {
    setPlayerOffline().catch((error) => {
      console.warn(
        '[network] set offline failed:',
        error
      );
    });
  };

  window.addEventListener('pagehide', goOffline);
  window.addEventListener('beforeunload', goOffline);

  return () => {
    window.removeEventListener(
      'pagehide',
      goOffline
    );

    window.removeEventListener(
      'beforeunload',
      goOffline
    );
  };
}

function getStaleBeforeIso() {
  return new Date(Date.now() - STALE_OFFLINE_MS).toISOString();
}

async function touchSelfOnline(selfPlayerId) {
  if (!selfPlayerId) return;

  const { error } = await supabase
    .from('player_positions')
    .update({
      is_online: true,
      updated_at: new Date().toISOString(),
    })
    .eq('player_id', selfPlayerId);

  if (error) throw error;
}

async function markStaleCityPlayersOffline(cityId) {
  if (!cityId) return;

  const { error } = await supabase
    .from('player_positions')
    .update({
      is_online: false,
      updated_at: new Date().toISOString(),
    })
    .eq('city_id', cityId)
    .eq('is_online', true)
    .lt('updated_at', getStaleBeforeIso());

  if (error) {
    console.warn('[network] stale players cleanup failed:', error);
  }
}

function startPresenceHeartbeat(cityId, selfPlayerId) {
  let tick = 0;
  let stopped = false;

  async function runHeartbeat() {
    if (stopped) return;

    try {
      await touchSelfOnline(selfPlayerId);

      tick += 1;

      if (tick % 3 === 0) {
        await markStaleCityPlayersOffline(cityId);
      }
    } catch (error) {
      console.warn('[network] presence heartbeat failed:', error);
    }
  }

  runHeartbeat();

  const timer = setInterval(
    runHeartbeat,
    NETWORK_CONFIG.movement.presenceHeartbeatInterval || 4000
  );

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

function startPlayersSnapshotRefresh(entities, cityId, selfPlayerId) {
  let stopped = false;

  async function refreshSnapshot() {
    if (stopped) return;

    try {
      const players = await getCityPlayers(cityId);
      const liveIds = new Set();

      players.forEach((rawPlayer) => {
        const player = normalizeRemotePlayer(rawPlayer);
        const playerId = player.playerId;

        if (!playerId || isSamePlayer(playerId, selfPlayerId)) {
          return;
        }

        if (!isPlayerFresh(player)) {
          removePlayerMarker(entities, playerId);
          return;
        }

        liveIds.add(playerId);

        upsertPlayerMarker(
          entities,
          player,
          selfPlayerId,
          {
            instant: true,
          }
        );
      });

      entities
        .querySelectorAll('.gta-player-marker-other')
        .forEach((marker) => {
          const markerPlayerId = marker.dataset.playerId;

          if (!markerPlayerId) return;

          if (!liveIds.has(markerPlayerId)) {
            removePlayerMarker(entities, markerPlayerId);
          }
        });
    } catch (error) {
      console.warn('[network] players snapshot refresh failed:', error);
    }
  }

  refreshSnapshot();

  const timer = setInterval(
    refreshSnapshot,
    SNAPSHOT_REFRESH_INTERVAL_MS
  );

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export function setupPlayerNetwork({
  cityId,
  playerId,
  localPlayerId,
  entities,
}) {
  const selfPlayerId =
    localPlayerId || playerId;

  cleanupLocalDuplicates(entities, selfPlayerId);

  const movementChannel =
    createCityMovementChannel(cityId, {
      onMove(player) {
        const remotePlayer = normalizeRemotePlayer(player);

        if (
          !remotePlayer.playerId ||
          isSamePlayer(
            remotePlayer.playerId,
            selfPlayerId
          )
        ) {
          cleanupLocalDuplicates(entities, selfPlayerId);
          return;
        }

        if (!isPlayerFresh(remotePlayer)) {
          removePlayerMarker(entities, remotePlayer.playerId);
          return;
        }

        upsertPlayerMarker(
          entities,
          remotePlayer,
          selfPlayerId,
          {
            instant: false,
          }
        );
      },
    });

  const cleanupStalePlayers =
    startStalePlayersCleanup(entities, selfPlayerId);

  const cleanupPresenceHeartbeat =
    startPresenceHeartbeat(cityId, selfPlayerId);

  const cleanupSnapshotRefresh =
    startPlayersSnapshotRefresh(
      entities,
      cityId,
      selfPlayerId
    );

  const cleanupOffline =
    enableOfflineOnExit();

  let cleanupRealtime = null;

  try {
    cleanupRealtime =
      subscribeCityPlayers(cityId, {
        onInsert(player) {
          const remotePlayer = normalizeRemotePlayer(player);

          if (
            !remotePlayer.playerId ||
            isSamePlayer(
              remotePlayer.playerId,
              selfPlayerId
            )
          ) {
            cleanupLocalDuplicates(entities, selfPlayerId);
            return;
          }

          if (!isPlayerFresh(remotePlayer)) {
            removePlayerMarker(entities, remotePlayer.playerId);
            return;
          }

          upsertPlayerMarker(
            entities,
            remotePlayer,
            selfPlayerId,
            {
              instant: true,
            }
          );
        },

        onUpdate(player) {
          const remotePlayer = normalizeRemotePlayer(player);

          if (
            !remotePlayer.playerId ||
            isSamePlayer(
              remotePlayer.playerId,
              selfPlayerId
            )
          ) {
            cleanupLocalDuplicates(entities, selfPlayerId);
            return;
          }

          if (!isPlayerFresh(remotePlayer)) {
            removePlayerMarker(
              entities,
              remotePlayer.playerId
            );

            return;
          }

          upsertPlayerMarker(
            entities,
            remotePlayer,
            selfPlayerId,
            {
              instant: false,
            }
          );
        },

        onDelete(playerId) {
          if (
            isSamePlayer(
              playerId,
              selfPlayerId
            )
          ) {
            return;
          }

          removePlayerMarker(
            entities,
            playerId
          );
        },
      });
  } catch (error) {
    console.warn(
      '[network] realtime subscribe failed:',
      error
    );
  }

  return {
    movementChannel,

    cleanup() {
      cleanupRealtime?.();

      cleanupStalePlayers?.();
      cleanupPresenceHeartbeat?.();
      cleanupSnapshotRefresh?.();
      cleanupOffline?.();

      movementChannel?.unsubscribe?.();

      remoteMarkers.forEach((state) => {
        if (state.animationId) {
          cancelAnimationFrame(
            state.animationId
          );
        }
      });

      remoteMarkers.clear();
    },
  };
}
