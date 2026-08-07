// Hospital batch refresh 2026-07-20: management feature deploy marker.
import {
  getHospitalUserErrorMessage,
  invokeHospitalAction,
} from './hospitalWarehouseFeature.js';
import './hospitalManagement.css';

const PANEL_CLASS = 'mn-hospital-management-open';
const HINT_VISIBLE_MS = 8500;

const RANK_LABELS = Object.freeze({
  junior: 'Младший состав',
  middle: 'Средний состав',
  senior: 'Старший состав',
  admin: 'Администрация',
});

const ITEM_LABELS = Object.freeze({
  food: 'Продукты',
  medicine_light: 'Простые таблетки',
  medicine_strong: 'Сильные таблетки',
  medicine_resuscitation: 'Реанимационные таблетки',
});

function rankLevel(rank) {
  return ({ junior: 1, middle: 2, senior: 3, admin: 4 })[String(rank || '').toLowerCase()] || 0;
}

function money(value) {
  return `${Math.max(0, Math.floor(Number(value || 0))).toLocaleString('ru-RU')} ₴`;
}

function number(value) {
  return Math.max(0, Math.floor(Number(value || 0))).toLocaleString('ru-RU');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isTypingTarget(target) {
  const element = target instanceof Element ? target : document.activeElement;
  return Boolean(element?.closest?.('input, textarea, select, [contenteditable="true"]') || element?.isContentEditable);
}

function hasBlockingInterface() {
  return (
    window.__MN_HOSPITAL_WAREHOUSE_OPEN__ === true ||
    window.__MN_HOSPITAL_RECEPTION_OPEN__ === true ||
    window.__MN_INVENTORY_OPEN__ === true ||
    document.body.classList.contains('mn-player-interaction-open') ||
    document.body.classList.contains('mn-hospital-warehouse-open') ||
    document.body.classList.contains('mn-inventory-open') ||
    document.body.classList.contains('mn-houses-modal-open') ||
    document.body.classList.contains('admin-mode')
  );
}

function toast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
}

function markup() {
  return `
    <button type="button" class="mn-hospital-management-hint" data-hospital-management-hint hidden>
      <b>F2</b><span>Меню больницы</span>
    </button>
    <div class="mn-hospital-management" data-hospital-management hidden aria-hidden="true">
      <div class="mn-hospital-management-backdrop" data-hospital-management-close aria-hidden="true"></div>
      <section class="mn-hospital-management-panel" role="dialog" aria-modal="true" aria-labelledby="mn-hospital-management-title">
        <header>
          <span>
            <small>Фракция больницы</small>
            <strong id="mn-hospital-management-title">Управление больницей</strong>
          </span>
          <button type="button" data-hospital-management-close aria-label="Закрыть">×</button>
        </header>
        <div class="mn-hospital-management-message" data-hospital-management-message hidden></div>
        <div class="mn-hospital-management-body" data-hospital-management-body>
          <p>Загрузка данных…</p>
        </div>
      </section>
    </div>`;
}

