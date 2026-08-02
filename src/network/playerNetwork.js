import {
  subscribeCityPlayers,
  createCityMovementChannel,
  setPlayerOffline,
  getCityPlayers,
  getSessionId,
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

const SNAPSHOT_PLAYER_MAX_AGE_MS =
  NETWORK_CONFIG.movement.snapshotPlayerMaxAgeMs || 120000;

const DESKTOP_SNAPSHOT_REFRESH_INTERVAL_MS = 4200;
const MOBILE_SNAPSHOT_REFRESH_INTERVAL_MS = 8500;
const SNAPSHOT_REFRESH_INTERVAL_MS = DESKTOP_SNAPSHOT_REFRESH_INTERVAL_MS;

const DESKTOP_STALE_CHECK_INTERVAL_MS = 3200;
const MOBILE_STALE_CHECK_INTERVAL_MS = 5200;

const DESKTOP_PRESENCE_HEARTBEAT_INTERVAL_MS = 5500;
const MOBILE_PRESENCE_HEARTBEAT_INTERVAL_MS = 9500;

const DESKTOP_REMOTE_PACKET_FLUSH_INTERVAL_MS = 34;
const MOBILE_REMOTE_PACKET_FLUSH_INTERVAL_MS = 72;

const DESKTOP_MAX_REMOTE_MARKERS = 64;
const MOBILE_MAX_REMOTE_MARKERS = 10;

/*
  На мобильном Telegram WebView postgres-realtime + broadcast + snapshot
  часто дают двойные/тройные апдейты одних и тех же игроков.
  Для телефона оставляем movement broadcast + редкий snapshot.
  Для ПК postgres realtime оставлен.
*/
const MOBILE_POSTGRES_REALTIME_ENABLED = false;

const PLAYER_RENDER_RADIUS_PERCENT = 26;

/*
  Remote players streaming for mobile.
  На телефоне не держим в DOM всех игроков города — только ближайших
  вокруг локального игрока. Остальные сообщения/снапшоты отбрасываются
  до создания DOM-маркера.
*/
const MOBILE_PLAYER_RENDER_RADIUS_PERCENT = 22;
const MOBILE_PLAYER_RENDER_RADIUS_PX = 150;
const MOBILE_PLAYER_RENDER_RADIUS_MIN_PERCENT = 4;
const MOBILE_PLAYER_RENDER_RADIUS_MAX_PERCENT = 14;

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

function isMobileGameplayDevice() {
  const hasTouch = navigator.maxTouchPoints > 0;
  const narrowScreen =
    Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 920;

  return hasTouch && narrowScreen;
}

function clampNumber(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) return min;

  return Math.min(max, Math.max(min, number));
}

function getStreamingViewport(options = {}) {
  return (
    options.viewport ||
    options.entities?.closest?.('.gta-map-viewport') ||
    document.querySelector('.gta-map-viewport') ||
    null
  );
}

function getViewportPercentRadiusFromPx(
  viewport,
  radiusPx,
  fallbackPercent,
  { minPercent = 1, maxPercent = 100 } = {}
) {
  if (!isMobileGameplayDevice()) return fallbackPercent;

  const rect = viewport?.getBoundingClientRect?.();
  const width = Number(rect?.width);
  const height = Number(rect?.height);

  if (width > 0 && height > 0) {
    const minSide = Math.max(1, Math.min(width, height));
    const percent = (Number(radiusPx) / minSide) * 100;

    return clampNumber(percent, minPercent, maxPercent);
  }

  return clampNumber(fallbackPercent, minPercent, maxPercent);
}

