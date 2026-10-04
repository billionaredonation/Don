import {
  previewBusinessStateSale,
  sellBusinessToState,
  businessStateSaleError,
} from './businessStateSaleApi.js';
import './businessStateSale.css';

const money = (value) => `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU', {
  maximumFractionDigits: 2,
})} ₴`;

const toast = (message, type = 'info') =>
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));

export function renderBusinessStateSaleControl(container, {
  businessId,
  isOwner = false,
} = {}) {
  if (!container) return;

  // vehicle/generic business utility gate already has the same control
  if (container.querySelector('[data-business-state-sale]')) return;

  container.querySelector('[data-universal-business-state-sale]')?.remove();

  const id = String(businessId || '').trim();
  if (!isOwner || !id) return;

  const host = container.querySelector('main') || container.querySelector('section') || container;
  const section = document.createElement('section');
  section.className = 'mn-business-state-sale mn-business-state-sale-universal';
  section.dataset.universalBusinessStateSale = '1';
  section.innerHTML = `
    <div>
      <strong>Продажа государству</strong>
      <small>Выкуп по базовой госцене. Комиссия 20%, для участника сообщества — 18%.</small>
    </div>
    <button type="button">Продать государству</button>
  `;

  const button = section.querySelector('button');
  button.onclick = async () => {
    button.disabled = true;
    const initial = button.textContent;
    button.textContent = 'Расчёт…';

    try {
      const preview = await previewBusinessStateSale(id);
      const accepted = window.confirm(
        'Продать предприятие государству?\n\n' +
        `Государственная цена: ${money(preview.basePrice)}\n` +
        `Комиссия: ${Number(preview.commissionRate || 20)}%\n` +
        `Вы получите: ${money(preview.payout)}\n\n` +
        'Склад, касса предприятия, сотрудники и коммунальные договоры будут сброшены.'
      );

      if (!accepted) {
        button.disabled = false;
        button.textContent = initial;
        return;
      }

      button.textContent = 'Продажа…';
      const result = await sellBusinessToState(id);

      toast(
        `Предприятие продано государству. Получено ${money(result.payout)}. Комиссия ${Number(result.commissionRate || 20)}%.`,
        'success'
      );

      window.dispatchEvent(new CustomEvent('mn:business-sold-to-state', {
        detail: { businessId: id, result },
      }));
      window.dispatchEvent(new CustomEvent('mn:map-objects-changed', {
        detail: { businessId: id, source: 'business_state_sale', result },
      }));

      section.innerHTML = `
        <div class="mn-business-state-sale-result">
          <strong>Предприятие продано государству</strong>
          <span>Получено ${money(result.payout)} · комиссия ${Number(result.commissionRate || 20)}%</span>
        </div>
      `;
    } catch (error) {
      toast(businessStateSaleError(error), 'error');
      button.disabled = false;
      button.textContent = initial;
    }
  };

  host.append(section);
}
