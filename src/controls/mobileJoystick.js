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

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isMobileDevice() {
  return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

function screenInputToWorldInput(inputX, inputY) {
  return {
    x: inputX,
    y: inputY,
  };
}

function getAngleFromMovement(moveX, moveY, fallback = 0) {
  if (Math.abs(moveX) < 0.001 && Math.abs(moveY) < 0.001) return fallback;
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

  container.dataset.joystickActive = 'false';

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

  const base = container.querySelector('.mobile-joystick-base');
  const stick = container.querySelector('.mobile-joystick-stick');
  const staminaFill = container.querySelector('.mobile-stamina-fill');

  const STAMINA = getStaminaConfig();
  const BOUNDS = getMovementBounds();
  const SYNC = getMovementSyncConfig();

  const MAX_DISTANCE = 42;
  const DEADZONE = 0.08;
  const SPRINT_POWER = 0.62;

  let x = clamp(toNumber(playerPosition.x ?? marker.dataset.x, 50), BOUNDS.minX, BOUNDS.maxX);
  let y = clamp(toNumber(playerPosition.y ?? marker.dataset.y, 50), BOUNDS.minY, BOUNDS.maxY);
  let angle = toNumber(playerPosition.angle ?? playerPosition.direction ?? marker.dataset.angle, 0);

  let moveX = 0;
  let moveY = 0;

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
    marker.dataset.x = String(x);
    marker.dataset.y = String(y);
    marker.dataset.angle = String(angle);
    marker.style.setProperty('--player-angle', `${angle}deg`);

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

  function updateSprintState(isMoving, frameScale) {
    const power = Math.hypot(moveX, moveY);
    const wantsSprint = isMoving && power >= SPRINT_POWER && !sprintLocked;

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

  function broadcastMove(force = false) {
    const now = Date.now();

    if (!force && now - lastBroadcastAt < SYNC.broadcastInterval) return;

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
    const rect = base.getBoundingClientRect();

    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
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

    const world = screenInputToWorldInput(inputX, inputY);

    moveX = world.x * power;
    moveY = world.y * power;

    angle = getAngleFromMovement(moveX, moveY, angle);

    stick.style.transform =
      `translate(-50%, -50%) translate3d(${inputX * distance}px, ${inputY * distance}px, 0)`;
  }

  function loop(now = performance.now()) {
    if (destroyed) return;

    const delta = Math.min(34, Math.max(8, now - lastFrameAt));
    const frameScale = delta / 16.6667;

    lastFrameAt = now;

    const isMoving =
      Math.abs(moveX) > DEADZONE ||
      Math.abs(moveY) > DEADZONE;

    const isSprinting = updateSprintState(isMoving, frameScale);

    if (isMoving) {
      const speed = isSprinting
        ? MOVEMENT_CONFIG.MOBILE_SPRINT_SPEED
        : MOVEMENT_CONFIG.MOBILE_WALK_SPEED;

      x += moveX * speed * frameScale;
      y += moveY * speed * frameScale;

      angle = getAngleFromMovement(moveX, moveY, angle);

      renderPlayer();
      broadcastMove(false);
      savePositionToDb(false);
    }

    animationId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (animationId) return;

    lastFrameAt = performance.now();
    animationId = requestAnimationFrame(loop);
  }

  function stopInput() {
    activePointerId = null;
    container.dataset.joystickActive = 'false';

    resetStick();
    renderPlayer();

    broadcastMove(true);
    savePositionToDb(true);
  }

  function onPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();

    activePointerId = event.pointerId;
    container.dataset.joystickActive = 'true';

    measureJoystick();

    try {
      base.setPointerCapture(event.pointerId);
    } catch {}

    updateStick(event.clientX, event.clientY);
    startLoop();
  }

  function onPointerMove(event) {
    if (activePointerId === null) return;
    if (event.pointerId !== activePointerId) return;

    event.preventDefault();
    event.stopPropagation();

    updateStick(event.clientX, event.clientY);
  }

  function onPointerEnd(event) {
    if (activePointerId === null) return;
    if (event.pointerId !== activePointerId) return;

    event.preventDefault();
    event.stopPropagation();

    stopInput();
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

    resetStick();
    renderPlayer();

    broadcastMove(true);
    savePositionToDb(true);
  }

  base.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerEnd, { passive: false });
  window.addEventListener('pointercancel', onPointerEnd, { passive: false });

  window.addEventListener('mn:player-teleported', onExternalTeleport);

  renderPlayer();
  updateStaminaUi();
  resetStick();

  return () => {
    destroyed = true;

    base.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerEnd);

    window.removeEventListener('mn:player-teleported', onExternalTeleport);

    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    resetStick();
    renderPlayer();

    broadcastMove(true);
    savePositionToDb(true);

    container.innerHTML = '';
  };
}