function getPlayerRenderRadiusPercent(options = {}) {
  const requested = Number(options.renderRadiusPercent);

  if (Number.isFinite(requested) && requested > 0) {
    return requested;
  }

  if (isMobileGameplayDevice()) {
    return getViewportPercentRadiusFromPx(
      getStreamingViewport(options),
      MOBILE_PLAYER_RENDER_RADIUS_PX,
      MOBILE_PLAYER_RENDER_RADIUS_PERCENT,
      {
        minPercent: MOBILE_PLAYER_RENDER_RADIUS_MIN_PERCENT,
        maxPercent: MOBILE_PLAYER_RENDER_RADIUS_MAX_PERCENT,
      }
    );
  }

  return PLAYER_RENDER_RADIUS_PERCENT;
}

function getPlayerUnloadRadiusPercent(options = {}) {
  const requested = Number(options.unloadRadiusPercent);

  if (Number.isFinite(requested) && requested > 0) {
    return requested;
  }

  const renderRadius = getPlayerRenderRadiusPercent(options);

  // Hysteresis: не удаляем игрока сразу у границы радиуса, чтобы не было
  // постоянного create/remove при поиске друга на краю стриминг-зоны.
  return renderRadius * (isMobileGameplayDevice() ? 1.55 : 1.25);
}

function getMaxRemoteMarkers(options = {}) {
  const requested = Number(options.maxRemoteMarkers);

  if (Number.isFinite(requested) && requested > 0) {
    return Math.max(1, Math.floor(requested));
  }

  return isMobileGameplayDevice()
    ? MOBILE_MAX_REMOTE_MARKERS
    : DESKTOP_MAX_REMOTE_MARKERS;
}

function getSnapshotRefreshInterval(options = {}) {
  const requested = Number(options.snapshotRefreshIntervalMs);

  if (Number.isFinite(requested) && requested > 0) {
    return requested;
  }

  const configValue = Number(NETWORK_CONFIG.movement.snapshotRefreshInterval);

  if (Number.isFinite(configValue) && configValue > 0) {
    return isMobileGameplayDevice()
      ? Math.max(configValue, MOBILE_SNAPSHOT_REFRESH_INTERVAL_MS)
      : Math.max(configValue, DESKTOP_SNAPSHOT_REFRESH_INTERVAL_MS);
  }

  return isMobileGameplayDevice()
    ? MOBILE_SNAPSHOT_REFRESH_INTERVAL_MS
    : SNAPSHOT_REFRESH_INTERVAL_MS;
}

function getStaleCheckInterval(options = {}) {
  const requested = Number(options.staleCheckIntervalMs);

  if (Number.isFinite(requested) && requested > 0) {
    return requested;
  }

  const configValue = Number(NETWORK_CONFIG.movement.staleCheckInterval);

  if (Number.isFinite(configValue) && configValue > 0) {
    return isMobileGameplayDevice()
      ? Math.max(configValue, MOBILE_STALE_CHECK_INTERVAL_MS)
      : Math.max(configValue, DESKTOP_STALE_CHECK_INTERVAL_MS);
  }

  return isMobileGameplayDevice()
    ? MOBILE_STALE_CHECK_INTERVAL_MS
    : DESKTOP_STALE_CHECK_INTERVAL_MS;
}

function getPresenceHeartbeatInterval(options = {}) {
  const requested = Number(options.presenceHeartbeatIntervalMs);

  if (Number.isFinite(requested) && requested > 0) {
    return requested;
  }

  const configValue = Number(NETWORK_CONFIG.movement.presenceHeartbeatInterval);

  if (Number.isFinite(configValue) && configValue > 0) {
    return isMobileGameplayDevice()
      ? Math.max(configValue, MOBILE_PRESENCE_HEARTBEAT_INTERVAL_MS)
      : Math.max(configValue, DESKTOP_PRESENCE_HEARTBEAT_INTERVAL_MS);
  }

  return isMobileGameplayDevice()
    ? MOBILE_PRESENCE_HEARTBEAT_INTERVAL_MS
    : DESKTOP_PRESENCE_HEARTBEAT_INTERVAL_MS;
}

