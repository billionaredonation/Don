export const PLAYER_STAMINA_CONFIG = {
  max: 100,

  sprintSpeedMultiplier: 1.75,
  walkSpeedMultiplier: 1,

  tiredSpeedMultiplier: 1,

  drainPerFrame: 0.34,
  // Full recovery now takes 3-5 minutes instead of a few seconds. Hydration
  // chooses the point inside that range, so drinking water has a real gameplay
  // benefit without instantly refilling stamina.
  recoverySecondsHydrated: 180,
  recoverySecondsNormal: 240,
  recoverySecondsThirsty: 300,
  recoverPerFrame: 100 / (240 * 60),

  emptyAt: 0,
  // ПК после истощения снова получает спринт почти сразу — его режим не меняем.
  recoveredAt: 1,
  // На мобильном спринт возвращается только после восстановления половины шкалы.
  mobileRecoveredAt: 50,
};

export function getStaminaConfig() {
  return PLAYER_STAMINA_CONFIG;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getStaminaRecoverySeconds(waterValue = 100) {
  const water = clamp(Number.isFinite(Number(waterValue)) ? Number(waterValue) : 100, 0, 100);
  const {
    recoverySecondsHydrated,
    recoverySecondsNormal,
    recoverySecondsThirsty,
  } = PLAYER_STAMINA_CONFIG;

  if (water >= 60) {
    const hydration = (water - 60) / 40;
    return recoverySecondsNormal - hydration * (recoverySecondsNormal - recoverySecondsHydrated);
  }

  if (water >= 15) {
    const hydration = (water - 15) / 45;
    return recoverySecondsThirsty - hydration * (recoverySecondsThirsty - recoverySecondsNormal);
  }

  return recoverySecondsThirsty;
}

export function getStaminaRecoveryPerFrame(waterValue = 100) {
  return PLAYER_STAMINA_CONFIG.max / (getStaminaRecoverySeconds(waterValue) * 60);
}
