import { supabase } from '../supabaseClient.js';

const BANK_FUNCTION = 'bank';

function getTelegramInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

function requestId(prefix = 'bank') {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${uuid}`.replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 128);
}

async function callBank(action, payload = {}) {
  const initData = getTelegramInitData();
  if (!initData) throw new Error('BANK_TELEGRAM_SESSION_REQUIRED');

  const { data, error } = await supabase.functions.invoke(BANK_FUNCTION, {
    body: { initData, action, ...payload },
  });

  if (error) {
    const message = data?.error || error?.message || 'BANK_REQUEST_FAILED';
    throw new Error(message);
  }
  if (!data?.ok) throw new Error(data?.error || 'BANK_REQUEST_FAILED');
  return data.result;
}

export const bankSnapshot = () => callBank('snapshot');
export const bankOpenAccount = (accountType) => callBank('open_account', { accountType });
export const bankStatement = (limit = 50, before = null) => callBank('statement', { limit, before });
export const bankLookupRecipient = (recipientAccountId) => callBank('recipient_lookup', { recipientAccountId });
export const bankTransferPlayer = (recipientAccountId, amount) => callBank('transfer_player', {
  recipientAccountId,
  amount,
  requestId: requestId('player-transfer'),
});
export const bankSalaryToDebit = (amount) => callBank('salary_to_debit', {
  amount,
  requestId: requestId('salary-debit'),
});
export const bankDepositTopup = (amount) => callBank('deposit_topup', {
  amount,
  requestId: requestId('deposit-topup'),
});
export const bankDepositWithdraw = (amount) => callBank('deposit_withdraw', {
  amount,
  requestId: requestId('deposit-withdraw'),
});