function getRemotePacketFlushInterval() {
  return isMobileGameplayDevice()
    ? MOBILE_REMOTE_PACKET_FLUSH_INTERVAL_MS
    : DESKTOP_REMOTE_PACKET_FLUSH_INTERVAL_MS;
}

function getLocalPosition(localPlayerPosition) {
  if (!localPlayerPosition) return null;

  const x = Number(localPlayerPosition.x);
  const y = Number(localPlayerPosition.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { x, y };
}

function getPercentDistance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;

  const ax = Number(a.x);
  const ay = Number(a.y);
  const bx = Number(b.x);
  const by = Number(b.y);

  if (
    !Number.isFinite(ax) ||
    !Number.isFinite(ay) ||
    !Number.isFinite(bx) ||
    !Number.isFinite(by)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.hypot(ax - bx, ay - by);
}

function isPlayerInsideRenderDistance(player, localPlayerPosition, options = {}) {
  const localPosition = getLocalPosition(localPlayerPosition);

  if (!localPosition) return true;

  const radius = getPlayerRenderRadiusPercent(options);

  return getPercentDistance(player, localPosition) <= radius;
}

function isPlayerInsideUnloadDistance(player, localPlayerPosition, options = {}) {
  const localPosition = getLocalPosition(localPlayerPosition);

  if (!localPosition) return true;

  const radius = getPlayerUnloadRadiusPercent(options);

  return getPercentDistance(player, localPosition) <= radius;
}

function getMarkerDistanceToLocal(marker, localPlayerPosition) {
  const player = getPlayerFromMarker(marker);

  return getPercentDistance(player, getLocalPosition(localPlayerPosition));
}

function getRemoteMarkerCount(entities) {
  if (!entities) return 0;

  return entities.querySelectorAll('.gta-player-marker-other').length;
}

function getFarthestRemoteMarker(entities, localPlayerPosition) {
  if (!entities) return null;

  let farthestMarker = null;
  let farthestDistance = -1;

  entities
    .querySelectorAll('.gta-player-marker-other')
    .forEach((marker) => {
      const distance = getMarkerDistanceToLocal(marker, localPlayerPosition);

      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestMarker = marker;
      }
    });

  return {
    marker: farthestMarker,
    distance: farthestDistance,
  };
}

function prepareRemoteMarkerSlot(entities, player, localPlayerPosition, options = {}) {
  const maxMarkers = getMaxRemoteMarkers(options);
  const markerCount = getRemoteMarkerCount(entities);

  if (markerCount < maxMarkers) {
    return true;
  }

  const localPosition = getLocalPosition(localPlayerPosition);

  if (!localPosition) {
    return false;
  }

  const incomingDistance = getPercentDistance(player, localPosition);
  const farthest = getFarthestRemoteMarker(entities, localPlayerPosition);

  if (!farthest?.marker || incomingDistance >= farthest.distance) {
    return false;
  }

  removePlayerMarker(entities, farthest.marker.dataset.playerId);
  return true;
}

function sortPlayersByDistance(players, localPlayerPosition) {
  const localPosition = getLocalPosition(localPlayerPosition);

  if (!localPosition) {
    return players;
  }

  return players
    .slice()
    .sort((a, b) => {
      return getPercentDistance(a, localPosition) - getPercentDistance(b, localPosition);
    });
}

