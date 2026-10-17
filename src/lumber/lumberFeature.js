import { cities, normalizeCityId } from '../cities/index.js';
import { lumberOffersAction } from './lumberOffersApi.js';
import { syncBusinessUtilityGate } from '../utilities/businessUtilityGate.js';
import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import { publishPlayerSkills, getLumberjackSkillStatus } from '../player/playerSkillState.js';
import {
  chopLumberTree,
  getLumberUserErrorMessage,
  loadLumberInventory,
  loadLumberTreeStates,
  sawLumberLog,
  sellLumberItem,
  takeLumberTool,
} from './lumberApi.js';
import { LUMBER_ITEMS, LUMBER_LEVELS, getLumberTreeByObjectType } from './lumberConfig.js';
import { cancelLumberMiniGame, playLumberChopMiniGame, playLumberSawMiniGame } from './lumberMiniGame.js';
import { JOB_BUSINESS_TYPES, formatJobBusinessMoney } from '../jobs/jobBusinessConfig.js';
import {
  commitJobBusinessPayout,
  depositJobBusiness,
  getJobBusinessUserErrorMessage,
  loadJobBusinessSnapshot,
  purchaseJobBusiness,
  refundJobBusinessPayout,
  reserveJobBusinessPayout,
  setJobBusinessAssistant,
  withdrawJobBusiness,
} from '../jobs/jobBusinessApi.js';
import { jobBusinessPageMarkup } from '../jobs/jobBusinessUi.js';
import { renderBusinessStateSaleControl } from '../businessStateSale/businessStateSaleControl.js';
import { renderProcurementControls } from '../procurement/procurementControls.js';
import { setProcurementBudget } from '../procurement/procurementApi.js';
import { getPublicBusinessId, renderPublicBusinessId } from '../business/publicBusinessId.js';
import '../jobs/jobBusiness.css';
import './lumber.css';

const STATE_REFRESH_MS = 5000;
const INVENTORY_REFRESH_MS = 12000;
const LUMBER_BUSINESS_CONFIG = JOB_BUSINESS_TYPES.lumber;

function isLumberStreamObject(object = {}) {
  const type = String(object.type || object?.payload?.jobType || '');
  return type === 'lumber_station' || Boolean(getLumberTreeByObjectType(type));
}

function emitToast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
}

function secondsUntil(value) {
  const target = new Date(value || 0).getTime();
  return Number.isFinite(target) ? Math.max(0, Math.ceil((target - Date.now()) / 1000)) : 0;
}

