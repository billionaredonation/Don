import { supabase } from '../supabaseClient.js';

const FUNCTION_NAME = 'community';

function initData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function normalizeError(error) {
  const source = error?.context || error;
  let body = '';
  if (typeof source?.clone === 'function') {
    try {
      const payload = await source.clone().json();
      body = String(payload?.error || payload?.message || '');
    } catch {}
  }
  return new Error(body || error?.message || 'COMMUNITY_REQUEST_FAILED');
}

async function invoke(action, payload = {}) {
  const telegram = initData();
  if (!telegram) throw new Error('TELEGRAM_SESSION_REQUIRED');

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { initData: telegram, action, ...payload },
  });

  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || 'COMMUNITY_REQUEST_FAILED');
  return data.result;
}

export const loadCommunity = () => invoke('snapshot');
export const createCommunity = (name) => invoke('create', { name });
export const inviteCommunityPlayer = (target) => invoke('invite', { target });
export const answerCommunityInvite = (inviteId, accept) => invoke('answer_invite', { inviteId, accept });
export const leaveCommunity = () => invoke('leave');
export const kickCommunityMember = (targetTgId) => invoke('kick', { targetTgId });
export const transferCommunityOwner = (targetTgId) => invoke('transfer', { targetTgId });

export const enterCommunityWork = ({ workType, workKey, sessionToken }) =>
  invoke('work_enter', { workType, workKey, sessionToken });

export const heartbeatCommunityWork = ({ workType, workKey, sessionToken }) =>
  invoke('work_heartbeat', { workType, workKey, sessionToken });

export const leaveCommunityWork = ({ sessionToken }) =>
  invoke('work_leave', { sessionToken });

export function communityError(error) {
  const raw = String(error?.message || error || '');
  const map = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите мини-приложение.',
    COMMUNITY_LEVEL_2_REQUIRED: 'Создать сообщество можно со 2 уровня.',
    COMMUNITY_NAME_INVALID: 'Название сообщества: от 3 до 32 символов.',
    COMMUNITY_NAME_TAKEN: 'Такое название сообщества уже занято.',
    COMMUNITY_ALREADY_MEMBER: 'Вы уже состоите в сообществе.',
    COMMUNITY_COOLDOWN_ACTIVE: 'После выхода или удаления сообщества нужно подождать 24 часа перед созданием или вступлением в новое.',
    COMMUNITY_OWNER_REQUIRED: 'Это действие доступно только главе сообщества.',
    COMMUNITY_FULL: 'В сообществе уже 10 участников.',
    COMMUNITY_PLAYER_NOT_FOUND: 'Игрок не найден. Укажите точный ник или Telegram ID.',
    COMMUNITY_SELF_INVITE: 'Нельзя пригласить самого себя.',
    COMMUNITY_TARGET_ALREADY_MEMBER: 'Этот игрок уже состоит в сообществе.',
    COMMUNITY_INVITE_NOT_FOUND: 'Приглашение уже недоступно.',
    COMMUNITY_INVITE_EXPIRED: 'Срок приглашения истёк.',
    COMMUNITY_NOT_MEMBER: 'Вы не состоите в сообществе.',
    COMMUNITY_TRANSFER_OWNER_FIRST: 'Сначала передайте руководство другому участнику.',
    COMMUNITY_OWNER_CANNOT_KICK_SELF: 'Глава не может исключить самого себя.',
    COMMUNITY_MEMBER_NOT_FOUND: 'Участник не найден.',
  };
  const code = Object.keys(map).find((key) => raw.includes(key));
  return code ? map[code] : raw || 'Не удалось выполнить действие.';
}
