import { supabase } from '../supabaseClient.js';

const MINE_FUNCTION_NAME = 'mine-work';

function telegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function normalizeError(error, fallback = 'MINE_REQUEST_FAILED') {
  const source = error?.context || error;
  let responseMessage = '';

  if (typeof source?.clone === 'function') {
    try {
      const payload = await source.clone().json();
      responseMessage = [payload?.error, payload?.message, payload?.reason].filter(Boolean).join(' ');
    } catch {}
  }

  const message = [responseMessage, error?.message, error?.details, error?.hint, source?.message]
    .filter(Boolean)
    .join(' ');
  return new Error(message || fallback);
}

export function getMineUserErrorMessage(error) {
  const raw = String(error?.message || error || 'MINE_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите мини-приложение.',
    SERVER_NOT_CONFIGURED: 'Сервер шахты не настроен.',
    UNKNOWN_ACTION: 'Edge Function mine-work не обновлена.',
    MINE_DATABASE_MIGRATION_REQUIRED: 'Сначала примените SQL-миграцию шахты, затем обновите Edge Function mine-work.',
    PLAYER_NOT_FOUND: 'Игрок не найден.',
    PLAYER_POSITION_NOT_FOUND: 'Позиция игрока не найдена. Перезайдите в город.',
    PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег для покупки кирки.',
    MINE_PICKAXE_ALREADY_OWNED: 'Кирка у вас уже есть.',
    MINE_PICKAXE_REQUIRED: 'Сначала купите кирку у шахтёрского снабженца.',
    MINE_SHOP_ITEM_INVALID: 'Этот предмет нельзя купить на шахте.',
    MINE_NODE_NOT_FOUND: 'Месторождение не найдено. Возможно, объект удалён администратором.',
    MINE_NODE_TOO_FAR: 'Подойдите ближе к месторождению.',
    MINE_BUYER_NOT_FOUND: 'Скупщик не найден. Подойдите к шахтёрской станции ещё раз.',
    MINE_BUYER_TOO_FAR: 'Вы отошли слишком далеко от скупщика.',
    MINE_ITEM_NOT_ENOUGH: 'Недостаточно сырья для продажи.',
    MINE_SELL_ITEM_INVALID: 'Скупщик не принимает этот тип сырья.',
    MINE_SELL_QUANTITY_INVALID: 'Неверно указано количество сырья.',
    MINE_MARKET_UNAVAILABLE: 'Рынок скупщика временно недоступен.',
    MINE_MARKET_LIMIT_REACHED: 'Лимит скупщика исчерпан. Дождитесь обновления рынка.',
  };

  const waitMatch = raw.match(/MINE_NODE_NOT_READY:(\d+)/i);
  if (waitMatch) {
    const seconds = Math.max(1, Number(waitMatch[1]) || 1);
    const minutes = Math.floor(seconds / 60);
    const time = minutes > 0 ? `${minutes}:${String(seconds % 60).padStart(2, '0')}` : `${seconds} сек.`;
    return `Месторождение восстанавливается. Подождите ${time}.`;
  }

  const lockedMatch = raw.match(/MINE_RESOURCE_LOCKED:([a-z_]+):(\d+):(\d+)/i);
  if (lockedMatch) {
    const labels = { stone: 'камень', coal: 'уголь', metal: 'металл', copper: 'медь' };
    return `${labels[lockedMatch[1]] || lockedMatch[1]} откроется на ${lockedMatch[2]} уровне навыка «Шахтёр». Сейчас у вас ${lockedMatch[3]} уровень.`;
  }

  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

export async function invokeMineAction(action, payload = {}) {
  const initData = telegramInitData();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');

  const { data, error } = await supabase.functions.invoke(MINE_FUNCTION_NAME, {
    body: { initData, action, ...payload },
  });

  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'MINE_REQUEST_FAILED');
  return data.result;
}

export function loadMineInventory() {
  return invokeMineAction('inventory');
}

export function loadMineSkills() {
  return invokeMineAction('skills');
}

export function loadMineNodeStates(cityId) {
  return invokeMineAction('nodes', { cityId });
}

export function buyMineItem(itemType) {
  return invokeMineAction('buy', { itemType });
}

export function extractMineNode({ cityId, nodeObjectId, miniGameScore = 0 }) {
  return invokeMineAction('extract', { cityId, nodeObjectId, miniGameScore });
}

export function loadMineMarket({ cityId, buyerObjectId }) {
  return invokeMineAction('market', { cityId, buyerObjectId });
}

export function sellMineSubtype({ cityId, buyerObjectId, subtypeCode, quantity = 1 }) {
  return invokeMineAction('sell', { cityId, buyerObjectId, subtypeCode, quantity });
}
