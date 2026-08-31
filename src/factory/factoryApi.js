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
export const transferFarmRawToFactory = (factoryId, cityId, itemType, quantity) => invoke('deliver', { factoryId, cityId, itemType, quantity });
export const transferFruitToFactory = transferFarmRawToFactory;
export const startFactoryBatch = (factoryId, cityId, recipeId, ingredientType = '') => invoke('start_batch', { factoryId, cityId, recipeId, ingredientType });
export const cookFactoryBatch = (factoryId, cityId, batchId) => invoke('cook_batch', { factoryId, cityId, batchId });
export const finishFactoryBatch = (factoryId, cityId, batchId) => invoke('finish_batch', { factoryId, cityId, batchId });
export const depositFactory = (factoryId, cityId, amount) => invoke('deposit', { factoryId, cityId, amount });
export const withdrawFactory = (factoryId, cityId, amount) => invoke('withdraw', { factoryId, cityId, amount });
export const setFactoryStaff = (factoryId, cityId, target, role) => invoke('staff_set', { factoryId, cityId, target, role });
export const removeFactoryStaff = (factoryId, cityId, target) => invoke('staff_remove', { factoryId, cityId, target });
export const loadFactorySuppliers = (businessId, cityId) => invoke('store_suppliers', { businessId, cityId });
export const orderFactorySupply = (payload) => invoke('store_order', payload);
export const receiveFactorySupply = (payload) => invoke('store_receive', payload);
export const setFactoryWholesalePrice = (factoryId, cityId, productType, unitPrice) => invoke('wholesale_price', { factoryId, cityId, productType, unitPrice });
export const createFactoryRawContract = (payload) => invoke('raw_contract_create', payload);
export const respondFactoryRawContract = (factoryId, cityId, contractId, decision) => invoke('raw_contract_respond', { factoryId, cityId, contractId, decision });
export const deliverFactoryRawContract = (factoryId, cityId, contractId, quantity) => invoke('raw_contract_deliver', { factoryId, cityId, contractId, quantity });
export const loadRawMarket = () => invoke('raw_market_snapshot');
export const sellToFactory = (factoryId, cityId, itemType, quantity) => invoke('raw_market_sell', { factoryId, cityId, itemType, quantity });
export const loadProductionExchange = () => invoke('exchange_snapshot');
export const createFactoryOffer = (payload) => invoke('exchange_factory_offer', payload);
export const createStoreRequest = (payload) => invoke('exchange_store_request', payload);
export const acceptStoreRequest = (requestId, factoryId, cityId) => invoke('exchange_request_accept', { requestId, factoryId, cityId });
export const buyFactoryOffer = (offerId, businessId) => invoke('exchange_offer_buy', { offerId, businessId });
export const setFactoryProductionWage = (factoryId, cityId, productType, wage) => invoke('production_wage', { factoryId, cityId, productType, wage });
export const loadDeliveryCargo = () => invoke('delivery_cargo');
export const loadFactoryProductToVehicle = (factoryId, cityId, productType, quantity) => invoke('vehicle_load', { factoryId, cityId, productType, quantity });
export const unloadVehicleToStore = (businessId, cityId, productType, quantity) => invoke('vehicle_unload', { businessId, cityId, productType, quantity });

export function getFactoryError(error) {
  const raw = String(error?.message || error || 'FACTORY_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.', TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела.',
    FACTORY_DATABASE_MIGRATION_REQUIRED: 'Примените SQL-миграцию завода и задеплойте Edge Function fruit-factory.',
    FACTORY_NOT_FOUND: 'Завод не найден.', FACTORY_ALREADY_OWNED: 'У завода уже есть владелец.',
    FACTORY_OWNER_REQUIRED: 'Действие доступно только владельцу.', FACTORY_STAFF_REQUIRED: 'Нужна должность на этом заводе.',
    FACTORY_RAW_NOT_ENOUGH: 'На сырьевом складе недостаточно сырья.', FACTORY_PRODUCT_WAREHOUSE_FULL: 'Склад готовой продукции заполнен.',
    FACTORY_BUSY: 'Производственная линия уже занята.', FACTORY_BATCH_NOT_READY: 'Партия ещё перерабатывается.',
    FACTORY_LOADER_REQUIRED: 'Начать цепочку может грузчик.', FACTORY_COOK_REQUIRED: 'Этот этап выполняет повар.',
    FACTORY_PACKER_REQUIRED: 'Этот этап выполняет упаковщик.', FACTORY_BATCH_STAGE_INVALID: 'Для партии сейчас требуется другой этап работы.',
    FACTORY_FRUIT_REQUIRED: 'Выберите фрукт или ягоду для рецепта.',
    PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег.', FACTORY_CASH_NOT_ENOUGH: 'В бюджете завода недостаточно денег на зарплату.',
    FACTORY_INVENTORY_NOT_ENOUGH: 'В инвентаре недостаточно сырья с фермы.', FACTORY_AMOUNT_INVALID: 'Введите корректное количество.',
    FACTORY_PRICE_TOO_LOW: 'Завод отклонил цену: предложение ниже его оптовой цены.', FACTORY_PRODUCT_NOT_ENOUGH: 'На заводе недостаточно готового товара.',
    FACTORY_STORE_OWNER_REQUIRED: 'Закупку может оформить только владелец магазина.', FACTORY_DELIVERY_NOT_READY: 'Машина ещё в пути.',
    FACTORY_STORE_ACCOUNT_LOW: 'На счёте магазина недостаточно денег.', FACTORY_STORE_WAREHOUSE_ADAPTER_REQUIRED: 'Склад магазина использует неизвестную серверу схему. Обновите интеграционную миграцию.',
    FACTORY_CONTRACT_TARGET_NOT_FOUND: 'Поставщик или ферма не найдены.', FACTORY_CONTRACT_OWNER_REQUIRED: 'Договор закупки создаёт только владелец завода.',
    FACTORY_CONTRACT_SUPPLIER_REQUIRED: 'Это предложение предназначено другому поставщику.', FACTORY_CONTRACT_NOT_ACTIVE: 'Договор ещё не принят или уже закрыт.',
    FACTORY_CONTRACT_QUALITY_LOW: 'Партия не соответствует требованиям договора.', FACTORY_CONTRACT_EXPIRED: 'Срок предложения истёк.',
    FARM_FACTORY_TRANSFER_ADAPTER_REQUIRED: 'Сервер пока не смог связать склад фермы с заводом. Примените SQL-хотфикс адаптера склада.',
  };
  const key = Object.keys(messages).find((code) => raw.includes(code));
  return key ? messages[key] : raw;
}
