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

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isMobileDevice() {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

function getViewportHeight() {
  return Math.round(
    window.visualViewport?.height ||
    window.innerHeight ||
    document.documentElement.clientHeight ||
    window.screen?.height ||
    0
  );
}

function syncViewportSize() {
  const height = getViewportHeight();

  if (height > 0) {
    document.documentElement.style.setProperty('--mn-vh', `${height}px`);
  }
}

async function requestLandscapeMode() {
  syncViewportSize();

  document.body?.classList.add('mn-landscape-game');

  try {
    window.Telegram?.WebApp?.expand?.();
  } catch {
    // Telegram WebApp может быть недоступен вне Mini App
  }

  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Fullscreen часто запрещён браузером без жеста пользователя
  }

  try {
    await screen.orientation?.lock?.('landscape');
  } catch {
    // На iOS и части Telegram WebView orientation.lock не работает
  }
}

function getAngleFromMovement(moveX, moveY, fallback = 0) {
  if (Math.abs(moveX) < 0.001 && Math.abs(moveY) < 0.001) {
    return fallback;
  }

  return Math.atan2(moveX, -moveY) * 180 / Math.PI;
}

/*
  ВАЖНО:
  Для нормального landscape НИЧЕГО НЕ ПОВОРАЧИВАЕМ.
  Экранные координаты джойстика идут напрямую в координаты карты.

  left  -> x -
  right -> x +
  up    -> y -
  down  -> y +
*/
function joystickToMapVector(screenX, screenY) {
  return {
    x: screenX,
    y: screenY,
  };
}

