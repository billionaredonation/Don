import {
  getLocalPlayerId,
  updatePlayerPosition,
} from '../player/playerPosition.js';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function enableKeyboardPlayerMovement(marker, playerPosition, cityId, nickname, movementChannel) {
  if (!marker || !playerPosition) return null;

  const keys = new Set();

  const SPEED = 0.12;
  const BROADCAST_INTERVAL = 5;
  const DB_SAVE_INTERVAL = 1000;
  const HEARTBEAT_DELAY = 700;

  let x = Number(playerPosition.x) || 50;
  let y = Number(playerPosition.y) || 50;

  let animationId = null;
  let heartbeatTimer = null;
  let destroyed = false;

  let lastBroadcastAt = 0;
  let lastDbSaveAt = 0;
  let dbSaveInFlight = false;
  let dbSavePending = false;

  function renderPlayer() {
    x = clamp(x, 0, 100);
    y = clamp(y, 0, 100);

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
      x,
      y,
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
        x,
        y,
      });

      lastDbSaveAt = Date.now();
    } catch (error) {
      console.warn('[keyboardMovement] player position update failed:', error);
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

  function loop() {
    if (destroyed) return;

    let moved = false;

    if (keys.has('w') || keys.has('ц') || keys.has('arrowup')) {
      y -= SPEED;
      moved = true;
    }

    if (keys.has('s') || keys.has('ы') || keys.has('arrowdown')) {
      y += SPEED;
      moved = true;
    }

    if (keys.has('a') || keys.has('ф') || keys.has('arrowleft')) {
      x -= SPEED;
      moved = true;
    }

    if (keys.has('d') || keys.has('в') || keys.has('arrowright')) {
      x += SPEED;
      moved = true;
    }

    if (moved) {
      renderPlayer();
      broadcastMove();
      savePositionToDb(false);
    }

    animationId = requestAnimationFrame(loop);
  }

  function onKeyDown(event) {
    const tag = document.activeElement?.tagName?.toLowerCase();

    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    const key = event.key.toLowerCase();

    const allowedKeys = [
      'w', 'a', 's', 'd',
      'ц', 'ф', 'ы', 'в',
      'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
    ];

    if (allowedKeys.includes(key)) {
      event.preventDefault();
      keys.add(key);

      if (!animationId) {
        animationId = requestAnimationFrame(loop);
      }
    }
  }

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());

    if (keys.size === 0 && animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;

      broadcastMove();
      savePositionToDb(true);
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  renderPlayer();
  savePositionToDb(true);
  startHeartbeat();

  return () => {
    destroyed = true;
    clearInterval(heartbeatTimer);

    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);

    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    broadcastMove();
    savePositionToDb(true);
  };
    }
