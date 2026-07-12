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
  const [statsResponse, budgetResponse] = await Promise.all([
    supabase.rpc('city_stats', { city_slug: slug }),
    supabase.rpc('get_city_state_sale_tax', { p_city_id: slug }),
  ]);

  const { data, error } = statsResponse;

  if (error) {
    console.error('[fetchCityStats]', error);
    throw new Error('Не удалось получить статистику города');
  }

  const normalized = normalizeCityStats(data?.[0] ?? null) || {};

  // До применения новой миграции RPC бюджета может ещё отсутствовать.
  // В таком случае старая статистика продолжает работать без падения экрана.
  if (!budgetResponse.error && budgetResponse.data) {
    normalized.budget = toNumber(normalized.budget) + toNumber(
      budgetResponse.data.saleTaxCollected ?? budgetResponse.data.sale_tax_collected
    );
  }

  return normalized;
}
