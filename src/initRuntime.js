import { getState, setState } from './state.js';
import { citiesBase } from './data/citiesBase.js';

export function initRuntime() {
  const st = getState();
  if (!Object.keys(st.citiesRuntime).length) {
    const blank = {};
    for (const id in citiesBase) blank[id] = {};
    setState('citiesRuntime', blank);           // заполнили нулями, сохранили
  }
}
