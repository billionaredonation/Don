const STORAGE_PREFIX = 'mn_map_objects';

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

function normalizeObject(object) {
  return {
    id: String(object.id),
    cityId: String(object.cityId),
    type: String(object.type || 'marker'),
    category: String(object.category || 'marker'),
    name: String(object.name || object.type || 'Объект'),
    icon: String(object.icon || '◆'),
    asset: String(object.asset || ''),
    x: Number(object.x || 50),
    y: Number(object.y || 50),
    rotation: Number(object.rotation || 0),
    scale: Number(object.scale || 1),
    payload: object.payload && typeof object.payload === 'object' ? object.payload : {},
    createdAt: object.createdAt || new Date().toISOString(),
    updatedAt: object.updatedAt || new Date().toISOString(),
  };
}

export async function getMapObjects(cityId) {
  try {
    const raw = localStorage.getItem(getStorageKey(cityId));
    const list = safeParse(raw, []);

    return Array.isArray(list) ? list.map(normalizeObject) : [];
  } catch {
    return [];
  }
}

export async function saveMapObjects(cityId, objects) {
  const normalized = Array.isArray(objects) ? objects.map(normalizeObject) : [];

  try {
    localStorage.setItem(getStorageKey(cityId), JSON.stringify(normalized));
  } catch {
    // ignore
  }

  return normalized;
}

export async function addMapObject(cityId, object) {
  const objects = await getMapObjects(cityId);
  const nextObject = normalizeObject({
    ...object,
    cityId,
    updatedAt: new Date().toISOString(),
  });

  const nextObjects = [...objects, nextObject];

  await saveMapObjects(cityId, nextObjects);

  return nextObject;
}

export async function updateMapObject(cityId, objectId, patch) {
  const objects = await getMapObjects(cityId);

  const nextObjects = objects.map((object) => {
    if (object.id !== objectId) return object;

    return normalizeObject({
      ...object,
      ...patch,
      id: object.id,
      cityId,
      updatedAt: new Date().toISOString(),
    });
  });

  await saveMapObjects(cityId, nextObjects);

  return nextObjects.find((object) => object.id === objectId) || null;
}

export async function deleteMapObject(cityId, objectId) {
  const objects = await getMapObjects(cityId);
  const nextObjects = objects.filter((object) => object.id !== objectId);

  await saveMapObjects(cityId, nextObjects);

  return nextObjects;
}

export async function clearMapObjects(cityId) {
  await saveMapObjects(cityId, []);
  return [];
}
