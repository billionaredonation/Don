import { supabase } from '../supabaseClient.js';
const FUNCTION_NAME = 'tool-assembly-work';
const initData = () => String(window.Telegram?.WebApp?.initData || '').trim();
async function normalizeError(error) {
  const source = error?.context || error; let remote = '';
  if (typeof source?.clone === 'function') { try { const body = await source.clone().json(); remote = [body?.error, body?.message, body?.reason].filter(Boolean).join(' '); } catch {} }
  return new Error([remote, error?.message, error?.details, source?.message].filter(Boolean).join(' ') || 'TOOL_ASSEMBLY_REQUEST_FAILED');
}
export function getToolAssemblyError(error) {
  const raw = String(error?.message || error || 'TOOL_ASSEMBLY_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.', TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите игру.',
    SERVER_NOT_CONFIGURED: 'Сервер сборки инструментов не настроен.', TOOL_ASSEMBLY_DATABASE_MIGRATION_REQUIRED: 'Примените SQL-миграцию завода инструментов.',
    TOOL_FACTORY_NOT_FOUND: 'Завод по сборке инструментов не найден.', TOOL_FACTORY_ALREADY_OWNED: 'У этого завода уже есть владелец.',
    TOOL_FACTORY_DESTINATION_NOT_FOUND: 'В этом городе пока нет купленного завода по сборке инструментов.', CONSTRUCTION_STORE_DESTINATION_NOT_FOUND: 'В этом городе пока нет купленного магазина стройматериалов.', TOOL_OWNER_REQUIRED: 'Действие доступно только владельцу завода.',
    TOOL_RECIPE_INVALID: 'Такая технологическая карта не найдена.', TOOL_INPUT_NOT_ENOUGH: 'На складе недостаточно деталей для сборки.',
    TOOL_PRODUCT_INVALID: 'Такого инструмента на складе нет.', TOOL_PRODUCT_NOT_ENOUGH: 'На складе недостаточно готовых инструментов.',
    TOOL_DESTINATION_INVALID: 'Этот инструмент нельзя отправить в выбранное место.', TOOL_CASH_NOT_ENOUGH: 'На балансе завода недостаточно денег.',
    TOOL_AMOUNT_INVALID: 'Введите корректное количество.', PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег.', PLAYER_NOT_FOUND: 'Игрок не найден.',
  };
  const code = Object.keys(messages).find((key) => raw.includes(key)); return code ? messages[code] : raw;
}
export async function invokeToolAssemblyAction(action, payload = {}) {
  const telegramData = initData(); if (!telegramData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: { initData: telegramData, action, ...payload } });
  if (error) throw await normalizeError(error); if (!data?.ok) throw new Error(data?.error || data?.reason || 'TOOL_ASSEMBLY_REQUEST_FAILED'); return data.result;
}
export const loadToolAssemblySnapshot = (factoryId, cityId) => invokeToolAssemblyAction('snapshot', { factoryId, cityId });
export const purchaseToolAssemblyFactory = (factoryId, cityId) => invokeToolAssemblyAction('purchase', { factoryId, cityId });
export const produceToolAssemblyBatch = (factoryId, cityId, recipeId, batches = 1) => invokeToolAssemblyAction('produce', { factoryId, cityId, recipeId, batches });
export const depositToolAssemblyCash = (factoryId, cityId, amount) => invokeToolAssemblyAction('deposit', { factoryId, cityId, amount });
export const withdrawToolAssemblyCash = (factoryId, cityId, amount) => invokeToolAssemblyAction('withdraw', { factoryId, cityId, amount });
export const dispatchToolAssemblyProduct = (factoryId, cityId, productType, quantity, destination) => invokeToolAssemblyAction('dispatch', { factoryId, cityId, productType, quantity, destination });

