import './playerStatusEffects.css';
import { state } from '../state.js';

const TICK_MS = 90;
const HEAL_EMIT_MS = 135;
const DAMAGE_EMIT_MS = 95;
const CONSUMPTION_EMIT_MS = 115;
const DAMAGE_ACTIVITY_MS = 950;
const TREATMENT_WATCHDOG_MS = 90000;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function isElementVisible(element) {
  if (!element || !element.isConnected) return false;
  const styles = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return (
    styles.display !== 'none' &&
    styles.visibility !== 'hidden' &&
    Number(styles.opacity || 1) > 0 &&
    rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= window.innerHeight &&
    rect.left <= window.innerWidth
  );
}

function findLocalPlayerMarker() {
  if (window.__MN_INTERIOR_ACTIVE__ === true) {
    const interiorMarker = document.querySelector('.mn-interior-player[data-interior-player]');
    if (isElementVisible(interiorMarker)) return interiorMarker;
  }

  const hardMobileMarker = document.querySelector('[data-mobile-self-marker-hard="true"]');
  if (isElementVisible(hardMobileMarker)) return hardMobileMarker;

  const mobileMarker = document.querySelector('.mobile-self-player-indicator');
  if (isElementVisible(mobileMarker)) return mobileMarker;

  const mapMarker = document.querySelector('.gta-player-marker-self');
  return isElementVisible(mapMarker) ? mapMarker : null;
}

function healthFromEvent(event, fallback) {
  const detail = event?.detail || {};
  const sources = [
    detail.vitals,
    detail.player,
    detail.payload?.record,
    detail.payload?.new_record,
    detail.payload?.new,
    detail,
  ];

  for (const source of sources) {
    if (!source) continue;
    for (const field of ['health', 'hp', 'healthPoints', 'health_points']) {
      const value = finiteNumber(source[field]);
      if (value !== null) return value;
    }
  }

  const delta = finiteNumber(detail.delta);
  return delta !== null && fallback !== null ? fallback + delta : null;
}

function consumptionKind(itemType) {
  const normalized = String(itemType || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'water' || normalized === 'drink' || normalized.includes('water') || normalized.includes('drink')) {
    return 'water';
  }
  if (normalized === 'food' || normalized.includes('food') || normalized.includes('meal')) return 'food';
  return '';
}

