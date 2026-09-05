import { supabase } from '../supabaseClient.js';

const FUNCTION_NAME = 'metallurgy-work';

function telegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function normalizeError(error, fallback = 'METALLURGY_REQUEST_FAILED') {
  const source = error?.context || error;
  let responseMessage = '';
  if (typeof source?.clone === 'function') {
    try {
      const payload = await source.clone().json();
      responseMessage = [payload?.error, payload?.message, payload?.reason].filter(Boolean).join(' ');
    } catch {}
  }
  return new Error([responseMessage, error?.message, error?.details, source?.message].filter(Boolean).join(' ') || fallback);
}

export function getMetallurgyError(error) {
  const raw = String(error?.message || error || 'METALLURGY_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите игру.',
    SERVER_NOT_CONFIGURED: 'Сервер металлургии не настроен.',
    METALLURGY_DATABASE_MIGRATION_REQUIRED: 'Сначала примените SQL-миграцию металлургии.',
    METALLURGY_FACTORY_NOT_FOUND: 'Металлургический завод не найден.',
    METALLURGY_FACTORY_ALREADY_OWNED: 'У этого завода уже есть владелец.',
    METALLURGY_OWNER_REQUIRED: 'Производством может управлять только владелец завода.',
    METALLURGY_RECIPE_INVALID: 'Такой технологической карты нет.',
    METALLURGY_PRODUCT_INVALID: 'Такого компонента на складе нет.',
    METALLURGY_DESTINATION_INVALID: 'Этот компонент нельзя отправить в выбранное место.',
    METALLURGY_PRODUCT_NOT_ENOUGH: 'На складе недостаточно готовых компонентов.',
    METALLURGY_RAW_NOT_ENOUGH: 'На сырьевом складе недостаточно ресурсов для этой партии.',
    PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег для покупки завода.',
    METALLURGY_CASH_NOT_ENOUGH: 'На балансе завода недостаточно денег.',
    METALLURGY_AMOUNT_INVALID: 'Введите корректную сумму.',
  };
  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

export async function invokeMetallurgyAction(action, payload = {}) {
  const initData = telegramInitData();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { initData, action, ...payload },
  });
  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'METALLURGY_REQUEST_FAILED');
  return data.result;
}

export const loadMetallurgySnapshot = (factoryId, cityId) => invokeMetallurgyAction('snapshot', { factoryId, cityId });
export const purchaseMetallurgyFactory = (factoryId, cityId) => invokeMetallurgyAction('purchase', { factoryId, cityId });
export const produceMetallurgyBatch = (factoryId, cityId, recipeId, batches = 1) => invokeMetallurgyAction('produce', { factoryId, cityId, recipeId, batches });
export const depositMetallurgyCash = (factoryId, cityId, amount) => invokeMetallurgyAction('deposit', { factoryId, cityId, amount });
export const withdrawMetallurgyCash = (factoryId, cityId, amount) => invokeMetallurgyAction('withdraw', { factoryId, cityId, amount });
export const dispatchMetallurgyProduct = (factoryId, cityId, productType, quantity, destination) => invokeMetallurgyAction('dispatch', { factoryId, cityId, productType, quantity, destination });
