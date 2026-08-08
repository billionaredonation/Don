import { state, save } from '../state.js';
import { supabase } from '../supabaseClient.js';
import { getMapObjects } from '../mapObjects/mapObjectsRepository.js';
import { getLocalPlayerId } from './playerPosition.js';
import './playerKnockout.css';

export const KNOCKOUT_HEALTH = 10;
export const HOSPITAL_EXIT_HEALTH = 30;
const HOSPITAL_ADMISSION_MIN_HEALTH = 20;
const HOSPITAL_ADMISSION_MIN_FOOD = 5;
const HOSPITAL_ADMISSION_MIN_WATER = 5;
const KNOCKOUT_COUNTDOWN_MS = 60_000;
const STATE_REFRESH_MS = 5_000;
const TREATMENT_REFRESH_MS = 2_000;
const ADMISSION_RETRY_MS = 2_500;

function finiteNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeKnockState(value) {
  const stateValue = String(value || '').trim().toLowerCase();
  return ['conscious', 'countdown', 'hospitalized'].includes(stateValue)
    ? stateValue
    : 'conscious';
}

function normalizeMedicalState(source = {}) {
  const health = finiteNumber(source.health, finiteNumber(state.player?.health, 100));
  const rawKnockState = normalizeKnockState(source.knockState ?? source.knock_state);
  const knockState = rawKnockState === 'countdown' && health > KNOCKOUT_HEALTH
    ? 'conscious'
    : rawKnockState;

  return {
    health,
    food: finiteNumber(source.food, finiteNumber(state.player?.food, 100)),
    water: finiteNumber(source.water, finiteNumber(state.player?.water, 100)),
    knockState,
    knockStartedAt: knockState === 'conscious'
      ? null
      : source.knockStartedAt ?? source.knock_started_at ?? null,
    hospitalizedAt: source.hospitalizedAt ?? source.hospitalized_at ?? null,
    hospitalId: source.hospitalId ?? source.hospital_id ?? null,
    hospitalBedId: source.hospitalBedId ?? source.hospital_bed_id ?? null,
    bedsideTreatmentType:
      source.bedsideTreatmentType ?? source.bedside_treatment_type ?? null,
    bedsideTreatmentStartedAt:
      source.bedsideTreatmentStartedAt ?? source.bedside_treatment_started_at ?? null,
    bedsideTreatmentLastTickAt:
      source.bedsideTreatmentLastTickAt ?? source.bedside_treatment_last_tick_at ?? null,
    treatmentActive: source.treatmentActive ?? Boolean(
      source.bedsideTreatmentType ?? source.bedside_treatment_type
    ),
    serverNow: source.serverNow ?? null,
  };
}

function mergeMedicalState(source = {}, eventSource = 'medical_state') {
  const medical = normalizeMedicalState(source);

  state.player = {
    ...(state.player || {}),
    health: medical.health,
    food: medical.food,
    water: medical.water,
    knockState: medical.knockState,
    knockStartedAt: medical.knockStartedAt,
    hospitalizedAt: medical.hospitalizedAt,
    hospitalId: medical.hospitalId,
    hospitalBedId: medical.hospitalBedId,
    bedsideTreatmentType: medical.bedsideTreatmentType,
    bedsideTreatmentStartedAt: medical.bedsideTreatmentStartedAt,
    bedsideTreatmentLastTickAt: medical.bedsideTreatmentLastTickAt,
  };
  save();

  window.dispatchEvent(new CustomEvent('mn:player-medical-state-changed', {
    detail: { state: medical, source: eventSource, result: source },
  }));
  window.dispatchEvent(new CustomEvent('mn:player-vitals-changed', {
    detail: {
      vitals: {
        health: medical.health,
        food: medical.food,
        water: medical.water,
      },
      source: eventSource,
      result: source,
    },
  }));

  return medical;
}

async function invokeMedicalRpc(functionName, args = {}) {
  const { data, error } = await supabase.rpc(functionName, args);
  if (error) throw error;
  if (!data) throw new Error('PLAYER_MEDICAL_STATE_UNAVAILABLE');
  return data;
}

