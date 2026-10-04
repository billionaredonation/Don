import { supabase } from '../supabaseClient.js';

const initData = () =>
  String(window.Telegram?.WebApp?.initData || '').trim();

export async function loadBusinessUtilityPortal(objectIds = []) {
  const telegramData = initData();

  if (!telegramData) {
    throw new Error('TELEGRAM_SESSION_REQUIRED');
  }

  const ids = [
    ...new Set(
      (Array.isArray(objectIds) ? objectIds : [])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    ),
  ];

  const { data, error } = await supabase.functions.invoke(
    'business-utilities',
    {
      body: {
        initData: telegramData,
        objectIds: ids,
      },
    },
  );

  if (error) {
    let remote = '';

    try {
      remote =
        (await error.context?.clone?.().json())?.error ||
        '';
    } catch {}

    throw new Error(
      remote ||
      error.message ||
      'BUSINESS_UTILITIES_REQUEST_FAILED',
    );
  }

  if (!data?.ok) {
    throw new Error(
      data?.error ||
      'BUSINESS_UTILITIES_REQUEST_FAILED',
    );
  }

  return data.result || {};
}
