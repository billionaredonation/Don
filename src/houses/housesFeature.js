import { state, save } from '../state.js';
import { getLocalPlayerId } from '../player/playerPosition.js';
import { buyHouseFromState, fetchCityHousesState } from './housesRepository.js';
import { getEmptyHousesState, normalizeHousesState } from './housesStats.js';
import {
  enableHousesStatsModal,
  renderHousesFeatureHtml,
} from './housesView.js';

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

export function enableHousesFeature(root, { cityId } = {}) {
  return enableHousesStatsModal(root, {
    async onBuyHouse(house) {
      const tgId = getLocalPlayerId();

      if (!tgId) {
        throw new Error('PLAYER_TG_ID_NOT_FOUND');
      }

      const result = await buyHouseFromState({
        houseId: house?.payload?.houseId || house?.houseId || house?.id,
        playerId: tgId,
      });

      if (result?.newBalance !== undefined) {
        state.player = {
          ...(state.player || {}),
          balance: Number(result.newBalance),
        };

        save();
      }

      window.dispatchEvent(new CustomEvent('mn:houses-updated', {
        detail: {
          cityId,
          houseId: house?.payload?.houseId || house?.houseId || house?.id,
          result,
        },
      }));

      return result;
    },
  });
}
