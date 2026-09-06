import { supabase } from '../supabaseClient.js';

const FUNCTION_NAME = 'wood-processing-work';
const initData = () => String(window.Telegram?.WebApp?.initData || '').trim();

async function normalizeError(error) {
  const source = error?.context || error;
  let remote = '';
  if (typeof source?.clone === 'function') {
    try {
      const payload = await source.clone().json();
      remote = [payload?.error, payload?.message, payload?.reason].filter(Boolean).join(' ');
    } catch {}
  }
  return new Error([remote, error?.message, error?.details, source?.message].filter(Boolean).join(' ') || 'WOOD_PROCESSING_REQUEST_FAILED');
}

export function getWoodProcessingError(error) {
  const raw = String(error?.message || error || 'WOOD_PROCESSING_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите игру.',
    SERVER_NOT_CONFIGURED: 'Сервер деревопереработки не настроен.',
    WOOD_PROCESSING_DATABASE_MIGRATION_REQUIRED: 'Примените SQL-миграцию деревоперерабатывающего завода.',
    WOOD_FACTORY_NOT_FOUND: 'Деревоперерабатывающий завод не найден.',
    WOOD_FACTORY_ALREADY_OWNED: 'У этого завода уже есть владелец.',
    WOOD_FACTORY_NOT_OWNED: 'Государственный завод пока не закупает древесину.',
    WOOD_OWNER_REQUIRED: 'Действие доступно только владельцу завода.',
    WOOD_RECIPE_INVALID: 'Такая технологическая карта не найдена.',
    WOOD_RAW_NOT_ENOUGH: 'На сырьевом складе недостаточно древесины.',
    WOOD_PRODUCT_INVALID: 'Такой детали на складе нет.',
    WOOD_PRODUCT_NOT_ENOUGH: 'На складе недостаточно готовых деталей.',
    WOOD_DESTINATION_INVALID: 'Эту деталь нельзя отправить в выбранное место.',
    WOOD_CASH_NOT_ENOUGH: 'На балансе завода недостаточно денег.',
    WOOD_RAW_WAREHOUSE_FULL: 'Сырьевой склад завода не вместит эту партию.',
    WOOD_LUMBER_ITEM_NOT_ENOUGH: 'В инвентаре недостаточно выбранной древесины.',
    WOOD_LUMBER_INVENTORY_ADAPTER_REQUIRED: 'Обновите SQL-интеграцию лесоруба с заводом.',
    WOOD_AMOUNT_INVALID: 'Введите корректное количество.',
    PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег.',
    PLAYER_NOT_FOUND: 'Игрок не найден.',
  };
  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

export async function invokeWoodProcessingAction(action, payload = {}) {
  const telegramData = initData();
  if (!telegramData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: { initData: telegramData, action, ...payload } });
  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'WOOD_PROCESSING_REQUEST_FAILED');
  return data.result;
}

export const loadWoodProcessingSnapshot = (factoryId, cityId) => invokeWoodProcessingAction('snapshot', { factoryId, cityId });
export const purchaseWoodProcessingFactory = (factoryId, cityId) => invokeWoodProcessingAction('purchase', { factoryId, cityId });
export const produceWoodProcessingBatch = (factoryId, cityId, recipeId, batches = 1) => invokeWoodProcessingAction('produce', { factoryId, cityId, recipeId, batches });
export const depositWoodProcessingCash = (factoryId, cityId, amount) => invokeWoodProcessingAction('deposit', { factoryId, cityId, amount });
export const withdrawWoodProcessingCash = (factoryId, cityId, amount) => invokeWoodProcessingAction('withdraw', { factoryId, cityId, amount });
export const dispatchWoodProcessingProduct = (factoryId, cityId, productType, quantity, destination) => invokeWoodProcessingAction('dispatch', { factoryId, cityId, productType, quantity, destination });
export const loadWoodProcessingRawMarket = () => invokeWoodProcessingAction('raw_market_snapshot');
export const sellLumberToWoodProcessing = (factoryId, cityId, itemType, quantity) => invokeWoodProcessingAction('raw_market_sell', { factoryId, cityId, itemType, quantity });
