import { getPlayer, createPlayer } from './api/playerApi.js';

function getTelegramUserId() {
  const tg = window.Telegram?.WebApp;

  const userId =
    tg?.initDataUnsafe?.user?.id ||
    tg?.initDataUnsafe?.receiver?.id ||
    null;

  if (userId) {
    return String(userId);
  }

  let localId = localStorage.getItem('mn_guest_tg_id');

  if (!localId) {
    localId = `guest_${crypto.randomUUID()}`;
    localStorage.setItem('mn_guest_tg_id', localId);
  }

  return localId;
}

export function getCurrentTgId() {
  return getTelegramUserId();
}

export async function loadPlayer() {
  const tgId = getTelegramUserId();

  const result = await getPlayer(tgId);

  return result.player || null;
}

export async function registerPlayer({ nickname, city }) {
  const tgId = getTelegramUserId();

  const result = await createPlayer({
    tgId,
    nickname,
    city,
  });

  return result.player;
}
