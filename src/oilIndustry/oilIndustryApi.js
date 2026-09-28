import { supabase } from '../supabaseClient.js';
export async function oilRequest(id, cityId, action = 'snapshot', data = {}, requestId) {
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) throw new Error('Откройте игру через Telegram.');
  const { data: response, error } = await supabase.functions.invoke('oil-industry', { body: { initData, id, cityId, action, data, requestId } });
  if (error) {
    let message = error.message;
    try { message = (await error.context.clone().json()).error || message; } catch {}
    throw new Error(message);
  }
  if (!response?.ok) throw new Error(response?.error || 'Не удалось получить ответ предприятия.');
  return response.result;
}
const errors = {
  AUTO_HUB: 'Выберите купленный логистический центр.', AUTO_INVALID: 'Выберите перевозчика и оплату водителю от 10 ₴.', AUTO_FUNDS: 'Не хватает денег на счёте для оплаты перевозки.', AUTO_DRIVER_DELIVERY_REQUIRED: 'Партия закреплена за перевозчиком. Её должен доставить водитель.',
  OIL_NOT_FOUND: 'Объект не найден. Проверьте его тип и город.', OIL_OWNER_REQUIRED: 'Действие доступно владельцу предприятия.',
  OIL_ALREADY_OWNED: 'Предприятие уже куплено.', PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег на личном балансе.',
  OIL_CASH_LOW: 'Недостаточно денег на счёте предприятия. Пополните его в разделе «Управление».',
  OIL_EQUIPMENT_REQUIRED: 'Сначала купите оборудование.', OIL_EQUIPMENT_OWNED: 'Оборудование уже установлено.',
  OIL_MAINTENANCE_REQUIRED: 'Оборудование остановлено: требуется ручное обслуживание.', OIL_MAINTENANCE_NOT_DUE: 'Обслуживание пока не требуется.',
  OIL_BATCH_BUSY: 'Дождитесь завершения текущей партии.', OIL_STOCK_LOW: 'На складе недостаточно сырья или топлива.',
  OIL_STORAGE_FULL: 'Недостаточно места с учётом партий в пути и переработки.', OIL_PRICE_CHANGED: 'Цена изменилась. Обновите список и подтвердите новую цену.',
  OIL_SUPPLIER_CLOSED: 'Поставщик отключил продажи или ещё не установил оборудование.', OIL_STATION_CLOSED: 'АЗС закрыта для продажи топлива.',
  OIL_DELIVERY_NOT_READY: 'Партия ещё в пути. Доставка доступна через минуту после закупки.', OIL_ALREADY_DELIVERED: 'Партия уже принята на склад.',
  OIL_PLAYER_FUEL_FULL: 'Личный запас топлива заполнен: максимум 200 л бензина и дизеля вместе.',
  OIL_SERVICE_VOLUME_LIMIT: 'Уменьшите объём: остатка ресурса колонок не хватает на всю покупку.',
  OIL_MIN_CRUDE_20: 'Минимальная закупка нефти — 20 л.',
  OIL_AMOUNT_INVALID: 'Введите допустимое количество или сумму.', OIL_PRICE_INVALID: 'Цена должна быть от 0,01 до 1 000 000 ₴, максимум две цифры после запятой.',
  OIL_ROUTE_INVALID: 'Нефть поставляется на НПЗ, готовое топливо — на АЗС.',
  OIL_REQUEST_REUSED: 'Запрос уже использован для другого действия.', TELEGRAM_SESSION_INVALID: 'Перезапустите игру через Telegram.',
};
export const oilError = error => Object.entries(errors).find(([code]) => String(error?.message).includes(code))?.[1] || String(error?.message || error);
