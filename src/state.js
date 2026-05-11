// src/state.js
import { citiesBase } from './data/citiesBase.js';
import { loadPlayer, registerPlayer, getCurrentTgId } from './playerRepository.js';

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
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getTelegramId() {
  try {
    return getCurrentTgId() || window.Telegram?.WebApp?.initDataUnsafe?.user?.id || null;
  } catch {
    return null;
  }
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

  state.telegramId = player.tg_id || state.telegramId || getTelegramId();
  state.nickname = player.nickname || state.nickname;
  state.city = player.city || state.city;
  state.cityId = player.city || state.cityId || state.city;
  state.cityName = player.city || state.cityName;
  state.regionId = player.region_id || state.regionId || null;

  state.player = {
    ...state.player,
    id: player.id,
    tg_id: player.tg_id,
    telegramId: player.tg_id,
    nickname: player.nickname,
    city: player.city,
    cityId: player.city,
    cityName: player.city,
    balance: Number(player.balance || 0),
    level: Number(player.level || 1),
    is_admin: Boolean(player.is_admin),
    created_at: player.created_at,
    updated_at: player.updated_at,
  };

  normalizeLoadedState(state);
}

function loadLocal() {
  try {
    const savedRaw = localStorage.getItem(LS_KEY);
    const saved = savedRaw ? JSON.parse(savedRaw) : null;

    const loaded = saved
      ? Object.assign(clone(defaultState), saved)
      : clone(defaultState);

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

    const player = await loadPlayer();

    if (!player) {
      console.log('[Backend] player not found. Local state used.');
      saveLocal();
      return;
    }

    applyRemotePlayer(player);
    saveLocal();

    console.log('[Backend] remote player applied:', state);
  } catch (error) {
    console.warn('[Backend] Remote load crashed. Local state used.', error);
  }
}

export async function createAndSavePlayer({ nickname, city, cityId, cityName, regionId }) {
  const finalCity = city || cityId;

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

  state.nickname = nickname;
  state.city = finalCity;
  state.cityId = finalCity;
  state.cityName = cityName || player.city || finalCity;
  state.regionId = regionId || state.regionId || null;

  state.player.nickname = state.nickname;
  state.player.city = state.city;
  state.player.cityId = state.cityId;
  state.player.cityName = state.cityName;
  state.player.regionId = state.regionId;

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
