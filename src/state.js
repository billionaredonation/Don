import { citiesBase } from './data/citiesBase.js';

const LS_KEY = 'mn-game-state';

const defaultState = {
  nickname: null,
  city: null,
  cityName: null,
  regionId: null,
  player: {},
  citiesRuntime: {}
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    const loaded = saved ? Object.assign(clone(defaultState), saved) : clone(defaultState);

    loaded.player = loaded.player || {};
    loaded.nickname = loaded.nickname || loaded.player.nickname || null;
    loaded.city = loaded.city || loaded.player.city || null;
    loaded.cityName = loaded.cityName || loaded.player.cityName || null;
    loaded.regionId = loaded.regionId || loaded.player.regionId || null;

    return loaded;
  } catch (error) {
    return clone(defaultState);
  }
}

export let state = load();

export function save() {
  state.player = state.player || {};
  state.player.nickname = state.nickname || null;
  state.player.city = state.city || null;
  state.player.cityName = state.cityName || null;
  state.player.regionId = state.regionId || null;

 try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Unable to save game state', error);
  }
}



export function getState() {
  return state;
}

export function setState(path, value) {
  const keys = path.split('.');
  let obj = state;

  keys.slice(0, -1).forEach((key) => {
    if (!obj[key]) obj[key] = {};
    obj = obj[key];
  });

  obj[keys[keys.length - 1]] = value;
  save();
}

export function updateRuntime(cityId, patch) {
  state.citiesRuntime[cityId] = Object.assign({}, state.citiesRuntime[cityId] || {}, patch);
  save();
}

export function initRuntime() {
  if (Object.keys(state.citiesRuntime || {}).length) return;

  const blank = {};

  for (const id in citiesBase) {
    blank[id] = {};
  }

  state.citiesRuntime = blank;
  save();
}


