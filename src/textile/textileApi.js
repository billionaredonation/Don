import { supabase } from '../supabaseClient.js';

const FUNCTION_NAME = 'industry-factory';
const initData = () => String(window.Telegram?.WebApp?.initData || '').trim();

async function normalizeError(error) {
  const source = error?.context || error;
  let remote = '';
  if (typeof source?.clone === 'function') {
    try { const body = await source.clone().json(); remote = [body?.error, body?.message, body?.reason].filter(Boolean).join(' '); } catch {}
  }
  return new Error([remote, error?.message, error?.details, source?.message].filter(Boolean).join(' ') || 'TEXTILE_REQUEST_FAILED');
}

export function getTextileError(error) {
  const raw = String(error?.message || error || 'TEXTILE_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.', TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела.',
    TEXTILE_DATABASE_MIGRATION_REQUIRED: 'Примените SQL-миграцию текстильной цепочки.',
    INDUSTRY_FACTORY_NOT_FOUND: 'Швейный завод не найден.', INDUSTRY_OWNER_REQUIRED: 'Действие доступно владельцу завода.',
    INDUSTRY_RECIPE_INVALID: 'Такая рецептура не зарегистрирована.', INDUSTRY_RAW_NOT_ENOUGH: 'На складе не хватает льна или хлопка.',
    INDUSTRY_PRODUCT_NOT_ENOUGH: 'На складе недостаточно готовой одежды.', PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег.',
    TEXTILE_ITEM_NOT_OWNED: 'Сначала купите эту вещь в магазине одежды и аксессуаров.',
  };
  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

export async function invokeTextileAction(action, payload = {}) {
  const telegramData = initData();
  if (!telegramData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: { initData: telegramData, action, industryId: 'textile', ...payload } });
  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'TEXTILE_REQUEST_FAILED');
  return data.result;
}

export const loadTextileSnapshot = (factoryId, cityId) => invokeTextileAction('snapshot', { factoryId, cityId });
export const purchaseTextileFactory = (factoryId, cityId) => invokeTextileAction('purchase', { factoryId, cityId, legalForm: 'tov' });
export const depositTextileCash = (factoryId, cityId, amount) => invokeTextileAction('deposit', { factoryId, cityId, amount });
export const withdrawTextileCash = (factoryId, cityId, amount) => invokeTextileAction('withdraw', { factoryId, cityId, amount });
export const transferTextileRaw = (factoryId, cityId, itemType, quantity) => invokeTextileAction('raw_transfer', { factoryId, cityId, itemType, quantity });
export const createTextileBatch = (factoryId, cityId, recipeId) => invokeTextileAction('batch_start', { factoryId, cityId, recipeId });
export const finishTextileBatch = (factoryId, cityId, batchId) => invokeTextileAction('batch_finish', { factoryId, cityId, batchId });
export const publishTextileOffer = (factoryId, cityId, productType, quantity, unitPrice) => invokeTextileAction('exchange_offer_create', { factoryId, cityId, productType, quantity, unitPrice });
export const loadTextileRawMarket = () => invokeTextileAction('raw_market');
export const sellFarmRawToTextile = (factoryId, cityId, itemType, quantity) => invokeTextileAction('raw_sell', { factoryId, cityId, itemType, quantity });
export const loadTextileExchange = () => invokeTextileAction('exchange_snapshot');
export const createTextileStoreRequest = (payload) => invokeTextileAction('exchange_request_create', payload);
export const acceptTextileStoreRequest = (requestId, factoryId, cityId) => invokeTextileAction('exchange_request_accept', { requestId, factoryId, cityId });
export const buyTextileOffer = (offerId, businessId) => invokeTextileAction('exchange_offer_buy', { offerId, businessId });
export const loadTextileWardrobe = () => invokeTextileAction('wardrobe_snapshot');
export const setTextileWardrobeItem = (itemType, color, equipped) => invokeTextileAction('wardrobe_set', { itemType, color, equipped });
