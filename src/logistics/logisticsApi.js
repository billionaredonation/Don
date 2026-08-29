import { supabase } from '../supabaseClient.js';

const initData = () => String(window.Telegram?.WebApp?.initData || '').trim();
async function invoke(action, payload = {}) {
  const telegramData = initData();
  if (!telegramData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke('logistics-business', {
    body: { initData: telegramData, action, ...payload },
  });
  if (error) {
    let details = '';
    try { details = String((await error.context?.clone?.().json())?.error || ''); } catch {}
    throw new Error(details || error.message || 'LOGISTICS_REQUEST_FAILED');
  }
  if (!data?.ok) throw new Error(data?.error || 'LOGISTICS_REQUEST_FAILED');
  return data.result;
}

export const loadLogisticsSnapshot = (businessId) => invoke('logistics_snapshot', { businessId });
export const createLogisticsContract = (payload) => invoke('logistics_contract_create', payload);
export const acceptLogisticsContract = (businessId, contractId, roleId) => invoke('logistics_contract_accept', { businessId, contractId, roleId });
export const completeLogisticsContract = (businessId, contractId, result) => invoke('logistics_contract_complete', { businessId, contractId, result });
export const buyLogisticsVehicle = (businessId, vehicleType) => invoke('logistics_vehicle_buy', { businessId, vehicleType });

export function logisticsError(error) {
  const raw = String(error?.message || error || 'LOGISTICS_REQUEST_FAILED');
  const messages = {
    LOGISTICS_OWNER_REQUIRED: 'Действие доступно владельцу логистического центра.',
    LOGISTICS_CONTRACT_INVALID: 'Заявка уже занята или закрыта.',
    LOGISTICS_CONTRACT_LIMIT: 'Сначала завершите активную заявку.',
    LOGISTICS_FLEET_REQUIRED: 'Для рейса нужен свободный транспорт.',
    LOGISTICS_CASH_NOT_ENOUGH: 'На счёте центра недостаточно денег.',
    BUSINESS_DEPOSIT_AMOUNT_INVALID: 'Укажите корректную сумму пополнения.',
    BUSINESS_PROFIT_NOT_ENOUGH: 'На счёте предприятия недостаточно денег.',
    NOT_ENOUGH_MONEY: 'На личном балансе недостаточно денег.',
    LOGISTICS_CONTRACT_NOT_ASSIGNED: 'Эта заявка закреплена за другим игроком.',
    LOGISTICS_RESULT_LOW: 'Задание провалено — попробуйте ещё раз.',
  };
  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}
