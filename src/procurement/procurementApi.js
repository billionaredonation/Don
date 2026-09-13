import { supabase } from '../supabaseClient.js';

const FUNCTION_NAME = 'procurement-market';
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
  return new Error([remote, error?.message, error?.details, source?.message].filter(Boolean).join(' ') || 'PROCUREMENT_REQUEST_FAILED');
}

export function getProcurementError(error) {
  const raw = String(error?.message || error || 'PROCUREMENT_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите игру.',
    PROCUREMENT_DATABASE_MIGRATION_REQUIRED: 'Сначала примените SQL-миграцию единого скупа и разверните функцию procurement-market.',
    PROCUREMENT_OWNER_REQUIRED: 'Управлять скупом может только владелец.',
    PROCUREMENT_BUDGET_INVALID: 'Укажите бюджет от 0 ₴.',
    PROCUREMENT_BUDGET_ABOVE_CASH: 'Нельзя выделить на скуп больше денег, чем есть на счёте бизнеса.',
    PROCUREMENT_BUDGET_NOT_ENOUGH: 'У покупателя закончился выделенный бюджет скупа.',
    PROCUREMENT_BUDGET_RESERVED: 'Эта сумма оставлена на закупку сырья. Сначала уменьшите бюджет скупа.',
    PROCUREMENT_PRICE_INVALID: 'Укажите цену закупки больше 0 ₴.',
    PROCUREMENT_ITEM_NOT_IN_RECIPES: 'Этот ресурс не используется в рецептах данного завода.',
    PROCUREMENT_ITEM_DISABLED: 'Завод отключил закупку этого сырья.',
    PROCUREMENT_OFFER_NOT_FOUND: 'Предложение уже недоступно. Обновите рынок.',
  };
  const code = Object.keys(messages).find(key => raw.includes(key));
  return code ? messages[code] : raw;
}

async function invoke(action, payload = {}) {
  const telegramData = initData();
  if (!telegramData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: { initData: telegramData, action, ...payload } });
  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || 'PROCUREMENT_REQUEST_FAILED');
  return data.result;
}

export const loadProcurementSnapshot = payload => invoke('snapshot', payload);
export const setProcurementBudget = payload => invoke('set_budget', payload);
export const setProcurementItem = payload => invoke('set_item', payload);
export const loadProcurementMarket = () => invoke('market');
export const sellToProcurementBuyer = payload => invoke('sell', payload);
