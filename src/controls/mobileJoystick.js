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
  return (
    window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0
  );
}

function getViewportSize() {
  const width = Math.round(
    window.visualViewport?.width ||
    window.innerWidth ||
    document.documentElement.clientWidth ||
    window.screen?.width ||
    0
  );

  const height = Math.round(
    window.visualViewport?.height ||
    window.innerHeight ||
    document.documentElement.clientHeight ||
    window.screen?.height ||
    0
  );

  return { width, height };
}

function syncViewportSize() {
  const { width, height } = getViewportSize();

  if (width > 0) {
    document.documentElement.style.setProperty('--mn-vw', `${width}px`);
  }

  if (height > 0) {
    document.documentElement.style.setProperty('--mn-vh', `${height}px`);
  }

  syncMobileOrientationMode(width, height);
}

function syncMobileOrientationMode(width, height) {
  const html = document.documentElement;
  const body = document.body;

  if (!html || !body) return;

  const safeWidth = Number(width || 0);
  const safeHeight = Number(height || 0);
  const forceRotate = safeWidth > 0 && safeHeight > 0 && safeHeight >= safeWidth;
  const realLandscape = safeWidth > safeHeight;

  html.classList.toggle('mn-force-rotate-landscape', forceRotate);
  body.classList.toggle('mn-force-rotate-landscape', forceRotate);

  html.classList.toggle('mn-real-landscape', realLandscape);
  body.classList.toggle('mn-real-landscape', realLandscape);
}

function clearMobileOrientationMode() {
  const html = document.documentElement;
  const body = document.body;

  html?.classList.remove('mn-force-rotate-landscape', 'mn-real-landscape');
  body?.classList.remove('mn-force-rotate-landscape', 'mn-real-landscape');
}

async function requestLandscapeMode() {
  syncViewportSize();

  document.body?.classList.add('mn-mobile-game-enabled');

  try {
    window.Telegram?.WebApp?.expand?.();
    window.Telegram?.WebApp?.requestFullscreen?.();
  } catch {
    // Telegram WebApp может быть недоступен вне Mini App.
  }

  /*
    Не используем document.requestFullscreen() и screen.orientation.lock().
    В Telegram WebView они нестабильны: у части устройств после первого рендера
    остаётся только тёмный фон. Поворот делаем CSS-слоем, если viewport portrait.
  */

  window.dispatchEvent(new Event('resize'));
}

function getAngleFromMovement(moveX, moveY, fallback = 0) {
  if (Math.abs(moveX) < 0.001 && Math.abs(moveY) < 0.001) {
    return fallback;
  }

  return Math.atan2(moveX, -moveY) * 180 / Math.PI;
}

