import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import {
  buyFarmItem,
  getFarmTelegramId,
  getFarmUserErrorMessage,
  harvestFarmPlot,
  loadFarmInventory,
  loadFarmPlots,
  plantFarmSeed,
  rakeFarmPlot,
  sellFarmItem,
  tillFarmPlot,
  waterFarmPlot,
} from './farmApi.js';
import { FARM_ACTION_DURATION_MS, FARM_ITEMS, FARM_MAX_ACTIVE_PLOTS } from './farmConfig.js';
import './farm.css';

const FARM_PLOT_INTERACTION_RADIUS_PX = 112;
const FARM_PLOT_INTERACTION_RADIUS_MOBILE_PX = 148;
const FARM_SCAN_INTERVAL_MS = 180;
const FARM_PLOTS_FALLBACK_REFRESH_MS = 9000;

function isMobileGameplayDevice() {
  return navigator.maxTouchPoints > 0 && Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 920;
}

function isTypingTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable === true;
}

function isInteractKey(event) {
  const key = String(event?.key || '').toLowerCase();
  return event?.code === 'KeyE' || key === 'e' || key === 'у';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function localTgId() {
  return getFarmTelegramId();
}

function normalizeFarmCrop(value) {
  return String(value || '').toLowerCase() === 'apple' ? 'apple' : 'wheat';
}

function farmCropLabel(value) {
  return normalizeFarmCrop(value) === 'apple' ? 'яблоки' : 'пшеница';
}

function farmSeedTypeForCrop(value) {
  return normalizeFarmCrop(value) === 'apple' ? 'farm_seed_apple' : 'farm_seed_wheat';
}

function emitToast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
}

function publishInventory(result) {
  const payload = result?.inventory && typeof result.inventory === 'object' ? result.inventory : result;
  const items = Array.isArray(payload?.items) ? payload.items : [];

  window.__MN_FARM_INVENTORY_ITEMS__ = items.map((item) => ({ ...item }));
  window.__MN_FARM_INVENTORY_STATE__ = payload || {};
  window.dispatchEvent(new CustomEvent('mn:farm-inventory-changed', {
    detail: { inventory: payload || {}, items: window.__MN_FARM_INVENTORY_ITEMS__ },
  }));

  const balance = Number(payload?.balance);
  if (Number.isFinite(balance)) {
    state.player = { ...(state.player || {}), balance };
    window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
      detail: { balance, source: 'farm_job' },
    }));
  }

  return payload || {};
}

