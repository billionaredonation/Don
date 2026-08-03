import { state } from '../state.js';
import {
  applyPlayerStaminaExhaustion,
  applyPlayerStaminaRecovery,
  applyPlayerSprintUsage,
  processPlayerSurvivalTick,
} from '../hospital/hospitalWarehouseFeature.js';
import { getStaminaRecoverySeconds } from './playerStaminaConfig.js';

const SURVIVAL_POLL_MS = 30_000;
const ACTIVITY_SAMPLE_MS = 1_000;
const ACTIVE_MEMORY_MS = 120_000;
const SPRINT_COST_INTERVAL_SECONDS = 2;
const STAMINA_RECOVERY_COST_INTERVAL_MS = 30_000;
const STAMINA_RECOVERY_DEADLINE_GRACE_MS = 30_000;
const STAMINA_RECOVERY_MAX_CATCHUP_INTERVALS = 10;
const CRITICAL_FOOD = 10;
const CRITICAL_WATER = 15;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resultVitals(result = {}) {
  const source = result?.vitals && typeof result.vitals === 'object'
    ? { ...result, ...result.vitals }
    : result;
  const vitals = {};

  ['health', 'food', 'water'].forEach((key) => {
    const value = finiteNumber(source?.[key]);
    if (value !== null) vitals[key] = Math.max(0, Math.min(100, value));
  });

  return vitals;
}

function currentVitals() {
  return {
    health: finiteNumber(state.player?.health) ?? 100,
    food: finiteNumber(state.player?.food) ?? 100,
    water: finiteNumber(state.player?.water) ?? 100,
  };
}

function hasTelegramSession() {
  return Boolean(String(window.Telegram?.WebApp?.initData || '').trim());
}