function getInitialPosition(playerPosition, marker, bounds) {
  const x = clamp(
    number(playerPosition?.x ?? marker?.dataset?.x, 50),
    bounds.minX,
    bounds.maxX
  );

  const y = clamp(
    number(playerPosition?.y ?? marker?.dataset?.y, 50),
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

  requestLandscapeMode();

  window.addEventListener('resize', syncViewportSize);
  window.addEventListener('orientationchange', syncViewportSize);

  container.classList.add('mn-mobile-controls');
  container.dataset.joystickActive = 'false';

  container.innerHTML = `
    <div class="mn-mobile-joystick" data-mobile-joystick>
      <div class="mn-mobile-joystick-base" data-mobile-joystick-base>
        <div class="mn-mobile-joystick-stick" data-mobile-joystick-stick></div>
      </div>
    </div>

    <div class="mn-mobile-stamina" data-mobile-stamina>
      <div class="mn-mobile-stamina-label">STAMINA</div>
      <div class="mn-mobile-stamina-track">
        <div class="mn-mobile-stamina-fill" data-mobile-stamina-fill></div>
      </div>
    </div>
  `;

  const joystick = container.querySelector('[data-mobile-joystick]');
  const base = container.querySelector('[data-mobile-joystick-base]');
  const stick = container.querySelector('[data-mobile-joystick-stick]');
  const staminaFill = container.querySelector('[data-mobile-stamina-fill]');

  const STAMINA = getStaminaConfig();
  const BOUNDS = getMovementBounds();
  const SYNC = getMovementSyncConfig();

  const MAX_DISTANCE = 46;
  const DEADZONE = 0.07;
  const SPRINT_POWER = 0.64;
  const CAMERA_LAG = 0.22;

  const start = getInitialPosition(playerPosition, marker, BOUNDS);

  let x = start.x;
  let y = start.y;

  let cameraX = x;
  let cameraY = y;

  let angle = number(playerPosition?.angle ?? marker?.dataset?.angle, 0);

  let moveX = 0;
  let moveY = 0;

  let stamina = STAMINA.max;
  let sprintLocked = false;

  let pointerId = null;
  let centerX = 0;
  let centerY = 0;

  let raf = null;
  let heartbeatTimer = null;
  let destroyed = false;
  let lastFrame = performance.now();

  let lastBroadcast = 0;
  let lastDbSave = 0;
  let dbSaving = false;
  let dbPending = false;

  let lastSentX = x;
  let lastSentY = y;
  let lastSentAngle = angle;

  function syncPosition() {
    playerPosition.x = x;
    playerPosition.y = y;
    playerPosition.angle = angle;
  }

  function renderPlayer() {
    x = clamp(x, BOUNDS.minX, BOUNDS.maxX);
    y = clamp(y, BOUNDS.minY, BOUNDS.maxY);

    syncPosition();

    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    marker.dataset.x = String(x);
    marker.dataset.y = String(y);
    marker.dataset.angle = String(angle);
    marker.style.setProperty('--player-angle', `${angle}deg`);
  }

  function updateCamera(force = false) {
    if (force) {
      cameraX = x;
      cameraY = y;
    } else {
      cameraX += (x - cameraX) * CAMERA_LAG;
      cameraY += (y - cameraY) * CAMERA_LAG;
    }

    mapControls?.focusOnPlayer?.(cameraX, cameraY);
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
    const power = Math.hypot(moveX, moveY);
    const sprinting = isMoving && power >= SPRINT_POWER && !sprintLocked;

    if (sprinting) {
      stamina = Math.max(
        STAMINA.emptyAt,
        stamina - STAMINA.drainPerFrame * frameScale
      );

      if (stamina <= STAMINA.emptyAt) {
        stamina = STAMINA.emptyAt;
        sprintLocked = true;
      }
    } else {
      stamina = Math.min(
        STAMINA.max,
        stamina + STAMINA.recoverPerFrame * frameScale
      );

      if (stamina >= STAMINA.recoveredAt) {
        stamina = STAMINA.max;
        sprintLocked = false;
      }
    }

    updateStaminaUi();

    return sprinting;
  }

  function shouldBroadcast() {
    return (
      Math.abs(x - lastSentX) > 0.002 ||
      Math.abs(y - lastSentY) > 0.002 ||
      Math.abs(angle - lastSentAngle) > 0.1
    );
  }

  function broadcast(force = false) {
    const now = Date.now();

    if (!force && now - lastBroadcast < SYNC.broadcastInterval) return;
    if (!force && !shouldBroadcast()) return;

    lastBroadcast = now;

    movementChannel?.sendMove?.({
      playerId: getLocalPlayerId(),
      nickname,
      cityId,
      x,
      y,
      angle,
      updatedAt: new Date().toISOString(),
    });

    lastSentX = x;
    lastSentY = y;
    lastSentAngle = angle;
  }

  async function saveToDb(force = false) {
    const now = Date.now();

    if (!force && now - lastDbSave < SYNC.dbSaveInterval) {
      dbPending = true;
      return;
    }

    if (dbSaving) {
      dbPending = true;
      return;
    }

    dbSaving = true;
    dbPending = false;

    try {
      await updatePlayerPosition({
        cityId,
        nickname,
        x,
        y,
        angle,
      });

      lastDbSave = Date.now();
    } catch (error) {
      console.warn('[mobileJoystick] save failed:', error);
    } finally {
      dbSaving = false;

      if (dbPending && !destroyed) {
        saveToDb(false);
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
      'translate(-50%, -50%) translate3d(0px, 0px, 0)';
  }

  function updateInput(clientX, clientY) {
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

    const screenX = dx / rawDistance;
    const screenY = dy / rawDistance;

    const world = joystickToMapVector(screenX, screenY);

    moveX = world.x * power;
    moveY = world.y * power;

    angle = getAngleFromMovement(moveX, moveY, angle);

    stick.style.transform =
      `translate(-50%, -50%) translate3d(${screenX * distance}px, ${screenY * distance}px, 0)`;
  }

  function tick(now = performance.now()) {
    if (destroyed) return;

    const delta = Math.min(34, Math.max(8, now - lastFrame));
    const frameScale = delta / 16.6667;

    lastFrame = now;

    const moving =
      Math.abs(moveX) > DEADZONE ||
      Math.abs(moveY) > DEADZONE;

    const sprinting = updateStamina(moving, frameScale);

    if (moving) {
      const speed = sprinting
        ? MOVEMENT_CONFIG.MOBILE_SPRINT_SPEED
        : MOVEMENT_CONFIG.MOBILE_WALK_SPEED;

      x += moveX * speed * frameScale;
      y += moveY * speed * frameScale;

      angle = getAngleFromMovement(moveX, moveY, angle);

      renderPlayer();
      updateCamera(false);
      broadcast(false);
      saveToDb(false);
    } else {
      updateCamera(false);
    }

    raf = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (raf) return;

    lastFrame = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function startHeartbeat() {
    clearInterval(heartbeatTimer);

    heartbeatTimer = setInterval(() => {
      if (destroyed) return;

      renderPlayer();
      updateCamera(false);
      broadcast(true);
      saveToDb(true);
    }, SYNC.heartbeatDelay || 1000);
  }

  function stopInput() {
    pointerId = null;
    container.dataset.joystickActive = 'false';

    resetStick();
    renderPlayer();
    updateCamera(false);
    broadcast(true);
    saveToDb(true);
  }

  function onPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();

    pointerId = event.pointerId;
    container.dataset.joystickActive = 'true';

    measureJoystick();

    try {
      base.setPointerCapture(event.pointerId);
    } catch {
      // Не критично
    }

    updateInput(event.clientX, event.clientY);
    startLoop();
  }

  function onPointerMove(event) {
    if (pointerId === null) return;
    if (event.pointerId !== pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    updateInput(event.clientX, event.clientY);
  }

  function onPointerEnd(event) {
    if (pointerId === null) return;
    if (event.pointerId !== pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    stopInput();
  }

  function onTeleport(event) {
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
    updateCamera(true);
    broadcast(true);
    saveToDb(true);
  }

  base.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerEnd, { passive: false });
  window.addEventListener('pointercancel', onPointerEnd, { passive: false });
  window.addEventListener('mn:player-teleported', onTeleport);

  renderPlayer();
  updateCamera(true);
  updateStaminaUi();
  resetStick();
  startHeartbeat();

  return () => {
    destroyed = true;

    base.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerEnd);
    window.removeEventListener('mn:player-teleported', onTeleport);

    window.removeEventListener('resize', syncViewportSize);
    window.removeEventListener('orientationchange', syncViewportSize);

    clearInterval(heartbeatTimer);

    if (raf) {
      cancelAnimationFrame(raf);
    }

    resetStick();
    renderPlayer();
    updateCamera(true);
    broadcast(true);
    saveToDb(true);

    joystick?.remove();

    container.classList.remove('mn-mobile-controls');
    container.dataset.joystickActive = 'false';
    container.innerHTML = '';

    document.body?.classList.remove('mn-landscape-game');
  };
}
