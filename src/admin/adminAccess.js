import { state } from '../state.js';

export function isCurrentPlayerAdmin() {
  return Boolean(
    state?.player?.is_admin === true ||
    state?.player?.isAdmin === true ||
    state?.is_admin === true ||
    state?.isAdmin === true ||
    state?.admin === true
  );
}
