import './productionWage.css';
import { supabase } from '../supabaseClient.js';

const FACTORY_TYPES = new Set([
  'fruit_factory',
  'metallurgy_factory',
  'textile_factory',
  'wood_processing_factory',
  'tool_assembly_factory',
]);

function getInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

function getFactoryType(object = {}) {
  return String(
    object?.payload?.jobType ||
    object?.payload?.type ||
    object?.type ||
    object?.category ||
    ''
  ).trim().toLowerCase();
}

function getFactoryId(object = {}) {
  return String(
    object?.id ||
    object?.factoryId ||
    object?.payload?.factoryId ||
    object?.payload?.factory_id ||
    ''
  ).trim();
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
  })} ₴`;
}

async function request(payload) {
  const initData = getInitData();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');

  const { data, error } = await supabase.functions.invoke('production-wages', {
    body: { initData, ...payload },
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'PRODUCTION_WAGE_REQUEST_FAILED');
  return data.result;
}

export function enableProductionWageFeature({ root, cityId } = {}) {
  if (!root) return () => {};

  let current = null;
  let destroyed = false;

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'mn-production-wage-launcher';
  launcher.innerHTML = '<span>₴</span><b>Оплата труда</b>';
  launcher.hidden = true;

  const modal = document.createElement('div');
  modal.className = 'mn-production-wage-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="mn-production-wage-backdrop" data-production-wage-close></div>
    <section class="mn-production-wage-card" role="dialog" aria-modal="true">
      <header>
        <div>
          <small>ФИНАНСЫ ПРЕДПРИЯТИЯ</small>
          <h3 data-production-wage-title>Оплата труда</h3>
          <p>Ставка за одно производственное действие/партию. Деньги списываются из кассы предприятия и зачисляются работнику на зарплатный счёт.</p>
        </div>
        <button type="button" data-production-wage-close aria-label="Закрыть">×</button>
      </header>

      <div class="mn-production-wage-status">
        <span><small>Предприятие</small><strong data-production-wage-factory>—</strong></span>
        <span><small>Текущая ставка</small><strong data-production-wage-current>0 ₴</strong></span>
      </div>

      <label class="mn-production-wage-field">
        <span>Оплата работнику за производство</span>
        <input type="number" min="0" max="1000000000" step="1" value="0" data-production-wage-input>
      </label>

      <div class="mn-production-wage-note">
        Если для конкретного рецепта уже существует отдельная ставка, она имеет приоритет над общей. Для пищевого завода сохраняются его текущие ставки по каждому рецепту.
      </div>

      <div class="mn-production-wage-actions">
        <button type="button" data-production-wage-save>Сохранить ставку</button>
      </div>

      <div class="mn-production-wage-message" data-production-wage-message></div>
    </section>
  `;

  root.appendChild(launcher);
  document.body.appendChild(modal);

  const title = modal.querySelector('[data-production-wage-title]');
  const factoryLabel = modal.querySelector('[data-production-wage-factory]');
  const currentLabel = modal.querySelector('[data-production-wage-current]');
  const input = modal.querySelector('[data-production-wage-input]');
  const message = modal.querySelector('[data-production-wage-message]');
  const saveButton = modal.querySelector('[data-production-wage-save]');

  function setMessage(value = '', type = '') {
    if (!message) return;
    message.textContent = String(value || '');
    message.dataset.type = type;
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove('mn-production-wage-open');
  }

  function open() {
    if (!current?.snapshot?.isOwner) return;
    modal.hidden = false;
    document.body.classList.add('mn-production-wage-open');
    setMessage('');
  }

  async function loadForObject(object) {
    const type = getFactoryType(object);
    const factoryId = getFactoryId(object);
    const resolvedCityId = String(object?.cityId || object?.city_id || cityId || '').trim();

    if (!FACTORY_TYPES.has(type) || !factoryId || !resolvedCityId) {
      current = null;
      launcher.hidden = true;
      close();
      return;
    }

    launcher.hidden = true;
    current = { object, type, factoryId, cityId: resolvedCityId, snapshot: null };

    try {
      const snapshot = await request({
        action: 'snapshot',
        factoryId,
        cityId: resolvedCityId,
      });

      if (destroyed || current?.factoryId !== factoryId) return;

      current.snapshot = snapshot;

      if (!snapshot?.isOwner) {
        launcher.hidden = true;
        return;
      }

      const wage = Number(snapshot.defaultWage || snapshot?.wages?.default || 0);
      launcher.hidden = false;
      launcher.title = `Оплата труда · ${snapshot.factoryName || object?.name || 'Предприятие'}`;

      if (title) title.textContent = `Оплата труда · ${snapshot.factoryName || 'Предприятие'}`;
      if (factoryLabel) factoryLabel.textContent = snapshot.factoryName || object?.name || factoryId;
      if (currentLabel) currentLabel.textContent = formatMoney(wage);
      if (input) input.value = String(wage);
    } catch (error) {
      console.warn('[productionWages] snapshot failed:', error);
      launcher.hidden = true;
    }
  }

  async function save() {
    if (!current?.snapshot?.isOwner || !input) return;

    const wage = Number(input.value);
    if (!Number.isFinite(wage) || wage < 0) {
      setMessage('Укажи корректную ставку.', 'error');
      return;
    }

    saveButton.disabled = true;
    setMessage('Сохраняем…');

    try {
      const snapshot = await request({
        action: 'set_wage',
        factoryId: current.factoryId,
        cityId: current.cityId,
        productKey: 'default',
        wage,
      });

      current.snapshot = snapshot;
      const savedWage = Number(snapshot.defaultWage || snapshot?.wages?.default || wage);
      input.value = String(savedWage);
      if (currentLabel) currentLabel.textContent = formatMoney(savedWage);
      setMessage('Ставка сохранена. Следующее производство будет оплачено по ней.', 'success');
    } catch (error) {
      setMessage(error?.message || 'Не удалось сохранить ставку.', 'error');
    } finally {
      saveButton.disabled = false;
    }
  }

  function onFactoryAction(event) {
    loadForObject(event?.detail?.object);
  }

  function onCloseOtherObject(event) {
    const object = event?.detail?.object;
    if (!object) return;
    if (!FACTORY_TYPES.has(getFactoryType(object))) {
      launcher.hidden = true;
      close();
      current = null;
    }
  }

  launcher.addEventListener('click', open);
  saveButton?.addEventListener('click', save);
  modal.querySelectorAll('[data-production-wage-close]').forEach((button) => {
    button.addEventListener('click', close);
  });

  window.addEventListener('mn:production-factory-object-action', onFactoryAction);
  window.addEventListener('mn:map-object-action', onCloseOtherObject);

  return () => {
    destroyed = true;
    window.removeEventListener('mn:production-factory-object-action', onFactoryAction);
    window.removeEventListener('mn:map-object-action', onCloseOtherObject);
    launcher.remove();
    modal.remove();
    document.body.classList.remove('mn-production-wage-open');
  };
}
