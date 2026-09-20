import { supabase } from '../supabaseClient.js';

function initData() { return String(window.Telegram?.WebApp?.initData || '').trim(); }

async function invoke(action, payload = {}) {
  const telegramData = initData();
  if (!telegramData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke('hydro-power', { body: { initData: telegramData, action, ...payload } });
  if (error) {
    let details = '';
    try { details = (await error.context?.clone?.().json())?.error || ''; } catch {}
    throw new Error(details || error.message || 'HYDRO_REQUEST_FAILED');
  }
  if (!data?.ok) throw new Error(data?.error || 'HYDRO_REQUEST_FAILED');
  return data.result;
}

export const loadHydroSnapshot = (plantId, cityId) => invoke('snapshot', { plantId, cityId });
export const purchaseHydroPlant = (plantId, cityId) => invoke('purchase', { plantId, cityId });
export const purchaseHydroEquipment = (plantId, cityId, equipment) => invoke('purchase_equipment', { plantId, cityId, equipment });
export const startHydroPlant = (plantId, cityId) => invoke('start', { plantId, cityId });
export const stopHydroPlant = (plantId, cityId) => invoke('stop', { plantId, cityId });
export const repairHydroPlant = (plantId, cityId) => invoke('repair', { plantId, cityId });
export const addHydroBudget = (plantId, cityId, amount) => invoke('add_budget', { plantId, cityId, amount });
export const withdrawHydroMoney = (plantId, cityId, amount) => invoke('withdraw', { plantId, cityId, amount });
export const createHydroContract = (plantId, cityId, payload) => invoke('contract_create', { plantId, cityId, ...payload });

export function getHydroError(error) {
  const raw = String(error?.message || error || 'HYDRO_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.', TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела.',
    HYDRO_DATABASE_MIGRATION_REQUIRED: 'Сначала примените SQL-миграцию ГЭС, затем обновите Edge Function hydro-power.',
    HYDRO_NOT_FOUND: 'ГЭС не найдена.', HYDRO_ALREADY_OWNED: 'У ГЭС уже есть владелец.', HYDRO_OWNER_REQUIRED: 'Действие доступно только владельцу.',
    PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег.', HYDRO_EQUIPMENT_ALREADY_PURCHASED: 'Этот узел инфраструктуры уже куплен.',
    HYDRO_LAUNCH_REQUIREMENTS: 'Для запуска нужны накопитель, ЛЭП и предохранители.', HYDRO_ALREADY_RUNNING: 'ГЭС уже запущена.',
    HYDRO_NOT_RUNNING: 'ГЭС ещё не запущена.', HYDRO_CONDITION_LOW: 'Станция остановлена: требуется ремонт.', HYDRO_REPAIR_NOT_REQUIRED: 'Ремонт пока не требуется.',
    HYDRO_AMOUNT_INVALID: 'Укажите корректную сумму.', HYDRO_BALANCE_NOT_ENOUGH: 'На счёте ГЭС недостаточно денег.',
    HYDRO_CONTRACT_AMOUNT_INVALID: 'Сумма контракта должна быть от 20 000 до 2 000 000 грн.', HYDRO_SUBSTATION_FUTURE_ONLY: 'Подстанции ещё не добавлены: контракт пока можно только подготовить.',
    ENERGY_CONTRACT_END_DATE_INVALID: 'Выберите дату окончания не раньше завтрашнего дня.',
  };
  return Object.entries(messages).find(([code]) => raw.includes(code))?.[1] || raw;
}
