// src/state.js
import { citiesBase } from './data/citiesBase.js';
import {
  loadPlayer,
  registerPlayer,
  getCurrentTgId,
} from './playerRepository.js';

const LS_KEY = 'mn-game-state';

const defaultState = {
  telegramId: null,
  nickname: null,
  city: null,
  cityId: null,
  cityName: null,
  regionId: null,
  player: {},
  citiesRuntime: {},
  backendPlayerVerified: false,
  backendPlayerMissing: false,
  lastRemoteCheckAt: null,
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getTelegramId() {
  try {
    return (
      getCurrentTgId() ||
      window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
      null
    );
  } catch {
    return null;
  }
}

function sameTelegramId(a, b) {
  if (!a || !b) return false;
  return String(a) === String(b);
}

function nowIso() {
  return new Date().toISOString();
}

function isRemotePlayerNotFoundError(error) {
  const code = String(error?.code || '').trim().toLowerCase();
  const message = String(error?.message || error || '').trim().toLowerCase();

  // A missing player normally arrives as { ok: true, player: null } and does
  // not throw. Only recognise explicit database/player codes here. Generic
  // text such as "Function not found" describes broken infrastructure and
  // must never wipe the player's local registration state.
  return (
    code === 'pgrst116' ||
    code === 'player_not_found' ||
    message === 'player not found' ||
    message === 'row not found'
  );
}

function makeBlankRegistrationState(telegramId = getTelegramId()) {
  const cleanState = clone(defaultState);

  cleanState.telegramId = telegramId || null;
  cleanState.backendPlayerVerified = false;
  cleanState.backendPlayerMissing = true;
  cleanState.lastRemoteCheckAt = nowIso();

  if (telegramId) {
    cleanState.player = {
      telegramId,
      tg_id: telegramId,
    };
  }

  return cleanState;
}

function resetRegistrationState(telegramId = getTelegramId()) {
  state = makeBlankRegistrationState(telegramId);
}

function normalizeLoadedState(loaded) {
  loaded.player = loaded.player || {};
  loaded.citiesRuntime = loaded.citiesRuntime || {};

  loaded.telegramId =
    loaded.telegramId ||
    loaded.player.telegramId ||
    loaded.player.tg_id ||
    getTelegramId() ||
    null;

  loaded.backendPlayerVerified = loaded.backendPlayerVerified === true;
  loaded.backendPlayerMissing = loaded.backendPlayerMissing === true;
  loaded.lastRemoteCheckAt = loaded.lastRemoteCheckAt || null;

  loaded.nickname =
    loaded.nickname ||
    loaded.player.nickname ||
    null;

  loaded.city =
    loaded.city ||
    loaded.cityId ||
    loaded.player.city ||
    loaded.player.cityId ||
    null;

  loaded.cityId =
    loaded.cityId ||
    loaded.city ||
    loaded.player.cityId ||
    loaded.player.city ||
    null;

  loaded.cityName =
    loaded.cityName ||
    loaded.player.cityName ||
    loaded.player.city_name ||
    loaded.player.city ||
    loaded.city ||
    null;

  loaded.regionId =
    loaded.regionId ||
    loaded.player.regionId ||
    loaded.player.region_id ||
    null;

  loaded.player.telegramId = loaded.telegramId;
  loaded.player.tg_id = loaded.telegramId;
  loaded.player.nickname = loaded.nickname;
  loaded.player.city = loaded.city;
  loaded.player.cityId = loaded.cityId;
  loaded.player.cityName = loaded.cityName;
  loaded.player.regionId = loaded.regionId;

  return loaded;
}

function applyRemotePlayer(player) {
  if (!player) return;

  const telegramId =
    player.tg_id ||
    player.telegramId ||
    state.telegramId ||
    getTelegramId() ||
    null;

  state.telegramId = telegramId;
  state.nickname = player.nickname || state.nickname || null;
  state.city = player.city || state.city || null;
  state.cityId = player.city || state.cityId || state.city || null;
  state.cityName =
    player.cityName ||
    player.city_name ||
    player.city ||
    state.cityName ||
    state.city ||
    null;
  state.regionId =
    player.region_id ||
    player.regionId ||
    state.regionId ||
    null;

  state.backendPlayerVerified = true;
  state.backendPlayerMissing = false;
  state.lastRemoteCheckAt = nowIso();

  state.player = {
    ...state.player,
    id: player.id,
    tg_id: telegramId,
    telegramId,
    nickname: state.nickname,
    city: state.city,
    cityId: state.cityId,
    cityName: state.cityName,
    regionId: state.regionId,
    balance: Number(player.balance || 0),
    health: Number(player.health ?? player.hp ?? state.player?.health ?? 100),
    food: Number(player.food ?? state.player?.food ?? 100),
    water: Number(player.water ?? state.player?.water ?? 100),
    level: Number(player.level || 1),
    is_admin: Boolean(player.is_admin),
    created_at: player.created_at,
    updated_at: player.updated_at,
  };

  normalizeLoadedState(state);
}

function loadLocal() {
  try {
    const telegramId = getTelegramId();
    const savedRaw = localStorage.getItem(LS_KEY);
    const saved = savedRaw ? JSON.parse(savedRaw) : null;

    if (!saved) {
      return clone(defaultState);
    }

    const savedTelegramId =
      saved.telegramId ||
      saved.player?.telegramId ||
      saved.player?.tg_id ||
      null;

    if (
      telegramId &&
      savedTelegramId &&
      !sameTelegramId(telegramId, savedTelegramId)
    ) {
      console.warn(
        '[State] Local state belongs to another Telegram user. Local state ignored.'
      );

      localStorage.removeItem(LS_KEY);
      return clone(defaultState);
    }

    const loaded = Object.assign(
      clone(defaultState),
      saved
    );

    return normalizeLoadedState(loaded);
  } catch (error) {
    console.warn('[State] Unable to load local state', error);
    return clone(defaultState);
  }
}

export let state = loadLocal();

export function getState() {
  return state;
}

export async function loadRemote() {
  console.log('[Backend] loadRemote started');

  try {
    const telegramId = getTelegramId();

    if (telegramId) {
      state.telegramId = telegramId;
      state.player = state.player || {};
      state.player.telegramId = telegramId;
      state.player.tg_id = telegramId;
    }

    const localTelegramId =
      state.telegramId ||
      state.player?.telegramId ||
      state.player?.tg_id ||
      null;

    if (
      telegramId &&
      localTelegramId &&
      !sameTelegramId(telegramId, localTelegramId)
    ) {
      console.warn(
        '[Backend] Local state tg_id mismatch. Resetting local state.'
      );

      localStorage.removeItem(LS_KEY);
      resetRegistrationState(telegramId);
    }

    const player = await loadPlayer();

    if (!player) {
      console.log('[Backend] player not found. Local registration cache cleared.');

      resetRegistrationState(telegramId);
      saveLocal();

      return {
        ok: true,
        playerFound: false,
        reason: 'player_not_found',
      };
    }

    const remoteTelegramId =
      player.tg_id ||
      player.telegramId ||
      null;

    if (
      telegramId &&
      remoteTelegramId &&
      !sameTelegramId(telegramId, remoteTelegramId)
    ) {
      throw new Error(
        'Remote player tg_id mismatch. Access denied.'
      );
    }

    applyRemotePlayer(player);
    saveLocal();

    console.log('[Backend] remote player applied:', state);

    return {
      ok: true,
      playerFound: true,
      reason: 'player_loaded',
    };
  } catch (error) {
    if (isRemotePlayerNotFoundError(error)) {
      console.log('[Backend] player not found by remote error. Local registration cache cleared.', error);

      resetRegistrationState(getTelegramId());
      saveLocal();

      return {
        ok: true,
        playerFound: false,
        reason: 'player_not_found',
      };
    }

    console.warn('[Backend] Remote load crashed. Local registration cache is not trusted.', error);

    state.backendPlayerVerified = false;
    state.backendPlayerMissing = false;
    state.lastRemoteCheckAt = nowIso();
    saveLocal();

    return {
      ok: false,
      playerFound: false,
      reason: 'remote_load_failed',
      error,
    };
  }
}

export async function createAndSavePlayer({
  nickname,
  city,
  cityId,
  cityName,
  regionId,
}) {
  const finalCity = city || cityId;
  const telegramId = getTelegramId();

  if (!telegramId) {
    throw new Error('Telegram ID is required');
  }

  if (!nickname) {
    throw new Error('Nickname is required');
  }

  if (!finalCity) {
    throw new Error('City is required');
  }

  const player = await registerPlayer({
    nickname,
    city: finalCity,
  });

  applyRemotePlayer(player);

  state.telegramId = telegramId;
  state.nickname = nickname;
  state.city = finalCity;
  state.cityId = finalCity;
  state.cityName = cityName || player.city || finalCity;
  state.regionId = regionId || state.regionId || null;
  state.backendPlayerVerified = true;
  state.backendPlayerMissing = false;
  state.lastRemoteCheckAt = nowIso();

  state.player = {
    ...state.player,
    telegramId,
    tg_id: telegramId,
    nickname: state.nickname,
    city: state.city,
    cityId: state.cityId,
    cityName: state.cityName,
    regionId: state.regionId,
  };

  saveLocal();

  return state;
}

export function save() {
  saveLocal();
}

function saveLocal() {
  state = normalizeLoadedState(state);

  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[State] Unable to save game state locally', error);
  }
}

export function setState(path, value) {
  const keys = path.split('.');
  let obj = state;

  keys.slice(0, -1).forEach((key) => {
    if (!obj[key]) {
      obj[key] = {};
    }

    obj = obj[key];
  });

  obj[keys[keys.length - 1]] = value;

  save();
}

export function updateRuntime(cityId, patch) {
  state.citiesRuntime = state.citiesRuntime || {};

  state.citiesRuntime[cityId] = Object.assign(
    {},
    state.citiesRuntime[cityId] || {},
    patch
  );

  save();
}

export function initRuntime() {
  state.citiesRuntime = state.citiesRuntime || {};

  if (Object.keys(state.citiesRuntime).length) {
    return;
  }

  const blank = {};

  for (const id in citiesBase) {
    blank[id] = {};
  }

  state.citiesRuntime = blank;

  save();
}

export function resetLocalStateOnly() {
  localStorage.removeItem(LS_KEY);
  state = clone(defaultState);
}

export function resetRegistrationStateOnly() {
  resetRegistrationState(getTelegramId());
  saveLocal();
}
