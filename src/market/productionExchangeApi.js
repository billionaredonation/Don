import { supabase } from '../supabaseClient.js';

const FUNCTION_NAME = 'industry-factory';
const initData = () => String(window.Telegram?.WebApp?.initData || '').trim();

async function normalizeError(error) {
  const source = error?.context || error;
  let remote = '';
  if (typeof source?.clone === 'function') {
    try {
      const body = await source.clone().json();
      remote = [body?.error, body?.message, body?.reason].filter(Boolean).join(' ');
    } catch {}
  }
  return new Error([remote, error?.message, error?.details, source?.message].filter(Boolean).join(' ') || 'PRODUCTION_EXCHANGE_REQUEST_FAILED');
}

async function invoke(action, payload = {}) {
  const telegramData = initData();
  if (!telegramData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { initData: telegramData, action, ...payload },
  });
  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'PRODUCTION_EXCHANGE_REQUEST_FAILED');
  return data.result;
}

export function getProductionExchangeError(error) {
  const raw = String(error?.message || error || 'PRODUCTION_EXCHANGE_REQUEST_FAILED');
  const messages = {
    PRODUCTION_EXCHANGE_MIGRATION_REQUIRED: 'Сначала примените SQL-миграцию биржи V12.',
    INDUSTRY_FACTORY_NOT_FOUND: 'Производственное предприятие не найдено.',
    INDUSTRY_OWNER_REQUIRED: 'У вас нет права управлять этим производством.',
    INDUSTRY_PRODUCT_UNSUPPORTED: 'Для этого товара ещё не настроена производственная цепочка.',
    INDUSTRY_PRODUCT_NOT_ENOUGH: 'На складе предприятия недостаточно готовой продукции.',
    INDUSTRY_OFFER_NOT_FOUND: 'Партия уже продана или снята с биржи.',
    INDUSTRY_REQUEST_NOT_FOUND: 'Заказ уже принят или снят с биржи.',
    INDUSTRY_PRICE_INVALID: 'Укажите корректную цену за единицу.',
    INDUSTRY_AMOUNT_INVALID: 'Укажите корректное количество.',
    BUSINESS_SHELF_ACCESS_REQUIRED: 'У вас нет права закупать товар для выбранного предприятия.',
    BUSINESS_PRODUCT_INVALID: 'Выбранное предприятие не принимает этот товар.',
    BUSINESS_CASH_NOT_ENOUGH: 'На балансе выбранного предприятия недостаточно денег.',
    BUSINESS_FINANCE_NOT_FOUND: 'Не найден финансовый счёт выбранного предприятия.',
    PRODUCTION_DELIVERY_NOT_FOUND: 'Поставка уже принята или больше недоступна.',
  };
  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

export const loadProductionExchangeV2 = () => invoke('production_exchange_snapshot');
export const publishProductionOffer = ({ industryId, factoryId, cityId, productType, quantity, unitPrice }) => invoke('production_exchange_offer_create', {
  industryId, factoryId, cityId, productType, quantity, unitPrice,
});
export const buyProductionOffer = ({ offerId, targetKind, targetId, targetCityId, targetType }) => invoke('production_exchange_offer_buy', {
  offerId, targetKind, targetId, targetCityId, targetType,
});
export const acceptProductionRequest = ({ requestId, factoryId, cityId, industryId }) => invoke('production_exchange_request_accept', {
  requestId, factoryId, cityId, industryId,
});
export const completeProductionDelivery = (deliveryId) => invoke('production_exchange_delivery_complete', { deliveryId });
