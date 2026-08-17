import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';

const FARM_FUNCTION_NAME = 'farm-work';
const FARM_BUSINESS_FUNCTION_NAME = 'farm-business';

function telegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

export function getFarmTelegramId() {
  return String(
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
      state.telegramId ||
      state.player?.tg_id ||
      state.player?.telegramId ||
      ''
  ).trim();
}

async function normalizeError(error, fallback = 'FARM_REQUEST_FAILED') {
  const source = error?.context || error;
  let responseMessage = '';

  if (typeof source?.clone === 'function') {
    try {
      const payload = await source.clone().json();
      responseMessage = [payload?.error, payload?.message, payload?.reason].filter(Boolean).join(' ');
    } catch {}
  }

  const message = [
    responseMessage,
    error?.message,
    error?.details,
    error?.hint,
    source?.message,
  ].filter(Boolean).join(' ');

  return new Error(message || fallback);
}

export function getFarmUserErrorMessage(error) {
  const raw = String(error?.message || error || 'FARM_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите мини-приложение.',
    SERVER_NOT_CONFIGURED: 'Сервер фермы не настроен.',
    UNKNOWN_ACTION: 'Edge Function фермы не обновлена.',
    FARM_DATABASE_MIGRATION_REQUIRED: 'Сначала примените новую SQL-миграцию фермы, затем обновите Edge Function farm-work.',
    FARM_BUSINESS_DATABASE_MIGRATION_REQUIRED: 'Примените SQL-миграцию фермерского бизнеса и задеплойте Edge Function farm-business.',
    PLAYER_NOT_FOUND: 'Игрок не найден.',
    PLAYER_POSITION_NOT_FOUND: 'Позиция игрока не найдена. Перезайдите в город.',
    PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег.',
    NOT_ENOUGH_MONEY: 'Недостаточно денег.',
    FARM_TOOL_ALREADY_OWNED: 'Этот инструмент у вас уже есть.',
    FARM_TOOL_STILL_USABLE: 'Этот инструмент ещё не сломан. Новый пока не нужен.',
    FARM_TOOL_OUT_OF_STOCK: 'На складе фермы закончился этот инструмент. Владелец должен заказать поставку.',
    FARM_TOOL_DURABILITY_REQUIRED: 'Для старого инструмента ещё не создана прочность. Откройте лавку фермы один раз.',
    FARM_TOOL_BROKEN: 'Инструмент сломан. Купите новый в фермерской лавке.',
    FARM_TOOL_PRICE_MIN_100: 'Цена инструмента не может быть ниже 100 ₴.',
    FARM_WATER_BOTTLE_ALREADY_OWNED: 'У вас уже набрана вода для полива. Сначала используйте оставшиеся заряды.',
    FARM_WATER_STATUS_UNAVAILABLE: 'Не удалось проверить запас воды. Попробуйте ещё раз.',
    FARM_TOWER_EMPTY: 'Водонапорная башня пуста. Владелец или помощник должен пополнить её.',
    FARM_TOWER_REQUIRED: 'Сначала администратор должен установить и привязать к ферме водонапорную башню.',
    FARM_TOWER_NOT_LINKED: 'Башня не привязана к этой ферме. Администратор должен указать ID фермы.',
    FARM_WATER_NOTHING_TO_FILL: 'Нечего заливать: либо резерв воды пуст, либо башня уже заполнена.',
    FARM_WATER_AMOUNT_INVALID: 'Укажите корректное количество воды.',
    FARM_BUSINESS_NOT_FOUND: 'Фермерское предприятие не найдено.',
    FARM_BUSINESS_ALREADY_OWNED: 'Эта ферма уже принадлежит игроку.',
    FARM_BUSINESS_NOT_OWNED: 'Ферма ещё не куплена.',
    FARM_BUSINESS_OWNER_REQUIRED: 'Это действие доступно только владельцу фермы.',
    FARM_BUSINESS_STAFF_REQUIRED: 'Пополнять башню может только владелец или помощник.',
    FARM_BUSINESS_CASH_NOT_ENOUGH: 'На балансе фермы недостаточно денег.',
    FARM_BUSINESS_AMOUNT_INVALID: 'Введите корректную сумму.',
    FARM_ASSISTANT_NOT_FOUND: 'Игрок для должности помощника не найден.',
    FARM_BUSINESS_SELF_ASSISTANT: 'Владельца нельзя назначить своим помощником.',
    FARM_SUPPLY_QUANTITY_INVALID: 'Укажите корректное количество поставки.',
    FARM_PLANT_BUSINESS_MISMATCH: 'Этот участок привязан к другой ферме или не привязан вообще.',
    FARM_RAKE_REQUIRED: 'Сначала купите грабли на точке снабжения.',
    FARM_SCISSORS_REQUIRED: 'Сначала купите ножницы на точке снабжения.',
    FARM_WATER_REQUIRED: 'Нужна вода. Наберите её в водонапорной башне фермы.',
    FARM_PLANT_NOT_FOUND: 'Растение не найдено. Возможно, объект удалён администратором.',
    FARM_PLANT_TOO_FAR: 'Подойдите ближе к растению.',
    FARM_PLANT_STAGE_INVALID: 'Сейчас растению нужно другое действие.',
    FARM_ITEM_NOT_ENOUGH: 'Нужного предмета недостаточно.',
    FARM_SHOP_ITEM_INVALID: 'Этот предмет нельзя получить на ферме.',
    FARM_SELL_ITEM_INVALID: 'Этот предмет фермер не покупает.',
    FARM_BUYER_NOT_FOUND: 'Скупщик не найден. Подойдите к значку 👨‍🌾 ещё раз.',
    FARM_BUYER_TOO_FAR: 'Вы отошли слишком далеко от скупщика.',
  };

  const waitMatch = raw.match(/FARM_PLANT_NOT_READY:(\d+)/i);
  if (waitMatch) {
    const seconds = Math.max(1, Number(waitMatch[1]) || 1);
    const minutesPart = Math.floor(seconds / 60);
    const secondsPart = seconds % 60;
    const time = minutesPart > 0
      ? `${minutesPart}:${String(secondsPart).padStart(2, '0')}`
      : `${seconds} сек.`;
    return `Растение ещё не готово. Подождите ${time}, чтобы прополоть.`;
  }

  const lockedMatch = raw.match(/FARM_CROP_LOCKED:([a-z_]+):(\d+):(\d+)/i);
  if (lockedMatch) {
    const labels = { apple: 'яблоко', orange: 'апельсин', wheat: 'пшеницу', corn: 'кукурузу' };
    return `Культура «${labels[lockedMatch[1]] || lockedMatch[1]}» откроется на ${lockedMatch[2]} уровне навыка «Фермер». Сейчас у вас ${lockedMatch[3]} уровень.`;
  }

  const marketLimitMatch = raw.match(/FARM_BUYER_LIMIT_REACHED:(\d+)/i);
  if (marketLimitMatch) {
    const seconds = Math.max(0, Math.ceil(Number(marketLimitMatch[1]) - Date.now() / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    const remaining = hours > 0 ? `${hours} ч. ${minutes} мин.` : `${Math.max(1, minutes)} мин.`;
    return `Лимит этого скупщика исчерпан. Новый рынок через ${remaining} или найдите другого скупщика.`;
  }

  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

async function invokeFunction(functionName, action, payload = {}) {
  const initData = telegramInitData();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: { initData, action, ...payload },
  });
  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'FARM_REQUEST_FAILED');
  return data.result;
}