export async function loadPlayerKnockoutState() {
  const result = await invokeMedicalRpc('player_get_knockout_state', {
    p_player_id: getLocalPlayerId(),
  });
  return mergeMedicalState(result, 'knockout_state_sync');
}

export async function startHospitalBedsideTreatment(medicineType) {
  const result = await invokeMedicalRpc('player_start_bedside_treatment', {
    p_player_id: getLocalPlayerId(),
    p_medicine_type: medicineType,
  });
  return mergeMedicalState(result, 'hospital_bedside_treatment_started');
}

export async function processHospitalBedsideTreatment() {
  const result = await invokeMedicalRpc('player_process_bedside_treatment', {
    p_player_id: getLocalPlayerId(),
  });
  return mergeMedicalState(result, 'hospital_bedside_treatment_tick');
}

export async function dischargeHospitalPatient() {
  const result = await invokeMedicalRpc('player_discharge_from_hospital', {
    p_player_id: getLocalPlayerId(),
  });
  return mergeMedicalState(result, 'hospital_discharge');
}

function isHospitalObject(object) {
  const type = String(
    object?.type || object?.payload?.type || object?.payload?.serviceType || ''
  ).toLowerCase();
  const category = String(
    object?.category || object?.payload?.category || object?.payload?.kind || ''
  ).toLowerCase();
  return type === 'hospital' || category === 'hospital';
}

function objectId(object) {
  return String(
    object?.id || object?.mapObjectId || object?.objectId || object?.dbId || ''
  ).trim();
}

function nearestHospital(objects, playerPosition, preferredHospitalId = null) {
  const hospitals = (Array.isArray(objects) ? objects : []).filter(isHospitalObject);
  if (!hospitals.length) return null;

  const preferred = preferredHospitalId
    ? hospitals.find((hospital) => objectId(hospital) === String(preferredHospitalId))
    : null;
  if (preferred) return preferred;

  const playerX = finiteNumber(playerPosition?.x, 50);
  const playerY = finiteNumber(playerPosition?.y, 50);

  return hospitals.sort((left, right) => {
    const leftDistance = Math.hypot(
      finiteNumber(left?.x, 50) - playerX,
      finiteNumber(left?.y, 50) - playerY
    );
    const rightDistance = Math.hypot(
      finiteNumber(right?.x, 50) - playerX,
      finiteNumber(right?.y, 50) - playerY
    );
    return leftDistance - rightDistance;
  })[0];
}

