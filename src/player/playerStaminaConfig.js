export const PLAYER_STAMINA_CONFIG = {
  max: 100,

  sprintSpeedMultiplier: 1.75,
  walkSpeedMultiplier: 1,

  tiredSpeedMultiplier: 1,

  drainPerFrame: 0.34,
  recoverPerFrame: 0.055,

  emptyAt: 0,
  recoveredAt: 100,
};

export function getStaminaConfig() {
  return PLAYER_STAMINA_CONFIG;
}
