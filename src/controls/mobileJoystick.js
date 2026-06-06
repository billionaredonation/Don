import { getStaminaConfig } from '../player/playerStaminaConfig.js';
import { MOVEMENT_CONFIG } from '../config/movement.js';

import {
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

function toFiniteNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isMobileDevice() {
  return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

/*
  ВАЖНО:
  - UI-слой джойстика в CSS контр-повернут обратно.
  - Поэтому палец/стик работают в нормальных экранных координатах.
  - А движение игрока переводим в координаты повернутой карты.
*/
function screenInputToWorldInput(inputX, inputY) {
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

function getInitialPosition(playerPosition, marker, bounds) {
  const px = toFiniteNumber(playerPosition?.x);
  const py = toFiniteNumber(playerPosition?.y);

  const mx = toFiniteNumber(marker?.dataset?.x);
  const my = toFiniteNumber(marker?.dataset?.y);

  const sx = toFiniteNumber(marker?.style?.left?.replace('%', ''));
  const sy = toFiniteNumber(marker?.style?.top?.replace('%', ''));

  return {
    x: clamp(px ?? mx ?? sx ?? 50, bounds.minX, bounds.maxX),
    y: clamp(py ?? my ?? sy ?? 50, bounds.minY, bounds.maxY),
  };
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
    <div class="mobile-stamina">
      <div class="mobile-stamina-label">STAMINA</div>
      <div class="mobile-stamina-track">
        <div class="mobile-stamina-fill"></div>
      </div>
    </div>

    <div class="mobile-joystick">
      <div class="mobile-joystick-base">
        <div class="mobile-joystick-stick"></div>
      </div>
    </div>
  `;

  const joystick = container.querySelector('.mobile-joystick');
  const staminaEl = container.querySelector('.mobile-stamina');
  const base = container.querySelector('.mobile-joystick-base');
  const stick = container.querySelector('.mobile-joystick-stick');
  const staminaFill = container.querySelector('.mobile-stamina-fill');

  const STAMINA = getStaminaConfig();
  const BOUNDS = getMovementBounds();
  const SYNC_CONFIG = getMovementSyncConfig();

  const MAX_DISTANCE = 42;
  const DEADZONE = 0.18;
  const SPRINT_POWER = 0.62;

  const BROADCAST_INTERVAL = SYNC_CONFIG.broadcastInterval;
  const DB_SAVE_INTERVAL = SYNC_CONFIG.dbSaveInterval;

  const initialPosition = getInitialPosition(playerPosition, marker, BOUNDS);

  let x = initialPosition.x;
  let y = initialPosition.y;

  let angle =
    toFiniteNumber(playerPosition.angle) ??
    toFiniteNumber(playerPosition.direction) ??
    toFiniteNumber(marker.dataset.angle) ??
    0;

  let stamina = STAMINA.max;
  let sprintLocked = false;

  let activePointerId = null;
  let centerX = 0;
  let centerY = 0;

  let moveX = 0;
  let moveY = 0;

  let animationId = null;
  let destroyed = false;

  let lastBroadcastAt = 0;
  let lastDbSaveAt = 0;

  let dbSaveInFlight = false;
  let dbSavePending = false;

  let lastSentX = x;
  let lastSentY = y;
  let lastSentAngle = angle;

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

  function updateSprintState(isMoving) {
    const joystickPower = Math.hypot(moveX, moveY);

    const wantsSprint =
      isMoving &&
      joystickPower >= SPRINT_POWER &&
      !sprintLocked;

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

    return wantsSprint;
  }

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
    marker.dataset.x = String(x);
    marker.dataset.y = String(y);
    marker.dataset.angle = String(angle);
    marker.style.setProperty('--player-angle', `${angle}deg`);
  }

  function hasPositionChangedEnough() {
    return (
      Math.abs(x - lastSentX) > 0.002 ||
      Math.abs(y - lastSentY) > 0.002 ||
      Math.abs(angle - lastSentAngle) > 0.1
    );
  }

  function markPositionSent() {
    lastSentX = x;
    lastSentY = y;
    lastSentAngle = angle;
  }

  function broadcastMove(force = false) {
    const now = Date.now();

    if (!force && now - lastBroadcastAt < BROADCAST_INTERVAL) return;
    if (!force && !hasPositionChangedEnough()) return;

    lastBroadcastAt = now;

    movementChannel?.sendMove({
      playerId: getLocalPlayerId(),
      nickname,
      cityId,
      x,
      y,
      angle,
      updatedAt: new Date().toISOString(),
    });

    markPositionSent();
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
    } catch (error) {
      console.warn('[mobileJoystick] player position update failed:', error);
    } finally {
      dbSaveInFlight = false;

      if (dbSavePending && !destroyed) {
        savePositionToDb(false);
      }
    }
  }

  function resetStick() {
    moveX = 0;
    moveY = 0;

    stick.style.transform = 'translate(-50%, -50%) translate3d(0, 0, 0)';
  }

  function updateStick(clientX, clientY) {
    const dx = clientX - centerX;
    const dy = clientY - centerY;

    const rawDistance = Math.hypot(dx, dy);

    if (rawDistance <= 0.001) {
      resetStick();
      return;
    }

    const distance = Math.min(rawDistance, MAX_DISTANCE);
    const power = distance / MAX_DISTANCE;

    if (power < DEADZONE) {
      resetStick();
      return;
    }

    const inputX = dx / rawDistance;
    const inputY = dy / rawDistance;

    const worldInput = screenInputToWorldInput(inputX, inputY);

    moveX = worldInput.x * power;
    moveY = worldInput.y * power;

    angle = getAngleFromMovement(moveX, moveY, angle);
    syncPlayerPosition();

    stick.style.transform =
      `translate(-50%, -50%) translate3d(${inputX * distance}px, ${inputY * distance}px, 0)`;
  }

  function loop() {
    if (destroyed) return;

    const isMoving =
      Math.abs(moveX) > DEADZONE ||
      Math.abs(moveY) > DEADZONE;

    const isSprinting = updateSprintState(isMoving);

    const speed = isSprinting
      ? MOVEMENT_CONFIG.MOBILE_SPRINT_SPEED
      : MOVEMENT_CONFIG.MOBILE_WALK_SPEED;

    if (isMoving) {
      x += moveX * speed;
      y += moveY * speed;

      angle = getAngleFromMovement(moveX, moveY, angle);

      renderPlayer();
      broadcastMove(false);
      savePositionToDb(false);
    } else {
      syncPlayerPosition();
    }

    animationId = requestAnimationFrame(loop);
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

    activePointerId = null;

    resetStick();
    renderPlayer();

    broadcastMove(true);
    savePositionToDb(true);
  }

  function refreshJoystickCenter() {
    const rect = base.getBoundingClientRect();

    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
  }

  function onPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();

    activePointerId = event.pointerId;

    refreshJoystickCenter();
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
    updateStaminaUi();

    broadcastMove(true);
    savePositionToDb(true);
  }

  base.addEventListener('pointerdown', onPointerDown);
  base.addEventListener('pointermove', onPointerMove);
  base.addEventListener('pointerup', onPointerEnd);
  base.addEventListener('pointercancel', onPointerEnd);
  window.addEventListener('mn:player-teleported', onExternalTeleport);

  renderPlayer();
  updateStaminaUi();

  return () => {
    destroyed = true;

    base.removeEventListener('pointerdown', onPointerDown);
    base.removeEventListener('pointermove', onPointerMove);
    base.removeEventListener('pointerup', onPointerEnd);
    base.removeEventListener('pointercancel', onPointerEnd);
    window.removeEventListener('mn:player-teleported', onExternalTeleport);

    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    resetStick();
    renderPlayer();
    updateStaminaUi();

    joystick?.remove();
    staminaEl?.remove();

    broadcastMove(true);
    savePositionToDb(true);
  };
}
