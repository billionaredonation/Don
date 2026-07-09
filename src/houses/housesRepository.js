import { supabase } from '../supabaseClient.js';
import { getMapObjects } from '../mapObjects/mapObjectsRepository.js';

function normalizePayload(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(String(value)) || {};
  } catch {
    return {};
  }
}

function isHouseObject(object) {
  const payload = normalizePayload(object?.payload);

  return (
    object?.category === 'house' ||
    object?.type === 'house' ||
    payload.kind === 'house' ||
    payload.category === 'house' ||
    payload.type === 'house'
  );
}

function isHouseOwned(house) {
  const payload = normalizePayload(house?.payload);

  return Boolean(
    house?.owner_id ||
      house?.ownerId ||
      house?.ownerName ||
      payload.ownerId ||
      payload.owner_id ||
      payload.ownerName ||
      payload.owner_name ||
      payload.owned
  );
}

function normalizeHouseClass(value) {
  const raw = String(value || 'standard').trim().toLowerCase();

  if (['premium', 'prem', 'премиум'].includes(raw)) return 'premium';
  if (['ultra_lux', 'ultra-lux', 'ultra', 'lux', 'luxe', 'luxury', 'vip', 'ультра люкс'].includes(raw)) return 'ultra_lux';

  return 'standard';
}

