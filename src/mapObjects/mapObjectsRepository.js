import { supabase } from '../supabaseClient.js';

const STORAGE_PREFIX = 'mn_map_objects';
const TABLE_NAME = 'map_objects';

function getStorageKey(cityId) {
  return `${STORAGE_PREFIX}_${cityId}`;
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
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeObject(object = {}) {
  const payload = object.payload && typeof object.payload === 'object'
    ? object.payload
    : {};

  const type = String(object.type || 'marker');
  const category = String(object.category || payload.category || type || 'marker');

  return {
    id: String(object.id || createObjectId()),
    cityId: String(object.cityId || object.city_id || ''),
    type,
    category,
    name: String(object.name || payload.name || type || 'Объект'),
    icon: String(object.icon || payload.icon || '◆'),
    asset: String(object.asset || payload.asset || ''),
    x: toNumber(object.x, 50),
    y: toNumber(object.y, 50),
    rotation: toNumber(object.rotation, 0),
    scale: toNumber(object.scale, 1),
    variant: String(object.variant || payload.variant || ''),
    payload,
    createdAt: object.createdAt || object.created_at || new Date().toISOString(),
    updatedAt: object.updatedAt || object.updated_at || new Date().toISOString(),
  };
}

function toDbRow(object) {
  const normalized = normalizeObject(object);

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
    payload: normalized.payload,
    created_at: normalized.createdAt,
    updated_at: normalized.updatedAt,
  };
}

function fromDbRow(row) {
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
      ? list.map((object) => normalizeObject({ ...object, cityId }))
      : [];
  } catch {
    return [];
  }
}

function saveLocalObjects(cityId, objects) {
  const normalized = Array.isArray(objects)
    ? objects.map((object) => normalizeObject({ ...object, cityId }))
    : [];

  try {
    localStorage.setItem(getStorageKey(cityId), JSON.stringify(normalized));
  } catch {
    // ignore
  }

  return normalized;
}

async function fetchRemoteObjects(cityId) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('city_id', cityId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.map(fromDbRow) : [];
}

async function upsertRemoteObjects(objects) {
  const rows = objects.map(toDbRow);

  if (!rows.length) return [];

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(rows, { onConflict: 'id' })
    .select('*');

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.map(fromDbRow) : objects;
}

async function uploadLocalObjectsIfRemoteEmpty(cityId, localObjects, remoteObjects) {
  if (!localObjects.length || remoteObjects.length) return remoteObjects;

  try {
    return await upsertRemoteObjects(
      localObjects.map((object) => ({
        ...object,
        cityId,
        updatedAt: new Date().toISOString(),
      }))
    );
  } catch (error) {
    console.warn('[mapObjectsRepository] local upload failed:', error);
    return remoteObjects;
  }
}

export async function getMapObjects(cityId) {
  const normalizedCityId = String(cityId || '');
  const localObjects = getLocalObjects(normalizedCityId);

  try {
    const remoteObjects = await fetchRemoteObjects(normalizedCityId);

    const finalObjects = await uploadLocalObjectsIfRemoteEmpty(
      normalizedCityId,
      localObjects,
      remoteObjects
    );

    saveLocalObjects(normalizedCityId, finalObjects);

    return finalObjects;
  } catch (error) {
    console.warn('[mapObjectsRepository] remote load failed, using local:', error);
    return localObjects;
  }
}

export async function saveMapObjects(cityId, objects) {
  const normalizedCityId = String(cityId || '');

  const normalized = Array.isArray(objects)
    ? objects.map((object) => normalizeObject({ ...object, cityId: normalizedCityId }))
    : [];

  saveLocalObjects(normalizedCityId, normalized);

  try {
    return await upsertRemoteObjects(normalized);
  } catch (error) {
    console.warn('[mapObjectsRepository] remote save failed, using local only:', error);
    return normalized;
  }
}

export async function addMapObject(cityId, object) {
  const normalizedCityId = String(cityId || '');

  const nextObject = normalizeObject({
    ...object,
    id: object?.id || createObjectId(),
    cityId: normalizedCityId,
    createdAt: object?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const objects = await getMapObjects(normalizedCityId);
  const nextObjects = [...objects, nextObject];

  await saveMapObjects(normalizedCityId, nextObjects);

  return nextObject;
}

export async function updateMapObject(cityId, objectId, patch) {
  const normalizedCityId = String(cityId || '');
  const objects = await getMapObjects(normalizedCityId);

  const nextObjects = objects.map((object) => {
    if (String(object.id) !== String(objectId)) return object;

    return normalizeObject({
      ...object,
      ...patch,
      id: object.id,
      cityId: normalizedCityId,
      updatedAt: new Date().toISOString(),
    });
  });

  await saveMapObjects(normalizedCityId, nextObjects);

  return nextObjects.find((object) => String(object.id) === String(objectId)) || null;
}

export async function deleteMapObject(cityId, objectId) {
  const normalizedCityId = String(cityId || '');

  const objects = await getMapObjects(normalizedCityId);
  const nextObjects = objects.filter((object) => String(object.id) !== String(objectId));

  saveLocalObjects(normalizedCityId, nextObjects);

  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', objectId)
      .eq('city_id', normalizedCityId);

    if (error) throw error;
  } catch (error) {
    console.warn('[mapObjectsRepository] remote delete failed:', error);
  }

  return nextObjects;
}

export async function clearMapObjects(cityId) {
  const normalizedCityId = String(cityId || '');

  saveLocalObjects(normalizedCityId, []);

  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('city_id', normalizedCityId);

    if (error) throw error;
  } catch (error) {
    console.warn('[mapObjectsRepository] remote clear failed:', error);
  }

  return [];
}
