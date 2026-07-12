import { state, save } from '../state.js';
import { supabase } from '../supabaseClient.js';
import { fetchCityStats } from '../api/cityStats.js';
import { getCityPlayers } from '../player/playerPosition.js';
import {
  buyHouseFromState,
  fetchCityHousesState,
  sellHouseToState,
} from './housesRepository.js';
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

function looksLikeLocalHouseId(value) {
  return /^house[_-]/i.test(String(value || '').trim());
}

function getHouseId(house) {
  const payload = house?.payload || {};

  const candidates = [
    house?.mapObjectId,
    house?.objectId,
    house?.dbId,
    payload.mapObjectId,
    payload.objectId,
    payload.id,
    house?.id,
    payload.houseId,
    payload.house_id,
    house?.houseId,
    house?.house_id,
  ];

  // Для покупки сначала всегда берём реальный id map_objects.
  // Короткий номер дома и legacy house_... нельзя использовать как основной id покупки.
  const realId = candidates.find((value) => {
    const text = String(value || '').trim();
    return text && !looksLikeLocalHouseId(text);
  });

  return realId || String(candidates.find(Boolean) || '').trim() || null;
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

function resetHouseModals(root = document) {
  const scope = root || document;

  scope
    .querySelectorAll?.('.houses-modal, .house-details-modal, .house-selection-panel')
    .forEach((modal) => hideModal(modal));

  document
    .querySelectorAll('.houses-modal, .house-details-modal, .house-selection-panel')
    .forEach((modal) => hideModal(modal));

  document.body?.classList.remove('mn-houses-modal-open');
  document.body?.classList.remove('mn-house-details-open');
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
    taxBurned:
      economy.taxBurned ??
      economy.tax_burned ??
      economy.burnedTax ??
      0,
  };

  try {
    const remoteStats = await fetchCityStats(cityId);

    if (remoteStats) {
      summary.budget = Number(remoteStats.budget ?? summary.budget ?? 0);
      summary.taxBurned = Number(remoteStats.taxBurned ?? summary.taxBurned ?? 0);
    }
  } catch (error) {
    console.warn('[houses] city economy stats failed:', error);
  }

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

function getRealtimeObjectCategory(event) {
  const realtimePayload = event?.detail?.payload;
  const row = realtimePayload?.new || realtimePayload?.old || null;

  if (!row) return '';

  const payload = row.payload && typeof row.payload === 'object'
    ? row.payload
    : {};

  return String(
    row.category ||
    row.type ||
    payload.category ||
    payload.type ||
    payload.kind ||
    ''
  ).toLowerCase();
}

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
      house,
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

    if (
      result?.cityBudget !== undefined ||
      result?.budget !== undefined ||
      result?.taxBurned !== undefined ||
      result?.tax_burned !== undefined
    ) {
      const cityRuntime = state.citiesRuntime?.[cityId] || {};
      const cityBudget = Number(result.cityBudget ?? result.budget ?? cityRuntime.budget ?? 0);
      const taxBurned = Number(result.taxBurned ?? result.tax_burned ?? cityRuntime.taxBurned ?? 0);

      state.citiesRuntime = {
        ...(state.citiesRuntime || {}),
        [cityId]: {
          ...cityRuntime,
          budget: cityBudget,
          taxBurned,
        },
      };

      save();

      window.dispatchEvent(new CustomEvent('mn:city-economy-changed', {
        detail: {
          cityId,
          budget: cityBudget,
          taxBurned,
          source: 'buy_house',
          result,
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

  async function handleSellHouseToState(house) {
    const tgId = getPlayerTgId();

    if (!tgId) throw new Error('PLAYER_TG_ID_NOT_FOUND');

    const result = await sellHouseToState({
      houseId: getHouseId(house),
      playerId: tgId,
    });

    const nextBalance = Number(result.newBalance);
    if (Number.isFinite(nextBalance)) {
      state.player = { ...(state.player || {}), balance: nextBalance };
      save();

      window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
        detail: { balance: nextBalance, source: 'sell_house_to_state', result },
      }));
    }

    const cityRuntime = state.citiesRuntime?.[cityId] || {};
    const cityBudget = Number(result.cityBudget ?? result.budget);
    if (Number.isFinite(cityBudget)) {
      state.citiesRuntime = {
        ...(state.citiesRuntime || {}),
        [cityId]: { ...cityRuntime, budget: cityBudget },
      };
      save();

      window.dispatchEvent(new CustomEvent('mn:city-economy-changed', {
        detail: { cityId, budget: cityBudget, source: 'sell_house_to_state', result },
      }));
    }

    window.dispatchEvent(new CustomEvent('mn:houses-updated', {
      detail: { cityId, houseId: getHouseId(house), source: 'sell_house_to_state', result },
    }));
    window.dispatchEvent(new CustomEvent('mn:map-objects-changed', {
      detail: { cityId, houseId: getHouseId(house), source: 'sell_house_to_state', result },
    }));

    return result;
  }

  async function mountModal() {
    if (destroyed) return;

    cleanupModal?.();
    cleanupModal = null;

    /*
      ВАЖНО:
      Удаляем старые модалки и из root, и из body.
      Иначе на телефоне остаётся старый DOM-слой, который потом не закрывается.
    */
    root
      .querySelectorAll('.houses-modal, .house-details-modal')
      .forEach((modal) => modal.remove());

    document
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
      onSellHouseToState: handleSellHouseToState,
    });

    resetHouseModals(root);
  }

  function scheduleRefresh() {
    /*
      ВАЖНО:
      Больше НЕ переоткрываем модалку автоматически после refresh.
      Именно из-за авто-reopen окно могло всплывать само.
    */
    clearTimeout(refreshTimer);

    refreshTimer = setTimeout(() => {
      mountModal();
    }, 250);
  }

  function handleRealtimeRefresh(event) {
    if (
      event?.detail?.cityId &&
      String(event.detail.cityId) !== String(cityId)
    ) {
      return;
    }

    const realtimeCategory = getRealtimeObjectCategory(event);

    // Бизнесы, деревья и будущие map_objects обновляют общий слой карты, но не
    // должны заставлять модуль недвижимости заново грузить дома и статистику.
    // Пустую категорию пропускаем: DELETE при стандартной replica identity
    // иногда содержит только id, и такой дом нельзя безопасно проигнорировать.
    if (
      event?.detail?.source === 'realtime' &&
      realtimeCategory &&
      realtimeCategory !== 'house'
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

    cleanupModal?.();
    resetHouseModals(root);
  };
}
