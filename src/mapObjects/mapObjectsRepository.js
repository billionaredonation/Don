import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import { getAuthPlayer } from '../auth/playerAuth.js';

const STORAGE_PREFIX = 'mn_map_objects';
const TABLE_NAME = 'map_objects';
const PENDING_SYNC_FLAG = '__mnPendingRemoteSync';
const PENDING_SYNC_REASON = '__mnPendingRemoteReason';

const CITY_ID_ALIASES = {
  zaporizhia: 'zaporizhzhia',
  zaporizhzhya: 'zaporizhzhia',
  zaporozhye: 'zaporizhzhia',
  zaporozya: 'zaporizhzhia',
  kiev: 'kyiv',
  kiyiv: 'kyiv',
  kiyv: 'kyiv',
  odessa: 'odesa',
  nikolaev: 'mykolaiv',
  rovno: 'rivne',
  chernigov: 'chernihiv',
  krym: 'crimea',
  khmelnitskiy: 'khmelnytskyi',
  zutomyr: 'zhytomyr',
};

const CITY_REVERSE_ALIASES = Object.entries(CITY_ID_ALIASES).reduce((acc, [from, to]) => {
  acc[to] = acc[to] || new Set([to]);
  acc[to].add(from);
  return acc;
}, {});

function normalizeCityId(value) {
  const raw = String(value || '').trim();
  const key = raw.toLowerCase();
  return CITY_ID_ALIASES[key] || raw;
}

function getCityStorageAliases(cityId) {
  const raw = String(cityId || '').trim();
  const normalized = normalizeCityId(raw);
  const aliases = new Set([raw, normalized].filter(Boolean));
  const reverse = CITY_REVERSE_ALIASES[String(normalized).toLowerCase()];

  if (reverse) {
    reverse.forEach((alias) => aliases.add(alias));
  }

  return Array.from(aliases);
}

