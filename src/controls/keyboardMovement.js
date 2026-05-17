import {
  getKeyboardMoveSpeed,
  getMovementBounds,
  getMovementSyncConfig,
} from '../player/playerStatsConfig.js';

import {
  getLocalPlayerId,
  updatePlayerPosition,
} from '../player/playerPosition.js';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getAngleFromMovement(moveX, moveY, fallback = 0) {
  if (Math.abs(moveX) < 0.001 && Math.abs(moveY) < 0.001) {
    return fallback;
  }

  return Math.atan2(moveX, -moveY) * 180 / Math.PI;
}
export function enableKeyboardPlayerMovement(marker, playerPosition, cityId, nickname, movementChannel) {
  if (!marker || !playerPosition) return null;

  const keys = new Set();

const SPEED = getKeyboardMoveSpeed();
const BOUNDS = getMovementBounds();
const SYNC_CONFIG = getMovementSyncConfig();

const BROADCAST_INTERVAL = SYNC_CONFIG.broadcastInterval;
const DB_SAVE_INTERVAL = SYNC_CONFIG.dbSaveInterval;
const HEARTBEAT_DELAY = SYNC_CONFIG.heartbeatDelay;

  let x = Number(playerPosition.x) || 50;
  let y = Number(playerPosition.y) || 50;
  let angle = Number(playerPosition.angle || playerPosition.direction || 0);

  playerPosition.x = x;
  playerPosition.y = y;
  playerPosition.angle = angle;

  let animationId = null;
  let heartbeatTimer = null;
  let destroyed = false;

  let lastBroadcastAt = 0;
  let lastDbSaveAt = 0;
  let dbSaveInFlight = false;
  let dbSavePending = false;

  function syncPlayerPosition() {
    playerPosition.x = x;
    playerPosition.y = y;
    playerPosition.angle = angle;
  }

  function renderPlayer() {
    x = clamp(x, BOUNDS.minX, BOUNDS.maxX);
    y = clamp(y, BOUNDS.minY, BOUNDS.maxY);
    syncPlayerPosition();

    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    marker.dataset.angle = String(angle);
    marker.style.setProperty('--player-angle', `${angle}deg`);
  }

  function broadcastMove(force = false) {
    const now = Date.now();

    if (!force && now - lastBroadcastAt < BROADCAST_INTERVAL) return;

    lastBroadcastAt = now;

    movementChannel?.sendMove({
      playerId: getLocalPlayerId(),
      nickname,
      cityId,
      x: playerPosition.x,
      y: playerPosition.y,
      angle: playerPosition.angle,
      updatedAt: new Date().toISOString(),
    });
  }

  async function savePositionToDb(force = false) {
    const now = Date.now();

    if (!force && now - lastDbSaveAt < DB_SAVE_INTERVAL) {
      dbSavePending = true;
      return;
    }

    if (dbSaveInFlight) {
      dbSavePending = true;
      return;
    }

    dbSaveInFlight = true;
    dbSavePending = false;

    try {
      await updatePlayerPosition({
        cityId,
        nickname,
        x: playerPosition.x,
        y: playerPosition.y,
        angle: playerPosition.angle,
      });

      lastDbSaveAt = Date.now();
    } catch (error) {
      console.warn('[keyboardMovement] player position update failed:', error);
    } finally {
      dbSaveInFlight = false;

      if (dbSavePending && !destroyed) {
        savePositionToDb(false);
      }
    }
  }

  function startHeartbeat() {
    clearInterval(heartbeatTimer);

    heartbeatTimer = setInterval(() => {
      renderPlayer();
      savePositionToDb(true);
      broadcastMove(true);
    }, HEARTBEAT_DELAY);
  }

  function getMoveVector() {
    let moveX = 0;
    let moveY = 0;

    if (keys.has('w') || keys.has('ц') || keys.has('arrowup')) {
      moveY -= 1;
    }

    if (keys.has('s') || keys.has('ы') || keys.has('arrowdown')) {
      moveY += 1;
    }

    if (keys.has('a') || keys.has('ф') || keys.has('arrowleft')) {
      moveX -= 1;
    }

    if (keys.has('d') || keys.has('в') || keys.has('arrowright')) {
      moveX += 1;
    }

    const length = Math.hypot(moveX, moveY);

    if (length > 0) {
      moveX /= length;
      moveY /= length;
    }

    return {
      moveX,
      moveY,
    };
  }

  function loop() {
    if (destroyed) return;

    const { moveX, moveY } = getMoveVector();

    const moved =
      Math.abs(moveX) > 0.001 ||
      Math.abs(moveY) > 0.001;

    if (moved) {
      x += moveX * SPEED;
      y += moveY * SPEED;
      angle = getAngleFromMovement(moveX, moveY, angle);

      renderPlayer();
      broadcastMove(false);
      savePositionToDb(false);
    }

    animationId = requestAnimationFrame(loop);
  }

  function onKeyDown(event) {
    const tag = document.activeElement?.tagName?.toLowerCase();

    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    const key = event.key.toLowerCase();

    const allowedKeys = [
      'w', 'a', 's', 'd',
      'ц', 'ф', 'ы', 'в',
      'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
    ];

    if (allowedKeys.includes(key)) {
      event.preventDefault();
      keys.add(key);

      if (!animationId) {
        animationId = requestAnimationFrame(loop);
      }
    }
  }

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());

    if (keys.size === 0 && animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;

      renderPlayer();
      broadcastMove(true);
      savePositionToDb(true);
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  renderPlayer();
  savePositionToDb(true);
  startHeartbeat();

  return () => {
    destroyed = true;
    clearInterval(heartbeatTimer);

    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);

    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    renderPlayer();
    broadcastMove(true);
    savePositionToDb(true);
  };
}
