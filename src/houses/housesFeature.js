import { state, save } from '../state.js';
import { supabase } from '../supabaseClient.js';
import { getCityPlayers } from '../player/playerPosition.js';
import { buyHouseFromState, fetchCityHousesState } from './housesRepository.js';
import { getEmptyHousesState, normalizeHousesState } from './housesStats.js';
import {
  enableHousesStatsModal,
  renderHousesFeatureHtml,
} from './housesView.js';

function getPlayerTgId() {
  return (
    state.telegramId ||
    state.player?.tg_id ||
    state.player?.telegramId ||
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
    null
  );
}

function getHouseId(house) {
  return house?.payload?.houseId || house?.houseId || house?.id;
}

function isVisible(element) {
  if (!element) return false;
  if (element.hidden) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;

  const styles = window.getComputedStyle(element);

  return (
    styles.display !== 'none' &&
    styles.visibility !== 'hidden' &&
    Number(styles.opacity || 1) !== 0
  );
}

function hideModal(element) {
  if (!element) return;

  element.hidden = true;
  element.setAttribute('aria-hidden', 'true');

  element.classList.remove(
    'is-open',
    'is-visible',
    'active',
    'open',
    'show'
  );
}

function showModal(element) {
  if (!element) return;

  element.hidden = false;
  element.removeAttribute('aria-hidden');
}

function getHousesModal(root = document) {
  return (
    root.querySelector?.('.houses-modal') ||
    document.querySelector('.houses-modal')
  );
}

function getHouseDetailsModal(root = document) {
  return (
    document.querySelector('.house-details-modal') ||
    root.querySelector?.('.house-details-modal')
  );
}

function hasAnyHouseModalOpen(root = document) {
  return Boolean(
    isVisible(getHousesModal(root)) ||
    isVisible(getHouseDetailsModal(root))
  );
}

function syncHouseBodyState(root = document) {
  const hasOpenModal = hasAnyHouseModalOpen(root);

  document.body?.classList.toggle('mn-houses-modal-open', hasOpenModal);

  if (!isVisible(getHouseDetailsModal(root))) {
    document.body?.classList.remove('mn-house-details-open');
  }
}

function closeHouseSelectionPanels(root = document) {
  root
    .querySelectorAll('.house-selection-panel')
    .forEach((panel) => hideModal(panel));
}

function closeHouseDetails(root = document) {
  const detailsModal = getHouseDetailsModal(root);

  hideModal(detailsModal);
  document.body?.classList.remove('mn-house-details-open');

  syncHouseBodyState(root);
}

function closeHousesList(root = document) {
  const housesModal = getHousesModal(root);

  hideModal(housesModal);
  syncHouseBodyState(root);
}

function openHousesListOnly(root = document) {
  closeHouseDetails(root);
  closeHouseSelectionPanels(root);

  const housesModal = getHousesModal(root);

  if (housesModal) {
    showModal(housesModal);
  }

  document.body?.classList.remove('mn-house-details-open');
  syncHouseBodyState(root);
}

function openHouseDetailsOnly(root = document) {
  const detailsModal = getHouseDetailsModal(root);

  if (!detailsModal || !isVisible(detailsModal)) {
    syncHouseBodyState(root);
    return;
  }

  closeHousesList(root);
  closeHouseSelectionPanels(root);

  showModal(detailsModal);
  document.body?.classList.add('mn-house-details-open');

  syncHouseBodyState(root);
}

function resetHouseModals(root = document) {
  const scope = root || document;

  scope
    .querySelectorAll?.('.houses-modal, .house-details-modal, .house-selection-panel')
    .forEach((modal) => hideModal(modal));

  document
    .querySelectorAll('.house-details-modal')
    .forEach((modal) => hideModal(modal));

  document.body?.classList.remove('mn-houses-modal-open');
  document.body?.classList.remove('mn-house-details-open');
}

function isHousesModalOpen(root = document) {
  return isVisible(getHousesModal(root));
}

