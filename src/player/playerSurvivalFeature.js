import { state } from '../state.js';
import {
  applyPlayerStaminaExhaustion,
  processPlayerSurvivalTick,
} from '../hospital/hospitalWarehouseFeature.js';

const SURVIVAL_POLL_MS = 30_000;
const ACTIVITY_SAMPLE_MS = 1_000;
const ACTIVE_MEMORY_MS = 120_000;
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

function toast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
}

function hasTelegramSession() {
  return Boolean(String(window.Telegram?.WebApp?.initData || '').trim());
}

export function enablePlayerSurvivalFeature() {
  let destroyed = false;
  let tickInFlight = false;
  let exhaustionInFlight = false;
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

  function publishSprintAvailability(nextBlocked, { notify = false } = {}) {
    const blocked = nextBlocked === true;
    const changed = blocked !== sprintBlocked;
    sprintBlocked = blocked;
    window.__MN_SPRINT_BLOCKED_BY_VITALS__ = blocked;

    if (changed) {
      window.dispatchEvent(new CustomEvent('mn:player-sprint-availability-changed', {
        detail: { allowed: !blocked, reason: blocked ? 'critical_vitals' : 'vitals_recovered' },
      }));
    }

    if (notify && changed) {
      toast(
        blocked
          ? 'Попейте и поешьте, чтобы вернуть быстрый бег и не терять здоровье.'
          : 'Еда и вода восстановлены — быстрый бег снова доступен.',
        blocked ? 'warning' : 'success'
      );
    }
  }

  function syncSprintFromVitals(vitals, options = {}) {
    const snapshot = { ...currentVitals(), ...(vitals || {}) };
    publishSprintAvailability(
      snapshot.food < CRITICAL_FOOD || snapshot.water < CRITICAL_WATER,
      options
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
    if (serverBlocked !== null) publishSprintAvailability(serverBlocked, { notify: true });
    else syncSprintFromVitals(vitals, { notify: true });

    if (Number(result?.healthDamage || 0) > 0) {
      toast(`Голод и обезвоживание отняли ${Number(result.healthDamage)} HP. Осталось ${Math.round(Number(result.health ?? vitals.health ?? 0))} HP.`, 'error');
    }

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

  async function handleStaminaExhausted() {
    toast('Стамина закончилась. Попейте воды — так она восстановится быстрее.', 'warning');
    if (destroyed || exhaustionInFlight || !hasTelegramSession()) return;
    exhaustionInFlight = true;

    try {
      const result = await applyPlayerStaminaExhaustion();
      if (!destroyed) applyServerResult(result || {}, 'stamina_exhausted');
    } catch (error) {
      if (!String(error?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSurvival] stamina exhaustion sync failed:', error);
      }
    } finally {
      exhaustionInFlight = false;
    }
  }

  function handleVitalsChanged(event) {
    const detail = event?.detail || {};
    const snapshot = detail.vitals || detail.player || detail;
    syncSprintFromVitals(resultVitals(snapshot), { notify: true });
  }

  function sampleActivity() {
    if (isMovingNow()) lastActiveAt = Date.now();
  }

  syncSprintFromVitals(currentVitals());
  window.addEventListener('mn:player-stamina-exhausted', handleStaminaExhausted);
  window.addEventListener('mn:player-vitals-changed', handleVitalsChanged);
  activityTimer = window.setInterval(sampleActivity, ACTIVITY_SAMPLE_MS);
  pollTimer = window.setInterval(processSurvival, SURVIVAL_POLL_MS);
  window.setTimeout(processSurvival, 1_200);

  return () => {
    destroyed = true;
    window.clearInterval(activityTimer);
    window.clearInterval(pollTimer);
    window.removeEventListener('mn:player-stamina-exhausted', handleStaminaExhausted);
    window.removeEventListener('mn:player-vitals-changed', handleVitalsChanged);
    window.__MN_SPRINT_BLOCKED_BY_VITALS__ = false;
  };
}
