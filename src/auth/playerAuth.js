import { supabase } from '../supabaseClient.js';

const AUTH_KEY = 'mn_auth_player';

function normalizeNickname(value) {
  return String(value || '').trim();
}

function getNicknameKey(value) {
  return normalizeNickname(value).toLowerCase();
}

export function getAuthPlayer() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
  } catch {
    return null;
  }
}

export function clearAuthPlayer() {
  localStorage.removeItem(AUTH_KEY);
}

export async function loginByNickname(nickname) {
  const cleanNickname = normalizeNickname(nickname);
  const nicknameKey = getNicknameKey(cleanNickname);

  if (!nicknameKey) {
    throw new Error('Введите ник');
  }

  const { data, error } = await supabase
    .from('player_profiles')
    .select('*')
    .eq('nickname_key', nicknameKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Ник не найден. Сначала зарегистрируй игрока.');
  }

  const authPlayer = {
    id: data.id,
    nickname: data.nickname,
    nicknameKey: data.nickname_key,
  };

  localStorage.setItem(AUTH_KEY, JSON.stringify(authPlayer));

  return authPlayer;
}