async function loadCitySummary(cityId) {
  const runtime = state.citiesRuntime?.[cityId] || {};
  const economy = runtime.economy || runtime;

  const summary = {
    budget:
      economy.budget ??
      economy.cityBudget ??
      economy.moneySupply?.value ??
      0,
    inflation:
      economy.inflation ??
      economy.inflationPercent ??
      0,
    registeredPlayers: 0,
    onlinePlayers: 0,
  };

  try {
    const players = await getCityPlayers(cityId);
    summary.onlinePlayers = Array.isArray(players) ? players.length : 0;
  } catch (error) {
    console.warn('[houses] online players count failed:', error);
  }

  try {
    const { count, error } = await supabase
      .from('players')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('city', cityId);

    if (error) throw error;

    summary.registeredPlayers = Number(count || 0);
  } catch (error) {
    console.warn('[houses] registered players count failed:', error);
    summary.registeredPlayers = summary.onlinePlayers;
  }

  return summary;
}

function enableHouseModalGuard(root) {
  if (!root) return null;

  let mode = 'idle';
  let frameId = 0;
  let timeoutId = 0;

  function enforce() {
    if (mode === 'list') {
      openHousesListOnly(root);
      return;
    }

    if (mode === 'details') {
      openHouseDetailsOnly(root);
      return;
    }

    syncHouseBodyState(root);
  }

  function scheduleEnforce(delay = 80) {
    cancelAnimationFrame(frameId);
    clearTimeout(timeoutId);

    frameId = requestAnimationFrame(enforce);
    timeoutId = setTimeout(enforce, delay);
  }

  function handleClick(event) {
    const target = event.target;

    if (!target?.closest) return;

    if (target.closest('.player-city-button')) {
      mode = 'list';

      closeHouseDetails(root);
      closeHouseSelectionPanels(root);

      scheduleEnforce(120);
      return;
    }

    if (
      target.closest('.house-details-backdrop') ||
      target.closest('.house-details-header button') ||
      target.closest('.house-secondary-button')
    ) {
      mode = 'idle';

      closeHouseDetails(root);
      scheduleEnforce(40);
      return;
    }

    if (
      target.closest('.houses-modal-backdrop') ||
      target.closest('.houses-x-button') ||
      target.closest('.houses-close-button')
    ) {
      mode = 'idle';

      closeHouseDetails(root);
      closeHousesList(root);
      closeHouseSelectionPanels(root);

      scheduleEnforce(40);
      return;
    }

    if (
      target.closest('.house-list li') ||
      target.closest('.house-card')
    ) {
      mode = 'list';
      scheduleEnforce(40);
    }
  }

  function handleKeyDown(event) {
    if (event.key !== 'Escape') return;

    mode = 'idle';

    closeHouseDetails(root);
    closeHousesList(root);
    closeHouseSelectionPanels(root);

    scheduleEnforce(20);
  }

  function handleOpenList() {
    mode = 'list';

    closeHouseDetails(root);
    closeHouseSelectionPanels(root);

    scheduleEnforce(80);
  }

  function handleOpenDetails() {
    mode = 'details';
    scheduleEnforce(120);
  }

  const observer = new MutationObserver(() => {
    if (mode === 'idle') {
      syncHouseBodyState(root);
      return;
    }

    scheduleEnforce(80);
  });

  root.addEventListener('click', handleClick, true);
  window.addEventListener('keydown', handleKeyDown, true);

  window.addEventListener('mn:houses-list-open', handleOpenList);
  window.addEventListener('mn:houses-list-opened', handleOpenList);
  window.addEventListener('mn:house-details-open', handleOpenDetails);
  window.addEventListener('mn:house-details-opened', handleOpenDetails);

  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'hidden',
      'class',
      'style',
      'aria-hidden',
    ],
  });

  return () => {
    cancelAnimationFrame(frameId);
    clearTimeout(timeoutId);

    root.removeEventListener('click', handleClick, true);
    window.removeEventListener('keydown', handleKeyDown, true);

    window.removeEventListener('mn:houses-list-open', handleOpenList);
    window.removeEventListener('mn:houses-list-opened', handleOpenList);
    window.removeEventListener('mn:house-details-open', handleOpenDetails);
    window.removeEventListener('mn:house-details-opened', handleOpenDetails);

    observer.disconnect();
  };
}

