import { supabase } from '../supabaseClient.js';

const LUMBER_FUNCTION_NAME = 'lumber-work';

function telegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function normalizeError(error, fallback = 'LUMBER_REQUEST_FAILED') {
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

export function getLumberUserErrorMessage(error) {
  const raw = String(error?.message || error || 'LUMBER_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите мини-приложение.',
    SERVER_NOT_CONFIGURED: 'Сервер работы лесоруба не настроен.',
    UNKNOWN_ACTION: 'Edge Function lumber-work не обновлена.',
    LUMBER_DATABASE_MIGRATION_REQUIRED: 'Сначала примените SQL-миграцию лесоруба, затем обновите Edge Function lumber-work.',
    PLAYER_NOT_FOUND: 'Игрок не найден.',
    PLAYER_POSITION_NOT_FOUND: 'Позиция игрока не найдена. Перезайдите в город.',
    LUMBER_STATION_NOT_FOUND: 'Точка лесоруба не найдена.',
    LUMBER_STATION_TOO_FAR: 'Подойдите ближе к точке 🪚.',
    LUMBER_TREE_NOT_FOUND: 'Дерево не найдено. Возможно, объект удалён администратором.',
    LUMBER_TREE_TOO_FAR: 'Подойдите ближе к дереву.',
    LUMBER_AXE_REQUIRED: 'Сначала возьмите топор на точке 🪚.',
    LUMBER_CHAINSAW_REQUIRED: 'Для распила нужна бензопила со 2 уровня.',
    LUMBER_TOOL_ALREADY_OWNED: 'Этот инструмент у вас уже есть.',
    LUMBER_LEVEL_2_REQUIRED: 'Распил открывается на 2 уровне лесоруба.',
    LUMBER_LEVEL_3_REQUIRED: 'Продажа производствам открывается на 3 уровне лесоруба.',
    LUMBER_ITEM_NOT_ENOUGH: 'В инвентаре недостаточно древесины.',
    LUMBER_ITEM_INVALID: 'Этот предмет нельзя обработать или продать здесь.',
    LUMBER_QUANTITY_INVALID: 'Неверно указано количество.',
  };

  const waitMatch = raw.match(/LUMBER_TREE_NOT_READY:(\d+)/i);
  if (waitMatch) {
    const seconds = Math.max(1, Number(waitMatch[1]) || 1);
    return `Дерево восстанавливается. Подождите ${seconds < 60 ? `${seconds} сек.` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}.`;
  }
  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

export async function invokeLumberAction(action, payload = {}) {
  const initData = telegramInitData();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke(LUMBER_FUNCTION_NAME, {
    body: { initData, action, ...payload },
  });
  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'LUMBER_REQUEST_FAILED');
  return data.result;
}

export const loadLumberInventory = () => invokeLumberAction('inventory');
export const loadLumberSkills = () => invokeLumberAction('skills');
export const loadLumberTreeStates = (cityId) => invokeLumberAction('trees', { cityId });
export const takeLumberTool = ({ cityId, stationObjectId, itemType }) => (
  invokeLumberAction('take_tool', { cityId, stationObjectId, itemType })
);
export const chopLumberTree = ({ cityId, treeObjectId, miniGameScore = 0 }) => (
  invokeLumberAction('chop', { cityId, treeObjectId, miniGameScore })
);
export const sawLumberLog = ({ cityId, stationObjectId, miniGameScore = 0 }) => (
  invokeLumberAction('saw', { cityId, stationObjectId, miniGameScore })
);
export const sellLumberItem = ({ cityId, stationObjectId, itemType, quantity = 1, channel = 'station' }) => (
  invokeLumberAction('sell', { cityId, stationObjectId, itemType, quantity, channel })
);
