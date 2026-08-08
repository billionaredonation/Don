import { getStaminaConfig } from './playerStaminaConfig.js';

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
