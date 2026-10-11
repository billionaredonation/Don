import { ownerOf, businessInfo, isDirectoryBusiness } from './businessDirectoryModel.js';
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
  return ownerOf(object);
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
  const publicBusinessId = String(object.publicBusinessId || object.public_business_id || payload.publicBusinessId || payload.public_business_id || '').trim();
  return {
    ...object,
    id,
    mapObjectId: id,
    cityId,
    publicBusinessId,
    public_business_id: publicBusinessId,
    ownerId,
    ownerName: object.ownerName || object.owner_name || payload.ownerName || payload.owner_name || null,
    price: Number(object.price ?? payload.price ?? 0) || 0,
    businessType: businessInfo(object).type,
    ...legalPayload,
    payload: {
      ...payload,
      ...legalPayload,
      mapObjectId: id,
      objectId: id,
      cityId,
      city_id: cityId,
      publicBusinessId,
      public_business_id: publicBusinessId,
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

  const safePlayerId = escapePostgrestFilterValue(rawPlayerId);
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from('map_objects').select('*')
      .or(`payload->>ownerId.eq.${safePlayerId},payload->>owner_id.eq.${safePlayerId},payload->>ownerTgId.eq.${safePlayerId},payload->>owner_tg_id.eq.${safePlayerId}`)
      .order('id').range(offset, offset + pageSize - 1);
    if (cityId) query = query.eq('city_id', String(cityId));
    const { data, error } = await query;
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows.filter(isDirectoryBusiness).map(normalizeBusinessForUi)
    .filter(business => String(business.ownerId || '') === rawPlayerId);

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
