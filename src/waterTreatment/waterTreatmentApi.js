import { supabase } from '../supabaseClient.js';

const initData = () => String(window.Telegram?.WebApp?.initData || '').trim();

async function invoke(action, payload = {}) {
  const telegramData = initData();
  if (!telegramData) throw new Error('TELEGRAM_SESSION_REQUIRED');

  const { data, error } = await supabase.functions.invoke('water-treatment', {
    body: { initData: telegramData, action, ...payload },
  });

  if (error) {
    let remote = '';
    try { remote = (await error.context?.clone?.().json())?.error || ''; } catch {}
    throw new Error(remote || error.message || 'WATER_REQUEST_FAILED');
  }
  if (!data?.ok) throw new Error(data?.error || 'WATER_REQUEST_FAILED');
  return data.result;
}

export const loadWaterTreatment = (plantId, cityId) => invoke('snapshot', { plantId, cityId });
export const buyWaterTreatment = (plantId, cityId) => invoke('purchase', { plantId, cityId });
export const buyWaterEquipment = (plantId, cityId, equipment) => invoke('purchase_equipment', { plantId, cityId, equipment });
export const startWaterTreatment = (plantId, cityId) => invoke('start', { plantId, cityId });
export const stopWaterTreatment = (plantId, cityId) => invoke('stop', { plantId, cityId });
export const withdrawWaterTreatment = (plantId, cityId, amount) => invoke('withdraw', { plantId, cityId, amount });
export const offerHouseWater = (plantId, cityId, houseId, unitPrice) => invoke('consumer_offer', { plantId, cityId, houseId, unitPrice });

export const loadWaterUtility = () => invoke('consumer_portal');
export const answerWaterOffer = (contractId, accept) => invoke('consumer_answer', { contractId, accept });
export const payWaterBill = (contractId, amount) => invoke('consumer_pay', { contractId, amount });

export function getWaterError(error) {
  const raw = String(error?.message || error || 'WATER_REQUEST_FAILED');
  const messages = {UTILITY_CONSUMER_AMBIGUOUS:'Найдено несколько объектов. Укажите полный ID.',UTILITY_CONSUMER_NOT_FOUND:'Дом или предприятие не найдены в этом городе.',UTILITY_OWNER_CHANGED:'Владелец объекта изменился. Нужен новый договор.',TRANSFORMER_CAPACITY_EXCEEDED:'Недостаточно мощности трансформатора. Дом: 5 кВт, магазин: 20 кВт, завод: 30 кВт.',
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела.',
    WATER_PLANT_NOT_FOUND: 'Водоочистное сооружение не найдено.',
    WATER_PLANT_ALREADY_OWNED: 'У этого предприятия уже есть владелец.',
    WATER_OWNER_REQUIRED: 'Действие доступно только владельцу предприятия.',
    WATER_EQUIPMENT_INVALID: 'Неизвестная система предприятия.',
    WATER_EQUIPMENT_ALREADY_PURCHASED: 'Эта система уже установлена.',
    WATER_LAUNCH_REQUIREMENTS: 'Для запуска купите системы сбора, очистки и транспортировки воды.',
    WATER_ALREADY_RUNNING: 'Водоочистное сооружение уже работает.',
    WATER_NOT_RUNNING: 'Водоочистное сооружение уже остановлено.',
    WATER_HOUSE_NOT_FOUND: 'Дом с таким публичным ID не найден в этом городе.',
    WATER_HOUSE_OWNER_REQUIRED: 'У дома должен быть владелец.',
    WATER_CONTRACT_EXISTS: 'У этого дома уже есть предложение или действующий договор на воду.',
    WATER_SUBSCRIBER_LIMIT: 'Лимит предприятия — 10 абонентов.',
    WATER_TARIFF_INVALID: 'Цена воды должна быть не меньше 10 ₴ за литр.',
    WATER_OFFER_NOT_FOUND: 'Предложение водоснабжения уже недоступно.',
    WATER_OFFER_OWNER_REQUIRED: 'Ответить может только владелец дома.',
    WATER_BILL_NOT_FOUND: 'Счёт за воду не найден.',
    WATER_BILL_EMPTY: 'Задолженности за воду пока нет.',
    WATER_BILL_MINIMUM_NOT_REACHED: 'Оплата доступна после накопления минимум 10,00 ₴.',
    WATER_BILL_AMOUNT_INVALID: 'Сумма счёта изменилась. Обновите коммунальные услуги.',
    PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег.',
    WATER_CASH_NOT_ENOUGH: 'На счёте предприятия недостаточно денег.',
    WATER_AMOUNT_INVALID: 'Укажите корректную сумму.',
  };
  return Object.entries(messages).find(([code]) => raw.includes(code))?.[1] || raw;
}
