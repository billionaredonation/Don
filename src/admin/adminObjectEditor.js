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

  if (config.category === 'service') {
    const currentName = String(name || object.name || '').trim();

    nextPatch.icon = config.icon;
    nextPatch.asset = config.defaultAsset;
    nextPatch.scale = object.scale || config.defaultScale;
    nextPatch.name = currentName || config.label;
    nextPatch.variant = '';
    nextPatch.payload = {
      ...(object.payload || {}),
      kind: 'service',
      type: selectedType,
      category: 'service',
      serviceType: selectedType,
      serviceLabel: config.label,
      id: String(object.id),
      objectId: String(object.id),
      mapObjectId: String(object.id),
      serviceId: String(object.id),
      service_id: String(object.id),
      buyable: false,
      transferable: false,
      serverOwned: true,
      publicAccess: true,
      interiorTemplate: selectedType === 'hospital' ? 'hospital' : object.payload?.interiorTemplate,
      locked: object.payload?.locked || false,
      ownerId: null,
      owner_id: null,
      ownerName: null,
      owner_name: null,
      owned: false,
      price: 0,
      rentPerHour: 0,
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

  if (config.category === 'job') {
    nextPatch.icon = config.icon;
    nextPatch.asset = config.defaultAsset;
    nextPatch.scale = object.scale || config.defaultScale;
    nextPatch.payload = {
      ...(object.payload || {}),
      kind: 'job',
      type: selectedType,
      category: 'job',
      jobType: selectedType,
      jobLabel: config.label,
      publicAccess: true,
      buyable: false,
      transferable: false,
      serverOwned: true,
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
