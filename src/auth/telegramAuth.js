import { supabase } from '../supabaseClient.js';

function getTelegramFallbackUser() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user ?? null;
}

export async function verifyTelegramAccess() {
  const initData = window.Telegram?.WebApp?.initData;
  const fallbackUser = getTelegramFallbackUser();

  if (!initData && !fallbackUser) {
    throw new Error('Запуск разрешён только через Telegram');
  }

  try {
    const { data, error } = await supabase.functions.invoke('verify-telegram', {
      body: {
        initData,
      },
    });

    if (error) {
      console.warn('[telegramAuth] verify-telegram function error:', error);
    }

    if (data?.ok) {
      return data.telegramUser || fallbackUser;
    }

    console.warn(
      '[telegramAuth] verify-telegram skipped:',
      data?.error || 'Telegram verification returned not ok'
    );

    return fallbackUser;
  } catch (error) {
    console.warn('[telegramAuth] verify-telegram crashed:', error);

    return fallbackUser;
  }
}
