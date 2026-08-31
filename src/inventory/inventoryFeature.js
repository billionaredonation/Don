// Hospital batch refresh 2026-07-20: inventory medical items deploy marker.
import './inventory.css';
import { state } from '../state.js';
import { loadFarmInventory } from '../farm/farmApi.js';
import { loadMineInventory } from '../mine/mineApi.js';
import { loadLumberInventory } from '../lumber/lumberApi.js';
import { loadBusinessInventory, useBusinessInventoryItem } from '../business/businessApi.js';
import { getBusinessProduct } from '../business/businessConfig.js';
import { getMineBaseGradePrice, parseMineGradeItemType } from '../mine/mineConfig.js';
import { getPlayerVitalsConfig } from '../player/playerStatsConfig.js';
import { applyPlayerPositionVitalRestore } from '../player/playerPosition.js';
import {
  getHospitalUserErrorMessage,
  loadMyMedicalInventory,
  useInventoryItem,
} from '../hospital/hospitalWarehouseFeature.js';

export const INVENTORY_ROWS = 10;
export const INVENTORY_COLUMNS = 10;
export const INVENTORY_SLOT_COUNT = INVENTORY_ROWS * INVENTORY_COLUMNS;

const INVENTORY_HOTKEY_CODE = 'KeyI';
const INVENTORY_OPEN_CLASS = 'mn-inventory-open';
const INVENTORY_LAYOUT_STORAGE_PREFIX = 'mn-game:inventory-layout:v1';
const VITALS_CONFIG = getPlayerVitalsConfig();
const HUNGER_WARNING_THRESHOLD = 40;
const THIRST_WARNING_THRESHOLD = 40;
const CRITICAL_VITAL_THRESHOLD = 20;
const FARM_RAKE_ASSET_URL = `${String(import.meta.env.BASE_URL || '/')}grabl.png`;
const LUMBER_CHAINSAW_ASSET_URL = `${String(import.meta.env.BASE_URL || '/')}benzopila.png`;
const LUMBER_BEAM_ASSET_URL = `${String(import.meta.env.BASE_URL || '/')}brus.png`;
const ITEM_META = Object.freeze({
  food: { label: 'Обед', icon: '🍔' },
  water_bottle: { label: 'Бутылка воды', icon: '🧴' },
  medicine_light: { label: 'Простые таблетки', icon: '💊' },
  medicine_strong: { label: 'Среднеседативные таблетки', icon: '💉' },
  medicine_resuscitation: { label: 'Сильные седативные таблетки', icon: '⚕' },
  farm_rake: { label: 'Грабли', icon: 'Г' },
  farm_scissors: { label: 'Ножницы', icon: '✂️' },
  farm_water_bottle: { label: 'Вода для полива', icon: '💧' },
  farm_apple: { label: 'Яблоко', icon: '🍎' },
  farm_wheat: { label: 'Пшеница', icon: '🌾' },
  farm_orange: { label: 'Апельсин', icon: '🍊' },
  farm_corn: { label: 'Кукуруза', icon: '🌽' },
  mine_tool_pickaxe: { label: 'Шахтёрская кирка', icon: '⛏️' },
  lumber_tool_axe: { label: 'Топор лесоруба', icon: '🪓' },
  lumber_tool_chainsaw: { label: 'Бензопила', icon: '🪚' },
  lumber_log: { label: 'Бревно', icon: '🪵' },
  lumber_beam: { label: 'Брус', icon: '▰' },
  construction_board: { label: 'Обрезная доска', icon: '🪚' },
  construction_timber: { label: 'Строительный брус', icon: '▰' },
  construction_plywood: { label: 'Фанерный лист', icon: '🟫' },
  grocery_bread: { label: 'Хлеб', icon: '🍞' },
  grocery_milk: { label: 'Молоко', icon: '🥛' },
  grocery_apple: { label: 'Яблоко', icon: '🍎' },
  grocery_canned_food: { label: 'Консервы', icon: '🥫' },
  grocery_water: { label: 'Вода', icon: '💧' },
  grocery_snack: { label: 'Снеки', icon: '🍪' },
  grocery_apple_juice: { label: 'Яблочный сок', icon: '🧃' },
  grocery_orange_juice: { label: 'Апельсиновый сок', icon: '🥤' },
  grocery_fruit_puree: { label: 'Фруктовое пюре', icon: '🥫' },
  grocery_fruit_salad: { label: 'Фруктовый салат', icon: '🥗' },
  food_wheat_flour:{label:'Пшеничная мука',icon:'🥣'},food_corn_flour:{label:'Кукурузная мука',icon:'🟡'},wood_dry_board:{label:'Сухая доска',icon:'🪵'},wood_furniture_panel:{label:'Мебельный щит',icon:'🟫'},construction_cement:{label:'Цемент',icon:'⚪'},construction_concrete:{label:'Бетонная смесь',icon:'🧱'},metal_steel:{label:'Стальной прокат',icon:'🔩'},metal_copper:{label:'Медная катанка',icon:'🟠'},electric_copper_wire:{label:'Медный провод',icon:'🧵'},electric_power_cable:{label:'Силовой кабель',icon:'🔌'},
});
const VITAL_ALIASES = Object.freeze({
  health: ['health', 'hp', 'healthPoints', 'health_points'],
  food: ['food', 'hunger', 'satiety'],
  water: ['water', 'thirst', 'hydration'],
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getInventoryItemLayoutKey(item = {}) {
  const itemType = String(item?.itemType || item?.item_type || '').trim();
  const source = String(item?.source || item?.inventorySource || 'personal').trim().toLowerCase();
  const hospitalId = String(item?.hospitalId || item?.hospital_id || '').trim();
  const explicitId = String(item?.inventoryItemId || item?.inventory_item_id || item?.itemId || '').trim();
  return [source, hospitalId, itemType, explicitId].join(':');
}

function getItemIconMarkup(itemType, fallbackIcon = '□') {
  if (String(itemType || '') === 'farm_rake') {
    return `<img class="mn-inventory-farm-rake-icon" src="${FARM_RAKE_ASSET_URL}" alt="">`;
  }
  if (String(itemType || '') === 'lumber_tool_chainsaw') {
    return `<img class="mn-inventory-lumber-asset" src="${LUMBER_CHAINSAW_ASSET_URL}" alt="">`;
  }
  if (String(itemType || '') === 'lumber_beam') {
    return `<img class="mn-inventory-lumber-asset" src="${LUMBER_BEAM_ASSET_URL}" alt="">`;
  }
  if (String(itemType || '') !== 'water_bottle') return escapeHtml(fallbackIcon || '□');

  return `
    <svg class="mn-inventory-water-bottle-icon" viewBox="0 0 24 32" aria-hidden="true">
      <rect x="8" y="1" width="8" height="4" rx="1.2" fill="#d9f3ff"></rect>
      <path d="M8 5h8v4c2.6 1.5 4 3.8 4 7v10.5c0 2.5-1.8 4.5-4.2 4.5H8.2C5.8 31 4 29 4 26.5V16c0-3.2 1.4-5.5 4-7V5Z" fill="#b8e8ff" stroke="#effbff" stroke-width="1.2"></path>
      <path d="M5 18h14v8.5c0 1.9-1.2 3.3-3.2 3.3H8.2C6.2 29.8 5 28.4 5 26.5V18Z" fill="#329cff"></path>
      <rect x="6.5" y="12" width="11" height="6.5" rx="2" fill="#f7fcff" opacity=".92"></rect>
      <path d="M9 15.4c1.6-2.1 4.4-2.1 6 0-1.6 1.9-4.4 1.9-6 0Z" fill="#32a8ff"></path>
    </svg>`;
}

function resolveItemMeta(item = {}) {
  const itemType = String(item.itemType || item.item_type || '').trim();
  const mineGrade = parseMineGradeItemType(itemType);

  if (mineGrade) {
    return {
      label: `${mineGrade.subtype.label} · ${mineGrade.quality.shortLabel}`,
      icon: mineGrade.subtype.icon,
      mineGrade,
    };
  }

  return ITEM_META[itemType] || {
    label: item.label || itemType || 'Предмет',
    icon: item.icon || '□',
    mineGrade: null,
  };
}

function publishInventorySnapshot(items = []) {
  const snapshot = (Array.isArray(items) ? items : [])
    .filter((item) => item && Number(item.quantity || 0) > 0)
    .map((item) => ({ ...item }));

  window.__MN_PLAYER_INVENTORY_ITEMS__ = snapshot;
  window.dispatchEvent(new CustomEvent('mn:player-inventory-snapshot', {
    detail: { items: snapshot },
  }));
}

function getConsumptionEffectType(itemType) {
  const normalized = String(itemType || '').trim().toLowerCase();
  if (normalized.startsWith('grocery_')) {
    const product = getBusinessProduct(normalized);
    return Number(product?.waterRestore || 0) > Number(product?.foodRestore || 0) ? 'water' : 'food';
  }
  if (normalized.startsWith('farm_')) return '';
  if (normalized.startsWith('mine_')) return '';
  if (normalized.startsWith('lumber_')) return '';
  if (normalized === 'water' || normalized === 'drink' || normalized.includes('water') || normalized.includes('drink')) {
    return 'water';
  }
  if (normalized === 'food' || normalized.includes('food') || normalized.includes('meal')) return 'food';
  return '';
}

function clampVital(value, key) {
  const config = VITALS_CONFIG[key] || {};
  const min = Number.isFinite(Number(config.min)) ? Number(config.min) : 0;
  const max = Number.isFinite(Number(config.max)) ? Number(config.max) : 100;
  const fallback = Number.isFinite(Number(config.defaultValue))
    ? Number(config.defaultValue)
    : max;
  const number = Number(value);

  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback));
}

function optionalFiniteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readVital(source, key, fallback) {
  const aliases = VITAL_ALIASES[key] || [key];

  for (const field of aliases) {
    const value = source?.[field];

    if (value === undefined || value === null || value === '') continue;
    if (Number.isFinite(Number(value))) return clampVital(value, key);
  }

  return clampVital(fallback, key);
}

function hasVital(source, key) {
  return (VITAL_ALIASES[key] || [key]).some((field) => {
    const value = source?.[field];
    return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
  });
}

function getStateVitals(fallback = {}) {
  const player = state.player || {};

  return {
    health: readVital(player, 'health', fallback.health),
    food: readVital(player, 'food', fallback.food),
    water: readVital(player, 'water', fallback.water),
  };
}

function getVitalsSnapshotFromEvent(event) {
  const detail = event?.detail || {};
  const payload = detail.payload || {};

  return Object.assign(
    {},
    payload.record || {},
    payload.new_record || {},
    payload.new || {},
    detail.player || {},
    detail.vitals || {},
    detail
  );
}

function getHealthThreshold() {
  const threshold = Number(VITALS_CONFIG.health?.lowThreshold);
  return Number.isFinite(threshold) ? threshold : 50;
}

function getVitalAlerts(vitals) {
  const health = Math.round(vitals.health);
  const food = Math.round(vitals.food);
  const water = Math.round(vitals.water);
  const alerts = [];

  if (health < 30) {
    alerts.push({
      code: 'hospital-reconnect',
      severity: 'danger',
      icon: '🏥',
      title: 'Требуется лечение в больнице',
      text: 'При перезаходе вы будете автоматически отправлены в больницу. Свободный выход доступен с 30 HP.',
    });
  }

  if (health < getHealthThreshold()) {
    alerts.push({
      code: 'low-health',
      severity: health < CRITICAL_VITAL_THRESHOLD ? 'danger' : 'warning',
      icon: '🫀',
      title: `У вас мало HP — ${health}%`,
      text: 'Восстановите здоровье едой, отдыхом или доступными лекарствами.',
    });
  }

  if (food < HUNGER_WARNING_THRESHOLD) {
    alerts.push({
      code: 'hunger',
      severity: food < CRITICAL_VITAL_THRESHOLD ? 'danger' : 'warning',
      icon: '🍽',
      title: `Вы голодны — ${food}%`,
      text: 'Поешьте как можно скорее, чтобы не допустить истощения.',
    });
  }

  if (water < THIRST_WARNING_THRESHOLD) {
    alerts.push({
      code: 'thirst',
      severity: water < CRITICAL_VITAL_THRESHOLD ? 'danger' : 'warning',
      icon: '🥛',
      title: `Нехватка воды — ${water}%`,
      text: 'Попейте как можно скорее, чтобы не допустить обезвоживания.',
    });
  }

  if (!alerts.length) {
    alerts.push({
      code: 'stable',
      severity: 'ok',
      icon: '✓',
      title: 'Состояние стабильное',
      text: 'Здоровье, питание и вода находятся в норме.',
    });
  }

  return alerts;
}

function isTypingTarget(target) {
  const element = target instanceof Element ? target : document.activeElement;

  return Boolean(
    element?.closest?.('input, textarea, select, [contenteditable="true"]') ||
    element?.isContentEditable
  );
}

