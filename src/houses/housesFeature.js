import { state, save } from '../state.js';
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

  async function mountModal({ keepOpen = false } = {}) {
    if (destroyed) return;

    const wasOpen =
      keepOpen ||
      document.body.classList.contains('mn-houses-modal-open');

    cleanupModal?.();

    const oldModal = document.body.querySelector('.houses-modal');
    oldModal?.remove();

    const houses = await loadHousesFeature(cityId);

    if (destroyed) return;

    root.insertAdjacentHTML('beforeend', renderHousesFeatureHtml({
      city: city || { name: cityId || 'Город' },
      houses,
    }));

    cleanupModal = enableHousesStatsModal(root, {
      onBuyHouse: handleBuyHouse,
    });

    if (wasOpen) {
      root.querySelector('.player-city-button')?.click();
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);

    refreshTimer = setTimeout(() => {
      mountModal({ keepOpen: true });
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

  mountModal();

  window.addEventListener('mn:map-objects-changed', handleRealtimeRefresh);
  window.addEventListener('mn:houses-realtime-changed', handleRealtimeRefresh);

  return () => {
    destroyed = true;
    clearTimeout(refreshTimer);

    window.removeEventListener('mn:map-objects-changed', handleRealtimeRefresh);
    window.removeEventListener('mn:houses-realtime-changed', handleRealtimeRefresh);

    cleanupModal?.();
  };
}
