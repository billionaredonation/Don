import { supabase } from '../supabaseClient.js';

function initData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function invoke(action, payload = {}) {
  const telegramData = initData();
  if (!telegramData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke('coal-power', {
    body: { initData: telegramData, action, ...payload },
  });
  if (error) {
    let details = '';
    try { details = (await error.context?.clone?.().json())?.error || ''; } catch {}
    throw new Error(details || error.message || 'COAL_POWER_REQUEST_FAILED');
  }
  if (!data?.ok) throw new Error(data?.error || 'COAL_POWER_REQUEST_FAILED');
  return data.result;
}

export const loadCoalPowerSnapshot = (plantId, cityId) => invoke('snapshot', { plantId, cityId });
export const loadCoalPowerMarket = () => invoke('market');
export const purchaseCoalPowerPlant = (plantId, cityId) => invoke('purchase', { plantId, cityId });
export const purchaseCoalPowerEquipment = (plantId, cityId, equipment) => invoke('purchase_equipment', { plantId, cityId, equipment });
export const loadCoalPowerFuel = (plantId, cityId, quantity) => invoke('load_coal', { plantId, cityId, quantity });
export const addCoalPowerBudget = (plantId, cityId, amount) => invoke('add_budget', { plantId, cityId, amount });
export const setCoalPowerPrice = (plantId, cityId, unitPrice) => invoke('set_coal_price', { plantId, cityId, unitPrice });
export const setCoalPowerProcurement = (plantId, cityId, enabled) => invoke('set_procurement', { plantId, cityId, enabled });
export const sellCoalToPowerPlant = (plantId, cityId, quantity) => invoke('sell_coal', { plantId, cityId, quantity });
export const startCoalPowerPlant = (plantId, cityId) => invoke('start', { plantId, cityId });
export const stopCoalPowerPlant = (plantId, cityId) => invoke('stop', { plantId, cityId });
export const discardCoalPowerEnergy = (plantId, cityId) => invoke('discard_energy', { plantId, cityId });
export const createCoalPowerContract = (plantId, cityId, payload) => invoke('contract_create', { plantId, cityId, ...payload });

export function getCoalPowerError(error) {
  const raw = String(error?.message || error || 'COAL_POWER_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите мини-приложение.',
    COAL_POWER_DATABASE_MIGRATION_REQUIRED: 'Примените SQL УЭС и задеплойте Edge Function coal-power.',
    COAL_POWER_NOT_FOUND: 'УЭС не найдена на карте.',
    COAL_POWER_ALREADY_OWNED: 'У этой УЭС уже есть владелец.',
    COAL_POWER_OWNER_REQUIRED: 'Действие доступно только владельцу УЭС.',
    PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег.',
    COAL_POWER_EQUIPMENT_ALREADY_PURCHASED: 'Этот узел инфраструктуры уже куплен.',
    COAL_POWER_LAUNCH_REQUIREMENTS: 'Для запуска нужны накопитель, провода и предохранители.',
    COAL_POWER_COAL_REQUIRED: 'Для запуска загрузите минимум 20 единиц обыкновенного угля.',
    COAL_POWER_STORAGE_FULL: 'Накопитель заполнен. Сначала передайте или утилизируйте энергию.',
    COAL_POWER_PLAYER_COAL_NOT_ENOUGH: 'В инвентаре недостаточно обыкновенного угля.',
    COAL_POWER_COAL_QUANTITY_INVALID: 'Укажите корректное количество угля.',
    COAL_POWER_BUDGET_AMOUNT_INVALID: 'Укажите корректную сумму пополнения бюджета.',
    COAL_POWER_PRICE_INVALID: 'Цена угля должна быть от 1 до 1 000 000 ₴.',
    COAL_POWER_PRICE_REQUIRED: 'Перед запуском скупки установите цену угля.',
    COAL_POWER_PROCUREMENT_DISABLED: 'Эта УЭС сейчас не закупает уголь.',
    COAL_POWER_BUDGET_NOT_ENOUGH: 'В бюджете УЭС недостаточно денег для этой закупки.',
    COAL_POWER_NOT_OWNED: 'УЭС ещё не куплена и не принимает уголь.',
    COAL_POWER_ALREADY_RUNNING: 'УЭС уже запущена.',
    COAL_POWER_NOT_RUNNING: 'УЭС уже остановлена.',
    COAL_POWER_CONTRACT_INVALID: 'Проверьте ID подстанции, цену и сумму договора.',
  };
  return Object.entries(messages).find(([code]) => raw.includes(code))?.[1] || raw;
}
