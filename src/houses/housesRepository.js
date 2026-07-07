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
    mapObjectId: house?.mapObjectId || house?.objectId || house?.id || payload.mapObjectId || null,
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

function normalizeBuyResultFromMapObject(row, playerId) {
  const payload = row?.payload || {};

  return {
    ok: true,
    source: 'map_objects_fallback',
    houseId: payload.houseId || row?.id,
    mapObjectId: row?.id,
    playerId: String(playerId || ''),
    ownerId: String(playerId || ''),
    ownerName: payload.ownerName || 'Игрок',
    price: Number(payload.price || 0),
    houseClass: payload.houseClass || row?.variant || 'standard',
  };
}

async function findHouseMapObject(houseId) {
  const rawId = String(houseId || '').trim();

  if (!rawId) {
    return null;
  }

  // 1) Основной вариант: покупка по реальному id строки map_objects.
  const { data: rowById, error: idError } = await supabase
    .from('map_objects')
    .select('*')
    .eq('id', rawId)
    .maybeSingle();

  if (idError) {
    console.warn('[houses] map object load by id failed:', idError);
  }

  if (rowById) {
    return rowById;
  }

  // 2) Legacy-вариант: старый UI мог передать payload.houseId вида house_1783...
  const { data: rowsByPayload, error: payloadError } = await supabase
    .from('map_objects')
    .select('*')
    .filter('payload->>houseId', 'eq', rawId)
    .limit(1);

  if (payloadError) {
    console.warn('[houses] map object load by payload.houseId failed:', payloadError);
  }

  if (Array.isArray(rowsByPayload) && rowsByPayload.length > 0) {
    return rowsByPayload[0];
  }

  // 3) Ещё один legacy-вариант.
  const { data: rowsByHouseIdSnake, error: snakeError } = await supabase
    .from('map_objects')
    .select('*')
    .filter('payload->>house_id', 'eq', rawId)
    .limit(1);

  if (snakeError) {
    console.warn('[houses] map object load by payload.house_id failed:', snakeError);
  }

  if (Array.isArray(rowsByHouseIdSnake) && rowsByHouseIdSnake.length > 0) {
    return rowsByHouseIdSnake[0];
  }

  return null;
}

async function buyHouseMapObject({ houseId, playerId }) {
  const rawHouseId = String(houseId || '').trim();

  if (!rawHouseId || !playerId) {
    throw new Error('HOUSE_ID_INVALID');
  }

  const row = await findHouseMapObject(rawHouseId);

  if (!row) {
    console.error('[houses] map object not found for houseId:', rawHouseId);
    throw new Error('HOUSE_NOT_FOUND');
  }

  const mapObjectId = row.id;
  const payload = row.payload || {};

  if (payload.ownerId || payload.owner_id || payload.owned === true) {
    throw new Error('HOUSE_ALREADY_OWNED');
  }

  const nextPayload = {
    ...payload,
    mapObjectId,
    houseId: payload.houseId || mapObjectId,
    ownerId: String(playerId),
    owner_id: String(playerId),
    ownerName: payload.ownerName || 'Игрок',
    owned: true,
    locked: false,
    buyable: true,
  };

  const { data: updatedRow, error: updateError } = await supabase
    .from('map_objects')
    .update({
      payload: nextPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', mapObjectId)
    .select('*')
    .single();

  if (updateError) {
    console.error('[houses] map object buy failed:', updateError);
    throw updateError;
  }

  return normalizeBuyResultFromMapObject(updatedRow || { ...row, payload: nextPayload }, playerId);
}

export async function buyHouseFromState({ houseId, playerId }) {
  const rawHouseId = String(houseId || '').trim();
  const dbHouseId = Number(rawHouseId);

  if (!rawHouseId) {
    throw new Error('HOUSE_ID_INVALID');
  }

  if (!Number.isFinite(dbHouseId) || dbHouseId <= 0) {
    return buyHouseMapObject({ houseId: rawHouseId, playerId });
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
