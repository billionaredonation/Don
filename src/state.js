// src/state.js
import { citiesBase } from './data/citiesBase.js';
import { supabase } from './supabaseClient.js';

/* ---------- 1. localStorage ---------- */

const LS_KEY = 'mn-game-state';

/*
  ВАЖНО:
  deviceId больше не используем для БД.

  Причина:
  - localStorage можно подделать;
  - deviceId можно поменять руками;
  - RLS не может проверить владельца deviceId.

  Теперь владелец строки определяется только через:
  auth.uid() === game_state.user_id
*/

/* ---------- 2. состояние по умолчанию ---------- */

const defaultState = {
  nickname: null,
  city: null,
  cityName: null,
  regionId: null,
  player: {},
  citiesRuntime: {},
};

/* ---------- 3. helpers ---------- */

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function normalizeLoadedState(loaded) {
  loaded.player = loaded.player || {};
  loaded.citiesRuntime = loaded.citiesRuntime || {};

  loaded.nickname = loaded.nickname || loaded.player.nickname || null;
  loaded.city = loaded.city || loaded.player.city || null;
  loaded.cityName = loaded.cityName || loaded.player.cityName || null;
  loaded.regionId = loaded.regionId || loaded.player.regionId || null;

  loaded.player.nickname = loaded.nickname;
  loaded.player.city = loaded.city;
  loaded.player.cityName = loaded.cityName;
  loaded.player.regionId = loaded.regionId;

  return loaded;
}

/* ---------- 4. локальная загрузка ---------- */

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

/* ---------- 5. глобальное состояние ---------- */

export let state = loadLocal();

export function getState() {
  return state;
}

/* ---------- 6. Supabase anonymous auth ---------- */

let userIdPromise = null;

async function getUserId() {
  if (userIdPromise) {
    return userIdPromise;
  }

  userIdPromise = resolveUserId();
  return userIdPromise;
}

async function resolveUserId() {
  console.log('[Supabase] resolveUserId started');

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  console.log('[Supabase] getSession result:', {
    hasSession: Boolean(sessionData?.session),
    userId: sessionData?.session?.user?.id || null,
    error: sessionError,
  });

  if (sessionError) {
    console.warn('[Supabase] getSession error', sessionError);
  }

  if (sessionData?.session?.user?.id) {
    console.log('[Supabase] existing user:', sessionData.session.user.id);
    return sessionData.session.user.id;
  }

  console.log('[Supabase] no session, signing in anonymously');

  const { data, error } = await supabase.auth.signInAnonymously();

  console.log('[Supabase] signInAnonymously result:', {
    userId: data?.user?.id || null,
    hasSession: Boolean(data?.session),
    error,
  });

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

/* ---------- 7. удалённая загрузка ---------- */

export async function loadRemote() {
  console.log('[Supabase] loadRemote started');

  try {
    const userId = await getUserId();

    console.log('[Supabase] loading game_state for user:', userId);

    const { data, error, status, statusText } = await supabase
      .from('game_state')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();

    console.log('[Supabase] loadRemote result:', {
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
      console.log('[Supabase] no remote state found, creating first row');
      await saveRemote();
      return;
    }

    const remoteData = data.data;

    const merged = Object.assign(
      clone(defaultState),
      state,
      remoteData
    );

    /*
      Обратная совместимость:
      если раньше где-то было state.runtime,
      переносим его в citiesRuntime.
    */
    if (remoteData.runtime && !remoteData.citiesRuntime) {
      merged.citiesRuntime = remoteData.runtime;
    }

    state = normalizeLoadedState(merged);
    saveLocal();

    console.log('[Supabase] remote state applied:', state);
  } catch (error) {
    console.warn('[Supabase] Remote load crashed. Local state used.', error);
  }
}

/* ---------- 8. сохранение ---------- */

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

    const payload = {
      user_id: userId,
      data: normalizeLoadedState(state),
      updated_at: new Date().toISOString(),
    };

    console.log('[Supabase] saveRemote payload:', payload);

    const { data, error, status, statusText } = await supabase
      .from('game_state')
      .upsert(payload, {
        onConflict: 'user_id',
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

/* ---------- 9. mutators ---------- */

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
