import { supabase } from '../supabaseClient.js';

const STORAGE_PREFIX = 'mn_map_objects';
const TABLE_NAME = 'map_objects';

function getStorageKey(cityId) {
  return `${STORAGE_PREFIX}_${cityId}`;
}

function getTelegramInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

function safeParse(value, fallback) {
  try {
    return JSON.parse(value) || fallback;
  } catch {
    return fallback;
  }
}

function createObjectId() {
  if (crypto?.randomUUID) return crypto.randomUUID();

  return `obj_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}


function clampPercent(value, fallback = 50) {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  return Math.min(100, Math.max(0, number));
}

function normalizeRangeOptions(options = {}) {
  const centerX = Number(options.centerX);
  const centerY = Number(options.centerY);
  const radius = Number(options.radiusPercent ?? options.radius);

  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    radius >= 100
  ) {
    return null;
  }

  const safeX = clampPercent(centerX);
  const safeY = clampPercent(centerY);
  const safeRadius = Math.min(100, Math.max(1, radius));

  return {
    centerX: safeX,
    centerY: safeY,
    radius: safeRadius,
    minX: Math.max(0, safeX - safeRadius),
    maxX: Math.min(100, safeX + safeRadius),
    minY: Math.max(0, safeY - safeRadius),
    maxY: Math.min(100, safeY + safeRadius),
  };
}

function isObjectInsideRange(object, range) {
  if (!range || !object) return true;

  const x = Number(object.x);
  const y = Number(object.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return true;

  return (
    x >= range.minX &&
    x <= range.maxX &&
    y >= range.minY &&
    y <= range.maxY
  );
}

function filterObjectsByRange(objects, range) {
  if (!range) return objects;

  return Array.isArray(objects)
    ? objects.filter((object) => isObjectInsideRange(object, range))
    : [];
}

function mergeLocalObjects(cityId, nextObjects) {
  const currentObjects = getLocalObjects(cityId);
  const byId = new Map();

  currentObjects.forEach((object) => {
    if (object?.id) byId.set(String(object.id), object);
  });

  (Array.isArray(nextObjects) ? nextObjects : []).forEach((object) => {
    if (object?.id) byId.set(String(object.id), object);
  });

  return saveLocalObjects(cityId, Array.from(byId.values()));
}

function normalizePayload(value) {
  if (!value) return {};

  if (typeof value === 'object') return value;

  if (typeof value === 'string') {
    return safeParse(value, {});
  }

  return {};
}

function normalizeObject(object = {}) {
  const payload = normalizePayload(object.payload);

  const type = String(
    object.type ||
      payload.type ||
      'marker'
  );

  const category = String(
    object.category ||
      payload.category ||
      type ||
      'marker'
  );

  return {
    id: String(object.id || createObjectId()),

    cityId: String(
      object.cityId ||
        object.city_id ||
        payload.cityId ||
        payload.city_id ||
        ''
    ),

    type,
    category,

    name: String(
      object.name ||
        payload.name ||
        type ||
        'Объект'
    ),

    icon: String(
      object.icon ||
        payload.icon ||
        '◆'
    ),

    asset: String(
      object.asset ||
        payload.asset ||
        ''
    ),

    x: toNumber(object.x ?? payload.x, 50),
    y: toNumber(object.y ?? payload.y, 50),

    rotation: toNumber(
      object.rotation ?? payload.rotation,
      0
    ),

    scale: toNumber(
      object.scale ?? payload.scale,
      1
    ),

    variant: String(
      object.variant ||
        payload.variant ||
        payload.houseClass ||
        payload.houseClassLabel ||
        ''
    ),

    price:
      object.price ??
      payload.price ??
      0,

    owner_id:
      object.owner_id ??
      object.ownerId ??
      payload.owner_id ??
      payload.ownerId ??
      null,

    ownerName:
      object.ownerName ??
      object.owner_name ??
      payload.ownerName ??
      payload.owner_name ??
      null,

    payload,

    createdAt:
      object.createdAt ||
      object.created_at ||
      new Date().toISOString(),

    updatedAt:
      object.updatedAt ||
      object.updated_at ||
      new Date().toISOString(),
  };
}

function fromDbRow(row = {}) {
  return normalizeObject({
    id: row.id,
    cityId: row.city_id,
    type: row.type,
    category: row.category,
    name: row.name,
    icon: row.icon,
    asset: row.asset,
    x: row.x,
    y: row.y,
    rotation: row.rotation,
    scale: row.scale,
    variant: row.variant,
    payload: row.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function getLocalObjects(cityId) {
  try {
    const raw = localStorage.getItem(getStorageKey(cityId));
    const list = safeParse(raw, []);

    return Array.isArray(list)
      ? list.map((object) =>
          normalizeObject({
            ...object,
            cityId,
          })
        )
      : [];
  } catch {
    return [];
  }
}

function saveLocalObjects(cityId, objects) {
  const normalized = Array.isArray(objects)
    ? objects.map((object) =>
        normalizeObject({
          ...object,
          cityId,
        })
      )
    : [];

  try {
    localStorage.setItem(
      getStorageKey(cityId),
      JSON.stringify(normalized)
    );
  } catch {}

  return normalized;
}

function notifyObjectsLoaded(cityId, count) {
  window.dispatchEvent(
    new CustomEvent('mn:map-objects-loaded', {
      detail: {
        cityId,
        count,
      },
    })
  );
}

async function adminMapObjectsRequest(payload) {
  const initData = getTelegramInitData();

  if (!initData) {
    throw new Error('missing_telegram_init_data');
  }

  const { data, error } = await supabase.functions.invoke(
    'admin-map-objects',
    {
      body: {
        initData,
        ...payload,
      },
    }
  );

  if (error) throw error;

  if (!data?.ok) {
    throw new Error(data?.reason || 'admin_map_objects_failed');
  }

  return data;
}

async function fetchRemoteObjects(cityId, options = {}) {
  const normalizedCityId = String(cityId || '').trim();

  if (!normalizedCityId) {
    console.warn('[mapObjectsRepository] fetch skipped: cityId missing');
    return [];
  }

  const range = normalizeRangeOptions(options);

  let query = supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('city_id', normalizedCityId);

  if (range) {
    query = query
      .gte('x', range.minX)
      .lte('x', range.maxX)
      .gte('y', range.minY)
      .lte('y', range.maxY);
  }

  const { data, error } = await query
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[mapObjectsRepository] public load failed:', {
      cityId: normalizedCityId,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    throw error;
  }

  const objects = Array.isArray(data)
    ? data.map(fromDbRow)
    : [];

  console.log(
    `[mapObjectsRepository] loaded ${objects.length} objects for city:`,
    normalizedCityId
  );

  notifyObjectsLoaded(normalizedCityId, objects.length);

  return objects;
}

async function saveRemoteObject(object) {
  const data = await adminMapObjectsRequest({
    action: 'upsert',
    object,
  });

  return data?.object
    ? fromDbRow(data.object)
    : normalizeObject(object);
}

async function syncHouseMapObject(object) {
  if (object?.category !== 'house') return object;

  try {
    const { data, error } = await supabase.rpc(
      'sync_house_map_object',
      {
        p_map_object_id: String(object.id),
      }
    );

    if (error) throw error;

    const syncedPayload = {
      ...(object.payload || {}),

      houseId:
        data?.houseId ||
        object.payload?.houseId ||
        null,

      ownerId:
        data?.ownerId ||
        object.payload?.ownerId ||
        null,

      ownerName:
        data?.ownerName ||
        object.payload?.ownerName ||
        null,

      owned: Boolean(
        data?.ownerId ||
          object.payload?.ownerId
      ),
    };

    if (data?.price !== undefined) {
      syncedPayload.price = data.price;
    }

    if (data?.houseClass) {
      syncedPayload.houseClass = data.houseClass;
    }

    return normalizeObject({
      ...object,
      payload: syncedPayload,
    });
  } catch (error) {
    console.warn('[mapObjectsRepository] house sync failed:', error);
    return object;
  }
}

async function deleteRemoteObject(cityId, objectId) {
  return adminMapObjectsRequest({
    action: 'delete',
    cityId,
    objectId,
  });
}

async function clearRemoteCity(cityId) {
  return adminMapObjectsRequest({
    action: 'clear_city',
    cityId,
  });
}

export async function getMapObjects(cityId, options = {}) {
  const normalizedCityId = String(cityId || '').trim();
  const range = normalizeRangeOptions(options);

  const localObjects = filterObjectsByRange(
    getLocalObjects(normalizedCityId),
    range
  );

  try {
    const remoteObjects = await fetchRemoteObjects(normalizedCityId, options);

    if (range) {
      mergeLocalObjects(normalizedCityId, remoteObjects);
    } else {
      saveLocalObjects(normalizedCityId, remoteObjects);
    }

    return remoteObjects;
  } catch (error) {
    console.warn(
      '[mapObjectsRepository] remote load failed, using local cache:',
      error
    );

    return localObjects;
  }
}

export async function saveMapObjects(cityId, objects) {
  const normalizedCityId = String(cityId || '').trim();

  const normalized = Array.isArray(objects)
    ? objects.map((object) =>
        normalizeObject({
          ...object,
          cityId: normalizedCityId,
        })
      )
    : [];

  saveLocalObjects(normalizedCityId, normalized);

  try {
    const savedObjects = [];

    for (const object of normalized) {
      const savedObjectRaw = await saveRemoteObject(object);
      const savedObject = await syncHouseMapObject(savedObjectRaw);

      savedObjects.push(savedObject);
    }

    saveLocalObjects(normalizedCityId, savedObjects);

    return savedObjects;
  } catch (error) {
    console.warn('[mapObjectsRepository] admin remote save failed:', error);
    return normalized;
  }
}

export async function addMapObject(cityId, object) {
  const normalizedCityId = String(cityId || '').trim();

  const nextObject = normalizeObject({
    ...object,
    id: object?.id || createObjectId(),
    cityId: normalizedCityId,
    createdAt: object?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const objects = await getMapObjects(normalizedCityId);

  const nextObjects = [
    ...objects,
    nextObject,
  ];

  saveLocalObjects(normalizedCityId, nextObjects);

  try {
    const savedObjectRaw = await saveRemoteObject(nextObject);
    const savedObject = await syncHouseMapObject(savedObjectRaw);

    const syncedObjects = nextObjects.map((item) =>
      String(item.id) === String(savedObject.id)
        ? savedObject
        : item
    );

    saveLocalObjects(normalizedCityId, syncedObjects);

    return savedObject;
  } catch (error) {
    console.warn('[mapObjectsRepository] admin add failed:', error);
    return nextObject;
  }
}

export async function updateMapObject(cityId, objectId, patch) {
  const normalizedCityId = String(cityId || '').trim();

  const objects = await getMapObjects(normalizedCityId);

  const nextObjects = objects.map((object) =>
    String(object.id) === String(objectId)
      ? normalizeObject({
          ...object,
          ...patch,
          id: object.id,
          cityId: normalizedCityId,
          payload: {
            ...(object.payload || {}),
            ...(patch?.payload || {}),
          },
          updatedAt: new Date().toISOString(),
        })
      : object
  );

  saveLocalObjects(normalizedCityId, nextObjects);

  const updatedObject =
    nextObjects.find((object) => String(object.id) === String(objectId)) ||
    null;

  try {
    if (updatedObject) {
      const savedObjectRaw = await saveRemoteObject(updatedObject);
      const savedObject = await syncHouseMapObject(savedObjectRaw);

      const syncedObjects = nextObjects.map((item) =>
        String(item.id) === String(savedObject.id)
          ? savedObject
          : item
      );

      saveLocalObjects(normalizedCityId, syncedObjects);

      return savedObject;
    }
  } catch (error) {
    console.warn('[mapObjectsRepository] admin update failed:', error);
  }

  return updatedObject;
}

export async function deleteMapObject(cityId, objectId) {
  const normalizedCityId = String(cityId || '').trim();

  const objects = await getMapObjects(normalizedCityId);

  const nextObjects = objects.filter(
    (object) => String(object.id) !== String(objectId)
  );

  saveLocalObjects(normalizedCityId, nextObjects);

  try {
    await deleteRemoteObject(normalizedCityId, objectId);
  } catch (error) {
    console.warn('[mapObjectsRepository] admin delete failed:', error);
  }

  return nextObjects;
}

export async function clearMapObjects(cityId) {
  const normalizedCityId = String(cityId || '').trim();

  saveLocalObjects(normalizedCityId, []);

  try {
    await clearRemoteCity(normalizedCityId);
  } catch (error) {
    console.warn('[mapObjectsRepository] admin clear failed:', error);
  }

  return [];
}
