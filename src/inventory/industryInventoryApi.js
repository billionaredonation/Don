import { supabase } from '../supabaseClient.js';

function telegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function normalizeError(error) {
  const source = error?.context || error;
  let responseMessage = '';
  if (typeof source?.clone === 'function') {
    try {
      const payload = await source.clone().json();
      responseMessage = [payload?.error, payload?.message, payload?.reason].filter(Boolean).join(' ');
    } catch {}
  }
  return new Error([responseMessage, error?.message, source?.message].filter(Boolean).join(' ') || 'INDUSTRY_INVENTORY_FAILED');
}

export async function loadIndustryInventory() {
  const initData = telegramInitData();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke('admin-inventory', {
    body: { initData, action: 'inventory_self' },
  });
  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || 'INDUSTRY_INVENTORY_FAILED');
  return data.result;
}

