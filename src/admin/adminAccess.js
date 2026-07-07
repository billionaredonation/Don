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

function getLocalPlayerIdFromState() {
  const direct =
    state.playerId ||
    state.player?.playerId ||
    state.player?.player_id ||
    null;

  if (direct) return String(direct);

  try {
    const stored = localStorage.getItem('mn_player_id');
    if (stored) return String(stored);
  } catch {
    // ignore
  }

  return null;
}

function getLocalTelegramIdFromState() {
  const direct =
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
    state.telegramId ||
    state.player?.telegramId ||
    state.player?.tg_id ||
    null;

  return direct ? String(direct) : null;
}

function getLocalNicknameFromState() {
  return String(
    state.nickname ||
      state.player?.nickname ||
      state.player?.name ||
      ''
  ).trim();
}

async function getDatabaseAdminSession() {
  const playerId = getLocalPlayerIdFromState();
  const telegramId = getLocalTelegramIdFromState();
  const nickname = getLocalNicknameFromState();

  const selectors = [];

  if (telegramId) selectors.push({ table: 'players', column: 'tg_id', value: telegramId });
  if (playerId) selectors.push({ table: 'players', column: 'player_id', value: playerId });
  if (nickname) selectors.push({ table: 'players', column: 'nickname', value: nickname, ilike: true });
  if (playerId) selectors.push({ table: 'player_positions', column: 'player_id', value: playerId });
  if (nickname) selectors.push({ table: 'player_positions', column: 'nickname', value: nickname, ilike: true });

  for (const selector of selectors) {
    try {
      let query = supabase
        .from(selector.table)
        .select('*')
        .limit(1);

      query = selector.ilike
        ? query.ilike(selector.column, selector.value)
        : query.eq(selector.column, selector.value);

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.warn('[adminAccess] database admin check failed:', selector.table, error);
        continue;
      }

      if (!data || !isTruthyAdmin(data.is_admin || data.isAdmin)) {
        continue;
      }

      return {
        ok: true,
        isAdmin: true,
        player: data,
        reason: `database_${selector.table}_${selector.column}`,
        details: 'Admin allowed by database is_admin flag without requiring Telegram initData.',
      };
    } catch (error) {
      console.warn('[adminAccess] database admin check crashed:', selector.table, error);
    }
  }

  return null;
}

function getLocalAdminSession() {
  const player = state.player || {};

  const isAdmin =
    isTruthyAdmin(state.is_admin) ||
    isTruthyAdmin(state.isAdmin) ||
    isTruthyAdmin(player.is_admin) ||
    isTruthyAdmin(player.isAdmin);

  if (!isAdmin) return null;

  return {
    ok: true,
    isAdmin: true,
    player,
    reason: 'local_db_admin_flag',
    details: 'Admin allowed by already loaded player/state is_admin flag.',
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
  const initData = getTelegramInitData();

  if (!initData) {
    const localSession = getLocalAdminSession();

    if (localSession) {
      return localSession;
    }

    const databaseSession = await getDatabaseAdminSession();

    if (databaseSession) {
      return databaseSession;
    }

    return {
      ok: false,
      isAdmin: false,
      player: null,
      reason: 'missing_telegram_init_data',
      details: 'Telegram Mini App initData is empty and no local/database is_admin flag is loaded.',
    };
  }

  const { data, error } = await supabase.functions.invoke('verify-telegram', {
    body: { initData },
  });

  if (error) {
    const details = await readFunctionError(error);
    const databaseSession = await getDatabaseAdminSession();

    if (databaseSession) {
      return databaseSession;
    }

    return {
      ok: false,
      isAdmin: false,
      player: null,
      reason: 'function_error',
      details,
    };
  }

  const telegramSession = {
    ok: data?.ok === true,
    isAdmin: data?.isAdmin === true || data?.player?.is_admin === true,
    player: data?.player || null,
    reason: data?.reason || null,
    details: data?.details || data?.error || null,
  };

  if (telegramSession.isAdmin) {
    return telegramSession;
  }

  const databaseSession = await getDatabaseAdminSession();

  return databaseSession || telegramSession;
}

export async function isCurrentPlayerAdmin() {
  const localSession = getLocalAdminSession();

  if (localSession) {
    cachedAdminSession = localSession;
    return true;
  }

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
