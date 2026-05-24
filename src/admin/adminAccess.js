import { state } from '../state.js';

export function isCurrentPlayerAdmin() {
  return (
    state?.player?.is_admin === true ||
    state?.player?.isAdmin === true ||
    state?.is_admin === true ||
    state?.isAdmin === true
  );
}
