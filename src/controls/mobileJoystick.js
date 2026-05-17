import { getStaminaConfig } from '../player/playerStaminaConfig.js';

import {
  getMobileMoveSpeed,
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

function isMobileDevice() {
  return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

function isPortraitScreen() {
  return window.matchMedia('(orientation: portrait)').matches;
}

function isRotatedMobileScene() {
  return isPortraitScreen();
}

function rotateInputForMobileScene(inputX, inputY) {
  if (!isRotatedMobileScene()) {
    return {
      x: inputX,
      y: inputY,
    };
  }

  return {
    x: inputY,
    y: -inputX,
  };
}

function getAngleFromMovement(moveX, moveY, fallback = 0) {
  if (Math.abs(moveX) < 0.001 && Math.abs(moveY) < 0.001) {
    return fallback;
  }

  return Math.atan2(moveX, -moveY) * 180 / Math.PI;
}

export function enableMobileJoystick(
  container,
  marker,
  playerPosition,
  cityId,
  nickname,
  mapControls,
  movementChannel
) {
  if (!container || !marker || !playerPosition) return null;
  if (!isMobileDevice()) return null;

  container.innerHTML = `
    <div class="mobile-joystick">
      <div class="mobile-joystick-base">
        <div class="mobile-joystick-stick"></div>
      </div>
    </div>
  `;

  const joystick = container.querySelector('.mobile-joystick');
  const base = container.querySelector('.mobile-joystick-base');
  const stick = container.querySelector('.mobile-joystick-stick');


const SPEED = getMobileMoveSpeed();

const STAMINA = getStaminaConfig();

let stamina = STAMINA.max;
let isTired = false;

function updateStamina(isMoving) {
  if (isMoving) {
    stamina = Math.max(0, stamina - STAMINA.drainPerFrame);
  } else {
    stamina = Math.min(STAMINA.max, stamina + STAMINA.recoverPerFrame);
  }

  if (stamina <= STAMINA.tiredAt) {
    isTired = true;
  }

  if (stamina >= STAMINA.recoveredAt) {
    isTired = false;
  }

  return isTired
    ? STAMINA.tiredSpeedMultiplier
    : STAMINA.normalSpeedMultiplier;
}
  
const MAX_DISTANCE = 42;
const DEADZONE = 0.22;

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

  let activePointerId = null;

  let centerX = 0;
  let centerY = 0;

  let moveX = 0;
  let moveY = 0;

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
      console.warn('[mobileJoystick] player position update failed:', error);
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

  function resetStick() {
    moveX = 0;
    moveY = 0;

    stick.style.transform =
      'translate(-50%, -50%) translate3d(0, 0, 0)';
  }

  function updateStick(clientX, clientY) {
    const dx = clientX - centerX;
    const dy = clientY - centerY;

    const rawDistance = Math.hypot(dx, dy);
    const distance = Math.min(rawDistance, MAX_DISTANCE);

    if (rawDistance <= 0.001) {
      resetStick();
      return;
    }

    const inputX = dx / rawDistance;
    const inputY = dy / rawDistance;

    const rotatedInput = rotateInputForMobileScene(inputX, inputY);
    const power = distance / MAX_DISTANCE;

    if (power < DEADZONE) {
      resetStick();
      return;
    }

    moveX = rotatedInput.x * power;
    moveY = rotatedInput.y * power;

    angle = getAngleFromMovement(moveX, moveY, angle);
    syncPlayerPosition();

    const visualInput = rotateInputForMobileScene(inputX, inputY);
    const stickX = visualInput.x * distance;
    const stickY = visualInput.y * distance;

    stick.style.transform =
      `translate(-50%, -50%) translate3d(${stickX}px, ${stickY}px, 0)`;
  }

  function loop() {
    if (destroyed) return;

    const isMoving =
      Math.abs(moveX) > DEADZONE ||
      Math.abs(moveY) > DEADZONE;

    const speedMultiplier = updateStamina(isMoving);

      if (isMoving) {
        x += moveX * SPEED * speedMultiplier;
        y += moveY * SPEED * speedMultiplier;

      angle = getAngleFromMovement(moveX, moveY, angle);

      renderPlayer();
      broadcastMove(false);
      savePositionToDb(false);
    }

    if (!isMoving) {
      updateStamina(false);
    }

    animationId = requestAnimationFrame(loop);
    
  }

  function onPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();

    activePointerId = event.pointerId;

    const rect = base.getBoundingClientRect();

    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;

    base.setPointerCapture(event.pointerId);

    updateStick(event.clientX, event.clientY);

    if (!animationId) {
      animationId = requestAnimationFrame(loop);
    }
  }

  function onPointerMove(event) {
    if (event.pointerId !== activePointerId) return;

    event.preventDefault();
    event.stopPropagation();

    updateStick(event.clientX, event.clientY);
  }

  function onPointerEnd(event) {
    if (event.pointerId !== activePointerId) return;

    event.preventDefault();
    event.stopPropagation();

    activePointerId = null;

    resetStick();
    renderPlayer();

    broadcastMove(true);
    savePositionToDb(true);
  }

  base.addEventListener('pointerdown', onPointerDown);
  base.addEventListener('pointermove', onPointerMove);
  base.addEventListener('pointerup', onPointerEnd);
  base.addEventListener('pointercancel', onPointerEnd);
  base.addEventListener('pointerleave', onPointerEnd);

  renderPlayer();
  savePositionToDb(true);
  startHeartbeat();

  return () => {
    destroyed = true;

    clearInterval(heartbeatTimer);

    base.removeEventListener('pointerdown', onPointerDown);
    base.removeEventListener('pointermove', onPointerMove);
    base.removeEventListener('pointerup', onPointerEnd);
    base.removeEventListener('pointercancel', onPointerEnd);
    base.removeEventListener('pointerleave', onPointerEnd);

    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    resetStick();
    renderPlayer();

    joystick?.remove();

    broadcastMove(true);
    savePositionToDb(true);
  };
}
