import { supabase } from '../supabaseClient.js';
import { getMapObjects } from '../mapObjects/mapObjectsRepository.js';

function isHouseObject(object) {
  return object?.category === 'house' || object?.type === 'house';
}

function isHouseOwned(house) {
  return Boolean(
    house?.owner_id ||
    house?.ownerName ||
    house?.payload?.ownerId ||
    house?.payload?.owner_id ||
    house?.payload?.ownerName ||
    house?.payload?.owned
  );
}

function normalizeHouseForUi(house) {
  const payload = house?.payload || {};

  return {
    ...house,
    price: house?.price || payload.price || 0,
    class: house?.class || payload.houseClass || payload.houseClassLabel || house?.variant || 'standard',
    owner_id: house?.owner_id || payload.ownerId || payload.owner_id || null,
    ownerName: house?.ownerName || payload.ownerName || payload.owner_name || null,
    payload: {
      ...payload,
      price: house?.price || payload.price || 0,
      houseClass: house?.class || payload.houseClass || payload.houseClassLabel || house?.variant || 'standard',
      ownerId: house?.owner_id || payload.ownerId || payload.owner_id || null,
      ownerName: house?.ownerName || payload.ownerName || payload.owner_name || null,
      owned: isHouseOwned(house),
    },
  };
}

export async function fetchCityHousesState(cityId) {
  const objects = await getMapObjects(cityId);

  const houses = objects
    .filter(isHouseObject)
    .map(normalizeHouseForUi);

  const housesFree = houses.filter((house) => !isHouseOwned(house));
  const housesOwned = houses.filter(isHouseOwned);

  return {
    houses,
    housesTotal: houses.length,
    housesFree: housesFree.length,
    housesOwned: housesOwned.length,
  };
}

export async function buyHouseFromState({ houseId, playerId }) {
  const dbHouseId = Number(houseId);

  if (!Number.isFinite(dbHouseId) || dbHouseId <= 0) {
    throw new Error('HOUSE_ID_INVALID');
  }

  const { data, error } = await supabase.rpc('buy_house_from_state', {
    p_house_id: dbHouseId,
    p_tg_id: String(playerId),
  });

  if (error) {
    console.error('[houses] buy failed:', error);
    throw error;
  }

  return data;
}
