import { state } from '../state.js';
import { supabase } from '../supabaseClient.js';

let cachedAdminSession = null;

function showAdminDebug(message, type = 'info') {
  let el = document.querySelector('.admin-access-debug');

  if (!el) {
    el = document.createElement('div');
    el.className = 'admin-access-debug';
    el.style.cssText = `
      position: fixed;
      left: 12px;
      bottom: 12px;
      z-index: 999999;
      max-width: calc(100vw - 24px);
      padding: 10px 12px;
      border-radius: 12px;
      font: 800 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      color: white;
      background: rgba(10, 12, 18, 0.92);
      border: 1px solid rgba(255,255,255,0.18);
      box-shadow: 0 12px 30px rgba(0,0,0,0.45);
      pointer-events: none;
      white-space: pre-wrap;
    `;
    document.body.appendChild(el);
  }

  el.style.background =
    type === 'ok'
      ? 'rgba(0, 120, 70, 0.92)'
      : type === 'bad'
        ? 'rgba(150, 20, 20, 0.92)'
        : 'rgba(10, 12, 18, 0.92)';

  el.textContent = message;
}

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
    return {
      ok: false,
      isAdmin: false,
      player: null,
      reason: 'function_error',
      details: error.message || String(error),
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
      `ADMIN BLOCKED\nreason: ${session?.reason || 'unknown'}\ndetails: ${session?.details || 'none'}`,
      'bad'
    );
  }

  return isAdmin;
}

export function resetAdminSessionCache() {
  cachedAdminSession = null;
}
