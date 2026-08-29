import { supabase } from '../supabaseClient.js';

function initData() { return String(window.Telegram?.WebApp?.initData || '').trim(); }
async function invoke(action, payload = {}) {
  const telegramData = initData();
  if (!telegramData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke('construction-factory', { body: { initData: telegramData, action, ...payload } });
  if (error) {
    let details = '';
    try { details = (await error.context?.clone?.().json())?.error || ''; } catch {}
    throw new Error(details || error.message || 'CONSTRUCTION_REQUEST_FAILED');
  }
  if (!data?.ok) throw new Error(data?.error || 'CONSTRUCTION_REQUEST_FAILED');
  return data.result;
}

export const loadConstructionSnapshot = (factoryId, cityId) => invoke('snapshot', { factoryId, cityId });
export const purchaseConstructionFactory = (factoryId, cityId, legalForm) => invoke('purchase', { factoryId, cityId, legalForm });
export const startConstructionBatch = (factoryId, cityId, recipeId) => invoke('start_batch', { factoryId, cityId, recipeId });
export const finishConstructionBatch = (factoryId, cityId, batchId) => invoke('finish_batch', { factoryId, cityId, batchId });
export const depositConstructionFactory = (factoryId, cityId, amount) => invoke('deposit', { factoryId, cityId, amount });
export const withdrawConstructionFactory = (factoryId, cityId, amount) => invoke('withdraw', { factoryId, cityId, amount });
export const setConstructionWholesalePrice = (factoryId, cityId, productType, unitPrice) => invoke('wholesale_price', { factoryId, cityId, productType, unitPrice });
export const transferLumberToConstructionFactory = (factoryId, cityId, itemType, quantity) => invoke('deliver', { factoryId, cityId, itemType, quantity });
export const sellLumberToConstructionFactory = (factoryId, cityId, itemType, quantity) => invoke('raw_market_sell', { factoryId, cityId, itemType, quantity });
export const loadConstructionRawMarket = (cityId) => invoke('raw_market_snapshot', { cityId });
export const loadConstructionSuppliers = (businessId, cityId) => invoke('store_suppliers', { businessId, cityId });
export const orderConstructionSupply = (payload) => invoke('store_order', payload);
export const receiveConstructionSupply = (payload) => invoke('store_receive', payload);
export const loadConstructionExchange = () => invoke('exchange_snapshot');
export const createConstructionOffer = (payload) => invoke('exchange_factory_offer', payload);
export const createConstructionStoreRequest = (payload) => invoke('exchange_store_request', payload);
export const acceptConstructionStoreRequest = (requestId, factoryId, cityId) => invoke('exchange_request_accept', { requestId, factoryId, cityId });
export const buyConstructionOffer = (offerId, businessId) => invoke('exchange_offer_buy', { offerId, businessId });

export function getConstructionError(error) {
  const raw = String(error?.message || error || 'CONSTRUCTION_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.', TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела.',
    CONSTRUCTION_DATABASE_MIGRATION_REQUIRED: 'Примените SQL-миграцию стройматериалов и задеплойте Edge Function construction-factory.',
    CONSTRUCTION_FACTORY_NOT_FOUND: 'Производство стройматериалов не найдено.', CONSTRUCTION_FACTORY_ALREADY_OWNED: 'У предприятия уже есть владелец.',
    CONSTRUCTION_OWNER_REQUIRED: 'Действие доступно только владельцу.', CONSTRUCTION_RAW_NOT_ENOUGH: 'На сырьевом складе недостаточно древесины.',
    CONSTRUCTION_PRODUCT_WAREHOUSE_FULL: 'Склад готовых стройматериалов заполнен.', CONSTRUCTION_FACTORY_BUSY: 'Производственная линия уже занята.',
    CONSTRUCTION_BATCH_NOT_READY: 'Партия ещё производится.', PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег.',
    CONSTRUCTION_CASH_NOT_ENOUGH: 'В бюджете предприятия недостаточно денег.', LUMBER_INVENTORY_NOT_ENOUGH: 'В инвентаре недостаточно древесины.',
    CONSTRUCTION_STORE_REQUIRED: 'Поставка доступна только инструментальному магазину.', CONSTRUCTION_STORE_ACCOUNT_LOW: 'На счёте магазина недостаточно денег.',
    CONSTRUCTION_PRODUCT_NOT_ENOUGH: 'На складе завода недостаточно готовой продукции.',
  };
  const key = Object.keys(messages).find((code) => raw.includes(code));
  return key ? messages[key] : raw;
}
