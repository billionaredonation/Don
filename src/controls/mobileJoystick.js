import { getStaminaConfig } from '../player/playerStaminaConfig.js';
import { applyPlayerStaminaFrame, readPlayerStaminaState } from '../player/playerStaminaState.js';
import { MOVEMENT_CONFIG } from '../config/movement.js';
import { state as gameState } from '../state.js';

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

function getPositiveNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : fallback;
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

  /*
    Mobile render rewrite:
    self marker inside the huge map layer is no longer visually moved by left/top.
    The visible player dot is the fixed mobile overlay; the map camera moves around it.
    This removes the marker-vs-map desync that caused small visual jumps.
  */
  marker.classList.add('mn-mobile-local-player-marker');
  marker.dataset.mobileLocalPlayer = 'true';
  marker.style.transition = 'none';
  marker.style.willChange = 'auto';

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

    <button class="mobile-inventory-toggle" type="button" data-mobile-inventory-toggle aria-label="Открыть инвентарь">
      <span aria-hidden="true">🎒</span>
    </button>
  `;

  const joystick = container.querySelector('[data-mobile-joystick]');
  const base = container.querySelector('[data-mobile-joystick-base]');
  const stick = container.querySelector('[data-mobile-joystick-stick]');
  const staminaBox = container.querySelector('[data-mobile-stamina]');
  const staminaFill = container.querySelector('[data-mobile-stamina-fill]');
  const inventoryButton = container.querySelector('[data-mobile-inventory-toggle]');

  if (!base || !stick) return null;

  const STAMINA = getStaminaConfig();
  const configuredBounds = getMovementBounds();

  /*
    Координаты карты остаются полными 0..100, но центр 14px-маркера нельзя
    ставить ровно на 0/100: тогда половина игрока визуально выходит за карту.
    Небольшой mobile-only padding оставляет весь маркер внутри изображения,
    при этом камера по-прежнему доходит до края и останавливается там.
  */
  const MAP_EDGE_PADDING_PERCENT = 0.4;
  const BOUNDS = Object.freeze({
    minX: Math.max(configuredBounds.minX, MAP_EDGE_PADDING_PERCENT),
    maxX: Math.min(configuredBounds.maxX, 100 - MAP_EDGE_PADDING_PERCENT),
    minY: Math.max(configuredBounds.minY, MAP_EDGE_PADDING_PERCENT),
    maxY: Math.min(configuredBounds.maxY, 100 - MAP_EDGE_PADDING_PERCENT),
  });
  const SYNC_CONFIG = getMovementSyncConfig();

  const MAX_DISTANCE = 48;
  const DEADZONE = 0.052;
  const SPRINT_POWER = 0.62;

  /*
    Мобилка:
    сглаживаем input, камера быстрее догоняет игрока,
    а лишние DOM/DB обновления режем, чтобы убрать мини-телепорты.
  */
  const CAMERA_LAG = 1;
  const CAMERA_PAINT_EPSILON = 0.000001;

  /*
    Второй фикс плавности:
    координата игрока теперь не прыгает напрямую за джойстиком.
    Сначала сглаживаем input, потом velocity, потом отдельно render-позицию.
  */
  const INPUT_SMOOTHING = 0.34;
  const INPUT_STOP_EASING = 0.48;
  const VELOCITY_LERP = 0.38;
  const VELOCITY_STOP_LERP = 0.54;
  const RENDER_LAG = 0.78;
  const POSITION_PAINT_EPSILON = 0.00002;
  const MARKER_DATA_SYNC_INTERVAL = 180;

  const STAMINA_ARC_MAX_DEG = 165;
  const STAMINA_PAINT_INTERVAL = 95;

  /*
    Telegram WebView follows the phone refresh rate. On 90/120 Hz screens the
    old requestAnimationFrame loop rendered the whole moving map 90/120 times
    per second, although this top-down map does not need that many frames.
    A stable 30 fps keeps movement responsive and cuts the largest continuous
    GPU/CPU load by two to four times.
  */
  const MOBILE_TARGET_FRAME_MS = 1000 / 30;

  /*
    Мобилка не должна спамить сетью/DB на каждом кадре.
    Движение остаётся 60fps локально, а синхра уходит реже — так меньше
    микрофризов и телефон меньше греется.
  */
  const mobileStatsSpeed = getPositiveNumber(getMobileMoveSpeed(), 0.078);
  const MOBILE_WALK_SPEED = Math.max(
    getPositiveNumber(MOVEMENT_CONFIG.MOBILE_WALK_SPEED, 0.078),
    mobileStatsSpeed
  );
  const MOBILE_SPRINT_SPEED = Math.max(
    getPositiveNumber(MOVEMENT_CONFIG.MOBILE_SPRINT_SPEED, MOBILE_WALK_SPEED * 1.65),
    MOBILE_WALK_SPEED * getPositiveNumber(STAMINA.sprintSpeedMultiplier, 1.65)
  );

  const BROADCAST_INTERVAL = Math.max(SYNC_CONFIG.broadcastInterval || 35, 220);

  /*
    Самый важный фикс микрофризов:
    не пишем позицию в БД каждые 2–3 секунды. На мобилке это даёт короткий
    стоп кадра в Telegram WebView. Локальное движение и broadcast остаются живыми,
    а БД обновляется реже: при остановке/телепорте и страховочно раз в 12–22 сек.
  */
  const DB_SAVE_INTERVAL = Math.max(SYNC_CONFIG.dbSaveInterval || 1400, 22000);
  const HARD_DB_SAVE_INTERVAL = Math.max(SYNC_CONFIG.hardDbSaveInterval || 0, 45000);
  const HEARTBEAT_DELAY = Math.max(SYNC_CONFIG.heartbeatDelay || 1000, 16000);

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

  const initialStaminaState = readPlayerStaminaState();
  let stamina = initialStaminaState.value;
  let sprintLocked = initialStaminaState.locked;

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
  let loopTimer = null;
  let heartbeatTimer = null;
  let stickUpdateFrame = null;
  let pendingStickClientX = 0;
  let pendingStickClientY = 0;
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
  let lastRuntimeMovingState = null;
  let lastRuntimeSprintingState = null;

  let lastSentX = x;
  let lastSentY = y;
  let lastSentAngle = angle;

  let lastDbSavedX = x;
  let lastDbSavedY = y;
  let lastDbSavedAngle = angle;

  function setMobileRuntimeBusy(isMoving) {
    const now = performance.now();
    const moving = Boolean(isMoving);

    window.__MN_MOBILE_PLAYER_MOVING__ = moving;
    window.__MN_MOBILE_PLAYER_LAST_ACTIVE_AT__ = now;

    if (lastRuntimeMovingState !== moving) {
      lastRuntimeMovingState = moving;

      document.body?.classList?.toggle('mn-player-moving', moving);
      document.documentElement?.classList?.toggle('mn-player-moving', moving);

      if (document.body?.dataset) {
        document.body.dataset.mnPlayerMoving = moving ? 'true' : 'false';
      }
    }

    if (moving) {
      window.__MN_MOBILE_NETWORK_PAUSE_UNTIL__ = now + 1100;
    }
  }

  function setMobileRuntimeSprinting(isSprinting) {
    const sprinting = Boolean(isSprinting);
    if (lastRuntimeSprintingState === sprinting) return;
    lastRuntimeSprintingState = sprinting;
    window.__MN_MOBILE_PLAYER_SPRINTING__ = sprinting;
  }

  function setMovingUi(isMoving) {
    const next = isMoving ? 'true' : 'false';

    if (container.dataset.playerMoving !== next) {
      container.dataset.playerMoving = next;
    }

    if (staminaBox && staminaBox.dataset.visible !== next) {
      staminaBox.dataset.visible = next;
    }

    setMobileRuntimeBusy(isMoving);
  }

  function updateStaminaUi(force = false) {
    if (!staminaFill) return;

    const percent = clamp((stamina / STAMINA.max) * 100, 0, 100);
    const arcAngle = (percent / 100) * STAMINA_ARC_MAX_DEG;

    let staminaState = 'normal';

    if (sprintLocked || window.__MN_SPRINT_BLOCKED_BY_VITALS__ === true) {
      staminaState = 'locked';
    } else if (percent < 30) {
      staminaState = 'low';
    }

    const now = performance.now();

    if (
      !force &&
      now - lastStaminaPaintAt < STAMINA_PAINT_INTERVAL &&
      Math.abs(percent - lastStaminaPercent) < 0.25 &&
      staminaState === lastStaminaState
    ) {
      return;
    }

    lastStaminaPaintAt = now;
    lastStaminaPercent = percent;
    lastStaminaState = staminaState;

    staminaFill.style.width = `${percent}%`;
    staminaFill.dataset.state = staminaState;

    if (staminaBox) {
      staminaBox.style.setProperty('--mobile-stamina-percent', `${percent.toFixed(2)}%`);
      staminaBox.style.setProperty('--mobile-stamina-angle', `${arcAngle.toFixed(2)}deg`);
      staminaBox.dataset.staminaState = staminaState;
    }
  }

  function updateSprintState(isMoving, frameScale) {
    const joystickPower = getJoystickPower(moveX, moveY);
    const sprintBlockedByVitals = window.__MN_SPRINT_BLOCKED_BY_VITALS__ === true;
    const next = applyPlayerStaminaFrame({
      wantsSprint: isMoving && joystickPower >= SPRINT_POWER && !sprintBlockedByVitals,
      frameScale,
      water: gameState.player?.water,
      source: 'mobile',
    });
    stamina = next.value;
    sprintLocked = next.locked;
    if (next.spent > 0) {
      window.dispatchEvent(new CustomEvent('mn:player-stamina-spent', {
        detail: { source: 'mobile', amount: next.spent },
      }));
    }
    if (next.exhausted) {
      window.dispatchEvent(new CustomEvent('mn:player-stamina-exhausted', {
        detail: { source: 'mobile' },
      }));
    }
    if (next.recovered) {
      window.dispatchEvent(new CustomEvent('mn:player-stamina-recovered', {
        detail: { source: 'mobile' },
      }));
    }
    updateStaminaUi();
    return next.sprinting;
  }

  function handleSprintAvailabilityChanged() {
    updateStaminaUi(true);
    ensureLoopRunning();
  }

  function syncPlayerPosition() {
    playerPosition.x = x;
    playerPosition.y = y;
    playerPosition.angle = angle;
  }

  function updateCamera(force = false) {
    const targetX = renderX;
    const targetY = renderY;

    /*
      ВАЖНО ДЛЯ МОБИЛКИ:
      раньше маркер и камера имели две разные плавности. Из-за этого визуально
      казалось, что то карта, то маркер чуть подёргиваются. Теперь камера
      привязана к той же render-позиции, что и маркер: одна позиция = один кадр.
    */
    cameraX = targetX;
    cameraY = targetY;

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
      /*
        Do not move the visible mobile self marker with left/top each frame.
        On mobile the player is rendered as a fixed overlay in the center,
        while the map camera follows renderX/renderY. We keep the dataset fresh
        for interaction/network code, but avoid layout-position writes.
      */
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

      // Rare sync only for code that still reads CSS left/top, not for visual movement.
      if (force) {
        marker.style.left = `${x}%`;
        marker.style.top = `${y}%`;
      }

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

  function hasDbPositionChangedEnough() {
    return (
      Math.abs(x - lastDbSavedX) > 0.004 ||
      Math.abs(y - lastDbSavedY) > 0.004 ||
      Math.abs(angle - lastDbSavedAngle) > 0.25
    );
  }

  function markPositionSaved() {
    lastDbSavedX = x;
    lastDbSavedY = y;
    lastDbSavedAngle = angle;
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
      x: Math.round(x * 10000) / 10000,
      y: Math.round(y * 10000) / 10000,
      angle: Math.round(angle * 10) / 10,
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

    if (!force && !hasDbPositionChangedEnough()) {
      dbSavePending = false;
      return;
    }

    if (force && now - lastDbSaveAt < 900 && !hasDbPositionChangedEnough()) {
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
      markPositionSaved();
    } catch (error) {
      console.warn('[mobileJoystick] player position update failed:', error);
    } finally {
      dbSaveInFlight = false;

      /*
        Не запускаем рекурсивный save сразу после завершения запроса.
        Иначе при плохой сети можно получить пачку сохранений прямо во время кадра.
        Следующий обычный тик сам сохранит позицию, когда пройдёт DB_SAVE_INTERVAL.
      */
      if (dbSavePending && !destroyed) {
        dbSavePending = false;
      }
    }
  }


  function queuePositionSave(force = false) {
    const now = Date.now();

    if (force) {
      savePositionToDb(true);
      return;
    }

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
    setMobileRuntimeSprinting(false);

    stick.style.transform =
      'translate(-50%, -50%) translate3d(0px, 0px, 0)';
  }

  function scheduleStickUpdate(clientX, clientY) {
    pendingStickClientX = clientX;
    pendingStickClientY = clientY;

    if (stickUpdateFrame) return;

    stickUpdateFrame = requestAnimationFrame(() => {
      stickUpdateFrame = null;

      if (destroyed || activePointerId === null) return;

      updateStick(pendingStickClientX, pendingStickClientY);
    });
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
    animationId = null;

    if (destroyed) return;
    if (document.hidden) return;
    if (
      window.__MN_INTERIOR_ACTIVE__ === true ||
      window.__MN_PLAYER_CONTROLS_LOCKED__ === true
    ) {
      targetMoveX = 0; targetMoveY = 0; moveX = 0; moveY = 0;
      velocityX = 0; velocityY = 0;
      setMovingUi(false);
      setMobileRuntimeSprinting(false);
      animationId = null;
      return;
    }

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
    setMobileRuntimeSprinting(isSprinting);

    const speed = isSprinting
      ? MOBILE_SPRINT_SPEED
      : MOBILE_WALK_SPEED;

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
      const previousX = x;
      const previousY = y;
      x += velocityX * frameScale;
      y += velocityY * frameScale;
      x = clamp(x, BOUNDS.minX, BOUNDS.maxX);
      y = clamp(y, BOUNDS.minY, BOUNDS.maxY);

      if (x <= BOUNDS.minX || x >= BOUNDS.maxX) velocityX = 0;
      if (y <= BOUNDS.minY || y >= BOUNDS.maxY) velocityY = 0;

      if (RENDER_LAG >= 1) {
        renderX = x;
        renderY = y;
      } else {
        const renderLerp = 1 - Math.pow(1 - RENDER_LAG, frameScale);
        renderX += (x - renderX) * renderLerp;
        renderY += (y - renderY) * renderLerp;

        if (Math.abs(renderX - x) <= POSITION_PAINT_EPSILON) renderX = x;
        if (Math.abs(renderY - y) <= POSITION_PAINT_EPSILON) renderY = y;
      }

      angle = getAngleFromMovement(velocityX || moveX, velocityY || moveY, angle);

      if (!isSprinting && Math.hypot(x - previousX, y - previousY) > 0.000001) {
        window.dispatchEvent(new CustomEvent('mn:player-walking', {
          detail: { source: 'mobile', durationMs: delta },
        }));
      }

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

    scheduleLoopFrame();
  }

  function scheduleLoopFrame(immediate = false) {
    if (animationId || loopTimer || destroyed || document.hidden) return;

    const elapsed = performance.now() - lastFrameAt;
    const wait = immediate
      ? 0
      : Math.max(0, MOBILE_TARGET_FRAME_MS - elapsed);

    const requestFrame = () => {
      loopTimer = null;
      if (destroyed || document.hidden || animationId) return;
      animationId = requestAnimationFrame(loop);
    };

    if (wait <= 5) {
      requestFrame();
      return;
    }

    // Wake shortly before the target frame; requestAnimationFrame aligns the
    // actual paint with the display without keeping a full-rate RAF alive.
    loopTimer = window.setTimeout(requestFrame, Math.max(0, wait - 4));
  }

  function ensureLoopRunning(immediate = false) {
    if (immediate && loopTimer) {
      window.clearTimeout(loopTimer);
      loopTimer = null;
    }

    if (!animationId && !loopTimer && !destroyed && !document.hidden) {
      lastFrameAt = performance.now();
      scheduleLoopFrame(immediate);
    }
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }

      if (loopTimer) {
        window.clearTimeout(loopTimer);
        loopTimer = null;
      }

      activePointerId = null;
      resetStick(true);
      window.__MN_MOBILE_PLAYER_MOVING__ = false;
      return;
    }

    ensureLoopRunning(true);
  }

  function startHeartbeat() {
    clearInterval(heartbeatTimer);

    heartbeatTimer = setInterval(() => {
      if (destroyed) return;

      const now = performance.now();
      const playerIsActivelyMoving =
        window.__MN_MOBILE_PLAYER_MOVING__ === true ||
        Number(window.__MN_MOBILE_NETWORK_PAUSE_UNTIL__ || 0) > now;

      renderPlayer();
      updateCamera(false);

      // Во время активного движения не делаем тяжёлый force-broadcast/DB tick.
      // Обычный broadcastMove(false) уже идёт из игрового loop с throttling.
      if (!playerIsActivelyMoving) {
        broadcastMove(true);
      }

      // Страховочное сохранение в БД, но только когда игрок не двигается.
      if (
        !playerIsActivelyMoving &&
        Date.now() - lastDbSaveAt >= HARD_DB_SAVE_INTERVAL &&
        hasDbPositionChangedEnough()
      ) {
        queuePositionSave(false);
      }
    }, HEARTBEAT_DELAY);
  }

  function stopInput() {
    activePointerId = null;
    container.dataset.joystickActive = 'false';

    if (stickUpdateFrame) {
      cancelAnimationFrame(stickUpdateFrame);
      stickUpdateFrame = null;
    }

    resetStick(false);
    renderPlayer(false);
    updateCamera(false);
    updateStaminaUi();
    broadcastMove(true);
    queuePositionSave(true);
    window.__MN_MOBILE_PLAYER_MOVING__ = false;
    window.__MN_MOBILE_NETWORK_PAUSE_UNTIL__ = performance.now() + 350;
    ensureLoopRunning(true);
  }

  function handleViewportChange() {
    syncViewportSize();
    mapControls?.refresh?.();
    updateCamera(true);

    if (activePointerId !== null) {
      measureJoystick();
    }
  }

  function isHouseSpawnPickerActive() {
    return (
      window.__MN_HOUSE_SPAWN_PICKER_ACTIVE__ === true ||
      document.body?.classList?.contains('mn-house-spawn-open') ||
      document.documentElement?.classList?.contains('mn-house-spawn-open')
    );
  }

  function pauseForHouseSpawnPicker() {
    activePointerId = null;
    container.dataset.joystickActive = 'false';
    container.dataset.playerMoving = 'false';
    window.__MN_MOBILE_PLAYER_MOVING__ = false;
    window.__MN_MOBILE_NETWORK_PAUSE_UNTIL__ = performance.now() + 800;
    resetStick(true);
    updateStaminaUi();
  }

  function handlePlayerControlsLockChanged() {
    if (window.__MN_PLAYER_CONTROLS_LOCKED__ === true) {
      pauseForHouseSpawnPicker();
      return;
    }

    ensureLoopRunning(true);
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
    if (
      isHouseSpawnPickerActive() ||
      window.__MN_INTERIOR_ACTIVE__ === true ||
      window.__MN_PLAYER_CONTROLS_LOCKED__ === true
    ) {
      event.preventDefault();
      event.stopPropagation();
      pauseForHouseSpawnPicker();
      return;
    }

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
    ensureLoopRunning(true);
  }

  function onPointerMove(event) {
    if (activePointerId === null) return;
    if (event.pointerId !== activePointerId) return;

    if (isHouseSpawnPickerActive() || window.__MN_PLAYER_CONTROLS_LOCKED__ === true) {
      event.preventDefault();
      event.stopPropagation();
      pauseForHouseSpawnPicker();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    scheduleStickUpdate(event.clientX, event.clientY);
  }

  function onPointerEnd(event) {
    if (activePointerId === null) return;
    if (event.pointerId !== activePointerId) return;

    event.preventDefault();
    event.stopPropagation();

    stopInput();
  }

  function openMobileInventory(event) {
    event.preventDefault();
    event.stopPropagation();
    if (
      window.__MN_INTERIOR_ACTIVE__ === true ||
      window.__MN_PLAYER_CONTROLS_LOCKED__ === true ||
      isHouseSpawnPickerActive()
    ) return;
    stopInput();
    window.dispatchEvent(new CustomEvent('mn:inventory-toggle-request', {
      detail: { source: 'mobile-control' },
    }));
  }

  base.addEventListener('pointerdown', onPointerDown, { passive: false });
  inventoryButton?.addEventListener('click', openMobileInventory);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerEnd, { passive: false });
  window.addEventListener('pointercancel', onPointerEnd, { passive: false });
  window.addEventListener('resize', handleViewportChange, { passive: true });
  window.addEventListener('orientationchange', handleViewportChange, { passive: true });
  window.visualViewport?.addEventListener?.('resize', handleViewportChange, { passive: true });
  window.addEventListener('mn:player-teleported', onExternalTeleport);
  window.addEventListener('mn:house-spawn-picker-opened', pauseForHouseSpawnPicker);
  window.addEventListener('mn:player-sprint-availability-changed', handleSprintAvailabilityChanged);
  window.addEventListener('mn:player-controls-lock-changed', handlePlayerControlsLockChanged);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  syncViewportSize();
  renderPlayer(true);
  updateCamera(true);
  updateStaminaUi();
  resetStick(true);
  startHeartbeat();
  ensureLoopRunning();

  return () => {
    destroyed = true;
    window.__MN_MOBILE_PLAYER_MOVING__ = false;
    window.__MN_MOBILE_PLAYER_SPRINTING__ = false;
    window.__MN_MOBILE_NETWORK_PAUSE_UNTIL__ = 0;
    document.body?.classList?.remove('mn-player-moving');
    document.documentElement?.classList?.remove('mn-player-moving');

    if (document.body?.dataset) {
      document.body.dataset.mnPlayerMoving = 'false';
    }

    base.removeEventListener('pointerdown', onPointerDown);
    inventoryButton?.removeEventListener('click', openMobileInventory);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerEnd);
    window.removeEventListener('resize', handleViewportChange);
    window.removeEventListener('orientationchange', handleViewportChange);
    window.visualViewport?.removeEventListener?.('resize', handleViewportChange);
    window.removeEventListener('mn:player-teleported', onExternalTeleport);
    window.removeEventListener('mn:house-spawn-picker-opened', pauseForHouseSpawnPicker);
    window.removeEventListener('mn:player-sprint-availability-changed', handleSprintAvailabilityChanged);
    window.removeEventListener('mn:player-controls-lock-changed', handlePlayerControlsLockChanged);
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    clearInterval(heartbeatTimer);

    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    if (loopTimer) {
      window.clearTimeout(loopTimer);
      loopTimer = null;
    }

    if (stickUpdateFrame) {
      cancelAnimationFrame(stickUpdateFrame);
      stickUpdateFrame = null;
    }

    resetStick(true);
    renderPlayer(true);
    updateCamera(true);
    updateStaminaUi();
    broadcastMove(true);
    queuePositionSave(true);

    marker.classList.remove('mn-mobile-local-player-marker');
    delete marker.dataset.mobileLocalPlayer;
    marker.style.removeProperty('transition');
    marker.style.removeProperty('will-change');

    joystick?.remove();

    clearMobileOrientationMode();

    container.classList.remove('mn-mobile-controls');
    container.dataset.joystickActive = 'false';
    container.dataset.playerMoving = 'false';
    container.innerHTML = '';
  };
}
