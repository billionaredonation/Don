import { state } from '../state.js';
import {
  buyCafeteriaItem,
  getHospitalUserErrorMessage,
  loadCafeteriaMenu,
} from './hospitalWarehouseFeature.js';
import './hospitalCafeteria.css';

const OPEN_CLASS = 'mn-hospital-cafeteria-open';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function money(value) {
  return `${Math.max(0, Math.floor(Number(value || 0))).toLocaleString('ru-RU')} ₴`;
}

function number(value) {
  return Math.max(0, Math.floor(Number(value || 0))).toLocaleString('ru-RU');
}

function toast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
}

function markup() {
  return `
    <div class="mn-hospital-cafeteria" data-hospital-cafeteria hidden aria-hidden="true">
      <button type="button" class="mn-hospital-cafeteria-backdrop" data-hospital-cafeteria-close aria-label="Закрыть столовку"></button>
      <section class="mn-hospital-cafeteria-panel" role="dialog" aria-modal="true" aria-labelledby="mn-hospital-cafeteria-title">
        <header>
          <span class="mn-hospital-cafeteria-icon" aria-hidden="true">🍽</span>
          <span>
            <small data-hospital-cafeteria-place>Столовка</small>
            <strong id="mn-hospital-cafeteria-title">Меню столовки</strong>
          </span>
          <button type="button" data-hospital-cafeteria-close aria-label="Закрыть">×</button>
        </header>
        <div class="mn-hospital-cafeteria-message" data-hospital-cafeteria-message hidden></div>
        <div class="mn-hospital-cafeteria-body" data-hospital-cafeteria-body>
          <p>Загрузка меню…</p>
        </div>
      </section>
    </div>`;
}

export function enableHospitalCafeteriaFeature() {
  document.querySelectorAll('[data-hospital-cafeteria]').forEach((element) => element.remove());
  document.body.insertAdjacentHTML('beforeend', markup());

  const overlay = document.querySelector('[data-hospital-cafeteria]');
  const panel = overlay?.querySelector('.mn-hospital-cafeteria-panel');
  const place = overlay?.querySelector('[data-hospital-cafeteria-place]');
  const body = overlay?.querySelector('[data-hospital-cafeteria-body]');
  const message = overlay?.querySelector('[data-hospital-cafeteria-message]');
  const closeTargets = Array.from(overlay?.querySelectorAll('[data-hospital-cafeteria-close]') || []);

  if (!overlay || !panel || !body) return { open: async () => false, close() {}, cleanup() {} };

  let openState = false;
  let busy = false;
  let menuItems = [];

  function setMessage(text, type = 'info') {
    if (!message) return;
    message.hidden = !text;
    message.textContent = text || '';
    message.dataset.type = type;
  }

  function setBusy(value) {
    busy = Boolean(value);
    panel.dataset.busy = busy ? 'true' : 'false';
    panel.querySelectorAll('button, input').forEach((element) => {
      if (element.matches('[data-hospital-cafeteria-close]')) return;
      element.disabled = busy;
    });
  }

  function render() {
    if (!menuItems.length) {
      body.innerHTML = '<div class="mn-hospital-cafeteria-empty">Меню пока пустое.</div>';
      return;
    }

    body.innerHTML = `
      <div class="mn-hospital-cafeteria-list">
        ${menuItems.map((item) => {
          const itemType = String(item.itemType || 'food');
          const label = item.label || 'Обед';
          const icon = item.icon || '🍔';
          return `
            <article data-cafeteria-item="${escapeHtml(itemType)}">
              <span class="mn-hospital-cafeteria-food-icon" aria-hidden="true">${escapeHtml(icon)}</span>
              <span class="mn-hospital-cafeteria-food-copy">
                <b>${escapeHtml(label)}</b>
                <small>Цена: ${money(item.price)} · +${number(item.foodRestore)} еды · +${number(item.waterRestore)} воды</small>
              </span>
              <input type="number" min="1" max="100" step="1" value="1" data-cafeteria-quantity aria-label="Количество">
              <button type="button" data-cafeteria-buy>Купить</button>
            </article>`;
        }).join('')}
      </div>`;
  }

  async function loadMenu() {
    setMessage('');
    body.innerHTML = '<p>Загрузка меню…</p>';
    try {
      const result = await loadCafeteriaMenu();
      menuItems = Array.isArray(result?.items) ? result.items : [];
      render();
      return true;
    } catch (error) {
      body.innerHTML = '<div class="mn-hospital-cafeteria-empty">Не удалось загрузить меню.</div>';
      setMessage(getHospitalUserErrorMessage(error), 'error');
      return false;
    }
  }

  async function buy(button) {
    const card = button.closest('[data-cafeteria-item]');
    if (!card || busy) return;

    const itemType = String(card.dataset.cafeteriaItem || 'food');
    const quantity = Math.max(1, Math.min(100, Math.floor(Number(card.querySelector('[data-cafeteria-quantity]')?.value || 1))));

    setBusy(true);
    try {
      const result = await buyCafeteriaItem({ itemType, quantity });
      if (Number.isFinite(Number(result?.balance))) {
        state.player = { ...(state.player || {}), balance: Number(result.balance) };
        window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
          detail: { balance: Number(result.balance), source: 'cafeteria_buy', result },
        }));
      }
      window.dispatchEvent(new CustomEvent('mn:medical-inventory-changed'));
      setMessage(`Куплено: ${number(result?.quantity || quantity)} шт. · ${money(result?.totalPrice || 0)}. Еда добавлена в инвентарь.`, 'success');
      toast('Еда добавлена в инвентарь.', 'success');
    } catch (error) {
      setMessage(getHospitalUserErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function open(options = {}) {
    if (openState || window.__MN_INVENTORY_OPEN__ === true || window.__MN_HOSPITAL_WAREHOUSE_OPEN__ === true) return false;
    openState = true;
    window.__MN_HOSPITAL_CAFETERIA_OPEN__ = true;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add(OPEN_CLASS);
    document.documentElement.classList.add(OPEN_CLASS);
    if (place) place.textContent = options.locationName || 'Столовка';
    await loadMenu();
    return true;
  }

  function close() {
    openState = false;
    window.__MN_HOSPITAL_CAFETERIA_OPEN__ = false;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove(OPEN_CLASS);
    document.documentElement.classList.remove(OPEN_CLASS);
    setMessage('');
  }

  function handleClick(event) {
    const buyButton = event.target.closest('[data-cafeteria-buy]');
    if (buyButton) {
      void buy(buyButton);
    }
  }

  function handleKeyDown(event) {
    if (!openState || event.repeat || event.code !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation?.();
    close();
  }

  closeTargets.forEach((target) => target.addEventListener('click', close));
  body.addEventListener('click', handleClick);
  window.addEventListener('keydown', handleKeyDown, true);

  return {
    open,
    close,
    cleanup() {
      closeTargets.forEach((target) => target.removeEventListener('click', close));
      body.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown, true);
      close();
      overlay.remove();
    },
  };
}
