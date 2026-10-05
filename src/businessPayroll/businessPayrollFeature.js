import './businessPayroll.css';
import { supabase } from '../supabaseClient.js';

const BUSINESS_TYPES = new Set([
  'fruit_factory',
  'metallurgy_factory',
  'textile_factory',
  'wood_processing_factory',
  'tool_assembly_factory',
  'construction_factory',
  'grocery_store',
  'food_store',
  'accessory_store',
  'tool_store',
  'hydro_power_plant',
  'nuclear_power_plant',
  'coal_power_plant',
  'energy_substation',
  'water_treatment_plant',
  'car_factory',
  'car_dealer',
  'auto_service',
  'oil_well',
  'oil_refinery',
  'fuel_station',
  'ukrgaz_plant',
  'logistics_business',
  'logistics_company',
  'farm_business',
  'mine_business',
  'lumber_business',
  'hospital',
]);

function initData() {
  return window.Telegram?.WebApp?.initData || '';
}

function text(value) {
  return String(value ?? '').trim();
}

function getType(object = {}) {
  return text(
    object?.payload?.jobType ||
    object?.payload?.type ||
    object?.type ||
    object?.category
  ).toLowerCase();
}

function getOwnerId(object = {}) {
  return text(
    object?.owner_id ||
    object?.ownerId ||
    object?.payload?.ownerId ||
    object?.payload?.owner_id
  );
}

function getBusinessId(object = {}) {
  return text(
    object?.id ||
    object?.businessId ||
    object?.payload?.businessId ||
    object?.payload?.business_id
  );
}

function getCityId(object = {}, fallback = '') {
  return text(object?.cityId || object?.city_id || fallback);
}

