import { getStaminaConfig } from '../player/playerStaminaConfig.js';

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

export function enableKeyboardPlayerMovement(
  marker,
  playerPosition,
  cityId,
  nickname,
  mapControls,
  movementChannel
) {
  if (!marker || !playerPosition) return null;

  const keys = new Set();

  const SPEED = getKeyboardMoveSpeed();
  const STAMINA = getStaminaConfig();

  let stamina = STAMINA.max;
  let sprintLocked = false;

  const staminaHud = document.createElement('div');
  staminaHud.className = 'pc-stamina';
  staminaHud.innerHTML = `
    <div class="pc-stamina-label">STAMINA</div>
    <div class="pc-stamina-track">
      <div class="pc-stamina-fill"></div>
    </div>
  `;

  document.body.appendChild(staminaHud);

  const staminaFill = staminaHud.querySelector('.pc-stamina-fill');

  function updateStaminaUi() {
    if (!staminaFill) return;

    const percent = clamp((stamina / STAMINA.max) * 100, 0, 100);

    staminaFill.style.width = `${percent}%`;

    if (sprintLocked) {
      staminaFill.dataset.state = 'locked';
    } else if (percent < 30) {
      staminaFill.dataset.state = 'low';
    } else {
      staminaFill.dataset.state = 'normal';
    }
  }

  function isSprintPressed() {
    return keys.has('shift');
  }

  function updateSprintState(isMoving) {
    const wantsSprint = isMoving && isSprintPressed() && !sprintLocked;

    if (wantsSprint) {
      stamina = Math.max(STAMINA.emptyAt, stamina - STAMINA.drainPerFrame);

      if (stamina <= STAMINA.emptyAt) {
        sprintLocked = true;
        stamina = STAMINA.emptyAt;
      }
    } else {
      stamina = Math.min(STAMINA.max, stamina + STAMINA.recoverPerFrame);

      if (stamina >= STAMINA.recoveredAt) {
        sprintLocked = false;
        stamina = STAMINA.max;
      }
    }

    updateStaminaUi();

    return wantsSprint
      ? STAMINA.sprintSpeedMultiplier
      : STAMINA.walkSpeedMultiplier;
  }

  const BOUNDS = getMovementBounds();
  const SYNC_CONFIG = getMovementSyncConfig();

  const BROADCAST_INTERVAL = SYNC_CONFIG.broadcastInterval;
  const DB_SAVE_INTERVAL = SYNC_CONFIG.dbSaveInterval;
  const HEARTBEAT_DELAY = SYNC_CONFIG.heartbeatDelay;

  let x = Number(playerPosition.x) || 50;
  let y = Number(playerPosition.y) || 50;
  let angle = Number(playerPosition.angle || playerPosition.direction || 0);

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

    mapControls?.focusOnPlayer?.(x, y);
  }

  function forceSyncPosition() {
    x = clamp(x, BOUNDS.minX, BOUNDS.maxX);
    y = clamp(y, BOUNDS.minY, BOUNDS.maxY);

    playerPosition.x = x;
    playerPosition.y = y;
    playerPosition.angle = angle;

    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    marker.dataset.x = String(x);
    marker.dataset.y = String(y);
    marker.dataset.angle = String(angle);
    marker.style.setProperty('--player-angle', `${angle}deg`);

    mapControls?.focusOnPlayer?.(x, y);
  }

  function renderPlayer() {
    x = clamp(x, BOUNDS.minX, BOUNDS.maxX);
    y = clamp(y, BOUNDS.minY, BOUNDS.maxY);

    syncPlayerPosition();

    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    marker.dataset.x = String(x);
    marker.dataset.y = String(y);
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
      forceSyncPosition();
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

    return { moveX, moveY };
  }

  function loop() {
    if (destroyed) return;

    const { moveX, moveY } = getMoveVector();

    const moved =
      Math.abs(moveX) > 0.001 ||
      Math.abs(moveY) > 0.001;

    const speedMultiplier = updateSprintState(moved);

    if (moved) {
      x += moveX * SPEED * speedMultiplier;
      y += moveY * SPEED * speedMultiplier;

      angle = getAngleFromMovement(moveX, moveY, angle);

      renderPlayer();
      broadcastMove(false);
      savePositionToDb(false);
    } else {
      syncPlayerPosition();
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
      'shift',
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

      forceSyncPosition();
      broadcastMove(true);
      updateStaminaUi();

      setTimeout(() => {
        if (!destroyed) {
          savePositionToDb(true);
        }
      }, 60);
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  forceSyncPosition();
  savePositionToDb(true);
  startHeartbeat();
  updateStaminaUi();

  return () => {
    destroyed = true;
    clearInterval(heartbeatTimer);

    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);

    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    forceSyncPosition();
    broadcastMove(true);
    savePositionToDb(true);

    staminaHud.remove();
  };
}
