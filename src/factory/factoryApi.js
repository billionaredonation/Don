import { supabase } from '../supabaseClient.js';

function initData() { return String(window.Telegram?.WebApp?.initData || '').trim(); }
async function invoke(action, payload = {}) {
  const telegramData = initData();
  if (!telegramData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke('fruit-factory', { body: { initData: telegramData, action, ...payload } });
  if (error) {
    let details = '';
    try { details = (await error.context?.clone?.().json())?.error || ''; } catch {}
    throw new Error(details || error.message || 'FACTORY_REQUEST_FAILED');
  }
  if (!data?.ok) throw new Error(data?.error || 'FACTORY_REQUEST_FAILED');
  return data.result;
}

export const loadFactorySnapshot = (factoryId, cityId) => invoke('snapshot', { factoryId, cityId });
export const purchaseFactory = (factoryId, cityId, legalForm) => invoke('purchase', { factoryId, cityId, legalForm });
export const transferFruitToFactory = (factoryId, cityId, itemType, quantity) => invoke('deliver', { factoryId, cityId, itemType, quantity });
export const startFactoryBatch = (factoryId, cityId, recipeId) => invoke('start_batch', { factoryId, cityId, recipeId });
export const finishFactoryBatch = (factoryId, cityId, batchId) => invoke('finish_batch', { factoryId, cityId, batchId });
export const depositFactory = (factoryId, cityId, amount) => invoke('deposit', { factoryId, cityId, amount });
export const withdrawFactory = (factoryId, cityId, amount) => invoke('withdraw', { factoryId, cityId, amount });
export const setFactoryStaff = (factoryId, cityId, target, role) => invoke('staff_set', { factoryId, cityId, target, role });
export const removeFactoryStaff = (factoryId, cityId, target) => invoke('staff_remove', { factoryId, cityId, target });

export function getFactoryError(error) {
  const raw = String(error?.message || error || 'FACTORY_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.', TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела.',
    FACTORY_DATABASE_MIGRATION_REQUIRED: 'Примените SQL-миграцию завода и задеплойте Edge Function fruit-factory.',
    FACTORY_NOT_FOUND: 'Завод не найден.', FACTORY_ALREADY_OWNED: 'У завода уже есть владелец.',
    FACTORY_OWNER_REQUIRED: 'Действие доступно только владельцу.', FACTORY_STAFF_REQUIRED: 'Нужна должность на этом заводе.',
    FACTORY_RAW_NOT_ENOUGH: 'На сырьевом складе недостаточно фруктов.', FACTORY_PRODUCT_WAREHOUSE_FULL: 'Склад готовой продукции заполнен.',
    FACTORY_BUSY: 'Производственная линия уже занята.', FACTORY_BATCH_NOT_READY: 'Партия ещё перерабатывается.',
    PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег.', FACTORY_CASH_NOT_ENOUGH: 'В бюджете завода недостаточно денег на зарплату.',
    FACTORY_INVENTORY_NOT_ENOUGH: 'В инвентаре недостаточно фруктов.', FACTORY_AMOUNT_INVALID: 'Введите корректное количество.',
  };
  const key = Object.keys(messages).find((code) => raw.includes(code));
  return key ? messages[key] : raw;
}
