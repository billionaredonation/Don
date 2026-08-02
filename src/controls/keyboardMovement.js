import { getStaminaConfig, getStaminaRecoveryPerFrame } from '../player/playerStaminaConfig.js';
import { MOVEMENT_CONFIG } from '../config/movement.js';
import { state } from '../state.js';

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

function lerpByFrame(current, target, lerp, frameScale) {
  const safeLerp = clamp(Number(lerp) || 0, 0, 1);
  const safeFrameScale = Math.max(0.001, Number(frameScale) || 1);

  return current + (target - current) * (1 - Math.pow(1 - safeLerp, safeFrameScale));
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

    if (sprintLocked || window.__MN_SPRINT_BLOCKED_BY_VITALS__ === true) {
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
    const sprintBlockedByVitals = window.__MN_SPRINT_BLOCKED_BY_VITALS__ === true;
    const wantsSprint = isMoving && isSprintPressed() && !sprintLocked && !sprintBlockedByVitals;

    if (wantsSprint) {
      stamina = Math.max(
        STAMINA.emptyAt,
        stamina - STAMINA.drainPerFrame * frameScale
      );

      if (stamina <= STAMINA.emptyAt) {
        const wasLocked = sprintLocked;
        sprintLocked = true;
        stamina = STAMINA.emptyAt;
        if (!wasLocked) {
          window.dispatchEvent(new CustomEvent('mn:player-stamina-exhausted', {
            detail: { source: 'keyboard' },
          }));
        }
      }
    } else {
      stamina = Math.min(
        STAMINA.max,
        stamina + getStaminaRecoveryPerFrame(state.player?.water) * frameScale
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
    getPositiveNumber(MOVEMENT_CONFIG.WALK_SPEED, 0.085)
  );

  const SPRINT_SPEED = Math.max(
    WALK_SPEED * getPositiveNumber(STAMINA.sprintSpeedMultiplier, 1.55),
    getPositiveNumber(MOVEMENT_CONFIG.SPRINT_SPEED, WALK_SPEED * 1.55)
  );

  /*
    ПК теперь тоже двигается через velocity/render-позицию.
    До этого позиция прыгала ровно на speed * delta каждый кадр: когда вокруг много DOM-домов,
    любой просевший кадр выглядел как резкий шаг. Здесь ход остаётся быстрым, но камера/маркер
    догоняют координату плавно и без ощущения «стоп-кадр/рывок».
  */
  const INPUT_ACCELERATION = 0.26;
  const INPUT_DECELERATION = 0.34;
  const VELOCITY_ACCELERATION = 0.30;
  const VELOCITY_DECELERATION = 0.42;
  const RENDER_LAG = 0.58;
  const STOP_EPSILON = 0.000045;
  const RENDER_EPSILON = 0.00006;
  const MARKER_DATA_SYNC_INTERVAL = 100;

  // Broadcast быстрый, DB реже. DB-запись во время движения не должна давить кадр.
  const BROADCAST_INTERVAL = Math.max(SYNC_CONFIG.broadcastInterval || 35, 90);
  const DB_SAVE_INTERVAL = Math.max(SYNC_CONFIG.dbSaveInterval || 1400, 12000);
  const HEARTBEAT_DELAY = Math.max(SYNC_CONFIG.heartbeatDelay || 1000, 12000);

  let x = Number(playerPosition.x) || 50;
  let y = Number(playerPosition.y) || 50;
  let renderX = x;
  let renderY = y;
  let angle = Number(playerPosition.angle || playerPosition.direction || 0);

  let inputX = 0;
  let inputY = 0;
  let velocityX = 0;
  let velocityY = 0;

  let animationId = null;
  let heartbeatTimer = null;
  let destroyed = false;
  let lastFrameAt = performance.now();
  let lastMarkerDataSyncAt = 0;

  let lastBroadcastAt = 0;
  let lastDbSaveAt = 0;
  let dbSaveInFlight = false;
  let dbSavePending = false;

  let lastDbSaved = { x, y };
  let lastDbSavedAngle = angle;
  let lastDesktopMovingState = null;
  let lastSentX = x;
  let lastSentY = y;
  let lastSentAngle = angle;

  function setDesktopRuntimeMoving(isMoving) {
    const moving = Boolean(isMoving);

    if (lastDesktopMovingState === moving) return;

    lastDesktopMovingState = moving;
    window.__MN_DESKTOP_PLAYER_MOVING__ = moving;
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
  }

  function paintPlayer(force = false) {
    x = clamp(x, BOUNDS.minX, BOUNDS.maxX);
    y = clamp(y, BOUNDS.minY, BOUNDS.maxY);
    renderX = clamp(renderX, BOUNDS.minX, BOUNDS.maxX);
    renderY = clamp(renderY, BOUNDS.minY, BOUNDS.maxY);

    syncPlayerPosition();

    marker.style.left = `${renderX}%`;
    marker.style.top = `${renderY}%`;
    marker.style.setProperty('--player-angle', `${angle}deg`);

    const now = performance.now();

    if (force || now - lastMarkerDataSyncAt >= MARKER_DATA_SYNC_INTERVAL) {
      marker.dataset.x = String(x);
      marker.dataset.y = String(y);
      marker.dataset.angle = String(angle);
      lastMarkerDataSyncAt = now;
    }

    mapControls?.focusOnPlayer?.(renderX, renderY);
  }

  function forceSyncPosition() {
    x = clamp(x, BOUNDS.minX, BOUNDS.maxX);
    y = clamp(y, BOUNDS.minY, BOUNDS.maxY);
    renderX = x;
    renderY = y;
    inputX = 0;
    inputY = 0;
    velocityX = 0;
    velocityY = 0;

    paintPlayer(true);
  }

  function hasBroadcastPositionChangedEnough() {
    return (
      Math.abs(x - lastSentX) > 0.002 ||
      Math.abs(y - lastSentY) > 0.002 ||
      Math.abs(angle - lastSentAngle) > 0.1
    );
  }

  function markBroadcastSent() {
    lastSentX = x;
    lastSentY = y;
    lastSentAngle = angle;
  }

  function broadcastMove(force = false) {
    const now = Date.now();

    if (!force && now - lastBroadcastAt < BROADCAST_INTERVAL) return;
    if (!force && !hasBroadcastPositionChangedEnough()) return;

    lastBroadcastAt = now;

    movementChannel?.sendMove?.({
      playerId: getLocalPlayerId(),
      nickname,
      cityId,
      x: Math.round(x * 10000) / 10000,
      y: Math.round(y * 10000) / 10000,
      angle: Math.round(angle * 10) / 10,
      updatedAt: new Date().toISOString(),
    });

    markBroadcastSent();
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

    syncPlayerPosition();

    dbSaveInFlight = true;
    dbSavePending = false;

    try {
      await updatePlayerPosition({
        cityId,
        nickname,
        x,
        y,
        angle,
      });

      lastDbSaveAt = Date.now();
      lastDbSaved = { x, y };
      lastDbSavedAngle = angle;
    } catch (error) {
      console.warn('[keyboardMovement] player position update failed:', error);
    } finally {
      dbSaveInFlight = false;

      if (dbSavePending && !destroyed) {
        dbSavePending = false;
      }
    }
  }

  function startHeartbeat() {
    clearInterval(heartbeatTimer);

    heartbeatTimer = setInterval(() => {
      if (destroyed) return;

      paintPlayer(false);

      if (!window.__MN_DESKTOP_PLAYER_MOVING__) {
        broadcastMove(true);
        savePositionToDb(false);
      }
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

  function isMotionSettled() {
    return (
      Math.abs(inputX) <= 0.002 &&
      Math.abs(inputY) <= 0.002 &&
      Math.abs(velocityX) <= STOP_EPSILON &&
      Math.abs(velocityY) <= STOP_EPSILON &&
      Math.abs(renderX - x) <= RENDER_EPSILON &&
      Math.abs(renderY - y) <= RENDER_EPSILON
    );
  }

  function shouldSleepLoop(wantsMove, isMoving) {
    return (
      !wantsMove &&
      !isMoving &&
      keys.size === 0 &&
      stamina >= STAMINA.max &&
      !sprintLocked
    );
  }

  function loop(now = performance.now()) {
    if (destroyed) return;
    if (
      window.__MN_INTERIOR_ACTIVE__ === true ||
      window.__MN_INVENTORY_OPEN__ === true
    ) {
      keys.clear();
      inputX = 0; inputY = 0; velocityX = 0; velocityY = 0;
      setDesktopRuntimeMoving(false);
      animationId = null;
      return;
    }

    const delta = Math.min(34, Math.max(8, now - lastFrameAt));
    const frameScale = delta / 16.6667;

    lastFrameAt = now;

    const { moveX, moveY } = getMoveVector();
    const wantsMove = Math.abs(moveX) > 0.001 || Math.abs(moveY) > 0.001;

    const inputLerp = wantsMove ? INPUT_ACCELERATION : INPUT_DECELERATION;
    inputX = lerpByFrame(inputX, moveX, inputLerp, frameScale);
    inputY = lerpByFrame(inputY, moveY, inputLerp, frameScale);

    if (!wantsMove && Math.abs(inputX) < 0.002) inputX = 0;
    if (!wantsMove && Math.abs(inputY) < 0.002) inputY = 0;

    const isSprinting = updateSprintState(wantsMove, frameScale);
    const speed = isSprinting ? SPRINT_SPEED : WALK_SPEED;

    const targetVelocityX = inputX * speed;
    const targetVelocityY = inputY * speed;
    const velocityLerp = wantsMove ? VELOCITY_ACCELERATION : VELOCITY_DECELERATION;

    velocityX = lerpByFrame(velocityX, targetVelocityX, velocityLerp, frameScale);
    velocityY = lerpByFrame(velocityY, targetVelocityY, velocityLerp, frameScale);

    if (!wantsMove && Math.abs(velocityX) < STOP_EPSILON) velocityX = 0;
    if (!wantsMove && Math.abs(velocityY) < STOP_EPSILON) velocityY = 0;

    const isMoving = wantsMove || !isMotionSettled();
    setDesktopRuntimeMoving(isMoving);

    if (isMoving) {
      x += velocityX * frameScale;
      y += velocityY * frameScale;
      x = clamp(x, BOUNDS.minX, BOUNDS.maxX);
      y = clamp(y, BOUNDS.minY, BOUNDS.maxY);

      if (x <= BOUNDS.minX || x >= BOUNDS.maxX) velocityX = 0;
      if (y <= BOUNDS.minY || y >= BOUNDS.maxY) velocityY = 0;

      renderX = lerpByFrame(renderX, x, RENDER_LAG, frameScale);
      renderY = lerpByFrame(renderY, y, RENDER_LAG, frameScale);

      if (Math.abs(renderX - x) <= RENDER_EPSILON) renderX = x;
      if (Math.abs(renderY - y) <= RENDER_EPSILON) renderY = y;

      angle = getAngleFromMovement(velocityX || inputX || moveX, velocityY || inputY || moveY, angle);

      paintPlayer(false);
      broadcastMove(false);
      savePositionToDb(false);
    } else {
      renderX = x;
      renderY = y;
      paintPlayer(false);
    }

    if (shouldSleepLoop(wantsMove, isMoving)) {
      animationId = null;
      setDesktopRuntimeMoving(false);
      updateStaminaUi();
      paintPlayer(true);
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

  function handleSprintAvailabilityChanged() {
    updateStaminaUi();
    ensureLoopRunning();
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
    setDesktopRuntimeMoving(false);

    forceSyncPosition();
    broadcastMove(true);
    savePositionToDb(true);
  }

  function isHouseSpawnPickerActive() {
    return (
      window.__MN_HOUSE_SPAWN_PICKER_ACTIVE__ === true ||
      document.body?.classList?.contains('mn-house-spawn-open') ||
      document.documentElement?.classList?.contains('mn-house-spawn-open')
    );
  }

  function pauseForHouseSpawnPicker() {
    keys.clear();
    setDesktopRuntimeMoving(false);
    forceSyncPosition();
  }

  function onKeyDown(event) {
    if (
      window.__MN_INTERIOR_ACTIVE__ === true ||
      window.__MN_INVENTORY_OPEN__ === true ||
      isHouseSpawnPickerActive()
    ) {
      pauseForHouseSpawnPicker();
      return;
    }

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
    if (
      window.__MN_INTERIOR_ACTIVE__ === true ||
      window.__MN_INVENTORY_OPEN__ === true
    ) {
      keys.clear();
      return;
    }
    keys.delete(event.key.toLowerCase());

    if (keys.size === 0) {
      broadcastMove(true);
      updateStaminaUi();

      setTimeout(() => {
        if (!destroyed) {
          savePositionToDb(true);
        }
      }, 90);
    }

    ensureLoopRunning();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mn:player-teleported', onExternalTeleport);
  window.addEventListener('mn:house-spawn-picker-opened', pauseForHouseSpawnPicker);
  window.addEventListener('mn:inventory-opened', pauseForHouseSpawnPicker);
  window.addEventListener('mn:player-sprint-availability-changed', handleSprintAvailabilityChanged);

  forceSyncPosition();
  savePositionToDb(true);
  startHeartbeat();
  updateStaminaUi();

  return () => {
    destroyed = true;
    clearInterval(heartbeatTimer);

    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mn:player-teleported', onExternalTeleport);
    window.removeEventListener('mn:house-spawn-picker-opened', pauseForHouseSpawnPicker);
    window.removeEventListener('mn:inventory-opened', pauseForHouseSpawnPicker);
    window.removeEventListener('mn:player-sprint-availability-changed', handleSprintAvailabilityChanged);

    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    setDesktopRuntimeMoving(false);

    forceSyncPosition();
    broadcastMove(true);
    savePositionToDb(true);

    staminaHud.remove();
  };
}
