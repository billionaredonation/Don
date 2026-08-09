import './playerStatusEffects.css';
import { state } from '../state.js';
import { supabase } from '../supabaseClient.js';

const TICK_MS = 90;
const HEAL_EMIT_MS = 135;
const DAMAGE_EMIT_MS = 95;
const CONSUMPTION_EMIT_MS = 115;
const DAMAGE_ACTIVITY_MS = 950;
const TREATMENT_WATCHDOG_MS = 90000;
const TREATMENT_BROADCAST_HEARTBEAT_MS = 15000;
const TREATMENT_RETRY_MS = 10000;

function telegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function processMedicineTreatment() {
  const initData = telegramInitData();
  if (!initData) return null;

  const { data, error } = await supabase.functions.invoke('hospital-warehouse', {
    body: { initData, action: 'process_treatment' },
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'TREATMENT_PROCESS_FAILED');
  return data.result || {};
}

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
  const isPointMarker = element.matches?.(
    '.mn-interior-player, .mn-interior-remote-player'
  ) === true;

  return (
    styles.display !== 'none' &&
    styles.visibility !== 'hidden' &&
    Number(styles.opacity || 1) > 0 &&
    (isPointMarker || (rect.width > 1 && rect.height > 1)) &&
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

  const mobileGameplayActive = Boolean(
    document.body?.classList.contains('mn-mobile-game-enabled') ||
    document.querySelector('.home[data-mobile-controls="enabled"]')
  );
  if (mobileGameplayActive) {
    const hardMobileMarker = document.querySelector('[data-mobile-self-marker-hard="true"]');
    if (isElementVisible(hardMobileMarker)) return hardMobileMarker;

    const mobileMarker = document.querySelector('.mobile-self-player-indicator');
    if (isElementVisible(mobileMarker)) return mobileMarker;
  }

  const mapMarker = document.querySelector('.gta-player-marker-self');
  return isElementVisible(mapMarker) ? mapMarker : null;
}

function escapeCss(value) {
  return window.CSS?.escape
    ? CSS.escape(String(value))
    : String(value).replaceAll('"', '\\"');
}

function localPlayerId() {
  return String(
    state.telegramId ||
    state.player?.telegramId ||
    state.player?.tg_id ||
    document.querySelector('.gta-player-marker-self')?.dataset?.playerId ||
    ''
  ).trim();
}

function findRemotePlayerMarker(playerId) {
  const safePlayerId = String(playerId || '').trim();
  if (!safePlayerId) return null;
  const escaped = escapeCss(safePlayerId);
  const selector = window.__MN_INTERIOR_ACTIVE__ === true
    ? `.mn-interior-remote-player[data-player-id="${escaped}"]`
    : `.gta-player-marker-other[data-player-id="${escaped}"]`;
  const marker = document.querySelector(selector);
  return isElementVisible(marker) ? marker : null;
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
  let treatmentPollTimer = 0;
  let treatmentPollInFlight = false;
  let treatmentChannel = null;
  let lastTreatmentBroadcastAt = 0;
  let damageUntil = 0;
  let activeConsumption = '';
  const remoteTreatments = new Map();
  let lastHealth = finiteNumber(state.player?.health ?? state.player?.hp);
  let nextHealAt = 0;
  let nextDamageAt = 0;
  let nextConsumptionAt = 0;

  function clearParticles(kind = '', playerId = '') {
    const kindSelector = kind ? `[data-kind="${escapeCss(kind)}"]` : '';
    const playerSelector = playerId ? `[data-player-id="${escapeCss(playerId)}"]` : '';
    const selector = `.mn-player-status-particle${kindSelector}${playerSelector}`;
    layer.querySelectorAll(selector).forEach((particle) => particle.remove());
  }

  function clearLocalParticles(kind) {
    layer.querySelectorAll(
      `.mn-player-status-particle[data-kind="${escapeCss(kind)}"]:not([data-player-id])`
    ).forEach((particle) => particle.remove());
  }

  function publishLocalTreatment(active, watchdogMs) {
    const now = Date.now();
    if (
      active === treatmentActive &&
      active === true &&
      now - lastTreatmentBroadcastAt < TREATMENT_BROADCAST_HEARTBEAT_MS
    ) return;

    lastTreatmentBroadcastAt = now;
    window.dispatchEvent(new CustomEvent('mn:local-player-treatment-state-changed', {
      detail: {
        playerId: localPlayerId(),
        active: active === true,
        activeUntil: active === true ? now + watchdogMs : now,
      },
    }));
  }

  function setTreatmentActive(active, watchdogMs = TREATMENT_WATCHDOG_MS) {
    const nextActive = active === true;
    const safeWatchdogMs = Math.max(5000, Number(watchdogMs) || TREATMENT_WATCHDOG_MS);
    publishLocalTreatment(nextActive, safeWatchdogMs);
    treatmentActive = nextActive;
    window.clearTimeout(treatmentWatchdog);
    treatmentWatchdog = 0;

    if (!treatmentActive) {
      clearLocalParticles('heal');
      return;
    }

    nextHealAt = 0;
    treatmentWatchdog = window.setTimeout(() => setTreatmentActive(false), safeWatchdogMs);
  }

  function scheduleTreatmentPoll(delayMs = 250) {
    window.clearTimeout(treatmentPollTimer);
    treatmentPollTimer = window.setTimeout(
      pollTreatment,
      Math.max(100, Number(delayMs) || 250)
    );
  }

  async function pollTreatment() {
    if (destroyed || treatmentPollInFlight) return;
    treatmentPollInFlight = true;

    try {
      const result = await processMedicineTreatment();
      if (!result || destroyed) return;

      const vitals = {};
      ['health', 'food', 'water'].forEach((key) => {
        const value = finiteNumber(result[key]);
        if (value !== null) vitals[key] = value;
      });

      if (Object.keys(vitals).length) {
        state.player = { ...(state.player || {}), ...vitals };
        window.dispatchEvent(new CustomEvent('mn:player-vitals-changed', {
          detail: {
            vitals,
            source: 'global_hospital_treatment',
            animateDamage: false,
            result,
          },
        }));
      }

      window.dispatchEvent(new CustomEvent('mn:player-treatment-state-changed', {
        detail: {
          active: result.active === true,
          nextPollMs: Number(result.nextPollMs || 0),
          source: 'global_hospital_treatment',
          result,
        },
      }));

      if (result.active === true) {
        scheduleTreatmentPoll(Math.max(1000, Number(result.nextPollMs || 2000)));
      }
    } catch (error) {
      console.warn('[playerStatusEffects] treatment processing failed:', error);
      scheduleTreatmentPoll(TREATMENT_RETRY_MS);
    } finally {
      treatmentPollInFlight = false;
    }
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

  function spawnParticle(kind, index = 0, marker = null, playerId = '') {
    const targetMarker = marker || findLocalPlayerMarker();
    if (!targetMarker) return;

    const rect = targetMarker.getBoundingClientRect();
    const markerHasSize = rect.width > 1 || rect.height > 1;
    const centerX = markerHasSize ? rect.left + rect.width / 2 : rect.left;
    const centerY = markerHasSize ? rect.top + rect.height / 2 : rect.top;

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
    if (playerId) particle.dataset.playerId = String(playerId);
    if (kind === 'heal' || kind === 'damage') particle.textContent = '+';
    particle.style.setProperty('--mn-player-fx-x', `${Math.round(centerX * 10) / 10}px`);
    particle.style.setProperty('--mn-player-fx-y', `${Math.round(centerY * 10) / 10}px`);
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

  function emit(kind, amount, marker = null, playerId = '') {
    const limitedAmount = reducedMotion ? 1 : amount;
    for (let index = 0; index < limitedAmount; index += 1) {
      spawnParticle(kind, index, marker, playerId);
    }
  }

  function handleTreatmentStarted() {
    setTreatmentActive(true);
    scheduleTreatmentPoll(250);
  }

  function handleTreatmentState(event) {
    const detail = event?.detail || {};
    const nextPollMs = finiteNumber(detail.nextPollMs);
    setTreatmentActive(detail.active === true, nextPollMs !== null
      ? Math.max(TREATMENT_WATCHDOG_MS, nextPollMs * 5)
      : TREATMENT_WATCHDOG_MS);
  }

  function handleRemoteTreatmentState(event) {
    const detail = event?.detail || {};
    const playerId = String(detail.playerId || detail.player_id || '').trim();
    if (!playerId || playerId === localPlayerId()) return;

    if (detail.active !== true) {
      remoteTreatments.delete(playerId);
      clearParticles('heal', playerId);
      return;
    }

    const requestedUntil = finiteNumber(detail.activeUntil ?? detail.active_until);
    const activeUntil = requestedUntil !== null
      ? Math.max(Date.now() + 5000, Math.min(requestedUntil, Date.now() + TREATMENT_WATCHDOG_MS))
      : Date.now() + TREATMENT_WATCHDOG_MS;
    remoteTreatments.set(playerId, { activeUntil, nextHealAt: 0 });
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
    const hasEmitter = treatmentActive || damageUntil > now || Boolean(activeConsumption) || remoteTreatments.size > 0;
    if (!hasEmitter && !layer.childElementCount) {
      layer.hidden = true;
      return;
    }

    layer.hidden = false;

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

    const wallNow = Date.now();
    remoteTreatments.forEach((remote, playerId) => {
      if (remote.activeUntil <= wallNow) {
        remoteTreatments.delete(playerId);
        clearParticles('heal', playerId);
        return;
      }
      if (now < remote.nextHealAt) return;
      const marker = findRemotePlayerMarker(playerId);
      if (marker) emit('heal', 3, marker, playerId);
      remote.nextHealAt = now + (reducedMotion ? HEAL_EMIT_MS * 3 : HEAL_EMIT_MS);
    });
  }, TICK_MS);

  window.addEventListener('mn:hospital-treatment-started-local', handleTreatmentStarted);
  window.addEventListener('mn:player-treatment-state-changed', handleTreatmentState);
  window.addEventListener('mn:remote-player-treatment-state-changed', handleRemoteTreatmentState);
  window.addEventListener('mn:player-consumption-state-changed', handleConsumptionState);
  window.addEventListener('mn:player-vitals-changed', handleVitalsChanged);
  window.addEventListener('mn:player-health-changed', handleVitalsChanged);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  const tgId = localPlayerId();
  if (tgId) {
    treatmentChannel = supabase.channel(`mn-hospital-treatment:${tgId}`);
    treatmentChannel.on('broadcast', { event: 'treatment_started' }, () => {
      handleTreatmentStarted();
    });
    treatmentChannel.subscribe();
  }
  scheduleTreatmentPoll(1200);

  return () => {
    if (treatmentActive) setTreatmentActive(false);
    destroyed = true;
    window.clearInterval(timer);
    window.clearTimeout(treatmentWatchdog);
    window.clearTimeout(treatmentPollTimer);
    window.removeEventListener('mn:hospital-treatment-started-local', handleTreatmentStarted);
    window.removeEventListener('mn:player-treatment-state-changed', handleTreatmentState);
    window.removeEventListener('mn:remote-player-treatment-state-changed', handleRemoteTreatmentState);
    window.removeEventListener('mn:player-consumption-state-changed', handleConsumptionState);
    window.removeEventListener('mn:player-vitals-changed', handleVitalsChanged);
    window.removeEventListener('mn:player-health-changed', handleVitalsChanged);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (treatmentChannel) supabase.removeChannel(treatmentChannel);
    layer.remove();
  };
}
