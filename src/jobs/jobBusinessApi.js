import { supabase } from '../supabaseClient.js';

const JOB_BUSINESS_FUNCTION_NAME = 'job-business';

function telegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function normalizeError(error, fallback = 'JOB_BUSINESS_REQUEST_FAILED') {
  const source = error?.context || error;
  let responseMessage = '';
  if (typeof source?.clone === 'function') {
    try {
      const payload = await source.clone().json();
      responseMessage = [payload?.error, payload?.message, payload?.reason].filter(Boolean).join(' ');
    } catch {}
  }
  const message = [responseMessage, error?.message, error?.details, error?.hint, source?.message]
    .filter(Boolean).join(' ');
  return new Error(message || fallback);
}

export function getJobBusinessUserErrorMessage(error) {
  const raw = String(error?.message || error || 'JOB_BUSINESS_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите мини-приложение.',
    SERVER_NOT_CONFIGURED: 'Сервер производственного бизнеса не настроен.',
    JOB_BUSINESS_DATABASE_MIGRATION_REQUIRED: 'Примените SQL-миграцию производственных бизнесов и задеплойте Edge Function job-business.',
    JOB_BUSINESS_NOT_FOUND: 'Предприятие не найдено.',
    JOB_BUSINESS_STATION_INVALID: 'Эта рабочая точка не может быть куплена как предприятие.',
    JOB_BUSINESS_ALREADY_OWNED: 'У этого предприятия уже есть владелец.',
    JOB_BUSINESS_NOT_OWNED: 'Предприятие пока принадлежит государству.',
    JOB_BUSINESS_OWNER_REQUIRED: 'Действие доступно только владельцу предприятия.',
    JOB_BUSINESS_AMOUNT_INVALID: 'Введите корректную сумму.',
    JOB_BUSINESS_CASH_NOT_ENOUGH: 'На балансе предприятия недостаточно денег для этой выплаты.',
    JOB_BUSINESS_WAREHOUSE_FULL: 'Склад предприятия заполнен. Владелец должен освободить место.',
    JOB_BUSINESS_ASSISTANT_NOT_FOUND: 'Игрок для должности помощника не найден.',
    JOB_BUSINESS_SELF_ASSISTANT: 'Владельца нельзя назначить своим помощником.',
    JOB_BUSINESS_RESERVATION_INVALID: 'Платёж предприятия уже завершён или устарел.',
    PLAYER_NOT_FOUND: 'Игрок не найден.',
    PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег.',
  };
  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

export async function invokeJobBusinessAction(action, payload = {}) {
  const initData = telegramInitData();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke(JOB_BUSINESS_FUNCTION_NAME, {
    body: { initData, action, ...payload },
  });
  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'JOB_BUSINESS_REQUEST_FAILED');
  return data.result;
}

export const loadJobBusinessSnapshot = ({ businessId, cityId, jobType }) => invokeJobBusinessAction('snapshot', { businessId, cityId, jobType });
export const purchaseJobBusiness = ({ businessId, cityId, jobType }) => invokeJobBusinessAction('purchase', { businessId, cityId, jobType });
export const depositJobBusiness = ({ businessId, cityId, jobType, amount }) => invokeJobBusinessAction('deposit', { businessId, cityId, jobType, amount });
export const withdrawJobBusiness = ({ businessId, cityId, jobType, amount }) => invokeJobBusinessAction('withdraw', { businessId, cityId, jobType, amount });
export const setJobBusinessAssistant = ({ businessId, cityId, jobType, target }) => invokeJobBusinessAction('assistant_set', { businessId, cityId, jobType, target });
export const reserveJobBusinessPayout = ({ businessId, cityId, jobType, itemType, quantity, amount }) => invokeJobBusinessAction('reserve_payout', { businessId, cityId, jobType, itemType, quantity, amount });
export const commitJobBusinessPayout = ({ businessId, cityId, jobType, reservationId, quantity, amount }) => invokeJobBusinessAction('commit_payout', { businessId, cityId, jobType, reservationId, quantity, amount });
export const refundJobBusinessPayout = ({ businessId, cityId, jobType, reservationId }) => invokeJobBusinessAction('refund_payout', { businessId, cityId, jobType, reservationId });
