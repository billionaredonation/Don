import { supabase } from '../supabaseClient.js';

const BUSINESS_FUNCTION_NAME = 'business-store';

function telegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function normalizeError(error, fallback = 'BUSINESS_REQUEST_FAILED') {
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

export function getBusinessUserErrorMessage(error) {
  const raw = String(error?.message || error || 'BUSINESS_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите мини-приложение.',
    BUSINESS_DATABASE_MIGRATION_REQUIRED: 'Сначала примените SQL-миграцию бизнеса, затем обновите Edge Function business-store.',
    BUSINESS_NOT_FOUND: 'Магазин не найден.',
    BUSINESS_TYPE_UNSUPPORTED: 'Для этого типа бизнеса интерьер пока не готов.',
    BUSINESS_ALREADY_OWNED: 'Этот бизнес уже куплен.',
    BUSINESS_NOT_OWNED: 'У бизнеса ещё нет владельца.',
    BUSINESS_ACCESS_DENIED: 'У вас нет доступа к этому действию.',
    BUSINESS_OWNER_REQUIRED: 'Действие доступно только владельцу.',
    BUSINESS_ACCOUNTING_ACCESS_REQUIRED: 'Декларацию может сдать владелец или бухгалтер.',
    BUSINESS_SHELF_ACCESS_REQUIRED: 'Полки может менять владелец или сотрудник по расстановке.',
    BUSINESS_TOO_FAR: 'Подойдите ближе к магазину.',
    NOT_ENOUGH_MONEY: 'Недостаточно денег.',
    BUSINESS_CART_EMPTY: 'Корзина пуста.',
    BUSINESS_STOCK_NOT_ENOUGH: 'Товара на полке уже не хватает.',
    BUSINESS_WAREHOUSE_STOCK_NOT_ENOUGH: 'На складе недостаточно этого товара для выкладки.',
    BUSINESS_SHELF_EMPTY: 'На этой полке пока нет товара.',
    BUSINESS_PRICE_INVALID: 'Укажите корректную цену.',
    BUSINESS_STOCK_INVALID: 'Укажите корректное количество товара.',
    BUSINESS_SUPPLIER_INVALID: 'Выберите доступного поставщика.',
    BUSINESS_PROCUREMENT_QUANTITY_INVALID: 'Укажите корректное количество для закупки.',
    BUSINESS_PROCUREMENT_PRICE_INVALID: 'Укажите корректную закупочную цену за единицу.',
    BUSINESS_PROCUREMENT_BUDGET_INVALID: 'Укажите корректный бюджет закупки.',
    BUSINESS_PROCUREMENT_BUDGET_LOW: 'Выделенного бюджета не хватает на указанное количество товара.',
    BUSINESS_PROFIT_AMOUNT_INVALID: 'Укажите корректную сумму для снятия.',
    BUSINESS_PROFIT_NOT_ENOUGH: 'На счёте бизнеса недостаточно денег.',
    BUSINESS_EMPLOYEE_NOT_FOUND: 'Игрок не найден.',
    BUSINESS_EMPLOYEE_ROLE_INVALID: 'Выберите корректную должность.',
    BUSINESS_SELF_EMPLOYMENT_INVALID: 'Владельца не нужно добавлять в сотрудники.',
    BUSINESS_TAX_GROUP_INVALID: 'Для выбранной юридической формы этот налоговый режим недоступен.',
    BUSINESS_TAX_ADMIN_CONFIGURED: 'Юридическая форма и налоговый режим назначены администрацией.',
    BUSINESS_TAX_GROUP_LOCKED: 'Нельзя менять группу при обороте или налоговой задолженности.',
    BUSINESS_DECLARATION_NOT_DUE: 'Декларация откроется за сутки до недельного срока.',
    BUSINESS_DEBT_MUST_BE_PAID: 'Сначала закройте налоговую задолженность и штрафы.',
    BUSINESS_TRANSFER_PLAYER_OFFLINE: 'Покупатель должен быть онлайн.',
    BUSINESS_TRANSFER_SELF: 'Нельзя передать бизнес самому себе.',
    BUSINESS_TRANSFER_NOT_READY: 'Подождите 10 секунд перед подтверждением.',
    BUSINESS_TRANSFER_EXPIRED: 'Срок предложения истёк.',
    BUSINESS_OWNER_CHANGED: 'Сделка отменена: владелец бизнеса изменился.',
    BUSINESS_ADMIN_REQUIRED: 'Штраф может назначить только администратор.',
  };
  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

export async function invokeBusinessAction(action, payload = {}) {
  const initData = telegramInitData();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke(BUSINESS_FUNCTION_NAME, {
    body: { initData, action, ...payload },
  });
  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'BUSINESS_REQUEST_FAILED');
  return data.result;
}

export const loadBusinessSnapshot = (businessId) => invokeBusinessAction('snapshot', { businessId });
export const purchaseBusiness = (businessId) => invokeBusinessAction('purchase', { businessId });
export const updateBusinessShelf = (payload) => invokeBusinessAction('set_shelf', payload);
export const addBusinessCartItem = (payload) => invokeBusinessAction('cart_add', payload);
export const removeBusinessCartItem = (payload) => invokeBusinessAction('cart_remove', payload);
export const checkoutBusinessCart = (businessId) => invokeBusinessAction('checkout', { businessId });
export const updateBusinessEmployee = (payload) => invokeBusinessAction('employee_upsert', payload);
export const removeBusinessEmployee = (payload) => invokeBusinessAction('employee_remove', payload);
export const saveBusinessProcurementPlan = (payload) => invokeBusinessAction('set_procurement', payload);
export const deleteBusinessProcurementPlan = (payload) => invokeBusinessAction('delete_procurement', payload);
export const withdrawBusinessProfit = (payload) => invokeBusinessAction('withdraw_profit', payload);
export const submitBusinessDeclaration = (businessId) => invokeBusinessAction('declaration', { businessId });
export const updateBusinessTaxGroup = ({ businessId, taxGroup }) => invokeBusinessAction('tax_group', { businessId, taxGroup });
export const findBusinessTransferPlayer = (target) => invokeBusinessAction('find_transfer_player', { target });
export const createBusinessTransfer = (payload) => invokeBusinessAction('create_transfer', payload);
export const loadPendingBusinessTransfer = () => invokeBusinessAction('pending_transfer');
export const acceptBusinessTransfer = (offerId) => invokeBusinessAction('accept_transfer', { offerId });
export const rejectBusinessTransfer = (offerId) => invokeBusinessAction('reject_transfer', { offerId });
export const loadBusinessInventory = () => invokeBusinessAction('inventory');
export const useBusinessInventoryItem = (itemType) => invokeBusinessAction('use_item', { itemType });
export const fineBusiness = (payload) => invokeBusinessAction('fine', payload);
