import { state } from '../state.js';
import { supabase } from '../supabaseClient.js';

let cachedAdminSession = null;

function getTelegramInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

async function checkAdminSession() {
  const initData = getTelegramInitData();

  if (!initData) {
    return {
      ok: false,
      isAdmin: false,
      player: null,
      reason: 'missing_telegram_init_data',
    };
  }

  const { data, error } = await supabase.functions.invoke('verify-telegram', {
    body: { initData },
  });

  if (error) {
    console.warn('[adminAccess] verify-telegram function error:', error);

    return {
      ok: false,
      isAdmin: false,
      player: null,
      reason: 'function_error',
    };
  }

  return {
    ok: data?.ok === true,
    isAdmin: data?.isAdmin === true || data?.player?.is_admin === true,
    player: data?.player || null,
    reason: data?.reason || null,
  };
}

export async function isCurrentPlayerAdmin() {
  if (cachedAdminSession) {
    return cachedAdminSession.isAdmin === true;
  }

  const session = await checkAdminSession();
  cachedAdminSession = session;

  const isAdmin = session?.isAdmin === true;

  if (session?.player) {
    state.player = {
      ...(state.player || {}),
      ...session.player,
      is_admin: isAdmin,
      isAdmin: isAdmin,
    };
  }

  state.is_admin = isAdmin;
  state.isAdmin = isAdmin;

  return isAdmin;
}

export function resetAdminSessionCache() {
  cachedAdminSession = null;
}
