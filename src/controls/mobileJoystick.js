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

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isMobileDevice() {
  return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

function getAngleFromMovement(moveX, moveY, fallback = 0) {
  if (Math.abs(moveX) < 0.001 && Math.abs(moveY) < 0.001) return fallback;
  return Math.atan2(moveX, -moveY) * 180 / Math.PI;
}

/*
  ВАЖНО:
  На мобилке игровой экран у тебя повернут через CSS rotate(90deg).
  Джойстик НЕ двигает карту.
  Он двигает только координаты игрока: marker.style.left/top.
*/
function screenToWorld(inputX, inputY) {
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;

  if (!isPortrait) {
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

function getStartPosition(playerPosition, marker, bounds) {
  const x = clamp(
    num(playerPosition?.x, num(marker?.dataset?.x, 50)),
    bounds.minX,
    bounds.maxX
  );

  const y = clamp(
    num(playerPosition?.y, num(marker?.dataset?.y, 50)),
    bounds.minY,
    bounds.maxY
  );

  return { x, y };
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

  const joystickBase = container.querySelector('.mobile-joystick-base');
  const joystickStick = container.querySelector('.mobile-joystick-stick');
  const staminaFill = container.querySelector('.mobile-stamina-fill');

  const STAMINA = getStaminaConfig();
  const BOUNDS = getMovementBounds();
  const SYNC = getMovementSyncConfig();

  const MAX_STICK_DISTANCE = 42;
  const DEADZONE = 0.09;
  const SPRINT_POWER = 0.68;

  const start = getStartPosition(playerPosition, marker, BOUNDS);

  let x = start.x;
  let y = start.y;
  let angle = num(playerPosition?.angle, num(marker?.dataset?.angle, 0));

  let inputX = 0;
  let inputY = 0;

  let stamina = STAMINA.max;
  let sprintLocked = false;

  let activePointerId = null;
  let centerX = 0;
  let centerY = 0;

  let animationId = null;
  let destroyed = false;

  let lastFrameAt = performance.now();
  let lastBroadcastAt = 0;
  let lastDbSaveAt = 0;

  let dbSaveInFlight = false;
  let dbSavePending = false;

  let lastSentX = x;
  let lastSentY = y;
  let lastSentAngle = angle;

  function syncPositionObject() {
    playerPosition.x = x;
    playerPosition.y = y;
    playerPosition.angle = angle;
  }

  function renderPlayer() {
    x = clamp(x, BOUNDS.minX, BOUNDS.maxX);
    y = clamp(y, BOUNDS.minY, BOUNDS.maxY);

    syncPositionObject();

    marker.style.display = '';
    marker.style.opacity = '1';
    marker.style.visibility = 'visible';

    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;

    marker.dataset.x = String(x);
    marker.dataset.y = String(y);
    marker.dataset.angle = String(angle);

    marker.style.setProperty('--player-angle', `${angle}deg`);
  }

  function centerCameraOnce() {
    mapControls?.focusOnPlayer?.(x, y);
  }

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

  function updateStamina(isMoving, frameScale) {
    const power = Math.hypot(inputX, inputY);

    const wantsSprint =
      isMoving &&
      power >= SPRINT_POWER &&
      !sprintLocked;

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

  function changedEnough() {
    return (
      Math.abs(x - lastSentX) > 0.002 ||
      Math.abs(y - lastSentY) > 0.002 ||
      Math.abs(angle - lastSentAngle) > 0.1
    );
  }

  function markSent() {
    lastSentX = x;
    lastSentY = y;
    lastSentAngle = angle;
  }

  function broadcastMove(force = false) {
    const now = Date.now();

    if (!force && now - lastBroadcastAt < SYNC.broadcastInterval) return;
    if (!force && !changedEnough()) return;

    lastBroadcastAt = now;

    movementChannel?.sendMove?.({
      playerId: getLocalPlayerId(),
      nickname,
      cityId,
      x,
      y,
      angle,
      updatedAt: new Date().toISOString(),
    });

    markSent();
  }

  async function savePositionToDb(force = false) {
    const now = Date.now();

    if (!force && now - lastDbSaveAt < SYNC.dbSaveInterval) {
      dbSavePending = true;
      return;
    }

    if (dbSaveInFlight) {
      dbSavePending = true;
      return;
    }

    syncPositionObject();

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
      console.warn('[mobileJoystick] save failed:', error);
    } finally {
      dbSaveInFlight = false;

      if (dbSavePending && !destroyed) {
        savePositionToDb(false);
      }
    }
  }

  function measureJoystick() {
    const rect = joystickBase.getBoundingClientRect();

    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
  }

  function resetInput() {
    inputX = 0;
    inputY = 0;

    joystickStick.style.transform =
      'translate(-50%, -50%) translate3d(0, 0, 0)';
  }

  function updateInput(clientX, clientY) {
    const dx = clientX - centerX;
    const dy = clientY - centerY;

    const distance = Math.hypot(dx, dy);

    if (distance <= 0.001) {
      resetInput();
      return;
    }

    const limitedDistance = Math.min(distance, MAX_STICK_DISTANCE);
    const power = limitedDistance / MAX_STICK_DISTANCE;

    if (power < DEADZONE) {
      resetInput();
      return;
    }

    const screenX = dx / distance;
    const screenY = dy / distance;

    const world = screenToWorld(screenX, screenY);

    inputX = world.x * power;
    inputY = world.y * power;

    angle = getAngleFromMovement(inputX, inputY, angle);

    joystickStick.style.transform =
      `translate(-50%, -50%) translate3d(${screenX * limitedDistance}px, ${screenY * limitedDistance}px, 0)`;
  }

  function loop(now = performance.now()) {
    if (destroyed) return;

    const delta = Math.min(34, Math.max(8, now - lastFrameAt));
    const frameScale = delta / 16.6667;

    lastFrameAt = now;

    const isMoving =
      Math.abs(inputX) > DEADZONE ||
      Math.abs(inputY) > DEADZONE;

    const isSprinting = updateStamina(isMoving, frameScale);

    if (isMoving) {
      const speed = isSprinting
        ? MOVEMENT_CONFIG.MOBILE_SPRINT_SPEED
        : MOVEMENT_CONFIG.MOBILE_WALK_SPEED;

      x += inputX * speed * frameScale;
      y += inputY * speed * frameScale;

      angle = getAngleFromMovement(inputX, inputY, angle);

      renderPlayer();
      broadcastMove(false);
      savePositionToDb(false);
    } else {
      syncPositionObject();
    }

    if (isMoving || stamina < STAMINA.max || activePointerId !== null) {
      animationId = requestAnimationFrame(loop);
    } else {
      animationId = null;
    }
  }

  function startLoop() {
    if (animationId) return;

    lastFrameAt = performance.now();
    animationId = requestAnimationFrame(loop);
  }

  function finishInput() {
    activePointerId = null;

    container.dataset.joystickActive = 'false';

    resetInput();
    renderPlayer();

    broadcastMove(true);
    savePositionToDb(true);

    startLoop();
  }

  function onPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();

    activePointerId = event.pointerId;
    container.dataset.joystickActive = 'true';

    measureJoystick();

    try {
      joystickBase.setPointerCapture(event.pointerId);
    } catch {}

    updateInput(event.clientX, event.clientY);
    startLoop();
  }

  function onPointerMove(event) {
    if (activePointerId === null) return;
    if (event.pointerId !== activePointerId) return;

    event.preventDefault();
    event.stopPropagation();

    updateInput(event.clientX, event.clientY);
    startLoop();
  }

  function onPointerEnd(event) {
    if (activePointerId === null) return;
    if (event.pointerId !== activePointerId) return;

    event.preventDefault();
    event.stopPropagation();

    finishInput();
  }

  function onExternalTeleport(event) {
    const detail = event?.detail || {};

    const nextX = Number(detail.x);
    const nextY = Number(detail.y);
    const nextAngle = Number(detail.angle ?? angle);

    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;

    x = clamp(nextX, BOUNDS.minX, BOUNDS.maxX);
    y = clamp(nextY, BOUNDS.minY, BOUNDS.maxY);
    angle = Number.isFinite(nextAngle) ? nextAngle : angle;

    resetInput();
    renderPlayer();
    centerCameraOnce();

    broadcastMove(true);
    savePositionToDb(true);
  }

  joystickBase.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerEnd, { passive: false });
  window.addEventListener('pointercancel', onPointerEnd, { passive: false });

  window.addEventListener('mn:player-teleported', onExternalTeleport);

  renderPlayer();
  centerCameraOnce();
  updateStaminaUi();
  resetInput();

  return () => {
    destroyed = true;

    joystickBase.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerEnd);

    window.removeEventListener('mn:player-teleported', onExternalTeleport);

    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    resetInput();
    renderPlayer();

    broadcastMove(true);
    savePositionToDb(true);

    container.innerHTML = '';
  };
}
