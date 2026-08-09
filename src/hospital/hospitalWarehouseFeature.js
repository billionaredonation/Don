// Hospital batch refresh 2026-07-20: warehouse feature deploy marker.
import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import './hospitalWarehouse.css';

const HOSPITAL_FUNCTION_NAME = 'hospital-warehouse';
const PLAYER_INTERACTION_FUNCTION_NAME = 'player-interaction';
const MEDICINE_TYPES = ['medicine_light', 'medicine_strong', 'medicine_resuscitation'];
const ITEM_FALLBACKS = Object.freeze({
  food: { label: 'Продукты', icon: '🍱' },
  water_bottle: { label: 'Бутылка воды', icon: '💧' },
  medicine_light: { label: 'Простые таблетки', icon: '💊' },
  medicine_strong: { label: 'Среднеседативные таблетки', icon: '💉' },
  medicine_resuscitation: { label: 'Сильные седативные таблетки', icon: '⚕' },
});

function localTelegramId() {
  return String(
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
      state.telegramId ||
      state.player?.tg_id ||
      state.player?.telegramId ||
      ''
  ).trim();
}

function telegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function normalizeError(error, fallback = 'HOSPITAL_REQUEST_FAILED') {
  const source = error?.context || error;
  let responseMessage = '';
  if (typeof source?.clone === 'function') {
    try {
      const payload = await source.clone().json();
      responseMessage = [payload?.error, payload?.message, payload?.reason].filter(Boolean).join(' ');
    } catch {
      // The response is not JSON; the standard error fields below are enough.
    }
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

function userErrorMessage(error) {
  const raw = String(error?.message || error || 'HOSPITAL_REQUEST_FAILED');
  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram, чтобы подтвердить аккаунт.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите мини-приложение.',
    HOSPITAL_ACCESS_DENIED: 'Вы не состоите в штате этой больницы.',
    ITEM_RANK_REQUIRED: 'Ваша должность не позволяет взять этот предмет.',
    REFILL_RANK_REQUIRED: 'Пополнять склад может только старший состав или администрация.',
    WAREHOUSE_STOCK_NOT_ENOUGH: 'На складе недостаточно предметов.',
    PERSONAL_MEDICINE_NOT_ENOUGH: 'Сначала получите этот препарат со склада.',
    PATIENT_FOOD_TOO_LOW: 'У пациента меньше 40 еды. Сначала его нужно накормить.',
    PATIENT_WATER_TOO_LOW: 'У пациента недостаточно воды. Сначала ему нужно попить.',
    PLAYER_FOOD_TOO_LOW: 'Сначала поешьте: для применения препарата не хватает еды.',
    PLAYER_FOOD_FULL: 'Вы и так сыты на 100, еда не требуется.',
    PLAYER_WATER_FULL: 'Вода уже восстановлена до 100.',
    PLAYER_WATER_TOO_LOW: 'Сначала попейте: для применения препарата не хватает воды.',
    PLAYER_MEDICINE_NOT_ENOUGH: 'У вас нет этого препарата в инвентаре.',
    PLAYER_ITEM_NOT_ENOUGH: 'У вас нет этого предмета в инвентаре.',
    PLAYER_BALANCE_NOT_ENOUGH: 'Недостаточно денег для покупки.',
    CAFETERIA_ITEM_NOT_FOUND: 'Этот продукт столовки пока недоступен.',
    CONSUMABLE_ITEM_NOT_FOUND: 'Этот расходник пока недоступен в магазине.',
    RECEPTION_TREATMENT_UNAVAILABLE: 'Простые таблетки на рецепшене временно недоступны.',
    RECEPTION_UNAVAILABLE_WHILE_UNCONSCIOUS: 'В бессознательном состоянии лечение на рецепшене недоступно.',
    PLAYER_POSITION_NOT_FOUND: 'Состояние персонажа ещё не создано. Перезайдите в игру.',
    SURVIVAL_STATE_UNAVAILABLE: 'Не удалось обновить состояние персонажа. Попробуйте ещё раз.',
    INVENTORY_ITEM_NOT_USABLE: 'Этот предмет пока нельзя применить.',
    SERVICE_ITEM_NOT_ENOUGH: 'У вас нет этого служебного предмета.',
    PATIENT_HEALTH_FULL: 'Здоровье уже 100 HP, таблетки не требуются.',
    MEDICINE_HEALTH_RANGE_MISMATCH: 'Этот препарат не подходит для текущего уровня HP пациента.',
    PATIENT_ALREADY_TREATED: 'На пациента уже действует препарат.',
    PLAYER_NOT_FOUND: 'Игрок с таким ником или Telegram ID не найден.',
    TREATMENT_RANK_REQUIRED: 'Ваша должность не позволяет применять этот препарат.',
    SALE_RANK_REQUIRED: 'Ваша должность не позволяет продавать этот препарат.',
    SALE_PRICE_NOT_CONFIGURED: 'Цена препарата ещё не задана администрацией в БД.',
    BUYER_BALANCE_NOT_ENOUGH: 'У покупателя недостаточно денег.',
    PATIENT_BALANCE_NOT_ENOUGH: 'У пациента недостаточно денег для лечения.',
    INVALID_TREATMENT_PRICE: 'Укажите корректную цену лечения.',
    MEDICINE_SELF_USE_DISABLED: 'Самолечение таблетками отключено. Препараты применяются только врачом к другому игроку через подсистему лечения.',
    SELF_TREATMENT_USE_INVENTORY: 'Самолечение таблетками отключено. Лечить можно только другого игрока через подсистему врача.',
    TREATMENT_ISSUE_FAILED: 'Не удалось оформить лечение. Деньги и таблетка не списаны.',
    TREATMENT_APPLY_FAILED: 'Таблетка не применилась. Деньги и таблетка не списаны.',
    EMPLOYEE_MANAGEMENT_DENIED: 'У вас нет доступа к управлению сотрудниками этой больницы.',
    HOSPITAL_BUDGET_NOT_ENOUGH: 'В бюджете больницы недостаточно денег для закупки.',
    HOSPITAL_PAYROLL_TREASURY_NOT_ENOUGH: 'В казне больницы недостаточно денег для этой зарплаты.',
    INVALID_PAYROLL_AMOUNT: 'Укажите корректную сумму для казны или зарплаты.',
    EMPLOYEE_SALARY_NOT_CONFIGURED: 'Сначала установите сотруднику суточную зарплату.',
    EMPLOYEE_SALARY_ALREADY_PAID_TODAY: 'Этому сотруднику зарплата за сегодня уже выплачена.',
    EMPLOYEE_DAILY_ACTIVITY_TOO_LOW: 'Сотрудник ещё не отыграл обязательные 2 часа во фракции за сегодня.',
    PURCHASE_PRICE_NOT_CONFIGURED: 'Цена закупки для этого предмета не настроена в БД.',
    STAFF_PANEL_DENIED: 'Меню больницы доступно только сотрудникам больницы и администрации.',
    ADMIN_REQUIRED_FOR_SENIOR_RANK: 'Назначать или снимать старший состав может только администрация.',
    CANNOT_CHANGE_OWN_RANK: 'Нельзя изменить собственную должность.',
    SERVER_NOT_CONFIGURED: 'Серверная функция больницы не настроена.',
    UNKNOWN_ACTION: 'Edge Function hospital-warehouse старая: задеплойте свежий supabase/functions/hospital-warehouse/index.ts.',
    NOT_FOUND: 'Edge Function hospital-warehouse не задеплоена в Supabase.',
  };

  if (raw.toLowerCase().includes('requested function was not found')) {
    return 'Edge Function hospital-warehouse не задеплоена в Supabase.';
  }

  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

export async function invokeHospitalAction(action, payload = {}) {
  const initData = telegramInitData();

  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');

  const { data, error } = await supabase.functions.invoke(HOSPITAL_FUNCTION_NAME, {
    body: {
      initData,
      action,
      ...payload,
    },
  });

  if (error) throw await normalizeError(error);
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'HOSPITAL_REQUEST_FAILED');
  return data.result;
}

async function invokePlayerInteractionAction(action, payload = {}) {
  const initData = telegramInitData();

  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');

  const { data, error } = await supabase.functions.invoke(PLAYER_INTERACTION_FUNCTION_NAME, {
    body: {
      initData,
      action,
      ...payload,
    },
  });

  if (error) throw await normalizeError(error, 'PLAYER_INTERACTION_REQUEST_FAILED');
  if (!data?.ok) throw new Error(data?.error || data?.reason || 'PLAYER_INTERACTION_REQUEST_FAILED');
  return data.result;
}

function isLegacyEdgeFunctionError(error) {
  const raw = String(error?.message || error || '').toLowerCase();
  return /(?:^|[^a-z0-9_])unknown_action(?:$|[^a-z0-9_])/.test(raw) ||
    /(?:^|[^a-z0-9_])not_found(?:$|[^a-z0-9_])/.test(raw) ||
    raw.includes('requested function was not found') ||
    raw.includes('function not found');
}

function isLegacyMedicineHpRestrictionError(error) {
  const raw = String(error?.message || error || '').toUpperCase();
  return raw.includes('MEDICINE_HEALTH_RANGE_MISMATCH') ||
    raw.includes('PATIENT_HEALTH_FULL');
}

export async function registerHospitalIdentity({ hospitalId, cityId, cityName, hospitalNumber } = {}) {
  return invokeHospitalAction('register_hospital', {
    hospitalId,
    hospitalCityId: cityId,
    hospitalCityName: cityName,
    hospitalNumber,
  });
}

export async function loadMyHospitalEmployments() {
  const result = await invokeHospitalAction('my_employments');
  return Array.isArray(result?.employments) ? result.employments : [];
}

export async function treatPlayerFromInteraction({ hospitalId, target, medicineType } = {}) {
  return invokeHospitalAction('treat', { hospitalId, target, medicineType });
}

export async function issueMedicineFromInteraction({ hospitalId, target, medicineType, price = 0 } = {}) {
  return invokeHospitalAction('issue_medicine', { hospitalId, target, medicineType, price });
}

export async function treatPlayerForPriceFromInteraction({ hospitalId, target, medicineType, price = 0 } = {}) {
  const safePrice = Math.max(0, Math.floor(Number(price) || 0));
  const payload = {
    hospitalId,
    target,
    medicineType,
    price: safePrice,
  };

  // Prefer the atomic professional route so charging and treatment statistics
  // stay intact. Some older database deployments still reject a medicine by HP
  // band; for a free treatment that failed transaction has already rolled back,
  // so it is safe to retry through the dedicated doctor -> patient RPC.
  try {
    return await invokePlayerInteractionAction('treat_player_for_price', payload);
  } catch (error) {
    if (safePrice === 0 && (
      isLegacyEdgeFunctionError(error) ||
      isLegacyMedicineHpRestrictionError(error)
    )) {
      return invokeHospitalAction('treat', { hospitalId, target, medicineType });
    }
    if (!isLegacyEdgeFunctionError(error)) throw error;
    return invokeHospitalAction('treat_player_for_price', payload);
  }
}

export async function loadMyMedicalInventory() {
  return invokeHospitalAction('my_medicine');
}

export async function useMyMedicine(medicineType) {
  return invokeHospitalAction('use_medicine', { medicineType });
}

export async function useInventoryItem({ itemType, source = 'personal', hospitalId = null } = {}) {
  return invokeHospitalAction('use_inventory_item', { itemType, source, hospitalId });
}

export async function loadCafeteriaMenu() {
  return invokeHospitalAction('cafeteria_menu');
}

export async function buyCafeteriaItem({ itemType = 'food', quantity = 1 } = {}) {
  return invokeHospitalAction('cafeteria_buy', { itemType, quantity });
}

export async function loadHospitalReceptionOffer() {
  return invokeHospitalAction('reception_offer');
}

export async function buyHospitalReceptionTreatment() {
  return invokeHospitalAction('reception_treat');
}

export async function processPlayerSurvivalTick({ active = false } = {}) {
  return invokeHospitalAction('survival_tick', { active: active === true });
}

export async function applyPlayerStaminaExhaustion() {
  return invokeHospitalAction('stamina_exhausted');
}

export async function applyPlayerStaminaRecovery(intervals = 1) {
  return invokeHospitalAction('stamina_recovery', { intervals });
}

export async function applyPlayerStaminaUsage(intervals = 1) {
  const safeIntervals = Math.max(1, Math.min(10, Math.floor(Number(intervals) || 1)));
  return invokeHospitalAction('stamina_usage', { intervals: safeIntervals });
}

export async function applyPlayerSprintUsage() {
  return invokeHospitalAction('sprint_usage');
}

export async function notifyHospitalTreatmentStarted(targetTgId, hospitalId) {
  const target = String(targetTgId || '').trim();
  if (!target) return;

  const channel = supabase.channel(`mn-hospital-treatment:${target}`);
  await new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, 900);
    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      window.clearTimeout(timeout);
      try {
        await channel.send({ type: 'broadcast', event: 'treatment_started', payload: { hospitalId } });
      } finally {
        resolve();
      }
    });
  });
  supabase.removeChannel(channel);
}