function getPlayersQueryOptions(localPlayerPosition, options = {}) {
  const localPosition = getLocalPosition(localPlayerPosition);

  if (!localPosition) return {};

  return {
    centerX: localPosition.x,
    centerY: localPosition.y,
    radiusPercent: getPlayerRenderRadiusPercent(options),
  };
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

function isPlayerOnlineFlagEnabled(player) {
  if (!player) return false;

  return !(player.isOnline === false || player.is_online === false);
}

function getPlayerAgeMs(player) {
  const updatedAt = getUpdatedAtMs(player);

  return Math.max(0, Date.now() - updatedAt);
}

function isPlayerFresh(player, maxAgeMs = ONLINE_TTL_MS) {
  if (!isPlayerOnlineFlagEnabled(player)) return false;

  /*
    Важно: updated_at прилетает с устройства игрока, а не гарантированно
    с серверного времени БД. Если у одного телефона/ПК время уехало,
    строгий TTL на 3-18 секунд ломает онлайн в одну сторону:
    один игрок видит другого, второй — нет.
  */
  return getPlayerAgeMs(player) <= maxAgeMs;
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

function getPlayerFromMarker(marker) {
  if (!marker) return null;

  return {
    playerId: marker.dataset.playerId,
    x: percentToNumber(marker.dataset.x),
    y: percentToNumber(marker.dataset.y),
    angle: percentToNumber(marker.dataset.angle, 0),
  };
}

function cleanupRemotePlayersOutsideRenderDistance(
  entities,
  localPlayerId,
  localPlayerPosition,
  options = {}
) {
  if (!entities || !isMobileGameplayDevice()) return;

  entities
    .querySelectorAll('.gta-player-marker-other')
    .forEach((marker) => {
      const markerPlayerId = marker.dataset.playerId;

      if (!markerPlayerId || isSamePlayer(markerPlayerId, localPlayerId)) {
        return;
      }

      const player = getPlayerFromMarker(marker);

      if (isPlayerInsideUnloadDistance(player, localPlayerPosition, {
        ...options,
        entities,
      })) {
        return;
      }

      removePlayerMarker(entities, markerPlayerId);
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

  const maxAgeMs =
    options.maxAgeMs ?? ONLINE_TTL_MS;

  if (
    !options.skipFreshnessCheck &&
    !isPlayerFresh(player, maxAgeMs)
  ) {
    removePlayerMarker(entities, playerId);
    return;
  }

  if (
    !options.skipRenderDistance &&
    !isPlayerInsideRenderDistance(player, options.localPlayerPosition, options)
  ) {
    removePlayerMarker(entities, playerId);
    return;
  }

  const selector =
    `.gta-player-marker-other[data-player-id="${escapeCss(playerId)}"]`;

  const existingState = remoteMarkers.get(playerId);
  let marker = existingState?.marker?.isConnected
    ? existingState.marker
    : entities.querySelector(selector);

  if (!marker) {
    if (!prepareRemoteMarkerSlot(entities, player, options.localPlayerPosition, options)) {
      return;
    }

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
  const state = getRemoteState(marker, player);

  if (!options.instant && packetTime < state.lastPacketTime) {
    return;
  }

  state.lastPacketTime = Math.max(
    state.lastPacketTime,
    packetTime
  );

  const nowMs = Date.now();

  marker.dataset.updatedAt = String(nowMs);
  marker.dataset.playerId = playerId;

  const lastViewUpdateAt = Number(marker.dataset.viewUpdatedAt || 0);
  const shouldUpdateView =
    options.instant ||
    marker.dataset.nickname !== player.nickname ||
    nowMs - lastViewUpdateAt > 900;

  if (shouldUpdateView) {
    marker.dataset.nickname = player.nickname;
    marker.dataset.viewUpdatedAt = String(nowMs);
    updatePlayerMarkerView(marker, player);
  }

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

function startStalePlayersCleanup(entities, localPlayerId, localPlayerPosition, options = {}) {
  const staleAfter =
    NETWORK_CONFIG.movement.staleAfter || ONLINE_TTL_MS;

  const checkInterval = getStaleCheckInterval(options);

  const timer = setInterval(() => {
    if (!entities?.isConnected) {
      return;
    }

    const now = Date.now();

    cleanupLocalDuplicates(entities, localPlayerId);
    cleanupRemotePlayersOutsideRenderDistance(
      entities,
      localPlayerId,
      localPlayerPosition,
      options
    );

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

async function touchSelfOnline(selfPlayerId) {
  if (!selfPlayerId || window.__MN_INTERIOR_ACTIVE__ === true) return;

  const { error } = await supabase
    .from('player_positions')
    .update({
      is_online: true,
      updated_at: new Date().toISOString(),
    })
    .eq('player_id', selfPlayerId)
    .eq('session_id', getSessionId());

  if (error) throw error;
}

function startPresenceHeartbeat(cityId, selfPlayerId, options = {}) {
  let stopped = false;
  let inFlight = false;

  async function runHeartbeat() {
    if (stopped || inFlight) return;

    inFlight = true;

    try {
      await touchSelfOnline(selfPlayerId);
      if (window.__MN_INTERIOR_ACTIVE__ === true) {
        await setPlayerOffline();
      }
    } catch (error) {
      console.warn('[network] presence heartbeat failed:', error);
    } finally {
      inFlight = false;
    }
  }

  const firstDelay = isMobileGameplayDevice() ? 900 : 250;
  const firstTimer = window.setTimeout(runHeartbeat, firstDelay);

  const timer = setInterval(
    runHeartbeat,
    getPresenceHeartbeatInterval(options)
  );

  return () => {
    stopped = true;
    window.clearTimeout(firstTimer);
    clearInterval(timer);
  };
}

function startPlayersSnapshotRefresh(entities, cityId, selfPlayerId, localPlayerPosition, options = {}) {
  let stopped = false;
  let inFlight = false;
  let consecutiveErrors = 0;

  async function refreshSnapshot() {
    if (stopped || inFlight || !entities?.isConnected) return;

    inFlight = true;

    try {
      const players = await getCityPlayers(cityId, getPlayersQueryOptions(localPlayerPosition, {
        ...options,
        entities,
      }));

      const normalizedPlayers = (Array.isArray(players) ? players : [])
        .map(normalizeRemotePlayer)
        .filter((player) => {
          const playerId = player.playerId;

          if (!playerId || isSamePlayer(playerId, selfPlayerId)) {
            return false;
          }

          if (!isPlayerFresh(player, SNAPSHOT_PLAYER_MAX_AGE_MS)) {
            removePlayerMarker(entities, playerId);
            return false;
          }

          if (!isPlayerInsideRenderDistance(player, localPlayerPosition, {
            ...options,
            entities,
          })) {
            return false;
          }

          return true;
        });

      const maxMarkers = getMaxRemoteMarkers(options);
      const renderablePlayers = sortPlayersByDistance(
        normalizedPlayers,
        localPlayerPosition
      ).slice(0, maxMarkers);

      const liveIds = new Set();

      renderablePlayers.forEach((player) => {
        liveIds.add(player.playerId);

        upsertPlayerMarker(
          entities,
          player,
          selfPlayerId,
          {
            instant: true,
            maxAgeMs: SNAPSHOT_PLAYER_MAX_AGE_MS,
            localPlayerPosition,
            entities,
            ...options,
          }
        );
      });

      entities
        .querySelectorAll('.gta-player-marker-other')
        .forEach((marker) => {
          const markerPlayerId = marker.dataset.playerId;

          if (!markerPlayerId || isSamePlayer(markerPlayerId, selfPlayerId)) return;

          const markerPlayer = getPlayerFromMarker(marker);
          const isInsideUnloadRadius = isPlayerInsideUnloadDistance(
            markerPlayer,
            localPlayerPosition,
            {
              ...options,
              entities,
            }
          );

          if (!liveIds.has(markerPlayerId) || !isInsideUnloadRadius) {
            removePlayerMarker(entities, markerPlayerId);
          }
        });

      consecutiveErrors = 0;
    } catch (error) {
      consecutiveErrors += 1;
      console.warn('[network] players snapshot refresh failed:', error);
    } finally {
      inFlight = false;
    }
  }

  const baseInterval = getSnapshotRefreshInterval(options);

  function scheduleNextSnapshot() {
    if (stopped) return;

    const errorBackoff = consecutiveErrors
      ? Math.min(18000, consecutiveErrors * 3500)
      : 0;

    const delay = baseInterval + errorBackoff;

    return window.setTimeout(async () => {
      await refreshSnapshot();
      scheduleNextSnapshot();
    }, delay);
  }

  const firstDelay = isMobileGameplayDevice() ? 1100 : 300;
  let timer = window.setTimeout(async () => {
    await refreshSnapshot();
    timer = scheduleNextSnapshot();
  }, firstDelay);

  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}

export function setupPlayerNetwork({
  cityId,
  playerId,
  localPlayerId,
  entities,
  playerPosition,
}) {
  const selfPlayerId =
    localPlayerId || playerId;

  if (!cityId || !selfPlayerId || !entities) {
    console.warn('[network] setup skipped: missing cityId/playerId/entities');

    return {
      movementChannel: null,
      cleanup() {},
    };
  }

  const isMobileNetwork = isMobileGameplayDevice();

  const streamingOptions = {
    entities,
    viewport: entities?.closest?.('.gta-map-viewport') || null,
    maxRemoteMarkers: isMobileNetwork
      ? MOBILE_MAX_REMOTE_MARKERS
      : DESKTOP_MAX_REMOTE_MARKERS,
  };

  let stopped = false;
  let movementFlushFrame = null;
  let lastMovementFlushAt = 0;
  const pendingRemotePlayers = new Map();
  const packetFlushInterval = getRemotePacketFlushInterval();

  function cancelMovementFlush() {
    if (movementFlushFrame) {
      cancelAnimationFrame(movementFlushFrame);
      movementFlushFrame = null;
    }
  }

  function flushQueuedRemotePlayers(now = performance.now()) {
    movementFlushFrame = null;

    if (stopped || !entities?.isConnected) {
      pendingRemotePlayers.clear();
      return;
    }

    if (now - lastMovementFlushAt < packetFlushInterval) {
      movementFlushFrame = requestAnimationFrame(flushQueuedRemotePlayers);
      return;
    }

    lastMovementFlushAt = now;

    const batch = Array.from(pendingRemotePlayers.values());
    pendingRemotePlayers.clear();

    const normalizedBatch = batch
      .map(({ rawPlayer, upsertOptions }) => {
        return {
          player: normalizeRemotePlayer(rawPlayer),
          upsertOptions,
        };
      })
      .filter(({ player, upsertOptions }) => {
        if (!player.playerId || isSamePlayer(player.playerId, selfPlayerId)) {
          cleanupLocalDuplicates(entities, selfPlayerId);
          return false;
        }

        if (!isPlayerOnlineFlagEnabled(player)) {
          removePlayerMarker(entities, player.playerId);
          return false;
        }

        if (
          !upsertOptions.skipFreshnessCheck &&
          !isPlayerFresh(player, upsertOptions.maxAgeMs ?? ONLINE_TTL_MS)
        ) {
          removePlayerMarker(entities, player.playerId);
          return false;
        }

        if (
          !upsertOptions.skipRenderDistance &&
          !isPlayerInsideRenderDistance(player, playerPosition, {
            ...streamingOptions,
            ...upsertOptions,
          })
        ) {
          removePlayerMarker(entities, player.playerId);
          return false;
        }

        return true;
      });

    const localPosition = getLocalPosition(playerPosition);
    const sortedBatch = normalizedBatch
      .slice()
      .sort((a, b) => {
        if (!localPosition) return 0;

        return getPercentDistance(a.player, localPosition) - getPercentDistance(b.player, localPosition);
      })
      .slice(0, getMaxRemoteMarkers(streamingOptions));

    sortedBatch.forEach(({ player, upsertOptions }) => {
      upsertPlayerMarker(
        entities,
        player,
        selfPlayerId,
        {
          localPlayerPosition: playerPosition,
          entities,
          ...streamingOptions,
          ...upsertOptions,
        }
      );
    });

    if (pendingRemotePlayers.size) {
      movementFlushFrame = requestAnimationFrame(flushQueuedRemotePlayers);
    }
  }

  function queueRemotePlayer(rawPlayer, upsertOptions = {}) {
    if (stopped || !rawPlayer) return;

    const playerId = getPlayerId(rawPlayer);

    if (!playerId) return;

    // Храним только последний пакет по каждому игроку.
    // Это убирает микрофризы от пачек realtime/broadcast сообщений.
    pendingRemotePlayers.set(playerId, {
      rawPlayer,
      upsertOptions,
    });

    if (!movementFlushFrame) {
      movementFlushFrame = requestAnimationFrame(flushQueuedRemotePlayers);
    }
  }

  cleanupLocalDuplicates(entities, selfPlayerId);
  cleanupRemotePlayersOutsideRenderDistance(
    entities,
    selfPlayerId,
    playerPosition,
    streamingOptions
  );

  let movementChannel = null;

  function broadcastLocalTreatment(event) {
    const detail = event?.detail || {};
    movementChannel?.sendTreatment?.({
      playerId: selfPlayerId,
      active: detail.active === true,
      activeUntil: Number(detail.activeUntil || Date.now()),
      updatedAt: new Date().toISOString(),
    });
  }

  try {
    movementChannel = createCityMovementChannel(cityId, {
      onMove(player) {
        queueRemotePlayer(player, {
          instant: false,
          skipFreshnessCheck: true,
        });
      },
      onTreatment(treatment) {
        const remotePlayerId = getPlayerId(treatment);
        if (!remotePlayerId || isSamePlayer(remotePlayerId, selfPlayerId)) return;
        window.dispatchEvent(new CustomEvent('mn:remote-player-treatment-state-changed', {
          detail: { ...treatment, playerId: remotePlayerId },
        }));
      },
    });
    window.addEventListener('mn:local-player-treatment-state-changed', broadcastLocalTreatment);
  } catch (error) {
    console.warn('[network] movement channel failed:', error);
  }

  const cleanupStalePlayers =
    startStalePlayersCleanup(
      entities,
      selfPlayerId,
      playerPosition,
      streamingOptions
    );

  const cleanupPresenceHeartbeat =
    startPresenceHeartbeat(cityId, selfPlayerId, streamingOptions);

  const cleanupSnapshotRefresh =
    startPlayersSnapshotRefresh(
      entities,
      cityId,
      selfPlayerId,
      playerPosition,
      streamingOptions
    );

  const cleanupOffline =
    enableOfflineOnExit();

  let cleanupRealtime = null;

  const shouldUsePostgresRealtime =
    !isMobileNetwork || MOBILE_POSTGRES_REALTIME_ENABLED;

  if (shouldUsePostgresRealtime) {
    try {
      cleanupRealtime =
        subscribeCityPlayers(cityId, {
          onInsert(player) {
            queueRemotePlayer(player, {
              instant: true,
              maxAgeMs: SNAPSHOT_PLAYER_MAX_AGE_MS,
            });
          },

          onUpdate(player) {
            queueRemotePlayer(player, {
              instant: false,
              maxAgeMs: SNAPSHOT_PLAYER_MAX_AGE_MS,
            });
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

            pendingRemotePlayers.delete(String(playerId));
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
  }

  return {
    movementChannel,

    cleanup() {
      stopped = true;
      cancelMovementFlush();
      pendingRemotePlayers.clear();

      cleanupRealtime?.();

      cleanupStalePlayers?.();
      cleanupPresenceHeartbeat?.();
      cleanupSnapshotRefresh?.();
      cleanupOffline?.();

      window.removeEventListener('mn:local-player-treatment-state-changed', broadcastLocalTreatment);
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
