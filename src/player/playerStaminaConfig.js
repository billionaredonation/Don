export const PLAYER_STAMINA_CONFIG = {
  max: 100,
  drainPerFrame: 0.18,
  recoverPerFrame: 0.28,

  normalSpeedMultiplier: 1,
  tiredSpeedMultiplier: 0.32,

  tiredAt: 5,
  recoveredAt: 35,
};

export function getStaminaConfig() {
  return PLAYER_STAMINA_CONFIG;
}
