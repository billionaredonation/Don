import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import {
  buyFarmItem,
  getFarmUserErrorMessage,
  harvestFarmPlant,
  loadFarmInventory,
  loadFarmPlantStates,
  loadFarmWaterAvailability,
  sellFarmItem,
  waterFarmPlant,
  weedFarmPlant,
} from './farmApi.js';
import { FARM_ITEMS, getFarmPlantType } from './farmConfig.js';
import { cancelFarmMiniGame, playFarmMiniGame } from './farmMiniGame.js';
import './farm.css';

const FARM_STATE_REFRESH_MS = 5000;
const FARM_INVENTORY_REFRESH_MS = 12000;
const FARM_RAKE_ASSET_URL = `${String(import.meta.env.BASE_URL || '/')}grabl.png`;

function isFarmPlantObject(object = {}) {
  const type = String(object.type || object?.payload?.jobType || '');
  return Boolean(getFarmPlantType(type));
}

function emitToast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
}

function normalizePlantState(row = {}) {
  return {
    plantObjectId: String(row.plantObjectId || row.plant_object_id || ''),
    cityId: String(row.cityId || row.city_id || ''),
    cropType: String(row.cropType || row.crop_type || ''),
    stage: String(row.stage || 'ready_to_weed'),
    readyAt: row.readyAt || row.ready_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  };
}

function plantStateUpdatedAt(stateRow) {
  const timestamp = new Date(stateRow?.updatedAt || stateRow?.updated_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function shouldReplacePlantState(current, next) {
  return !current || plantStateUpdatedAt(next) >= plantStateUpdatedAt(current);
}

function secondsUntil(readyAt) {
  const target = new Date(readyAt || 0).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - Date.now()) / 1000));
}

