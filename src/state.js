// src/state.js
import { citiesBase } from './data/citiesBase.js';
import { supabase } from './supabaseClient.js';

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
    return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || null;
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
    getTelegramId() ||
    null;

  loaded.nickname = loaded.nickname || loaded.player.nickname || null;

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
    null;

  loaded.regionId =
    loaded.regionId ||
    loaded.player.regionId ||
    null;

  loaded.player.telegramId = loaded.telegramId;
  loaded.player.nickname = loaded.nickname;
  loaded.player.city = loaded.city;
  loaded.player.cityId = loaded.cityId;
  loaded.player.cityName = loaded.cityName;
  loaded.player.regionId = loaded.regionId;

  return loaded;
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

let userIdPromise = null;

async function getUserId() {
  if (userIdPromise) {
    return userIdPromise;
  }

  userIdPromise = resolveUserId();
  return userIdPromise;
}

async function resolveUserId() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    console.warn('[Supabase] getSession error', sessionError);
  }

  if (sessionData?.session?.user?.id) {
    return sessionData.session.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    userIdPromise = null;
    throw error;
  }

  if (!data?.user?.id) {
    userIdPromise = null;
    throw new Error('Anonymous Supabase user was not created');
  }

  return data.user.id;
}

export async function loadRemote() {
  console.log('[Supabase] loadRemote started');

  try {
    const userId = await getUserId();
    const telegramId = getTelegramId();

    let query = supabase
      .from('game_state')
      .select('data');

    if (telegramId) {
      query = query.eq('telegram_id', telegramId);
    } else {
      query = query.eq('user_id', userId);
    }

    const { data, error, status, statusText } = await query.maybeSingle();

    console.log('[Supabase] loadRemote result:', {
      telegramId,
      data,
      error,
      status,
      statusText,
    });

    if (error) {
      console.warn('[Supabase] load failed. Local state used.', error);
      return;
    }

    if (!data?.data) {
      state.telegramId = telegramId || state.telegramId || null;

      if (!state.player) {
        state.player = {};
      }

      state.player.telegramId = state.telegramId;

      saveLocal();
      await saveRemote();
      return;
    }

    const remoteData = data.data;

    const merged = Object.assign(
      clone(defaultState),
      state,
      remoteData
    );

    if (remoteData.runtime && !remoteData.citiesRuntime) {
      merged.citiesRuntime = remoteData.runtime;
    }

    merged.telegramId = merged.telegramId || telegramId || null;

    state = normalizeLoadedState(merged);
    saveLocal();

    console.log('[Supabase] remote state applied:', state);
  } catch (error) {
    console.warn('[Supabase] Remote load crashed. Local state used.', error);
  }
}

export function save() {
  saveLocal();
  saveRemote();
}

function saveLocal() {
  state = normalizeLoadedState(state);

  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[State] Unable to save game state locally', error);
  }
}

async function saveRemote() {
  console.log('[Supabase] saveRemote started');

  try {
    const userId = await getUserId();
    const normalizedState = normalizeLoadedState(state);
    const telegramId = normalizedState.telegramId || getTelegramId();

    const payload = {
      user_id: userId,
      telegram_id: telegramId,
      data: normalizedState,
      updated_at: new Date().toISOString(),
    };

    console.log('[Supabase] saveRemote payload:', payload);

    const { data, error, status, statusText } = await supabase
      .from('game_state')
      .upsert(payload, {
        onConflict: telegramId ? 'telegram_id' : 'user_id',
      })
      .select();

    console.log('[Supabase] saveRemote result:', {
      data,
      error,
      status,
      statusText,
    });

    if (error) {
      console.warn('[Supabase] save failed', error);
    }
  } catch (error) {
    console.warn('[Supabase] Remote save crashed', error);
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
