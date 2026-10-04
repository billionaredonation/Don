import { supabase } from '../supabaseClient.js';

const FUNCTION_NAME = 'local-gangs';

function telegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function normalizeError(error, fallback = 'LOCAL_GANG_REQUEST_FAILED') {
  const source = error?.context || error;
  let responseMessage = '';

  if (typeof source?.clone === 'function') {
    try {
      const payload = await source.clone().json();
      responseMessage = [payload?.error, payload?.message, payload?.reason].filter(Boolean).join(' ');
    } catch {}
  }

  const message = [
    responseMessage,
    error?.message,
    error?.details,
    error?.hint,
    source?.message,
  ].filter(Boolean).join(' ');

  return new Error(message || fallback);
}

export function localGangError(error) {
  const raw = String(error?.message || error || 'LOCAL_GANG_REQUEST_FAILED');

  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите мини-приложение.',
    SERVER_NOT_CONFIGURED: 'Сервер местных банд не настроен.',
    PLAYER_NOT_FOUND: 'Игрок не найден.',
    LOCAL_GANG_ACTOR_REQUIRED: 'Не удалось определить игрока.',
    LOCAL_GANG_NAME_INVALID: 'Название банды должно содержать от 3 до 28 символов.',
    LOCAL_GANG_NAME_TAKEN: 'Банда с таким названием уже существует.',
    LOCAL_GANG_ALREADY_MEMBER: 'Вы уже состоите в местной банде.',
    LOCAL_GANG_NOT_MEMBER: 'Вы не состоите в местной банде.',
    LOCAL_GANG_NOT_FOUND: 'Банда больше не существует.',
    LOCAL_GANG_OWNER_REQUIRED: 'Это действие доступно только главе банды.',
    LOCAL_GANG_FULL: 'В местной банде уже максимальные 3 участника.',
    LOCAL_GANG_TARGET_REQUIRED: 'Введите ник или Telegram ID игрока.',
    LOCAL_GANG_PLAYER_NOT_FOUND: 'Игрок с таким ником или ID не найден.',
    LOCAL_GANG_INVITE_SELF: 'Нельзя пригласить самого себя.',
    LOCAL_GANG_TARGET_ALREADY_MEMBER: 'Этот игрок уже состоит в местной банде.',
    LOCAL_GANG_INVITE_EXISTS: 'Этому игроку уже отправлено приглашение.',
    LOCAL_GANG_INVITE_NOT_FOUND: 'Приглашение больше недоступно.',
    LOCAL_GANG_INVITE_EXPIRED: 'Срок приглашения истёк.',
    LOCAL_GANG_OWNER_CANNOT_KICK_SELF: 'Глава не может исключить самого себя.',
    LOCAL_GANG_MEMBER_NOT_FOUND: 'Участник не найден.',
    LOCAL_GANG_TRANSFER_OWNER_FIRST: 'Сначала передайте главу другому участнику.',
  };

  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

async function invokeLocalGang(action, payload = {}) {
  const initData = telegramInitData();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { initData, action, ...payload },
  });

  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'LOCAL_GANG_REQUEST_FAILED');

  return data.result;
}

export const loadLocalGang = () => invokeLocalGang('snapshot');
export const createLocalGang = (name) => invokeLocalGang('create', { name });
export const inviteLocalGangPlayer = (target) => invokeLocalGang('invite', { target });

export const answerLocalGangInvite = (inviteId, accept) => invokeLocalGang('answer_invite', {
  inviteId,
  accept,
});

export const kickLocalGangMember = (targetTgId) => invokeLocalGang('kick', { targetTgId });
export const transferLocalGangOwner = (targetTgId) => invokeLocalGang('transfer', { targetTgId });
export const leaveLocalGang = () => invokeLocalGang('leave');
