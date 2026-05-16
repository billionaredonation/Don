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

export function enableMobileJoystick(
  container,
  marker,
  playerPosition,
  cityId,
  nickname,
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

  const SPEED = 0.16;
  const MAX_DISTANCE = 42;
  const BROADCAST_INTERVAL = 25;
  const DB_SAVE_INTERVAL = 1200;
  const HEARTBEAT_DELAY = 1000;

  let x = Number(playerPosition.x) || 50;
  let y = Number(playerPosition.y) || 50;

  playerPosition.x = x;
  playerPosition.y = y;

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
  }

  function renderPlayer() {
    x = clamp(x, 0, 100);
    y = clamp(y, 0, 100);

    syncPlayerPosition();

    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
  }

  function broadcastMove() {
    const now = Date.now();

    if (now - lastBroadcastAt < BROADCAST_INTERVAL) return;

    lastBroadcastAt = now;

    movementChannel?.sendMove({
      playerId: getLocalPlayerId(),
      nickname,
      cityId,
      x: playerPosition.x,
      y: playerPosition.y,
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
      savePositionToDb(true);
      broadcastMove();
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

    moveX = rotatedInput.x * power;
    moveY = rotatedInput.y * power;

    const visualInput = rotateInputForMobileScene(inputX, inputY);
    const stickX = visualInput.x * distance;
    const stickY = visualInput.y * distance;

    stick.style.transform =
      `translate(-50%, -50%) translate3d(${stickX}px, ${stickY}px, 0)`;
  }

  function loop() {
    if (destroyed) return;

    const isMoving =
      Math.abs(moveX) > 0.08 ||
      Math.abs(moveY) > 0.08;

    if (isMoving) {
      x += moveX * SPEED;
      y += moveY * SPEED;

      renderPlayer();
      broadcastMove();
      savePositionToDb(false);
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

    broadcastMove();
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

    joystick?.remove();

    renderPlayer();
    broadcastMove();
    savePositionToDb(true);
  };
}
