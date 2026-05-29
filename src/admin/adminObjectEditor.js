import {
  getMapObjectType,
} from '../mapObjects/mapObjectTypes.js';

import {
  updateMapObject,
} from '../mapObjects/mapObjectsRepository.js';

export async function saveAdminObject({
  cityId,
  object,
  selectedType,
  selectedVariant,
  name,
  patch = {},
}) {
  if (!cityId || !object) return null;

  const config = getMapObjectType(selectedType);

  const nextPatch = {
    ...patch,
    name: name || object.name,
    type: selectedType,
    category: config.category,
    variant: selectedType === 'house' ? selectedVariant : '',
    updatedAt: new Date().toISOString(),
  };

  if (selectedType === 'house') {
    nextPatch.payload = {
      ...(object.payload || {}),
      kind: 'house',
      houseClass: selectedVariant,
      buyable: true,
      ownerId: object.payload?.ownerId || null,
      price: object.payload?.price || 0,
      locked: object.payload?.locked || false,
    };
  }

  if (config.category === 'business') {
    nextPatch.payload = {
      ...(object.payload || {}),
      kind: 'business',
      businessType: selectedType,
      businessLabel: config.label,
      ownerId: object.payload?.ownerId || null,
      incomePerHour: object.payload?.incomePerHour || 0,
      price: object.payload?.price || 0,
      buyable: true,
    };
  }

  if (config.category === 'decor') {
    nextPatch.payload = {
      ...(object.payload || {}),
      kind: 'decor',
      collision: object.payload?.collision || false,
    };
  }

  if (config.category === 'npc') {
    nextPatch.payload = {
      ...(object.payload || {}),
      kind: 'npc',
      role: object.payload?.role || '',
      dialogLabel: object.payload?.dialogLabel || '',
    };
  }

  if (config.category === 'marker') {
    nextPatch.payload = {
      ...(object.payload || {}),
      kind: 'marker',
    };
  }

  await updateMapObject(cityId, object.id, nextPatch);

  return nextPatch;
}