function formatRemaining(seconds) {
  const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
  return safe < 60 ? `${safe} сек.` : `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function normalizeTreeState(row = {}) {
  return {
    treeObjectId: String(row.treeObjectId || row.tree_object_id || ''),
    cityId: String(row.cityId || row.city_id || ''),
    treeType: String(row.treeType || row.tree_type || ''),
    readyAt: row.readyAt || row.ready_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  };
}

function updatedAtMs(row) {
  const value = new Date(row?.updatedAt || row?.updated_at || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function modalMarkup() {
  const base = String(import.meta.env.BASE_URL || '/');
  return `
    <div class="mn-lumber-modal" data-lumber-modal hidden aria-hidden="true">
      <button class="mn-lumber-modal-backdrop" type="button" data-lumber-close aria-label="Закрыть"></button>
      <section class="mn-lumber-panel" role="dialog" aria-modal="true" aria-labelledby="mn-lumber-title">
        <header><span><small>Работа · лесоруб</small><strong id="mn-lumber-title">Лесозаготовительная точка</strong></span><b data-lumber-level>1 уровень</b><button type="button" data-lumber-close aria-label="Закрыть">×</button></header>
        <nav class="mn-lumber-tabs" aria-label="Разделы лесоруба">
          <button type="button" data-lumber-tab="tools" data-active="true">Инструменты</button>
          <button type="button" data-lumber-tab="saw">Распил</button>
          <button type="button" data-lumber-tab="warehouse">Склад</button>
          <button type="button" data-lumber-tab="sell">Продажа</button>
          <button type="button" data-lumber-tab="offers">Предложения</button><button type="button" data-lumber-tab="business">Управление</button>
        </nav>
        <div class="mn-lumber-roadmap">
          ${Object.values(LUMBER_LEVELS).map((level) => `<span data-lumber-roadmap-level="${level.level}"><b>${level.level}</b><small>${level.label}</small></span>`).join('<i>→</i>')}
        </div>
        <div class="mn-lumber-page" data-lumber-page="tools">
          <button class="mn-lumber-tool-row" type="button" data-lumber-tool="lumber_tool_axe">
            <i>🪓</i><span><b>Топор лесоруба</b><small>Постоянный инструмент. Нужен для 🌳 и 🌲.</small></span><strong>Взять бесплатно</strong>
          </button>
          <button class="mn-lumber-tool-row" type="button" data-lumber-tool="lumber_tool_chainsaw">
            <i><img src="${base}benzopila.png" alt=""></i><span><b>Бензопила</b><small>Открывается на 2 уровне. Нужна для распила.</small></span><strong data-lumber-chainsaw-label>Со 2 уровня</strong>
          </button>
          <p class="mn-lumber-hint">Сначала возьмите топор здесь, затем подойдите вплотную к 🌳 или 🌲 и нажмите E/У. Одно дерево даёт одно бревно весом 20 кг.</p>
        </div>
        <div class="mn-lumber-page" data-lumber-page="saw" hidden>
          <section class="mn-lumber-recipe">
            <span><i>🪵</i><b>1 бревно</b><small>20 кг</small></span><strong>бензопила</strong><span><i><img src="${base}brus.png" alt=""></i><b>4 бруса</b><small>по 5 кг</small></span>
          </section>
          <div class="mn-lumber-batch"><span>В инвентаре: <b data-lumber-log-count>0</b> брёвен</span><span>Выход: <b>4 × 5 кг</b></span></div>
          <button class="mn-lumber-primary" type="button" data-lumber-saw>Распилить одно бревно</button>
          <p class="mn-lumber-hint">На 1 уровне распил закрыт. Со 2 уровня одна партия превращает 1 бревно в 4 бруса без потери общего веса.</p>
        </div>
        <section class="mn-lumber-page" data-lumber-page="warehouse" hidden>
          <div class="mn-lumber-stock-heading"><div><h3>Склад лесоруба</h3><p class="mn-lumber-hint">Ваши запасы древесины для распила и продажи.</p></div><button type="button" data-lumber-stock-refresh>Обновить</button></div>
          <div class="mn-lumber-stock-summary" data-lumber-stock-summary aria-live="polite">Загружаем остатки…</div>
          <div class="mn-lumber-stock-grid">
            ${['lumber_log', 'lumber_beam'].map(itemType => {
              const item = LUMBER_ITEMS[itemType];
              return `<article class="mn-lumber-stock-card" data-lumber-stock-card="${itemType}">
                <header><i>${itemType === 'lumber_log' ? '🪵' : `<img src="${base}brus.png" alt="">`}</i><h3>${itemType === 'lumber_log' ? 'Брёвна' : 'Брус'}</h3></header>
                <strong class="mn-lumber-stock-count" data-lumber-stock-count>—</strong>
                <p data-lumber-stock-weight>—</p>
                <label>Количество для предложения<input type="number" min="1" max="100000" step="1" value="1" inputmode="numeric" data-lumber-stock-qty></label>
                <div class="mn-lumber-stock-actions"><button type="button" data-lumber-stock-offer="${itemType}">Предложить заводу</button><button type="button" data-lumber-stock-offer="${itemType}" data-stock-all>Весь запас</button></div>
              </article>`;
            }).join('')}
          </div>
          <p class="mn-lumber-hint" data-lumber-stock-hint></p>
          <p class="mn-lumber-hint">Выберите завод и цену в форме предложения. Древесина списывается после принятия предложения владельцем завода, затем оформляется доставка.</p>
          <button type="button" data-lumber-stock-orders>Мои предложения и поставки</button>
        </section>
        <div class="mn-lumber-page" data-lumber-page="sell" hidden>
          <div class="mn-lumber-sale-row" data-lumber-sale-row="lumber_log">
            <i>🪵</i><span><b>Целое бревно</b><small><em data-lumber-log-count>0</em> шт. · 20 кг/шт. · 200 ₴/шт.</small></span><div><button type="button" data-lumber-sell="lumber_log" data-quantity="1">1 шт.</button><button type="button" data-lumber-sell="lumber_log" data-quantity="0">Всё</button></div>
          </div>
          <div class="mn-lumber-sale-row" data-lumber-sale-row="lumber_beam">
            <i><img src="${base}brus.png" alt=""></i><span><b>Брус</b><small><em data-lumber-beam-count>0</em> шт. · 5 кг/шт. · 55 ₴/шт.</small></span><div><button type="button" data-lumber-sell="lumber_beam" data-quantity="1">1 шт.</button><button type="button" data-lumber-sell="lumber_beam" data-quantity="0">Всё</button></div>
          </div>
          <div class="mn-lumber-profit"><span>Продать бревно целиком</span><b>200 ₴</b><i>или распилить</i><span>4 бруса</span><strong>220 ₴</strong></div>
          <section class="mn-lumber-industry" data-lumber-industry>
            <span><i>🏭</i><b>Поставка производствам</b><small data-lumber-industry-status>Откроется на 3 уровне</small></span>
            <button type="button" data-lumber-offers-open>Предложить древесину заводу</button>
          </section>
        </div>
        <section class="mn-lumber-page" data-lumber-page="offers" hidden>
          <h3>Предложения заводам</h3>
          <label>Материал <select data-lumber-offer-item><option value="lumber_log">Брёвна</option><option value="lumber_beam">Брус</option></select></label>
          <label>Завод <select data-lumber-offer-factory><option value="">Загрузка…</option></select></label>
          <p class="mn-lumber-hint" data-lumber-targets-status role="status"></p>
          <label>Количество <input data-lumber-offer-qty type="number" min="1" max="100000" value="1" inputmode="numeric"></label>
          <label>Цена за единицу, ₴ <input data-lumber-offer-price type="number" min="1" max="1000000000" value="200" inputmode="numeric"></label>
          <p data-lumber-offer-total>Итого: 200 ₴</p>
          <button type="button" data-lumber-offer-submit>Отправить предложение</button>
          <h3>Мои предложения</h3><div data-lumber-offers-list></div>
          <button type="button" data-lumber-offers-refresh>Обновить</button>
          <button type="button" data-lumber-offers-back>Назад на склад</button>
        </section>
        ${jobBusinessPageMarkup({
          prefix: 'lumber',
          config: LUMBER_BUSINESS_CONFIG,
          items: [
            { itemType: 'lumber_log', label: 'Брёвна', icon: '🪵' },
            { itemType: 'lumber_beam', label: 'Брус', icon: '▰' },
          ],
        })}
        <footer><small data-lumber-status></small></footer>
      </section>
    </div>`;
}

export function enableLumberFeature({ root, cityId } = {}) {
  if (!root || !cityId) return () => {};
  document.querySelector('[data-lumber-modal]')?.remove();
  cancelLumberMiniGame();
  document.body.insertAdjacentHTML('beforeend', modalMarkup());

  const modal = document.querySelector('[data-lumber-modal]');
  const panel = modal?.querySelector('.mn-lumber-panel');
  const status = modal?.querySelector('[data-lumber-status]');
  const pages = [...(modal?.querySelectorAll('[data-lumber-page]') || [])];
  const tabs = [...(modal?.querySelectorAll('[data-lumber-tab]') || [])];
  let destroyed = false;
  let busy = false;
  let activeStationObjectId = '';
  let activeBusinessPublicId = '—';
  let inventoryState = { items: [] };
  let businessState = null;
  let businessRefreshPromise = null;
  let treeStates = new Map();
  let treeStatesReady = false;
  let treeLoadPromise = null;
  let realtimeChannel = null;
  let stateTimer = 0;
  let inventoryTimer = 0;
  let inventoryRevision = 0;
  let scrollTouch = null;
  let scrollClickBlockedUntil = 0;
  window.__MN_LUMBER_TREE_STATES_READY__ = false;

  function setStatus(message = '', type = 'info') {
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
  }

  function itemQuantity(itemType) {
    return inventoryState.items
      .filter((item) => String(item.itemType || item.item_type || '') === itemType)
      .reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
  }

  const hasItem = (itemType) => itemQuantity(itemType) > 0;
  const currentLevel = () => Math.max(1, Math.min(3, Number(inventoryState?.skills?.skills?.lumberjack?.level || getLumberjackSkillStatus().level) || 1));

  function renderBusiness() {
    const business = businessState;
    const owned = Boolean(business?.owned);
    const role = String(business?.role || 'worker');
    const isOwner = role === 'owner';
    syncBusinessUtilityGate(modal, { isOwner, objectId:activeBusinessPublicId, objectIds:[activeStationObjectId] });
    const isStaff = isOwner || role === 'assistant';
    const canInspect = isStaff || Boolean(business?.isAdmin);
    const roleLabel = isOwner ? 'Владелец' : role === 'assistant' ? 'Помощник' : business?.isAdmin ? 'Администратор' : 'Работник';

    const publicId = modal?.querySelector('[data-lumber-business-public-id]');
    if (publicId) publicId.textContent = activeBusinessPublicId;

    const owner = modal?.querySelector('[data-lumber-business-owner]');
    if (owner) owner.textContent = owned ? (business?.ownerNickname || business?.ownerTgId || 'Владелец') : 'Государство';
    const assistant = modal?.querySelector('[data-lumber-business-assistant]');
    if (assistant) assistant.textContent = `Помощник: ${business?.assistantNickname || business?.assistantTgId || 'нет'}`;
    const roleOutput = modal?.querySelector('[data-lumber-business-role]');
    if (roleOutput) roleOutput.textContent = roleLabel;
    const stateOutput = modal?.querySelector('[data-lumber-business-state]');
    if (stateOutput) stateOutput.textContent = owned ? 'Частное предприятие' : 'Государственная точка';
    const publicState = modal?.querySelector('[data-lumber-business-public-state]');
    if (publicState) publicState.textContent = `${activeBusinessPublicId} · ${owned ? 'Частное' : 'Государственное'}`;
    renderBusinessStateSaleControl(modal, { businessId: activeStationObjectId, isOwner: role === 'owner' });
    const businessTab = modal?.querySelector('[data-lumber-tab="business"]');
    if (businessTab) {
      businessTab.hidden = owned && !canInspect;
      businessTab.textContent = canInspect ? 'Управление' : 'Предприятие';
    }

    const buy = modal?.querySelector('[data-lumber-business-buy]');
    if (buy) buy.hidden = owned;
    const ownedBlock = modal?.querySelector('[data-lumber-business-owned]');
    if (ownedBlock) ownedBlock.hidden = !owned;
    const privateBlock = modal?.querySelector('[data-lumber-business-private]');
    if (privateBlock) privateBlock.hidden = !canInspect;
    const management = modal?.querySelector('[data-lumber-business-management]');
    if (management) management.hidden = !canInspect;
    modal?.querySelectorAll('[data-lumber-business-owner-only]').forEach((element) => { element.hidden = !isOwner; });

    const cash = modal?.querySelector('[data-lumber-business-cash]');
    if (cash) cash.textContent = formatJobBusinessMoney(business?.cashBalance || 0);
    const payout = modal?.querySelector('[data-lumber-business-payout]');
    if (payout) payout.textContent = formatJobBusinessMoney(business?.totalPayout || 0);

    const warehouse = business?.warehouse || { capacity: LUMBER_BUSINESS_CONFIG.warehouseCapacity, used: 0, free: LUMBER_BUSINESS_CONFIG.warehouseCapacity, items: {} };
    modal?.querySelectorAll('[data-lumber-business-warehouse-used]').forEach((element) => { element.textContent = Number(warehouse.used || 0).toLocaleString('ru-RU'); });
    const free = modal?.querySelector('[data-lumber-business-warehouse-free]');
    if (free) free.textContent = Number(warehouse.free ?? LUMBER_BUSINESS_CONFIG.warehouseCapacity).toLocaleString('ru-RU');
    const capacity = Math.max(1, Number(warehouse.capacity || LUMBER_BUSINESS_CONFIG.warehouseCapacity));
    const percent = Math.min(100, Math.max(0, Number(warehouse.used || 0) / capacity * 100));
    modal?.querySelectorAll('[data-lumber-business-warehouse-meter]').forEach((element) => element.style.setProperty('--mn-jobbiz-progress', `${percent}%`));
    ['lumber_log', 'lumber_beam'].forEach((itemType) => {
      modal?.querySelectorAll(`[data-lumber-business-warehouse-item="${itemType}"]`).forEach((element) => {
        element.textContent = Number(warehouse?.items?.[itemType] || 0).toLocaleString('ru-RU');
      });
    });
    modal?.querySelectorAll('[data-lumber-business-purchase], [data-lumber-business-deposit], [data-lumber-business-withdraw], [data-lumber-business-withdraw-all], [data-lumber-business-assistant-save], [data-lumber-business-assistant-clear]')
      .forEach((button) => { button.disabled = busy; });
    renderProcurementControls(modal, 'lumber', business?.procurement, [], { canManage:isOwner, busy });
  }

  function publishBusiness(result) {
    const business = result?.business && typeof result.business === 'object' ? result.business : result;
    if (!business || typeof business !== 'object') return businessState;
    businessState = business;
    const balance = Number(business.playerBalance ?? result?.playerBalance ?? result?.meta?.playerBalance);
    if (Number.isFinite(balance)) {
      state.player = { ...(state.player || {}), balance };
      window.dispatchEvent(new CustomEvent('mn:player-balance-changed', { detail: { balance, source: 'lumber_business' } }));
    }
    window.__MN_LUMBER_BUSINESS_STATE__ = { ...businessState };
    renderBusiness();
    return businessState;
  }

  function refreshBusiness({ silent = true } = {}) {
    if (!activeStationObjectId) return Promise.resolve(null);
    if (businessRefreshPromise) return businessRefreshPromise;
    businessRefreshPromise = (async () => {
      try {
        return publishBusiness(await loadJobBusinessSnapshot({ businessId: activeStationObjectId, cityId, jobType: 'lumber' }));
      } catch (error) {
        if (!silent) setStatus(getJobBusinessUserErrorMessage(error), 'error');
        return null;
      } finally {
        businessRefreshPromise = null;
      }
    })();
    return businessRefreshPromise;
  }

  function publishInventory(result) {
    const payload = result?.inventory && typeof result.inventory === 'object' ? result.inventory : result;
    inventoryState = payload && typeof payload === 'object' ? payload : { items: [] };
    inventoryState.items = Array.isArray(inventoryState.items) ? inventoryState.items : [];
    window.__MN_LUMBER_INVENTORY_ITEMS__ = inventoryState.items.map((item) => ({ ...item }));
    window.__MN_LUMBER_INVENTORY_STATE__ = inventoryState;
    window.dispatchEvent(new CustomEvent('mn:lumber-inventory-changed', {
      detail: { inventory: inventoryState, items: window.__MN_LUMBER_INVENTORY_ITEMS__ },
    }));
    // lumber-work inventory can return a whole-hryvnia balance. Never publish
    // that value as money: ask the central player reader for the exact balance.
    window.dispatchEvent(new CustomEvent('mn:player-balance-refresh'));
    if (payload?.skills) publishPlayerSkills(payload.skills, { levelUps: payload.levelUps });
    renderInventory();
    return inventoryState;
  }

  function publishInventoryMutation(result) {
    inventoryRevision += 1;
    return publishInventory(result);
  }

  function renderWarehouse() {
    const logs = itemQuantity('lumber_log');
    const beams = itemQuantity('lumber_beam');
    const format = value => Number(value).toLocaleString('ru-RU');
    const summary = modal?.querySelector('[data-lumber-stock-summary]');
    if (summary) summary.textContent = `${format(logs + beams)} шт. на складе · ${format(logs * 20 + beams * 5)} кг`;
    modal?.querySelectorAll('[data-lumber-stock-card]').forEach(card => {
      const type = card.dataset.lumberStockCard;
      const quantity = itemQuantity(type);
      card.querySelector('[data-lumber-stock-count]').textContent = `${format(quantity)} шт.`;
      card.querySelector('[data-lumber-stock-weight]').textContent = `${format(quantity * LUMBER_ITEMS[type].unitWeightKg)} кг · ${LUMBER_ITEMS[type].unitWeightKg} кг/шт.`;
      const input = card.querySelector('[data-lumber-stock-qty]');
      input.max = String(Math.max(1, Math.min(100000, quantity)));
      input.disabled = busy || quantity < 1 || currentLevel() < 3;
      card.querySelectorAll('button').forEach(button => { button.disabled = busy || quantity < 1 || currentLevel() < 3; });
    });
    const hint = modal?.querySelector('[data-lumber-stock-hint]');
    if (hint) hint.textContent = currentLevel() < 3 ? 'Предложения заводам откроются на 3 уровне лесоруба.' : !logs && !beams ? 'Склад пуст. Заготовьте брёвна или распилите их на брус.' : 'Укажите количество или предложите весь доступный запас (до 100 000 шт. за одно предложение).';
  }

  function renderInventory() {
    renderWarehouse();
    const level = currentLevel();
    const logCount = itemQuantity('lumber_log');
    const beamCount = itemQuantity('lumber_beam');
    modal?.querySelectorAll('[data-lumber-log-count]').forEach((element) => { element.textContent = String(logCount); });
    modal?.querySelectorAll('[data-lumber-beam-count]').forEach((element) => { element.textContent = String(beamCount); });
    const levelOutput = modal?.querySelector('[data-lumber-level]');
    if (levelOutput) levelOutput.textContent = `${level} уровень`;
    modal?.querySelectorAll('[data-lumber-roadmap-level]').forEach((element) => {
      const target = Number(element.dataset.lumberRoadmapLevel);
      element.dataset.unlocked = level >= target ? 'true' : 'false';
      element.dataset.current = level === target ? 'true' : 'false';
    });
    modal?.querySelectorAll('[data-lumber-tool]').forEach((button) => {
      const itemType = button.dataset.lumberTool;
      const unlockLevel = Number(LUMBER_ITEMS[itemType]?.unlockLevel || 1);
      const owned = hasItem(itemType);
      button.disabled = busy || owned || level < unlockLevel;
      button.dataset.owned = owned ? 'true' : 'false';
      button.dataset.locked = level < unlockLevel ? 'true' : 'false';
    });
    const chainsawLabel = modal?.querySelector('[data-lumber-chainsaw-label]');
    if (chainsawLabel) chainsawLabel.textContent = hasItem('lumber_tool_chainsaw') ? 'Получено' : level >= 2 ? 'Взять бесплатно' : 'Со 2 уровня';
    const sawButton = modal?.querySelector('[data-lumber-saw]');
    if (sawButton) {
      sawButton.disabled = busy || level < 2 || !hasItem('lumber_tool_chainsaw') || logCount < 1;
      sawButton.textContent = level < 2 ? 'Откроется на 2 уровне' : !hasItem('lumber_tool_chainsaw') ? 'Сначала возьмите бензопилу' : 'Распилить одно бревно';
    }
    modal?.querySelectorAll('[data-lumber-sale-row="lumber_log"] button').forEach((button) => { button.disabled = busy || logCount < 1; });
    modal?.querySelectorAll('[data-lumber-sale-row="lumber_beam"] button').forEach((button) => { button.disabled = busy || level < 2 || beamCount < 1; });
    const industry = modal?.querySelector('[data-lumber-industry]');
    if (industry) industry.dataset.unlocked = level >= 3 ? 'true' : 'false';
    const industryStatus = modal?.querySelector('[data-lumber-industry-status]');
    if (industryStatus) industryStatus.textContent = level >= 3 ? 'Открыто: брус подходит для производств' : 'Откроется на 3 уровне';
    const industryButton = modal?.querySelector('[data-lumber-offers-open]');
    if (industryButton) industryButton.disabled = busy || level < 3 || (beamCount < 1 && logCount < 1);
    renderBusiness();
  }

  function publishTreeStates() {
    window.__MN_LUMBER_TREE_STATES__ = Object.fromEntries([...treeStates.entries()].map(([id, value]) => [id, { ...value }]));
    document.querySelectorAll('[data-map-object-id]').forEach((element) => {
      const saved = treeStates.get(String(element.dataset.mapObjectId || ''));
      element.classList.toggle('is-lumber-tree-cooldown', Boolean(saved && secondsUntil(saved.readyAt) > 0));
    });
    window.dispatchEvent(new CustomEvent('mn:lumber-tree-states-changed', {
      detail: { cityId, states: window.__MN_LUMBER_TREE_STATES__ },
    }));
  }

  function upsertTreeState(row) {
    const next = normalizeTreeState(row);
    if (!next.treeObjectId || (next.cityId && next.cityId !== String(cityId))) return;
    const current = treeStates.get(next.treeObjectId);
    if (current && updatedAtMs(next) < updatedAtMs(current)) return;
    treeStates.set(next.treeObjectId, next);
    publishTreeStates();
  }

  function removeTreeState(id) {
    treeStates.delete(String(id || ''));
    publishTreeStates();
  }

  async function refreshInventory({ silent = true } = {}) {
    const startedAtRevision = inventoryRevision;

    try {
      const result = await loadLumberInventory();

      // A refresh may have started BEFORE a chop/saw/sale completed.
      // Never let that older response overwrite a newer mutation result.
      if (startedAtRevision !== inventoryRevision) return inventoryState;

      return publishInventory(result);
    } catch (error) {
      if (!silent) setStatus(getLumberUserErrorMessage(error), 'error');
      return inventoryState;
    }
  }

  function refreshTreeStates() {
    if (treeLoadPromise) return treeLoadPromise;
    treeLoadPromise = (async () => {
      try {
        const result = await loadLumberTreeStates(cityId);
        if (destroyed) return false;
        const rows = Array.isArray(result?.states) ? result.states : [];
        rows.map(normalizeTreeState).filter((row) => row.treeObjectId).forEach((row) => {
          const current = treeStates.get(row.treeObjectId);
          if (!current || updatedAtMs(row) >= updatedAtMs(current)) treeStates.set(row.treeObjectId, row);
        });
        treeStatesReady = true;
        window.__MN_LUMBER_TREE_STATES_READY__ = true;
        publishTreeStates();
        return true;
      } catch (error) {
        console.warn('[lumber] tree state refresh failed:', error);
        return false;
      } finally { treeLoadPromise = null; }
    })();
    return treeLoadPromise;
  }

  function startLumberStreamLoading() {
    if (destroyed) return;
    const wasActive = Boolean(realtimeChannel || stateTimer || inventoryTimer);

    if (!realtimeChannel) {
      realtimeChannel = supabase.channel(`lumber-trees:${cityId}:${Math.random().toString(16).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lumber_tree_states', filter: `city_id=eq.${cityId}` }, (payload) => {
          if (payload.eventType === 'DELETE') removeTreeState(payload.old?.tree_object_id);
          else upsertTreeState(payload.new);
        }).subscribe();
    }
    if (!stateTimer) stateTimer = window.setInterval(refreshTreeStates, STATE_REFRESH_MS);
    if (!inventoryTimer) {
      inventoryTimer = window.setInterval(
        () => refreshInventory({ silent: true }),
        INVENTORY_REFRESH_MS,
      );
    }
    if (!wasActive) {
      void refreshTreeStates();
      void refreshInventory({ silent: true });
    }
  }

  function stopLumberStreamLoading() {
    window.clearInterval(stateTimer);
    window.clearInterval(inventoryTimer);
    stateTimer = 0;
    inventoryTimer = 0;
    if (realtimeChannel) {
      const channel = realtimeChannel;
      realtimeChannel = null;
      void supabase.removeChannel(channel);
    }
  }

  function handleJobStreamWindow(event) {
    if (event?.detail?.cityId && String(event.detail.cityId) !== String(cityId)) return;
    const objects = Array.isArray(event?.detail?.objects) ? event.detail.objects : [];
    if (objects.some(isLumberStreamObject)) startLumberStreamLoading();
    else stopLumberStreamLoading();
  }

  function openModal(object) {
    if (!modal || busy) return;
    startLumberStreamLoading();
    activeStationObjectId = String(object?.id || '');
    activeBusinessPublicId = getPublicBusinessId(object);
    renderPublicBusinessId(modal?.querySelector('.mn-lumber-panel'), object);
    businessState = null;
    setStatus('');
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-lumber-modal-open');
    renderInventory();
    void refreshInventory({ silent: false });
    void refreshBusiness({ silent: true });
  }

  function closeModal() {
    if (!modal || busy) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mn-lumber-modal-open');
    setStatus('');
  }

  function setTab(tab) {
    // Status belongs to the previous action/page; never carry an old failure into another tab.
    setStatus('');
    tabs.forEach((button) => { button.dataset.active = button.dataset.lumberTab === tab ? 'true' : 'false'; });
    pages.forEach((page) => { page.hidden = page.dataset.lumberPage !== tab; });
    if (tab === 'business') void refreshBusiness({ silent: false });
    if (tab === 'offers') void refreshOffers();
    if (tab === 'warehouse') { renderWarehouse(); void refreshInventory({ silent: false }); }
  }

  async function workWithTree(object) {
    if (busy) return;
    const tree = getLumberTreeByObjectType(object?.type || object?.payload?.jobType);
    if (!tree) return;
    startLumberStreamLoading();
    if (!treeStatesReady && !await refreshTreeStates()) {
      emitToast('Не удалось проверить дерево. Попробуйте ещё раз.', 'error');
      return;
    }
    const remaining = secondsUntil(treeStates.get(String(object.id || ''))?.readyAt);
    if (remaining > 0) {
      emitToast(`Дерево восстанавливается. Подождите ${formatRemaining(remaining)}.`);
      return;
    }
    if (!hasItem('lumber_tool_axe')) {
      emitToast('Сначала возьмите бесплатный топор на точке 🪚.', 'info');
      return;
    }
    busy = true;
    window.__MN_PLAYER_CONTROLS_LOCKED__ = true;
    try {
      const game = await playLumberChopMiniGame({ treeIcon: tree.icon, treeLabel: tree.label });
      if (destroyed || game.cancelled) return;
      const result = await chopLumberTree({ cityId, treeObjectId: String(object.id || ''), miniGameScore: game.score });
      if (result?.tree) upsertTreeState(result.tree);
      if (result?.inventory) publishInventoryMutation(result.inventory);
      if (result?.skills) publishPlayerSkills(result.skills, { levelUps: result.levelUps });
      const gainedLogs = Math.max(1, Number(result?.item?.quantity) || 1);
      const totalLogs = itemQuantity('lumber_log');
      emitToast(
        `🪵 Получено бревно ×${gainedLogs} · всего ${totalLogs} · ${20 * gainedLogs} кг · точность ${game.score}%`,
        'success',
      );
      void refreshTreeStates();
    } catch (error) {
      emitToast(getLumberUserErrorMessage(error), 'error');
      void refreshTreeStates();
      void refreshInventory({ silent: true });
    } finally {
      window.__MN_PLAYER_CONTROLS_LOCKED__ = false;
      busy = false;
      renderInventory();
    }
  }

  async function handleTool(event) {
    const button = event.target?.closest?.('[data-lumber-tool]');
    if (!button || busy || performance.now() < scrollClickBlockedUntil) return;
    busy = true;
    renderInventory();
    setStatus('Выдаём постоянный инструмент…');
    try {
      publishInventoryMutation(await takeLumberTool({ cityId, stationObjectId: activeStationObjectId, itemType: button.dataset.lumberTool }));
      setStatus(button.dataset.lumberTool === 'lumber_tool_axe' ? 'Топор получен. Можно рубить 🌳 и 🌲.' : 'Бензопила получена. Распил доступен.', 'success');
    } catch (error) { setStatus(getLumberUserErrorMessage(error), 'error'); }
    finally { busy = false; renderInventory(); }
  }

  async function handleSaw(event) {
    if (!event.target?.closest?.('[data-lumber-saw]') || busy || performance.now() < scrollClickBlockedUntil) return;
    busy = true;
    window.__MN_PLAYER_CONTROLS_LOCKED__ = true;
    renderInventory();
    setStatus('Подготовьте четыре точных реза…');
    try {
      const game = await playLumberSawMiniGame();
      if (destroyed || game.cancelled) return;
      const result = await sawLumberLog({ cityId, stationObjectId: activeStationObjectId, miniGameScore: game.score });
      if (result?.inventory) publishInventoryMutation(result.inventory);
      if (result?.skills) publishPlayerSkills(result.skills, { levelUps: result.levelUps });
      setStatus(`Распил готов: −1 бревно, +4 бруса по 5 кг · точность ${game.score}%`, 'success');
    } catch (error) { setStatus(getLumberUserErrorMessage(error), 'error'); }
    finally { window.__MN_PLAYER_CONTROLS_LOCKED__ = false; busy = false; renderInventory(); }
  }

  const offerQ = (selector) => modal?.querySelector(selector);
  let offerTargets = [];
  const offerEscape = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const offerTotal = () => {
    const qty = Number(offerQ('[data-lumber-offer-qty]')?.value || 0);
    const price = Number(offerQ('[data-lumber-offer-price]')?.value || 0);
    offerQ('[data-lumber-offer-total]').textContent = `Итого: ${Number.isSafeInteger(qty * price) ? (qty * price).toLocaleString('ru-RU') : '—'} ₴`;
  };
  let offerRefreshVersion = 0;
  let offerTargetsLoading = false;
  const targetKey = (target) => JSON.stringify([target.cityId, target.factoryId]);
  const targetCity = (target) => cities[normalizeCityId(target.cityId)]?.name || target.cityId || 'Город не указан';
  function updateOfferSubmit() {
    const value = offerQ('[data-lumber-offer-factory]')?.value;
    const target = value === '' ? null : offerTargets[Number(value)];
    offerQ('[data-lumber-offer-submit]').disabled = busy || offerTargetsLoading || !target || target.canOffer === false;
  }
  async function refreshOffers() {
    const version = ++offerRefreshVersion;
    const itemType = offerQ('[data-lumber-offer-item]').value;
    const select = offerQ('[data-lumber-offer-factory]');
    const previous = select.value === '' ? null : offerTargets[Number(select.value)];
    offerTargets = [];
    offerTargetsLoading = true;
    select.disabled = true;
    select.innerHTML = '<option value="">Загрузка заводов…</option>';
    const hint = offerQ('[data-lumber-targets-status]');
    hint.textContent = 'Ищем заводы во всех городах…';
    updateOfferSubmit();
    const targetsTask = (async () => {
      try {
        const targets = await lumberOffersAction('targets', { itemType });
        if (destroyed || version !== offerRefreshVersion) return;
        if (!Array.isArray(targets)) throw new Error('Некорректный ответ списка заводов. Обновите список.');
        offerTargets = targets.filter(v => v?.factoryId && v?.cityId);
        const available = offerTargets.filter(v => v.canOffer !== false);
        select.innerHTML = '<option value="">' + (available.length ? 'Выберите завод' : 'Нет доступных получателей') + '</option>' + offerTargets.map((v,i) =>
          `<option value="${i}" ${v.canOffer === false ? 'disabled' : ''}>${offerEscape(v.name || 'Деревообрабатывающий завод')} · ${offerEscape(targetCity(v))} · ${offerEscape(v.publicId || v.factoryId)}${v.isOwn ? ' · Ваш завод (предложение себе недоступно)' : v.canOffer === false ? ' · Нет владельца' : ''}</option>`).join('');
        const index = previous ? offerTargets.findIndex(v => targetKey(v) === targetKey(previous) && v.canOffer !== false) : -1;
        select.value = index >= 0 ? String(index) : '';
        hint.textContent = offerTargets.length
          ? `Найдено заводов: ${offerTargets.length}. Доступно для предложения: ${available.length}.` + (offerTargets.some(v => v.isOwn) ? ' Свой завод виден в списке, но предложение самому себе недоступно.' : '')
          : 'Деревообрабатывающие заводы не найдены. Попробуйте обновить список.';
      } catch (error) {
        if (destroyed || version !== offerRefreshVersion) return;
        select.innerHTML = '<option value="">Не удалось загрузить заводы</option>';
        hint.textContent = getLumberUserErrorMessage(error);
      } finally {
        if (!destroyed && version === offerRefreshVersion) {
          offerTargetsLoading = false;
          select.disabled = !offerTargets.length;
          updateOfferSubmit();
        }
      }
    })();
    const offersTask = (async () => {
      const list = offerQ('[data-lumber-offers-list]');
      list.textContent = 'Загрузка предложений…';
      try {
        const offers = await lumberOffersAction('snapshot');
        if (destroyed || version !== offerRefreshVersion) return;
        list.innerHTML = (Array.isArray(offers) ? offers : []).map((o) => `<article class="mn-lumber-offer-row"><strong>${offerEscape(o.itemType === 'lumber_log' ? 'Брёвна' : o.itemType === 'lumber_beam' ? 'Брус' : o.itemType)} · ${Number(o.quantity)} шт. · ${Number(o.totalPrice).toLocaleString('ru-RU')} ₴</strong><small>${offerEscape(({pending:'Ожидает решения',in_transit:'В доставке',completed:'Доставлено',delivered:'Доставлено',cancelled:'Отменено',rejected:'Отклонено'})[o.status] || o.status)} · ${offerEscape(o.factoryId)}</small>${o.status === 'pending' ? `<button data-lumber-offer-cancel="${offerEscape(o.id)}">Отменить</button>` : ''}</article>`).join('') || '<p>Предложений пока нет.</p>';
      } catch (error) {
        if (!destroyed && version === offerRefreshVersion) list.textContent = getLumberUserErrorMessage(error);
      }
    })();
    await Promise.all([targetsTask, offersTask]);
    if (!destroyed && version === offerRefreshVersion) offerTotal();
  }
  async function offerRequest(task, success) {
    if (busy) return;
    busy = true;
    try { await task(); await refreshOffers(); setStatus(success, 'success'); }
    catch (error) { setStatus(getLumberUserErrorMessage(error), 'error'); }
    finally { busy = false; renderInventory(); updateOfferSubmit(); }
  }
  modal?.querySelector('[data-lumber-stock-refresh]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try { await refreshInventory({ silent: false }); }
    finally { if (!destroyed) button.disabled = false; }
  });
  modal?.querySelector('[data-lumber-stock-orders]')?.addEventListener('click', () => setTab('offers'));
  modal?.querySelector('[data-lumber-page="warehouse"]')?.addEventListener('click', event => {
    const button = event.target.closest('[data-lumber-stock-offer]');
    if (!button || busy) return;
    const type = button.dataset.lumberStockOffer;
    const available = itemQuantity(type);
    const quantity = button.hasAttribute('data-stock-all') ? Math.min(100000, available) : Number(button.closest('[data-lumber-stock-card]').querySelector('[data-lumber-stock-qty]').value);
    if (currentLevel() < 3 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > Math.min(100000, available)) {
      setStatus('Укажите целое количество в пределах запасов. Поставки доступны с 3 уровня.', 'error');
      return;
    }
    offerQ('[data-lumber-offer-item]').value = type;
    offerQ('[data-lumber-offer-qty]').value = String(quantity);
    offerQ('[data-lumber-offer-price]').value = String(LUMBER_ITEMS[type].sellPrice);
    offerTotal();
    setTab('offers');
  });
  offerQ('[data-lumber-offers-open]')?.addEventListener('click', () => {
    offerQ('[data-lumber-tab="offers"]')?.click();
  });
  offerQ('[data-lumber-offers-back]')?.addEventListener('click', () => setTab('warehouse'));
  offerQ('[data-lumber-offer-item]')?.addEventListener('change', () => void refreshOffers().catch(e => setStatus(getLumberUserErrorMessage(e),'error')));
  offerQ('[data-lumber-offer-factory]')?.addEventListener('change', updateOfferSubmit);
  offerQ('[data-lumber-offer-qty]')?.addEventListener('input', offerTotal);
  offerQ('[data-lumber-offer-price]')?.addEventListener('input', offerTotal);
  offerQ('[data-lumber-offers-refresh]')?.addEventListener('click', () => void refreshOffers().catch(e => setStatus(getLumberUserErrorMessage(e),'error')));
  offerQ('[data-lumber-offer-submit]')?.addEventListener('click', () => {
    const selected = offerQ('[data-lumber-offer-factory]').value;
    const target = selected === '' ? null : offerTargets[Number(selected)];
    const itemType = offerQ('[data-lumber-offer-item]').value;
    const quantity = Number(offerQ('[data-lumber-offer-qty]').value);
    const unitPrice = Number(offerQ('[data-lumber-offer-price]').value);
    if (offerTargetsLoading || !target || target.canOffer === false || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > itemQuantity(itemType) || !Number.isSafeInteger(unitPrice) || unitPrice < 1) {
      setStatus('Выберите завод, укажите корректное количество в пределах запасов и цену.', 'error'); return;
    }
    void offerRequest(() => lumberOffersAction('create', { factoryId:target.factoryId, cityId:target.cityId, itemType, quantity, unitPrice }), 'Предложение отправлено владельцу завода.');
  });
  offerQ('[data-lumber-offers-list]')?.addEventListener('click', (event) => {
    const id = event.target.closest('[data-lumber-offer-cancel]')?.dataset.lumberOfferCancel;
    if (id) void offerRequest(() => lumberOffersAction('cancel', { offerId:id }), 'Предложение отменено.');
  });

  async function handleSell(event) {
    const button = event.target?.closest?.('[data-lumber-sell]');
    if (!button || busy || performance.now() < scrollClickBlockedUntil) return;
    const itemType = String(button.dataset.lumberSell || '');
    const available = itemQuantity(itemType);
    const requestedRaw = Math.max(0, Math.floor(Number(button.dataset.quantity) || 0));
    const requestedQuantity = requestedRaw > 0 ? Math.min(available, requestedRaw) : available;
    if (requestedQuantity <= 0) return;

    busy = true;
    renderInventory();
    const channel = String(button.dataset.channel || 'station');
    setStatus(channel === 'industry' ? 'Оформляем поставку производству…' : 'Взвешиваем древесину…');
    let reservationId = '';
    let reserved = false;
    try {
      const business = businessState || await refreshBusiness({ silent: false });
      if (!business) return;
      if (business.owned) {
        const expectedAmount = requestedQuantity * Math.max(0, Number(LUMBER_ITEMS[itemType]?.sellPrice || 0));
        const reservation = await reserveJobBusinessPayout({ businessId: activeStationObjectId, cityId, jobType: 'lumber', itemType, quantity: requestedQuantity, amount: expectedAmount });
        if (reservation?.business) publishBusiness(reservation.business);
        reservationId = String(reservation?.reservationId || '');
        reserved = Boolean(reservationId);
      }

      const result = await sellLumberItem({ cityId, stationObjectId: activeStationObjectId, itemType, quantity: requestedRaw, channel });
      if (result?.inventory) publishInventoryMutation(result.inventory);

      if (reserved) {
        try {
          const committed = await commitJobBusinessPayout({ businessId: activeStationObjectId, cityId, jobType: 'lumber', reservationId, quantity: Math.max(1, Number(result.soldQuantity) || requestedQuantity), amount: Math.max(0, Number(result.totalPrice) || 0) });
          if (committed?.business) publishBusiness(committed.business);
        } catch (commitError) {
          console.warn('[lumber] business payout commit failed:', commitError);
          void refreshBusiness({ silent: true });
        }
      }
      setStatus(`Продано ${Number(result.soldQuantity) || 0} шт. · +${Number(result.totalPrice || 0).toLocaleString('ru-RU')} ₴${channel === 'industry' ? ' · производство' : ''}`, 'success');
    } catch (error) {
      if (reserved && reservationId) {
        try {
          const refunded = await refundJobBusinessPayout({ businessId: activeStationObjectId, cityId, jobType: 'lumber', reservationId });
          if (refunded?.business) publishBusiness(refunded.business);
        } catch (refundError) { console.warn('[lumber] payout refund failed:', refundError); }
      }
      const raw = String(error?.message || error || '');
      setStatus(raw.includes('JOB_BUSINESS_') ? getJobBusinessUserErrorMessage(error) : getLumberUserErrorMessage(error), 'error');
    } finally {
      busy = false;
      renderInventory();
    }
  }

  async function runBusinessAction(label, action) {
    if (busy || !activeStationObjectId) return null;
    busy = true;
    renderInventory();
    setStatus(label);
    try {
      const result = await action();
      publishBusiness(result?.business || result);
      setStatus('Готово.', 'success');
      return result;
    } catch (error) {
      setStatus(getJobBusinessUserErrorMessage(error), 'error');
      return null;
    } finally {
      busy = false;
      renderInventory();
    }
  }

  async function handleBusinessControls(event) {
    if (event.target?.closest?.('[data-lumber-business-purchase]')) {
      await runBusinessAction('Оформляем покупку лесозаготовительного предприятия…', () => purchaseJobBusiness({ businessId: activeStationObjectId, cityId, jobType: 'lumber' }));
      return;
    }
    if (event.target?.closest?.('[data-lumber-procurement-budget-save]')) {
      const budget = Math.max(0, Math.floor(Number(modal?.querySelector('[data-lumber-procurement-budget]')?.value) || 0));
      await runBusinessAction('Сохраняем бюджет скупа…', async () => {
        await setProcurementBudget({ buyerKind:'enterprise', buyerId:activeStationObjectId, cityId, buyerType:'lumber', budget });
        return loadJobBusinessSnapshot({ businessId:activeStationObjectId, cityId, jobType:'lumber' });
      });
      return;
    }
    const deposit = event.target?.closest?.('[data-lumber-business-deposit]');
    const withdraw = event.target?.closest?.('[data-lumber-business-withdraw]');
    const withdrawAll = event.target?.closest?.('[data-lumber-business-withdraw-all]');
    if (deposit || withdraw || withdrawAll) {
      const amount = deposit
        ? Math.max(0, Math.floor(Number(modal?.querySelector('[data-lumber-business-deposit-amount]')?.value) || 0))
        : withdrawAll ? Math.max(0, Math.floor(Number(businessState?.cashBalance) || 0))
          : Math.max(0, Math.floor(Number(modal?.querySelector('[data-lumber-business-withdraw-amount]')?.value) || 0));
      const fn = deposit ? depositJobBusiness : withdrawJobBusiness;
      const result = await runBusinessAction(deposit ? 'Пополняем баланс предприятия…' : 'Переводим средства владельцу…', () => fn({ businessId: activeStationObjectId, cityId, jobType: 'lumber', amount }));
      if (result) {
        const input = modal?.querySelector(deposit ? '[data-lumber-business-deposit-amount]' : '[data-lumber-business-withdraw-amount]');
        if (input) input.value = '';
      }
      return;
    }
    const saveAssistant = event.target?.closest?.('[data-lumber-business-assistant-save]');
    const clearAssistant = event.target?.closest?.('[data-lumber-business-assistant-clear]');
    if (saveAssistant || clearAssistant) {
      const target = clearAssistant ? '' : String(modal?.querySelector('[data-lumber-business-assistant-target]')?.value || '').trim();
      const result = await runBusinessAction(clearAssistant ? 'Снимаем помощника…' : 'Назначаем помощника…', () => setJobBusinessAssistant({ businessId: activeStationObjectId, cityId, jobType: 'lumber', target }));
      if (result) {
        const input = modal?.querySelector('[data-lumber-business-assistant-target]');
        if (input) input.value = '';
      }
    }
  }

  function handleLumberObject(event) {
    const object = event?.detail?.object;
    const type = String(object?.type || object?.payload?.jobType || '');
    if (type === 'lumber_station') openModal(object);
    else if (getLumberTreeByObjectType(type)) void workWithTree(object);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && modal?.hidden === false) closeModal();
  }

  function handleTouchStart(event) {
    const page = event.target?.closest?.('[data-lumber-page]');
    if (!page || page.hidden || event.touches.length !== 1) { scrollTouch = null; return; }
    const touch = event.touches[0];
    scrollTouch = { page, identifier: touch.identifier, x: touch.clientX, y: touch.clientY, top: page.scrollTop };
  }

  function handleTouchMove(event) {
    if (!scrollTouch) return;
    const touch = [...event.touches].find((item) => item.identifier === scrollTouch.identifier);
    if (!touch) return;
    const dx = touch.clientX - scrollTouch.x;
    const dy = touch.clientY - scrollTouch.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 3) return;
    const delta = Math.abs(dx) >= Math.abs(dy) ? dx : -dy;
    scrollTouch.page.scrollTop = Math.max(0, Math.min(scrollTouch.page.scrollHeight - scrollTouch.page.clientHeight, scrollTouch.top + delta));
    scrollClickBlockedUntil = performance.now() + 350;
    event.preventDefault();
  }

  tabs.forEach((button) => button.addEventListener('click', () => setTab(button.dataset.lumberTab)));
  pages.forEach((page) => {
    page.addEventListener('touchstart', handleTouchStart, { passive: true });
    page.addEventListener('touchmove', handleTouchMove, { passive: false });
    page.addEventListener('touchend', () => { scrollTouch = null; }, { passive: true });
  });
  modal?.querySelectorAll('[data-lumber-close]').forEach((button) => button.addEventListener('click', closeModal));
  panel?.addEventListener('click', handleTool);
  panel?.addEventListener('click', handleSaw);
  panel?.addEventListener('click', handleSell);
  panel?.addEventListener('click', handleBusinessControls);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('mn:lumber-object-action', handleLumberObject);
  window.addEventListener('mn:job-stream-window-changed', handleJobStreamWindow);
  handleJobStreamWindow({
    detail: {
      cityId,
      objects: window.__MN_ACTIVE_JOB_OBJECTS_BY_CITY__?.[String(cityId)] || [],
    },
  });

  return () => {
    destroyed = true;
    stopLumberStreamLoading();
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('mn:lumber-object-action', handleLumberObject);
    window.removeEventListener('mn:job-stream-window-changed', handleJobStreamWindow);
    document.body.classList.remove('mn-lumber-modal-open');
    modal?.remove();
    cancelLumberMiniGame();
    delete window.__MN_LUMBER_TREE_STATES__;
    delete window.__MN_LUMBER_BUSINESS_STATE__;
    window.__MN_LUMBER_TREE_STATES_READY__ = false;
  };
}
