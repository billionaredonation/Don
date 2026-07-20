// Hospital batch refresh 2026-07-20: inventory medical items deploy marker.
import './inventory.css';
import { state } from '../state.js';
import { getPlayerVitalsConfig } from '../player/playerStatsConfig.js';
import {
  getHospitalUserErrorMessage,
  loadMyMedicalInventory,
  notifyHospitalTreatmentStarted,
  useMyMedicine,
} from '../hospital/hospitalWarehouseFeature.js';

export const INVENTORY_ROWS = 10;
export const INVENTORY_COLUMNS = 10;
export const INVENTORY_SLOT_COUNT = INVENTORY_ROWS * INVENTORY_COLUMNS;

const INVENTORY_HOTKEY_CODE = 'KeyI';
const INVENTORY_OPEN_CLASS = 'mn-inventory-open';
const VITALS_CONFIG = getPlayerVitalsConfig();
const MEDICINE_MIN_FOOD = 40;
const HUNGER_WARNING_THRESHOLD = 40;
const THIRST_WARNING_THRESHOLD = 40;
const CRITICAL_VITAL_THRESHOLD = 20;
const MEDICINE_META = Object.freeze({
  medicine_light: { label: 'Слабоседативные таблетки', icon: '💊' },
  medicine_strong: { label: 'Среднеседативные таблетки', icon: '💉' },
  medicine_resuscitation: { label: 'Сильные седативные таблетки', icon: '⚕' },
});

const VITAL_ALIASES = Object.freeze({
  health: ['health', 'hp', 'healthPoints', 'health_points'],
  food: ['food', 'hunger', 'satiety'],
  water: ['water', 'thirst', 'hydration'],
});