export function getHospitalUserErrorMessage(error) {
  return userErrorMessage(error);
}

export async function loadHospitalWarehousePickupLayout() {
  const result = await invokeHospitalAction('pickup_layout');
  return Array.isArray(result?.pickups) ? result.pickups : [];
}

export async function saveHospitalWarehousePickupLayout(pickups) {
  const result = await invokeHospitalAction('save_pickup_layout', {
    pickups: Array.isArray(pickups) ? pickups : [],
  });
  return Array.isArray(result?.pickups) ? result.pickups : [];
}

function rankLevel(rank) {
  const levels = { junior: 1, middle: 2, senior: 3, admin: 4 };
  return levels[String(rank || '').toLowerCase()] || 0;
}

function rankLabel(rank) {
  return ({
    junior: 'Младший состав',
    middle: 'Средний состав',
    senior: 'Старший состав',
    admin: 'Администрация',
  })[rank] || 'Нет доступа';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function itemMeta(item = {}) {
  const fallback = ITEM_FALLBACKS[item.itemType] || { label: item.itemType, icon: '□' };
  return {
    label: item.label || fallback.label,
    icon: item.icon || fallback.icon,
  };
}

function canTakeItem(context, itemType) {
  if (context?.isAdmin) return true;
  const level = rankLevel(context?.rank);
  if (itemType === 'medicine_light') return level >= 1;
  if (itemType === 'food') return level >= 2;
  return level >= 3;
}

function canTreatWith(context, itemType) {
  if (context?.isAdmin) return true;
  const level = rankLevel(context?.rank);
  if (itemType === 'medicine_light') return level >= 1;
  return level >= 3;
}

function canSellItem(context, itemType) {
  if (context?.isAdmin) return true;
  const level = rankLevel(context?.rank);
  if (itemType === 'medicine_light') return level >= 2;
  return level >= 3;
}

function formatMedicineRule(item) {
  if (!MEDICINE_TYPES.includes(item.itemType)) return 'Используется для питания пациентов и персонала.';

  const heal = Number(item.healPerTick || 0);
  const seconds = Number(item.tickSeconds || 0);
  const duration = Number(item.durationSeconds || 60);
  return `+${heal} HP каждые ${seconds} сек. · можно применить при любом HP · действует ${duration} сек.`;
}

function markup() {
  return `
    <div class="mn-hospital-warehouse" data-hospital-warehouse hidden aria-hidden="true">
      <button class="mn-hospital-warehouse-backdrop" type="button" tabindex="-1" data-hospital-warehouse-close aria-label="Закрыть склад"></button>
      <section class="mn-hospital-warehouse-panel" role="dialog" aria-modal="true" aria-labelledby="mn-hospital-warehouse-title">
        <header class="mn-hospital-warehouse-header">
          <span class="mn-hospital-warehouse-mark" aria-hidden="true">✚</span>
          <span class="mn-hospital-warehouse-heading">
            <small data-hospital-warehouse-subtitle>Больница</small>
            <strong id="mn-hospital-warehouse-title">Медицинский склад</strong>
          </span>
          <span class="mn-hospital-warehouse-role" data-hospital-warehouse-role>Проверка доступа</span>
          <button class="mn-hospital-warehouse-close" type="button" data-hospital-warehouse-close aria-label="Закрыть">×</button>
        </header>

        <nav class="mn-hospital-warehouse-tabs" aria-label="Разделы склада">
          <button type="button" data-hospital-warehouse-tab="stock" data-active="true">Склад</button>
          <button type="button" data-hospital-warehouse-tab="staff" hidden>Сотрудники</button>
          <button type="button" data-hospital-warehouse-tab="stats" hidden>Статистика</button>
        </nav>

        <div class="mn-hospital-warehouse-loading" data-hospital-warehouse-loading>Загрузка данных склада…</div>
        <div class="mn-hospital-warehouse-message" data-hospital-warehouse-message hidden></div>

        <div class="mn-hospital-warehouse-body" data-hospital-warehouse-body hidden>
          <section data-hospital-warehouse-section="stock">
            <div class="mn-hospital-warehouse-summary">
              <span><small>Режим</small><b data-hospital-warehouse-mode>Получение</b></span>
              <span><small>Больница</small><b data-hospital-warehouse-id>—</b></span>
              <span><small>Доступ сотрудников</small><b data-hospital-employee-access>Выключен</b></span>
            </div>
            <div class="mn-hospital-stock-grid" data-hospital-stock-grid></div>

            <section class="mn-hospital-patient-tools" data-hospital-patient-tools hidden>
              <div class="mn-hospital-section-title">
                <span><b>Работа с пациентом</b><small>Лечение списывает препарат из вашей личной выдачи.</small></span>
              </div>
              <div class="mn-hospital-patient-form">
                <input type="text" maxlength="32" autocomplete="off" placeholder="Ник или Telegram ID пациента" data-hospital-patient-target />
                <select data-hospital-patient-medicine>
                  <option value="medicine_light">Простые таблетки</option>
                  <option value="medicine_strong">Среднеседативные таблетки</option>
                  <option value="medicine_resuscitation">Сильные седативные таблетки</option>
                </select>
                <button type="button" class="is-primary" data-hospital-treat>Начать лечение</button>
                <button type="button" data-hospital-sell>Продать 1 шт.</button>
              </div>
              <small class="mn-hospital-patient-rule">Для любого препарата у пациента должно быть минимум 40 еды.</small>
            </section>
          </section>

          <section data-hospital-warehouse-section="staff" hidden>
            <div class="mn-hospital-staff-editor" data-hospital-staff-editor hidden>
              <input type="text" maxlength="32" autocomplete="off" placeholder="Ник или Telegram ID сотрудника" data-hospital-staff-target />
              <select data-hospital-staff-rank>
                <option value="junior">Младший состав</option>
                <option value="middle">Средний состав</option>
                <option value="senior">Старший состав</option>
                <option value="dismissed">Уволить</option>
              </select>
              <button type="button" class="is-primary" data-hospital-staff-save>Сохранить должность</button>
            </div>
            <div class="mn-hospital-staff-list" data-hospital-staff-list></div>
          </section>

          <section data-hospital-warehouse-section="stats" hidden>
            <div class="mn-hospital-stats-list" data-hospital-stats-list></div>
          </section>
        </div>
      </section>
    </div>`;
}

function createStockCard(item, context, mode) {
  const meta = itemMeta(item);
  const element = document.createElement('article');
  const isUnifiedWarehouse = mode === 'manage' || mode === 'warehouse';
  const mayRefill = context?.permissions?.canRefill === true && (mode === 'refill' || isUnifiedWarehouse);
  const mayTake = (mode === 'take' || isUnifiedWarehouse) && canTakeItem(context, item.itemType);
  const mayOrderFood = false;

  element.className = 'mn-hospital-stock-card';
  element.dataset.itemType = item.itemType;
  element.innerHTML = `
    <div class="mn-hospital-stock-card-head">
      <span class="mn-hospital-stock-icon" aria-hidden="true">${escapeHtml(meta.icon)}</span>
      <span><strong>${escapeHtml(meta.label)}</strong><small>${escapeHtml(formatMedicineRule(item))}</small></span>
    </div>
    <div class="mn-hospital-stock-numbers">
      <span><small>На складе</small><b>${Number(item.warehouseQuantity || 0).toLocaleString('ru-RU')}</b></span>
      <span><small>У вас</small><b>${Number(item.personalQuantity || 0).toLocaleString('ru-RU')}</b></span>
    </div>
    <div class="mn-hospital-stock-actions">
      <input type="number" min="1" max="100000" step="1" value="10" aria-label="Количество" data-hospital-item-quantity />
      ${mayRefill ? '<button type="button" class="is-refill" data-hospital-refill>Положить</button>' : ''}
      ${mayTake ? '<button type="button" class="is-take" data-hospital-take>Взять</button>' : ''}
      ${mayOrderFood && mode === 'take' ? '<button type="button" data-hospital-order-food>Заказать</button>' : ''}
    </div>`;

  return element;
}

export function enableHospitalWarehouseFeature() {
  document.querySelectorAll('[data-hospital-warehouse]').forEach((element) => element.remove());
  document.body.insertAdjacentHTML('beforeend', markup());

  const overlay = document.querySelector('[data-hospital-warehouse]');
  const panel = overlay?.querySelector('.mn-hospital-warehouse-panel');
  const closeTargets = Array.from(overlay?.querySelectorAll('[data-hospital-warehouse-close]') || []);
  const tabs = Array.from(overlay?.querySelectorAll('[data-hospital-warehouse-tab]') || []);
  const sections = Array.from(overlay?.querySelectorAll('[data-hospital-warehouse-section]') || []);
  const loading = overlay?.querySelector('[data-hospital-warehouse-loading]');
  const body = overlay?.querySelector('[data-hospital-warehouse-body]');
  const message = overlay?.querySelector('[data-hospital-warehouse-message]');
  const subtitle = overlay?.querySelector('[data-hospital-warehouse-subtitle]');
  const role = overlay?.querySelector('[data-hospital-warehouse-role]');
  const modeLabel = overlay?.querySelector('[data-hospital-warehouse-mode]');
  const hospitalIdLabel = overlay?.querySelector('[data-hospital-warehouse-id]');
  const employeeAccessLabel = overlay?.querySelector('[data-hospital-employee-access]');
  const stockGrid = overlay?.querySelector('[data-hospital-stock-grid]');
  const patientTools = overlay?.querySelector('[data-hospital-patient-tools]');
  const patientTarget = overlay?.querySelector('[data-hospital-patient-target]');
  const patientMedicine = overlay?.querySelector('[data-hospital-patient-medicine]');
  const treatButton = overlay?.querySelector('[data-hospital-treat]');
  const sellButton = overlay?.querySelector('[data-hospital-sell]');
  const staffEditor = overlay?.querySelector('[data-hospital-staff-editor]');
  const staffTarget = overlay?.querySelector('[data-hospital-staff-target]');
  const staffRank = overlay?.querySelector('[data-hospital-staff-rank]');
  const staffSeniorRankOption = staffRank?.querySelector('option[value="senior"]');
  const staffSave = overlay?.querySelector('[data-hospital-staff-save]');
  const staffList = overlay?.querySelector('[data-hospital-staff-list]');
  const statsList = overlay?.querySelector('[data-hospital-stats-list]');

  if (!overlay || !panel) return { open: async () => false, close() {}, cleanup() {} };

  let currentHospitalId = '';
  let currentHospitalName = 'Больница';
  let currentHospitalCityId = '';
  let currentHospitalCityName = '';
  let currentHospitalNumber = null;
  let currentMode = 'take';
  let context = null;
  let requestBusy = false;
  let treatmentTimer = 0;
  let treatmentInFlight = false;
  let treatmentChannel = null;

  function setMessage(text, type = 'info') {
    if (!message) return;
    message.hidden = !text;
    message.textContent = text || '';
    message.dataset.type = type;
  }

  function setBusy(value) {
    requestBusy = Boolean(value);
    panel.dataset.busy = requestBusy ? 'true' : 'false';
    panel.querySelectorAll('button, input, select').forEach((element) => {
      if (element.matches('[data-hospital-warehouse-close], [data-hospital-warehouse-tab]')) return;
      element.disabled = requestBusy;
    });
  }

  function showTab(tabName) {
    tabs.forEach((button) => {
      button.dataset.active = button.dataset.hospitalWarehouseTab === tabName ? 'true' : 'false';
    });
    sections.forEach((section) => {
      section.hidden = section.dataset.hospitalWarehouseSection !== tabName;
    });

    if (tabName === 'staff') void loadEmployees();
    if (tabName === 'stats') void loadStats();
  }

  function renderContext() {
    if (!context) return;

    role.textContent = rankLabel(context.rank);
    role.dataset.rank = context.rank || 'none';
    modeLabel.textContent = currentMode === 'refill'
      ? 'Пополнение'
      : currentMode === 'manage'
        ? 'Склад'
        : 'Получение';
    const identity = context.hospital || {};
    if (identity.displayName) {
      currentHospitalName = identity.displayName;
      subtitle.textContent = identity.displayName;
    }
    hospitalIdLabel.textContent = identity.hospitalNumber
      ? `№${identity.hospitalNumber} · ${identity.cityName || identity.cityId || 'город не указан'}`
      : String(currentHospitalId).slice(-12);
    employeeAccessLabel.textContent = context.employeeAccessEnabled ? 'Включён' : 'Только администрация';
    employeeAccessLabel.dataset.enabled = context.employeeAccessEnabled ? 'true' : 'false';
    patientTools.hidden = currentMode !== 'take' || !context.allowed;
    treatButton.hidden = !MEDICINE_TYPES.some((itemType) => canTreatWith(context, itemType));
    sellButton.hidden = !MEDICINE_TYPES.some((itemType) => canSellItem(context, itemType));
    staffEditor.hidden = context.permissions?.canManageEmployees !== true;
    if (staffSeniorRankOption) {
      staffSeniorRankOption.hidden = context.isAdmin !== true;
      staffSeniorRankOption.disabled = context.isAdmin !== true;
      if (staffRank.value === 'senior' && context.isAdmin !== true) staffRank.value = 'junior';
    }
    const staffTab = tabs.find((button) => button.dataset.hospitalWarehouseTab === 'staff');
    const statsTab = tabs.find((button) => button.dataset.hospitalWarehouseTab === 'stats');
    if (staffTab) staffTab.hidden = true;
    if (statsTab) statsTab.hidden = true;

    const fragment = document.createDocumentFragment();
    (Array.isArray(context.items) ? context.items : [])
      .filter((item) => String(item.itemType || '') !== 'food')
      .forEach((item) => {
      fragment.appendChild(createStockCard(item, context, currentMode));
    });
    stockGrid.replaceChildren(fragment);

    Array.from(patientMedicine.options).forEach((option) => {
      option.disabled = !canTreatWith(context, option.value) && !canSellItem(context, option.value);
    });
  }

  async function refreshContext() {
    context = await invokeHospitalAction('context', {
      hospitalId: currentHospitalId,
      hospitalCityId: currentHospitalCityId,
      hospitalCityName: currentHospitalCityName,
      hospitalNumber: currentHospitalNumber,
    });

    if (!context?.allowed) {
      body.hidden = true;
      loading.hidden = true;
      setMessage(
        context?.reason === 'ADMIN_ONLY'
          ? 'Администрация временно отключила доступ сотрудников к складу этой больницы.'
          : 'Вы не состоите в штате этой больницы или ваша должность не даёт доступ к складу.',
        'error'
      );
      return false;
    }

    if (currentMode === 'refill' && context.permissions?.canRefill !== true) {
      body.hidden = true;
      loading.hidden = true;
      setMessage('Этот пикап доступен только старшему составу и администрации.', 'error');
      return false;
    }

    loading.hidden = true;
    body.hidden = false;
    setMessage('');
    renderContext();
    return true;
  }

  async function runStockAction(action, itemType, quantity) {
    if (requestBusy) return;
    setBusy(true);
    setMessage('Выполняю операцию…');

    try {
      await invokeHospitalAction(action, {
        hospitalId: currentHospitalId,
        itemType,
        quantity,
      });
      await refreshContext();
      setMessage(action === 'refill' ? 'Предметы положены на склад.' : action === 'take' ? 'Предметы выданы вам со склада.' : 'Заказ продуктов создан.', 'success');
    } catch (error) {
      setMessage(userErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function loadEmployees(force = false) {
    if (!context?.permissions?.canManageEmployees || (requestBusy && !force)) return;
    staffList.innerHTML = '<div class="mn-hospital-empty">Загрузка сотрудников…</div>';
    try {
      const result = await invokeHospitalAction('employees', { hospitalId: currentHospitalId });
      const employees = Array.isArray(result?.employees) ? result.employees : [];
      if (!employees.length) {
        staffList.innerHTML = '<div class="mn-hospital-empty">Сотрудники ещё не назначены.</div>';
        return;
      }
      staffList.replaceChildren(...employees.map((employee) => {
        const row = document.createElement('article');
        row.className = 'mn-hospital-staff-row';
        row.innerHTML = `
          <span><strong>${escapeHtml(employee.nickname || 'Игрок')}</strong><small>${escapeHtml(employee.tgId)}</small></span>
          <b>${escapeHtml(rankLabel(employee.rank))}</b>
          <span class="mn-hospital-staff-mini-stats">Вылечено: ${Number(employee.playersTreated || 0)} · Продано: ${Number(employee.medicinesSold || 0)}</span>`;
        return row;
      }));
    } catch (error) {
      staffList.innerHTML = `<div class="mn-hospital-empty is-error">${escapeHtml(userErrorMessage(error))}</div>`;
    }
  }

  async function loadStats() {
    if (!context?.permissions?.canViewStats || requestBusy) return;
    statsList.innerHTML = '<div class="mn-hospital-empty">Загрузка статистики…</div>';
    try {
      const result = await invokeHospitalAction('stats', { hospitalId: currentHospitalId });
      const stats = Array.isArray(result?.stats) ? result.stats : [];
      if (!stats.length) {
        statsList.innerHTML = '<div class="mn-hospital-empty">Статистика пока пустая.</div>';
        return;
      }
      statsList.replaceChildren(...stats.map((entry) => {
        const row = document.createElement('article');
        row.className = 'mn-hospital-stat-row';
        row.innerHTML = `
          <span><strong>${escapeHtml(entry.nickname || 'Игрок')}</strong><small>${escapeHtml(rankLabel(entry.rank))}</small></span>
          <span><small>Лечений</small><b>${Number(entry.playersTreated || 0)}</b></span>
          <span><small>Выдано</small><b>${Number(entry.medicinesGiven || 0)}</b></span>
          <span><small>Продано</small><b>${Number(entry.medicinesSold || 0)}</b></span>
          <span><small>Восстановлено HP</small><b>${Number(entry.healthRestored || 0).toFixed(1)}</b></span>`;
        return row;
      }));
    } catch (error) {
      statsList.innerHTML = `<div class="mn-hospital-empty is-error">${escapeHtml(userErrorMessage(error))}</div>`;
    }
  }

  async function saveEmployeeRank() {
    const target = String(staffTarget.value || '').trim();
    const rank = String(staffRank.value || '').trim();
    if (!target || requestBusy) return;

    setBusy(true);
    try {
      await invokeHospitalAction('set_employee_rank', {
        hospitalId: currentHospitalId,
        target,
        rank,
      });
      staffTarget.value = '';
      setMessage('Должность сотрудника обновлена.', 'success');
      await loadEmployees(true);
    } catch (error) {
      setMessage(userErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function treatPatient() {
    const target = String(patientTarget.value || '').trim();
    const medicineType = String(patientMedicine.value || '').trim();
    if (!target || requestBusy) return;

    setBusy(true);
    try {
      const result = await invokeHospitalAction('treat', {
        hospitalId: currentHospitalId,
        target,
        medicineType,
      });
      await notifyHospitalTreatmentStarted(result?.patientTgId, currentHospitalId);
      setMessage(`Лечение для ${result?.patientNickname || target} запущено на 60 секунд.`, 'success');
      await refreshContext();
    } catch (error) {
      setMessage(userErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function sellMedicine() {
    const target = String(patientTarget.value || '').trim();
    const medicineType = String(patientMedicine.value || '').trim();
    if (!target || requestBusy) return;

    setBusy(true);
    try {
      const result = await invokeHospitalAction('sell', {
        hospitalId: currentHospitalId,
        target,
        medicineType,
        quantity: 1,
      });
      setMessage(`Продано: ${result?.quantity || 1} шт. на сумму ${Number(result?.totalPrice || 0).toLocaleString('ru-RU')} ₴.`, 'success');
      await refreshContext();
    } catch (error) {
      setMessage(userErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mn-hospital-warehouse-open');
    document.documentElement.classList.remove('mn-hospital-warehouse-open');
    window.__MN_HOSPITAL_WAREHOUSE_OPEN__ = false;
  }

  async function open({
    mode = 'take', hospitalId, hospitalName = 'Больница', hospitalCityId = '',
    hospitalCityName = '', hospitalNumber = null, initialTab = 'stock',
  } = {}) {
    currentHospitalId = String(hospitalId || '').trim();
    currentHospitalName = String(hospitalName || 'Больница').trim();
    currentHospitalCityId = String(hospitalCityId || '').trim();
    currentHospitalCityName = String(hospitalCityName || '').trim();
    currentHospitalNumber = Number.isSafeInteger(Number(hospitalNumber)) && Number(hospitalNumber) > 0
      ? Number(hospitalNumber)
      : null;
    currentMode = mode === 'refill'
      ? 'refill'
      : mode === 'manage' || mode === 'warehouse'
        ? 'manage'
        : 'take';

    if (!currentHospitalId) return false;

    subtitle.textContent = currentHospitalName;
    loading.hidden = false;
    body.hidden = true;
    context = null;
    setMessage('');
    showTab('stock');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-hospital-warehouse-open');
    document.documentElement.classList.add('mn-hospital-warehouse-open');
    window.__MN_HOSPITAL_WAREHOUSE_OPEN__ = true;

    try {
      const opened = await refreshContext();
      if (
        opened &&
        initialTab === 'staff' &&
        context?.permissions?.canManageEmployees === true
      ) showTab('staff');
      return opened;
    } catch (error) {
      loading.hidden = true;
      body.hidden = true;
      setMessage(userErrorMessage(error), 'error');
      return false;
    }
  }

  async function processMyTreatment() {
    if (treatmentInFlight || !telegramInitData()) return;
    treatmentInFlight = true;

    try {
      const result = await invokeHospitalAction('process_treatment');
      const vitals = {};

      ['health', 'food', 'water'].forEach((key) => {
        const rawValue = result?.[key];
        if (rawValue === undefined || rawValue === null) return;
        const value = Number(rawValue);
        if (Number.isFinite(value)) vitals[key] = value;
      });

      if (Object.keys(vitals).length) {
        state.player = { ...(state.player || {}), ...vitals };
        window.dispatchEvent(new CustomEvent('mn:player-vitals-changed', {
          detail: {
            vitals,
            source: 'hospital_treatment',
            animateDamage: false,
            result,
          },
        }));
      }

      window.dispatchEvent(new CustomEvent('mn:player-treatment-state-changed', {
        detail: {
          active: result?.active === true,
          nextPollMs: Number(result?.nextPollMs || 0),
          source: 'hospital_treatment',
          result,
        },
      }));

      window.clearTimeout(treatmentTimer);
      treatmentTimer = result?.active
        ? window.setTimeout(processMyTreatment, Math.max(1500, Number(result.nextPollMs || 2000)))
        : 0;
    } catch (error) {
      console.warn('[hospitalWarehouse] treatment processing failed:', error);
      window.clearTimeout(treatmentTimer);
      treatmentTimer = window.setTimeout(processMyTreatment, 10000);
    } finally {
      treatmentInFlight = false;
    }
  }

  function handleStockClick(event) {
    const card = event.target.closest('[data-item-type]');
    if (!card || requestBusy) return;
    const itemType = card.dataset.itemType;
    const quantity = Math.max(1, Math.floor(Number(card.querySelector('[data-hospital-item-quantity]')?.value || 1)));

    if (event.target.closest('[data-hospital-refill]')) void runStockAction('refill', itemType, quantity);
    if (event.target.closest('[data-hospital-take]')) void runStockAction('take', itemType, quantity);
    if (event.target.closest('[data-hospital-order-food]')) void runStockAction('order_food', itemType, quantity);
  }

  function handleKeyDown(event) {
    if (overlay.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (event.code === 'Escape' && !event.repeat) close();
  }

  function handleLocalTreatmentStarted() {
    window.clearTimeout(treatmentTimer);
    treatmentTimer = window.setTimeout(processMyTreatment, 250);
  }

  closeTargets.forEach((button) => button.addEventListener('click', close));
  tabs.forEach((button) => button.addEventListener('click', () => showTab(button.dataset.hospitalWarehouseTab)));
  stockGrid.addEventListener('click', handleStockClick);
  treatButton.addEventListener('click', treatPatient);
  sellButton.addEventListener('click', sellMedicine);
  staffSave.addEventListener('click', saveEmployeeRank);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('mn:hospital-treatment-started-local', handleLocalTreatmentStarted);

  const tgId = localTelegramId();
  if (tgId) {
    treatmentChannel = supabase.channel(`mn-hospital-treatment:${tgId}`);
    treatmentChannel.on('broadcast', { event: 'treatment_started' }, () => {
      window.clearTimeout(treatmentTimer);
      treatmentTimer = window.setTimeout(processMyTreatment, 250);
    });
    treatmentChannel.subscribe();
    treatmentTimer = window.setTimeout(processMyTreatment, 1200);
  }

  return {
    open,
    close,
    cleanup() {
      close();
      window.clearTimeout(treatmentTimer);
      closeTargets.forEach((button) => button.removeEventListener('click', close));
      stockGrid.removeEventListener('click', handleStockClick);
      treatButton.removeEventListener('click', treatPatient);
      sellButton.removeEventListener('click', sellMedicine);
      staffSave.removeEventListener('click', saveEmployeeRank);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mn:hospital-treatment-started-local', handleLocalTreatmentStarted);
      if (treatmentChannel) supabase.removeChannel(treatmentChannel);
      overlay.remove();
    },
  };
}