export function invokeFarmAction(action, payload = {}) {
  return invokeFunction(FARM_FUNCTION_NAME, action, payload);
}

export function invokeFarmBusinessAction(action, payload = {}) {
  return invokeFunction(FARM_BUSINESS_FUNCTION_NAME, action, payload);
}

function mergeToolDurability(inventory, toolsResult) {
  const payload = inventory?.inventory && typeof inventory.inventory === 'object' ? inventory.inventory : inventory;
  const items = Array.isArray(payload?.items) ? payload.items.map((item) => ({ ...item })) : [];
  const toolRows = Array.isArray(toolsResult?.items) ? toolsResult.items : [];
  const byType = new Map(toolRows.map((item) => [String(item.itemType || item.item_type), item]));
  items.forEach((item) => {
    const tool = byType.get(String(item.itemType || item.item_type || ''));
    if (tool) {
      item.durability = Number(tool.durability);
      item.maxDurability = Number(tool.maxDurability || 100);
      item.broken = Number(tool.durability) <= 0;
    }
  });
  return { ...(payload || {}), items };
}

export async function loadFarmInventory() {
  const inventory = await invokeFarmAction('inventory');
  try {
    const tools = await invokeFarmBusinessAction('player_tools');
    return mergeToolDurability(inventory, tools);
  } catch {
    return inventory;
  }
}