function localTelegramId() {
  return String(
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
      state.telegramId ||
      state.player?.tg_id ||
      ''
  ).trim();
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

  if (health < getHealthThreshold() && food < MEDICINE_MIN_FOOD) {
    alerts.push({
      code: 'medicine-food-locked',
      severity: 'danger',
      icon: '💊',
      title: 'Таблетки пока принимать нельзя',
      text: `Сначала поешьте. Для лечения требуется минимум ${MEDICINE_MIN_FOOD} единиц еды.`,
    });
  }

  if (health < getHealthThreshold()) {
    alerts.push({
      code: 'low-health',
      severity: health < CRITICAL_VITAL_THRESHOLD ? 'danger' : 'warning',
      icon: '🫀',
      title: `У вас мало HP — ${health}%`,
      text: food < MEDICINE_MIN_FOOD
        ? 'Организм ослаблен: сначала восстановите питание, затем приступайте к лечению.'
        : 'Восстановите здоровье едой, отдыхом или доступными лекарствами.',
    });
  }

  if (food < HUNGER_WARNING_THRESHOLD) {
    alerts.push({
      code: 'hunger',
      severity: food < CRITICAL_VITAL_THRESHOLD ? 'danger' : 'warning',
      icon: '🍽',
      title: `Вы голодны — ${food}%`,
      text: `Поешьте. Без ${MEDICINE_MIN_FOOD} единиц еды безопасное лечение таблетками недоступно.`,
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
    document.body.classList.contains('mn-house-trade-open') ||
    document.body.classList.contains('mn-houses-modal-open') ||
    document.body.classList.contains('mn-house-details-open') ||
    document.body.classList.contains('mn-house-spawn-open') ||
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

function renderMedicalItems(items = []) {
  const activeItems = items.filter((item) => Number(item.quantity || 0) > 0).slice(0, INVENTORY_SLOT_COUNT);
  return Array.from({ length: INVENTORY_SLOT_COUNT }, (_, index) => {
    const item = activeItems[index];
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

    const meta = MEDICINE_META[item.itemType] || { label: item.label || item.itemType, icon: '□' };
    return `
      <button
        class="mn-inventory-slot mn-inventory-item"
        type="button"
        role="gridcell"
        aria-label="${meta.label}: ${Number(item.quantity || 0)} шт."
        title="${meta.label}: ${Number(item.quantity || 0)} шт. · применить"
        data-inventory-slot="${index}"
        data-inventory-row="${row}"
        data-inventory-column="${column}"
        data-medicine-type="${item.itemType}"
      >
        <span>${meta.icon}</span>
        <b>${Number(item.quantity || 0)}</b>
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

  if (!overlay || !panel || !closeButton) {
    return () => {};
  }

  let open = false;
  let previousFocus = null;
  let currentVitals = { ...initialVitals };
  let medicalItems = [];
  let inventoryBusy = false;
  let activeWarningCodes = new Set();
  let vitalNoticeTimer = 0;
  let vitalNoticeHideTimer = 0;
  let initialNoticeTimer = 0;
  let vitalStateRefreshTimer = 0;

  function dismissVitalNotice() {
    window.clearTimeout(vitalNoticeTimer);
    window.clearTimeout(vitalNoticeHideTimer);

    if (!vitalNotice) return;
    vitalNotice.hidden = true;
    delete vitalNotice.dataset.state;
  }

  function showVitalNotice(alert) {
    if (!alert || alert.severity === 'ok' || !vitalNotice) return;

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
    const grid = overlay.querySelector('[data-inventory-grid]');
    const capacity = overlay.querySelector('.mn-inventory-capacity b');
    if (!grid) return;
    const occupied = medicalItems.filter((item) => Number(item.quantity || 0) > 0).length;
    grid.innerHTML = renderMedicalItems(medicalItems);
    if (capacity) capacity.textContent = String(occupied);
    grid.dataset.busy = inventoryBusy ? 'true' : 'false';
  }

  async function refreshMedicalInventory() {
    try {
      const result = await loadMyMedicalInventory();
      medicalItems = Array.isArray(result?.items) ? result.items : [];
      renderMedicalInventory();
    } catch (error) {
      if (!String(error?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[inventory] medical inventory load failed:', error);
      }
    }
  }

  async function useMedicine(medicineType) {
    if (!medicineType || inventoryBusy) return;
    inventoryBusy = true;
    renderMedicalInventory();
    try {
      const result = await useMyMedicine(medicineType);
      await notifyHospitalTreatmentStarted(localTelegramId(), result?.hospitalId);
      window.dispatchEvent(new CustomEvent('mn:hospital-treatment-started-local'));
      window.dispatchEvent(new CustomEvent('mn:toast', {
        detail: { type: 'success', message: `${result?.medicineLabel || 'Препарат'} применён. Восстановление HP началось.` },
      }));
      await refreshMedicalInventory();
    } catch (error) {
      window.dispatchEvent(new CustomEvent('mn:toast', {
        detail: { type: 'error', message: getHospitalUserErrorMessage(error) },
      }));
    } finally {
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

  function handleVitalsChanged(event) {
    updateVitalsFromSnapshot(getVitalsSnapshotFromEvent(event));
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

  function handleGridClick(event) {
    const item = event.target.closest('[data-medicine-type]');
    if (!item) return;
    event.preventDefault();
    void useMedicine(item.dataset.medicineType);
  }

  closeTargets.forEach((target) => target.addEventListener('click', handleCloseClick));
  overlay.querySelector('[data-inventory-grid]')?.addEventListener('click', handleGridClick);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('mn:player-balance-changed', handleVitalsChanged);
  window.addEventListener('mn:player-vitals-changed', handleVitalsChanged);
  window.addEventListener('mn:player-health-changed', handleHealthChanged);
  window.addEventListener('mn:medical-inventory-changed', refreshMedicalInventory);

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
  activeWarningCodes.clear();
  initialNoticeTimer = window.setTimeout(() => {
    renderVitals(getStateVitals(currentVitals), { notify: true });
  }, 700);
  vitalStateRefreshTimer = window.setInterval(() => {
    updateVitalsFromSnapshot(getStateVitals(currentVitals), { notify: true });
  }, 1500);

  publishState(false);

  return () => {
    bodyClassObserver.disconnect();
    closeTargets.forEach((target) => target.removeEventListener('click', handleCloseClick));
    overlay.querySelector('[data-inventory-grid]')?.removeEventListener('click', handleGridClick);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('mn:player-balance-changed', handleVitalsChanged);
    window.removeEventListener('mn:player-vitals-changed', handleVitalsChanged);
    window.removeEventListener('mn:player-health-changed', handleHealthChanged);
    window.removeEventListener('mn:medical-inventory-changed', refreshMedicalInventory);
    window.clearTimeout(initialNoticeTimer);
    window.clearTimeout(vitalNoticeTimer);
    window.clearTimeout(vitalNoticeHideTimer);
    window.clearInterval(vitalStateRefreshTimer);
    open = false;
    publishState(false);
    vitalNotice?.remove();
    overlay.remove();
  };
}