function normalizePlot(row = {}) {
  return {
    id: String(row.id || ''),
    cityId: String(row.city_id || row.cityId || ''),
    fieldObjectId: String(row.field_object_id || row.fieldObjectId || ''),
    ownerTgId: String(row.owner_tg_id || row.ownerTgId || ''),
    x: clamp(row.x, 0, 100),
    y: clamp(row.y, 0, 100),
    cropType: String(row.crop_type || row.cropType || ''),
    stage: String(row.stage || 'tilled'),
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

function farmModalMarkup() {
  return `
    <div class="mn-farm-modal" data-farm-modal hidden aria-hidden="true">
      <button class="mn-farm-modal-backdrop" type="button" data-farm-close aria-label="Закрыть"></button>
      <section class="mn-farm-panel" role="dialog" aria-modal="true" aria-labelledby="mn-farm-title">
        <header>
          <span>
            <small>Работа · ферма</small>
            <strong id="mn-farm-title">Снабжение фермы</strong>
          </span>
          <button type="button" data-farm-close aria-label="Закрыть">×</button>
        </header>
        <nav class="mn-farm-tabs" aria-label="Разделы фермы">
          <button type="button" data-farm-tab="tools" data-active="true">Инструменты</button>
          <button type="button" data-farm-tab="seeds">Семена</button>
          <button type="button" data-farm-tab="sell">Продажа</button>
        </nav>
        <div class="mn-farm-cycle-guide" aria-label="Порядок работы на ферме">
          <span><b>1</b>Тяпка</span><i>→</i><span><b>2</b>Семена</span><i>→</i><span><b>3</b>Грабли</span><i>→</i><span><b>4</b>Вода</span><i>→</i><span><b>5</b>Сбор</span>
        </div>
        <div class="mn-farm-tab-page" data-farm-page="tools">
          <button type="button" class="mn-farm-shop-row" data-farm-buy="farm_hoe">
            <i class="mn-farm-glyph is-hoe" aria-hidden="true"></i><span><b>Тяпка</b><small>Без прочности · для подготовки земли</small></span><strong>2 ₴</strong>
          </button>
          <button type="button" class="mn-farm-shop-row" data-farm-buy="farm_rake">
            <i class="mn-farm-glyph is-rake" aria-hidden="true"></i><span><b>Грабли</b><small>Без прочности · обработка после посадки</small></span><strong>2 ₴</strong>
          </button>
          <button type="button" class="mn-farm-shop-row" data-farm-buy="farm_water_bottle">
            <i class="mn-farm-glyph is-water" aria-hidden="true"></i><span><b>Бутылка воды</b><small>Одной бутылки хватает на 2 посадки</small></span><strong>5 ₴</strong>
          </button>
        </div>
        <div class="mn-farm-tab-page" data-farm-page="seeds" hidden>
          <button type="button" class="mn-farm-shop-row" data-farm-buy="farm_seed_apple">
            <i class="mn-farm-glyph is-apple-seed" aria-hidden="true"></i><span><b>Семена яблони</b><small>Для яблочного поля · выдаются бесплатно</small></span><strong>0 ₴</strong>
          </button>
          <button type="button" class="mn-farm-shop-row" data-farm-buy="farm_seed_wheat">
            <i class="mn-farm-glyph is-wheat-seed" aria-hidden="true"></i><span><b>Семена пшеницы</b><small>Для пшеничного поля · выдаются бесплатно</small></span><strong>0 ₴</strong>
          </button>
        </div>
        <div class="mn-farm-tab-page" data-farm-page="sell" hidden>
          <div class="mn-farm-sale-row" data-farm-sale-row="farm_apple">
            <i class="mn-farm-glyph is-apple" aria-hidden="true"></i>
            <span><b>Яблоко</b><small><em data-farm-sale-count="farm_apple">0</em> шт. · 10 ₴/шт.</small></span>
            <div><button type="button" data-farm-sell="farm_apple" data-quantity="1">1 шт.</button><button type="button" data-farm-sell="farm_apple" data-quantity="0">Всё</button></div>
          </div>
          <div class="mn-farm-sale-row" data-farm-sale-row="farm_wheat">
            <i class="mn-farm-glyph is-wheat" aria-hidden="true"></i>
            <span><b>Пшеница</b><small><em data-farm-sale-count="farm_wheat">0</em> шт. · 35 ₴/шт.</small></span>
            <div><button type="button" data-farm-sell="farm_wheat" data-quantity="1">1 шт.</button><button type="button" data-farm-sell="farm_wheat" data-quantity="0">Всё</button></div>
          </div>
        </div>
        <footer>
          <span>Активные посадки</span><b><em data-farm-active-plots>0</em> / ${FARM_MAX_ACTIVE_PLOTS}</b>
          <small data-farm-status></small>
        </footer>
      </section>
    </div>`;
}

function farmActionMarkup() {
  return `
    <button type="button" class="mn-farm-action-hint" data-farm-action-hint hidden>
      <b>E / У</b><span data-farm-action-label>Действие</span>
    </button>
    <div class="mn-farm-progress" data-farm-progress hidden aria-live="polite">
      <span data-farm-progress-label>Работа</span>
      <i><b data-farm-progress-fill></b></i>
      <small>3 сек.</small>
    </div>`;
}

export function enableFarmFeature({ root, viewport, cityId, playerPosition } = {}) {
  if (!root || !viewport || !cityId || !playerPosition) return () => {};

  document.querySelector('[data-farm-modal]')?.remove();
  document.querySelector('[data-farm-action-hint]')?.remove();
  document.querySelector('[data-farm-progress]')?.remove();

  document.body.insertAdjacentHTML('beforeend', farmModalMarkup());
  root.insertAdjacentHTML('beforeend', farmActionMarkup());

  const modal = document.querySelector('[data-farm-modal]');
  const panel = modal?.querySelector('.mn-farm-panel');
  const tabButtons = [...(modal?.querySelectorAll('[data-farm-tab]') || [])];
  const tabPages = [...(modal?.querySelectorAll('[data-farm-page]') || [])];
  const closeTargets = [...(modal?.querySelectorAll('[data-farm-close]') || [])];
  const status = modal?.querySelector('[data-farm-status]');
  const activePlotsEl = modal?.querySelector('[data-farm-active-plots]');
  const actionHint = root.querySelector('[data-farm-action-hint]');
  const actionLabel = actionHint?.querySelector('[data-farm-action-label]');
  const progress = root.querySelector('[data-farm-progress]');
  const progressLabel = progress?.querySelector('[data-farm-progress-label]');
  const progressFill = progress?.querySelector('[data-farm-progress-fill]');

  const plotLayer = document.createElement('div');
  plotLayer.className = 'mn-farm-plots-layer';
  plotLayer.dataset.cityId = String(cityId);
  viewport.appendChild(plotLayer);

  let destroyed = false;
  let busy = false;
  let plots = [];
  let nearestPlot = null;
  let inventoryState = { items: [], activePlots: 0, maxPlots: FARM_MAX_ACTIVE_PLOTS };
  let scanTimer = 0;
  let fallbackRefreshTimer = 0;
  let realtimeChannel = null;

  function setStatus(message = '', type = 'info') {
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
  }

  function itemQuantity(itemType) {
    return Number(inventoryState?.items?.find?.((item) => item.itemType === itemType)?.quantity || 0);
  }

  function renderInventoryState(nextState = inventoryState) {
    inventoryState = nextState && typeof nextState === 'object' ? nextState : inventoryState;
    if (activePlotsEl) activePlotsEl.textContent = String(Number(inventoryState.activePlots || 0));

    ['farm_apple', 'farm_wheat'].forEach((itemType) => {
      modal?.querySelectorAll(`[data-farm-sale-count="${itemType}"]`).forEach((element) => {
        element.textContent = String(itemQuantity(itemType));
      });
      modal?.querySelectorAll(`[data-farm-sale-row="${itemType}"] button`).forEach((button) => {
        button.disabled = itemQuantity(itemType) <= 0 || busy;
      });
    });

    modal?.querySelectorAll('[data-farm-buy]').forEach((button) => {
      const itemType = button.dataset.farmBuy;
      const permanent = FARM_ITEMS[itemType]?.permanent === true;
      button.disabled = busy || (permanent && itemQuantity(itemType) > 0);
      button.dataset.owned = permanent && itemQuantity(itemType) > 0 ? 'true' : 'false';
    });
  }

  async function refreshInventory({ silent = true } = {}) {
    try {
      const result = await loadFarmInventory();
      renderInventoryState(publishInventory(result));
      return inventoryState;
    } catch (error) {
      if (!silent) setStatus(getFarmUserErrorMessage(error), 'error');
      return inventoryState;
    }
  }

  function plotClass(plot) {
    return [
      'mn-farm-plot',
      `is-${plot.stage || 'tilled'}`,
      plot.cropType ? `crop-${plot.cropType}` : '',
      plot.ownerTgId === localTgId() ? 'is-owned' : 'is-foreign',
    ].filter(Boolean).join(' ');
  }

  function renderPlots() {
    const fragment = document.createDocumentFragment();
    plots.forEach((plot) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.tabIndex = -1;
      element.className = plotClass(plot);
      element.dataset.farmPlotId = plot.id;
      element.style.left = `${plot.x}%`;
      element.style.top = `${plot.y}%`;
      element.setAttribute('aria-label', plot.ownerTgId === localTgId() ? 'Ваша посадка' : 'Посадка другого игрока');
      fragment.appendChild(element);
    });
    plotLayer.replaceChildren(fragment);
  }

  function upsertPlot(row) {
    const next = normalizePlot(row);
    if (!next.id || next.cityId !== String(cityId)) return;
    const index = plots.findIndex((plot) => plot.id === next.id);
    if (index >= 0) {
      plots = plots.slice();
      plots[index] = next;
    } else {
      plots = [...plots, next];
    }
    renderPlots();
  }

  function removePlot(id) {
    const key = String(id || '');
    plots = plots.filter((plot) => plot.id !== key);
    renderPlots();
  }

  async function refreshPlots() {
    try {
      const rows = await loadFarmPlots(cityId);
      if (destroyed) return;
      plots = rows.map(normalizePlot).filter((plot) => plot.id);
      renderPlots();
    } catch (error) {
      console.warn('[farm] plot load failed:', error);
    }
  }

  function getPlotDistancePx(plot) {
    const rect = viewport.getBoundingClientRect();
    if (!rect.width || !rect.height) return Number.POSITIVE_INFINITY;
    return Math.hypot(
      ((plot.x - Number(playerPosition.x || 50)) / 100) * rect.width,
      ((plot.y - Number(playerPosition.y || 50)) / 100) * rect.height,
    );
  }

  function getNearestOwnedPlot(stage = '', cropType = '') {
    const tgId = localTgId();
    const radius = isMobileGameplayDevice() ? FARM_PLOT_INTERACTION_RADIUS_MOBILE_PX : FARM_PLOT_INTERACTION_RADIUS_PX;
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    plots.forEach((plot) => {
      if (plot.ownerTgId !== tgId) return;
      if (stage && plot.stage !== stage) return;
      if (cropType && normalizeFarmCrop(plot.cropType) !== normalizeFarmCrop(cropType)) return;
      const distance = getPlotDistancePx(plot);
      if (distance <= radius && distance < bestDistance) {
        best = plot;
        bestDistance = distance;
      }
    });

    return best;
  }

  function getPlotAction(plot) {
    if (!plot) return null;
    if (plot.stage === 'tilled') return { label: `Шаг 2/5 · ${farmCropLabel(plot.cropType)} · семена через инвентарь`, action: 'plant_hint' };
    if (plot.stage === 'seeded') return { label: 'Шаг 3/5 · обработать граблями', action: 'rake' };
    if (plot.stage === 'raked') return { label: 'Шаг 4/5 · полить посадку', action: 'water' };
    if (plot.stage === 'ready') return { label: 'Шаг 5/5 · собрать урожай', action: 'harvest' };
    return null;
  }

  function updateNearestPlot() {
    if (
      destroyed || busy || modal?.hidden === false || window.__MN_INTERIOR_ACTIVE__ === true ||
      document.body.classList.contains('mn-inventory-open') ||
      document.body.classList.contains('admin-mode') ||
      document.body.classList.contains('mn-player-interaction-open') ||
      document.body.classList.contains('mn-house-trade-open')
    ) {
      nearestPlot = null;
      window.__MN_FARM_NEAR_OWN_PLOT__ = false;
      if (actionHint) actionHint.hidden = true;
      return;
    }

    nearestPlot = getNearestOwnedPlot();
    window.__MN_FARM_NEAR_OWN_PLOT__ = Boolean(nearestPlot);
    const action = getPlotAction(nearestPlot);
    if (!actionHint || !action) {
      if (actionHint) actionHint.hidden = true;
      return;
    }

    actionHint.hidden = false;
    actionHint.dataset.action = action.action;
    if (actionLabel) actionLabel.textContent = action.label;
    const key = actionHint.querySelector('b');
    if (key) key.textContent = isMobileGameplayDevice() ? 'Нажать' : 'E / У';
  }

  function openModal() {
    if (!modal || busy) return;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-farm-modal-open');
    void refreshInventory({ silent: false });
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mn-farm-modal-open');
    setStatus('');
  }

  function setTab(tab) {
    tabButtons.forEach((button) => { button.dataset.active = button.dataset.farmTab === tab ? 'true' : 'false'; });
    tabPages.forEach((page) => { page.hidden = page.dataset.farmPage !== tab; });
  }

  function getPlotElement(plotOrId) {
    const id = typeof plotOrId === 'string' ? plotOrId : plotOrId?.id;
    return id ? plotLayer.querySelector(`[data-farm-plot-id="${CSS.escape(String(id))}"]`) : null;
  }

  function getFieldWorkPoint(object) {
    const payload = object?.payload || {};
    const centerX = clamp(object?.x, 0, 100);
    const centerY = clamp(object?.y, 0, 100);
    const width = clamp(payload.renderWidth || 8, 0.8, 30);
    const height = clamp(payload.renderHeight || 8, 0.8, 30);
    const margin = 0.34;
    const step = 1.55;
    const left = Math.max(0, centerX - width / 2);
    const right = Math.min(100, centerX + width / 2);
    const top = Math.max(0, centerY - height / 2);
    const bottom = Math.min(100, centerY + height / 2);
    const usableWidth = Math.max(0, (right - left) - margin * 2);
    const usableHeight = Math.max(0, (bottom - top) - margin * 2);
    const cols = Math.max(1, Math.floor(usableWidth / step) + 1);
    const rows = Math.max(1, Math.floor(usableHeight / step) + 1);
    const playerX = Number(playerPosition.x || centerX);
    const playerY = Number(playerPosition.y || centerY);
    const candidates = [];

    for (let gx = 0; gx < cols; gx += 1) {
      for (let gy = 0; gy < rows; gy += 1) {
        const x = cols <= 1 ? (left + right) / 2 : (left + margin) + gx * (usableWidth / (cols - 1));
        const y = rows <= 1 ? (top + bottom) / 2 : (top + margin) + gy * (usableHeight / (rows - 1));
        const occupied = plots.some((plot) =>
          String(plot.fieldObjectId) === String(object?.id || '') && Math.hypot(plot.x - x, plot.y - y) < 0.68
        );
        if (occupied) continue;
        candidates.push({ x, y, distance: Math.hypot(x - playerX, y - playerY) });
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0] || { x: centerX, y: centerY };
  }

  function createFieldWorkFx(kind, x, y) {
    const element = document.createElement('div');
    element.className = `mn-farm-work-fx is-${kind}`;
    element.style.left = `${clamp(x, 0, 100)}%`;
    element.style.top = `${clamp(y, 0, 100)}%`;
    element.setAttribute('aria-hidden', 'true');
    plotLayer.appendChild(element);
    requestAnimationFrame(() => element.classList.add('is-running'));
    return element;
  }

  async function runPlotTimedAction(plot, label, visualClass, callback) {
    const element = getPlotElement(plot);
    if (element && visualClass) element.classList.add(visualClass);
    try {
      return await runTimedAction(label, callback);
    } finally {
      element?.classList.remove(visualClass);
    }
  }

  async function runTimedAction(label, callback) {
    if (busy || window.__MN_PLAYER_CONTROLS_LOCKED__ === true) return null;
    busy = true;
    window.__MN_PLAYER_CONTROLS_LOCKED__ = true;
    renderInventoryState();
    if (actionHint) actionHint.hidden = true;
    if (progress) progress.hidden = false;
    if (progressLabel) progressLabel.textContent = label;
    if (progressFill) {
      progressFill.style.transition = 'none';
      progressFill.style.width = '0%';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          progressFill.style.transition = `width ${FARM_ACTION_DURATION_MS}ms linear`;
          progressFill.style.width = '100%';
        });
      });
    }

    await new Promise((resolve) => setTimeout(resolve, FARM_ACTION_DURATION_MS));

    try {
      const result = await callback();
      const nextInventory = result?.inventory || result;
      if (nextInventory?.items) renderInventoryState(publishInventory(nextInventory));
      return result;
    } catch (error) {
      const message = getFarmUserErrorMessage(error);
      emitToast(message, 'error');
      setStatus(message, 'error');
      return null;
    } finally {
      if (progress) progress.hidden = true;
      if (progressFill) {
        progressFill.style.transition = 'none';
        progressFill.style.width = '0%';
      }
      window.__MN_PLAYER_CONTROLS_LOCKED__ = false;
      busy = false;
      renderInventoryState();
      updateNearestPlot();
    }
  }

  async function performPlotAction(plot = nearestPlot) {
    if (!plot) return false;
    const action = getPlotAction(plot);
    if (!action) return false;

    if (action.action === 'plant_hint') {
      const crop = normalizeFarmCrop(plot.cropType);
      const seedType = farmSeedTypeForCrop(crop);
      if (itemQuantity(seedType) <= 0) {
        emitToast(`Для этого поля нужны семена: ${farmCropLabel(crop)}. Возьмите их на точке снабжения во вкладке «Семена».`, 'info');
      } else {
        emitToast(`Шаг 2/5: откройте инвентарь → ${farmCropLabel(crop)} → «Посадить».`, 'info');
      }
      return true;
    }

    if (action.action === 'rake') {
      if (itemQuantity('farm_rake') <= 0) { emitToast('Сначала возьмите грабли в снабжении фермы.', 'error'); return true; }
      const result = await runPlotTimedAction(plot, 'Шаг 3/5 · работаем граблями', 'is-raking-now', () => rakeFarmPlot(plot.id));
      if (result) emitToast('Шаг 3 готов. Теперь полейте посадку водой.', 'success');
      return true;
    }

    if (action.action === 'water') {
      if (Number(inventoryState?.items?.find?.((item) => item.itemType === 'farm_water_bottle')?.waterUses || 0) <= 0) { emitToast('Нужна вода. Купите бутылку в снабжении фермы.', 'error'); return true; }
      const result = await runPlotTimedAction(plot, 'Шаг 4/5 · поливаем посадку', 'is-watering-now', () => waterFarmPlot(plot.id));
      if (result) emitToast('Шаг 4 готов. Теперь соберите урожай.', 'success');
      return true;
    }

    if (action.action === 'harvest') {
      const result = await runPlotTimedAction(plot, 'Шаг 5/5 · собираем урожай', 'is-harvesting-now', () => harvestFarmPlot(plot.id));
      if (result) {
        removePlot(plot.id);
        emitToast(result.harvestedItemType === 'farm_wheat' ? 'Получено: пшеница ×1.' : 'Получено: яблоко ×1.', 'success');
      }
      return true;
    }

    return false;
  }

  async function handleFarmObject(object) {
    const type = String(object?.type || object?.payload?.jobType || '');
    if (type === 'farm_station') {
      openModal();
      return;
    }

    if (type === 'farm_field') {
      if (itemQuantity('farm_hoe') <= 0) {
        emitToast('Шаг 1/5: сначала возьмите тяпку в снабжении фермы.', 'error');
        return;
      }

      const fieldCrop = normalizeFarmCrop(object?.payload?.fieldCrop || object?.payload?.cropType || object?.payload?.farmCrop);
      const workPoint = getFieldWorkPoint(object);
      const fx = createFieldWorkFx('tilling', workPoint.x, workPoint.y);
      const result = await runTimedAction(`Шаг 1/5 · готовим поле: ${farmCropLabel(fieldCrop)}`, () => tillFarmPlot({
        cityId,
        fieldObjectId: String(object.id || ''),
        x: Number(playerPosition.x || 50),
        y: Number(playerPosition.y || 50),
      }));
      fx.classList.add('is-finished');
      window.setTimeout(() => fx.remove(), 320);
      if (result?.plot) {
        upsertPlot(result.plot);
        const crop = normalizeFarmCrop(result.plot.crop_type || result.plot.cropType || fieldCrop);
        const seedType = farmSeedTypeForCrop(crop);
        emitToast(
          itemQuantity(seedType) > 0
            ? `Шаг 1 готов. Поле: ${farmCropLabel(crop)}. Теперь откройте инвентарь и посадите семя.`
            : `Шаг 1 готов. Поле: ${farmCropLabel(crop)}. Семян нет — возьмите их на снабжении, вкладка «Семена».`,
          'success'
        );
      }
    }
  }

  async function handleInventoryPlant(event) {
    const detail = event?.detail || {};
    const itemType = String(detail.itemType || '');
    const cropType = itemType === 'farm_seed_apple' ? 'apple' : itemType === 'farm_seed_wheat' ? 'wheat' : '';
    if (!cropType) return;

    const plot = getNearestOwnedPlot('tilled', cropType);
    if (!plot) {
      const otherPlot = getNearestOwnedPlot('tilled');
      if (otherPlot) {
        emitToast(`Эта грядка предназначена для культуры: ${farmCropLabel(otherPlot.cropType)}. Используйте соответствующие семена.`, 'error');
      } else {
        emitToast(`Сначала вспашите свободную ячейку на поле «${farmCropLabel(cropType)}».`, 'error');
      }
      window.dispatchEvent(new CustomEvent('mn:farm-inventory-action-result', { detail: { ok: false, itemType } }));
      return;
    }

    const result = await runPlotTimedAction(
      plot,
      cropType === 'wheat' ? 'Шаг 2/5 · сажаем пшеницу' : 'Шаг 2/5 · сажаем яблоню',
      'is-planting-now',
      () => plantFarmSeed({ plotId: plot.id, cropType }),
    );

    if (result?.plot) {
      upsertPlot(result.plot);
      emitToast('Шаг 2 готов. Теперь подойдите к посадке и обработайте её граблями.', 'success');
    }

    window.dispatchEvent(new CustomEvent('mn:farm-inventory-action-result', {
      detail: { ok: Boolean(result), itemType, result },
    }));
  }

  async function handleBuy(event) {
    const button = event.target?.closest?.('[data-farm-buy]');
    if (!button || busy) return;
    const itemType = button.dataset.farmBuy;
    busy = true;
    renderInventoryState();
    setStatus('Получаем предмет…');
    try {
      const result = await buyFarmItem(itemType);
      renderInventoryState(publishInventory(result));
      const item = FARM_ITEMS[itemType];
      setStatus(`${item?.label || 'Предмет'} получен.`, 'success');
    } catch (error) {
      setStatus(getFarmUserErrorMessage(error), 'error');
    } finally {
      busy = false;
      renderInventoryState();
    }
  }

  async function handleSell(event) {
    const button = event.target?.closest?.('[data-farm-sell]');
    if (!button || busy) return;
    const itemType = button.dataset.farmSell;
    const quantity = Math.max(0, Math.floor(Number(button.dataset.quantity) || 0));
    busy = true;
    renderInventoryState();
    setStatus('Проводим продажу…');
    try {
      const result = await sellFarmItem({ itemType, quantity });
      renderInventoryState(publishInventory(result));
      setStatus(`Продано ${result.soldQuantity || 0} шт. · +${Number(result.totalPrice || 0).toLocaleString('ru-RU')} ₴`, 'success');
    } catch (error) {
      setStatus(getFarmUserErrorMessage(error), 'error');
    } finally {
      busy = false;
      renderInventoryState();
    }
  }

  function handleKeyDown(event) {
    if (event.repeat || !isInteractKey(event) || isTypingTarget(event.target)) return;
    if (
      window.__MN_INTERIOR_ACTIVE__ === true || modal?.hidden === false || busy ||
      document.body.classList.contains('mn-inventory-open') ||
      document.body.classList.contains('admin-mode') ||
      document.body.classList.contains('mn-player-interaction-open') ||
      document.body.classList.contains('mn-house-trade-open')
    ) return;
    if (!nearestPlot) return;

    // A freshly tilled plot is planted from inventory. Do not capture E/У here:
    // the same key must remain available for a nearby supply station, otherwise
    // the player can get stuck without seeds after tilling.
    if (getPlotAction(nearestPlot)?.action === 'plant_hint') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void performPlotAction(nearestPlot);
  }

  function handlePlotPointer(event) {
    const button = event.target?.closest?.('[data-farm-plot-id]');
    if (!button || !isMobileGameplayDevice() || busy) return;
    const plot = plots.find((item) => item.id === button.dataset.farmPlotId);
    if (!plot || plot.ownerTgId !== localTgId()) return;
    if (getPlotDistancePx(plot) > FARM_PLOT_INTERACTION_RADIUS_MOBILE_PX) {
      emitToast('Подойдите ближе к посадке.', 'info');
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void performPlotAction(plot);
  }

  function handleFarmObjectEvent(event) {
    const object = event?.detail?.object;
    if (!object) return;
    void handleFarmObject(object);
  }

  tabButtons.forEach((button) => button.addEventListener('click', () => setTab(button.dataset.farmTab)));
  closeTargets.forEach((button) => button.addEventListener('click', closeModal));
  panel?.addEventListener('click', handleBuy);
  panel?.addEventListener('click', handleSell);
  actionHint?.addEventListener('click', () => void performPlotAction(nearestPlot));
  plotLayer.addEventListener('pointerdown', handlePlotPointer, true);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('mn:farm-object-action', handleFarmObjectEvent);
  window.addEventListener('mn:farm-inventory-action', handleInventoryPlant);

  realtimeChannel = supabase
    .channel(`farm-plots:${cityId}:${Math.random().toString(16).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'farm_plots', filter: `city_id=eq.${cityId}` }, (payload) => {
      if (payload.eventType === 'DELETE') removePlot(payload.old?.id);
      else upsertPlot(payload.new);
      void refreshInventory({ silent: true });
    })
    .subscribe();

  scanTimer = window.setInterval(updateNearestPlot, FARM_SCAN_INTERVAL_MS);
  fallbackRefreshTimer = window.setInterval(() => {
    void refreshPlots();
    void refreshInventory({ silent: true });
  }, FARM_PLOTS_FALLBACK_REFRESH_MS);

  void refreshPlots();
  void refreshInventory({ silent: true });
  updateNearestPlot();

  return () => {
    destroyed = true;
    window.clearInterval(scanTimer);
    window.clearInterval(fallbackRefreshTimer);
    if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('mn:farm-object-action', handleFarmObjectEvent);
    window.removeEventListener('mn:farm-inventory-action', handleInventoryPlant);
    plotLayer.removeEventListener('pointerdown', handlePlotPointer, true);
    document.body.classList.remove('mn-farm-modal-open');
    modal?.remove();
    actionHint?.remove();
    progress?.remove();
    plotLayer.remove();
    window.__MN_FARM_NEAR_OWN_PLOT__ = false;
  };
}