export function enablePlayerSurvivalFeature() {
  let destroyed = false;
  let tickInFlight = false;
  let sprintUsageInFlight = false;
  let staminaExhaustionInFlight = false;
  let staminaRecoveryInFlight = false;
  let staminaRecoveryFinishing = false;
  let staminaRecoveryActive = false;
  let staminaRecoveryLastChargeAt = 0;
  let staminaRecoveryDeadlineAt = 0;
  let sprintUsageSeconds = 0;
  let pollTimer = 0;
  let activityTimer = 0;
  let lastActiveAt = 0;
  let sprintBlocked = false;

  function isMovingNow() {
    return (
      window.__MN_DESKTOP_PLAYER_MOVING__ === true ||
      window.__MN_MOBILE_PLAYER_MOVING__ === true ||
      window.__MN_INTERIOR_PLAYER_MOVING__ === true
    );
  }

  function isSprintingNow() {
    if (document.hidden) return false;
    return (
      window.__MN_DESKTOP_PLAYER_SPRINTING__ === true ||
      window.__MN_MOBILE_PLAYER_SPRINTING__ === true ||
      window.__MN_INTERIOR_PLAYER_SPRINTING__ === true
    );
  }

  function publishSprintAvailability(nextBlocked) {
    const blocked = nextBlocked === true;
    const changed = blocked !== sprintBlocked;
    sprintBlocked = blocked;
    window.__MN_SPRINT_BLOCKED_BY_VITALS__ = blocked;

    if (changed) {
      window.dispatchEvent(new CustomEvent('mn:player-sprint-availability-changed', {
        detail: { allowed: !blocked, reason: blocked ? 'critical_vitals' : 'vitals_recovered' },
      }));
    }

  }

  function syncSprintFromVitals(vitals) {
    const snapshot = { ...currentVitals(), ...(vitals || {}) };
    publishSprintAvailability(
      snapshot.food < CRITICAL_FOOD || snapshot.water < CRITICAL_WATER
    );
  }

  function applyServerResult(result, source) {
    const vitals = resultVitals(result);

    if (Object.keys(vitals).length) {
      state.player = { ...(state.player || {}), ...vitals };
      window.dispatchEvent(new CustomEvent('mn:player-vitals-changed', {
        detail: {
          vitals,
          source,
          animateDamage: Number(result?.healthDamage || 0) > 0,
          result,
        },
      }));
    }

    const serverBlocked = typeof result?.sprintBlocked === 'boolean'
      ? result.sprintBlocked
      : null;
    if (serverBlocked !== null) publishSprintAvailability(serverBlocked);
    else syncSprintFromVitals(vitals);

    if (result?.hospitalizationRequired === true) {
      window.dispatchEvent(new CustomEvent('mn:player-hospitalization-required', {
        detail: { reason: 'starvation_or_dehydration', result },
      }));
    }
  }

  async function processSurvival() {
    if (destroyed || tickInFlight || !hasTelegramSession()) return;
    tickInFlight = true;

    try {
      const active = Date.now() - lastActiveAt <= ACTIVE_MEMORY_MS;
      const result = await processPlayerSurvivalTick({ active });
      if (!destroyed) applyServerResult(result || {}, 'survival_tick');
    } catch (error) {
      if (!String(error?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSurvival] survival tick failed:', error);
      }
    } finally {
      tickInFlight = false;
    }
  }

  async function processSprintUsage() {
    if (destroyed || sprintUsageInFlight || !hasTelegramSession()) return;
    sprintUsageInFlight = true;
    try {
      const result = await applyPlayerSprintUsage();
      if (!destroyed) applyServerResult(result || {}, 'sprint_usage');
    } catch (error) {
      sprintUsageSeconds = Math.max(sprintUsageSeconds, SPRINT_COST_INTERVAL_SECONDS);
      if (!String(error?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSurvival] sprint usage sync failed:', error);
      }
    } finally {
      sprintUsageInFlight = false;
    }
  }

  async function processStaminaExhaustion() {
    if (destroyed || staminaExhaustionInFlight || !hasTelegramSession()) return;
    staminaExhaustionInFlight = true;

    try {
      const result = await applyPlayerStaminaExhaustion();
      if (!destroyed) applyServerResult(result || {}, 'stamina_exhausted');
    } catch (error) {
      if (!String(error?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSurvival] stamina exhaustion sync failed:', error);
      }
    } finally {
      staminaExhaustionInFlight = false;
    }
  }

  async function processStaminaRecovery() {
    if (
      destroyed ||
      !staminaRecoveryActive ||
      staminaRecoveryInFlight ||
      !hasTelegramSession()
    ) return;

    const now = Date.now();
    const elapsedIntervals = Math.floor(
      (now - staminaRecoveryLastChargeAt) / STAMINA_RECOVERY_COST_INTERVAL_MS
    );
    const intervals = Math.min(
      STAMINA_RECOVERY_MAX_CATCHUP_INTERVALS,
      Math.max(0, elapsedIntervals)
    );

    if (!intervals) return;
    staminaRecoveryInFlight = true;

    try {
      const result = await applyPlayerStaminaRecovery(intervals);
      staminaRecoveryLastChargeAt += intervals * STAMINA_RECOVERY_COST_INTERVAL_MS;
      if (!destroyed) applyServerResult(result || {}, 'stamina_recovery');
    } catch (error) {
      if (!String(error?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSurvival] stamina recovery cost sync failed:', error);
      }
    } finally {
      staminaRecoveryInFlight = false;
    }
  }

  function handleStaminaExhausted() {
    const now = Date.now();

    if (!staminaRecoveryActive) {
      staminaRecoveryActive = true;
      staminaRecoveryLastChargeAt = now;
    }

    const recoveryMs = getStaminaRecoverySeconds(currentVitals().water) * 1000;
    staminaRecoveryDeadlineAt = Math.max(
      staminaRecoveryDeadlineAt,
      now + recoveryMs + STAMINA_RECOVERY_DEADLINE_GRACE_MS
    );

    void processStaminaExhaustion();
  }

  async function finishStaminaRecovery() {
    if (!staminaRecoveryActive || staminaRecoveryFinishing) return;
    staminaRecoveryFinishing = true;

    try {
      await processStaminaRecovery();
    } finally {
      staminaRecoveryActive = false;
      staminaRecoveryLastChargeAt = 0;
      staminaRecoveryDeadlineAt = 0;
      staminaRecoveryFinishing = false;
    }
  }

  function handleStaminaRecovered() {
    void finishStaminaRecovery();
  }

  function handleVitalsChanged(event) {
    const detail = event?.detail || {};
    const snapshot = detail.vitals || detail.player || detail;
    syncSprintFromVitals(resultVitals(snapshot));
  }

  function sampleActivity() {
    if (staminaRecoveryActive) {
      void processStaminaRecovery();
      if (Date.now() >= staminaRecoveryDeadlineAt) void finishStaminaRecovery();
    }

    if (isMovingNow()) lastActiveAt = Date.now();
    if (!isSprintingNow()) return;

    sprintUsageSeconds = Math.min(
      SPRINT_COST_INTERVAL_SECONDS,
      sprintUsageSeconds + ACTIVITY_SAMPLE_MS / 1000
    );
    if (sprintUsageSeconds < SPRINT_COST_INTERVAL_SECONDS) return;
    if (sprintUsageInFlight || !hasTelegramSession()) return;
    sprintUsageSeconds -= SPRINT_COST_INTERVAL_SECONDS;
    void processSprintUsage();
  }

  syncSprintFromVitals(currentVitals());
  window.addEventListener('mn:player-vitals-changed', handleVitalsChanged);
  window.addEventListener('mn:player-stamina-exhausted', handleStaminaExhausted);
  window.addEventListener('mn:player-stamina-recovered', handleStaminaRecovered);
  activityTimer = window.setInterval(sampleActivity, ACTIVITY_SAMPLE_MS);
  pollTimer = window.setInterval(processSurvival, SURVIVAL_POLL_MS);
  window.setTimeout(processSurvival, 1_200);

  return () => {
    destroyed = true;
    window.clearInterval(activityTimer);
    window.clearInterval(pollTimer);
    window.removeEventListener('mn:player-vitals-changed', handleVitalsChanged);
    window.removeEventListener('mn:player-stamina-exhausted', handleStaminaExhausted);
    window.removeEventListener('mn:player-stamina-recovered', handleStaminaRecovered);
    window.__MN_SPRINT_BLOCKED_BY_VITALS__ = false;
  };
}
