const MOVEMENT_CONFIG = Object.freeze({
  keyboardSpeed: 0.09,
  mobileSpeed: 0.084,
  minX: 12,
  maxX: 88,
  minY: 10,
  maxY: 90,
});

const SYNC_CONFIG = Object.freeze({
  broadcastInterval: 35,
  dbSaveInterval: 1400,
  heartbeatDelay: 1000,
});

const SKILLS_CONFIG = Object.freeze({
  stamina: Object.freeze({
    level: 1,
    speedBonusPerLevel: 0.002,
    maxLevel: 100,
  }),
  agility: Object.freeze({
    level: 1,
    controlBonusPerLevel: 0.002,
    maxLevel: 100,
  }),
});

export const PLAYER_STATS_CONFIG = Object.freeze({
  movement: MOVEMENT_CONFIG,
  sync: SYNC_CONFIG,
  skills: SKILLS_CONFIG,
});

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampSpeed(value, fallback) {
  const speed = toFiniteNumber(value, fallback);
  if (speed <= 0) return fallback;
  if (speed > 0.2) return 0.2;
  return speed;
}

export function getKeyboardMoveSpeed() {
  return clampSpeed(MOVEMENT_CONFIG.keyboardSpeed, 0.09);
}

export function getMobileMoveSpeed() {
  return clampSpeed(MOVEMENT_CONFIG.mobileSpeed, 0.084);
}

export function getMovementBounds() {
  return {
    minX: toFiniteNumber(MOVEMENT_CONFIG.minX, 12),
    maxX: toFiniteNumber(MOVEMENT_CONFIG.maxX, 88),
    minY: toFiniteNumber(MOVEMENT_CONFIG.minY, 10),
    maxY: toFiniteNumber(MOVEMENT_CONFIG.maxY, 90),
  };
}

export function getMovementSyncConfig() {
  return {
    broadcastInterval: toFiniteNumber(SYNC_CONFIG.broadcastInterval, 35),
    dbSaveInterval: toFiniteNumber(SYNC_CONFIG.dbSaveInterval, 1400),
    heartbeatDelay: toFiniteNumber(SYNC_CONFIG.heartbeatDelay, 1000),
  };
}