function readJsonLocalStorage(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getStorageKey(cityId) {
  return `${STORAGE_PREFIX}_${cityId}`;
}

function getTelegramInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

function normalizeTelegramId(value) {
  const text = String(value ?? '').trim();

  // Telegram user ids are numeric. A local player UUID must never be sent to
  // an RPC parameter declared as bigint.
  return /^\d+$/.test(text) ? text : null;
}


function getAdminIdentity(options = {}) {
  const authPlayer = typeof getAuthPlayer === 'function' ? getAuthPlayer() : null;
  const storedGameState = readJsonLocalStorage('mn-game-state', null);
  const storedAuthPlayer = readJsonLocalStorage('mn_auth_player', null);

  const localPlayerId =
    options.adminPlayerId ||
    options.playerId ||
    state.playerId ||
    state.player?.playerId ||
    state.player?.player_id ||
    storedGameState?.playerId ||
    storedGameState?.player?.playerId ||
    storedGameState?.player?.player_id ||
    localStorage.getItem('mn_player_id') ||
    null;

  const telegramId =
    options.adminTgId ||
    options.telegramId ||
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
    state.telegramId ||
    state.tg_id ||
    state.player?.tg_id ||
    state.player?.telegramId ||
    storedGameState?.telegramId ||
    storedGameState?.player?.tg_id ||
    storedGameState?.player?.telegramId ||
    localStorage.getItem('mn_player_tg_id') ||
    localStorage.getItem('mn_tg_id') ||
    null;

  const nickname = String(
    options.adminNickname ||
      options.nickname ||
      state.nickname ||
      state.player?.nickname ||
      state.player?.name ||
      authPlayer?.nickname ||
      storedAuthPlayer?.nickname ||
      storedGameState?.nickname ||
      storedGameState?.player?.nickname ||
      localStorage.getItem('mn_player_nickname') ||
      localStorage.getItem('mn_nickname') ||
      ''
  ).trim();

  const adminTgId =
    normalizeTelegramId(telegramId) ||
    normalizeTelegramId(localPlayerId);

  return {
    adminTgId,
    adminNickname: nickname || null,
    adminPlayerId: localPlayerId ? String(localPlayerId).trim() : null,
  };
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


function isPendingLocalObject(object) {
  return Boolean(
    object?.pendingRemoteSync === true ||
      object?.payload?.[PENDING_SYNC_FLAG] === true
  );
}

function markPendingRemoteSync(object, error) {
  const reason = String(error?.message || error?.details || error || 'remote_sync_failed');

  return normalizeObject({
    ...object,
    pendingRemoteSync: true,
    payload: {
      ...(object?.payload || {}),
      [PENDING_SYNC_FLAG]: true,
      [PENDING_SYNC_REASON]: reason,
    },
    updatedAt: new Date().toISOString(),
  });
}

function clearPendingRemoteSync(object) {
  const payload = {
    ...(object?.payload || {}),
  };

  delete payload[PENDING_SYNC_FLAG];
  delete payload[PENDING_SYNC_REASON];

  return normalizeObject({
    ...object,
    pendingRemoteSync: false,
    payload,
  });
}

function mergeRemoteWithPendingLocal(remoteObjects, pendingLocalObjects) {
  if (!pendingLocalObjects?.length) return remoteObjects;

  const byId = new Map();

  (Array.isArray(remoteObjects) ? remoteObjects : []).forEach((object) => {
    if (object?.id) byId.set(String(object.id), object);
  });

  pendingLocalObjects.forEach((object) => {
    const id = String(object?.id || '');

    if (id && !byId.has(id)) {
      byId.set(id, object);
    }
  });

  return Array.from(byId.values());
}

function toDbRow(object = {}) {
  const normalized = normalizeObject(object);
  const payload = {
    ...(normalized.payload || {}),
    id: normalized.payload?.id || normalized.id,
    objectId: normalized.payload?.objectId || normalized.id,
    mapObjectId: normalized.payload?.mapObjectId || normalized.id,
    type: normalized.type,
    category: normalized.category,
    cityId: normalized.cityId,
    city_id: normalized.cityId,
    icon: normalized.icon,
    asset: normalized.asset,
    x: normalized.x,
    y: normalized.y,
    rotation: normalized.rotation,
    scale: normalized.scale,
    variant: normalized.variant,
  };

  if (normalized.category === 'house' || normalized.type === 'house' || payload.kind === 'house') {
    payload.kind = 'house';
    payload.type = 'house';
    payload.category = 'house';
    payload.houseId = payload.houseId || normalized.id;
    payload.house_id = payload.house_id || payload.houseId || normalized.id;
    payload.buyable = payload.buyable ?? true;
    payload.visible = payload.visible ?? true;
  }

  delete payload[PENDING_SYNC_FLAG];
  delete payload[PENDING_SYNC_REASON];

  return {
    id: normalized.id,
    city_id: normalized.cityId,
    type: normalized.type,
    category: normalized.category,
    name: normalized.name,
    icon: normalized.icon,
    asset: normalized.asset,
    x: normalized.x,
    y: normalized.y,
    rotation: normalized.rotation,
    scale: normalized.scale,
    variant: normalized.variant,
    payload,
    created_at: normalized.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
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

    cityId: normalizeCityId(
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

    pendingRemoteSync: Boolean(
      object.pendingRemoteSync === true ||
        payload[PENDING_SYNC_FLAG] === true
    ),

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
  const aliases = getCityStorageAliases(cityId);
  const byId = new Map();

  for (const alias of aliases) {
    try {
      const raw = localStorage.getItem(getStorageKey(alias));
      const list = safeParse(raw, []);

      if (!Array.isArray(list)) continue;

      list.forEach((object) => {
        const normalized = normalizeObject({
          ...object,
          cityId: normalizeCityId(cityId),
        });

        if (normalized.id) byId.set(String(normalized.id), normalized);
      });
    } catch {
      // ignore broken local cache key
    }
  }

  return Array.from(byId.values());
}

function saveLocalObjects(cityId, objects) {
  const normalizedCityId = normalizeCityId(cityId);
  const normalized = Array.isArray(objects)
    ? objects.map((object) =>
        normalizeObject({
          ...object,
          cityId: normalizedCityId,
        })
      )
    : [];

  try {
    const payload = JSON.stringify(normalized);

    getCityStorageAliases(cityId).forEach((alias) => {
      localStorage.setItem(getStorageKey(alias), payload);
    });
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
  const normalizedCityId = normalizeCityId(cityId);

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
  try {
    const data = await adminMapObjectsRequest({
      action: 'upsert',
      object,
    });

    return data?.object
      ? clearPendingRemoteSync(fromDbRow(data.object))
      : clearPendingRemoteSync(object);
  } catch (edgeError) {
    console.warn('[mapObjectsRepository] edge upsert failed, trying direct table upsert:', edgeError);

    const row = toDbRow(object);
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) throw error;

    return data
      ? clearPendingRemoteSync(fromDbRow(data))
      : clearPendingRemoteSync(object);
  }
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

async function deleteRemoteObject(cityId, objectId, options = {}) {
  const normalizedCityId = normalizeCityId(cityId);
  const normalizedObjectId = String(objectId || '').trim();
  const adminIdentity = getAdminIdentity(options);

  if (!normalizedCityId) {
    throw new Error('map_city_id_missing');
  }

  if (!normalizedObjectId) {
    throw new Error('map_object_id_missing');
  }

  // First use the table operation itself. The old implementation called only
  // an optional RPC. When that RPC was absent/outdated (or had another
  // signature), the admin panel could never delete even though map_objects
  // already allowed the admin client to create and edit rows.
  const { data: deletedRows, error: directError } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('city_id', normalizedCityId)
    .eq('id', normalizedObjectId)
    .select('id');

  if (!directError && Array.isArray(deletedRows) && deletedRows.length > 0) {
    return {
      ok: true,
      deleted: deletedRows.length,
      method: 'direct',
    };
  }

  // RLS may intentionally forbid direct DELETE. Keep the SECURITY DEFINER RPC
  // as a fallback, but never report success until the row is really gone.
  const { data, error } = await supabase.rpc('admin_delete_map_object_v2', {
    p_object_id: normalizedObjectId,
    p_city_id: normalizedCityId,
    p_admin_player_id: adminIdentity.adminPlayerId,
    p_admin_nickname: adminIdentity.adminNickname,
  });

  if (error) {
    console.error('[mapObjectsRepository] delete failed:', {
      cityId: normalizedCityId,
      objectId: normalizedObjectId,
      adminIdentity,
      directError,
      rpcError: error,
    });

    throw new Error(
      error.message ||
      error.details ||
      directError?.message ||
      directError?.details ||
      'ADMIN_DELETE_FAILED'
    );
  }

  if (data?.ok === false) {
    throw new Error(`DB_DELETE_FAILED: осталось ${data?.remaining ?? '?'} строк для объекта ${normalizedObjectId}`);
  }

  return data || { ok: true, method: 'rpc' };
}

async function clearRemoteCity(cityId, options = {}) {
  const normalizedCityId = normalizeCityId(cityId);
  const adminIdentity = getAdminIdentity(options);

  if (!normalizedCityId) {
    throw new Error('map_city_id_missing');
  }

  const { data: deletedRows, error: directError } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('city_id', normalizedCityId)
    .select('id');

  const remainingAfterDirect = await countRemoteObjectsForCity(normalizedCityId);

  if (!directError && remainingAfterDirect === 0) {
    return {
      ok: true,
      deleted: Array.isArray(deletedRows) ? deletedRows.length : 0,
      remaining: 0,
      method: 'direct',
    };
  }

  const { data, error } = await supabase.rpc('admin_clear_map_objects_city_v2', {
    p_city_id: normalizedCityId,
    p_admin_player_id: adminIdentity.adminPlayerId,
    p_admin_nickname: adminIdentity.adminNickname,
  });

  if (error) {
    console.error('[mapObjectsRepository] clear failed:', {
      cityId: normalizedCityId,
      adminIdentity,
      remainingAfterDirect,
      directError,
      rpcError: error,
    });

    throw new Error(
      error.message ||
      error.details ||
      directError?.message ||
      directError?.details ||
      'ADMIN_CLEAR_FAILED'
    );
  }

  if (data?.ok === false) {
    throw new Error(`DB_CLEAR_FAILED: RPC удалил ${data?.deleted ?? 0}, но осталось ${data?.remaining ?? '?'} объектов для города ${normalizedCityId}`);
  }

  return data || { ok: true, method: 'rpc' };
}

function clearLocalObjectsForCity(cityId) {
  try {
    getCityStorageAliases(cityId).forEach((alias) => {
      localStorage.removeItem(getStorageKey(alias));
    });
  } catch {
    // ignore
  }
}


async function countRemoteObjectsForCity(cityId) {
  const normalizedCityId = normalizeCityId(cityId);

  const { count, error } = await supabase
    .from(TABLE_NAME)
    .select('id', { count: 'exact', head: true })
    .eq('city_id', normalizedCityId);

  if (error) {
    console.warn('[mapObjectsRepository] remote count failed:', {
      cityId: normalizedCityId,
      error,
    });

    return null;
  }

  return Number(count || 0);
}

async function objectExistsRemote(cityId, objectId) {
  const normalizedCityId = normalizeCityId(cityId);
  const normalizedObjectId = String(objectId || '').trim();

  if (!normalizedObjectId) return false;

  const { count, error } = await supabase
    .from(TABLE_NAME)
    .select('id', { count: 'exact', head: true })
    .eq('city_id', normalizedCityId)
    .eq('id', normalizedObjectId);

  if (error) {
    console.warn('[mapObjectsRepository] remote object exists check failed:', {
      cityId: normalizedCityId,
      objectId: normalizedObjectId,
      error,
    });

    return true;
  }

  return Number(count || 0) > 0;
}

export async function getMapObjects(cityId, options = {}) {
  const normalizedCityId = normalizeCityId(cityId);
  const range = normalizeRangeOptions(options);

  const localObjects = filterObjectsByRange(
    getLocalObjects(normalizedCityId),
    range
  );

  const pendingLocalObjects = filterObjectsByRange(
    localObjects.filter(isPendingLocalObject),
    range
  );

  try {
    const remoteObjects = await fetchRemoteObjects(normalizedCityId, options);
    const mergedObjects = mergeRemoteWithPendingLocal(
      remoteObjects,
      pendingLocalObjects
    );

    if (range) {
      mergeLocalObjects(normalizedCityId, mergedObjects);
    } else {
      saveLocalObjects(normalizedCityId, mergedObjects);
    }

    return mergedObjects;
  } catch (error) {
    console.warn(
      '[mapObjectsRepository] remote load failed, using local cache:',
      error
    );

    return localObjects;
  }
}

export async function saveMapObjects(cityId, objects) {
  const normalizedCityId = normalizeCityId(cityId);

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

    const pendingObjects = normalized.map((object) =>
      markPendingRemoteSync(object, error)
    );

    saveLocalObjects(normalizedCityId, pendingObjects);

    return pendingObjects;
  }
}

export async function addMapObject(cityId, object) {
  const normalizedCityId = normalizeCityId(cityId);

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

    const pendingObject = markPendingRemoteSync(nextObject, error);
    const pendingObjects = nextObjects.map((item) =>
      String(item.id) === String(pendingObject.id)
        ? pendingObject
        : item
    );

    saveLocalObjects(normalizedCityId, pendingObjects);

    return pendingObject;
  }
}

export async function updateMapObject(cityId, objectId, patch) {
  const normalizedCityId = normalizeCityId(cityId);

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

    if (updatedObject) {
      const pendingObject = markPendingRemoteSync(updatedObject, error);
      const pendingObjects = nextObjects.map((item) =>
        String(item.id) === String(pendingObject.id)
          ? pendingObject
          : item
      );

      saveLocalObjects(normalizedCityId, pendingObjects);

      return pendingObject;
    }
  }

  return updatedObject;
}

export async function deleteMapObject(cityId, objectId, options = {}) {
  const normalizedCityId = normalizeCityId(cityId);

  if (!objectId) {
    throw new Error('map_object_id_missing');
  }

  const result = await deleteRemoteObject(normalizedCityId, objectId, options);
  const objectStillExists = await objectExistsRemote(
    normalizedCityId,
    objectId
  );

  if (objectStillExists) {
    throw new Error(`DB_DELETE_FAILED: объект ${objectId} остался в map_objects`);
  }

  const objects = getLocalObjects(normalizedCityId);

  const nextObjects = objects.filter(
    (object) => String(object.id) !== String(objectId)
  );

  saveLocalObjects(normalizedCityId, nextObjects);

  window.dispatchEvent(new CustomEvent('mn:map-objects-admin-deleted', {
    detail: {
      cityId: normalizedCityId,
      objectId: String(objectId),
      result,
    },
  }));

  return nextObjects;
}

export async function clearMapObjects(cityId, options = {}) {
  const normalizedCityId = normalizeCityId(cityId);

  if (!normalizedCityId) {
    throw new Error('map_city_id_missing');
  }

  const result = await clearRemoteCity(normalizedCityId, options);

  clearLocalObjectsForCity(normalizedCityId);
  saveLocalObjects(normalizedCityId, []);

  window.dispatchEvent(new CustomEvent('mn:map-objects-admin-cleared', {
    detail: {
      cityId: normalizedCityId,
      result,
    },
  }));

  const remoteCountAfterClear = await countRemoteObjectsForCity(normalizedCityId);

  if (remoteCountAfterClear !== null && remoteCountAfterClear > 0) {
    throw new Error(`DB_CLEAR_FAILED: после RPC осталось ${remoteCountAfterClear} объектов для города ${normalizedCityId}`);
  }

  return [];
}

