import { getStaminaConfig, getStaminaRecoveryPerFrame } from './playerStaminaConfig.js';

const SHARED_STAMINA_KEY = '__MN_PLAYER_SHARED_STAMINA__';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizedState(source = {}) {
  const config = getStaminaConfig();
  const rawValue = Number(source.value ?? source.stamina);

  return {
    value: clamp(Number.isFinite(rawValue) ? rawValue : config.max, config.emptyAt, config.max),
    locked: source.locked === true,
    source: String(source.source || 'initial'),
    updatedAt: Number(source.updatedAt) || Date.now(),
  };
}

export function readPlayerStaminaState() {
  const current = normalizedState(window[SHARED_STAMINA_KEY]);
  window[SHARED_STAMINA_KEY] = current;
  return { ...current };
}

export function writePlayerStaminaState(value, locked, source = 'unknown') {
  const next = normalizedState({ value, locked, source, updatedAt: Date.now() });
  window[SHARED_STAMINA_KEY] = next;
  return { ...next };
}

export function getPlayerStaminaRecoveredAt() {
  const config = getStaminaConfig();
  const mobile = Boolean(
    window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches ||
    navigator.maxTouchPoints > 0 ||
    document.body?.classList.contains('mn-mobile-game-enabled') ||
    document.documentElement?.classList.contains('mn-mobile-device-detected')
  );
  const configuredMobileValue = Number(config.mobileRecoveredAt);

  if (!mobile) return config.recoveredAt;

  return Math.min(
    config.max,
    Math.max(
      config.recoveredAt,
      Number.isFinite(configuredMobileValue) ? configuredMobileValue : config.max * 0.5
    )
  );
}

/*
 * The map and every interior use this single atomic stamina frame. Keeping the
 * drain/recovery here prevents two animation loops from writing stale local
 * values during the short enter/exit transition.
 */
export function applyPlayerStaminaFrame({
  wantsSprint = false,
  frameScale = 1,
  water = 100,
  source = 'unknown',
} = {}) {
  const config = getStaminaConfig();
  const previous = readPlayerStaminaState();
  let value = previous.value;
  let locked = previous.locked;
  const sprintRequested = wantsSprint === true && !locked;

  if (sprintRequested) {
    value = Math.max(
      config.emptyAt,
      value - config.drainPerFrame * Math.max(0, Number(frameScale) || 0)
    );
    if (value <= config.emptyAt) {
      value = config.emptyAt;
      locked = true;
    }
  } else {
    value = Math.min(
      config.max,
      value + getStaminaRecoveryPerFrame(water) * Math.max(0, Number(frameScale) || 0)
    );
    if (locked && value >= getPlayerStaminaRecoveredAt()) locked = false;
  }

  const next = writePlayerStaminaState(value, locked, source);
  return {
    ...next,
    spent: Math.max(0, previous.value - next.value),
    exhausted: previous.locked === false && next.locked === true,
    recovered: previous.locked === true && next.locked === false,
    sprinting: sprintRequested && next.locked === false,
  };
}
