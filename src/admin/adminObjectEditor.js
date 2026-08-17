import { getHouseClass, getMapObjectType } from '../mapObjects/mapObjectTypes.js';
import { updateMapObject } from '../mapObjects/mapObjectsRepository.js';
import { getBusinessLegalPayload } from '../business/businessConfig.js';

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
    const sourcePayload = { ...(object.payload || {}), ...(patch.payload || {}) };
    const currentName = String(name || object.name || '').trim();
    const currentPrice = Number(sourcePayload.price ?? object.price ?? 0);
    const ownerId = sourcePayload.ownerId || sourcePayload.owner_id || object.ownerId || object.owner_id || null;
    const ownerName = sourcePayload.ownerName || sourcePayload.owner_name || object.ownerName || object.owner_name || null;
    const legalPayload = getBusinessLegalPayload(sourcePayload);

    nextPatch.icon = config.icon;
    nextPatch.asset = config.defaultAsset;
    nextPatch.scale = object.scale || config.defaultScale;
    nextPatch.name = currentName || config.label;
    nextPatch.variant = '';
    nextPatch.payload = {
      ...sourcePayload,
      ...legalPayload,
      kind: 'business',
      type: selectedType,
      category: 'business',
      businessType: selectedType,
      businessLabel: config.label,
      id: String(object.id),
      objectId: String(object.id),
      mapObjectId: String(object.id),
      cityId: String(cityId),
      city_id: String(cityId),
      ownerId,
      owner_id: ownerId,
      ownerName,
      owner_name: ownerName,
      owned: Boolean(ownerId),
      incomePerHour: sourcePayload.incomePerHour || 0,
      price: Number.isFinite(currentPrice) && currentPrice > 0
        ? Math.round(currentPrice)
        : Math.max(0, Math.round(Number(config.defaultPrice) || 0)),
      buyable: true,
      locked: Boolean(sourcePayload.locked),
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
      ...(patch.payload || {}),
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

    if (selectedType === 'farm_station') {
      const ownerId = nextPatch.payload.ownerId || nextPatch.payload.owner_id || null;
      const ownerName = nextPatch.payload.ownerName || nextPatch.payload.owner_name || null;
      Object.assign(nextPatch.payload, {
        farmBusiness: true,
        farmBusinessId: String(object.id),
        farm_business_id: String(object.id),
        legalForm: 'ooo',
        legalFormLabel: 'ООО',
        price: 1_000_000,
        buyable: true,
        transferable: true,
        serverOwned: false,
        ownerId,
        owner_id: ownerId,
        ownerName,
        owner_name: ownerName,
        owned: Boolean(ownerId),
      });
    }

    if (selectedType === 'farm_water_tower') {
      nextPatch.payload.towerCapacityLiters = 500;
      nextPatch.payload.tower_capacity_liters = 500;
    }

    if (selectedType === 'farm_water_barrel') {
      nextPatch.payload.infiniteWater = true;
      nextPatch.payload.infinite_water = true;
      nextPatch.payload.bucketFillLiters = 10;
      nextPatch.payload.bucket_fill_liters = 10;
    }
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

