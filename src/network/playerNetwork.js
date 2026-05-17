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
        upsertPlayerMarker(entities, player, selfPlayerId, {
          instant: true,
        });
      },

      onUpdate(player) {
        if (!player) return;

        if (player.isOnline === false) {
          removePlayerMarker(entities, player.playerId);
          return;
        }

        upsertPlayerMarker(entities, player, selfPlayerId, {
          instant: false,
        });
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

      remoteMarkers.forEach((state) => {
        if (state.animationId) {
          cancelAnimationFrame(state.animationId);
        }
      });

      remoteMarkers.clear();
    },
  };
}
