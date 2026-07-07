import { getHouseClass, getMapObjectType } from '../mapObjects/mapObjectTypes.js';
import { updateMapObject } from '../mapObjects/mapObjectsRepository.js';

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
    const houseClass = getHouseClass(selectedVariant || object.variant || 'standard');

    const currentName = String(name || object.name || '').trim();
    const hasCustomName = currentName && !/^Дом\s*·/i.test(currentName);

    nextPatch.icon = houseClass.icon;
    nextPatch.asset = houseClass.asset;
    nextPatch.scale = houseClass.scale;
    nextPatch.name = hasCustomName ? currentName : `Дом · ${houseClass.label}`;
    nextPatch.variant = houseClass.value;
    nextPatch.payload = {
      ...(object.payload || {}),
      kind: 'house',
      type: 'house',
      category: 'house',
      houseClass: houseClass.value,
      houseClassLabel: houseClass.label,
      id: String(object.id),
      mapObjectId: String(object.id),
      houseId: String(object.id),
      houseClassShortLabel: houseClass.shortLabel,
      visualClass: houseClass.visualClass,
      statusText: houseClass.statusText,
      buyable: true,
      visible: true,
      ownerId: object.payload?.ownerId || null,
      ownerName: object.payload?.ownerName || null,
      owned: Boolean(object.payload?.ownerId),
      price: object.payload?.price || houseClass.price,
      rentPerHour: object.payload?.rentPerHour || houseClass.rentPerHour,
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
