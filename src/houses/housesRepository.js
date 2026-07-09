import { supabase } from '../supabaseClient.js';
import { getMapObjects } from '../mapObjects/mapObjectsRepository.js';

function isHouseObject(object) {
  return object?.category === 'house' || object?.type === 'house' || object?.payload?.kind === 'house';
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
      id: payload.id || house?.id || null,
      objectId: payload.objectId || house?.id || null,
      mapObjectId: payload.mapObjectId || house?.id || null,
      houseId: payload.houseId || payload.house_id || house?.id || null,
      house_id: payload.house_id || payload.houseId || house?.id || null,
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

function createObjectId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  return `obj_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
    payload.localObjectId,
    payload.legacyObjectId,
    payload.legacyHouseId,
    payload.__mnLegacyObjectId,
    payload.__mnLegacyHouseId,
    house?.houseId,
    house?.house_id,
  ]);
}

async function queryMapObjectById(candidate) {
  const text = String(candidate || '').trim();
  if (!text) return null;

  const { data, error } = await supabase
    .from('map_objects')
    .select('*')
    .eq('id', text)
    .maybeSingle();

  if (error) {
    // В одних базах id = uuid, в других id = text. Для uuid-колонки non-uuid даст 22P02.
    // Это не фатально: дальше проверяем payload и координаты.
    console.warn('[houses] map object load by id failed:', text, error);
    return null;
  }

  return data || null;
}

async function queryMapObjectByPayload(candidate) {
  const payloadKeys = [
    'houseId',
    'house_id',
    'mapObjectId',
    'objectId',
    'id',
    'localObjectId',
    'legacyObjectId',
    'legacyHouseId',
    '__mnLegacyObjectId',
    '__mnLegacyHouseId',
  ];

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

  return null;
}

function rowLooksLikeHouse(row = {}) {
  const payload = row?.payload && typeof row.payload === 'object'
    ? row.payload
    : {};

  return (
    row.category === 'house' ||
    row.type === 'house' ||
    payload.category === 'house' ||
    payload.type === 'house' ||
    payload.kind === 'house'
  );
}

async function queryMapObjectByCoordinates(house = {}) {
  const cityId = String(house?.cityId || house?.city_id || house?.payload?.cityId || house?.payload?.city_id || '').trim();
  const x = Number(house?.x ?? house?.payload?.x);
  const y = Number(house?.y ?? house?.payload?.y);

  if (!cityId || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  // Старые локальные дома могли не иметь houseId/mapObjectId в payload.
  // Поэтому ищем по городу и точке, но фильтр house делаем на клиенте: в базе у старых строк
  // иногда заполнен type='house', а category мог быть пустым/marker.
  const minX = x - 0.03;
  const maxX = x + 0.03;
  const minY = y - 0.03;
  const maxY = y + 0.03;

  const { data: rows, error } = await supabase
    .from('map_objects')
    .select('*')
    .eq('city_id', cityId)
    .gte('x', minX)
    .lte('x', maxX)
    .gte('y', minY)
    .lte('y', maxY)
    .limit(20);

  if (error) {
    console.warn('[houses] map object coordinate fallback failed:', error);
    return null;
  }

  return (Array.isArray(rows) ? rows : []).find(rowLooksLikeHouse) || null;
}

function normalizeHouseMapObjectForInsert(house = {}) {
  const payload = house?.payload && typeof house.payload === 'object'
    ? house.payload
    : {};

  const candidates = getHouseLookupCandidates('', house);
  const stableId = candidates.find(isUuidLike) || createObjectId();
  const legacyId = candidates.find((value) => value && String(value) !== String(stableId)) || null;
  const cityId = String(house?.cityId || house?.city_id || payload.cityId || payload.city_id || '').trim();
  const now = new Date().toISOString();

  const nextPayload = {
    ...payload,
    id: stableId,
    objectId: stableId,
    mapObjectId: stableId,
    houseId: stableId,
    house_id: stableId,
    cityId,
    city_id: cityId,
    kind: 'house',
    type: 'house',
    category: 'house',
    icon: house?.icon || payload.icon || '🏠',
    asset: house?.asset || payload.asset || '',
    x: toFiniteNumber(house?.x ?? payload.x, 50),
    y: toFiniteNumber(house?.y ?? payload.y, 50),
    rotation: toFiniteNumber(house?.rotation ?? payload.rotation, 0),
    scale: toFiniteNumber(house?.scale ?? payload.scale, 1),
    variant: house?.variant || payload.variant || payload.houseClass || 'standard',
    houseClass: house?.class || payload.houseClass || house?.variant || 'standard',
    price: Number(house?.price ?? payload.price ?? 0),
    ownerId: payload.ownerId || payload.owner_id || house?.ownerId || house?.owner_id || null,
    ownerName: payload.ownerName || payload.owner_name || house?.ownerName || house?.owner_name || null,
    owned: Boolean(payload.ownerId || payload.owner_id || house?.ownerId || house?.owner_id || payload.owned),
    locked: Boolean(payload.locked || house?.locked),
    buyable: payload.buyable ?? true,
    visible: payload.visible ?? true,
  };

  if (legacyId) {
    nextPayload.localObjectId = nextPayload.localObjectId || legacyId;
    nextPayload.legacyObjectId = nextPayload.legacyObjectId || legacyId;
    nextPayload.legacyHouseId = nextPayload.legacyHouseId || legacyId;
    nextPayload.__mnLegacyObjectId = nextPayload.__mnLegacyObjectId || legacyId;
    nextPayload.__mnLegacyHouseId = nextPayload.__mnLegacyHouseId || legacyId;
  }

  house.id = stableId;
  house.mapObjectId = stableId;
  house.objectId = stableId;
  house.cityId = cityId;
  house.payload = nextPayload;

  return {
    id: stableId,
    city_id: cityId,
    type: 'house',
    category: 'house',
    name: house?.name || payload.name || `Дом · ${nextPayload.houseClass}`,
    icon: house?.icon || payload.icon || '🏠',
    asset: house?.asset || payload.asset || '',
    x: nextPayload.x,
    y: nextPayload.y,
    rotation: nextPayload.rotation,
    scale: nextPayload.scale,
    variant: nextPayload.variant,
    payload: nextPayload,
    created_at: house?.createdAt || house?.created_at || now,
    updated_at: now,
  };
}

async function persistLocalHouseMapObject(house = {}) {
  const row = normalizeHouseMapObjectForInsert(house);

  if (!row.city_id) return null;

  const { data, error } = await supabase
    .from('map_objects')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    console.warn('[houses] local map object persist failed:', error);
    return null;
  }

  return data || row;
}

async function findHouseMapObject(houseId, house = {}) {
  const candidates = getHouseLookupCandidates(houseId, house);

  if (!candidates.length) {
    return null;
  }

  // 1) Реальный id строки map_objects. Проверяем и uuid, и text-id.
  for (const candidate of candidates) {
    const row = await queryMapObjectById(candidate);
    if (row) return row;
  }

  // 2) Legacy payload ids: house_..., старый id, numeric-id, etc.
  for (const candidate of candidates) {
    const row = await queryMapObjectByPayload(candidate);
    if (row) return row;
  }

  // 3) Последний fallback: тот же город + координаты.
  const rowByCoordinates = await queryMapObjectByCoordinates(house);
  if (rowByCoordinates) return rowByCoordinates;

  // 4) Если дом есть только в локальном кеше после старого бага с house_... id,
  // пробуем один раз записать его в map_objects уже с нормальным uuid-id.
  const persistedRow = await persistLocalHouseMapObject(house);
  if (persistedRow) return persistedRow;

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
    id: mapObjectId,
    objectId: mapObjectId,
    mapObjectId,
    houseId: mapObjectId,
    house_id: mapObjectId,
    kind: 'house',
    type: 'house',
    category: 'house',
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

  if (isHouseObject(house) || !Number.isFinite(dbHouseId) || dbHouseId <= 0) {
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
