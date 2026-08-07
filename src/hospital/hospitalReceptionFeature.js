import { state } from '../state.js';
import {
  buyHospitalReceptionTreatment,
  getHospitalUserErrorMessage,
  loadHospitalReceptionOffer,
} from './hospitalWarehouseFeature.js';
import './hospitalReception.css';

const OPEN_CLASS = 'mn-hospital-reception-open';

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

function health(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function toast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
}

function markup() {
  return `
    <div class="mn-hospital-reception" data-hospital-reception hidden aria-hidden="true">
      <button type="button" class="mn-hospital-reception-backdrop" data-hospital-reception-close aria-label="Закрыть рецепшен"></button>
      <section class="mn-hospital-reception-panel" role="dialog" aria-modal="true" aria-labelledby="mn-hospital-reception-title">
        <header>
          <span class="mn-hospital-reception-icon" aria-hidden="true">✚</span>
          <span>
            <small data-hospital-reception-place>Рецепшен больницы</small>
            <strong id="mn-hospital-reception-title">Простые таблетки</strong>
          </span>
          <button type="button" data-hospital-reception-close aria-label="Закрыть">×</button>
        </header>
        <div class="mn-hospital-reception-message" data-hospital-reception-message hidden></div>
        <div class="mn-hospital-reception-body" data-hospital-reception-body>
          <p>Загрузка предложения…</p>
        </div>
      </section>
    </div>`;
}

export function enableHospitalReceptionFeature() {
  document.querySelectorAll('[data-hospital-reception]').forEach((element) => element.remove());
  document.body.insertAdjacentHTML('beforeend', markup());

  const overlay = document.querySelector('[data-hospital-reception]');
  const panel = overlay?.querySelector('.mn-hospital-reception-panel');
  const place = overlay?.querySelector('[data-hospital-reception-place]');
  const body = overlay?.querySelector('[data-hospital-reception-body]');
  const message = overlay?.querySelector('[data-hospital-reception-message]');
  const closeTargets = Array.from(overlay?.querySelectorAll('[data-hospital-reception-close]') || []);

  if (!overlay || !panel || !body) return { open: async () => false, close() {}, cleanup() {} };

  let openState = false;
  let busy = false;
  let offer = null;
  let currentHealth = health(state.player?.health ?? 100);

  function setMessage(text, type = 'info') {
    if (!message) return;
    message.hidden = !text;
    message.textContent = text || '';
    message.dataset.type = type;
  }

  function setBusy(value) {
    busy = Boolean(value);
    panel.dataset.busy = busy ? 'true' : 'false';
    panel.querySelectorAll('button').forEach((element) => {
      if (element.matches('[data-hospital-reception-close]')) return;
      element.disabled = busy;
    });
  }

  function render() {
    if (!offer) {
      body.innerHTML = '<div class="mn-hospital-reception-empty">Простые таблетки сейчас недоступны.</div>';
      return;
    }

    const healAmount = health(offer.healAmount);
    const nextHealth = Math.min(100, currentHealth + healAmount);
    const fullHealth = currentHealth >= 100;

    body.innerHTML = `
      <article class="mn-hospital-reception-offer">
        <span class="mn-hospital-reception-pill" aria-hidden="true">💊</span>
        <span class="mn-hospital-reception-copy">
          <b>${escapeHtml(offer.label || 'Простые таблетки')}</b>
          <small>Сразу восстанавливает до +${healAmount.toLocaleString('ru-RU')} HP. В инвентарь не добавляется.</small>
        </span>
        <span class="mn-hospital-reception-result">
          <small>Ваше здоровье</small>
          <b>${currentHealth.toLocaleString('ru-RU')} → ${nextHealth.toLocaleString('ru-RU')} HP</b>
        </span>
        <button type="button" data-hospital-reception-buy ${fullHealth ? 'disabled' : ''}>
          ${fullHealth ? 'Здоровье полное' : `Купить и принять · ${money(offer.price)}`}
        </button>
      </article>`;
  }

  async function loadOffer() {
    setMessage('');
    body.innerHTML = '<p>Загрузка предложения…</p>';
    try {
      offer = await loadHospitalReceptionOffer();
      render();
      return true;
    } catch (error) {
      offer = null;
      render();
      setMessage(getHospitalUserErrorMessage(error), 'error');
      return false;
    }
  }

  async function buy() {
    if (busy || !offer) return;

    setBusy(true);
    setMessage('');
    try {
      const result = await buyHospitalReceptionTreatment();
      const previousHealth = health(result?.previousHealth ?? currentHealth);
      const nextHealth = health(result?.health ?? previousHealth);
      const restoredHealth = Math.max(0, Number(result?.healthRestored ?? nextHealth - previousHealth));
      const nextBalance = Number(result?.balance);

      currentHealth = nextHealth;
      state.player = {
        ...(state.player || {}),
        health: nextHealth,
        ...(Number.isFinite(nextBalance) ? { balance: nextBalance } : {}),
      };

      if (Number.isFinite(nextBalance)) {
        window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
          detail: { balance: nextBalance, source: 'hospital_reception_treatment', result },
        }));
      }
      window.dispatchEvent(new CustomEvent('mn:player-health-changed', {
        detail: {
          health: nextHealth,
          delta: restoredHealth,
          animateDamage: false,
          source: 'hospital_reception_treatment',
          result,
        },
      }));
      window.dispatchEvent(new CustomEvent('mn:player-vitals-changed', {
        detail: {
          vitals: { health: nextHealth },
          animateDamage: false,
          source: 'hospital_reception_treatment',
          result,
        },
      }));

      render();
      const successText = `Простая таблетка принята: +${restoredHealth.toLocaleString('ru-RU')} HP.`;
      setMessage(successText, 'success');
      toast(successText, 'success');
    } catch (error) {
      setMessage(getHospitalUserErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function open(options = {}) {
    if (
      openState ||
      window.__MN_INVENTORY_OPEN__ === true ||
      window.__MN_HOSPITAL_WAREHOUSE_OPEN__ === true ||
      window.__MN_HOSPITAL_CAFETERIA_OPEN__ === true ||
      window.__MN_HOSPITAL_PATIENT_MEDICINE_OPEN__ === true
    ) return false;

    openState = true;
    window.__MN_HOSPITAL_RECEPTION_OPEN__ = true;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add(OPEN_CLASS);
    document.documentElement.classList.add(OPEN_CLASS);
    if (place) place.textContent = options.locationName || 'Рецепшен больницы';
    currentHealth = health(options.health ?? state.player?.health ?? currentHealth);
    await loadOffer();
    return true;
  }

  function close() {
    openState = false;
    window.__MN_HOSPITAL_RECEPTION_OPEN__ = false;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove(OPEN_CLASS);
    document.documentElement.classList.remove(OPEN_CLASS);
    setMessage('');
  }

  function handleClick(event) {
    if (event.target.closest('[data-hospital-reception-buy]')) void buy();
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
