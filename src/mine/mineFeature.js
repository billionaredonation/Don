import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import {
  buyMineItem,
  extractMineNode,
  getMineUserErrorMessage,
  loadMineInventory,
  loadMineMarket,
  loadMineNodeStates,
  sellMineSubtype,
} from './mineApi.js';
import {
  MINE_ITEMS,
  MINE_RESOURCES,
  MINE_SUBTYPES,
  getMineResourceByObjectType,
} from './mineConfig.js';
import { cancelMineMiniGame, playMineMiniGame } from './mineMiniGame.js';
import { getMineResourceSkillStatus, publishPlayerSkills } from '../player/playerSkillState.js';
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
import '../jobs/jobBusiness.css';
import './mine.css';

const MINE_STATE_REFRESH_MS = 5000;
const MINE_INVENTORY_REFRESH_MS = 12000;
const MINE_BUSINESS_CONFIG = JOB_BUSINESS_TYPES.mine;

function isMineStreamObject(object = {}) {
  const type = String(object.type || object?.payload?.jobType || '');
  return type === 'mine_station' || Boolean(getMineResourceByObjectType(type));
}

function emitToast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
}

function normalizeNodeState(row = {}) {
  return {
    nodeObjectId: String(row.nodeObjectId || row.node_object_id || ''),
    cityId: String(row.cityId || row.city_id || ''),
    resourceType: String(row.resourceType || row.resource_type || ''),
    readyAt: row.readyAt || row.ready_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  };
}

