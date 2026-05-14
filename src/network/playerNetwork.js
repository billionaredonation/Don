import {
  subscribeCityPlayers,
  createCityMovementChannel,
  setPlayerOffline,
} from '../player/playerPosition.js';
import { NETWORK_CONFIG } from '../config/networkConfig.js';

export function createPlayerMarkerHtml(player, localPlayerId) {
  const isSelf = player.playerId === localPlayerId;
  const updatedAt = new Date(player.updatedAt || Date.now()).getTime();

  return `
    <div
      class="gta-player-marker ${isSelf ? 'gta-player-marker-self' : 'gta-player-marker-other'}"
      style="left: ${player.x}%; top: ${player.y}%;"
      data-player-id="${player.playerId}"
      data-updated-at="${updatedAt}"
    >
      <span></span>
      <b>${player.nickname || 'Игрок'}</b>
    </div>
  `;
}

export function renderPlayersHtml(players, localPlayerId) {
  return players.map((player) => createPlayerMarkerHtml(player, localPlayerId)).join('');
}

export function upsertPlayerMarker(entities, player, localPlayerId) {
  if (!entities || !player?.playerId) return;

  const selector = `[data-player-id="${player.playerId}"]`;
  let marker = entities.querySelector(selector);

  if (!marker) {
    entities.insertAdjacentHTML('beforeend', createPlayerMarkerHtml(player, localPlayerId));
    return;
  }

  marker.style.left = `${player.x}%`;
  marker.style.top = `${player.y}%`;
  marker.dataset.updatedAt = String(new Date(player.updatedAt || Date.now()).getTime());

  const name = marker.querySelector('b');

  if (name) {
    name.textContent = player.nickname || 'Игрок';
  }
}

export function removePlayerMarker(entities, playerId) {
  if (!entities || !playerId) return;

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

      if (updatedAt && now - updatedAt > staleAfter) {
        marker.remove();
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

export function setupPlayerNetwork({ cityId, entities, localPlayerId }) {
  const movementChannel = createCityMovementChannel(cityId, {
    onMove(player) {
      if (!player || player.playerId === localPlayerId) return;
      upsertPlayerMarker(entities, player, localPlayerId);
    },
  });

  const cleanupStalePlayers = startStalePlayersCleanup(entities);
  const cleanupOffline = enableOfflineOnExit();

  let cleanupRealtime = null;

  try {
    cleanupRealtime = subscribeCityPlayers(cityId, {
      onInsert(player) {
        upsertPlayerMarker(entities, player, localPlayerId);
      },

      onUpdate(player) {
        if (!player.isOnline) {
          removePlayerMarker(entities, player.playerId);
        }
      },

      onDelete(playerId) {
        removePlayerMarker(entities, playerId);
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
    },
  };
}
