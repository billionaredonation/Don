export const PLAYER_STATS_CONFIG = {
  movement: {
    keyboardSpeed: 0.096,
    mobileSpeed: 0.088,

    /*
      Не ставим 0–100.
      На PNG по краям много пустоты/воды/чёрного поля.
      Из-за этого камера центрирует игрока в пустоте, и кажется, что карта пропала.
    */
    minX: 12,
    maxX: 88,
    minY: 10,
    maxY: 90,
  },

  sync: {
    broadcastInterval: 35,
    dbSaveInterval: 1400,
    heartbeatDelay: 1000,
  },

  skills: {
    stamina: {
      level: 1,
      speedBonusPerLevel: 0.002,
      maxLevel: 100,
    },

    agility: {
      level: 1,
      controlBonusPerLevel: 0.002,
      maxLevel: 100,
    },
  },
};

export function getKeyboardMoveSpeed() {
  return PLAYER_STATS_CONFIG.movement.keyboardSpeed;
}

export function getMobileMoveSpeed() {
  return PLAYER_STATS_CONFIG.movement.mobileSpeed;
}

export function getMovementBounds() {
  return {
    minX: PLAYER_STATS_CONFIG.movement.minX,
    maxX: PLAYER_STATS_CONFIG.movement.maxX,
    minY: PLAYER_STATS_CONFIG.movement.minY,
    maxY: PLAYER_STATS_CONFIG.movement.maxY,
  };
}

export function getMovementSyncConfig() {
  return PLAYER_STATS_CONFIG.sync;
}
