import { state } from '../state.js';
import { applyPlayerPositionVitalCost } from './playerPosition.js';

const SURVIVAL_POLL_MS = 10_000;
const WALKING_METABOLIC_INTERVAL_MS = 30_000;
const WALKING_EVENT_MAX_MS = 1_000;
const WALKING_MAX_CATCHUP_INTERVALS = 10;
const AFK_METABOLIC_INTERVAL_MS = 5 * 60_000;
const SURVIVAL_MAX_CATCHUP_INTERVALS = 288;
const STARVATION_GRACE_MS = 0;
const STARVATION_DAMAGE_INTERVAL_MS = 30_000;
const STARVATION_DAMAGE_PER_INTERVAL = 5;
const STAMINA_USAGE_POINTS_PER_INTERVAL = 5;
const STAMINA_USAGE_POINT_EPSILON = 0.05;
const STAMINA_USAGE_MAX_CATCHUP_INTERVALS = 10;
const MOBILE_STAMINA_EXHAUSTION_FOOD_COST = 5;
const MOBILE_STAMINA_EXHAUSTION_WATER_COST = 5;
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

function isMobileStaminaEvent(event) {
  const source = String(event?.detail?.source || '').toLowerCase();

  if (source === 'mobile') return true;
  if (source !== 'interior') return false;

  return Boolean(
    window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches ||
    document.body?.classList.contains('mn-mobile-game-enabled') ||
    document.documentElement?.classList.contains('mn-mobile-device-detected')
  );
}

