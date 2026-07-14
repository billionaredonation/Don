const MOVEMENT_CONFIG = Object.freeze({
  keyboardSpeed: 0.09,
  mobileSpeed: 0.084,
  minX: 0,
  maxX: 100,
  minY: 0,
  maxY: 100,
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

const VITALS_CONFIG = Object.freeze({
  health: Object.freeze({
    min: 0,
    max: 100,
    defaultValue: 100,
    lowThreshold: 50,
  }),
  food: Object.freeze({
    min: 0,
    max: 100,
    defaultValue: 100,
  }),
  water: Object.freeze({
    min: 0,
    max: 100,
    defaultValue: 100,
  }),
});

export const PLAYER_STATS_CONFIG = Object.freeze({
  movement: MOVEMENT_CONFIG,
  sync: SYNC_CONFIG,
  skills: SKILLS_CONFIG,
  vitals: VITALS_CONFIG,
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
    minX: toFiniteNumber(MOVEMENT_CONFIG.minX, 0),
    maxX: toFiniteNumber(MOVEMENT_CONFIG.maxX, 100),
    minY: toFiniteNumber(MOVEMENT_CONFIG.minY, 0),
    maxY: toFiniteNumber(MOVEMENT_CONFIG.maxY, 100),
  };
}

export function getMovementSyncConfig() {
  return {
    broadcastInterval: toFiniteNumber(SYNC_CONFIG.broadcastInterval, 35),
    dbSaveInterval: toFiniteNumber(SYNC_CONFIG.dbSaveInterval, 1400),
    heartbeatDelay: toFiniteNumber(SYNC_CONFIG.heartbeatDelay, 1000),
  };
}

export function getPlayerVitalsConfig() {
  return {
    health: { ...VITALS_CONFIG.health },
    food: { ...VITALS_CONFIG.food },
    water: { ...VITALS_CONFIG.water },
  };
}