/*
  Фикс осей для твоего текущего forced-landscape.

  По факту сейчас:
  - тянешь вниз  -> игрок идёт влево
  - тянешь вправо -> игрок идёт вверх

  Значит визуальная сцена повернута относительно координат движения.
  Чтобы игрок шёл туда, куда ты тянешь с экрана, нужен такой перевод:

  screen down  -> world left
  screen up    -> world right
  screen right -> world up
  screen left  -> world down

  Да, выглядит странно, но именно так компенсируется текущий rotate(90deg).
*/
function joystickToMapVector(screenX, screenY) {
  return {
    x: screenY,
    y: -screenX,
  };
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

function getJoystickPower(moveX, moveY) {
  return Math.min(1, Math.hypot(moveX, moveY));
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

  container.classList.add('mn-mobile-controls');
  container.dataset.joystickActive = 'false';
  container.dataset.playerMoving = 'false';

  container.innerHTML = `
    <div class="mobile-joystick" data-mobile-joystick>
      <div class="mobile-joystick-base" data-mobile-joystick-base>
        <div class="mobile-joystick-stick" data-mobile-joystick-stick></div>
      </div>
    </div>

    <div class="mobile-stamina" data-mobile-stamina data-visible="false">
      <div class="mobile-stamina-label">STAMINA</div>
      <div class="mobile-stamina-track">
        <div class="mobile-stamina-fill" data-mobile-stamina-fill></div>
      </div>
    </div>
  `;

  const joystick = container.querySelector('[data-mobile-joystick]');
  const base = container.querySelector('[data-mobile-joystick-base]');
  const stick = container.querySelector('[data-mobile-joystick-stick]');
  const staminaBox = container.querySelector('[data-mobile-stamina]');
  const staminaFill = container.querySelector('[data-mobile-stamina-fill]');

  if (!base || !stick) return null;

  const STAMINA = getStaminaConfig();
  const BOUNDS = getMovementBounds();
  const SYNC_CONFIG = getMovementSyncConfig();

  const MAX_DISTANCE = 48;
  const DEADZONE = 0.055;
  const SPRINT_POWER = 0.62;

  /*
    Мобилка:
    сглаживаем input, камера быстрее догоняет игрока,
    а лишние DOM/DB обновления режем, чтобы убрать мини-телепорты.
  */
  const CAMERA_LAG = 0.5;
  const CAMERA_PAINT_EPSILON = 0.00045;

  /*
    Второй фикс плавности:
    координата игрока теперь не прыгает напрямую за джойстиком.
    Сначала сглаживаем input, потом velocity, потом отдельно render-позицию.
  */
  const INPUT_SMOOTHING = 0.18;
  const INPUT_STOP_EASING = 0.28;
  const VELOCITY_LERP = 0.16;
  const VELOCITY_STOP_LERP = 0.22;
  const RENDER_LAG = 0.42;
  const POSITION_PAINT_EPSILON = 0.00018;
  const MARKER_DATA_SYNC_INTERVAL = 180;

  const STAMINA_ARC_MAX_DEG = 165;
  const STAMINA_PAINT_INTERVAL = 95;

  /*
    Мобилка не должна спамить сетью/DB на каждом кадре.
    Движение остаётся 60fps локально, а синхра уходит реже — так меньше
    микрофризов и телефон меньше греется.
  */
  const BROADCAST_INTERVAL = Math.max(SYNC_CONFIG.broadcastInterval || 35, 95);
  const DB_SAVE_INTERVAL = Math.max(SYNC_CONFIG.dbSaveInterval || 1400, 2800);
  const HEARTBEAT_DELAY = Math.max(SYNC_CONFIG.heartbeatDelay || 1000, 2500);

  const initialPosition = getInitialPosition(playerPosition, marker, BOUNDS);

  let x = initialPosition.x;
  let y = initialPosition.y;

  let renderX = x;
  let renderY = y;

  let cameraX = x;
  let cameraY = y;

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
  let velocityX = 0;
  let velocityY = 0;
  let targetMoveX = 0;
  let targetMoveY = 0;

  let animationId = null;
  let heartbeatTimer = null;
  let destroyed = false;
  let lastFrameAt = performance.now();

  let lastCameraPaintX = Number.NaN;
  let lastCameraPaintY = Number.NaN;

  let lastMarkerPaintX = Number.NaN;
  let lastMarkerPaintY = Number.NaN;
  let lastMarkerPaintAngle = Number.NaN;
  let lastMarkerDataSyncAt = 0;

  let lastStaminaPaintAt = 0;
  let lastStaminaPercent = Number.NaN;
  let lastStaminaState = '';

  let lastBroadcastAt = 0;
  let lastDbSaveAt = 0;

  let dbSaveInFlight = false;
  let dbSavePending = false;

  let lastSentX = x;
  let lastSentY = y;
  let lastSentAngle = angle;

  function setMovingUi(isMoving) {
    const next = isMoving ? 'true' : 'false';

    if (container.dataset.playerMoving !== next) {
      container.dataset.playerMoving = next;
    }

    if (staminaBox && staminaBox.dataset.visible !== next) {
      staminaBox.dataset.visible = next;
    }
  }

  function updateStaminaUi(force = false) {
    if (!staminaFill) return;

    const percent = clamp((stamina / STAMINA.max) * 100, 0, 100);
    const arcAngle = (percent / 100) * STAMINA_ARC_MAX_DEG;

    let state = 'normal';

    if (sprintLocked) {
      state = 'locked';
    } else if (percent < 30) {
      state = 'low';
    }

    const now = performance.now();

    if (
      !force &&
      now - lastStaminaPaintAt < STAMINA_PAINT_INTERVAL &&
      Math.abs(percent - lastStaminaPercent) < 0.25 &&
      state === lastStaminaState
    ) {
      return;
    }

    lastStaminaPaintAt = now;
    lastStaminaPercent = percent;
    lastStaminaState = state;

    staminaFill.style.width = `${percent}%`;
    staminaFill.dataset.state = state;

    if (staminaBox) {
      staminaBox.style.setProperty('--mobile-stamina-percent', `${percent.toFixed(2)}%`);
      staminaBox.style.setProperty('--mobile-stamina-angle', `${arcAngle.toFixed(2)}deg`);
      staminaBox.dataset.staminaState = state;
    }
  }

  function updateSprintState(isMoving, frameScale) {
    const joystickPower = getJoystickPower(moveX, moveY);
    const wantsSprint = isMoving && joystickPower >= SPRINT_POWER && !sprintLocked;

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

  function syncPlayerPosition() {
    playerPosition.x = x;
    playerPosition.y = y;
    playerPosition.angle = angle;
  }

  function updateCamera(force = false) {
    const targetX = renderX;
    const targetY = renderY;

    if (force) {
      cameraX = targetX;
      cameraY = targetY;
    } else {
      cameraX += (targetX - cameraX) * CAMERA_LAG;
      cameraY += (targetY - cameraY) * CAMERA_LAG;
    }

    const shouldPaint =
      force ||
      Number.isNaN(lastCameraPaintX) ||
      Number.isNaN(lastCameraPaintY) ||
      Math.abs(cameraX - lastCameraPaintX) > CAMERA_PAINT_EPSILON ||
      Math.abs(cameraY - lastCameraPaintY) > CAMERA_PAINT_EPSILON;

    if (!shouldPaint) return;

    lastCameraPaintX = cameraX;
    lastCameraPaintY = cameraY;

    mapControls?.focusOnPlayer?.(cameraX, cameraY);
  }

  function renderPlayer(force = false) {
    x = clamp(x, BOUNDS.minX, BOUNDS.maxX);
    y = clamp(y, BOUNDS.minY, BOUNDS.maxY);
    renderX = clamp(renderX, BOUNDS.minX, BOUNDS.maxX);
    renderY = clamp(renderY, BOUNDS.minY, BOUNDS.maxY);

    syncPlayerPosition();

    const shouldPaintPosition =
      force ||
      Number.isNaN(lastMarkerPaintX) ||
      Number.isNaN(lastMarkerPaintY) ||
      Math.abs(renderX - lastMarkerPaintX) > POSITION_PAINT_EPSILON ||
      Math.abs(renderY - lastMarkerPaintY) > POSITION_PAINT_EPSILON;

    if (shouldPaintPosition) {
      marker.style.left = `${renderX}%`;
      marker.style.top = `${renderY}%`;
      lastMarkerPaintX = renderX;
      lastMarkerPaintY = renderY;
    }

    if (
      force ||
      Number.isNaN(lastMarkerPaintAngle) ||
      Math.abs(angle - lastMarkerPaintAngle) > 0.08
    ) {
      marker.style.setProperty('--player-angle', `${angle}deg`);
      lastMarkerPaintAngle = angle;
    }

    const now = performance.now();

    if (force || now - lastMarkerDataSyncAt >= MARKER_DATA_SYNC_INTERVAL) {
      marker.dataset.x = String(x);
      marker.dataset.y = String(y);
      marker.dataset.angle = String(angle);
      lastMarkerDataSyncAt = now;
    }
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

    movementChannel?.sendMove?.({
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


  function queuePositionSave(force = false) {
    if (force) {
      savePositionToDb(true);
      return;
    }

    const now = Date.now();

    if (now - lastDbSaveAt >= DB_SAVE_INTERVAL) {
      savePositionToDb(false);
    }
  }

  function isCameraSettled() {
    return (
      Math.abs(renderX - cameraX) <= CAMERA_PAINT_EPSILON &&
      Math.abs(renderY - cameraY) <= CAMERA_PAINT_EPSILON
    );
  }

  function isRenderSettled() {
    return (
      Math.abs(x - renderX) <= POSITION_PAINT_EPSILON &&
      Math.abs(y - renderY) <= POSITION_PAINT_EPSILON &&
      Math.abs(velocityX) <= 0.00005 &&
      Math.abs(velocityY) <= 0.00005 &&
      Math.abs(moveX) <= 0.0005 &&
      Math.abs(moveY) <= 0.0005
    );
  }

  function shouldSleepLoop(isMoving, wantsMove) {
    return (
      !isMoving &&
      !wantsMove &&
      activePointerId === null &&
      isRenderSettled() &&
      isCameraSettled() &&
      stamina >= STAMINA.max &&
      !sprintLocked
    );
  }

  function measureJoystick() {
    const rect = base.getBoundingClientRect();

    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
  }

  function resetStick(hard = false) {
    targetMoveX = 0;
    targetMoveY = 0;

    if (hard) {
      moveX = 0;
      moveY = 0;
      velocityX = 0;
      velocityY = 0;
      renderX = x;
      renderY = y;
    }

    setMovingUi(false);

    stick.style.transform =
      'translate(-50%, -50%) translate3d(0px, 0px, 0)';
  }

  function updateStick(clientX, clientY) {
    const dx = clientX - centerX;
    const dy = clientY - centerY;

    const rawDistance = Math.hypot(dx, dy);

    if (rawDistance <= 0.001) {
      resetStick(false);
      return;
    }

    const distance = Math.min(rawDistance, MAX_DISTANCE);
    const power = distance / MAX_DISTANCE;

    if (power < DEADZONE) {
      resetStick(false);
      return;
    }

    const screenX = dx / rawDistance;
    const screenY = dy / rawDistance;

    const corrected = joystickToMapVector(screenX, screenY);

    targetMoveX = corrected.x * power;
    targetMoveY = corrected.y * power;

    angle = getAngleFromMovement(targetMoveX, targetMoveY, angle);
    setMovingUi(true);

    /*
      ВАЖНО:
      Стик двигаем по экранному направлению, а игрока двигаем по corrected.
      Так палец видит нормальный джойстик, а координаты игры получают повернутый вектор.
    */
    stick.style.transform =
      `translate(-50%, -50%) translate3d(${screenX * distance}px, ${screenY * distance}px, 0)`;
  }

  function loop(now = performance.now()) {
    if (destroyed) return;

    const delta = Math.min(34, Math.max(8, now - lastFrameAt));
    const frameScale = delta / 16.6667;

    lastFrameAt = now;

    const wantsMove =
      Math.abs(targetMoveX) > DEADZONE ||
      Math.abs(targetMoveY) > DEADZONE;

    const inputLerp = 1 - Math.pow(1 - (wantsMove ? INPUT_SMOOTHING : INPUT_STOP_EASING), frameScale);

    moveX += (targetMoveX - moveX) * inputLerp;
    moveY += (targetMoveY - moveY) * inputLerp;

    const isSprinting = updateSprintState(wantsMove, frameScale);

    const speed = isSprinting
      ? MOVEMENT_CONFIG.MOBILE_SPRINT_SPEED
      : MOVEMENT_CONFIG.MOBILE_WALK_SPEED;

    const targetVelocityX = moveX * speed;
    const targetVelocityY = moveY * speed;
    const velocityLerp = 1 - Math.pow(1 - (wantsMove ? VELOCITY_LERP : VELOCITY_STOP_LERP), frameScale);

    velocityX += (targetVelocityX - velocityX) * velocityLerp;
    velocityY += (targetVelocityY - velocityY) * velocityLerp;

    if (!wantsMove && Math.abs(velocityX) < 0.00008) velocityX = 0;
    if (!wantsMove && Math.abs(velocityY) < 0.00008) velocityY = 0;

    const isMoving =
      wantsMove ||
      Math.abs(moveX) > 0.004 ||
      Math.abs(moveY) > 0.004 ||
      Math.abs(velocityX) > 0.00008 ||
      Math.abs(velocityY) > 0.00008 ||
      !isRenderSettled();

    setMovingUi(isMoving);

    if (isMoving) {
      x += velocityX * frameScale;
      y += velocityY * frameScale;
      x = clamp(x, BOUNDS.minX, BOUNDS.maxX);
      y = clamp(y, BOUNDS.minY, BOUNDS.maxY);

      if (x <= BOUNDS.minX || x >= BOUNDS.maxX) velocityX = 0;
      if (y <= BOUNDS.minY || y >= BOUNDS.maxY) velocityY = 0;

      const renderLerp = 1 - Math.pow(1 - RENDER_LAG, frameScale);
      renderX += (x - renderX) * renderLerp;
      renderY += (y - renderY) * renderLerp;

      if (Math.abs(renderX - x) <= POSITION_PAINT_EPSILON) renderX = x;
      if (Math.abs(renderY - y) <= POSITION_PAINT_EPSILON) renderY = y;

      angle = getAngleFromMovement(velocityX || moveX, velocityY || moveY, angle);

      renderPlayer(false);
      updateCamera(false);
      broadcastMove(false);
      queuePositionSave(false);
    } else {
      renderX = x;
      renderY = y;
      renderPlayer(false);
      updateCamera(false);
    }

    if (shouldSleepLoop(isMoving, wantsMove)) {
      animationId = null;
      updateStaminaUi(true);
      renderPlayer(true);
      updateCamera(true);
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

  function startHeartbeat() {
    clearInterval(heartbeatTimer);

    heartbeatTimer = setInterval(() => {
      if (destroyed) return;

      renderPlayer();
      updateCamera(false);
      broadcastMove(true);
      queuePositionSave(true);
    }, HEARTBEAT_DELAY);
  }

  function stopInput() {
    activePointerId = null;
    container.dataset.joystickActive = 'false';

    resetStick(false);
    renderPlayer(false);
    updateCamera(false);
    updateStaminaUi();
    broadcastMove(true);
    queuePositionSave(true);
    ensureLoopRunning();
  }

  function handleViewportChange() {
    syncViewportSize();
    mapControls?.refresh?.();
    updateCamera(true);

    if (activePointerId !== null) {
      measureJoystick();
    }
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

    activePointerId = null;

    resetStick(true);
    renderPlayer(true);
    updateCamera(true);
    broadcastMove(true);
    queuePositionSave(true);
  }

  function onPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();

    activePointerId = event.pointerId;
    container.dataset.joystickActive = 'true';

    measureJoystick();

    try {
      base.setPointerCapture(event.pointerId);
    } catch {
      // Не критично.
    }

    updateStick(event.clientX, event.clientY);
    ensureLoopRunning();
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

  base.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerEnd, { passive: false });
  window.addEventListener('pointercancel', onPointerEnd, { passive: false });
  window.addEventListener('resize', handleViewportChange, { passive: true });
  window.addEventListener('orientationchange', handleViewportChange, { passive: true });
  window.visualViewport?.addEventListener?.('resize', handleViewportChange, { passive: true });
  window.addEventListener('mn:player-teleported', onExternalTeleport);

  syncViewportSize();
  renderPlayer(true);
  updateCamera(true);
  updateStaminaUi();
  resetStick(true);
  startHeartbeat();
  ensureLoopRunning();

  return () => {
    destroyed = true;

    base.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerEnd);
    window.removeEventListener('resize', handleViewportChange);
    window.removeEventListener('orientationchange', handleViewportChange);
    window.visualViewport?.removeEventListener?.('resize', handleViewportChange);
    window.removeEventListener('mn:player-teleported', onExternalTeleport);

    clearInterval(heartbeatTimer);

    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    resetStick(true);
    renderPlayer(true);
    updateCamera(true);
    updateStaminaUi();
    broadcastMove(true);
    queuePositionSave(true);

    joystick?.remove();

    clearMobileOrientationMode();

    container.classList.remove('mn-mobile-controls');
    container.dataset.joystickActive = 'false';
    container.dataset.playerMoving = 'false';
    container.innerHTML = '';
  };
}


