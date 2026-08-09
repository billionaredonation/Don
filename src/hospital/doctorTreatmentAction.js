import { state } from '../state.js';
import {
  getHospitalUserErrorMessage,
  loadMyHospitalEmployments,
  treatPlayerForPriceFromInteraction,
} from './hospitalWarehouseFeature.js';

function rankLevel(rank) {
  return ({ junior: 1, middle: 2, senior: 3, admin: 4 })[
    String(rank || '').toLowerCase()
  ] || 0;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function createActionDropdown(root, {
  items = [],
  value = '',
  emptyText = 'Нет доступных вариантов',
  onChange = null,
} = {}) {
  const trigger = root?.querySelector('[data-action-select-trigger]');
  const valueNode = root?.querySelector('[data-action-select-value]');
  const menu = root?.querySelector('[data-action-select-menu]');
  if (!root || !trigger || !valueNode || !menu) return null;

  let options = [];
  let currentValue = '';

  const close = () => {
    root.dataset.open = 'false';
    trigger.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
  };

  const open = () => {
    if (trigger.disabled || !options.length) return;
    root.dataset.open = 'true';
    trigger.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
  };

  const select = (nextValue, emit = true) => {
    const selected = options.find((item) => String(item.value) === String(nextValue)) || options[0] || null;
    currentValue = selected ? String(selected.value) : '';
    valueNode.textContent = selected?.label || emptyText;
    trigger.disabled = !selected;
    trigger.dataset.empty = selected ? 'false' : 'true';

    menu.querySelectorAll('[data-action-select-option]').forEach((button) => {
      const active = button.dataset.value === currentValue;
      button.dataset.selected = active ? 'true' : 'false';
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    close();
    if (emit && typeof onChange === 'function') onChange(currentValue, selected);
  };

  const setItems = (nextItems, preferredValue = currentValue) => {
    options = Array.isArray(nextItems)
      ? nextItems
        .map((item) => ({ value: String(item?.value ?? ''), label: String(item?.label ?? '') }))
        .filter((item) => item.value)
      : [];

    menu.innerHTML = options.map((item) => `
      <button
        type="button"
        role="option"
        class="mn-action-select-option"
        data-action-select-option
        data-value="${escapeHtml(item.value)}"
        aria-selected="false"
      >${escapeHtml(item.label)}</button>`).join('');

    menu.querySelectorAll('[data-action-select-option]').forEach((button) => {
      button.addEventListener('click', () => select(button.dataset.value || ''));
    });

    select(preferredValue, false);
  };

  trigger.addEventListener('click', () => {
    if (root.dataset.open === 'true') close();
    else open();
  });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  setItems(items, value);

  return {
    get value() { return currentValue; },
    setItems,
    select,
    close,
  };
}

async function resolveDoctorAccess() {
  const employments = await loadMyHospitalEmployments();

  if (!employments.length) return null;

  return {
    profession: 'doctor',
    employments,
  };
}

async function renderDoctorTreatment({
  access,
  target,
  content,
  setBusy,
  isBusy,
  setMessage,
  broadcastTo,
  isTargetActive,
}) {
  const employments = Array.isArray(access?.employments)
    ? access.employments
    : [];

  if (!employments.length || !target) {
    content.innerHTML = '<p>Доступ к подсистеме лечения не подтверждён.</p>';
    return;
  }

  content.innerHTML = `
    <div class="mn-player-action-form" data-doctor-treatment-form>
      <strong>Подсистема лечения</strong>
      <label>
        <span>Больница</span>
        <div class="mn-action-select" data-heal-hospital-select data-open="false">
          <button type="button" class="mn-action-select-trigger" data-action-select-trigger aria-haspopup="listbox" aria-expanded="false">
            <span data-action-select-value>Больница</span><i aria-hidden="true">⌄</i>
          </button>
          <div class="mn-action-select-menu" data-action-select-menu role="listbox" hidden></div>
        </div>
      </label>
      <label>
        <span>Препарат</span>
        <div class="mn-action-select" data-heal-medicine-select data-open="false">
          <button type="button" class="mn-action-select-trigger" data-action-select-trigger aria-haspopup="listbox" aria-expanded="false">
            <span data-action-select-value>Выберите препарат</span><i aria-hidden="true">⌄</i>
          </button>
          <div class="mn-action-select-menu" data-action-select-menu role="listbox" hidden></div>
        </div>
      </label>
      <label><span>Цена лечения <small>можно 0</small></span><input type="number" min="0" max="1000000000" step="1" inputmode="numeric" value="0" data-heal-price></label>
      <button type="button" class="is-primary" data-heal-submit>Вылечить</button>
      <small>Таблетка применяется к другому игроку через подсистему врача и не попадает в его инвентарь. Любой доступный препарат можно применять при любом уровне HP пациента. Если не хватает еды, воды или денег, ничего не списывается.</small>
    </div>`;

  const hospitalRoot = content.querySelector('[data-heal-hospital-select]');
  const medicineRoot = content.querySelector('[data-heal-medicine-select]');
  const priceInput = content.querySelector('[data-heal-price]');
  const submit = content.querySelector('[data-heal-submit]');

  let medicineSelect = null;

  const renderMedicines = () => {
    const hospitalIndex = Math.max(0, Number(hospitalSelect?.value || 0));
    const employment = employments[hospitalIndex] || employments[0];
    const level = rankLevel(employment.rank);
    const available = (employment.items || []).filter((item) =>
      Number(item.personalQuantity || 0) > 0 &&
      level >= Number(item.minTreatRank || 1)
    );

    const medicineItems = available.map((item) => ({
      value: item.itemType,
      label: `${item.label} · ${Number(item.personalQuantity || 0)} шт.`,
    }));

    if (!medicineSelect) {
      medicineSelect = createActionDropdown(medicineRoot, {
        items: medicineItems,
        value: medicineItems[0]?.value || '',
        emptyText: 'Нет доступных препаратов',
      });
    } else {
      medicineSelect.setItems(medicineItems, medicineItems[0]?.value || '');
    }

    submit.disabled = !available.length;

    if (!available.length) {
      setMessage('Нет доступных препаратов. Получите их со склада больницы.', 'error');
    } else {
      setMessage('');
    }
  };

  const hospitalSelect = createActionDropdown(hospitalRoot, {
    items: employments.map((employment, index) => ({
      value: String(index),
      label: employment.displayName || 'Больница',
    })),
    value: '0',
    onChange: renderMedicines,
  });

  renderMedicines();

  submit.addEventListener('click', async () => {
    if (
      isBusy() ||
      !medicineSelect?.value ||
      !isTargetActive() ||
      !target.target
    ) return;

    const employment = employments[Math.max(0, Number(hospitalSelect?.value || 0))] || employments[0];
    const medicineType = medicineSelect.value;
    const price = Math.max(0, Math.floor(Number(priceInput.value || 0)));
    let successMessage = '';

    setBusy(true);

    try {
      const result = await treatPlayerForPriceFromInteraction({
        hospitalId: employment.hospitalId,
        target: target.target,
        medicineType,
        price,
      });

      await broadcastTo(result?.patientTgId, 'treatment_offer_created', {
        ...result,
        doctorNickname: result?.doctorNickname || state.nickname || 'Врач',
      });

      successMessage = `Предложение лечения отправлено игроку ${result?.patientNickname || target.nickname}. Таблетка и деньги будут списаны только после его подтверждения Y.`;
    } catch (error) {
      setMessage(getHospitalUserErrorMessage(error), 'error');
    } finally {
      setBusy(false);
      if (successMessage) setMessage(successMessage, 'success');
    }
  });
}

export const doctorTreatmentAction = Object.freeze({
  id: 'doctor_treatment',
  order: 10,
  accessCacheMs: 15_000,
  button: Object.freeze({
    icon: '✚',
    label: 'Вылечить',
    description: 'Подсистема врача',
  }),
  resolveAccess: resolveDoctorAccess,
  render: renderDoctorTreatment,
});