function formatCountdown(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function knockoutMarkup() {
  return `
    <div class="mn-player-knockout" data-player-knockout data-phase="warning" role="alert" aria-live="assertive">
      <div class="mn-player-knockout-vignette" aria-hidden="true"></div>
      <section class="mn-player-knockout-card">
        <small>КРИТИЧЕСКОЕ СОСТОЯНИЕ</small>
        <h2>Вы ещё в сознании</h2>
        <p>До глубокой комы и попадания в больницу остаётся</p>
        <time data-player-knockout-timer>01:00</time>
        <span>Управление персонажем заблокировано</span>
      </section>
    </div>`;
}

export function enablePlayerKnockoutFeature({ playerPosition, cityId } = {}) {
  let destroyed = false;
  let medical = normalizeMedicalState(playerPosition || state.player || {});
  let gameplayReady = window.__MN_GAMEPLAY_ENTERED__ === true;
  let medicalStateVerified = false;
  let countdownTimer = 0;
  let refreshTimer = 0;
  let treatmentTimer = 0;
  let admissionRetryTimer = 0;
  let admissionInFlight = false;
  let beginInFlight = false;
  let clockOffsetMs = 0;
  let overlay = null;
  let timerElement = null;

  function publishControlLock(locked, reason = 'knockout') {
    const nextLocked = locked === true;
    window.__MN_PLAYER_CONTROLS_LOCKED__ = nextLocked;
    document.body?.classList.toggle('mn-player-controls-locked', nextLocked);
    document.documentElement?.classList.toggle('mn-player-controls-locked', nextLocked);
    window.dispatchEvent(new CustomEvent('mn:player-controls-lock-changed', {
      detail: { locked: nextLocked, reason },
    }));
  }

  function ensureOverlay(phase = 'warning') {
    if (!overlay) {
      document.body.insertAdjacentHTML('beforeend', knockoutMarkup());
      overlay = document.querySelector('[data-player-knockout]');
      timerElement = overlay?.querySelector('[data-player-knockout-timer]') || null;
    }
    if (overlay) overlay.dataset.phase = phase;
    return overlay;
  }

  function removeOverlay() {
    if (!overlay) return;
    overlay.dataset.phase = 'recovering';
    const currentOverlay = overlay;
    overlay = null;
    timerElement = null;
    window.setTimeout(() => currentOverlay.remove(), 520);
  }

  function syncClock(serverNow) {
    const serverTime = Date.parse(serverNow || '');
    if (Number.isFinite(serverTime)) clockOffsetMs = serverTime - Date.now();
  }

  function applyMedical(nextMedical, source = 'knockout_runtime') {
    medical = normalizeMedicalState(nextMedical);
    syncClock(medical.serverNow);
    Object.assign(playerPosition || {}, {
      health: medical.health,
      food: medical.food,
      water: medical.water,
      knockState: medical.knockState,
      knockStartedAt: medical.knockStartedAt,
      hospitalizedAt: medical.hospitalizedAt,
      hospitalId: medical.hospitalId,
      hospitalBedId: medical.hospitalBedId,
      bedsideTreatmentType: medical.bedsideTreatmentType,
    });
    mergeMedicalState(medical, source);
    return medical;
  }

  async function stabilizeHospitalAdmission(result) {
    const admission = normalizeMedicalState(result);
    const health = Math.max(HOSPITAL_ADMISSION_MIN_HEALTH, admission.health);
    const food = Math.max(HOSPITAL_ADMISSION_MIN_FOOD, admission.food);
    const water = Math.max(HOSPITAL_ADMISSION_MIN_WATER, admission.water);

    if (
      health === admission.health &&
      food === admission.food &&
      water === admission.water
    ) {
      return result;
    }

    // Совместимость со старой версией RPC: если база ещё вернула 10/0/0,
    // сразу закрепляем безопасные значения в canonical player_positions.
    const { data, error } = await supabase
      .from('player_positions')
      .update({
        health,
        food,
        water,
        knock_state: 'hospitalized',
        updated_at: new Date().toISOString(),
      })
      .eq('player_id', getLocalPlayerId())
      .select('health, food, water, knock_state, hospitalized_at, hospital_id, hospital_bed_id')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('HOSPITAL_ADMISSION_STABILIZATION_FAILED');

    return { ...(result || {}), ...data, health, food, water, knockState: 'hospitalized' };
  }

  function knockDeadline() {
    const startedAt = Date.parse(medical.knockStartedAt || '');
    return Number.isFinite(startedAt) ? startedAt + KNOCKOUT_COUNTDOWN_MS : Date.now();
  }

  function remainingKnockMs() {
    return Math.max(0, knockDeadline() - (Date.now() + clockOffsetMs));
  }

  async function persistHospitalBed(bedId) {
    if (!bedId || medical.knockState !== 'hospitalized') return;
    try {
      const result = await invokeMedicalRpc('player_set_hospital_bed', {
        p_player_id: getLocalPlayerId(),
        p_bed_id: bedId,
      });
      applyMedical(result, 'hospital_bed_assigned');
    } catch (error) {
      console.warn('[playerKnockout] hospital bed save failed:', error);
    }
  }

  function scheduleAdmissionRetry() {
    window.clearTimeout(admissionRetryTimer);
    admissionRetryTimer = window.setTimeout(() => {
      admissionRetryTimer = 0;
      void admitToHospital();
    }, ADMISSION_RETRY_MS);
  }

  async function admitToHospital() {
    if (destroyed || !gameplayReady || admissionInFlight) return;
    admissionInFlight = true;
    publishControlLock(true, 'hospital_transport');
    ensureOverlay('transporting');

    try {
      const objects = await getMapObjects(cityId || state.city || state.cityId);
      const hospital = nearestHospital(objects, playerPosition, medical.hospitalId);
      const hospitalId = objectId(hospital);

      if (!hospital || !hospitalId) throw new Error('CITY_HOSPITAL_NOT_FOUND');

      if (medical.knockState !== 'hospitalized') {
        const result = await invokeMedicalRpc('player_admit_to_hospital', {
          p_player_id: getLocalPlayerId(),
          p_hospital_id: hospitalId,
          p_bed_id: medical.hospitalBedId || null,
        });
        const stabilizedResult = await stabilizeHospitalAdmission(result);
        applyMedical(stabilizedResult, 'hospital_admission');
      }

      window.dispatchEvent(new CustomEvent('mn:hospital-enter-request', {
        detail: {
          hospital,
          object: hospital,
          action: 'admit',
          admission: {
            forced: true,
            source: 'knockout',
            preferredBedId: medical.hospitalBedId || null,
          },
        },
      }));
      scheduleAdmissionRetry();
    } catch (error) {
      if (!String(error?.message || '').includes('KNOCK_COUNTDOWN_ACTIVE')) {
        console.warn('[playerKnockout] hospital admission failed:', error);
      }
      scheduleAdmissionRetry();
    } finally {
      admissionInFlight = false;
    }
  }

  function updateCountdown() {
    if (destroyed || !gameplayReady || medical.knockState !== 'countdown') return;
    const remaining = remainingKnockMs();
    ensureOverlay('warning');
    publishControlLock(true, 'knockout_countdown');
    if (timerElement) timerElement.textContent = formatCountdown(remaining);

    if (remaining <= 0) {
      window.clearInterval(countdownTimer);
      countdownTimer = 0;
      void admitToHospital();
    }
  }

  function startCountdown() {
    if (destroyed || !gameplayReady) return;
    window.clearInterval(countdownTimer);
    ensureOverlay('warning');
    publishControlLock(true, 'knockout_countdown');
    updateCountdown();
    if (medical.knockState === 'countdown') {
      countdownTimer = window.setInterval(updateCountdown, 200);
    }
  }

  async function beginKnockout() {
    if (
      destroyed ||
      !gameplayReady ||
      !medicalStateVerified ||
      beginInFlight ||
      medical.knockState !== 'conscious' ||
      finiteNumber(medical.health, 100) > KNOCKOUT_HEALTH
    ) return;

    beginInFlight = true;
    publishControlLock(true, 'knockout_pending');
    ensureOverlay('warning');

    try {
      const result = await invokeMedicalRpc('player_begin_knockout', {
        p_player_id: getLocalPlayerId(),
      });
      applyMedical(result, 'knockout_started');
      startCountdown();
    } catch (error) {
      console.warn('[playerKnockout] knockout start failed:', error);
      // Keep the local lock even if the migration has not reached PostgREST yet.
      medical = {
        ...medical,
        knockState: 'countdown',
        knockStartedAt: medical.knockStartedAt || new Date().toISOString(),
      };
      startCountdown();
    } finally {
      beginInFlight = false;
    }
  }

  function handleVitalsChanged(event) {
    const snapshot = event?.detail?.vitals || event?.detail?.player || event?.detail || {};
    const health = finiteNumber(snapshot.health, null);
    if (health !== null) medical.health = health;

    if (health !== null && health > KNOCKOUT_HEALTH && medical.knockState === 'countdown') {
      medical.knockState = 'conscious';
      medical.knockStartedAt = null;
      window.clearInterval(countdownTimer);
      countdownTimer = 0;
      publishControlLock(false, 'critical_health_corrected');
      removeOverlay();
      return;
    }

    if (
      gameplayReady &&
      medicalStateVerified &&
      medical.knockState === 'conscious' &&
      medical.health <= KNOCKOUT_HEALTH
    ) {
      void beginKnockout();
    }
  }

  function handleHospitalizationRequired() {
    medical.health = Math.min(KNOCKOUT_HEALTH, finiteNumber(medical.health, KNOCKOUT_HEALTH));
    if (gameplayReady && medicalStateVerified) void beginKnockout();
  }

  function handleHospitalAdmitted(event) {
    if (medical.knockState !== 'hospitalized') return;
    window.clearTimeout(admissionRetryTimer);
    admissionRetryTimer = 0;
    const bedId = event?.detail?.bedId || null;
    if (bedId && bedId !== medical.hospitalBedId) void persistHospitalBed(bedId);
    publishControlLock(false, 'hospital_admitted');
    removeOverlay();
  }

  function handleMedicalStateChanged(event) {
    const nextState = event?.detail?.state;
    if (!nextState) return;
    medicalStateVerified = true;
    medical = normalizeMedicalState(nextState);
    Object.assign(playerPosition || {}, medical);
    if (medical.knockState === 'conscious') {
      window.clearInterval(countdownTimer);
      countdownTimer = 0;
      publishControlLock(false, 'conscious');
      removeOverlay();
    } else if (gameplayReady) {
      activateMedicalState('medical_state_changed');
    }
  }

  function activateMedicalState(reason = 'gameplay_entered') {
    if (destroyed || !gameplayReady || !medicalStateVerified) return;

    if (medical.knockState === 'countdown') {
      startCountdown();
    } else if (medical.knockState === 'hospitalized') {
      publishControlLock(true, 'hospital_reconnect');
      ensureOverlay('transporting');
      void admitToHospital();
    } else if (medical.health <= KNOCKOUT_HEALTH) {
      void beginKnockout();
    } else {
      publishControlLock(false, reason);
    }
  }

  function handleGameplayEntered() {
    if (destroyed || gameplayReady) return;
    gameplayReady = true;
    medicalStateVerified = false;
    publishControlLock(false, 'checking_medical_state');
    removeOverlay();
    void refreshMedicalState();
  }

  async function refreshMedicalState() {
    if (destroyed) return;
    try {
      const nextState = await loadPlayerKnockoutState();
      medical = normalizeMedicalState(nextState);
      Object.assign(playerPosition || {}, medical);

      if (gameplayReady) activateMedicalState('medical_state_refresh');
    } catch (error) {
      console.warn('[playerKnockout] state refresh failed:', error);
    }
  }

  async function processTreatment() {
    if (destroyed || medical.knockState !== 'hospitalized' || !medical.bedsideTreatmentType) return;
    try {
      const nextState = await processHospitalBedsideTreatment();
      medical = normalizeMedicalState(nextState);
      Object.assign(playerPosition || {}, medical);
    } catch (error) {
      console.warn('[playerKnockout] bedside treatment tick failed:', error);
    }
  }

  window.addEventListener('mn:player-vitals-changed', handleVitalsChanged);
  window.addEventListener('mn:player-hospitalization-required', handleHospitalizationRequired);
  window.addEventListener('mn:player-hospital-admitted', handleHospitalAdmitted);
  window.addEventListener('mn:player-medical-state-changed', handleMedicalStateChanged);
  window.addEventListener('mn:gameplay-entered', handleGameplayEntered);

  publishControlLock(false, gameplayReady ? 'checking_medical_state' : 'awaiting_gameplay');
  if (gameplayReady) void refreshMedicalState();

  refreshTimer = window.setInterval(refreshMedicalState, STATE_REFRESH_MS);
  treatmentTimer = window.setInterval(processTreatment, TREATMENT_REFRESH_MS);
  window.setTimeout(refreshMedicalState, 600);

  return () => {
    destroyed = true;
    window.clearInterval(countdownTimer);
    window.clearInterval(refreshTimer);
    window.clearInterval(treatmentTimer);
    window.clearTimeout(admissionRetryTimer);
    window.removeEventListener('mn:player-vitals-changed', handleVitalsChanged);
    window.removeEventListener('mn:player-hospitalization-required', handleHospitalizationRequired);
    window.removeEventListener('mn:player-hospital-admitted', handleHospitalAdmitted);
    window.removeEventListener('mn:player-medical-state-changed', handleMedicalStateChanged);
    window.removeEventListener('mn:gameplay-entered', handleGameplayEntered);
    overlay?.remove();
    overlay = null;
    publishControlLock(false, 'cleanup');
  };
}