export function enablePlayerStatusEffects() {
  document.querySelectorAll('[data-player-status-effects]').forEach((element) => element.remove());

  const layer = document.createElement('div');
  layer.className = 'mn-player-status-effects';
  layer.dataset.playerStatusEffects = 'true';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  let destroyed = false;
  let treatmentActive = false;
  let treatmentWatchdog = 0;
  let damageUntil = 0;
  let activeConsumption = '';
  let lastHealth = finiteNumber(state.player?.health ?? state.player?.hp);
  let nextHealAt = 0;
  let nextDamageAt = 0;
  let nextConsumptionAt = 0;

  function clearParticles(kind = '') {
    const selector = kind
      ? `.mn-player-status-particle[data-kind="${CSS.escape(kind)}"]`
      : '.mn-player-status-particle';
    layer.querySelectorAll(selector).forEach((particle) => particle.remove());
  }

  function setTreatmentActive(active, watchdogMs = TREATMENT_WATCHDOG_MS) {
    treatmentActive = active === true;
    window.clearTimeout(treatmentWatchdog);
    treatmentWatchdog = 0;

    if (!treatmentActive) {
      clearParticles('heal');
      return;
    }

    nextHealAt = 0;
    treatmentWatchdog = window.setTimeout(() => setTreatmentActive(false), Math.max(5000, watchdogMs));
  }

  function setConsumption(active, kind) {
    const nextKind = active === true ? consumptionKind(kind) : '';
    if (activeConsumption && activeConsumption !== nextKind) clearParticles(activeConsumption);
    activeConsumption = nextKind;
    nextConsumptionAt = 0;
    if (activeConsumption) {
      emit(activeConsumption, 4);
    } else {
      clearParticles('food');
      clearParticles('water');
    }
  }

  function positionLayer() {
    const marker = findLocalPlayerMarker();
    if (!marker) {
      layer.hidden = true;
      return false;
    }

    const rect = marker.getBoundingClientRect();
    const markerHasSize = rect.width > 1 || rect.height > 1;
    const centerX = markerHasSize ? rect.left + rect.width / 2 : rect.left;
    const centerY = markerHasSize ? rect.top + rect.height / 2 : rect.top;
    layer.style.setProperty('--mn-player-fx-x', `${Math.round(centerX * 10) / 10}px`);
    layer.style.setProperty('--mn-player-fx-y', `${Math.round(centerY * 10) / 10}px`);
    layer.hidden = false;
    return true;
  }

  function spawnParticle(kind, index = 0) {
    if (!positionLayer()) return;

    const particle = document.createElement('i');
    const angle = randomBetween(0, Math.PI * 2);
    const distance = kind === 'heal'
      ? randomBetween(24, 54)
      : kind === 'damage'
        ? randomBetween(20, 45)
        : randomBetween(16, 38);
    const x = Math.cos(angle) * distance;
    const baseY = Math.sin(angle) * distance;
    const y = kind === 'food'
      ? Math.abs(baseY) * 0.7 + 9
      : kind === 'water'
        ? Math.abs(baseY) + 12
        : baseY - randomBetween(5, 18);
    const duration = reducedMotion
      ? randomBetween(500, 650)
      : kind === 'heal'
        ? randomBetween(720, 1050)
        : randomBetween(540, 820);

    particle.className = 'mn-player-status-particle';
    particle.dataset.kind = kind;
    if (kind === 'heal' || kind === 'damage') particle.textContent = '+';
    particle.style.setProperty('--mn-fx-dx', `${x.toFixed(1)}px`);
    particle.style.setProperty('--mn-fx-dy', `${y.toFixed(1)}px`);
    particle.style.setProperty('--mn-fx-rotation', `${Math.round(randomBetween(-150, 150))}deg`);
    particle.style.setProperty('--mn-fx-duration', `${Math.round(duration)}ms`);
    particle.style.setProperty('--mn-fx-delay', `${Math.min(index * 18, 54)}ms`);
    particle.style.setProperty('--mn-fx-scale', randomBetween(0.72, 1.18).toFixed(2));
    particle.addEventListener('animationend', () => particle.remove(), { once: true });
    layer.appendChild(particle);

    window.setTimeout(() => particle.remove(), duration + 250);
  }

  function emit(kind, amount) {
    const limitedAmount = reducedMotion ? 1 : amount;
    for (let index = 0; index < limitedAmount; index += 1) spawnParticle(kind, index);
  }

  function handleTreatmentStarted() {
    setTreatmentActive(true);
  }

  function handleTreatmentState(event) {
    const detail = event?.detail || {};
    const nextPollMs = finiteNumber(detail.nextPollMs);
    setTreatmentActive(detail.active === true, nextPollMs !== null
      ? Math.max(TREATMENT_WATCHDOG_MS, nextPollMs * 5)
      : TREATMENT_WATCHDOG_MS);
  }

  function handleConsumptionState(event) {
    const detail = event?.detail || {};
    setConsumption(detail.active === true, detail.type || detail.itemType);
  }

  function handleVitalsChanged(event) {
    const nextHealth = healthFromEvent(event, lastHealth);
    if (nextHealth === null) return;

    if (lastHealth !== null) {
      if (nextHealth < lastHealth - 0.01) {
        damageUntil = performance.now() + DAMAGE_ACTIVITY_MS;
        nextDamageAt = 0;
        emit('damage', 4);
      } else if (nextHealth > lastHealth + 0.01 && !treatmentActive) {
        emit('heal', 4);
      }
    }

    lastHealth = nextHealth;
  }

  function handleVisibilityChange() {
    if (document.hidden) clearParticles();
  }

  const timer = window.setInterval(() => {
    if (destroyed || document.hidden) return;

    const now = performance.now();
    const hasEmitter = treatmentActive || damageUntil > now || Boolean(activeConsumption);
    if (!hasEmitter && !layer.childElementCount) {
      layer.hidden = true;
      return;
    }

    positionLayer();

    const takingDamage = damageUntil > now;

    if (treatmentActive && !takingDamage && now >= nextHealAt) {
      emit('heal', 3);
      nextHealAt = now + (reducedMotion ? HEAL_EMIT_MS * 3 : HEAL_EMIT_MS);
    }

    if (takingDamage && now >= nextDamageAt) {
      emit('damage', 2);
      nextDamageAt = now + (reducedMotion ? DAMAGE_EMIT_MS * 3 : DAMAGE_EMIT_MS);
    }

    if (activeConsumption && now >= nextConsumptionAt) {
      emit(activeConsumption, 3);
      nextConsumptionAt = now + (reducedMotion ? CONSUMPTION_EMIT_MS * 3 : CONSUMPTION_EMIT_MS);
    }
  }, TICK_MS);

  window.addEventListener('mn:hospital-treatment-started-local', handleTreatmentStarted);
  window.addEventListener('mn:player-treatment-state-changed', handleTreatmentState);
  window.addEventListener('mn:player-consumption-state-changed', handleConsumptionState);
  window.addEventListener('mn:player-vitals-changed', handleVitalsChanged);
  window.addEventListener('mn:player-health-changed', handleVitalsChanged);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    destroyed = true;
    window.clearInterval(timer);
    window.clearTimeout(treatmentWatchdog);
    window.removeEventListener('mn:hospital-treatment-started-local', handleTreatmentStarted);
    window.removeEventListener('mn:player-treatment-state-changed', handleTreatmentState);
    window.removeEventListener('mn:player-consumption-state-changed', handleConsumptionState);
    window.removeEventListener('mn:player-vitals-changed', handleVitalsChanged);
    window.removeEventListener('mn:player-health-changed', handleVitalsChanged);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    layer.remove();
  };
}
