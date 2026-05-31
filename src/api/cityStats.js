import { supabase } from '../supabaseClient.js';

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
  return data?.[0] ?? null;
}
