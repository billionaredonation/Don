import { supabase } from '../supabaseClient.js';

const stockErrors = { PROCUREMENT_BUDGET_NOT_ENOUGH: 'В бюджете скупки завода недостаточно средств для этой партии.', LUMBER_PROCUREMENT_OWNER_CHANGED: 'Владелец завода изменился. Новый владелец должен настроить бюджет скупки.', LUMBER_TARGET_NOT_WOOD_FACTORY: 'Выберите деревоперерабатывающий завод.', LUMBER_BUSINESS_STOCK_NOT_ENOUGH: 'На складе предприятия недостаточно древесины.', LUMBER_SOURCE_OWNER_CHANGED: 'Владелец предприятия-продавца изменился. Создайте новое предложение.', JOB_BUSINESS_OWNER_REQUIRED: 'Продавать со склада может только владелец предприятия.' };
const offerError = value => new Error(stockErrors[value] || value);

export async function lumberOffersAction(action, payload = {}) {
  const initData = String(window.Telegram?.WebApp?.initData || '').trim();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke('lumber-offers', { body: { initData, action, ...payload } });
  if (error) {
    let detail = '';
    try { detail = (await error.context?.clone?.().json())?.error || ''; } catch {}
    throw offerError(detail || error.message || 'LUMBER_OFFERS_UNAVAILABLE');
  }
  if (!data?.ok) throw offerError(data?.error || 'LUMBER_OFFERS_REQUEST_FAILED');
  return data.result;
}
