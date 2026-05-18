import { supabase } from '../supabaseClient.js';

export async function verifyTelegramAccess() {
  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    throw new Error('Запуск разрешён только через Telegram');
  }

  const { data, error } = await supabase.functions.invoke('verify-telegram', {
    body: {
      initData,
    },
  });

  if (error || !data?.ok) {
    throw new Error(data?.error || 'Telegram авторизация не прошла проверку');
  }

  return data.telegramUser;
}