export function enableHospitalManagementFeature() {
  document.querySelectorAll('[data-hospital-management], [data-hospital-management-hint]').forEach((element) => element.remove());
  document.body.insertAdjacentHTML('beforeend', markup());

  const overlay = document.querySelector('[data-hospital-management]');
  const panel = overlay?.querySelector('.mn-hospital-management-panel');
  const body = overlay?.querySelector('[data-hospital-management-body]');
  const message = overlay?.querySelector('[data-hospital-management-message]');
  const hint = document.querySelector('[data-hospital-management-hint]');
  const closeButtons = Array.from(overlay?.querySelectorAll('[data-hospital-management-close]') || []);
  if (!overlay || !panel || !body || !hint) return () => {};

  let data = null;
  let selectedHospitalId = '';
  let busy = false;
  let hintTimer = 0;
  let destroyed = false;

  function setMessage(text, type = 'info') {
    if (!message) return;
    message.hidden = !text;
    message.textContent = text || '';
    message.dataset.type = type;
  }

  function setBusy(value) {
    busy = Boolean(value);
    panel.dataset.busy = busy ? 'true' : 'false';
    panel.querySelectorAll('button, input, select').forEach((element) => {
      if (element.matches('[data-hospital-management-close], [data-hospital-select]')) return;
      element.disabled = busy;
    });
  }

  function hospitals() {
    return Array.isArray(data?.hospitals) ? data.hospitals : [];
  }

  function selectedHospital() {
    const list = hospitals();
    if (!selectedHospitalId && list[0]) selectedHospitalId = String(list[0].hospitalId || '');
    return list.find((hospital) => String(hospital.hospitalId || '') === selectedHospitalId) || list[0] || null;
  }

  function canShowHint() {
    return hospitals().some((hospital) => hospital.canManage === true || rankLevel(hospital.rank) >= 3);
  }

  function updateHint({ flash = false } = {}) {
    const visible = canShowHint() && overlay.hidden;
    hint.hidden = !visible;
    if (visible && flash) {
      hint.dataset.flash = 'true';
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => { delete hint.dataset.flash; }, HINT_VISIBLE_MS);
    }
  }

  async function loadData({ silent = false } = {}) {
    try {
      const result = await invokeHospitalAction('management_panel');
      data = result || {};
      if (!selectedHospitalId || !hospitals().some((hospital) => String(hospital.hospitalId || '') === selectedHospitalId)) {
        selectedHospitalId = String(hospitals()[0]?.hospitalId || '');
      }
      updateHint({ flash: silent });
      return data;
    } catch (error) {
      if (!silent) setMessage(getHospitalUserErrorMessage(error), 'error');
      return null;
    }
  }

  function renderSummary(hospital) {
    const own = hospital.ownStats || {};
    const rank = rankLevel(hospital.rank);
    return `
      <div class="mn-hospital-management-summary">
        <span><small>Должность</small><b>${escapeHtml(RANK_LABELS[hospital.rank] || hospital.rank || '—')}</b></span>
        <span><small>Онлайн</small><b>${number(hospital.onlineCount)} / ${number(hospital.employeeCount)}</b></span>
        ${hospital.canManage
          ? `<span><small>Бюджет закупок</small><b>${money(hospital.budget)}</b></span>`
          : `<span><small>Доступ</small><b>${rank >= 2 ? 'Средний состав' : 'Лёгкие препараты'}</b></span>`}
        <span><small>Ваша стата</small><b>${number(own.playersTreated)} леч. · ${number(own.medicinesSold)} прод.</b></span>
      </div>`;
  }

  function renderStock(hospital) {
    const canPurchase = hospital.canPurchase === true;
    const items = Array.isArray(hospital.stock) ? hospital.stock : [];
    if (!items.length) return '<div class="mn-hospital-management-empty">Склад пока пустой.</div>';
    return `
      <div class="mn-hospital-management-section">
        <h3>Склад и закупка</h3>
        <small class="mn-hospital-management-note">Закупка пополняет склад больницы. Взять себе медикаменты всё равно можно только у складского пикапа.</small>
        <div class="mn-hospital-management-stock">
          ${items.map((item) => {
            const itemType = String(item.itemType || '');
            const label = item.label || ITEM_LABELS[itemType] || itemType;
            return `
              <article data-management-stock-item="${escapeHtml(itemType)}">
                <span><b>${escapeHtml(item.icon || '□')} ${escapeHtml(label)}</b><small>На складе: ${number(item.warehouseQuantity)} · закупка: ${money(item.purchasePrice)} / шт.</small></span>
                ${canPurchase ? `
                  <input type="number" min="1" max="100000" step="1" value="10" data-management-purchase-quantity>
                  <button type="button" data-management-purchase>Закупить</button>
                ` : ''}
              </article>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderStaff(hospital) {
    const canManage = hospital.canManage === true;
    if (!canManage) return '';
    const employees = Array.isArray(hospital.employees) ? hospital.employees : [];
    return `
      <div class="mn-hospital-management-section">
        <h3>Сотрудники</h3>
        <div class="mn-hospital-management-staff-form">
          <input
            type="text"
            maxlength="48"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            inputmode="text"
            enterkeyhint="done"
            placeholder="Ник или Telegram ID"
            data-management-staff-target
          >
          <button type="button" class="mn-hospital-management-prompt-button" data-management-staff-prompt>Ввести</button>
          <select data-management-staff-rank>
            <option value="junior">Младший состав</option>
            <option value="middle">Средний состав</option>
            ${data?.isAdmin ? '<option value="senior">Старший состав</option>' : ''}
            <option value="dismissed">Уволить</option>
          </select>
          <button type="button" data-management-staff-save>Сохранить</button>
        </div>
        <div class="mn-hospital-management-employees">
          ${employees.length ? employees.map((employee) => `
            <article>
              <span>
                <b>${escapeHtml(employee.nickname || 'Игрок')}</b>
                <small>${escapeHtml(RANK_LABELS[employee.rank] || employee.rank || '—')} · ${employee.online ? 'в сети' : 'не в сети'}</small>
              </span>
              <i>${number(employee.playersTreated)} леч. · ${number(employee.medicinesSold)} прод.</i>
            </article>
          `).join('') : '<div class="mn-hospital-management-empty">Сотрудников пока нет.</div>'}
        </div>
      </div>`;
  }

  function renderLimitedInfo(hospital) {
    if (hospital.canManage === true) return '';
    const text = rankLevel(hospital.rank) >= 2
      ? 'Средний состав может смотреть свою статистику и брать доступные медикаменты только у складского пикапа.'
      : 'Младший состав может брать только лёгкие таблетки у складского пикапа и продавать/выдавать их через лечение игрока.';
    return `
      <div class="mn-hospital-management-section">
        <h3>Ваш доступ</h3>
        <p class="mn-hospital-management-limited">${escapeHtml(text)}</p>
      </div>`;
  }

  function render() {
    const list = hospitals();
    const hospital = selectedHospital();

    if (!list.length || !hospital) {
      body.innerHTML = '<div class="mn-hospital-management-empty">Вы не состоите в больнице. Старший состав назначается админом через Telegram-команду.</div>';
      return;
    }

    const title = hospital.displayName || hospital.hospitalName || 'Больница';
    body.innerHTML = `
      <div class="mn-hospital-management-top">
        <label>
          <span>Больница</span>
          <select data-hospital-select>
            ${list.map((entry) => `<option value="${escapeHtml(entry.hospitalId)}" ${String(entry.hospitalId) === String(hospital.hospitalId) ? 'selected' : ''}>${escapeHtml(entry.displayName || entry.hospitalName || entry.hospitalId)}</option>`).join('')}
          </select>
        </label>
        <button type="button" data-management-refresh>Обновить</button>
      </div>
      <h2>${escapeHtml(title)}</h2>
      ${renderSummary(hospital)}
      ${hospital.canManage ? renderStock(hospital) : ''}
      ${renderStaff(hospital)}
      ${renderLimitedInfo(hospital)}`;
  }

  async function open() {
    if (busy || hasBlockingInterface()) return false;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add(PANEL_CLASS);
    document.documentElement.classList.add(PANEL_CLASS);
    hint.hidden = true;
    setMessage('');
    body.innerHTML = '<p>Загрузка данных больницы…</p>';
    await loadData();
    render();
    return true;
  }

  function close() {
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove(PANEL_CLASS);
    document.documentElement.classList.remove(PANEL_CLASS);
    setMessage('');
    updateHint();
  }

  async function purchase(button) {
    const card = button.closest('[data-management-stock-item]');
    const hospital = selectedHospital();
    if (!card || !hospital || busy) return;
    const quantity = Math.max(1, Math.floor(Number(card.querySelector('[data-management-purchase-quantity]')?.value || 1)));
    setBusy(true);
    try {
      const result = await invokeHospitalAction('management_purchase', {
        hospitalId: hospital.hospitalId,
        itemType: card.dataset.managementStockItem,
        quantity,
      });
      setMessage(`Закуплено: ${number(result.quantity)} шт. на сумму ${money(result.totalCost)}.`, 'success');
      await loadData();
      render();
    } catch (error) {
      setMessage(getHospitalUserErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveStaff() {
    const hospital = selectedHospital();
    let target = String(body.querySelector('[data-management-staff-target]')?.value || '').trim();
    const rank = String(body.querySelector('[data-management-staff-rank]')?.value || '').trim();
    if (!target) target = promptStaffTarget();
    if (!hospital || !target || !rank || busy) {
      if (!target) setMessage('Введите ник или Telegram ID сотрудника.', 'error');
      return;
    }
    setBusy(true);
    try {
      await invokeHospitalAction('set_employee_rank', { hospitalId: hospital.hospitalId, target, rank });
      setMessage('Должность сотрудника обновлена.', 'success');
      await loadData();
      render();
    } catch (error) {
      setMessage(getHospitalUserErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function promptStaffTarget() {
    const input = body.querySelector('[data-management-staff-target]');
    if (!input || input.disabled) return '';

    const current = String(input.value || '').trim();
    const value = window.prompt('Введите ник или Telegram ID сотрудника:', current);
    if (value === null) {
      input.focus({ preventScroll: true });
      return current;
    }

    const nextValue = String(value || '').trim();
    input.value = nextValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus({ preventScroll: true });
    return nextValue;
  }

  function handleBodyClick(event) {
    if (event.target.closest('[data-management-staff-target]')) {
      event.target.closest('[data-management-staff-target]')?.focus?.({ preventScroll: true });
      return;
    }

    if (event.target.closest('[data-management-staff-prompt]')) {
      promptStaffTarget();
      return;
    }

    const purchaseButton = event.target.closest('[data-management-purchase]');
    if (purchaseButton) {
      void purchase(purchaseButton);
      return;
    }
    if (event.target.closest('[data-management-staff-save]')) {
      void saveStaff();
      return;
    }
    if (event.target.closest('[data-management-refresh]')) {
      void loadData().then(render);
    }
  }

  function handleBodyChange(event) {
    const select = event.target.closest('[data-hospital-select]');
    if (!select) return;
    selectedHospitalId = String(select.value || '');
    render();
  }

  function handleKeyDown(event) {
    if (!overlay.hidden) {
      if (isTypingTarget(event.target)) {
        if (event.code === 'Escape' && !event.repeat) {
          event.preventDefault();
          event.stopImmediatePropagation?.();
          close();
          return;
        }

        if (event.code === 'Enter' && event.target?.matches?.('[data-management-staff-target]')) {
          event.preventDefault();
          event.stopImmediatePropagation?.();
          void saveStaff();
          return;
        }

        event.stopImmediatePropagation?.();
        return;
      }

      if (event.code === 'Escape' && !event.repeat) {
        event.preventDefault();
        close();
      }
      return;
    }
    if (event.code !== 'F2' || event.repeat || isTypingTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    void open();
  }

  function handlePanelEditableEvent(event) {
    if (!isTypingTarget(event.target)) return;
    const target = event.target;
    window.setTimeout(() => target?.focus?.({ preventScroll: true }), 0);
  }

  function handlePanelEditableKeyDown(event) {
    if (!isTypingTarget(event.target)) return;

    if (event.code === 'Enter' && event.target?.matches?.('[data-management-staff-target]')) {
      event.preventDefault();
      void saveStaff();
    }
  }

  function handleOpenEvent() {
    void open();
  }

  function handleProfessionalStatsChanged(event) {
    const detail = event?.detail || {};
    const hospitalId = String(detail.hospitalId || '');
    const hospital = hospitals().find((entry) => (
      !hospitalId || String(entry.hospitalId || '') === hospitalId
    ));

    if (!hospital) return;

    const current = hospital.ownStats || {};
    const supplied = detail.stats || {};
    const suppliedSold = Number(supplied.medicinesSold ?? supplied.medicines_sold);
    const next = { ...current };

    if (detail.activity === 'treatment') {
      next.playersTreated = Number(current.playersTreated || 0) + 1;
    }

    if (Number.isFinite(suppliedSold)) {
      next.medicinesSold = Math.max(Number(current.medicinesSold || 0), suppliedSold);
    } else if (detail.activity === 'sale') {
      next.medicinesSold = Number(current.medicinesSold || 0) + 1;
    }

    hospital.ownStats = next;
    if (!overlay.hidden) render();
  }

  function handleHintClick() {
    void open();
  }

  closeButtons.forEach((button) => button.addEventListener('click', close));
  hint.addEventListener('click', handleHintClick);
  body.addEventListener('click', handleBodyClick);
  body.addEventListener('change', handleBodyChange);
  panel.addEventListener('pointerdown', handlePanelEditableEvent, true);
  panel.addEventListener('click', handlePanelEditableEvent, true);
  panel.addEventListener('keydown', handlePanelEditableKeyDown);
  panel.addEventListener('beforeinput', handlePanelEditableEvent, true);
  panel.addEventListener('input', handlePanelEditableEvent, true);
  panel.addEventListener('compositionstart', handlePanelEditableEvent, true);
  panel.addEventListener('compositionupdate', handlePanelEditableEvent, true);
  panel.addEventListener('compositionend', handlePanelEditableEvent, true);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('mn:hospital-management-open', handleOpenEvent);
  window.addEventListener('mn:hospital-professional-stats-changed', handleProfessionalStatsChanged);

  window.setTimeout(() => {
    if (!destroyed) void loadData({ silent: true });
  }, 1200);

  return () => {
    destroyed = true;
    window.clearTimeout(hintTimer);
    closeButtons.forEach((button) => button.removeEventListener('click', close));
    hint.removeEventListener('click', handleHintClick);
    body.removeEventListener('click', handleBodyClick);
    body.removeEventListener('change', handleBodyChange);
    panel.removeEventListener('pointerdown', handlePanelEditableEvent, true);
    panel.removeEventListener('click', handlePanelEditableEvent, true);
    panel.removeEventListener('keydown', handlePanelEditableKeyDown);
    panel.removeEventListener('beforeinput', handlePanelEditableEvent, true);
    panel.removeEventListener('input', handlePanelEditableEvent, true);
    panel.removeEventListener('compositionstart', handlePanelEditableEvent, true);
    panel.removeEventListener('compositionupdate', handlePanelEditableEvent, true);
    panel.removeEventListener('compositionend', handlePanelEditableEvent, true);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('mn:hospital-management-open', handleOpenEvent);
    window.removeEventListener('mn:hospital-professional-stats-changed', handleProfessionalStatsChanged);
    document.body.classList.remove(PANEL_CLASS);
    document.documentElement.classList.remove(PANEL_CLASS);
    overlay.remove();
    hint.remove();
  };
}
