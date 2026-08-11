import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';

const FARM_FUNCTION_NAME = 'farm-work';

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
    UNKNOWN_ACTION: 'Edge Function farm-work не обновлена.',
    FARM_DATABASE_MIGRATION_REQUIRED: 'Сначала примените новую SQL-миграцию фермы, затем обновите Edge Function farm-work.',
    PLAYER_NOT_FOUND: 'Игрок не найден.',
    PLAYER_POSITION_NOT_FOUND: 'Позиция игрока не найдена. Перезайдите в город.',
    PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег.',
    FARM_TOOL_ALREADY_OWNED: 'Этот инструмент у вас уже есть.',
    FARM_WATER_BOTTLE_ALREADY_OWNED: 'У вас уже есть вода для полива. Сначала используйте оставшиеся заряды.',
    FARM_RAKE_REQUIRED: 'Сначала купите грабли на точке снабжения.',
    FARM_SCISSORS_REQUIRED: 'Сначала купите ножницы на точке снабжения.',
    FARM_WATER_REQUIRED: 'Нужна вода. Подойдёт вода с фермы или бутылка из столовой.',
    FARM_PLANT_NOT_FOUND: 'Растение не найдено. Возможно, объект удалён администратором.',
    FARM_PLANT_TOO_FAR: 'Подойдите ближе к растению.',
    FARM_PLANT_STAGE_INVALID: 'Сейчас растению нужно другое действие.',
    FARM_ITEM_NOT_ENOUGH: 'Нужного предмета недостаточно.',
    FARM_SHOP_ITEM_INVALID: 'Этот предмет нельзя получить на ферме.',
    FARM_SELL_ITEM_INVALID: 'Этот предмет фермер не покупает.',
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

  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

export async function invokeFarmAction(action, payload = {}) {
  const initData = telegramInitData();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');

  const { data, error } = await supabase.functions.invoke(FARM_FUNCTION_NAME, {
    body: { initData, action, ...payload },
  });

  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'FARM_REQUEST_FAILED');
  return data.result;
}

export async function loadFarmInventory() {
  return invokeFarmAction('inventory');
}

export async function buyFarmItem(itemType) {
  return invokeFarmAction('buy', { itemType });
}

export async function loadFarmPlantStates(cityId) {
  return invokeFarmAction('plants', { cityId });
}

export async function weedFarmPlant({ cityId, plantObjectId }) {
  return invokeFarmAction('weed', { cityId, plantObjectId });
}

export async function waterFarmPlant({ cityId, plantObjectId }) {
  return invokeFarmAction('water', { cityId, plantObjectId });
}

export async function harvestFarmPlant({ cityId, plantObjectId }) {
  return invokeFarmAction('harvest', { cityId, plantObjectId });
}

export async function sellFarmItem({ itemType, quantity = 1 }) {
  return invokeFarmAction('sell', { itemType, quantity });
}
