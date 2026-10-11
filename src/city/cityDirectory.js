import { supabase } from '../supabaseClient.js';
import { payloadOf, typeOf, categoryOf, ownerOf, businessInfo, isDirectoryBusiness as isBusiness, isDirectoryJob as isJob } from '../business/businessDirectoryModel.js';

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeObject(row) {
  const payload = payloadOf(row);
  const type = typeOf(row);
  const { icon, label: defaultLabel } = businessInfo(row);
  const label = String(
    payload.displayName ||
    payload.name ||
    payload.title ||
    row?.name ||
    defaultLabel
  ).trim() || defaultLabel;

  const x = numberOrNull(row?.x ?? payload.x);
  const y = numberOrNull(row?.y ?? payload.y);
  const ownerId = ownerOf(row);

  return {
    id: String(row?.id || payload.mapObjectId || payload.objectId || '').trim(),
    cityId: String(row?.city_id || payload.cityId || payload.city_id || '').trim(),
    type,
    category: categoryOf(row),
    icon,
    label,
    x,
    y,
    ownerId,
    ownerLabel: ownerId ? 'Игрок' : 'Государство',
  };
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.id || `${item.type}:${item.x}:${item.y}:${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortItems(items) {
  return [...items].sort((a, b) =>
    a.label.localeCompare(b.label, 'ru') ||
    a.type.localeCompare(b.type, 'ru')
  );
}

export function getEmptyCityDirectory() {
  return {
    businesses: [],
    jobs: [],
    businessCount: 0,
    jobCount: 0,
  };
}

export async function fetchCityDirectory(cityId) {
  const safeCityId = String(cityId || '').trim();
  if (!safeCityId) return getEmptyCityDirectory();

  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('map_objects')
      .select('id,name,city_id,type,category,x,y,payload').eq('city_id', safeCityId)
      .order('id').range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const businesses = sortItems(uniqueById(rows.filter(isBusiness).map(normalizeObject)));
  const jobs = sortItems(uniqueById(rows.filter(isJob).map(normalizeObject)));

  return {
    businesses,
    jobs,
    businessCount: businesses.length,
    jobCount: jobs.length,
  };
}
