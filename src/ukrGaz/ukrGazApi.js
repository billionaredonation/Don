import { supabase } from '../supabaseClient.js';

const initData = () => String(window.Telegram?.WebApp?.initData || '').trim();

async function invoke(action, payload = {}) {
  const telegramData = initData();
  if (!telegramData) throw new Error('TELEGRAM_SESSION_REQUIRED');

  const { data, error } = await supabase.functions.invoke('ukrgaz', {
    body: { initData: telegramData, action, ...payload },
  });

  if (error) {
    let remote = '';
    try { remote = (await error.context?.clone?.().json())?.error || ''; } catch {}
    throw new Error(remote || error.message || 'GAS_REQUEST_FAILED');
  }
  if (!data?.ok) throw new Error(data?.error || 'GAS_REQUEST_FAILED');
  return data.result;
}

export const loadUkrGaz = (plantId, cityId) => invoke('snapshot', { plantId, cityId });
export const buyUkrGaz = (plantId, cityId) => invoke('purchase', { plantId, cityId });
export const buyGasEquipment = (plantId, cityId, equipment) => invoke('purchase_equipment', { plantId, cityId, equipment });
export const startUkrGaz = (plantId, cityId) => invoke('start', { plantId, cityId });
export const stopUkrGaz = (plantId, cityId) => invoke('stop', { plantId, cityId });
export const withdrawUkrGaz = (plantId, cityId, amount) => invoke('withdraw', { plantId, cityId, amount });
export const offerHouseGas = (plantId, cityId, houseId, unitPrice) => invoke('consumer_offer', { plantId, cityId, houseId, unitPrice });

export const loadGasUtility = () => invoke('consumer_portal');
export const answerGasOffer = (contractId, accept) => invoke('consumer_answer', { contractId, accept });
export const payGasBill = (contractId, amount) => invoke('consumer_pay', { contractId, amount });

export function getGasError(error) {
  const raw = String(error?.message || error || 'GAS_REQUEST_FAILED');
  const messages = {
    GAS_COAL_REQUIRED: 'Загрузите уголь на склад.',
    GAS_WAREHOUSE_FULL: 'Склад угля заполнен.',
    GAS_PROCUREMENT_DISABLED: 'Скупка угля остановлена.',
    GAS_PRICE_REQUIRED: 'Сначала задайте цену скупки.',
    COAL_POWER_PLAYER_COAL_NOT_ENOUGH: 'В инвентаре недостаточно обычного угля.',
    UTILITY_CONSUMER_AMBIGUOUS: 'Короткий ID совпал у нескольких объектов. Введите полный ID.',
    UTILITY_CONSUMER_NOT_FOUND: 'Дом или предприятие не найдены в этом городе.',
    UTILITY_OWNER_CHANGED: 'Владелец объекта изменился; нужен новый договор.',
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела.',
    GAS_PLANT_NOT_FOUND: 'УкрГаз не найдено.',
    GAS_PLANT_ALREADY_OWNED: 'У этого предприятия уже есть владелец.',
    GAS_OWNER_REQUIRED: 'Действие доступно только владельцу предприятия.',
    GAS_EQUIPMENT_INVALID: 'Неизвестная система предприятия.',
    GAS_EQUIPMENT_ALREADY_PURCHASED: 'Эта система уже установлена.',
    GAS_LAUNCH_REQUIREMENTS: 'Для запуска купите матрицу переработки и систему поставки.',
    GAS_ALREADY_RUNNING: 'УкрГаз уже работает.',
    GAS_NOT_RUNNING: 'УкрГаз уже остановлено.',
    GAS_HOUSE_NOT_FOUND: 'Дом с таким публичным ID не найден в этом городе.',
    GAS_HOUSE_OWNER_REQUIRED: 'У объекта должен быть владелец.',
    GAS_CONTRACT_EXISTS: 'У этого дома уже есть предложение или действующий договор на воду.',
    GAS_SUBSCRIBER_LIMIT: 'Лимит предприятия — 10 абонентов.',
    GAS_TARIFF_INVALID: 'Цена газа должна быть не меньше 10 ₴ за единицу.',
    GAS_OFFER_NOT_FOUND: 'Предложение газоснабжения уже недоступно.',
    GAS_OFFER_OWNER_REQUIRED: 'Ответить может только владелец дома.',
    GAS_BILL_NOT_FOUND: 'Счёт за воду не найден.',
    GAS_BILL_EMPTY: 'Задолженности за воду пока нет.',
    GAS_BILL_MINIMUM_NOT_REACHED: 'Оплата доступна после накопления минимум 10,00 ₴.',
    GAS_BILL_AMOUNT_INVALID: 'Сумма счёта изменилась. Обновите коммунальные услуги.',
    PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег.',
    GAS_CASH_NOT_ENOUGH: 'На счёте предприятия недостаточно денег.',
    GAS_AMOUNT_INVALID: 'Укажите корректную сумму.',
  };
  return Object.entries(messages).find(([code]) => raw.includes(code))?.[1] || raw;
}

export const ukrGazWarehouseAction=(plantId,cityId,action,value=0)=>invoke(action,{plantId,cityId,value});

export const loadUkrGazMarket=()=>invoke('market_snapshot');
