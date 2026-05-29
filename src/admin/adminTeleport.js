import { updatePlayerPosition, getLocalPlayerId } from '../player/playerPosition.js';

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function applyMarkerPosition(marker, x, y, angle = 0) {
  if (!marker) return;

  marker.style.left = `${x}%`;
  marker.style.top = `${y}%`;
  marker.dataset.x = String(x);
  marker.dataset.y = String(y);
  marker.dataset.angle = String(angle);
  marker.style.setProperty('--player-angle', `${angle}deg`);
}

export function getCurrentPlayerPoint(playerMarker, playerPosition) {
  const markerX = Number(playerMarker?.dataset?.x);
  const markerY = Number(playerMarker?.dataset?.y);

  return {
    x: round(Number.isFinite(markerX) ? markerX : Number(playerPosition?.x || 50)),
    y: round(Number.isFinite(markerY) ? markerY : Number(playerPosition?.y || 50)),
  };
}

export async function teleportPlayerTo({
  playerMarker,
  playerPosition,
  cityId,
  nickname,
  mapControls,
  movementChannel,
  x,
  y,
}) {
  if (!playerMarker || !playerPosition || !cityId) return;

  const nextX = round(x);
  const nextY = round(y);
  const angle = Number(playerPosition.angle || playerMarker.dataset.angle || 0);

  playerPosition.x = nextX;
  playerPosition.y = nextY;
  playerPosition.angle = angle;

  applyMarkerPosition(playerMarker, nextX, nextY, angle);
  mapControls?.focusOnPlayer?.(nextX, nextY);

  window.dispatchEvent(new CustomEvent('mn:player-teleport', {
    detail: {
      x: nextX,
      y: nextY,
      angle,
    },
  }));

  movementChannel?.sendMove?.({
    playerId: getLocalPlayerId(),
    nickname,
    cityId,
    x: nextX,
    y: nextY,
    angle,
    updatedAt: new Date().toISOString(),
  });

  try {
    await updatePlayerPosition({
      cityId,
      nickname,
      x: nextX,
      y: nextY,
      angle,
    });
  } catch (error) {
    console.warn('[adminTeleport] teleport save failed:', error);
  }
}