function formatRemaining(seconds) {
  const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (safe < 60) return `${safe} сек.`;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function farmModalMarkup() {
  return `
    <div class="mn-farm-modal" data-farm-modal hidden aria-hidden="true">
      <button class="mn-farm-modal-backdrop" type="button" data-farm-close aria-label="Закрыть"></button>
      <section class="mn-farm-panel" role="dialog" aria-modal="true" aria-labelledby="mn-farm-title">
        <header>
          <span><small>Работа · ферма</small><strong id="mn-farm-title">Фермерская лавка</strong></span>
          <button type="button" data-farm-close aria-label="Закрыть">×</button>
        </header>
        <nav class="mn-farm-tabs" aria-label="Разделы фермы">
          <button type="button" data-farm-tab="tools" data-active="true">Инструменты</button>
          <button type="button" data-farm-tab="sell">Продажа</button>
        </nav>
        <div class="mn-farm-cycle-guide" aria-label="Порядок работы на ферме">
          <span><b><img src="${FARM_RAKE_ASSET_URL}" alt=""></b>Прополоть</span>
          <i>→</i><span><b>💧</b>Полить</span>
          <i>→</i><span><b>✂️</b>Собрать</span>
        </div>
        <div class="mn-farm-tab-page" data-farm-page="tools">
          <button type="button" class="mn-farm-shop-row" data-farm-buy="farm_rake">
            <i class="mn-farm-glyph is-rake" aria-hidden="true"><img src="${FARM_RAKE_ASSET_URL}" alt=""></i>
            <span><b>Грабли</b><small>Постоянный инструмент для прополки</small></span><strong>2 ₴</strong>
          </button>
          <button type="button" class="mn-farm-shop-row" data-farm-buy="farm_scissors">
            <i class="mn-farm-glyph is-scissors" aria-hidden="true">✂️</i>
            <span><b>Ножницы</b><small>Постоянный инструмент для сбора</small></span><strong>2 ₴</strong>
          </button>
          <button type="button" class="mn-farm-shop-row" data-farm-buy="farm_water_bottle">
            <i class="mn-farm-glyph is-water" aria-hidden="true">💧</i>
            <span><b>Вода для полива</b><small>2 полива · с пестицидами, пить нельзя</small></span><strong>5 ₴</strong>
          </button>
        </div>
        <div class="mn-farm-tab-page" data-farm-page="sell" hidden>
          <div class="mn-farm-sale-row" data-farm-sale-row="farm_apple">
            <i class="mn-farm-glyph" aria-hidden="true">🍎</i>
            <span><b>Яблоко</b><small><em data-farm-sale-count="farm_apple">0</em> шт. · 10 ₴/шт.</small></span>
            <div><button type="button" data-farm-sell="farm_apple" data-quantity="1">1 шт.</button><button type="button" data-farm-sell="farm_apple" data-quantity="0">Всё</button></div>
          </div>
          <div class="mn-farm-sale-row" data-farm-sale-row="farm_wheat">
            <i class="mn-farm-glyph" aria-hidden="true">🌾</i>
            <span><b>Пшеница</b><small><em data-farm-sale-count="farm_wheat">0</em> шт. · 35 ₴/шт.</small></span>
            <div><button type="button" data-farm-sell="farm_wheat" data-quantity="1">1 шт.</button><button type="button" data-farm-sell="farm_wheat" data-quantity="0">Всё</button></div>
          </div>
          <div class="mn-farm-sale-row" data-farm-sale-row="farm_orange">
            <i class="mn-farm-glyph" aria-hidden="true">🍊</i>
            <span><b>Апельсин</b><small><em data-farm-sale-count="farm_orange">0</em> шт. · 15 ₴/шт.</small></span>
            <div><button type="button" data-farm-sell="farm_orange" data-quantity="1">1 шт.</button><button type="button" data-farm-sell="farm_orange" data-quantity="0">Всё</button></div>
          </div>
          <div class="mn-farm-sale-row" data-farm-sale-row="farm_corn">
            <i class="mn-farm-glyph" aria-hidden="true">🌽</i>
            <span><b>Кукуруза</b><small><em data-farm-sale-count="farm_corn">0</em> шт. · 30 ₴/шт.</small></span>
            <div><button type="button" data-farm-sell="farm_corn" data-quantity="1">1 шт.</button><button type="button" data-farm-sell="farm_corn" data-quantity="0">Всё</button></div>
          </div>
        </div>
        <footer><small data-farm-status></small></footer>
      </section>
    </div>`;
}

export function enableFarmFeature({ root, cityId } = {}) {
  if (!root || !cityId) return () => {};

  document.querySelector('[data-farm-modal]')?.remove();
  cancelFarmMiniGame();
  document.body.insertAdjacentHTML('beforeend', farmModalMarkup());

  const modal = document.querySelector('[data-farm-modal]');
  const panel = modal?.querySelector('.mn-farm-panel');
  const status = modal?.querySelector('[data-farm-status]');
  const tabButtons = [...(modal?.querySelectorAll('[data-farm-tab]') || [])];
  const tabPages = [...(modal?.querySelectorAll('[data-farm-page]') || [])];

  let destroyed = false;
  let busy = false;
  let inventoryState = { items: [] };
  let plantStates = new Map();
  let plantStatesReady = false;
  let plantStatesLoadPromise = null;
  let stateRefreshTimer = 0;
  let inventoryRefreshTimer = 0;
  let realtimeChannel = null;

  window.__MN_FARM_PLANT_STATES_READY__ = false;

  function setStatus(message = '', type = 'info') {
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
  }

  function publishPlantStates() {
    window.__MN_FARM_PLANT_STATES__ = Object.fromEntries(
      [...plantStates.entries()].map(([id, value]) => [id, { ...value }]),
    );
    document.querySelectorAll('[data-map-object-id]').forEach((element) => {
      const objectId = String(element.dataset.mapObjectId || '');
      const saved = plantStates.get(objectId);
      const waiting = saved?.stage === 'cooldown' && secondsUntil(saved.readyAt) > 0;
      element.classList.toggle('is-farm-plant-cooldown', waiting);
      if (saved?.stage) element.dataset.farmPlantStage = saved.stage;
      else delete element.dataset.farmPlantStage;
    });
    window.dispatchEvent(new CustomEvent('mn:farm-plant-states-changed', {
      detail: { cityId, states: window.__MN_FARM_PLANT_STATES__ },
    }));
  }

  function upsertPlantState(row) {
    const next = normalizePlantState(row);
    if (!next.plantObjectId || (next.cityId && next.cityId !== String(cityId))) return;
    const current = plantStates.get(next.plantObjectId);
    if (!shouldReplacePlantState(current, next)) return;
    plantStates.set(next.plantObjectId, next);
    publishPlantStates();
  }

  function removePlantState(plantObjectId) {
    plantStates.delete(String(plantObjectId || ''));
    publishPlantStates();
  }

  function publishInventory(result) {
    const payload = result?.inventory && typeof result.inventory === 'object' ? result.inventory : result;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    inventoryState = payload && typeof payload === 'object' ? payload : { items };
    window.__MN_FARM_INVENTORY_ITEMS__ = items.map((item) => ({ ...item }));
    window.__MN_FARM_INVENTORY_STATE__ = inventoryState;
    window.dispatchEvent(new CustomEvent('mn:farm-inventory-changed', {
      detail: { inventory: inventoryState, items: window.__MN_FARM_INVENTORY_ITEMS__ },
    }));

    const balance = Number(inventoryState.balance);
    if (Number.isFinite(balance)) {
      state.player = { ...(state.player || {}), balance };
      window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
        detail: { balance, source: 'farm_job' },
      }));
    }
    renderInventory();
    return inventoryState;
  }

  function itemQuantity(itemType) {
    return Number(inventoryState?.items?.find?.((item) => item.itemType === itemType)?.quantity || 0);
  }

  function renderInventory() {
    ['farm_apple', 'farm_wheat', 'farm_orange', 'farm_corn'].forEach((itemType) => {
      modal?.querySelectorAll(`[data-farm-sale-count="${itemType}"]`).forEach((element) => {
        element.textContent = String(itemQuantity(itemType));
      });
      modal?.querySelectorAll(`[data-farm-sale-row="${itemType}"] button`).forEach((button) => {
        button.disabled = busy || itemQuantity(itemType) <= 0;
      });
    });

    modal?.querySelectorAll('[data-farm-buy]').forEach((button) => {
      const itemType = button.dataset.farmBuy;
      const owned = FARM_ITEMS[itemType]?.permanent === true && itemQuantity(itemType) > 0;
      const waterLoaded = itemType === 'farm_water_bottle' && itemQuantity(itemType) > 0;
      button.disabled = busy || owned || waterLoaded;
      button.dataset.owned = owned || waterLoaded ? 'true' : 'false';
    });
  }

  async function refreshInventory({ silent = true } = {}) {
    try {
      publishInventory(await loadFarmInventory());
    } catch (error) {
      if (!silent) setStatus(getFarmUserErrorMessage(error), 'error');
    }
  }

  function refreshPlantStates() {
    if (plantStatesLoadPromise) return plantStatesLoadPromise;

    plantStatesLoadPromise = (async () => {
      try {
        const result = await loadFarmPlantStates(cityId);
        if (destroyed) return false;
        const rows = Array.isArray(result?.states) ? result.states : Array.isArray(result) ? result : [];
        const mergedStates = new Map(plantStates);
        rows.map(normalizePlantState).filter((row) => row.plantObjectId).forEach((row) => {
          const current = mergedStates.get(row.plantObjectId);
          if (shouldReplacePlantState(current, row)) mergedStates.set(row.plantObjectId, row);
        });
        plantStates = mergedStates;
        plantStatesReady = true;
        window.__MN_FARM_PLANT_STATES_READY__ = true;
        publishPlantStates();
        return true;
      } catch (error) {
        console.warn('[farm] plant state refresh failed:', error);
        return false;
      } finally {
        plantStatesLoadPromise = null;
      }
    })();

    return plantStatesLoadPromise;
  }

  function openModal() {
    if (!modal || busy) return;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-farm-modal-open');
    void refreshInventory({ silent: false });
  }

  function closeModal() {
    if (!modal || busy) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mn-farm-modal-open');
    setStatus('');
  }

  function setTab(tab) {
    tabButtons.forEach((button) => { button.dataset.active = button.dataset.farmTab === tab ? 'true' : 'false'; });
    tabPages.forEach((page) => { page.hidden = page.dataset.farmPage !== tab; });
  }

  function getPlantAction(object) {
    const objectType = String(object?.type || object?.payload?.jobType || '');
    const plant = getFarmPlantType(objectType);
    if (!plant) return null;

    const saved = plantStates.get(String(object?.id || ''));
    if (!saved) return { action: 'weed', plant, remaining: 0 };
    if (saved.stage === 'cooldown') {
      const remaining = secondsUntil(saved.readyAt);
      return remaining > 0
        ? { action: 'wait', plant, remaining }
        : { action: 'weed', plant, remaining: 0 };
    }
    if (saved.stage === 'weeded') return { action: 'water', plant, remaining: 0 };
    if (saved.stage === 'watered') return { action: 'harvest', plant, remaining: 0 };
    return { action: 'weed', plant, remaining: 0 };
  }

  async function runMiniGameAction(action, callback) {
    if (busy || window.__MN_PLAYER_CONTROLS_LOCKED__ === true) return null;
    busy = true;
    window.__MN_PLAYER_CONTROLS_LOCKED__ = true;
    renderInventory();
    try {
      const gameResult = await playFarmMiniGame({ action });
      if (destroyed || gameResult.cancelled) return null;
      const result = await callback(gameResult.score);
      if (!result || typeof result !== 'object') return result;
      if (result?.state) upsertPlantState(result.state);
      if (result?.inventory) publishInventory(result.inventory);
      result.miniGameScore = Number(result.miniGameScore ?? gameResult.score);
      result.miniGameGrade = String(result.miniGameGrade || gameResult.grade);
      void refreshPlantStates();
      return result;
    } catch (error) {
      emitToast(getFarmUserErrorMessage(error), 'error');
      void refreshPlantStates();
      void refreshInventory({ silent: true });
      return null;
    } finally {
      window.__MN_PLAYER_CONTROLS_LOCKED__ = false;
      busy = false;
      renderInventory();
    }
  }

  async function workWithPlant(object) {
    if (!isFarmPlantObject(object) || busy) return;

    if (!plantStatesReady) {
      emitToast('Проверяем сохранённое состояние растения…', 'info');
      const loaded = await refreshPlantStates();
      if (!loaded) {
        emitToast('Не удалось загрузить состояние растения. Попробуйте ещё раз.', 'error');
        return;
      }
      if (busy) return;
    }

    const next = getPlantAction(object);
    if (!next) return;
    if (next.action === 'wait') {
      emitToast(`Растение ещё не готово. Подождите ${formatRemaining(next.remaining)}, чтобы прополоть.`, 'info');
      return;
    }

    const request = { cityId, plantObjectId: String(object.id || '') };
    if (next.action === 'weed') {
      const result = await runMiniGameAction('weed', (miniGameScore) => weedFarmPlant({ ...request, miniGameScore }));
      if (result) emitToast(`Растение прополото · точность ${result.miniGameScore}%. Теперь полейте его водой 💧`, 'success');
      return;
    }
    if (next.action === 'water') {
      try {
        const availability = await loadFarmWaterAvailability();
        if (availability?.hasWater !== true) {
          emitToast('Купите воду прежде чем начать обработку растения. Подойдёт вода из фермерской лавки или столовой.', 'error');
          return;
        }
      } catch (error) {
        emitToast(getFarmUserErrorMessage(error), 'error');
        return;
      }

      const result = await runMiniGameAction('water', (miniGameScore) => waterFarmPlant({ ...request, miniGameScore }));
      if (result) {
        if (result.waterSource === 'cafeteria') {
          window.dispatchEvent(new CustomEvent('mn:medical-inventory-changed'));
        }
        emitToast(`Растение полито · точность ${result.miniGameScore}%. Теперь соберите урожай ✂️`, 'success');
      }
      return;
    }
    if (next.action === 'harvest') {
      const result = await runMiniGameAction('harvest', (miniGameScore) => harvestFarmPlant({ ...request, miniGameScore }));
      if (result) {
        const harvested = FARM_ITEMS[result.harvestedItemType] || FARM_ITEMS[next.plant.harvestItemType];
        const quantity = Math.max(1, Number(result.harvestQuantity) || 1);
        const quality = Number(result.harvestQuality ?? result.miniGameScore) || 0;
        const item = `${harvested?.icon || next.plant.icon} ${harvested?.label || next.plant.label} ×${quantity}`;
        emitToast(`${item} · качество ${quality}%. Новый урожай через ${formatRemaining(result.respawnSeconds || next.plant.respawnSeconds)}.`, 'success');
      }
    }
  }

  async function handleBuy(event) {
    const button = event.target?.closest?.('[data-farm-buy]');
    if (!button || busy) return;
    const itemType = String(button.dataset.farmBuy || '');
    busy = true;
    renderInventory();
    setStatus('Покупаем предмет…');
    try {
      publishInventory(await buyFarmItem(itemType));
      setStatus(`${FARM_ITEMS[itemType]?.label || 'Предмет'} получен.`, 'success');
    } catch (error) {
      setStatus(getFarmUserErrorMessage(error), 'error');
    } finally {
      busy = false;
      renderInventory();
    }
  }

  async function handleSell(event) {
    const button = event.target?.closest?.('[data-farm-sell]');
    if (!button || busy) return;
    const itemType = String(button.dataset.farmSell || '');
    const quantity = Math.max(0, Math.floor(Number(button.dataset.quantity) || 0));
    busy = true;
    renderInventory();
    setStatus('Продаём урожай…');
    try {
      const result = await sellFarmItem({ itemType, quantity });
      publishInventory(result);
      setStatus(`Продано ${result.soldQuantity || 0} шт. · +${Number(result.totalPrice || 0).toLocaleString('ru-RU')} ₴`, 'success');
    } catch (error) {
      setStatus(getFarmUserErrorMessage(error), 'error');
    } finally {
      busy = false;
      renderInventory();
    }
  }

  function handleFarmObjectEvent(event) {
    const object = event?.detail?.object;
    const type = String(object?.type || object?.payload?.jobType || '');
    if (type === 'farm_station') {
      openModal();
    } else if (isFarmPlantObject(object)) {
      void workWithPlant(object);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && modal?.hidden === false) closeModal();
  }

  tabButtons.forEach((button) => button.addEventListener('click', () => setTab(button.dataset.farmTab)));
  modal?.querySelectorAll('[data-farm-close]').forEach((button) => button.addEventListener('click', closeModal));
  panel?.addEventListener('click', handleBuy);
  panel?.addEventListener('click', handleSell);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('mn:farm-object-action', handleFarmObjectEvent);

  realtimeChannel = supabase
    .channel(`farm-plants:${cityId}:${Math.random().toString(16).slice(2)}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'farm_plant_states',
      filter: `city_id=eq.${cityId}`,
    }, (payload) => {
      if (payload.eventType === 'DELETE') removePlantState(payload.old?.plant_object_id);
      else upsertPlantState(payload.new);
    })
    .subscribe();

  stateRefreshTimer = window.setInterval(refreshPlantStates, FARM_STATE_REFRESH_MS);
  inventoryRefreshTimer = window.setInterval(() => refreshInventory({ silent: true }), FARM_INVENTORY_REFRESH_MS);
  void refreshPlantStates();
  void refreshInventory({ silent: true });

  return () => {
    destroyed = true;
    window.clearInterval(stateRefreshTimer);
    window.clearInterval(inventoryRefreshTimer);
    if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('mn:farm-object-action', handleFarmObjectEvent);
    document.body.classList.remove('mn-farm-modal-open');
    modal?.remove();
    cancelFarmMiniGame();
    delete window.__MN_FARM_PLANT_STATES__;
    window.__MN_FARM_PLANT_STATES_READY__ = false;
  };
}
