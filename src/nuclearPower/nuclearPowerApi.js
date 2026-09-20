import { supabase } from '../supabaseClient.js';

function initData() { return String(window.Telegram?.WebApp?.initData || '').trim(); }

async function invoke(action, payload = {}) {
  const telegramData = initData();
  if (!telegramData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke('nuclear-power', {
    body: { initData: telegramData, action, ...payload },
  });
  if (error) {
    let details = '';
    try { details = (await error.context?.clone?.().json())?.error || ''; } catch {}
    throw new Error(details || error.message || 'NUCLEAR_REQUEST_FAILED');
  }
  if (!data?.ok) throw new Error(data?.error || 'NUCLEAR_REQUEST_FAILED');
  return data.result;
}

export const loadNuclearSnapshot = (plantId, cityId) => invoke('snapshot', { plantId, cityId });
export const setNuclearRunning = (plantId, cityId, running) => invoke('set_running', { plantId, cityId, running });
export const discardNuclearEnergy = (plantId, cityId) => invoke('discard_energy', { plantId, cityId });
export const createNuclearContract = (plantId, cityId, payload) => invoke('contract_create', { plantId, cityId, ...payload });

export function getNuclearError(error) {
  const raw = String(error?.message || error || 'NUCLEAR_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите мини-приложение.',
    NUCLEAR_ADMIN_REQUIRED: 'У вас нет доступа к управлению государственным объектом',
    NUCLEAR_NOT_FOUND: 'АЭС не найдена на карте.',
    NUCLEAR_CONTRACT_INVALID: 'Проверьте ID подстанции, цену кВт·ч и сумму контракта.',
    ENERGY_CONTRACT_END_DATE_INVALID: 'Выберите дату окончания не раньше завтрашнего дня.',
    NUCLEAR_DATABASE_MIGRATION_REQUIRED: 'Примените SQL АЭС и задеплойте Edge Function nuclear-power.',
  };
  return Object.entries(messages).find(([code]) => raw.includes(code))?.[1] || raw;
}
