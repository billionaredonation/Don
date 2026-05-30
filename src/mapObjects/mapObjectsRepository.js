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

function normalizeObject(object) {
  return {
    id: String(object.id || createObjectId()),
    cityId: String(object.cityId || object.city_id || ''),
    type: String(object.type || 'marker'),
    category: String(object.category || 'marker'),
    name: String(object.name || object.type || 'Объект'),
    icon: String(object.icon || '◆'),
    asset: String(object.asset || ''),
    x: Number(object.x || 50),
    y: Number(object.y || 50),
    rotation: Number(object.rotation || 0),
    scale: Number(object.scale || 1),
    variant: String(object.variant || ''),
    payload: object.payload && typeof object.payload === 'object' ? object.payload : {},
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

async function uploadLocalObjectsIfNeeded(cityId, localObjects, remoteObjects) {
  if (!localObjects.length || remoteObjects.length) return remoteObjects;

  try {
    const rows = localObjects.map((object) => toDbRow({
      ...object,
      cityId,
      updatedAt: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .upsert(rows, { onConflict: 'id' })
      .select('*');

    if (error) {
      console.warn('[mapObjectsRepository] local upload failed:', error);
      return remoteObjects;
    }

    return Array.isArray(data) ? data.map(fromDbRow) : localObjects;
  } catch (error) {
    console.warn('[mapObjectsRepository] local upload crashed:', error);
    return remoteObjects;
  }
}

export async function getMapObjects(cityId) {
  const localObjects = getLocalObjects(cityId);

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('city_id', cityId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[mapObjectsRepository] remote load failed:', error);
      return localObjects;
    }

    const remoteObjects = Array.isArray(data) ? data.map(fromDbRow) : [];

    const finalObjects = await uploadLocalObjectsIfNeeded(
      cityId,
      localObjects,
      remoteObjects
    );

    saveLocalObjects(cityId, finalObjects);

    return finalObjects;
  } catch (error) {
    console.warn('[mapObjectsRepository] remote load crashed:', error);
    return localObjects;
  }
}

export async function saveMapObjects(cityId, objects) {
  const normalized = Array.isArray(objects)
    ? objects.map((object) => normalizeObject({ ...object, cityId }))
    : [];

  saveLocalObjects(cityId, normalized);

  try {
    const rows = normalized.map(toDbRow);

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .upsert(rows, { onConflict: 'id' })
      .select('*');

    if (error) {
      console.warn('[mapObjectsRepository] remote save failed:', error);
      return normalized;
    }

    return Array.isArray(data) ? data.map(fromDbRow) : normalized;
  } catch (error) {
    console.warn('[mapObjectsRepository] remote save crashed:', error);
    return normalized;
  }
}

export async function addMapObject(cityId, object) {
  const nextObject = normalizeObject({
    ...object,
    id: object.id || createObjectId(),
    cityId,
    createdAt: object.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const objects = await getMapObjects(cityId);
  const nextObjects = [...objects, nextObject];

  await saveMapObjects(cityId, nextObjects);

  return nextObject;
}

export async function updateMapObject(cityId, objectId, patch) {
  const objects = await getMapObjects(cityId);

  const nextObjects = objects.map((object) => {
    if (String(object.id) !== String(objectId)) return object;

    return normalizeObject({
      ...object,
      ...patch,
      id: object.id,
      cityId,
      updatedAt: new Date().toISOString(),
    });
  });

  await saveMapObjects(cityId, nextObjects);

  return nextObjects.find((object) => String(object.id) === String(objectId)) || null;
}

export async function deleteMapObject(cityId, objectId) {
  const objects = await getMapObjects(cityId);
  const nextObjects = objects.filter((object) => String(object.id) !== String(objectId));

  saveLocalObjects(cityId, nextObjects);

  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', objectId)
      .eq('city_id', cityId);

    if (error) {
      console.warn('[mapObjectsRepository] remote delete failed:', error);
    }
  } catch (error) {
    console.warn('[mapObjectsRepository] remote delete crashed:', error);
  }

  return nextObjects;
}

export async function clearMapObjects(cityId) {
  saveLocalObjects(cityId, []);

  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('city_id', cityId);

    if (error) {
      console.warn('[mapObjectsRepository] remote clear failed:', error);
    }
  } catch (error) {
    console.warn('[mapObjectsRepository] remote clear crashed:', error);
  }

  return [];
}