export async function loadFarmWaterAvailability() {
  return invokeFarmBusinessAction('water_status');
}

export async function loadPlayerSkills() {
  return invokeFarmAction('skills');
}

export async function addRunningSkillXp(xp) {
  return invokeFarmAction('running_xp', { xp });
}

// Оставлено для совместимости с другими участками кода. Лавка фермы больше не вызывает эту функцию напрямую.
export async function buyFarmItem(itemType) {
  return invokeFarmAction('buy', { itemType });
}

export async function loadFarmPlantStates(cityId) {
  return invokeFarmAction('plants', { cityId });
}

export async function weedFarmPlant({ cityId, businessId, plantObjectId, miniGameScore = 0 }) {
  return invokeFarmBusinessAction('plant_work', { cityId, businessId, plantObjectId, plantAction: 'weed', miniGameScore });
}

export async function waterFarmPlant({ cityId, businessId, plantObjectId, miniGameScore = 0 }) {
  return invokeFarmBusinessAction('plant_work', { cityId, businessId, plantObjectId, plantAction: 'water', miniGameScore });
}

export async function harvestFarmPlant({ cityId, businessId, plantObjectId, miniGameScore = 0 }) {
  return invokeFarmBusinessAction('plant_work', { cityId, businessId, plantObjectId, plantAction: 'harvest', miniGameScore });
}

export async function loadFarmMarket({ cityId, buyerObjectId }) {
  return invokeFarmAction('market', { cityId, buyerObjectId });
}

export async function sellFarmItem({ cityId, buyerObjectId, itemType, quantity = 1 }) {
  return invokeFarmBusinessAction('sell_crop', {
    cityId,
    businessId: buyerObjectId,
    buyerObjectId,
    itemType,
    quantity,
  });
}

export const loadFarmBusinessSnapshot = ({ businessId, cityId }) => invokeFarmBusinessAction('snapshot', { businessId, cityId });
export const purchaseFarmBusiness = ({ businessId, cityId }) => invokeFarmBusinessAction('purchase', { businessId, cityId });
export const depositFarmBusiness = ({ businessId, cityId, amount }) => invokeFarmBusinessAction('deposit', { businessId, cityId, amount });
export const withdrawFarmBusiness = ({ businessId, cityId, amount }) => invokeFarmBusinessAction('withdraw', { businessId, cityId, amount });
export const setFarmBusinessAssistant = ({ businessId, cityId, target }) => invokeFarmBusinessAction('assistant_set', { businessId, cityId, target });
export const setFarmBusinessToolPrice = ({ businessId, cityId, itemType, price }) => invokeFarmBusinessAction('tool_price', { businessId, cityId, itemType, price });
export const orderFarmBusinessSupply = ({ businessId, cityId, supplyType, quantity }) => invokeFarmBusinessAction('order_supply', { businessId, cityId, supplyType, quantity });
export const fillFarmWaterTower = ({ businessId, cityId, liters }) => invokeFarmBusinessAction('fill_tower', { businessId, cityId, liters });
export const buyFarmBusinessTool = ({ businessId, cityId, itemType }) => invokeFarmBusinessAction('buy_tool', { businessId, cityId, itemType });
export const takeFarmWaterFromTower = ({ businessId, cityId, towerObjectId }) => invokeFarmBusinessAction('take_water', { businessId, cityId, towerObjectId });
