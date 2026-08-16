import { supabase } from '../supabaseClient.js';
import { getBusinessLegalPayload } from './businessConfig.js';

function normalizePayload(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '{}')) || {}; } catch { return {}; }
}

function escapePostgrestFilterValue(value) {
  return String(value ?? '').trim().replace(/"/g, '\\"').replace(/,/g, '\\,').replace(/\)/g, '\\)');
}

export function isBusinessObject(object) {
  const payload = normalizePayload(object?.payload);
  return object?.category === 'business'
    || payload.category === 'business'
    || payload.kind === 'business';
}

export function getBusinessOwnerId(object) {
  const payload = normalizePayload(object?.payload);
  return object?.owner_id || object?.ownerId || payload.ownerId || payload.owner_id || null;
}

export function normalizeBusinessForUi(object = {}) {
  const payload = normalizePayload(object.payload);
  const legalPayload = getBusinessLegalPayload({
    ...payload,
    legalForm: object.legalForm || object.legal_form || payload.legalForm || payload.legal_form,
    legalFormLabel: object.legalFormLabel || object.legal_form_label || payload.legalFormLabel || payload.legal_form_label,
    taxGroup: object.taxGroup ?? object.tax_group ?? payload.taxGroup ?? payload.tax_group,
  });
  const id = String(object.id || payload.mapObjectId || payload.objectId || '').trim();
  const ownerId = getBusinessOwnerId(object);
  const cityId = String(object.city_id || object.cityId || payload.cityId || payload.city_id || '').trim();
  return {
    ...object,
    id,
    mapObjectId: id,
    cityId,
    ownerId,
    ownerName: object.ownerName || object.owner_name || payload.ownerName || payload.owner_name || null,
    price: Number(object.price ?? payload.price ?? 0) || 0,
    businessType: String(payload.businessType || payload.business_type || object.type || 'shop'),
    ...legalPayload,
    payload: {
      ...payload,
      ...legalPayload,
      mapObjectId: id,
      objectId: id,
      cityId,
      city_id: cityId,
      kind: 'business',
      category: 'business',
      ownerId,
      owner_id: ownerId,
      owned: Boolean(ownerId),
    },
  };
}

export async function fetchPlayerOwnedBusinesses({ playerId, cityId = null } = {}) {
  const rawPlayerId = String(playerId || '').trim();
  if (!rawPlayerId) return [];

  try {
    const safePlayerId = escapePostgrestFilterValue(rawPlayerId);
    let query = supabase
      .from('map_objects')
      .select('*')
      .or(`payload->>ownerId.eq.${safePlayerId},payload->>owner_id.eq.${safePlayerId}`)
      .limit(50);
    if (cityId) query = query.eq('city_id', String(cityId));
    const { data, error } = await query;
    if (error) throw error;
    return (Array.isArray(data) ? data : [])
      .filter(isBusinessObject)
      .map(normalizeBusinessForUi)
      .filter((business) => String(business.ownerId || '') === rawPlayerId);
  } catch (error) {
    console.warn('[business] owned businesses load failed:', error);
    return [];
  }
}

export function applyBusinessOwner(object, owner = {}) {
  if (!object) return object;
  const ownerId = owner.ownerId ?? owner.ownerTgId ?? null;
  const ownerName = owner.ownerName ?? null;
  object.ownerId = ownerId;
  object.owner_id = ownerId;
  object.ownerName = ownerName;
  object.payload = {
    ...(normalizePayload(object.payload)),
    ownerId,
    owner_id: ownerId,
    ownerName,
    owner_name: ownerName,
    owned: Boolean(ownerId),
  };
  return object;
}
