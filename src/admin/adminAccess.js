import { state } from '../state.js';

function isTruthyAdmin(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function isCurrentPlayerAdmin() {
  const flags = [
    state?.player?.is_admin,
    state?.player?.isAdmin,

    state?.profile?.is_admin,
    state?.profile?.isAdmin,

    state?.remotePlayer?.is_admin,
    state?.remotePlayer?.isAdmin,

    state?.currentPlayer?.is_admin,
    state?.currentPlayer?.isAdmin,

    state?.is_admin,
    state?.isAdmin,
    state?.admin,
  ];

  return flags.some(isTruthyAdmin);
}
