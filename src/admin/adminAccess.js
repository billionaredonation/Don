import { state } from '../state.js';
import { checkAdminSession } from '../api/adminApi.js';

let cachedAdminSession = null;

export async function isCurrentPlayerAdmin() {
  if (cachedAdminSession) {
    return cachedAdminSession.isAdmin === true;
  }

  const session = await checkAdminSession();
  cachedAdminSession = session;

  if (session?.player) {
    state.player = {
      ...(state.player || {}),
      ...session.player,
      is_admin: session.isAdmin === true,
      isAdmin: session.isAdmin === true,
    };

    state.is_admin = session.isAdmin === true;
    state.isAdmin = session.isAdmin === true;
  }

  return session.isAdmin === true;
}

export function resetAdminSessionCache() {
  cachedAdminSession = null;
}
