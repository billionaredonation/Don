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

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
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

function isSamePlayer(a, b) {
  return String(a || '') === String(b || '');
}

function isSameNickname(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);

  return Boolean(left && right && left === right);
}

function isLocalPlayerLike(player, localPlayerId, localNickname) {
  if (!player) return false;

  const playerId = getPlayerId(player);
  const nickname = getNickname(player);

  if (isSamePlayer(playerId, localPlayerId)) {
    return true;
  }

  /*
    Фикс двойника:
    если в Supabase осталась старая запись с тем же ником,
    но другим playerId, не рисуем её как чужого игрока.
  */
  if (isSameNickname(nickname, localNickname)) {
    return true;
  }

  return false;
}

function removePlayerMarkerByNickname(entities, nickname) {
  const target = normalizeText(nickname);

  if (!entities || !target) return;

  entities
    .querySelectorAll('.gta-player-marker-other')
    .forEach((marker) => {
      const markerNickname = normalizeText(marker.dataset.nickname);

      if (markerNickname === target) {
        const playerId = marker.dataset.playerId;

        if (playerId) {
          remoteMarkers.delete(playerId);
        }

        marker.remove();
      }
    });
}

function cleanupLocalDuplicates(entities, localPlayerId, localNickname) {
  if (!entities) return;

  entities
    .querySelectorAll('.gta-player-marker-other')
    .forEach((marker) => {
      const markerPlayerId = marker.dataset.playerId;
      const markerNickname = marker.dataset.nickname;

      const isDuplicateById =
        localPlayerId &&
        isSamePlayer(markerPlayerId, localPlayerId);

      const isDuplicateByNickname =
        localNickname &&
        isSameNickname(markerNickname, localNickname);

      if (isDuplicateById || isDuplicateByNickname) {
        if (markerPlayerId) {
          const state = remoteMarkers.get(markerPlayerId);

          if (state?.animationId) {
            cancelAnimationFrame(state.animationId);
          }

          remoteMarkers.delete(markerPlayerId);
        }

        marker.remove();
      }
    });
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

function getRemoteState(marker, player) {
  const playerId = getPlayerId(player);

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
  player,
  localPlayerId,
  options = {}
) {
  if (!entities || !player) return;

  const playerId = getPlayerId(player);

  if (!playerId) return;

  if (isSamePlayer(playerId, localPlayerId)) return;

  if (player.isOnline === false) {
    removePlayerMarker(entities, playerId);
    return;
  }

  const selector =
    `[data-player-id="${CSS.escape(playerId)}"]`;

  let marker = entities.querySelector(selector);

  if (!marker) {
    entities.insertAdjacentHTML(
      'beforeend',
      createPlayerMarkerHtml(
        {
          ...player,
          playerId,
          nickname: getNickname(player),
        },
        localPlayerId
      )
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

  const state = getRemoteState(marker, {
    ...player,
    playerId,
  });

  if (!options.instant) {
    if (packetTime < state.lastPacketTime) {
      return;
    }

    if (Date.now() - packetTime > packetMaxAge) {
      return;
    }
  }

  state.lastPacketTime = Math.max(
    state.lastPacketTime,
    packetTime
  );

  marker.dataset.updatedAt = String(Date.now());
  marker.dataset.nickname = getNickname(player);

  updatePlayerMarkerView(marker, {
    ...player,
    playerId,
    nickname: getNickname(player),
  });

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
    `[data-player-id="${CSS.escape(safePlayerId)}"]`
  );

  if (marker) {
    marker.remove();
  }
}

function startStalePlayersCleanup(entities, localPlayerId, localNickname) {
  const staleAfter =
    NETWORK_CONFIG.movement.staleAfter;

  const checkInterval =
    NETWORK_CONFIG.movement.staleCheckInterval || 1000;

  const timer = setInterval(() => {
    const now = Date.now();

    cleanupLocalDuplicates(entities, localPlayerId, localNickname);

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

export function setupPlayerNetwork({
  cityId,
  playerId,
  localPlayerId,
  localNickname = '',
  entities,
}) {
  const selfPlayerId =
    localPlayerId || playerId;

  /*
    Чистим уже нарисованных двойников сразу при запуске сети.
  */
  cleanupLocalDuplicates(
    entities,
    selfPlayerId,
    localNickname
  );

  const movementChannel =
    createCityMovementChannel(cityId, {
      onMove(player) {
        if (
          !player ||
          isLocalPlayerLike(
            player,
            selfPlayerId,
            localNickname
          )
        ) {
          if (player) {
            removePlayerMarker(entities, getPlayerId(player));
            removePlayerMarkerByNickname(entities, localNickname);
          }

          return;
        }

        upsertPlayerMarker(
          entities,
          player,
          selfPlayerId,
          {
            instant: false,
          }
        );
      },
    });

  const cleanupStalePlayers =
    startStalePlayersCleanup(
      entities,
      selfPlayerId,
      localNickname
    );

  const cleanupOffline =
    enableOfflineOnExit();

  let cleanupRealtime = null;

  try {
    cleanupRealtime =
      subscribeCityPlayers(cityId, {
        onInsert(player) {
          if (
            !player ||
            isLocalPlayerLike(
              player,
              selfPlayerId,
              localNickname
            )
          ) {
            if (player) {
              removePlayerMarker(entities, getPlayerId(player));
              removePlayerMarkerByNickname(entities, localNickname);
            }

            return;
          }

          upsertPlayerMarker(
            entities,
            player,
            selfPlayerId,
            {
              instant: true,
            }
          );
        },

        onUpdate(player) {
          if (
            !player ||
            isLocalPlayerLike(
              player,
              selfPlayerId,
              localNickname
            )
          ) {
            if (player) {
              removePlayerMarker(entities, getPlayerId(player));
              removePlayerMarkerByNickname(entities, localNickname);
            }

            return;
          }

          if (player.isOnline === false) {
            removePlayerMarker(
              entities,
              getPlayerId(player)
            );

            return;
          }

          upsertPlayerMarker(
            entities,
            player,
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