export function enablePlayerSurvivalFeature() {
  let destroyed = false;
  let tickInFlight = false;
  let staminaUsageInFlight = false;
  let staminaUsagePendingPoints = 0;
  let mobileStaminaExhaustionInFlight = false;
  let walkingUsageInFlight = false;
  let walkingUsagePendingMs = 0;
  let pollTimer = 0;
  let lastAfkChargeAt = Date.now();
  let starvationStartedAt = 0;
  let starvationLastDamageAt = 0;
  let sprintBlocked = false;

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
    if (destroyed || tickInFlight) return;
    tickInFlight = true;

    try {
      const now = Date.now();
      const metabolicIntervals = Math.min(
        SURVIVAL_MAX_CATCHUP_INTERVALS,
        Math.max(0, Math.floor((now - lastAfkChargeAt) / AFK_METABOLIC_INTERVAL_MS))
      );

      let canonicalResult = null;

      if (metabolicIntervals > 0) {
        const afkChargeThrough = lastAfkChargeAt
          + metabolicIntervals * AFK_METABOLIC_INTERVAL_MS;
        canonicalResult = await applyPlayerPositionVitalCost({
          foodCost: metabolicIntervals,
          waterCost: metabolicIntervals,
        });
        lastAfkChargeAt = Math.max(lastAfkChargeAt, afkChargeThrough);
        if (!destroyed) applyServerResult(canonicalResult || {}, 'afk_metabolism');
      } else {
        // Не доверяем только state.player: параллельная синхронизация могла
        // принести устаревшие показатели и бесконечно сбрасывать голодный
        // таймер. Нулевой cost читает фактические vitals из player_positions.
        canonicalResult = await applyPlayerPositionVitalCost();
        if (!destroyed) applyServerResult(canonicalResult || {}, 'survival_vitals_sync');
      }

      const vitals = {
        ...currentVitals(),
        ...resultVitals(canonicalResult || {}),
      };
      const starving = vitals.food <= 0 || vitals.water <= 0;

      if (!starving) {
        starvationStartedAt = 0;
        starvationLastDamageAt = 0;
        return;
      }

      if (!starvationStartedAt) {
        starvationStartedAt = now;
        starvationLastDamageAt = now;
        return;
      }

      const damageReadyAt = starvationStartedAt + STARVATION_GRACE_MS;
      if (now < damageReadyAt || vitals.health <= 10) return;

      const damageAnchor = Math.max(
        starvationLastDamageAt,
        damageReadyAt - STARVATION_DAMAGE_INTERVAL_MS
      );
      const damageIntervals = Math.max(
        0,
        Math.floor((now - damageAnchor) / STARVATION_DAMAGE_INTERVAL_MS)
      );

      if (!damageIntervals) return;

      const result = await applyPlayerPositionVitalCost({
        healthDamage: damageIntervals * STARVATION_DAMAGE_PER_INTERVAL,
        minimumHealth: 10,
      });
      starvationLastDamageAt = damageAnchor + damageIntervals * STARVATION_DAMAGE_INTERVAL_MS;
      if (!destroyed) applyServerResult(result || {}, 'starvation_damage');
    } catch (error) {
      console.warn('[playerSurvival] direct survival tick failed:', error);
    } finally {
      tickInFlight = false;
    }
  }

  async function processStaminaUsage() {
    if (destroyed || staminaUsageInFlight) return;

    const pendingPoints = Math.max(0, Number(staminaUsagePendingPoints) || 0);
    const intervals = Math.min(
      STAMINA_USAGE_MAX_CATCHUP_INTERVALS,
      Math.max(0, Math.floor(
        (pendingPoints + STAMINA_USAGE_POINT_EPSILON) / STAMINA_USAGE_POINTS_PER_INTERVAL
      ))
    );
    if (!intervals) return;

    const consumedPoints = Math.min(
      pendingPoints,
      intervals * STAMINA_USAGE_POINTS_PER_INTERVAL
    );

    staminaUsagePendingPoints = Math.max(0, staminaUsagePendingPoints - consumedPoints);
    staminaUsageInFlight = true;

    try {
      const result = await applyPlayerPositionVitalCost({
        foodCost: intervals,
        waterCost: intervals * 2,
      });
      if (!destroyed) applyServerResult(result || {}, 'stamina_usage');
    } catch (error) {
      staminaUsagePendingPoints += consumedPoints;
      if (!String(error?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSurvival] stamina usage sync failed:', error);
      }
    } finally {
      staminaUsageInFlight = false;

      if (
        !destroyed &&
        staminaUsagePendingPoints + STAMINA_USAGE_POINT_EPSILON >=
          STAMINA_USAGE_POINTS_PER_INTERVAL
      ) {
        queueMicrotask(() => void processStaminaUsage());
      }
    }
  }

  async function processMobileStaminaExhaustion() {
    if (destroyed || mobileStaminaExhaustionInFlight) return;
    mobileStaminaExhaustionInFlight = true;

    try {
      const result = await applyPlayerPositionVitalCost({
        foodCost: MOBILE_STAMINA_EXHAUSTION_FOOD_COST,
        waterCost: MOBILE_STAMINA_EXHAUSTION_WATER_COST,
      });
      if (!destroyed) applyServerResult(result || {}, 'mobile_stamina_exhaustion');
    } catch (error) {
      if (!String(error?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSurvival] mobile stamina exhaustion sync failed:', error);
      }
    } finally {
      mobileStaminaExhaustionInFlight = false;
    }
  }

  async function processWalkingUsage() {
    if (destroyed || walkingUsageInFlight) return;

    const pendingMs = Math.max(0, Number(walkingUsagePendingMs) || 0);
    const intervals = Math.min(
      WALKING_MAX_CATCHUP_INTERVALS,
      Math.max(0, Math.floor(pendingMs / WALKING_METABOLIC_INTERVAL_MS))
    );
    if (!intervals) return;

    const consumedMs = intervals * WALKING_METABOLIC_INTERVAL_MS;
    walkingUsagePendingMs = Math.max(0, walkingUsagePendingMs - consumedMs);
    walkingUsageInFlight = true;

    try {
      const result = await applyPlayerPositionVitalCost({
        foodCost: intervals,
        waterCost: intervals,
      });
      if (!destroyed) applyServerResult(result || {}, 'walking_metabolism');
    } catch (error) {
      walkingUsagePendingMs += consumedMs;
      if (!String(error?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSurvival] walking usage sync failed:', error);
      }
    } finally {
      walkingUsageInFlight = false;

      if (!destroyed && walkingUsagePendingMs >= WALKING_METABOLIC_INTERVAL_MS) {
        queueMicrotask(() => void processWalkingUsage());
      }
    }
  }

  function handleStaminaSpent(event) {
    const amount = finiteNumber(event?.detail?.amount);
    if (amount === null || amount <= 0) return;

    lastAfkChargeAt = Date.now();

    // На телефоне промежуточный расход стамины ничего не списывает.
    // Еда и вода снимаются одним щадящим платежом только при полном истощении.
    if (isMobileStaminaEvent(event)) return;

    staminaUsagePendingPoints = Math.min(
      STAMINA_USAGE_POINTS_PER_INTERVAL * STAMINA_USAGE_MAX_CATCHUP_INTERVALS * 4,
      staminaUsagePendingPoints + amount
    );
    if (
      staminaUsagePendingPoints + STAMINA_USAGE_POINT_EPSILON >=
      STAMINA_USAGE_POINTS_PER_INTERVAL
    ) {
      void processStaminaUsage();
    }
  }

  function handleStaminaExhausted(event) {
    if (isMobileStaminaEvent(event)) {
      lastAfkChargeAt = Date.now();
      void processMobileStaminaExhaustion();
      return;
    }

    void processStaminaUsage();
  }

  function handlePlayerWalking(event) {
    const durationMs = finiteNumber(event?.detail?.durationMs);
    if (durationMs === null || durationMs <= 0) return;

    lastAfkChargeAt = Date.now();
    walkingUsagePendingMs = Math.min(
      WALKING_METABOLIC_INTERVAL_MS * WALKING_MAX_CATCHUP_INTERVALS * 4,
      walkingUsagePendingMs + Math.min(WALKING_EVENT_MAX_MS, durationMs)
    );

    if (walkingUsagePendingMs >= WALKING_METABOLIC_INTERVAL_MS) {
      void processWalkingUsage();
    }
  }

  function handleVitalsChanged(event) {
    const detail = event?.detail || {};
    const snapshot = detail.vitals || detail.player || detail;
    syncSprintFromVitals(resultVitals(snapshot));
  }

  syncSprintFromVitals(currentVitals());
  window.addEventListener('mn:player-vitals-changed', handleVitalsChanged);
  window.addEventListener('mn:player-stamina-spent', handleStaminaSpent);
  window.addEventListener('mn:player-stamina-exhausted', handleStaminaExhausted);
  window.addEventListener('mn:player-walking', handlePlayerWalking);
  pollTimer = window.setInterval(processSurvival, SURVIVAL_POLL_MS);
  window.setTimeout(processSurvival, 1_200);

  return () => {
    destroyed = true;
    window.clearInterval(pollTimer);
    window.removeEventListener('mn:player-vitals-changed', handleVitalsChanged);
    window.removeEventListener('mn:player-stamina-spent', handleStaminaSpent);
    window.removeEventListener('mn:player-stamina-exhausted', handleStaminaExhausted);
    window.removeEventListener('mn:player-walking', handlePlayerWalking);
    window.__MN_SPRINT_BLOCKED_BY_VITALS__ = false;
  };
}
