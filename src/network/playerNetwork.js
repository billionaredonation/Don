import {
  subscribeCityPlayers,
  createCityMovementChannel,
  setPlayerOffline,
} from '../player/playerPosition.js';

import { NETWORK_CONFIG } from '../config/networkConfig.js';

import {
  createPlayerMarkerHtml,
  updatePlayerMarkerView,
} from '../player/playerMarkerView.js';

const remoteMarkers = new Map();

function percentToNumber(value, fallback = 50) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getRemoteState(marker, player) {
  const playerId = player.playerId;
  let state = remoteMarkers.get(playerId);

  if (!state) {
    const startX = percentToNumber(marker.dataset.x, player.x);
    const startY = percentToNumber(marker.dataset.y, player.y);

    state = {
      marker,
      currentX: startX,
      currentY: startY,
      targetX: startX,
      targetY: startY,
      animationId: null,
      lastUpdateAt: performance.now(),
    };

    remoteMarkers.set(playerId, state);
  }

  return state;
}

function animateRemoteMarker(playerId) {
  const state = remoteMarkers.get(playerId);
  if (!state) return;

  const smoothing = NETWORK_CONFIG.movement.remoteSmoothing ?? 0.28;
  const snapDistance = NETWORK_CONFIG.movement.remoteSnapDistance ?? 35;

  const dx = state.targetX - state.currentX;
  const dy = state.targetY - state.currentY;
  const distance = Math.hypot(dx, dy);

  if (distance > snapDistance) {
    state.currentX = state.targetX;
    state.currentY = state.targetY;
  } else {
    state.currentX += dx * smoothing;
    state.currentY += dy * smoothing;
  }

  state.marker.style.left = `${state.currentX}%`;
  state.marker.style.top = `${state.currentY}%`;
  state.marker.dataset.x = String(state.currentX);
  state.marker.dataset.y = String(state.currentY);

  if (Math.abs(dx) > 0.012 || Math.abs(dy) > 0.012) {
    state.animationId = requestAnimationFrame(() => animateRemoteMarker(playerId));
    return;
  }

  state.animationId = null;
}

export function upsertPlayerMarker(entities, player, localPlayerId, options = {}) {
  if (!entities || !player?.playerId) return;

  if (String(player.playerId) === String(localPlayerId)) return;

  if (player.isOnline === false) {
    removePlayerMarker(entities, player.playerId);
    return;
  }

  const selector = `[data-player-id="${player.playerId}"]`;
  let marker = entities.querySelector(selector);

  if (!marker) {
    entities.insertAdjacentHTML('beforeend', createPlayerMarkerHtml(player, localPlayerId));
    marker = entities.querySelector(selector);
  }

  if (!marker) return;

  const nextX = percentToNumber(player.x);
  const nextY = percentToNumber(player.y);

  marker.dataset.updatedAt = String(Date.now());

  updatePlayerMarkerView(marker, player);

  if (options.instant) {
    const state = remoteMarkers.get(player.playerId);

    if (state?.animationId) {
      cancelAnimationFrame(state.animationId);
    }

    remoteMarkers.delete(player.playerId);

    marker.style.left = `${nextX}%`;
    marker.style.top = `${nextY}%`;
    marker.dataset.x = String(nextX);
    marker.dataset.y = String(nextY);
    return;
  }

  const state = getRemoteState(marker, player);

  state.targetX = nextX;
  state.targetY = nextY;
  state.lastUpdateAt = performance.now();

  if (!state.animationId) {
    state.animationId = requestAnimationFrame(() => animateRemoteMarker(player.playerId));
  }
}

export function removePlayerMarker(entities, playerId) {
  if (!entities || !playerId) return;

  const state = remoteMarkers.get(playerId);

  if (state?.animationId) {
    cancelAnimationFrame(state.animationId);
  }

  remoteMarkers.delete(playerId);

  const marker = entities.querySelector(`[data-player-id="${playerId}"]`);

  if (marker) {
    marker.remove();
  }
}

function startStalePlayersCleanup(entities) {
  const staleAfter = NETWORK_CONFIG.movement.staleAfter;
  const checkInterval = NETWORK_CONFIG.movement.staleCheckInterval || 1000;

  const timer = setInterval(() => {
    const now = Date.now();

    entities.querySelectorAll('.gta-player-marker-other').forEach((marker) => {
      const updatedAt = Number(marker.dataset.updatedAt || 0);
      const playerId = marker.dataset.playerId;

      if (updatedAt && now - updatedAt > staleAfter) {
        removePlayerMarker(entities, playerId);
      }
    });
  }, checkInterval);

  return () => clearInterval(timer);
}

function enableOfflineOnExit() {
  const goOffline = () => {
    setPlayerOffline().catch((error) => {
      console.warn('[network] set offline failed:', error);
    });
  };

  window.addEventListener('pagehide', goOffline);
  window.addEventListener('beforeunload', goOffline);

  return () => {
    window.removeEventListener('pagehide', goOffline);
    window.removeEventListener('beforeunload', goOffline);
  };
}

export function setupPlayerNetwork({
  cityId,
  playerId,
  localPlayerId,
  entities,
}) {
  const selfPlayerId = localPlayerId || playerId;

  const movementChannel = createCityMovementChannel(cityId, {
    onMove(player) {
      if (!player || String(player.playerId) === String(selfPlayerId)) return;

      upsertPlayerMarker(entities, player, selfPlayerId, {
        instant: false,
      });
    },
  });

  const cleanupStalePlayers = startStalePlayersCleanup(entities);
  const cleanupOffline = enableOfflineOnExit();

  let cleanupRealtime = null;

  try {
    cleanupRealtime = subscribeCityPlayers(cityId, {
      onInsert(player) {
        if (!player || String(player.playerId) === String(selfPlayerId)) return;

        upsertPlayerMarker(entities, player, selfPlayerId, {
          instant: true,
        });
      },

      onUpdate(player) {
        if (!player || String(player.playerId) === String(selfPlayerId)) return;

        if (player.isOnline === false) {
          removePlayerMarker(entities, player.playerId);
          return;
        }

        upsertPlayerMarker(entities, player, selfPlayerId, {
          instant: false,
        });
      },

      onDelete(deletedPlayerId) {
        if (!deletedPlayerId || String(deletedPlayerId) === String(selfPlayerId)) return;

        removePlayerMarker(entities, deletedPlayerId);
      },
    });
  } catch (error) {
    console.warn('[network] realtime subscribe failed:', error);
  }

  return {
    movementChannel,

    cleanup() {
      cleanupRealtime?.();
      cleanupStalePlayers?.();
      cleanupOffline?.();
      movementChannel?.unsubscribe?.();

      remoteMarkers.forEach((state) => {
        if (state.animationId) {
          cancelAnimationFrame(state.animationId);
        }
      });

      remoteMarkers.clear();
    },
  };
}
