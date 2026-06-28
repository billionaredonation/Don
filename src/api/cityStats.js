import { supabase } from '../supabaseClient.js';

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeCityStats(row) {
  if (!row) return null;

  return {
    ...row,
    cityId: row.city_id ?? row.cityId ?? null,
    cityName: row.city_name ?? row.cityName ?? null,
    housesTotal: toNumber(row.houses_total ?? row.housesTotal),
    housesFree: toNumber(row.houses_free ?? row.housesFree),
    bizTotal: toNumber(row.biz_total ?? row.bizTotal),
    bizFree: toNumber(row.biz_free ?? row.bizFree),
    budget: toNumber(row.budget ?? row.city_budget ?? row.cityBudget),
    taxBurned: toNumber(row.tax_burned ?? row.taxBurned),
  };
}

/**
 * Возвращает агрегированную статистику выбранного города.
 * @param {string} slug 'kyiv' | 'lviv' | …
 */
export async function fetchCityStats(slug) {
  const { data, error } = await supabase.rpc('city_stats', {
    city_slug: slug,
  });

  if (error) {
    console.error('[fetchCityStats]', error);
    throw new Error('Не удалось получить статистику города');
  }

  return normalizeCityStats(data?.[0] ?? null);
}
