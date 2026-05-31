import { supabase } from '../supabaseClient.js';

/** Гарантирует, что город и 90 домов-сидов есть в БД. */
export async function ensureCity(slug, name) {
  await supabase.rpc('ensure_city_and_houses', { p_slug: slug, p_name: name });
}

/** Агрегированная статистика (дома + бизнесы). */
export async function fetchCityStats(slug) {
  const { data, error } = await supabase.rpc('city_stats', { city_slug: slug });
  if (error) throw error;
  return data?.[0] ?? null;
}
