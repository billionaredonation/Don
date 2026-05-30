import { state } from '../state.js';
import { supabase } from '../supabaseClient.js';

let cachedAdminSession = null;

function getTelegramInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

async function checkAdminSession() {
  const initData = getTelegramInitData();

  if (!initData) {
    console.warn('[adminAccess] blocked: missing telegram initData');

    return {
      ok: false,
      isAdmin: false,
      player: null,
      reason: 'missing_telegram_init_data',
    };
  }

  const { data, error } = await supabase.functions.invoke('admin-session', {
    body: { initData },
  });

  if (error) {
    console.warn('[adminAccess] admin-session function error:', error);

    return {
      ok: false,
      isAdmin: false,
      player: null,
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

  console.log('[adminAccess] result:', {
    isAdmin,
    reason: session?.reason,
    hasPlayer: Boolean(session?.player),
  });

  return isAdmin;
}

export function resetAdminSessionCache() {
  cachedAdminSession = null;
}