function normalizeHouseForUi(house) {
  const payload = normalizePayload(house?.payload);
  const id = String(house?.id || payload.id || payload.mapObjectId || payload.objectId || payload.houseId || '').trim();
  const mapObjectId = String(house?.mapObjectId || house?.objectId || payload.mapObjectId || payload.objectId || id || '').trim();
  const houseClass = normalizeHouseClass(house?.class || payload.houseClass || payload.houseClassLabel || house?.variant || 'standard');
  const ownerId = house?.owner_id || house?.ownerId || payload.ownerId || payload.owner_id || null;
  const ownerName = house?.ownerName || house?.owner_name || payload.ownerName || payload.owner_name || null;
  const price = Number(house?.price ?? payload.price ?? 0) || 0;

  return {
    ...house,
    id: id || house?.id,
    mapObjectId: mapObjectId || id || null,
    objectId: house?.objectId || mapObjectId || id || null,
    price,
    class: houseClass,
    owner_id: ownerId,
    ownerId,
    ownerName,
    payload: {
      ...payload,
      id: payload.id || id || null,
      objectId: payload.objectId || mapObjectId || id || null,
      mapObjectId: payload.mapObjectId || mapObjectId || id || null,
      houseId: payload.houseId || payload.house_id || mapObjectId || id || null,
      house_id: payload.house_id || payload.houseId || mapObjectId || id || null,
      cityId: payload.cityId || payload.city_id || house?.cityId || house?.city_id || null,
      city_id: payload.city_id || payload.cityId || house?.city_id || house?.cityId || null,
      kind: 'house',
      type: 'house',
      category: 'house',
      price,
      houseClass,
      ownerId,
      owner_id: ownerId,
      ownerName,
      owner_name: ownerName,
      owned: Boolean(ownerId || ownerName || payload.owned),
      buyable: payload.buyable ?? true,
      visible: payload.visible ?? true,
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
  const payload = normalizePayload(row?.payload);

  return {
    ok: true,
    source: 'map_objects_client_fallback',
    houseId: row?.id || payload.houseId,
    mapObjectId: row?.id || payload.mapObjectId,
    playerId: String(playerId || ''),
    ownerId: String(playerId || ''),
    ownerName: payload.ownerName || 'Игрок',
    price: Number(payload.price || 0),
    houseClass: payload.houseClass || row?.variant || 'standard',
  };
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(String(value || '').trim());
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
  const payload = normalizePayload(house?.payload);

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

function getCityIdFromHouse(house = {}) {
  const payload = normalizePayload(house?.payload);

  return String(
    house?.cityId ||
      house?.city_id ||
      payload.cityId ||
      payload.city_id ||
      ''
  ).trim();
}

function getHouseSnapshot(house = {}) {
  const payload = normalizePayload(house?.payload);

  return {
    id: house?.id || payload.id || null,
    mapObjectId: house?.mapObjectId || payload.mapObjectId || null,
    objectId: house?.objectId || payload.objectId || null,
    houseId: payload.houseId || payload.house_id || house?.houseId || null,
    cityId: getCityIdFromHouse(house),
    city_id: getCityIdFromHouse(house),
    type: 'house',
    category: 'house',
    kind: 'house',
    name: house?.name || payload.name || 'Дом',
    icon: house?.icon || payload.icon || '🏠',
    asset: house?.asset || payload.asset || '',
    x: toFiniteNumber(house?.x ?? payload.x, 50),
    y: toFiniteNumber(house?.y ?? payload.y, 50),
    rotation: toFiniteNumber(house?.rotation ?? payload.rotation, 0),
    scale: toFiniteNumber(house?.scale ?? payload.scale, 1),
    variant: house?.variant || payload.variant || payload.houseClass || 'standard',
    payload: {
      ...payload,
      kind: 'house',
      type: 'house',
      category: 'house',
    },
  };
}

async function buyHouseViaHardRpc({ houseId, house, playerId }) {
  const snapshot = getHouseSnapshot(house);

  const { data, error } = await supabase.rpc('buy_house_map_object_any', {
    p_map_object_id: String(houseId),
    p_tg_id: String(playerId),
    p_city_id: snapshot.cityId || null,
    p_x: Number.isFinite(Number(snapshot.x)) ? Number(snapshot.x) : null,
    p_y: Number.isFinite(Number(snapshot.y)) ? Number(snapshot.y) : null,
    p_house_snapshot: snapshot,
  });

  if (error) {
    console.error('[houses] buy_house_map_object_any failed:', {
      houseId,
      snapshot,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    throw error;
  }

  return data;
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
    console.warn('[houses] map object load by id failed:', text, error);
    return null;
  }

  return data || null;
}

async function queryMapObjectByPayload(candidate) {
  const text = String(candidate || '').trim();
  if (!text) return null;

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
      .filter(`payload->>${key}`, 'eq', text)
      .limit(1);

    if (error) {
      console.warn(`[houses] map object load by payload.${key} failed:`, text, error);
      continue;
    }

    if (Array.isArray(rows) && rows.length > 0) return rows[0];
  }

  return null;
}

function rowLooksLikeHouse(row = {}) {
  const payload = normalizePayload(row?.payload);

  return (
    row.category === 'house' ||
    row.type === 'house' ||
    payload.category === 'house' ||
    payload.type === 'house' ||
    payload.kind === 'house'
  );
}

async function queryMapObjectByCoordinates(house = {}) {
  const cityId = getCityIdFromHouse(house);
  const payload = normalizePayload(house?.payload);
  const x = Number(house?.x ?? payload.x);
  const y = Number(house?.y ?? payload.y);

  if (!cityId || !Number.isFinite(x) || !Number.isFinite(y)) return null;

  const minX = x - 0.35;
  const maxX = x + 0.35;
  const minY = y - 0.35;
  const maxY = y + 0.35;
  const cityCandidates = uniq([
    cityId,
    payload.cityId,
    payload.city_id,
    'zaporizhzhia',
    cityId === 'zaporizhzhia' ? 'zaporizhia' : null,
    cityId === 'zaporizhzhia' ? 'zaporozya' : null,
  ]);

  const { data: rows, error } = await supabase
    .from('map_objects')
    .select('*')
    .in('city_id', cityCandidates)
    .gte('x', minX)
    .lte('x', maxX)
    .gte('y', minY)
    .lte('y', maxY)
    .limit(30);

  if (error) {
    console.warn('[houses] map object coordinate fallback failed:', error);
    return null;
  }

  return (Array.isArray(rows) ? rows : [])
    .filter(rowLooksLikeHouse)
    .sort((a, b) => {
      const da = Math.abs(Number(a.x || 0) - x) + Math.abs(Number(a.y || 0) - y);
      const db = Math.abs(Number(b.x || 0) - x) + Math.abs(Number(b.y || 0) - y);
      return da - db;
    })[0] || null;
}

function normalizeHouseMapObjectForInsert(house = {}) {
  const snapshot = getHouseSnapshot(house);
  const candidates = getHouseLookupCandidates('', house);
  const stableId = candidates.find(isUuidLike) || String(snapshot.id || '') || createObjectId();
  const legacyId = candidates.find((value) => value && String(value) !== String(stableId)) || null;
  const cityId = snapshot.cityId;
  const now = new Date().toISOString();

  const nextPayload = {
    ...(snapshot.payload || {}),
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
    icon: snapshot.icon,
    asset: snapshot.asset,
    x: snapshot.x,
    y: snapshot.y,
    rotation: snapshot.rotation,
    scale: snapshot.scale,
    variant: snapshot.variant,
    houseClass: normalizeHouseClass(snapshot.payload?.houseClass || snapshot.variant),
    price: Number(snapshot.payload?.price || 0),
    ownerId: snapshot.payload?.ownerId || snapshot.payload?.owner_id || null,
    ownerName: snapshot.payload?.ownerName || snapshot.payload?.owner_name || null,
    owned: Boolean(snapshot.payload?.ownerId || snapshot.payload?.owner_id || snapshot.payload?.owned),
    locked: Boolean(snapshot.payload?.locked),
    buyable: true,
    visible: true,
  };

  if (legacyId) {
    nextPayload.localObjectId = nextPayload.localObjectId || legacyId;
    nextPayload.legacyObjectId = nextPayload.legacyObjectId || legacyId;
    nextPayload.legacyHouseId = nextPayload.legacyHouseId || legacyId;
    nextPayload.__mnLegacyObjectId = nextPayload.__mnLegacyObjectId || legacyId;
    nextPayload.__mnLegacyHouseId = nextPayload.__mnLegacyHouseId || legacyId;
  }

  return {
    id: stableId,
    city_id: cityId,
    type: 'house',
    category: 'house',
    name: snapshot.name || `Дом · ${nextPayload.houseClass}`,
    icon: snapshot.icon,
    asset: snapshot.asset,
    x: snapshot.x,
    y: snapshot.y,
    rotation: snapshot.rotation,
    scale: snapshot.scale,
    variant: nextPayload.houseClass,
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

  for (const candidate of candidates) {
    const row = await queryMapObjectById(candidate);
    if (row) return row;
  }

  for (const candidate of candidates) {
    const row = await queryMapObjectByPayload(candidate);
    if (row) return row;
  }

  const rowByCoordinates = await queryMapObjectByCoordinates(house);
  if (rowByCoordinates) return rowByCoordinates;

  const persistedRow = await persistLocalHouseMapObject(house);
  if (persistedRow) return persistedRow;

  console.error('[houses] map object not found. lookup candidates:', candidates, 'house:', house);
  return null;
}

async function buyHouseMapObjectClientFallback({ houseId, house, playerId }) {
  const rawHouseId = String(houseId || '').trim();

  if (!rawHouseId || !playerId) throw new Error('HOUSE_ID_INVALID');

  const row = await findHouseMapObject(rawHouseId, house);

  if (!row) throw new Error('HOUSE_NOT_FOUND');

  const mapObjectId = row.id;
  const payload = normalizePayload(row.payload);

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
    owner_name: payload.ownerName || 'Игрок',
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
    console.error('[houses] map object client fallback buy failed:', updateError);
    throw updateError;
  }

  return normalizeBuyResultFromMapObject(updatedRow || { ...row, payload: nextPayload }, playerId);
}

export async function buyHouseFromState({ houseId, house, playerId }) {
  const rawHouseId = String(houseId || '').trim();

  if (!rawHouseId) throw new Error('HOUSE_ID_INVALID');

  try {
    return await buyHouseViaHardRpc({
      houseId: rawHouseId,
      house,
      playerId,
    });
  } catch (rpcError) {
    const message = String(rpcError?.message || rpcError?.details || rpcError?.hint || '');

    // If the SQL migration was not installed yet, the old client fallback still gives a chance.
    if (
      message.includes('buy_house_map_object_any') ||
      message.includes('function') ||
      message.includes('404') ||
      rpcError?.code === 'PGRST202'
    ) {
      return buyHouseMapObjectClientFallback({ houseId: rawHouseId, house, playerId });
    }

    throw rpcError;
  }
}