function updatedAtMs(row) {
  const timestamp = new Date(row?.updatedAt || row?.updated_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function secondsUntil(value) {
  const target = new Date(value || 0).getTime();
  return Number.isFinite(target) ? Math.max(0, Math.ceil((target - Date.now()) / 1000)) : 0;
}

function formatRemaining(seconds) {
  const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (safe < 60) return `${safe} сек.`;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function marketRowsMarkup() {
  return Object.values(MINE_RESOURCES).map((resource) => `
    <section class="mn-mine-market-group" data-mine-market-group="${resource.resourceType}">
      <header><i>${resource.icon}</i><strong>${resource.label}</strong><small>с ${resource.unlockLevel} ур. шахтёра</small></header>
      ${resource.subtypeCodes.map((subtypeCode) => {
        const subtype = MINE_SUBTYPES[subtypeCode];
        return `
          <div class="mn-mine-sale-row" data-mine-sale-row="${subtypeCode}">
            <i aria-hidden="true">${subtype.icon}</i>
            <span>
              <b>${subtype.label} <u data-mine-sale-level="${subtypeCode}">ур. 1</u></b>
              <small><em data-mine-sale-count="${subtypeCode}">0</em> кг · <mark data-mine-sale-price="${subtypeCode}">—</mark> ₴/кг · лимит <mark data-mine-sale-limit="${subtypeCode}">—</mark></small>
            </span>
            <div><button type="button" data-mine-sell="${subtypeCode}" data-quantity="1">1 кг</button><button type="button" data-mine-sell="${subtypeCode}" data-quantity="0">Всё</button></div>
          </div>`;
      }).join('')}
    </section>`).join('');
}

function modalMarkup() {
  return `
    <div class="mn-mine-modal" data-mine-modal hidden aria-hidden="true">
      <button class="mn-mine-modal-backdrop" type="button" data-mine-close aria-label="Закрыть"></button>
      <section class="mn-mine-panel" role="dialog" aria-modal="true" aria-labelledby="mn-mine-title">
        <header>
          <span><small>Работа · шахта</small><strong id="mn-mine-title">Шахтёрское снабжение</strong></span>
          <button type="button" data-mine-close aria-label="Закрыть">×</button>
        </header>
        <nav class="mn-mine-tabs" aria-label="Разделы шахты">
          <button type="button" data-mine-tab="tools" data-active="true">Снаряжение</button>
          <button type="button" data-mine-tab="sell">Скупщик</button>
          <button type="button" data-mine-tab="business">Управление</button>
        </nav>
        <div class="mn-mine-chain" aria-label="Цепочка открытия ресурсов">
          <span>🪨 Камень</span><i>→</i><span>⚫ Уголь</span><i>→</i><span>⚙️ Металл</span><i>→</i><span>🟠 Медь</span>
        </div>
        <div class="mn-mine-tab-page" data-mine-page="tools">
          <button type="button" class="mn-mine-shop-row" data-mine-buy="mine_tool_pickaxe">
            <i aria-hidden="true">⛏️</i>
            <span><b>Шахтёрская кирка</b><small>Постоянный инструмент для всех месторождений</small></span>
            <strong>${MINE_ITEMS.mine_tool_pickaxe.price.toLocaleString('ru-RU')} ₴</strong>
          </button>
          <div class="mn-mine-quality-guide">
            <strong>Очистка растёт вместе с подтипом</strong>
            <span><b>1</b> грязное · нужна промывка</span><i>→</i><span><b>2</b> промытое · можно использовать сразу</span><i>→</i><span><b>5</b> почти чистое</span>
          </div>
        </div>
        <div class="mn-mine-tab-page" data-mine-page="sell" hidden>
          <div class="mn-mine-market-head">
            <span><b>Рынок этого скупщика</b><small>Цены и лимиты обновляются каждые 3 часа</small></span>
            <strong data-mine-market-reset>Загрузка…</strong>
          </div>
          <div class="mn-mine-market-list">${marketRowsMarkup()}</div>
        </div>
        ${jobBusinessPageMarkup({
          prefix: 'mine',
          config: MINE_BUSINESS_CONFIG,
          items: Object.values(MINE_SUBTYPES).map((item) => ({ itemType: item.subtypeCode, label: item.label, icon: item.icon })),
        })}
        <footer><small data-mine-status></small></footer>
      </section>
    </div>`;
}

export function enableMineFeature({ root, cityId } = {}) {
  if (!root || !cityId) return () => {};

  document.querySelector('[data-mine-modal]')?.remove();
  cancelMineMiniGame();
  document.body.insertAdjacentHTML('beforeend', modalMarkup());

  const modal = document.querySelector('[data-mine-modal]');
  const panel = modal?.querySelector('.mn-mine-panel');
  const status = modal?.querySelector('[data-mine-status]');
  const tabButtons = [...(modal?.querySelectorAll('[data-mine-tab]') || [])];
  const tabPages = [...(modal?.querySelectorAll('[data-mine-page]') || [])];

  let destroyed = false;
  let busy = false;
  let inventoryState = { items: [] };
  let marketState = { items: [] };
  let businessState = null;
  let businessRefreshPromise = null;
  let activeBuyerObjectId = '';
  let marketLoading = false;
  let marketLoadFailed = false;
  let marketRequestVersion = 0;
  let nodeStates = new Map();
  let nodeStatesReady = false;
  let nodeLoadPromise = null;
  let marketLoadPromise = null;
  let marketLoadKey = '';
  let stateTimer = 0;
  let inventoryTimer = 0;
  let marketTimer = 0;
  let realtimeChannel = null;
  let scrollTouch = null;
  let scrollClickBlockedUntil = 0;

  window.__MN_MINE_NODE_STATES_READY__ = false;

  function usesForcedMobileRotation() {
    return Boolean(
      window.matchMedia?.('(orientation: portrait)')?.matches &&
      (
        document.documentElement.classList.contains('mn-force-rotate-landscape') ||
        document.body.classList.contains('mn-force-rotate-landscape')
      )
    );
  }

  function handleScrollTouchStart(event) {
    const page = event.target?.closest?.('[data-mine-page]');
    if (!page || page.hidden || !usesForcedMobileRotation() || event.touches.length !== 1) {
      scrollTouch = null;
      return;
    }

    const touch = event.touches[0];
    scrollTouch = {
      page,
      identifier: touch.identifier,
      clientX: touch.clientX,
      clientY: touch.clientY,
      scrollTop: page.scrollTop,
    };
  }

  function handleScrollTouchMove(event) {
    if (!scrollTouch) return;
    const touch = Array.from(event.touches).find((item) => item.identifier === scrollTouch.identifier);
    if (!touch) return;

    const deltaX = touch.clientX - scrollTouch.clientX;
    const deltaY = touch.clientY - scrollTouch.clientY;
    const scrollDelta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : -deltaY;
    if (Math.abs(scrollDelta) < 3) return;

    const maximum = Math.max(0, scrollTouch.page.scrollHeight - scrollTouch.page.clientHeight);
    scrollTouch.page.scrollTop = Math.max(0, Math.min(maximum, scrollTouch.scrollTop + scrollDelta));
    scrollClickBlockedUntil = performance.now() + 350;
    event.preventDefault();
  }

  function handleScrollTouchEnd() {
    scrollTouch = null;
  }

  function setStatus(message = '', type = 'info') {
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
  }

  function publishNodeStates() {
    window.__MN_MINE_NODE_STATES__ = Object.fromEntries(
      [...nodeStates.entries()].map(([id, value]) => [id, { ...value }]),
    );
    document.querySelectorAll('[data-map-object-id]').forEach((element) => {
      const saved = nodeStates.get(String(element.dataset.mapObjectId || ''));
      const waiting = saved && secondsUntil(saved.readyAt) > 0;
      element.classList.toggle('is-mine-node-cooldown', Boolean(waiting));
    });
    window.dispatchEvent(new CustomEvent('mn:mine-node-states-changed', {
      detail: { cityId, states: window.__MN_MINE_NODE_STATES__ },
    }));
  }

  function upsertNodeState(row) {
    const next = normalizeNodeState(row);
    if (!next.nodeObjectId || (next.cityId && next.cityId !== String(cityId))) return;
    const current = nodeStates.get(next.nodeObjectId);
    if (current && updatedAtMs(next) < updatedAtMs(current)) return;
    nodeStates.set(next.nodeObjectId, next);
    publishNodeStates();
  }

  function removeNodeState(nodeObjectId) {
    nodeStates.delete(String(nodeObjectId || ''));
    publishNodeStates();
  }

  function publishInventory(result) {
    const payload = result?.inventory && typeof result.inventory === 'object' ? result.inventory : result;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    inventoryState = payload && typeof payload === 'object' ? payload : { items };
    window.__MN_MINE_INVENTORY_ITEMS__ = items.map((item) => ({ ...item }));
    window.__MN_MINE_INVENTORY_STATE__ = inventoryState;
    window.dispatchEvent(new CustomEvent('mn:mine-inventory-changed', {
      detail: { inventory: inventoryState, items: window.__MN_MINE_INVENTORY_ITEMS__ },
    }));

    const balance = Number(inventoryState.balance);
    if (Number.isFinite(balance)) {
      state.player = { ...(state.player || {}), balance };
      window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
        detail: { balance, source: 'mine_job' },
      }));
    }
    if (payload?.skills) publishPlayerSkills(payload.skills, { levelUps: payload.levelUps });
    renderInventory();
    return inventoryState;
  }

  function inventoryQuantity(subtypeCode) {
    return inventoryState.items
      .filter((item) => String(item.subtypeCode || item.subtype_code || '') === subtypeCode)
      .reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
  }

  function hasPickaxe() {
    return inventoryState.items.some((item) => item.itemType === 'mine_tool_pickaxe' && Number(item.quantity) > 0);
  }

  function marketItem(subtypeCode) {
    return marketState.items?.find?.((item) => String(item.subtypeCode || '') === subtypeCode) || null;
  }

  function renderBusiness() {
    const business = businessState;
    const owned = Boolean(business?.owned);
    const role = String(business?.role || 'worker');
    const isOwner = role === 'owner';
    const isStaff = isOwner || role === 'assistant';
    const canInspect = isStaff || Boolean(business?.isAdmin);
    const roleLabel = isOwner ? 'Владелец' : role === 'assistant' ? 'Помощник' : business?.isAdmin ? 'Администратор' : 'Работник';

    const owner = modal?.querySelector('[data-mine-business-owner]');
    if (owner) owner.textContent = owned ? (business?.ownerNickname || business?.ownerTgId || 'Владелец') : 'Государство';
    const assistant = modal?.querySelector('[data-mine-business-assistant]');
    if (assistant) assistant.textContent = `Помощник: ${business?.assistantNickname || business?.assistantTgId || 'нет'}`;
    const roleOutput = modal?.querySelector('[data-mine-business-role]');
    if (roleOutput) roleOutput.textContent = roleLabel;
    const stateOutput = modal?.querySelector('[data-mine-business-state]');
    if (stateOutput) stateOutput.textContent = owned ? 'Частное предприятие' : 'Государственная точка';
    const publicState = modal?.querySelector('[data-mine-business-public-state]');
    if (publicState) publicState.textContent = owned ? 'Частное' : 'Государственное';
    const businessTab = modal?.querySelector('[data-mine-tab="business"]');
    if (businessTab) {
      businessTab.hidden = owned && !canInspect;
      businessTab.textContent = canInspect ? 'Управление' : 'Предприятие';
    }

    const buy = modal?.querySelector('[data-mine-business-buy]');
    if (buy) buy.hidden = owned;
    const ownedBlock = modal?.querySelector('[data-mine-business-owned]');
    if (ownedBlock) ownedBlock.hidden = !owned;
    const privateBlock = modal?.querySelector('[data-mine-business-private]');
    if (privateBlock) privateBlock.hidden = !canInspect;
    const management = modal?.querySelector('[data-mine-business-management]');
    if (management) management.hidden = !canInspect;
    modal?.querySelectorAll('[data-mine-business-owner-only]').forEach((element) => { element.hidden = !isOwner; });

    const cash = modal?.querySelector('[data-mine-business-cash]');
    if (cash) cash.textContent = formatJobBusinessMoney(business?.cashBalance || 0);
    const payout = modal?.querySelector('[data-mine-business-payout]');
    if (payout) payout.textContent = formatJobBusinessMoney(business?.totalPayout || 0);

    const warehouse = business?.warehouse || { capacity: MINE_BUSINESS_CONFIG.warehouseCapacity, used: 0, free: MINE_BUSINESS_CONFIG.warehouseCapacity, items: {} };
    modal?.querySelectorAll('[data-mine-business-warehouse-used]').forEach((element) => { element.textContent = Number(warehouse.used || 0).toLocaleString('ru-RU'); });
    const free = modal?.querySelector('[data-mine-business-warehouse-free]');
    if (free) free.textContent = Number(warehouse.free ?? MINE_BUSINESS_CONFIG.warehouseCapacity).toLocaleString('ru-RU');
    const capacity = Math.max(1, Number(warehouse.capacity || MINE_BUSINESS_CONFIG.warehouseCapacity));
    const percent = Math.min(100, Math.max(0, Number(warehouse.used || 0) / capacity * 100));
    modal?.querySelectorAll('[data-mine-business-warehouse-meter]').forEach((element) => element.style.setProperty('--mn-jobbiz-progress', `${percent}%`));
    Object.keys(MINE_SUBTYPES).forEach((itemType) => {
      modal?.querySelectorAll(`[data-mine-business-warehouse-item="${itemType}"]`).forEach((element) => {
        element.textContent = Number(warehouse?.items?.[itemType] || 0).toLocaleString('ru-RU');
      });
    });
    modal?.querySelectorAll('[data-mine-business-purchase], [data-mine-business-deposit], [data-mine-business-withdraw], [data-mine-business-withdraw-all], [data-mine-business-assistant-save], [data-mine-business-assistant-clear]')
      .forEach((button) => { button.disabled = busy; });
  }

  function publishBusiness(result) {
    const business = result?.business && typeof result.business === 'object' ? result.business : result;
    if (!business || typeof business !== 'object') return businessState;
    businessState = business;
    const balance = Number(business.playerBalance ?? result?.playerBalance ?? result?.meta?.playerBalance);
    if (Number.isFinite(balance)) {
      state.player = { ...(state.player || {}), balance };
      window.dispatchEvent(new CustomEvent('mn:player-balance-changed', { detail: { balance, source: 'mine_business' } }));
    }
    window.__MN_MINE_BUSINESS_STATE__ = { ...businessState };
    renderBusiness();
    return businessState;
  }

  function refreshBusiness({ silent = true } = {}) {
    if (!activeBuyerObjectId) return Promise.resolve(null);
    if (businessRefreshPromise) return businessRefreshPromise;
    businessRefreshPromise = (async () => {
      try {
        return publishBusiness(await loadJobBusinessSnapshot({ businessId: activeBuyerObjectId, cityId, jobType: 'mine' }));
      } catch (error) {
        if (!silent) setStatus(getJobBusinessUserErrorMessage(error), 'error');
        return null;
      } finally {
        businessRefreshPromise = null;
      }
    })();
    return businessRefreshPromise;
  }

  function renderMarketCountdown() {
    const output = modal?.querySelector('[data-mine-market-reset]');
    if (!output) return;
    if (marketLoading) {
      output.textContent = 'Загрузка…';
      return;
    }
    if (marketLoadFailed) {
      output.textContent = 'Ошибка загрузки';
      return;
    }
    const target = new Date(marketState?.refreshAt || 0).getTime();
    if (!Number.isFinite(target) || target <= 0) {
      output.textContent = activeBuyerObjectId ? 'Нет данных' : 'Нет скупщика';
      return;
    }
    const seconds = Math.max(0, Math.ceil((target - Date.now()) / 1000));
    output.textContent = `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (seconds <= 0 && modal?.hidden === false) void refreshMarket({ silent: true });
  }

  function publishMarket(result) {
    marketState = result && typeof result === 'object' ? result : { items: [] };
    Object.keys(MINE_SUBTYPES).forEach((subtypeCode) => {
      const item = marketItem(subtypeCode);
      const row = modal?.querySelector(`[data-mine-sale-row="${subtypeCode}"]`);
      row?.classList.toggle('is-market-locked', item?.unlocked === false);
      row?.classList.toggle('is-market-empty', Number(item?.remainingQuantity) <= 0);
      row?.querySelectorAll(`[data-mine-sale-price="${subtypeCode}"]`).forEach((element) => {
        element.textContent = item?.unlocked === false ? '🔒' : String(item?.priceLabel || item?.unitPrice || '—');
      });
      row?.querySelectorAll(`[data-mine-sale-limit="${subtypeCode}"]`).forEach((element) => {
        element.textContent = item?.unlocked === false
          ? `с ${item.unlockLevel || 1} ур. ветки`
          : Number(item?.remainingQuantity ?? 0).toLocaleString('ru-RU');
      });
      row?.querySelectorAll(`[data-mine-sale-level="${subtypeCode}"]`).forEach((element) => {
        element.textContent = `ур. ${Number(item?.masteryLevel) || 1}`;
      });
    });
    renderMarketCountdown();
    renderInventory();
    return marketState;
  }

  function renderInventory() {
    Object.keys(MINE_SUBTYPES).forEach((subtypeCode) => {
      const quantity = inventoryQuantity(subtypeCode);
      modal?.querySelectorAll(`[data-mine-sale-count="${subtypeCode}"]`).forEach((element) => {
        element.textContent = String(quantity);
      });
      modal?.querySelectorAll(`[data-mine-sale-row="${subtypeCode}"] button`).forEach((button) => {
        const market = marketItem(subtypeCode);
        button.disabled = busy || quantity <= 0 || !activeBuyerObjectId || market?.unlocked === false || Number(market?.remainingQuantity ?? 0) <= 0;
      });
    });
    modal?.querySelectorAll('[data-mine-buy="mine_tool_pickaxe"]').forEach((button) => {
      button.disabled = busy || hasPickaxe();
      button.dataset.owned = hasPickaxe() ? 'true' : 'false';
    });
    renderBusiness();
  }

  async function refreshInventory({ silent = true } = {}) {
    try {
      publishInventory(await loadMineInventory());
    } catch (error) {
      if (!silent) setStatus(getMineUserErrorMessage(error), 'error');
    }
  }

  function refreshNodeStates() {
    if (nodeLoadPromise) return nodeLoadPromise;
    nodeLoadPromise = (async () => {
      try {
        const result = await loadMineNodeStates(cityId);
        if (destroyed) return false;
        const rows = Array.isArray(result?.states) ? result.states : [];
        const merged = new Map(nodeStates);
        rows.map(normalizeNodeState).filter((row) => row.nodeObjectId).forEach((row) => {
          const current = merged.get(row.nodeObjectId);
          if (!current || updatedAtMs(row) >= updatedAtMs(current)) merged.set(row.nodeObjectId, row);
        });
        nodeStates = merged;
        nodeStatesReady = true;
        window.__MN_MINE_NODE_STATES_READY__ = true;
        publishNodeStates();
        return true;
      } catch (error) {
        console.warn('[mine] node state refresh failed:', error);
        return false;
      } finally {
        nodeLoadPromise = null;
      }
    })();
    return nodeLoadPromise;
  }

  function startMineStreamLoading() {
    if (destroyed) return;
    const wasActive = Boolean(realtimeChannel || stateTimer || inventoryTimer);

    if (!realtimeChannel) {
      realtimeChannel = supabase
        .channel(`mine-nodes:${cityId}:${Math.random().toString(16).slice(2)}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'mine_node_states', filter: `city_id=eq.${cityId}`,
        }, (payload) => {
          if (payload.eventType === 'DELETE') removeNodeState(payload.old?.node_object_id);
          else upsertNodeState(payload.new);
        })
        .subscribe();
    }
    if (!stateTimer) stateTimer = window.setInterval(refreshNodeStates, MINE_STATE_REFRESH_MS);
    if (!inventoryTimer) {
      inventoryTimer = window.setInterval(
        () => refreshInventory({ silent: true }),
        MINE_INVENTORY_REFRESH_MS,
      );
    }
    if (!wasActive) {
      void refreshNodeStates();
      void refreshInventory({ silent: true });
    }
  }

  function stopMineStreamLoading() {
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
    if (objects.some(isMineStreamObject)) startMineStreamLoading();
    else stopMineStreamLoading();
  }

  async function refreshMarket({ silent = true } = {}) {
    if (!activeBuyerObjectId) return null;
    const buyerId = activeBuyerObjectId;
    const requestVersion = marketRequestVersion;
    const requestKey = `${requestVersion}:${buyerId}`;
    if (marketLoadPromise && marketLoadKey === requestKey) return marketLoadPromise;
    marketLoading = true;
    marketLoadFailed = false;
    renderMarketCountdown();
    const requestPromise = (async () => {
      try {
        const result = await loadMineMarket({ cityId, buyerObjectId: buyerId });
        if (requestVersion !== marketRequestVersion || buyerId !== activeBuyerObjectId) return result;
        marketLoading = false;
        return publishMarket(result);
      } catch (error) {
        if (requestVersion === marketRequestVersion && buyerId === activeBuyerObjectId) {
          marketLoading = false;
          marketLoadFailed = true;
          renderMarketCountdown();
          if (!silent || modal?.querySelector('[data-mine-page="sell"]')?.hidden === false) {
            setStatus(getMineUserErrorMessage(error), 'error');
          }
        }
        return null;
      }
    })();
    marketLoadPromise = requestPromise;
    marketLoadKey = requestKey;
    try {
      return await requestPromise;
    } finally {
      if (marketLoadPromise === requestPromise) {
        marketLoadPromise = null;
        marketLoadKey = '';
      }
    }
  }

  function openModal(object) {
    if (!modal || busy) return;
    startMineStreamLoading();
    marketRequestVersion += 1;
    activeBuyerObjectId = String(object?.id || '');
    businessState = null;
    marketLoading = false;
    marketLoadFailed = false;
    marketState = { items: [] };
    setStatus('');
    publishMarket(marketState);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-mine-modal-open');
    void refreshInventory({ silent: false });
    void refreshBusiness({ silent: true });
  }

  function closeModal() {
    if (!modal || busy) return;
    marketRequestVersion += 1;
    marketLoading = false;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mn-mine-modal-open');
    setStatus('');
  }

  function setTab(tab) {
    tabButtons.forEach((button) => { button.dataset.active = button.dataset.mineTab === tab ? 'true' : 'false'; });
    tabPages.forEach((page) => { page.hidden = page.dataset.minePage !== tab; });
    if (tab === 'sell') void refreshMarket({ silent: false });
    if (tab === 'business') void refreshBusiness({ silent: false });
  }

  async function workWithNode(object) {
    if (busy) return;
    const objectType = String(object?.type || object?.payload?.jobType || '');
    const resource = getMineResourceByObjectType(objectType);
    if (!resource) return;
    startMineStreamLoading();

    if (!nodeStatesReady) {
      emitToast('Проверяем состояние месторождения…');
      if (!await refreshNodeStates()) {
        emitToast('Не удалось загрузить состояние месторождения. Попробуйте ещё раз.', 'error');
        return;
      }
    }

    const resourceSkill = getMineResourceSkillStatus(resource.resourceType);
    if (resourceSkill.unlocked === false) {
      emitToast(`${resource.label} откроется на ${resource.unlockLevel} уровне навыка «Шахтёр».`, 'info');
      return;
    }

    const saved = nodeStates.get(String(object.id || ''));
    const remaining = secondsUntil(saved?.readyAt);
    if (remaining > 0) {
      emitToast(`Месторождение восстанавливается. Подождите ${formatRemaining(remaining)}.`, 'info');
      return;
    }

    busy = true;
    window.__MN_PLAYER_CONTROLS_LOCKED__ = true;
    renderInventory();
    try {
      const game = await playMineMiniGame({
        resourceType: resource.resourceType,
        resourceIcon: resource.icon,
        resourceLabel: resource.label,
      });
      if (destroyed || game.cancelled) return;
      const result = await extractMineNode({
        cityId,
        nodeObjectId: String(object.id || ''),
        miniGameScore: game.score,
      });
      if (result?.node) upsertNodeState(result.node);
      if (result?.inventory) publishInventory(result.inventory);
      if (result?.skills) publishPlayerSkills(result.skills, { levelUps: result.levelUps });
      const item = result?.item || {};
      emitToast(
        `${item.icon || resource.icon} ${item.label || resource.label} ×${Number(item.quantity) || 1} · ${item.qualityLabel || 'сырьё'} · очистка ${Number(item.purityPercent) || 0}%`,
        'success',
      );
      void refreshNodeStates();
      void refreshInventory({ silent: true });
    } catch (error) {
      emitToast(getMineUserErrorMessage(error), 'error');
      void refreshNodeStates();
      void refreshInventory({ silent: true });
    } finally {
      window.__MN_PLAYER_CONTROLS_LOCKED__ = false;
      busy = false;
      renderInventory();
    }
  }

  async function handleBuy(event) {
    const button = event.target?.closest?.('[data-mine-buy]');
    if (!button || busy || performance.now() < scrollClickBlockedUntil) return;
    busy = true;
    renderInventory();
    setStatus('Покупаем кирку…');
    try {
      publishInventory(await buyMineItem(button.dataset.mineBuy));
      setStatus('Кирка получена. Теперь можно добывать камень.', 'success');
    } catch (error) {
      setStatus(getMineUserErrorMessage(error), 'error');
    } finally {
      busy = false;
      renderInventory();
    }
  }

  async function handleSell(event) {
    const button = event.target?.closest?.('[data-mine-sell]');
    if (!button || busy || performance.now() < scrollClickBlockedUntil) return;
    const subtypeCode = String(button.dataset.mineSell || '');
    const market = marketItem(subtypeCode);
    const available = inventoryQuantity(subtypeCode);
    const requestedRaw = Math.max(0, Math.floor(Number(button.dataset.quantity) || 0));
    const marketRemaining = Math.max(0, Number(market?.remainingQuantity ?? available));
    const requestedQuantity = requestedRaw > 0
      ? Math.min(available, marketRemaining, requestedRaw)
      : Math.min(available, marketRemaining);
    if (requestedQuantity <= 0) return;

    busy = true;
    renderInventory();
    setStatus('Взвешиваем и продаём сырьё…');
    let reservationId = '';
    let reserved = false;
    try {
      const business = businessState || await refreshBusiness({ silent: false });
      if (!business) return;
      if (business.owned) {
        if (!market || market.unlocked === false) throw new Error('MINE_MARKET_UNAVAILABLE');
        const expectedAmount = requestedQuantity * Math.max(0, Number(market.unitPrice || 0));
        const reservation = await reserveJobBusinessPayout({
          businessId: activeBuyerObjectId,
          cityId,
          jobType: 'mine',
          itemType: subtypeCode,
          quantity: requestedQuantity,
          amount: expectedAmount,
        });
        if (reservation?.business) publishBusiness(reservation.business);
        reservationId = String(reservation?.reservationId || '');
        reserved = Boolean(reservationId);
      }

      const result = await sellMineSubtype({
        cityId,
        buyerObjectId: activeBuyerObjectId,
        subtypeCode,
        quantity: requestedRaw,
      });
      if (result.inventory) publishInventory(result.inventory);
      if (result.market) publishMarket(result.market);

      if (reserved) {
        try {
          const committed = await commitJobBusinessPayout({
            businessId: activeBuyerObjectId,
            cityId,
            jobType: 'mine',
            reservationId,
            quantity: Math.max(1, Number(result.soldQuantity) || requestedQuantity),
            amount: Math.max(0, Number(result.totalPrice) || 0),
          });
          if (committed?.business) publishBusiness(committed.business);
        } catch (commitError) {
          console.warn('[mine] business payout commit failed:', commitError);
          void refreshBusiness({ silent: true });
        }
      }

      setStatus(`Продано ${Number(result.soldQuantity) || 0} кг · +${Number(result.totalPrice || 0).toLocaleString('ru-RU')} ₴`, 'success');
    } catch (error) {
      if (reserved && reservationId) {
        try {
          const refunded = await refundJobBusinessPayout({ businessId: activeBuyerObjectId, cityId, jobType: 'mine', reservationId });
          if (refunded?.business) publishBusiness(refunded.business);
        } catch (refundError) { console.warn('[mine] payout refund failed:', refundError); }
      }
      const raw = String(error?.message || error || '');
      setStatus(raw.includes('JOB_BUSINESS_') ? getJobBusinessUserErrorMessage(error) : getMineUserErrorMessage(error), 'error');
    } finally {
      busy = false;
      renderInventory();
    }
  }

  async function runBusinessAction(label, action) {
    if (busy || !activeBuyerObjectId) return null;
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
    if (event.target?.closest?.('[data-mine-business-purchase]')) {
      await runBusinessAction('Оформляем покупку горнодобывающего предприятия…', () => purchaseJobBusiness({ businessId: activeBuyerObjectId, cityId, jobType: 'mine' }));
      return;
    }

    const deposit = event.target?.closest?.('[data-mine-business-deposit]');
    const withdraw = event.target?.closest?.('[data-mine-business-withdraw]');
    const withdrawAll = event.target?.closest?.('[data-mine-business-withdraw-all]');
    if (deposit || withdraw || withdrawAll) {
      const amount = deposit
        ? Math.max(0, Math.floor(Number(modal?.querySelector('[data-mine-business-deposit-amount]')?.value) || 0))
        : withdrawAll
          ? Math.max(0, Math.floor(Number(businessState?.cashBalance) || 0))
          : Math.max(0, Math.floor(Number(modal?.querySelector('[data-mine-business-withdraw-amount]')?.value) || 0));
      const fn = deposit ? depositJobBusiness : withdrawJobBusiness;
      const result = await runBusinessAction(
        deposit ? 'Пополняем баланс шахты…' : 'Переводим средства владельцу…',
        () => fn({ businessId: activeBuyerObjectId, cityId, jobType: 'mine', amount }),
      );
      if (result) {
        const input = modal?.querySelector(deposit ? '[data-mine-business-deposit-amount]' : '[data-mine-business-withdraw-amount]');
        if (input) input.value = '';
      }
      return;
    }

    const saveAssistant = event.target?.closest?.('[data-mine-business-assistant-save]');
    const clearAssistant = event.target?.closest?.('[data-mine-business-assistant-clear]');
    if (saveAssistant || clearAssistant) {
      const target = clearAssistant ? '' : String(modal?.querySelector('[data-mine-business-assistant-target]')?.value || '').trim();
      const result = await runBusinessAction(
        clearAssistant ? 'Снимаем помощника…' : 'Назначаем помощника…',
        () => setJobBusinessAssistant({ businessId: activeBuyerObjectId, cityId, jobType: 'mine', target }),
      );
      if (result) {
        const input = modal?.querySelector('[data-mine-business-assistant-target]');
        if (input) input.value = '';
      }
    }
  }

  function handleMineObject(event) {
    const object = event?.detail?.object;
    const type = String(object?.type || object?.payload?.jobType || '');
    if (type === 'mine_station') openModal(object);
    else if (getMineResourceByObjectType(type)) void workWithNode(object);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && modal?.hidden === false) closeModal();
  }

  tabButtons.forEach((button) => button.addEventListener('click', () => setTab(button.dataset.mineTab)));
  tabPages.forEach((page) => {
    page.addEventListener('touchstart', handleScrollTouchStart, { passive: true });
    page.addEventListener('touchmove', handleScrollTouchMove, { passive: false });
    page.addEventListener('touchend', handleScrollTouchEnd, { passive: true });
    page.addEventListener('touchcancel', handleScrollTouchEnd, { passive: true });
  });
  modal?.querySelectorAll('[data-mine-close]').forEach((button) => button.addEventListener('click', closeModal));
  panel?.addEventListener('click', handleBuy);
  panel?.addEventListener('click', handleSell);
  panel?.addEventListener('click', handleBusinessControls);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('mn:mine-object-action', handleMineObject);
  window.addEventListener('mn:job-stream-window-changed', handleJobStreamWindow);
  marketTimer = window.setInterval(renderMarketCountdown, 1000);
  handleJobStreamWindow({
    detail: {
      cityId,
      objects: window.__MN_ACTIVE_JOB_OBJECTS_BY_CITY__?.[String(cityId)] || [],
    },
  });

  return () => {
    destroyed = true;
    stopMineStreamLoading();
    window.clearInterval(marketTimer);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('mn:mine-object-action', handleMineObject);
    window.removeEventListener('mn:job-stream-window-changed', handleJobStreamWindow);
    tabPages.forEach((page) => {
      page.removeEventListener('touchstart', handleScrollTouchStart);
      page.removeEventListener('touchmove', handleScrollTouchMove);
      page.removeEventListener('touchend', handleScrollTouchEnd);
      page.removeEventListener('touchcancel', handleScrollTouchEnd);
    });
    document.body.classList.remove('mn-mine-modal-open');
    modal?.remove();
    cancelMineMiniGame();
    delete window.__MN_MINE_NODE_STATES__;
    delete window.__MN_MINE_BUSINESS_STATE__;
    window.__MN_MINE_NODE_STATES_READY__ = false;
  };
}
