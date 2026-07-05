import { getStaminaConfig } from '../player/playerStaminaConfig.js';
import { MOVEMENT_CONFIG } from '../config/movement.js';

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

function getPositiveNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function hasPositionChanged(a, b, angleA, angleB, epsilon = 0.003) {
  return (
    Math.abs(a.x - b.x) > epsilon ||
    Math.abs(a.y - b.y) > epsilon ||
    Math.abs(angleA - angleB) > 0.25
  );
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

  function updateSprintState(isMoving, frameScale = 1) {
    const wantsSprint = isMoving && isSprintPressed() && !sprintLocked;

    if (wantsSprint) {
      stamina = Math.max(
        STAMINA.emptyAt,
        stamina - STAMINA.drainPerFrame * frameScale
      );

      if (stamina <= STAMINA.emptyAt) {
        sprintLocked = true;
        stamina = STAMINA.emptyAt;
      }
    } else {
      stamina = Math.min(
        STAMINA.max,
        stamina + STAMINA.recoverPerFrame * frameScale
      );

      if (stamina >= STAMINA.recoveredAt) {
        sprintLocked = false;
        stamina = STAMINA.max;
      }
    }

    updateStaminaUi();

    return wantsSprint;
  }

  const BOUNDS = getMovementBounds();
  const SYNC_CONFIG = getMovementSyncConfig();

  const WALK_SPEED = getPositiveNumber(
    getKeyboardMoveSpeed(),
    getPositiveNumber(MOVEMENT_CONFIG.WALK_SPEED, 0.055)
  );

  const SPRINT_SPEED = Math.max(
    WALK_SPEED * getPositiveNumber(STAMINA.sprintSpeedMultiplier, 1.55),
    getPositiveNumber(MOVEMENT_CONFIG.SPRINT_SPEED, WALK_SPEED * 1.55)
  );

  // ПК не должен писать позицию в БД каждые 1.4 сек во время ходьбы.
  // Broadcast остаётся быстрым, DB сохраняется реже и принудительно при остановке.
  const BROADCAST_INTERVAL = Math.max(SYNC_CONFIG.broadcastInterval || 35, 55);
  const DB_SAVE_INTERVAL = Math.max(SYNC_CONFIG.dbSaveInterval || 1400, 9000);
  const HEARTBEAT_DELAY = Math.max(SYNC_CONFIG.heartbeatDelay || 1000, 9000);

  let x = Number(playerPosition.x) || 50;
  let y = Number(playerPosition.y) || 50;
  let angle = Number(playerPosition.angle || playerPosition.direction || 0);

  let animationId = null;
  let heartbeatTimer = null;
  let destroyed = false;
  let lastFrameAt = performance.now();
  let lastRuntimeMovingState = null;

  let lastBroadcastAt = 0;
  let lastDbSaveAt = 0;
  let dbSaveInFlight = false;
  let dbSavePending = false;

  let lastDbSaved = { x, y };
  let lastDbSavedAngle = angle;

  function setPlayerMovingUi(isMoving) {
    const moving = Boolean(isMoving);

    window.__MN_PLAYER_MOVING__ = moving;
    window.__MN_DESKTOP_PLAYER_MOVING__ = moving;

    if (lastRuntimeMovingState === moving) return;

    lastRuntimeMovingState = moving;

    document.body?.classList?.toggle('mn-player-moving', moving);
    document.documentElement?.classList?.toggle('mn-player-moving', moving);

    if (document.body?.dataset) {
      document.body.dataset.mnPlayerMoving = moving ? 'true' : 'false';
    }
  }

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
    const changedEnough = hasPositionChanged(
      { x, y },
      lastDbSaved,
      angle,
      lastDbSavedAngle
    );

    if (!force && now - lastDbSaveAt < DB_SAVE_INTERVAL) {
      dbSavePending = true;
      return;
    }

    if (!force && !changedEnough) {
      dbSavePending = false;
      return;
    }

    if (force && now - lastDbSaveAt < 900 && !changedEnough) {
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
      lastDbSaved = { x, y };
      lastDbSavedAngle = angle;
    } catch (error) {
      console.warn('[keyboardMovement] player position update failed:', error);
    } finally {
      dbSaveInFlight = false;

      // Не запускаем цепочку сохранений сразу после завершения запроса.
      // Следующий tick/остановка сами сохранят актуальную позицию.
      if (dbSavePending && !destroyed) {
        dbSavePending = false;
      }
    }
  }

  function queuePositionSave(force = false) {
    if (force) {
      savePositionToDb(true);
      return;
    }

    if (Date.now() - lastDbSaveAt >= DB_SAVE_INTERVAL) {
      savePositionToDb(false);
    }
  }

  function startHeartbeat() {
    clearInterval(heartbeatTimer);

    heartbeatTimer = setInterval(() => {
      forceSyncPosition();
      broadcastMove(true);
      savePositionToDb(false);
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

  function shouldSleepLoop(moved) {
    return (
      !moved &&
      keys.size === 0 &&
      stamina >= STAMINA.max &&
      !sprintLocked
    );
  }

  function loop(now = performance.now()) {
    if (destroyed) return;

    const delta = Math.min(34, Math.max(8, now - lastFrameAt));
    const frameScale = delta / 16.6667;

    lastFrameAt = now;

    const { moveX, moveY } = getMoveVector();

    const moved =
      Math.abs(moveX) > 0.001 ||
      Math.abs(moveY) > 0.001;

    const isSprinting = updateSprintState(moved, frameScale);
    const speed = isSprinting ? SPRINT_SPEED : WALK_SPEED;

    setPlayerMovingUi(moved);

    if (moved) {
      x += moveX * speed * frameScale;
      y += moveY * speed * frameScale;

      angle = getAngleFromMovement(moveX, moveY, angle);

      renderPlayer();
      broadcastMove(false);
      queuePositionSave(false);
    } else {
      syncPlayerPosition();
    }

    if (shouldSleepLoop(moved)) {
      animationId = null;
      updateStaminaUi();
      return;
    }

    animationId = requestAnimationFrame(loop);
  }

  function ensureLoopRunning() {
    if (!animationId && !destroyed) {
      lastFrameAt = performance.now();
      animationId = requestAnimationFrame(loop);
    }
  }

  function onExternalTeleport(event) {
    const detail = event?.detail || {};

    const nextX = Number(detail.x);
    const nextY = Number(detail.y);
    const nextAngle = Number(detail.angle || angle);

    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;

    x = clamp(nextX, BOUNDS.minX, BOUNDS.maxX);
    y = clamp(nextY, BOUNDS.minY, BOUNDS.maxY);
    angle = Number.isFinite(nextAngle) ? nextAngle : angle;

    keys.clear();

    forceSyncPosition();
    broadcastMove(true);
    savePositionToDb(true);
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
      ensureLoopRunning();
    }
  }

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());

    if (keys.size === 0) {
      setPlayerMovingUi(false);
      forceSyncPosition();
      broadcastMove(true);
      updateStaminaUi();

      setTimeout(() => {
        if (!destroyed) {
          savePositionToDb(true);
        }
      }, 60);
    }

    ensureLoopRunning();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mn:player-teleported', onExternalTeleport);

  forceSyncPosition();
  savePositionToDb(true);
  startHeartbeat();
  updateStaminaUi();

  return () => {
    destroyed = true;
    setPlayerMovingUi(false);
    clearInterval(heartbeatTimer);

    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mn:player-teleported', onExternalTeleport);

    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    forceSyncPosition();
    broadcastMove(true);
    savePositionToDb(true);

    staminaHud.remove();
  };
}
