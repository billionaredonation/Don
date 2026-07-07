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
    houseId: row?.id || payload.houseId,
    mapObjectId: row?.id,
    playerId: String(playerId || ''),
    ownerId: String(playerId || ''),
    ownerName: payload.ownerName || 'Игрок',
    price: Number(payload.price || 0),
    houseClass: payload.houseClass || row?.variant || 'standard',
  };
}


function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function uniq(values) {
  const out = [];
  const seen = new Set();

  values.forEach((value) => {
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  });

  return out;
}

function getHouseLookupCandidates(houseId, house = {}) {
  const payload = house?.payload || {};

  return uniq([
    houseId,
    house?.mapObjectId,
    house?.objectId,
    house?.dbId,
    house?.id,
    payload.mapObjectId,
    payload.objectId,
    payload.id,
    payload.houseId,
    payload.house_id,
    house?.houseId,
    house?.house_id,
  ]);
}

async function findHouseMapObject(houseId, house = {}) {
  const candidates = getHouseLookupCandidates(houseId, house);

  if (!candidates.length) {
    return null;
  }

  // 1) Реальный id строки map_objects. Для uuid-колонки не шлём house_... в .eq('id'), иначе Supabase падает.
  for (const candidate of candidates) {
    if (!isUuidLike(candidate)) continue;

    const { data: rowById, error: idError } = await supabase
      .from('map_objects')
      .select('*')
      .eq('id', candidate)
      .maybeSingle();

    if (idError) {
      console.warn('[houses] map object load by uuid failed:', candidate, idError);
      continue;
    }

    if (rowById) {
      return rowById;
    }
  }

  // 2) Legacy payload ids: house_..., старый id, numeric-id, etc.
  for (const candidate of candidates) {
    const payloadKeys = ['houseId', 'house_id', 'mapObjectId', 'objectId', 'id'];

    for (const key of payloadKeys) {
      const { data: rows, error } = await supabase
        .from('map_objects')
        .select('*')
        .filter(`payload->>${key}`, 'eq', candidate)
        .limit(1);

      if (error) {
        console.warn(`[houses] map object load by payload.${key} failed:`, candidate, error);
        continue;
      }

      if (Array.isArray(rows) && rows.length > 0) {
        return rows[0];
      }
    }
  }

  // 3) Последний fallback: тот же город + координаты. Нужен для старых локальных домов, где id успел рассинхрониться.
  const cityId = String(house?.cityId || house?.city_id || house?.payload?.cityId || house?.payload?.city_id || '').trim();
  const x = Number(house?.x ?? house?.payload?.x);
  const y = Number(house?.y ?? house?.payload?.y);

  if (cityId && Number.isFinite(x) && Number.isFinite(y)) {
    const minX = x - 0.001;
    const maxX = x + 0.001;
    const minY = y - 0.001;
    const maxY = y + 0.001;

    const { data: rows, error } = await supabase
      .from('map_objects')
      .select('*')
      .eq('city_id', cityId)
      .in('category', ['house'])
      .gte('x', minX)
      .lte('x', maxX)
      .gte('y', minY)
      .lte('y', maxY)
      .limit(1);

    if (error) {
      console.warn('[houses] map object coordinate fallback failed:', error);
    }

    if (Array.isArray(rows) && rows.length > 0) {
      return rows[0];
    }
  }

  console.error('[houses] map object not found. lookup candidates:', candidates, 'house:', house);
  return null;
}

async function buyHouseMapObject({ houseId, house, playerId }) {
  const rawHouseId = String(houseId || '').trim();

  if (!rawHouseId || !playerId) {
    throw new Error('HOUSE_ID_INVALID');
  }

  const row = await findHouseMapObject(rawHouseId, house);

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
    houseId: mapObjectId,
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

export async function buyHouseFromState({ houseId, house, playerId }) {
  const rawHouseId = String(houseId || '').trim();
  const dbHouseId = Number(rawHouseId);

  if (!rawHouseId) {
    throw new Error('HOUSE_ID_INVALID');
  }

  if (!Number.isFinite(dbHouseId) || dbHouseId <= 0) {
    return buyHouseMapObject({ houseId: rawHouseId, house, playerId });
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
