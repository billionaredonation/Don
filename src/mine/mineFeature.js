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
import './mine.css';

const MINE_STATE_REFRESH_MS = 5000;
const MINE_INVENTORY_REFRESH_MS = 12000;

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

  window.__MN_MINE_NODE_STATES_READY__ = false;

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
    marketRequestVersion += 1;
    activeBuyerObjectId = String(object?.id || '');
    marketLoading = false;
    marketLoadFailed = false;
    marketState = { items: [] };
    setStatus('');
    publishMarket(marketState);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-mine-modal-open');
    void refreshInventory({ silent: false });
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
  }

  async function workWithNode(object) {
    if (busy) return;
    const objectType = String(object?.type || object?.payload?.jobType || '');
    const resource = getMineResourceByObjectType(objectType);
    if (!resource) return;

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
      const game = await playMineMiniGame({ resourceIcon: resource.icon, resourceLabel: resource.label });
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
    if (!button || busy) return;
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
    if (!button || busy) return;
    busy = true;
    renderInventory();
    setStatus('Взвешиваем и продаём сырьё…');
    try {
      const result = await sellMineSubtype({
        cityId,
        buyerObjectId: activeBuyerObjectId,
        subtypeCode: String(button.dataset.mineSell || ''),
        quantity: Math.max(0, Math.floor(Number(button.dataset.quantity) || 0)),
      });
      if (result.inventory) publishInventory(result.inventory);
      if (result.market) publishMarket(result.market);
      setStatus(`Продано ${Number(result.soldQuantity) || 0} кг · +${Number(result.totalPrice || 0).toLocaleString('ru-RU')} ₴`, 'success');
    } catch (error) {
      setStatus(getMineUserErrorMessage(error), 'error');
    } finally {
      busy = false;
      renderInventory();
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
  modal?.querySelectorAll('[data-mine-close]').forEach((button) => button.addEventListener('click', closeModal));
  panel?.addEventListener('click', handleBuy);
  panel?.addEventListener('click', handleSell);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('mn:mine-object-action', handleMineObject);

  realtimeChannel = supabase
    .channel(`mine-nodes:${cityId}:${Math.random().toString(16).slice(2)}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'mine_node_states', filter: `city_id=eq.${cityId}`,
    }, (payload) => {
      if (payload.eventType === 'DELETE') removeNodeState(payload.old?.node_object_id);
      else upsertNodeState(payload.new);
    })
    .subscribe();

  stateTimer = window.setInterval(refreshNodeStates, MINE_STATE_REFRESH_MS);
  inventoryTimer = window.setInterval(() => refreshInventory({ silent: true }), MINE_INVENTORY_REFRESH_MS);
  marketTimer = window.setInterval(renderMarketCountdown, 1000);
  void refreshNodeStates();
  void refreshInventory({ silent: true });

  return () => {
    destroyed = true;
    window.clearInterval(stateTimer);
    window.clearInterval(inventoryTimer);
    window.clearInterval(marketTimer);
    if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('mn:mine-object-action', handleMineObject);
    document.body.classList.remove('mn-mine-modal-open');
    modal?.remove();
    cancelMineMiniGame();
    delete window.__MN_MINE_NODE_STATES__;
    window.__MN_MINE_NODE_STATES_READY__ = false;
  };
}
