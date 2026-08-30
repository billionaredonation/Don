import { supabase } from '../supabaseClient.js';

const initData = () => String(window.Telegram?.WebApp?.initData || '').trim();

async function readInvokeError(error) {
  let message = String(error?.message || 'INDUSTRY_REQUEST_FAILED');
  try {
    const response = error?.context;
    if (response && typeof response.clone === 'function') {
      const body = await response.clone().json();
      if (body?.error) message = String(body.error);
      if (body?.rpc) message += ` [${body.rpc}]`;
    }
  } catch {}
  return message;
}

async function invoke(action, payload = {}) {
  const telegramData = initData();
  if (!telegramData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke('industry-factory', {
    body: { initData: telegramData, action, ...payload },
  });
  if (error) throw new Error(await readInvokeError(error));
  if (!data?.ok) throw new Error(data?.error || 'INDUSTRY_REQUEST_FAILED');
  return data.result;
}

export const loadIndustrySnapshot = (factoryId, cityId, industryId) => invoke('snapshot', { factoryId, cityId, industryId });
export const purchaseIndustry = (factoryId, cityId, industryId, legalForm) => invoke('purchase', { factoryId, cityId, industryId, legalForm });
export const depositIndustry = (factoryId, cityId, amount) => invoke('deposit', { factoryId, cityId, amount });
export const withdrawIndustry = (factoryId, cityId, amount) => invoke('withdraw', { factoryId, cityId, amount });
export const createIndustryOrder = (factoryId, cityId, recipeId) => invoke('order_create', { factoryId, cityId, recipeId });
export const startIndustryWork = (factoryId, cityId, roleId, batchId) => invoke('work_start', { factoryId, cityId, roleId, batchId });
export const completeIndustryWork = (factoryId, cityId, taskId, result) => invoke('work_complete', { factoryId, cityId, taskId, result });
export const cancelIndustryWork = (factoryId, cityId, taskId) => invoke('work_cancel', { factoryId, cityId, taskId });
export const transferIndustryRaw = (factoryId, cityId, itemType, quantity) => invoke('raw_transfer', { factoryId, cityId, itemType, quantity });
export const sellIndustryRaw = (factoryId, cityId, itemType, quantity) => invoke('raw_sell', { factoryId, cityId, itemType, quantity });
export const setIndustryBuyPrice = (factoryId, cityId, itemType, unitPrice) => invoke('buy_price_set', { factoryId, cityId, itemType, unitPrice });
export const withdrawIndustryProduct = (factoryId, cityId, itemType, quantity) => invoke('product_withdraw', { factoryId, cityId, itemType, quantity });
export const setIndustryRole = (factoryId, cityId, target, roleId) => invoke('staff_set', { factoryId, cityId, target, roleId });
export const loadIndustryExchange = () => invoke('exchange_snapshot');
export const createIndustryOffer = payload => invoke('exchange_offer_create', payload);
export const createIndustryRequest = payload => invoke('exchange_request_create', payload);
export const acceptIndustryRequest = (requestId, factoryId, cityId) => invoke('exchange_request_accept', { requestId, factoryId, cityId });
export const buyIndustryOffer = (offerId, businessId) => invoke('exchange_offer_buy', { offerId, businessId });
export const buyIndustryOfferForFactory = (offerId, targetFactoryId, targetCityId) => invoke('exchange_offer_buy_factory', { offerId, targetFactoryId, targetCityId });

export function industryError(e) {
  const raw = String(e?.message || e || 'INDUSTRY_REQUEST_FAILED');
  const map = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Telegram-сессия устарела. Перезапустите Mini App.',
    SERVER_NOT_CONFIGURED: 'Edge Function не настроена: проверьте секреты SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY и TELEGRAM_BOT_TOKEN.',
    INDUSTRY_OWNER_REQUIRED: 'Действие доступно владельцу предприятия.',
    INDUSTRY_STAFF_REQUIRED: 'Вы не приняты на это предприятие.',
    INDUSTRY_INPUT_NOT_ENOUGH: 'На складе недостаточно сырья.',
    INDUSTRY_WAREHOUSE_FULL: 'Склад предприятия заполнен.',
    INDUSTRY_RAW_NOT_ACCEPTED: 'Этот завод не принимает такое сырьё.',
    INDUSTRY_BUY_DISABLED: 'Закупка этого сырья отключена.',
    INDUSTRY_PRICE_INVALID: 'Некорректная цена закупки.',
    INDUSTRY_STORE_INCOMPATIBLE: 'Этот товар нельзя отправить в выбранный магазин.',
    INDUSTRY_NO_WORK: 'Сейчас для этой профессии нет доступной работы.',
    INDUSTRY_WORK_BUSY: 'Эту операцию уже выполняет другой игрок.',
    INDUSTRY_TASK_ACTIVE: 'У вас уже есть активное рабочее задание.',
    INDUSTRY_TASK_EXPIRED: 'Рабочее задание уже недействительно.',
    INDUSTRY_BATCH_NOT_FOUND: 'Производственная партия не найдена.',
    INDUSTRY_CASH_NOT_ENOUGH: 'В бюджете завода недостаточно денег на оплату работы.',
    LOGISTICS_HUB_REQUIRED: 'Нужен действующий логистический центр.',
    BUSINESS_CASH_NOT_ENOUGH: 'На счёте бизнеса недостаточно денег.',
    INDUSTRY_MIGRATION_REQUIRED: 'Примените последнюю SQL-миграцию промышленной системы.',
  };
  return Object.entries(map).find(([key]) => raw.includes(key))?.[1] || raw;
}
