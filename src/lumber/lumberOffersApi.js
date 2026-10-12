import { supabase } from '../supabaseClient.js';

export async function lumberOffersAction(action, payload = {}) {
  const initData = String(window.Telegram?.WebApp?.initData || '').trim();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke('lumber-offers', { body: { initData, action, ...payload } });
  if (error) {
    let detail = '';
    try { detail = (await error.context?.clone?.().json())?.error || ''; } catch {}
    throw new Error(detail || error.message || 'LUMBER_OFFERS_UNAVAILABLE');
  }
  if (!data?.ok) throw new Error(data?.error || 'LUMBER_OFFERS_REQUEST_FAILED');
  return data.result;
}
