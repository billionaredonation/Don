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
    PLAYER_NOT_FOUND: 'Игрок не найден.',
    PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег.',
    FARM_TOOL_ALREADY_OWNED: 'Этот инструмент у вас уже есть.',
    FARM_SEED_LIMIT_REACHED: 'Семян этого типа уже достаточно. Максимум 50 шт.',
    FARM_HOE_REQUIRED: 'Сначала купите тяпку на точке снабжения.',
    FARM_RAKE_REQUIRED: 'Сначала купите грабли на точке снабжения.',
    FARM_PLOT_LIMIT_REACHED: 'У вас уже 5 активных посадок. Сначала соберите урожай.',
    FARM_FIELD_NOT_FOUND: 'Поле не найдено. Возможно, объект был удалён администратором.',
    FARM_FIELD_TOO_FAR: 'Подойдите ближе к рабочей зоне поля.',
    FARM_PLOT_SPACE_BUSY: 'Здесь слишком тесно. Сделайте пару шагов в сторону.',
    FARM_PLOT_NOT_FOUND: 'Посадка больше не существует.',
    FARM_PLOT_STAGE_INVALID: 'Сейчас для этой посадки нужно выполнить другое действие.',
    FARM_ITEM_NOT_ENOUGH: 'Нужного предмета недостаточно.',
    FARM_CROP_INVALID: 'Неизвестная культура.',
    FARM_SHOP_ITEM_INVALID: 'Этот предмет нельзя получить на ферме.',
    FARM_SELL_ITEM_INVALID: 'Этот предмет фермер не покупает.',
  };

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

export async function tillFarmPlot({ cityId, fieldObjectId, x, y }) {
  return invokeFarmAction('till', { cityId, fieldObjectId, x, y });
}

export async function plantFarmSeed({ plotId, cropType }) {
  return invokeFarmAction('plant', { plotId, cropType });
}

export async function rakeFarmPlot(plotId) {
  return invokeFarmAction('rake', { plotId });
}

export async function waterFarmPlot(plotId) {
  return invokeFarmAction('water', { plotId });
}

export async function harvestFarmPlot(plotId) {
  return invokeFarmAction('harvest', { plotId });
}

export async function sellFarmItem({ itemType, quantity = 1 }) {
  return invokeFarmAction('sell', { itemType, quantity });
}

export async function loadFarmPlots(cityId) {
  const normalizedCityId = String(cityId || '').trim();
  if (!normalizedCityId) return [];

  const { data, error } = await supabase
    .from('farm_plots')
    .select('*')
    .eq('city_id', normalizedCityId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