function isVisible(element) {
  if (!element || element.hidden || element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  const style = window.getComputedStyle(element);

  return style.display !== 'none' && style.visibility !== 'hidden';
}

function hasBlockingInterface() {
  if (
    window.__MN_HOUSE_SPAWN_PICKER_ACTIVE__ === true ||
    window.__MN_HOSPITAL_CAFETERIA_OPEN__ === true ||
    window.__MN_HOSPITAL_RECEPTION_OPEN__ === true ||
    document.body.classList.contains('mn-house-trade-open') ||
    document.body.classList.contains('mn-houses-modal-open') ||
    document.body.classList.contains('mn-house-details-open') ||
    document.body.classList.contains('mn-house-spawn-open') ||
    document.body.classList.contains('mn-player-interaction-open') ||
    document.body.classList.contains('mn-lumber-modal-open') ||
    document.body.classList.contains('mn-lumber-minigame-open') ||
    document.body.classList.contains('admin-mode') ||
    document.body.classList.contains('mn-interior-collider-editor-open') ||
    document.body.classList.contains('mn-interior-object-editor-open')
  ) {
    return true;
  }

  return Array.from(document.querySelectorAll([
    '[data-house-trade-offer]',
    '.houses-modal',
    '.house-details-modal',
    '.house-selection-panel',
    '.admin-panel',
    '[data-interior-collider-panel]',
    '[data-interior-object-panel]',
  ].join(','))).some(isVisible);
}

function renderSlots() {
  return Array.from({ length: INVENTORY_SLOT_COUNT }, (_, index) => {
    const slotNumber = index + 1;
    const row = Math.floor(index / INVENTORY_COLUMNS) + 1;
    const column = (index % INVENTORY_COLUMNS) + 1;

    return `
      <div
        class="mn-inventory-slot"
        role="gridcell"
        aria-label="Пустая ячейка ${slotNumber}"
        data-inventory-slot="${index}"
        data-inventory-row="${row}"
        data-inventory-column="${column}"
      ></div>`;
  }).join('');
}

function renderMedicalItems(slotItems = []) {
  return Array.from({ length: INVENTORY_SLOT_COUNT }, (_, index) => {
    const item = slotItems[index];
    const slotNumber = index + 1;
    const row = Math.floor(index / INVENTORY_COLUMNS) + 1;
    const column = (index % INVENTORY_COLUMNS) + 1;

    if (!item) {
      return `
        <div
          class="mn-inventory-slot"
          role="gridcell"
          aria-label="Пустая ячейка ${slotNumber}"
          data-inventory-slot="${index}"
          data-inventory-row="${row}"
          data-inventory-column="${column}"
        ></div>`;
    }

    const itemType = String(item.itemType || '');
    const meta = resolveItemMeta(item);
    const quantity = Number(item.quantity || 0);
    const lumberResource = itemType === 'lumber_log' || itemType === 'lumber_beam';
    const unitLabel = String(item.unitLabel || ((itemType.startsWith('mine_') && itemType !== 'mine_tool_pickaxe') || lumberResource ? 'кг' : 'шт.'));
    const source = String(item.source || item.inventorySource || 'personal').toLowerCase();
    const isServiceStock = source === 'employee' || source === 'staff' || source === 'service';
    const label = meta.mineGrade ? meta.label : (item.label || meta.label);
    const sourceLabel = isServiceStock
      ? `Служебные${item.hospitalName ? ` · ${item.hospitalName}` : ''}`
      : 'Личные';
    const safeLabel = escapeHtml(label);
    const safeSourceLabel = escapeHtml(sourceLabel);
    const safeItemType = escapeHtml(itemType);
    const safeHospitalId = escapeHtml(item.hospitalId || '');
    const safeItemKey = escapeHtml(getInventoryItemLayoutKey(item));
    const classes = [
      'mn-inventory-slot',
      'mn-inventory-item',
      isServiceStock ? 'mn-inventory-item-service' : '',
      itemType === 'food' ? 'mn-inventory-item-food' : '',
      itemType === 'water_bottle' ? 'mn-inventory-item-water' : '',
      itemType.startsWith('farm_') ? 'mn-inventory-item-farm' : '',
      itemType.startsWith('mine_') ? 'mn-inventory-item-mine' : '',
      itemType.startsWith('lumber_') ? 'mn-inventory-item-lumber' : '',
      itemType.startsWith('grocery_') ? 'mn-inventory-item-food' : '',
    ].filter(Boolean).join(' ');

    return `
      <button
        class="${classes}"
        type="button"
        role="gridcell"
        draggable="true"
        aria-label="${safeLabel}: ${quantity} ${escapeHtml(unitLabel)} · ${safeSourceLabel}"
        data-inventory-slot="${index}"
        data-inventory-row="${row}"
        data-inventory-column="${column}"
        data-inventory-item-index="${index}"
        data-inventory-item-key="${safeItemKey}"
        data-inventory-item-type="${safeItemType}"
        data-inventory-item-source="${escapeHtml(source)}"
        data-inventory-item-hospital-id="${safeHospitalId}"
      >
        <span>${getItemIconMarkup(itemType, meta.icon)}</span>
        <b>${quantity}</b>
      </button>`;
  }).join('');
}

function characterMarkup(vitals) {
  const health = Math.round(vitals.health);
  const food = Math.round(vitals.food);
  const water = Math.round(vitals.water);

  return `
    <aside class="mn-inventory-character-pane" aria-label="Состояние игрового персонажа">
      <div class="mn-inventory-character-card" data-inventory-character>
        <span class="mn-inventory-character-caption">Игровой персонаж</span>

        <svg
          class="mn-inventory-character-silhouette"
          viewBox="0 0 160 240"
          role="img"
          aria-label="Нейтральный силуэт игрового персонажа"
        >
          <defs>
            <linearGradient id="mn-character-body-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#f2cd75" />
              <stop offset="1" stop-color="#7c632d" />
            </linearGradient>
          </defs>
          <circle class="mn-character-head" cx="80" cy="40" r="23" />
          <path
            class="mn-character-body"
            d="M53 86 Q80 70 107 86 L124 148 L107 154 L99 124 L99 211 L84 211 L80 154 L76 211 L61 211 L61 124 L53 154 L36 148 Z"
          />
          <path class="mn-character-detail" d="M61 106 H99 M80 82 V154" />
        </svg>

        <span class="mn-inventory-character-state" data-character-state>Состояние</span>
      </div>

      <div class="mn-inventory-vitals" aria-label="Показатели персонажа">
        <div class="mn-inventory-vital mn-inventory-vital-health" role="meter" aria-label="Здоровье" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${health}" data-inventory-vital="health">
          <span>🫀</span><b data-inventory-vital-value>${health}</b>
          <i style="--mn-inventory-vital-value:${health}%"></i>
        </div>
        <div class="mn-inventory-vital mn-inventory-vital-food" role="meter" aria-label="Еда" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${food}" data-inventory-vital="food">
          <span>🍽</span><b data-inventory-vital-value>${food}</b>
          <i style="--mn-inventory-vital-value:${food}%"></i>
        </div>
        <div class="mn-inventory-vital mn-inventory-vital-water" role="meter" aria-label="Вода" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${water}" data-inventory-vital="water">
          <span>🥛</span><b data-inventory-vital-value>${water}</b>
          <i style="--mn-inventory-vital-value:${water}%"></i>
        </div>
      </div>

      <div class="mn-inventory-alerts" aria-live="polite" data-inventory-alerts></div>
    </aside>`;
}

function inventoryMarkup(initialVitals) {
  return `
    <div class="mn-inventory" data-mn-inventory hidden aria-hidden="true">
      <button
        class="mn-inventory-backdrop"
        type="button"
        tabindex="-1"
        aria-label="Закрыть инвентарь"
        data-inventory-close
      ></button>

      <section
        class="mn-inventory-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mn-inventory-title"
        aria-describedby="mn-inventory-description"
      >
        <header class="mn-inventory-header">
          <span class="mn-inventory-emblem" aria-hidden="true">
            <span></span>
          </span>

          <span class="mn-inventory-heading">
            <span class="mn-inventory-kicker">Снаряжение игрока</span>
            <strong id="mn-inventory-title">Инвентарь</strong>
          </span>

          <span class="mn-inventory-capacity" aria-label="Занято ноль из ста ячеек">
            <b>0</b><i>/</i><span>${INVENTORY_SLOT_COUNT}</span>
          </span>

          <button
            class="mn-inventory-close"
            type="button"
            aria-label="Закрыть инвентарь"
            title="Закрыть (I / Ш)"
            data-inventory-close
          >
            <span aria-hidden="true"></span>
          </button>
        </header>

        <p class="mn-inventory-description" id="mn-inventory-description">
          Первая страница · ${INVENTORY_ROWS} × ${INVENTORY_COLUMNS} ячеек
        </p>

        <div class="mn-inventory-content">
          ${characterMarkup(initialVitals)}

          <div class="mn-inventory-storage">
            <div
              class="mn-inventory-grid"
              role="grid"
              aria-label="Ячейки инвентаря"
              aria-rowcount="${INVENTORY_ROWS}"
              aria-colcount="${INVENTORY_COLUMNS}"
              data-inventory-grid
            >
              ${renderSlots()}
            </div>
          </div>
        </div>

        <footer class="mn-inventory-footer">
          <span class="mn-inventory-page-label">Страница</span>
          <strong class="mn-inventory-page">1 <i>/</i> 1</strong>
          <span class="mn-inventory-hotkey"><kbd>I</kbd><i>/</i><kbd>Ш</kbd> закрыть</span>
        </footer>
      </section>

      <aside class="mn-inventory-item-menu" data-inventory-item-menu hidden aria-hidden="true">
        <div class="mn-inventory-item-menu-card" role="dialog" aria-modal="false" aria-label="Действия с предметом">
          <header>
            <span data-inventory-item-menu-icon aria-hidden="true">□</span>
            <strong data-inventory-item-menu-title>Предмет</strong>
            <small data-inventory-item-menu-quantity>0 шт.</small>
          </header>
          <div class="mn-inventory-item-menu-actions">
            <button type="button" class="is-primary" data-inventory-item-apply>Применить</button>
            <button type="button" data-inventory-item-info-button>Информация</button>
            <button type="button" data-inventory-item-menu-close>Закрыть</button>
          </div>
          <div class="mn-inventory-item-info" data-inventory-item-info hidden></div>
        </div>
      </aside>
    </div>`;
}

function vitalNoticeMarkup() {
  return `
    <div class="mn-vital-notice" data-mn-vital-notice hidden aria-live="polite" aria-atomic="true">
      <span class="mn-vital-notice-icon" data-vital-notice-icon aria-hidden="true"></span>
      <span class="mn-vital-notice-copy">
        <strong data-vital-notice-title></strong>
        <small data-vital-notice-text></small>
      </span>
    </div>`;
}

export function enableInventoryFeature() {
  document.querySelectorAll('[data-mn-inventory]').forEach((element) => element.remove());
  document.querySelectorAll('[data-mn-vital-notice]').forEach((element) => element.remove());

  const initialVitals = getStateVitals();

  document.body.insertAdjacentHTML('beforeend', inventoryMarkup(initialVitals));
  document.body.insertAdjacentHTML('beforeend', vitalNoticeMarkup());

  const overlay = document.querySelector('[data-mn-inventory]');
  const panel = overlay?.querySelector('.mn-inventory-panel');
  const closeButton = overlay?.querySelector('.mn-inventory-close');
  const closeTargets = Array.from(overlay?.querySelectorAll('[data-inventory-close]') || []);
  const inventoryGrid = overlay?.querySelector('[data-inventory-grid]');
  const character = overlay?.querySelector('[data-inventory-character]');
  const characterState = overlay?.querySelector('[data-character-state]');
  const alertsElement = overlay?.querySelector('[data-inventory-alerts]');
  const vitalElements = new Map(
    Array.from(overlay?.querySelectorAll('[data-inventory-vital]') || [])
      .map((element) => [element.dataset.inventoryVital, element])
  );
  const vitalNotice = document.querySelector('[data-mn-vital-notice]');
  const vitalNoticeIcon = vitalNotice?.querySelector('[data-vital-notice-icon]');
  const vitalNoticeTitle = vitalNotice?.querySelector('[data-vital-notice-title]');
  const vitalNoticeText = vitalNotice?.querySelector('[data-vital-notice-text]');
  const itemMenu = overlay?.querySelector('[data-inventory-item-menu]');
  const itemMenuIcon = itemMenu?.querySelector('[data-inventory-item-menu-icon]');
  const itemMenuTitle = itemMenu?.querySelector('[data-inventory-item-menu-title]');
  const itemMenuQuantity = itemMenu?.querySelector('[data-inventory-item-menu-quantity]');
  const itemMenuInfo = itemMenu?.querySelector('[data-inventory-item-info]');
  const itemMenuApply = itemMenu?.querySelector('[data-inventory-item-apply]');
  const itemMenuInfoButton = itemMenu?.querySelector('[data-inventory-item-info-button]');
  const itemMenuClose = itemMenu?.querySelector('[data-inventory-item-menu-close]');

  if (!overlay || !panel || !closeButton) {
    return () => {};
  }

  let open = false;
  let previousFocus = null;
  let currentVitals = { ...initialVitals };
  let medicalItems = [];
  let inventorySlotItems = Array(INVENTORY_SLOT_COUNT).fill(null);
  let inventorySlotLayout = {};
  let inventoryBusy = false;
  let selectedInventoryItem = null;
  let draggedInventoryItemKey = '';
  let pointerDrag = null;
  let lastInventoryDropAt = 0;
  let activeWarningCodes = new Set();
  let vitalNoticeTimer = 0;
  let vitalNoticeHideTimer = 0;
  let vitalStateRefreshTimer = 0;
  let gameplayReady = window.__MN_GAMEPLAY_ENTERED__ === true;

  function getInventoryLayoutStorageKey() {
    const playerId = String(
      window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
      state.telegramId ||
      state.player?.tg_id ||
      state.player?.telegramId ||
      'local'
    ).trim();
    return `${INVENTORY_LAYOUT_STORAGE_PREFIX}:${playerId || 'local'}`;
  }

  function loadInventorySlotLayout() {
    try {
      const parsed = JSON.parse(localStorage.getItem(getInventoryLayoutStorageKey()) || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => (
        key && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) < INVENTORY_SLOT_COUNT
      )).map(([key, value]) => [key, Number(value)]));
    } catch {
      return {};
    }
  }

  function saveInventorySlotLayout() {
    try {
      localStorage.setItem(getInventoryLayoutStorageKey(), JSON.stringify(inventorySlotLayout));
    } catch {}
  }

  function arrangeInventoryItems(items = []) {
    const activeItems = items
      .filter((item) => item && Number(item.quantity || 0) > 0)
      .slice(0, INVENTORY_SLOT_COUNT);
    const slots = Array(INVENTORY_SLOT_COUNT).fill(null);
    const placedItems = new Set();
    let layoutChanged = false;

    activeItems.forEach((item) => {
      const itemKey = getInventoryItemLayoutKey(item);
      const savedSlot = Number(inventorySlotLayout[itemKey]);
      if (!itemKey || !Number.isInteger(savedSlot) || savedSlot < 0 || savedSlot >= INVENTORY_SLOT_COUNT || slots[savedSlot]) return;
      slots[savedSlot] = item;
      placedItems.add(item);
    });

    activeItems.forEach((item) => {
      if (placedItems.has(item)) return;
      const emptySlot = slots.findIndex((slotItem) => !slotItem);
      if (emptySlot < 0) return;
      slots[emptySlot] = item;
      const itemKey = getInventoryItemLayoutKey(item);
      if (itemKey && inventorySlotLayout[itemKey] !== emptySlot) {
        inventorySlotLayout[itemKey] = emptySlot;
        layoutChanged = true;
      }
    });

    if (layoutChanged) saveInventorySlotLayout();
    return slots;
  }

  inventorySlotLayout = loadInventorySlotLayout();

  function canShowVitalNotice() {
    return gameplayReady && !hasBlockingInterface();
  }

  function dismissVitalNotice() {
    window.clearTimeout(vitalNoticeTimer);
    window.clearTimeout(vitalNoticeHideTimer);

    if (!vitalNotice) return;
    vitalNotice.hidden = true;
    delete vitalNotice.dataset.state;
  }

  function showVitalNotice(alert) {
    if (
      !alert ||
      alert.severity === 'ok' ||
      !vitalNotice ||
      !canShowVitalNotice()
    ) return;

    window.clearTimeout(vitalNoticeTimer);
    window.clearTimeout(vitalNoticeHideTimer);

    vitalNotice.hidden = false;
    vitalNotice.dataset.severity = alert.severity;
    vitalNotice.dataset.state = 'opening';
    if (vitalNoticeIcon) vitalNoticeIcon.textContent = alert.icon;
    if (vitalNoticeTitle) vitalNoticeTitle.textContent = alert.title;
    if (vitalNoticeText) vitalNoticeText.textContent = alert.text;

    window.requestAnimationFrame(() => {
      if (!vitalNotice.hidden) vitalNotice.dataset.state = 'open';
    });

    vitalNoticeTimer = window.setTimeout(() => {
      vitalNotice.dataset.state = 'closing';
      vitalNoticeHideTimer = window.setTimeout(() => {
        vitalNotice.hidden = true;
        delete vitalNotice.dataset.state;
      }, 180);
    }, 5200);
  }

  function renderAlerts(alerts) {
    if (!alertsElement) return;

    const fragment = document.createDocumentFragment();

    alerts.forEach((alert) => {
      const element = document.createElement('article');
      const icon = document.createElement('span');
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      const text = document.createElement('small');

      element.className = 'mn-inventory-alert';
      element.dataset.severity = alert.severity;
      element.dataset.alertCode = alert.code;
      icon.className = 'mn-inventory-alert-icon';
      copy.className = 'mn-inventory-alert-copy';
      icon.textContent = alert.icon;
      title.textContent = alert.title;
      text.textContent = alert.text;
      copy.append(title, text);
      element.append(icon, copy);
      fragment.appendChild(element);
    });

    alertsElement.replaceChildren(fragment);
  }

  function renderMedicalInventory() {
    const capacity = overlay.querySelector('.mn-inventory-capacity b');
    if (!inventoryGrid) return;
    const occupied = medicalItems.filter((item) => Number(item.quantity || 0) > 0).length;
    inventorySlotItems = arrangeInventoryItems(medicalItems);
    inventoryGrid.innerHTML = renderMedicalItems(inventorySlotItems);
    if (capacity) capacity.textContent = String(occupied);
    inventoryGrid.dataset.busy = inventoryBusy ? 'true' : 'false';
  }

  function visibleInventoryItems() {
    return inventorySlotItems;
  }

  function getItemMeta(item = {}) {
    return resolveItemMeta(item);
  }

  function getItemLabel(item = {}) {
    const meta = getItemMeta(item);
    return meta.mineGrade ? meta.label : (item.label || meta.label || 'Предмет');
  }

  function getItemSourceLabel(item = {}) {
    const source = String(item.source || item.inventorySource || 'personal').toLowerCase();
    if (source === 'employee' || source === 'staff' || source === 'service') {
      return `Служебный запас${item.hospitalName ? ` · ${item.hospitalName}` : ''}`;
    }
    return 'Личный инвентарь';
  }

  function getItemInfoText(item = {}) {
    const itemType = String(item.itemType || '');
    const quantity = Number(item.quantity || 0);
    const sourceLabel = getItemSourceLabel(item);

    if (itemType === 'food') {
      return `${getItemLabel(item)} · ${quantity} шт.\n${sourceLabel}.\nПрименение восстанавливает сытость и немного воды. Покупается в столовке.`;
    }

    if (itemType === 'water_bottle') {
      return `${getItemLabel(item)} · ${quantity} шт.\n${sourceLabel}.\nВосстанавливает 20 единиц воды. Хорошая гидратация ускоряет восстановление стамины до 3 минут.`;
    }

    if (itemType.startsWith('grocery_')) {
      const product = getBusinessProduct(itemType) || {};
      return `${getItemLabel(item)} · ${quantity} шт.\n${sourceLabel}.\nКуплено в продуктовом магазине. Восстанавливает ${Number(product.foodRestore) || 0} еды и ${Number(product.waterRestore) || 0} воды.`;
    }

    if (itemType === 'farm_rake' || itemType === 'farm_scissors') {
      const durability = Number(item.durability);
      const durabilityText = Number.isFinite(durability)
        ? `${Math.max(0, durability).toFixed(durability % 1 ? 1 : 0)} / 100`
        : 'нужно активировать в лавке';
      return `${getItemLabel(item)} · инструмент фермы.\n${sourceLabel}.\nПрочность: ${durabilityText}. Каждый обработанный куст расходует 2.5 прочности.`;
    }

    if (itemType === 'farm_water_bottle') {
      const uses = Number(item.waterUses || 0);
      return `${getItemLabel(item)} · ${quantity} бут.\n${sourceLabel}.\nТехническая вода из водонапорной башни: пить нельзя, только для полива.\nОсталось поливов: ${uses}. Один набранный литр даёт 2 полива.`;
    }

    if (['farm_apple', 'farm_wheat', 'farm_orange', 'farm_corn'].includes(itemType)) {
      return `${getItemLabel(item)} · ${quantity} шт.\n${sourceLabel}.\nМожно продать фермерскому предприятию или другому игроку. Выплата скупщика идёт с баланса конкретной фермы.`;
    }

    if (itemType === 'mine_tool_pickaxe') {
      return `${getItemLabel(item)} · постоянный инструмент.\n${sourceLabel}.\nИспользуется для добычи камня, угля, металла и меди. Прочность пока не расходуется.`;
    }

    if (itemType === 'lumber_tool_axe') {
      return `${getItemLabel(item)} · постоянный инструмент.\n${sourceLabel}.\nНужен для рубки 🌳 и 🌲. Прочность пока не расходуется.`;
    }

    if (itemType === 'lumber_tool_chainsaw') {
      return `${getItemLabel(item)} · постоянный инструмент со 2 уровня.\n${sourceLabel}.\nРаспиливает одно бревно 20 кг на 4 бруса по 5 кг.`;
    }

    if (itemType === 'lumber_log' || itemType === 'lumber_beam' || itemType.startsWith('construction_')) {
      const unitWeight = Number(item.unitWeightKg || (itemType === 'lumber_log' ? 20 : 5));
      const totalWeight = Number(item.totalWeightKg || unitWeight * quantity);
      const price = itemType === 'lumber_log' ? 200 : 55;
      const extra = itemType === 'lumber_log'
        ? 'Со 2 уровня можно распилить бензопилой на 4 бруса.'
        : 'С 3 уровня подходит для поставок производствам.';
      return `${getItemLabel(item)} · ${quantity} шт.\n${sourceLabel}.\nВес: ${unitWeight} кг/шт., партия ${totalWeight} кг.\nПродажа: ${price} ₴/шт. ${extra}`;
    }

    const mineGrade = parseMineGradeItemType(itemType);
    if (mineGrade) {
      const purity = Number(item.purityPercent ?? mineGrade.quality.purityPercent);
      const basePrice = getMineBaseGradePrice(mineGrade.subtype.subtypeCode, mineGrade.qualityLevel);
      const batchPrice = Math.max(0, Math.round(basePrice * quantity));
      const washText = mineGrade.quality.washingRequired
        ? 'Обработка: перед крафтом сырьё нужно промыть.'
        : 'Обработка: обязательная промывка не нужна.';
      return [
        `${mineGrade.subtype.icon} ${mineGrade.subtype.label}`,
        `${sourceLabel} · масса партии: ${quantity.toLocaleString('ru-RU')} кг`,
        `Тип: ${mineGrade.subtype.description}`,
        `Качество: ${mineGrade.qualityLevel}/5 — ${mineGrade.quality.label}`,
        `Чистота: ${purity}%`,
        `Цена: ${basePrice.toLocaleString('ru-RU')} ₴/кг до коэффициента скупщика`,
        `Базовая стоимость партии: ${batchPrice.toLocaleString('ru-RU')} ₴`,
        `Назначение: ${mineGrade.subtype.useLabel}.`,
        mineGrade.subtype.specialLabel,
        washText,
      ].join('\n');
    }

    if (itemType.startsWith('medicine_')) {
      const heal = Number(item.healPerTick || 0);
      const tick = Number(item.tickSeconds || 0);
      const duration = Number(item.durationSeconds || 60);
      return `${getItemLabel(item)} · ${quantity} шт.\n${sourceLabel}.\nЛечение: +${heal} HP каждые ${tick} сек., максимум ${duration} сек.\nСамолечение из инвентаря отключено. Препарат используется врачом на другом игроке через подсистему лечения и может применяться при любом HP пациента.`;
    }

    return `${getItemLabel(item)} · ${quantity} шт.\n${sourceLabel}.\nДля этого типа предмета информация и действие будут дополняться позже.`;
  }

  function setItemMenuNotice(message, type = 'info') {
    if (!itemMenuInfo) return;
    const text = String(message || '').trim();
    itemMenuInfo.hidden = !text;
    itemMenuInfo.textContent = text;
    if (text) {
      itemMenuInfo.dataset.type = type;
    } else {
      delete itemMenuInfo.dataset.type;
    }
  }

  function positionItemMenu(anchor, event) {
    if (!itemMenu) return;
    const rect = anchor?.getBoundingClientRect?.();
    const viewportPadding = 12;
    const fallbackX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const fallbackY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const rawX = Number(event?.clientX) || fallbackX;
    const rawY = Number(event?.clientY) || fallbackY;
    const x = Math.min(window.innerWidth - viewportPadding, Math.max(viewportPadding, rawX));
    const y = Math.min(window.innerHeight - viewportPadding, Math.max(viewportPadding, rawY));

    itemMenu.style.setProperty('--mn-inventory-item-menu-x', `${x}px`);
    itemMenu.style.setProperty('--mn-inventory-item-menu-y', `${y}px`);
  }

  function closeItemMenu() {
    selectedInventoryItem = null;
    if (!itemMenu) return;
    itemMenu.hidden = true;
    itemMenu.setAttribute('aria-hidden', 'true');
    delete itemMenu.dataset.itemType;
    setItemMenuNotice('');
  }

  function openItemMenu(anchor, event) {
    const index = Number(anchor?.dataset?.inventoryItemIndex);
    const item = visibleInventoryItems()[index];
    if (!item || !itemMenu) return false;

    const itemType = String(item.itemType || '');
    const meta = getItemMeta(item);
    selectedInventoryItem = item;
    itemMenu.hidden = false;
    itemMenu.setAttribute('aria-hidden', 'false');
    itemMenu.dataset.itemType = itemType;
    if (itemMenuIcon) itemMenuIcon.innerHTML = getItemIconMarkup(itemType, meta.icon || item.icon || '□');
    if (itemMenuTitle) itemMenuTitle.textContent = getItemLabel(item);
    if (itemMenuQuantity) {
      const lumberResource = itemType === 'lumber_log' || itemType === 'lumber_beam';
      const unitLabel = String(item.unitLabel || ((itemType.startsWith('mine_') && itemType !== 'mine_tool_pickaxe') || lumberResource ? 'кг' : 'шт.'));
      itemMenuQuantity.textContent = `${Number(item.quantity || 0).toLocaleString('ru-RU')} ${unitLabel}`;
    }
    if (itemMenuApply) {
      const medicineOnly = itemType.startsWith('medicine_');
      const farmNonUsable = itemType.startsWith('farm_');
      const mineNonUsable = itemType.startsWith('mine_');
      const lumberNonUsable = itemType.startsWith('lumber_') || itemType.startsWith('construction_');
      const hidden = medicineOnly || farmNonUsable || mineNonUsable || lumberNonUsable;
      itemMenuApply.hidden = hidden;
      itemMenuApply.disabled = hidden;
      itemMenuApply.style.display = hidden ? 'none' : '';
      itemMenuApply.textContent = 'Применить';
    }
    setItemMenuNotice('');
    positionItemMenu(anchor, event);
    return true;
  }

  function clearInventoryDragVisuals() {
    if (!inventoryGrid) return;
    inventoryGrid.removeAttribute('data-dragging');
    inventoryGrid.querySelectorAll('.is-inventory-dragging, .is-inventory-drop-target').forEach((element) => {
      element.classList.remove('is-inventory-dragging', 'is-inventory-drop-target');
    });
  }

  function setInventoryDropTarget(slotElement) {
    if (!inventoryGrid) return;
    inventoryGrid.querySelectorAll('.is-inventory-drop-target').forEach((element) => {
      if (element !== slotElement) element.classList.remove('is-inventory-drop-target');
    });
    slotElement?.classList.add('is-inventory-drop-target');
  }

  function moveInventoryItemToSlot(itemKey, targetSlot) {
    const normalizedKey = String(itemKey || '');
    const normalizedTarget = Number(targetSlot);
    if (!normalizedKey || !Number.isInteger(normalizedTarget) || normalizedTarget < 0 || normalizedTarget >= INVENTORY_SLOT_COUNT) return false;

    const sourceSlot = inventorySlotItems.findIndex((item) => getInventoryItemLayoutKey(item) === normalizedKey);
    if (sourceSlot < 0 || sourceSlot === normalizedTarget) return false;

    const targetItem = inventorySlotItems[normalizedTarget];
    const targetItemKey = targetItem ? getInventoryItemLayoutKey(targetItem) : '';
    inventorySlotLayout[normalizedKey] = normalizedTarget;
    if (targetItemKey) inventorySlotLayout[targetItemKey] = sourceSlot;
    saveInventorySlotLayout();
    closeItemMenu();
    renderMedicalInventory();
    return true;
  }

  function handleGridDragStart(event) {
    const itemElement = event.target?.closest?.('[data-inventory-item-key]');
    if (!itemElement || inventoryBusy) {
      event.preventDefault();
      return;
    }

    draggedInventoryItemKey = String(itemElement.dataset.inventoryItemKey || '');
    if (!draggedInventoryItemKey) {
      event.preventDefault();
      return;
    }

    closeItemMenu();
    inventoryGrid.dataset.dragging = 'true';
    itemElement.classList.add('is-inventory-dragging');
    event.dataTransfer?.setData('text/plain', draggedInventoryItemKey);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function handleGridDragOver(event) {
    if (!draggedInventoryItemKey) return;
    const slotElement = event.target?.closest?.('[data-inventory-slot]');
    if (!slotElement) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    setInventoryDropTarget(slotElement);
  }

  function handleGridDrop(event) {
    const slotElement = event.target?.closest?.('[data-inventory-slot]');
    const itemKey = draggedInventoryItemKey || event.dataTransfer?.getData('text/plain') || '';
    if (!slotElement || !itemKey) return;
    event.preventDefault();
    lastInventoryDropAt = performance.now();
    moveInventoryItemToSlot(itemKey, Number(slotElement.dataset.inventorySlot));
    draggedInventoryItemKey = '';
    clearInventoryDragVisuals();
  }

  function handleGridDragEnd() {
    draggedInventoryItemKey = '';
    clearInventoryDragVisuals();
  }

  function handleGridPointerDown(event) {
    if (event.pointerType === 'mouse' || inventoryBusy) return;
    const itemElement = event.target?.closest?.('[data-inventory-item-key]');
    if (!itemElement) return;

    pointerDrag = {
      pointerId: event.pointerId,
      itemKey: String(itemElement.dataset.inventoryItemKey || ''),
      startX: Number(event.clientX),
      startY: Number(event.clientY),
      dragging: false,
      itemElement,
    };
    itemElement.setPointerCapture?.(event.pointerId);
  }

  function handleGridPointerMove(event) {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
    if (!pointerDrag.dragging && distance < 8) return;

    if (!pointerDrag.dragging) {
      pointerDrag.dragging = true;
      closeItemMenu();
      inventoryGrid.dataset.dragging = 'true';
      pointerDrag.itemElement?.classList.add('is-inventory-dragging');
    }

    event.preventDefault();
    const pointedElement = document.elementFromPoint(event.clientX, event.clientY);
    setInventoryDropTarget(pointedElement?.closest?.('[data-inventory-slot]'));
  }

  function finishGridPointerDrag(event, cancelled = false) {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const currentDrag = pointerDrag;
    pointerDrag = null;
    currentDrag.itemElement?.releasePointerCapture?.(event.pointerId);

    if (currentDrag.dragging) {
      event.preventDefault();
      lastInventoryDropAt = performance.now();
      if (!cancelled) {
        const pointedElement = document.elementFromPoint(event.clientX, event.clientY);
        const slotElement = pointedElement?.closest?.('[data-inventory-slot]');
        if (slotElement) moveInventoryItemToSlot(currentDrag.itemKey, Number(slotElement.dataset.inventorySlot));
      }
    }

    clearInventoryDragVisuals();
  }

  function handleGridPointerUp(event) {
    finishGridPointerDrag(event, false);
  }

  function handleGridPointerCancel(event) {
    finishGridPointerDrag(event, true);
  }

  function showSelectedItemInfo() {
    if (!selectedInventoryItem) return;
    setItemMenuNotice(getItemInfoText(selectedInventoryItem), 'info');
  }

  async function refreshMedicalInventory() {
    const [medicalResult, farmResult, mineResult, lumberResult, businessResult] = await Promise.allSettled([
      loadMyMedicalInventory(),
      loadFarmInventory(),
      loadMineInventory(),
      loadLumberInventory(),
      loadBusinessInventory(),
    ]);

    const medical = medicalResult.status === 'fulfilled' && Array.isArray(medicalResult.value?.items)
      ? medicalResult.value.items
      : [];
    const farm = farmResult.status === 'fulfilled' && Array.isArray(farmResult.value?.items)
      ? farmResult.value.items
      : (Array.isArray(window.__MN_FARM_INVENTORY_ITEMS__) ? window.__MN_FARM_INVENTORY_ITEMS__ : []);
    const mine = mineResult.status === 'fulfilled' && Array.isArray(mineResult.value?.items)
      ? mineResult.value.items
      : (Array.isArray(window.__MN_MINE_INVENTORY_ITEMS__) ? window.__MN_MINE_INVENTORY_ITEMS__ : []);
    const lumber = lumberResult.status === 'fulfilled' && Array.isArray(lumberResult.value?.items)
      ? lumberResult.value.items
      : (Array.isArray(window.__MN_LUMBER_INVENTORY_ITEMS__) ? window.__MN_LUMBER_INVENTORY_ITEMS__ : []);
    const business = businessResult.status === 'fulfilled' && Array.isArray(businessResult.value?.items)
      ? businessResult.value.items
      : (Array.isArray(window.__MN_BUSINESS_INVENTORY_ITEMS__) ? window.__MN_BUSINESS_INVENTORY_ITEMS__ : []);

    if (medicalResult.status === 'rejected' && !String(medicalResult.reason?.message || '').includes('TELEGRAM_SESSION')) {
      console.warn('[inventory] medical inventory load failed:', medicalResult.reason);
    }
    if (farmResult.status === 'rejected' && !String(farmResult.reason?.message || '').includes('TELEGRAM_SESSION')) {
      console.warn('[inventory] farm inventory load failed:', farmResult.reason);
    }
    if (mineResult.status === 'rejected' && !String(mineResult.reason?.message || '').includes('TELEGRAM_SESSION')) {
      console.warn('[inventory] mine inventory load failed:', mineResult.reason);
    }
    if (lumberResult.status === 'rejected' && !String(lumberResult.reason?.message || '').includes('TELEGRAM_SESSION')) {
      console.warn('[inventory] lumber inventory load failed:', lumberResult.reason);
    }
    if (businessResult.status === 'rejected' && !String(businessResult.reason?.message || '').includes('TELEGRAM_SESSION')) {
      console.warn('[inventory] business inventory load failed:', businessResult.reason);
    }

    window.__MN_BUSINESS_INVENTORY_ITEMS__ = business;
    medicalItems = [...medical, ...farm, ...mine, ...lumber, ...business];
    publishInventorySnapshot(medicalItems);
    renderMedicalInventory();
  }

  async function applySelectedInventoryItem() {
    const item = selectedInventoryItem;
    const itemType = String(item?.itemType || '');
    const consumptionEffect = getConsumptionEffectType(itemType);
    if (!itemType || inventoryBusy) return;
    if (itemType.startsWith('medicine_')) {
      const message = 'Самолечение таблетками отключено. Используйте препарат на другом игроке через подсистему врача.';
      setItemMenuNotice(message, 'error');
      window.dispatchEvent(new CustomEvent('mn:toast', {
        detail: { type: 'error', message },
      }));
      return;
    }

    if (itemType === 'farm_water_bottle') {
      const message = 'Это техническая вода из водонапорной башни. Пить её нельзя — только поливать растения.';
      setItemMenuNotice(message, 'error');
      window.dispatchEvent(new CustomEvent('mn:toast', {
        detail: { type: 'error', message },
      }));
      return;
    }

    if (itemType.startsWith('farm_')) {
      setItemMenuNotice('Этот предмет используется возле растения или в фермерской лавке.', 'info');
      return;
    }
    if (itemType.startsWith('mine_')) {
      setItemMenuNotice('Этот предмет используется на месторождении, у шахтёрского скупщика или в будущих производствах.', 'info');
      return;
    }
    inventoryBusy = true;
    setItemMenuNotice('Применяю предмет...', 'info');
    renderMedicalInventory();
    if (consumptionEffect) {
      window.dispatchEvent(new CustomEvent('mn:player-consumption-state-changed', {
        detail: { active: true, type: consumptionEffect, itemType },
      }));
    }
    try {
      const itemSource = String(item.source || item.inventorySource || 'personal').toLowerCase();
      let result = itemSource === 'business' || itemType.startsWith('grocery_')
        ? await useBusinessInventoryItem(itemType)
        : await useInventoryItem({
          itemType,
          source: item.source || item.inventorySource || 'personal',
          hospitalId: item.hospitalId || null,
        });

      if (itemType === 'water_bottle' && result?.canonicalVitalsUpdated !== true) {
        const restoredVitals = await applyPlayerPositionVitalRestore({ waterRestore: 20 });
        result = { ...(result || {}), ...restoredVitals };
      }


      const resultBalance = optionalFiniteNumber(result?.balance);
      if (resultBalance !== null) {
        state.player = { ...(state.player || {}), balance: resultBalance };
        window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
          detail: { balance: resultBalance, source: 'inventory_item_use', result },
        }));
      }

      const resultHealth = optionalFiniteNumber(result?.health);
      const resultFood = optionalFiniteNumber(result?.food);
      const resultWater = optionalFiniteNumber(result?.water);
      if (resultHealth !== null || resultFood !== null || resultWater !== null) {
        const nextHealth = resultHealth ?? currentVitals.health;
        const nextFood = resultFood ?? currentVitals.food;
        const nextWater = resultWater ?? currentVitals.water;
        const changedVitals = {
          ...(resultHealth !== null ? { health: nextHealth } : {}),
          ...(resultFood !== null ? { food: nextFood } : {}),
          ...(resultWater !== null ? { water: nextWater } : {}),
        };
        state.player = {
          ...(state.player || {}),
          ...changedVitals,
        };
        renderVitals({ ...currentVitals, health: nextHealth, food: nextFood, water: nextWater });
        window.dispatchEvent(new CustomEvent('mn:player-vitals-changed', {
          detail: { vitals: changedVitals, source: 'inventory_item_use', result },
        }));
      }
      window.dispatchEvent(new CustomEvent('mn:toast', {
        detail: {
          type: 'success',
          message: consumptionEffect === 'food'
            ? `${result?.itemLabel || getItemLabel(item)} применён. Сытость восстановлена.`
            : `${result?.itemLabel || getItemLabel(item)} выпита. Вода восстановлена на ${Math.max(0, Number(result?.waterRestore) || 20)}.`,
        },
      }));
      setItemMenuNotice(
        consumptionEffect === 'food'
          ? `${result?.itemLabel || getItemLabel(item)} применён. Сытость: ${Math.round(Number(result?.food ?? currentVitals.food))}/100, вода: ${Math.round(Number(result?.water ?? currentVitals.water))}/100.`
          : `${result?.itemLabel || getItemLabel(item)} выпита. Вода: ${Math.round(Number(result?.water ?? currentVitals.water))}/100.`,
        'success'
      );
      await refreshMedicalInventory();
    } catch (error) {
      setItemMenuNotice(getHospitalUserErrorMessage(error), 'error');
      window.dispatchEvent(new CustomEvent('mn:toast', {
        detail: { type: 'error', message: getHospitalUserErrorMessage(error) },
      }));
    } finally {
      if (consumptionEffect) {
        window.dispatchEvent(new CustomEvent('mn:player-consumption-state-changed', {
          detail: { active: false, type: consumptionEffect, itemType },
        }));
      }
      inventoryBusy = false;
      renderMedicalInventory();
    }
  }

  function renderVitals(nextVitals, { notify = false } = {}) {
    currentVitals = {
      health: clampVital(nextVitals.health, 'health'),
      food: clampVital(nextVitals.food, 'food'),
      water: clampVital(nextVitals.water, 'water'),
    };

    Object.entries(currentVitals).forEach(([key, value]) => {
      const element = vitalElements.get(key);
      const rounded = Math.round(value);

      if (!element) return;
      element.setAttribute('aria-valuenow', String(rounded));
      element.querySelector('[data-inventory-vital-value]')?.replaceChildren(String(rounded));
      element.querySelector('i')?.style.setProperty('--mn-inventory-vital-value', `${rounded}%`);
      element.dataset.low = rounded < (key === 'health'
        ? getHealthThreshold()
        : key === 'food'
          ? HUNGER_WARNING_THRESHOLD
          : THIRST_WARNING_THRESHOLD)
        ? 'true'
        : 'false';
    });

    const alerts = getVitalAlerts(currentVitals);
    const warningAlerts = alerts.filter((alert) => alert.severity !== 'ok');
    const nextWarningCodes = new Set(warningAlerts.map((alert) => alert.code));
    const enteredWarning = warningAlerts.find((alert) => !activeWarningCodes.has(alert.code));
    const healthLow = currentVitals.health < getHealthThreshold();
    const critical = currentVitals.health < CRITICAL_VITAL_THRESHOLD ||
      currentVitals.food < CRITICAL_VITAL_THRESHOLD ||
      currentVitals.water < CRITICAL_VITAL_THRESHOLD;

    character?.style.setProperty('--mn-character-health', `${Math.round(currentVitals.health)}%`);
    if (character) character.dataset.condition = critical ? 'danger' : healthLow ? 'warning' : 'ok';
    if (characterState) {
      characterState.textContent = critical
        ? 'Критическое состояние'
        : warningAlerts.length
          ? 'Требуется внимание'
          : 'Состояние стабильное';
    }

    renderAlerts(alerts);

    if (notify && !open && enteredWarning) showVitalNotice(enteredWarning);
    activeWarningCodes = nextWarningCodes;
  }

  function updateVitalsFromSnapshot(snapshot, { notify = true } = {}) {
    const nextVitals = { ...currentVitals };
    let changed = false;

    Object.keys(nextVitals).forEach((key) => {
      if (!hasVital(snapshot, key)) return;

      const nextValue = readVital(snapshot, key, nextVitals[key]);
      if (Math.round(nextValue) !== Math.round(nextVitals[key])) changed = true;
      nextVitals[key] = nextValue;
    });

    if (changed) renderVitals(nextVitals, { notify });
  }

  function handleFarmInventoryChanged(event) {
    const farmItems = Array.isArray(event?.detail?.items) ? event.detail.items : [];
    const nonFarmItems = medicalItems.filter((item) => !item?.farmItem && !String(item?.itemType || '').startsWith('farm_'));
    medicalItems = [...nonFarmItems, ...farmItems];
    publishInventorySnapshot(medicalItems);
    renderMedicalInventory();
  }

  function handleMineInventoryChanged(event) {
    const mineItems = Array.isArray(event?.detail?.items) ? event.detail.items : [];
    const nonMineItems = medicalItems.filter((item) => !String(item?.itemType || '').startsWith('mine_'));
    medicalItems = [...nonMineItems, ...mineItems];
    publishInventorySnapshot(medicalItems);
    renderMedicalInventory();
  }

  function handleLumberInventoryChanged(event) {
    const lumberItems = Array.isArray(event?.detail?.items) ? event.detail.items : [];
    const nonLumberItems = medicalItems.filter((item) => !String(item?.itemType || '').startsWith('lumber_'));
    medicalItems = [...nonLumberItems, ...lumberItems];
    publishInventorySnapshot(medicalItems);
    renderMedicalInventory();
  }

  function handleVitalsChanged(event) {
    updateVitalsFromSnapshot(getVitalsSnapshotFromEvent(event));
  }

  function handleGameplayEntered() {
    gameplayReady = true;
    dismissVitalNotice();

    // Значения из localStorage/первичного position snapshot могут быть
    // промежуточными. На входе в сам геймплей просто принимаем уже
    // синхронизированное состояние без стартового toast. Дальнейшие реальные
    // переходы через пороги по-прежнему показывают предупреждения.
    renderVitals(getStateVitals(currentVitals), { notify: false });
  }

  function handleHouseSpawnPickerOpened() {
    dismissVitalNotice();
  }

  function handleHealthChanged(event) {
    const detail = event?.detail || {};
    const explicitHealth = detail.health ?? detail.hp ?? detail.value;
    const delta = Number(detail.delta);
    const nextHealth = explicitHealth !== undefined && explicitHealth !== null
      ? explicitHealth
      : Number.isFinite(delta)
        ? currentVitals.health + delta
        : null;

    if (nextHealth === null) return;
    renderVitals({ ...currentVitals, health: nextHealth }, { notify: true });
  }

  function publishState(nextOpen) {
    window.__MN_INVENTORY_OPEN__ = nextOpen;
    document.body.classList.toggle(INVENTORY_OPEN_CLASS, nextOpen);
    document.documentElement.classList.toggle(INVENTORY_OPEN_CLASS, nextOpen);
    window.dispatchEvent(new CustomEvent(
      nextOpen ? 'mn:inventory-opened' : 'mn:inventory-closed',
      { detail: { open: nextOpen, rows: INVENTORY_ROWS, columns: INVENTORY_COLUMNS } }
    ));
  }

  function showInventory() {
    if (open || hasBlockingInterface()) return false;

    dismissVitalNotice();
    previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    open = true;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.dataset.state = 'opening';
    renderVitals(getStateVitals(currentVitals), { notify: false });
    void refreshMedicalInventory();
    publishState(true);

    window.requestAnimationFrame(() => {
      if (!open) return;
      overlay.dataset.state = 'open';
      closeButton.focus({ preventScroll: true });
    });

    return true;
  }

  function hideInventory({ restoreFocus = true } = {}) {
    if (!open) return false;

    closeItemMenu();
    open = false;
    overlay.dataset.state = 'closing';
    overlay.setAttribute('aria-hidden', 'true');
    publishState(false);

    const finish = () => {
      if (open) return;
      overlay.hidden = true;
      delete overlay.dataset.state;

      if (restoreFocus && previousFocus?.isConnected) {
        previousFocus.focus?.({ preventScroll: true });
      }

      previousFocus = null;
    };

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      finish();
    } else {
      window.setTimeout(finish, 150);
    }

    return true;
  }

  function handleKeyDown(event) {
    const isInventoryHotkey = event.code === INVENTORY_HOTKEY_CODE;

    if (open) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      if ((isInventoryHotkey || event.code === 'Escape') && !event.repeat) {
        if (event.code === 'Escape' && itemMenu && !itemMenu.hidden) {
          closeItemMenu();
          return;
        }
        hideInventory();
        return;
      }

      if (event.code === 'Tab') {
        closeButton.focus({ preventScroll: true });
      }

      return;
    }

    if (!isInventoryHotkey || event.repeat || isTypingTarget(event.target)) return;
    if (hasBlockingInterface()) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    showInventory();
  }

  function handleCloseClick(event) {
    event.preventDefault();
    event.stopPropagation();
    hideInventory();
  }

  function handleMobileToggleRequest() {
    if (open) hideInventory();
    else showInventory();
  }

  function handleGridClick(event) {
    if (performance.now() - lastInventoryDropAt < 420) {
      event.preventDefault();
      return;
    }
    const item = event.target.closest('[data-inventory-item-index]');
    if (!item) return;
    event.preventDefault();
    openItemMenu(item, event);
  }

  function handleGridContextMenu(event) {
    const item = event.target.closest('[data-inventory-item-index]');
    if (!item) return;
    event.preventDefault();
    openItemMenu(item, event);
  }

  function handleItemMenuClick(event) {
    if (event.target.closest('[data-inventory-item-menu-close]')) {
      event.preventDefault();
      closeItemMenu();
      return;
    }

    if (event.target.closest('[data-inventory-item-info-button]')) {
      event.preventDefault();
      showSelectedItemInfo();
      return;
    }

    if (event.target.closest('[data-inventory-item-apply]')) {
      event.preventDefault();
      void applySelectedInventoryItem();
    }
  }

  closeTargets.forEach((target) => target.addEventListener('click', handleCloseClick));
  inventoryGrid?.addEventListener('click', handleGridClick);
  inventoryGrid?.addEventListener('contextmenu', handleGridContextMenu);
  inventoryGrid?.addEventListener('dragstart', handleGridDragStart);
  inventoryGrid?.addEventListener('dragover', handleGridDragOver);
  inventoryGrid?.addEventListener('drop', handleGridDrop);
  inventoryGrid?.addEventListener('dragend', handleGridDragEnd);
  inventoryGrid?.addEventListener('pointerdown', handleGridPointerDown);
  inventoryGrid?.addEventListener('pointermove', handleGridPointerMove);
  inventoryGrid?.addEventListener('pointerup', handleGridPointerUp);
  inventoryGrid?.addEventListener('pointercancel', handleGridPointerCancel);
  itemMenu?.addEventListener('click', handleItemMenuClick);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('mn:player-balance-changed', handleVitalsChanged);
  window.addEventListener('mn:player-vitals-changed', handleVitalsChanged);
  window.addEventListener('mn:farm-inventory-changed', handleFarmInventoryChanged);
  window.addEventListener('mn:mine-inventory-changed', handleMineInventoryChanged);
  window.addEventListener('mn:lumber-inventory-changed', handleLumberInventoryChanged);
  window.addEventListener('mn:business-inventory-changed', refreshMedicalInventory);
  window.addEventListener('mn:player-health-changed', handleHealthChanged);
  window.addEventListener('mn:medical-inventory-changed', refreshMedicalInventory);
  window.addEventListener('mn:player-inventory-changed', refreshMedicalInventory);
  window.addEventListener('mn:inventory-toggle-request', handleMobileToggleRequest);
  window.addEventListener('mn:gameplay-entered', handleGameplayEntered);
  window.addEventListener('mn:house-spawn-picker-opened', handleHouseSpawnPickerOpened);

  const bodyClassObserver = new MutationObserver(() => {
    if (open && hasBlockingInterface()) {
      hideInventory({ restoreFocus: false });
    }
  });

  bodyClassObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });

  renderVitals(initialVitals, { notify: false });
  renderMedicalInventory();
  vitalStateRefreshTimer = window.setInterval(() => {
    updateVitalsFromSnapshot(getStateVitals(currentVitals), { notify: true });
  }, 1500);

  publishState(false);

  return () => {
    bodyClassObserver.disconnect();
    closeTargets.forEach((target) => target.removeEventListener('click', handleCloseClick));
    inventoryGrid?.removeEventListener('click', handleGridClick);
    inventoryGrid?.removeEventListener('contextmenu', handleGridContextMenu);
    inventoryGrid?.removeEventListener('dragstart', handleGridDragStart);
    inventoryGrid?.removeEventListener('dragover', handleGridDragOver);
    inventoryGrid?.removeEventListener('drop', handleGridDrop);
    inventoryGrid?.removeEventListener('dragend', handleGridDragEnd);
    inventoryGrid?.removeEventListener('pointerdown', handleGridPointerDown);
    inventoryGrid?.removeEventListener('pointermove', handleGridPointerMove);
    inventoryGrid?.removeEventListener('pointerup', handleGridPointerUp);
    inventoryGrid?.removeEventListener('pointercancel', handleGridPointerCancel);
    itemMenu?.removeEventListener('click', handleItemMenuClick);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('mn:player-balance-changed', handleVitalsChanged);
    window.removeEventListener('mn:player-vitals-changed', handleVitalsChanged);
    window.removeEventListener('mn:farm-inventory-changed', handleFarmInventoryChanged);
    window.removeEventListener('mn:mine-inventory-changed', handleMineInventoryChanged);
    window.removeEventListener('mn:lumber-inventory-changed', handleLumberInventoryChanged);
    window.removeEventListener('mn:business-inventory-changed', refreshMedicalInventory);
    window.removeEventListener('mn:player-health-changed', handleHealthChanged);
    window.removeEventListener('mn:medical-inventory-changed', refreshMedicalInventory);
    window.removeEventListener('mn:player-inventory-changed', refreshMedicalInventory);
    window.removeEventListener('mn:inventory-toggle-request', handleMobileToggleRequest);
    window.removeEventListener('mn:gameplay-entered', handleGameplayEntered);
    window.removeEventListener('mn:house-spawn-picker-opened', handleHouseSpawnPickerOpened);
    window.clearTimeout(vitalNoticeTimer);
    window.clearTimeout(vitalNoticeHideTimer);
    window.clearInterval(vitalStateRefreshTimer);
    open = false;
    publishInventorySnapshot([]);
    publishState(false);
    vitalNotice?.remove();
    overlay.remove();
  };
}

