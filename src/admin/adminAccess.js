import { state } from '../state.js';
import { supabase } from '../supabaseClient.js';

let cachedAdminSession = null;

function showAdminDebug() {
  // Admin debug banner disabled.
  // Status is now shown through .admin-status-dot in home.js.
}

function formatDetails(details) {
  if (!details) return 'none';

  if (typeof details === 'string') {
    return details;
  }

  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function getTelegramInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

function isTruthyAdmin(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function getCachedLocalAdminSession() {
  const player = state.player || {};
  const isAdmin = (
    isTruthyAdmin(state.is_admin) ||
    isTruthyAdmin(state.isAdmin) ||
    isTruthyAdmin(player.is_admin) ||
    isTruthyAdmin(player.isAdmin)
  );

  if (!isAdmin) return null;

  return {
    ok: true,
    isAdmin: true,
    player,
    reason: 'local_player_is_admin',
    details: 'Admin allowed from already loaded player/state is_admin flag.',
  };
}

async function readFunctionError(error) {
  let details = error?.message || String(error);

  try {
    const context = error?.context;
    const responseText = await context?.text?.();

    if (responseText) {
      details = responseText;
    }
  } catch {
    // ignore
  }

  try {
    if (error?.context && typeof error.context.json === 'function') {
      const responseJson = await error.context.json();

      if (responseJson) {
        details = responseJson;
      }
    }
  } catch {
    // ignore
  }

  return details;
}

async function checkAdminSession() {
  const localAdminSession = getCachedLocalAdminSession();

  if (localAdminSession) {
    return localAdminSession;
  }

  const initData = getTelegramInitData();

  if (!initData) {
    return {
      ok: false,
      isAdmin: false,
      player: null,
      reason: 'missing_telegram_init_data',
      details: 'Telegram Mini App initData is empty and local player is not admin.',
    };
  }

  const { data, error } = await supabase.functions.invoke('verify-telegram', {
    body: { initData },
  });

  if (error) {
    const details = await readFunctionError(error);

    return {
      ok: false,
      isAdmin: false,
      player: null,
      reason: 'function_error',
      details,
    };
  }

  return {
    ok: data?.ok === true,
    isAdmin: data?.isAdmin === true || data?.player?.is_admin === true,
    player: data?.player || null,
    reason: data?.reason || null,
    details: data?.details || data?.error || null,
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

  if (isAdmin) {
    showAdminDebug(
      `ADMIN OK\nreason: ${session?.reason || 'admin_allowed'}`,
      'ok'
    );
  } else {
    showAdminDebug(
      `ADMIN BLOCKED\nreason: ${session?.reason || 'unknown'}\ndetails: ${formatDetails(session?.details)}`,
      'bad'
    );
  }

  return isAdmin;
}

export function resetAdminSessionCache() {
  cachedAdminSession = null;
}