export async function loadHousesFeature(cityId) {
  try {
    const rawState = await fetchCityHousesState(cityId);
    return normalizeHousesState(rawState);
  } catch (error) {
    console.warn('[houses] houses feature load failed:', error);
    return getEmptyHousesState();
  }
}

export { renderHousesFeatureHtml };

export function enableHousesFeature(root, { cityId, city } = {}) {
  let cleanupModal = null;
  let cleanupGuard = null;
  let refreshTimer = null;
  let destroyed = false;

  async function handleBuyHouse(house) {
    const tgId = getPlayerTgId();

    if (!tgId) {
      throw new Error('PLAYER_TG_ID_NOT_FOUND');
    }

    const result = await buyHouseFromState({
      houseId: getHouseId(house),
      playerId: tgId,
    });

    if (result?.newBalance !== undefined) {
      state.player = {
        ...(state.player || {}),
        balance: Number(result.newBalance),
      };

      save();

      window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
        detail: {
          balance: Number(result.newBalance),
          source: 'buy_house',
        },
      }));
    }

    window.dispatchEvent(new CustomEvent('mn:houses-updated', {
      detail: {
        cityId,
        houseId: getHouseId(house),
        result,
      },
    }));

    window.dispatchEvent(new CustomEvent('mn:map-objects-changed', {
      detail: {
        cityId,
        source: 'buy_house',
        houseId: getHouseId(house),
        result,
      },
    }));

    return result;
  }

  async function mountModal({ reopenAfterRefresh = false } = {}) {
    if (destroyed) return;

    const shouldReopenList = Boolean(
      reopenAfterRefresh &&
      isHousesModalOpen(root)
    );

    cleanupModal?.();
    cleanupGuard?.();

    root
      .querySelectorAll('.houses-modal, .house-details-modal')
      .forEach((modal) => modal.remove());

    document.body?.classList.remove('mn-houses-modal-open');
    document.body?.classList.remove('mn-house-details-open');

    const [houses, cityStats] = await Promise.all([
      loadHousesFeature(cityId),
      loadCitySummary(cityId),
    ]);

    if (destroyed) return;

    root.insertAdjacentHTML('beforeend', renderHousesFeatureHtml({
      city: city || { name: cityId || 'Город' },
      houses,
      cityStats,
    }));

    cleanupModal = enableHousesStatsModal(root, {
      onBuyHouse: handleBuyHouse,
    });

    cleanupGuard = enableHouseModalGuard(root);

    resetHouseModals(root);

    if (shouldReopenList) {
      requestAnimationFrame(() => {
        root.querySelector('.player-city-button')?.click();
      });
    }
  }

  function scheduleRefresh() {
    const wasListOpenBeforeRefresh = isHousesModalOpen(root);

    clearTimeout(refreshTimer);

    refreshTimer = setTimeout(() => {
      mountModal({
        reopenAfterRefresh: wasListOpenBeforeRefresh,
      });
    }, 250);
  }

  function handleRealtimeRefresh(event) {
    if (
      event?.detail?.cityId &&
      String(event.detail.cityId) !== String(cityId)
    ) {
      return;
    }

    scheduleRefresh();
  }

  resetHouseModals(root);
  mountModal();

  window.addEventListener('mn:map-objects-changed', handleRealtimeRefresh);
  window.addEventListener('mn:houses-realtime-changed', handleRealtimeRefresh);

  return () => {
    destroyed = true;
    clearTimeout(refreshTimer);

    window.removeEventListener('mn:map-objects-changed', handleRealtimeRefresh);
    window.removeEventListener('mn:houses-realtime-changed', handleRealtimeRefresh);

    cleanupGuard?.();
    cleanupModal?.();

    resetHouseModals(root);
  };
}
