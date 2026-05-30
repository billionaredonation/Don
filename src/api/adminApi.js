import { supabase } from '../supabaseClient.js';

function getTelegramInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

export async function checkAdminSession() {
  const initData = getTelegramInitData();

  if (!initData) {
    return {
      ok: false,
      isAdmin: false,
      reason: 'missing_telegram_init_data',
    };
  }

  const { data, error } = await supabase.functions.invoke('admin-session', {
    body: { initData },
  });

  if (error) {
    console.warn('[adminApi] admin-session function error:', error);
    return {
      ok: false,
      isAdmin: false,
      reason: 'function_error',
    };
  }

  return {
    ok: data?.ok === true,
    isAdmin: data?.isAdmin === true,
    player: data?.player || null,
    reason: data?.reason || null,
  };
}