function isBusinessObject(object = {}) {
  const type = getType(object);
  const payload = object?.payload || {};

  if (!getOwnerId(object)) return false;
  if (['house','bank','bank_branch','bank_office','mn_bank','power_transformer'].includes(type)) return false;

  return (
    BUSINESS_TYPES.has(type) ||
    Boolean(payload.publicBusinessId || payload.public_business_id || payload.businessId || payload.business_id) ||
    String(object?.category || '').toLowerCase() === 'business'
  );
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₴`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

async function callPayroll(payload) {
  const tg = initData();
  if (!tg) throw new Error('TELEGRAM_SESSION_REQUIRED');

  const { data, error } = await supabase.functions.invoke('business-payroll', {
    body: { initData: tg, ...payload },
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'BUSINESS_PAYROLL_REQUEST_FAILED');
  return data.result;
}

function visibleElement(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function normalizeButtonText(button) {
  return text(button?.textContent).replace(/\s+/g,' ').toLowerCase();
}

export function enableBusinessPayrollFeature({ root, cityId } = {}) {
  if (!root) return () => {};

  let currentObject = null;
  let snapshot = null;
  let destroyed = false;
  let injectTimer = 0;

  const modal = document.createElement('div');
  modal.className = 'mn-payroll-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="mn-payroll-backdrop" data-payroll-close></div>
    <section class="mn-payroll-card" role="dialog" aria-modal="true">
      <header class="mn-payroll-header">
        <div>
          <small>ФИНАНСЫ · ПЕРСОНАЛ</small>
          <h2 data-payroll-title>Оплата труда</h2>
          <p data-payroll-subtitle>Управление зарплатами предприятия</p>
        </div>
        <button type="button" class="mn-payroll-close" data-payroll-close>×</button>
      </header>

      <div class="mn-payroll-tabs">
        <button type="button" class="is-active" data-payroll-tab="rates">Ставки</button>
        <button type="button" data-payroll-tab="employees">Сотрудники</button>
      </div>

      <section class="mn-payroll-panel" data-payroll-panel="rates">
        <div class="mn-payroll-block">
          <div class="mn-payroll-block-title">
            <div>
              <strong>Общая ставка работника</strong>
              <span>Применяется, если сотруднику не назначена персональная ставка.</span>
            </div>
            <b data-payroll-default-current>0 ₴</b>
          </div>

          <div class="mn-payroll-form-row">
            <input type="number" min="0" max="1000000000" step="1" value="0" data-payroll-default-wage>
            <select data-payroll-default-type>
              <option value="per_action">За действие / партию</option>
              <option value="shift">За смену</option>
              <option value="manual">Только ручная выплата</option>
            </select>
            <button type="button" data-payroll-save-default>Сохранить</button>
          </div>
        </div>

        <div class="mn-payroll-info">
          <b>Приоритет:</b> персональная ставка сотрудника → ставка роли → ставка рецепта/производства → системная ставка.
          Выплата идёт из кассы предприятия только на зарплатный счёт.
        </div>
      </section>

      <section class="mn-payroll-panel" data-payroll-panel="employees" hidden>
        <div class="mn-payroll-block">
          <strong>Назначить сотрудника</strong>

          <div class="mn-payroll-form-grid">
            <label>
              <span>Игрок</span>
              <input type="text" placeholder="Nickname или Telegram ID" data-payroll-target>
            </label>

            <label>
              <span>Роль</span>
              <input type="text" value="worker" placeholder="worker" data-payroll-role>
            </label>

            <label>
              <span>Ставка</span>
              <input type="number" min="0" max="1000000000" step="1" value="0" data-payroll-wage>
            </label>

            <label>
              <span>Тип оплаты</span>
              <select data-payroll-payment-type>
                <option value="per_action">За действие / партию</option>
                <option value="shift">За смену</option>
                <option value="manual">Только ручная</option>
              </select>
            </label>
          </div>

          <button type="button" class="mn-payroll-primary" data-payroll-add>
            Назначить / обновить
          </button>
        </div>

        <div class="mn-payroll-employee-list" data-payroll-employees></div>
      </section>

      <div class="mn-payroll-message" data-payroll-message></div>
    </section>
  `;

  document.body.appendChild(modal);

  const title = modal.querySelector('[data-payroll-title]');
  const subtitle = modal.querySelector('[data-payroll-subtitle]');
  const message = modal.querySelector('[data-payroll-message]');
  const employeesEl = modal.querySelector('[data-payroll-employees]');
  const defaultCurrent = modal.querySelector('[data-payroll-default-current]');
  const defaultWage = modal.querySelector('[data-payroll-default-wage]');
  const defaultType = modal.querySelector('[data-payroll-default-type]');
  const targetInput = modal.querySelector('[data-payroll-target]');
  const roleInput = modal.querySelector('[data-payroll-role]');
  const wageInput = modal.querySelector('[data-payroll-wage]');
  const paymentTypeInput = modal.querySelector('[data-payroll-payment-type]');

  function setMessage(value = '', kind = '') {
    message.textContent = String(value || '');
    message.dataset.kind = kind;
  }

  function currentIdentity() {
    return {
      businessId: getBusinessId(currentObject),
      cityId: getCityId(currentObject, cityId),
    };
  }

  function showTab(name) {
    modal.querySelectorAll('[data-payroll-tab]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.payrollTab === name);
    });

    modal.querySelectorAll('[data-payroll-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.payrollPanel !== name;
    });
  }

  function renderEmployees() {
    const list = Array.isArray(snapshot?.employees) ? snapshot.employees : [];

    if (!list.length) {
      employeesEl.innerHTML = `
        <div class="mn-payroll-empty">
          Сотрудников пока нет. Добавь игрока по nickname или Telegram ID.
        </div>
      `;
      return;
    }

    employeesEl.innerHTML = list.map((row) => `
      <article class="mn-payroll-employee ${row.active ? '' : 'is-disabled'}" data-employee-id="${escapeHtml(row.tgId)}">
        <div class="mn-payroll-employee-main">
          <strong>${escapeHtml(row.name || row.tgId)}</strong>
          <span>${escapeHtml(row.roleKey || 'worker')} · ${escapeHtml(row.paymentType || 'per_action')}</span>
          <small>${escapeHtml(row.tgId)}</small>
        </div>

        <b>${formatMoney(row.wage)}</b>

        <div class="mn-payroll-employee-actions">
          <button type="button" data-payroll-edit="${escapeHtml(row.tgId)}">Изменить</button>
          <button type="button" data-payroll-pay="${escapeHtml(row.tgId)}">Выплатить</button>
          <button type="button" class="is-danger" data-payroll-remove="${escapeHtml(row.tgId)}">Убрать</button>
        </div>
      </article>
    `).join('');
  }

  function render() {
    if (!snapshot) return;

    title.textContent = `Оплата труда · ${snapshot.businessName || 'Предприятие'}`;
    subtitle.textContent = `${snapshot.businessType || 'business'} · ${snapshot.businessId || ''}`;

    const workerRole = (snapshot.roles || []).find((r) => r.roleKey === 'worker');
    const wage = Number(workerRole?.wage || 0);

    defaultCurrent.textContent = formatMoney(wage);
    defaultWage.value = String(wage);
    defaultType.value = workerRole?.paymentType || 'per_action';

    renderEmployees();
  }

  async function refresh() {
    const { businessId, cityId: currentCityId } = currentIdentity();

    snapshot = await callPayroll({
      action:'snapshot',
      businessId,
      cityId:currentCityId,
    });

    if (destroyed) return;
    render();
  }

  async function bindObject(object) {
    currentObject = object;
    snapshot = null;
    setMessage('');

    removeInjectedButtons();

    if (!isBusinessObject(object)) return;

    const ownerId = getOwnerId(object);
    const ownId = String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || '');

    if (!ownId || ownerId !== ownId) return;

    try {
      await refresh();
      scheduleInject();
    } catch (error) {
      console.warn('[businessPayroll] snapshot failed:', error);
    }
  }

  function open() {
    if (!snapshot) return;

    modal.hidden = false;
    document.body.classList.add('mn-payroll-open');
    showTab('rates');
    setMessage('');
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove('mn-payroll-open');
  }

  function removeInjectedButtons() {
    document.querySelectorAll('[data-mn-payroll-inline-button]').forEach((node) => node.remove());
  }

  function findManagementButton() {
    const buttons = [...document.querySelectorAll('button')];

    return buttons.find((button) => {
      if (!visibleElement(button)) return false;
      if (button.closest('.mn-payroll-modal')) return false;

      const label = normalizeButtonText(button);

      return (
        label === 'управление' ||
        label === 'сотрудники' ||
        label === 'персонал' ||
        label === 'финансы'
      );
    }) || null;
  }

  function injectInlineButton() {
    if (!snapshot || destroyed) return false;
    if (document.querySelector('[data-mn-payroll-inline-button]')) return true;

    const managementButton = findManagementButton();
    if (!managementButton) return false;

    const host = managementButton.parentElement;
    if (!host) return false;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mnPayrollInlineButton = '1';
    button.className = managementButton.className;
    button.textContent = 'Оплата труда';
    button.title = 'Ставки и сотрудники';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      open();
    });

    host.appendChild(button);
    return true;
  }

  function scheduleInject() {
    window.clearTimeout(injectTimer);

    let attempt = 0;

    const tick = () => {
      if (destroyed || !snapshot) return;
      attempt += 1;

      if (injectInlineButton()) return;

      if (attempt < 30) {
        injectTimer = window.setTimeout(tick, 100);
      }
    };

    tick();
  }

  async function saveDefault() {
    const wage = Number(defaultWage.value);

    if (!Number.isFinite(wage) || wage < 0) {
      return setMessage('Некорректная ставка.', 'error');
    }

    const id = currentIdentity();

    try {
      setMessage('Сохраняем…');

      snapshot = await callPayroll({
        action:'set_role',
        ...id,
        roleKey:'worker',
        paymentType:defaultType.value,
        wage,
      });

      render();
      setMessage('Общая ставка сохранена.', 'success');
    } catch (error) {
      setMessage(error?.message || 'Не удалось сохранить ставку.', 'error');
    }
  }

  async function addEmployee() {
    const target = text(targetInput.value);
    const roleKey = text(roleInput.value || 'worker').toLowerCase();
    const wage = Number(wageInput.value);

    if (!target) return setMessage('Укажи игрока.', 'error');
    if (!Number.isFinite(wage) || wage < 0) {
      return setMessage('Некорректная ставка.', 'error');
    }

    const id = currentIdentity();

    try {
      setMessage('Назначаем сотрудника…');

      snapshot = await callPayroll({
        action:'set_employee',
        ...id,
        target,
        roleKey,
        paymentType:paymentTypeInput.value,
        wage,
        active:true,
      });

      targetInput.value = '';
      render();

      setMessage('Сотрудник и ставка сохранены.', 'success');
    } catch (error) {
      setMessage(error?.message || 'Не удалось назначить сотрудника.', 'error');
    }
  }

  async function removeEmployee(employeeTgId) {
    const id = currentIdentity();

    try {
      snapshot = await callPayroll({
        action:'remove_employee',
        ...id,
        employeeTgId,
      });

      render();
      setMessage('Сотрудник убран.', 'success');
    } catch (error) {
      setMessage(error?.message || 'Не удалось убрать сотрудника.', 'error');
    }
  }

  function editEmployee(employeeTgId) {
    const row = (snapshot?.employees || []).find((x) => String(x.tgId) === String(employeeTgId));
    if (!row) return;

    targetInput.value = row.tgId;
    roleInput.value = row.roleKey || 'worker';
    wageInput.value = String(row.wage || 0);
    paymentTypeInput.value = row.paymentType || 'per_action';

    showTab('employees');
    targetInput.focus();
  }

  async function manualPay(employeeTgId) {
    const row = (snapshot?.employees || []).find((x) => String(x.tgId) === String(employeeTgId));
    if (!row) return;

    const raw = window.prompt(
      `Выплата сотруднику ${row.name || row.tgId}`,
      String(row.wage || 0)
    );

    if (raw === null) return;

    const amount = Number(raw);

    if (!Number.isFinite(amount) || amount <= 0) {
      return setMessage('Некорректная сумма выплаты.', 'error');
    }

    const id = currentIdentity();

    try {
      const result = await callPayroll({
        action:'manual_pay',
        ...id,
        employeeTgId,
        amount,
        description:`Ручная выплата · ${snapshot?.businessName || 'Предприятие'}`,
      });

      snapshot = result?.payroll || snapshot;
      render();

      setMessage(
        `Выплачено ${formatMoney(amount)} на зарплатную карту.`,
        'success'
      );
    } catch (error) {
      setMessage(error?.message || 'Не удалось выполнить выплату.', 'error');
    }
  }

  function onObjectAction(event) {
    bindObject(event?.detail?.object);
  }

  function onAnyClick() {
    if (snapshot) {
      window.setTimeout(() => {
        if (!document.querySelector('[data-mn-payroll-inline-button]')) {
          scheduleInject();
        }
      }, 50);
    }
  }

  modal.querySelectorAll('[data-payroll-close]').forEach((node) => {
    node.addEventListener('click', close);
  });

  modal.querySelectorAll('[data-payroll-tab]').forEach((node) => {
    node.addEventListener('click', () => showTab(node.dataset.payrollTab));
  });

  modal.querySelector('[data-payroll-save-default]').addEventListener('click', saveDefault);
  modal.querySelector('[data-payroll-add]').addEventListener('click', addEmployee);

  employeesEl.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-payroll-edit]');
    const pay = event.target.closest('[data-payroll-pay]');
    const remove = event.target.closest('[data-payroll-remove]');

    if (edit) editEmployee(edit.dataset.payrollEdit);
    if (pay) manualPay(pay.dataset.payrollPay);

    if (remove && window.confirm('Убрать сотрудника из предприятия?')) {
      removeEmployee(remove.dataset.payrollRemove);
    }
  });

  window.addEventListener('mn:map-object-action', onObjectAction);
  document.addEventListener('click', onAnyClick, true);

  return () => {
    destroyed = true;
    window.clearTimeout(injectTimer);

    window.removeEventListener('mn:map-object-action', onObjectAction);
    document.removeEventListener('click', onAnyClick, true);

    removeInjectedButtons();
    modal.remove();

    document.body.classList.remove('mn-payroll-open');
  };
}
