import './procurementControls.css';

const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const money = value => `${Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('ru-RU')} ₴`;

export function procurementControlsMarkup(prefix, items = [], { factory = true } = {}) {
  const id = esc(prefix);
  const rows = factory ? items.map(item => `
    <label class="mn-procurement-item">
      <input type="checkbox" data-${id}-procurement-item="${esc(item.itemType)}">
      <i>${item.icon || '📦'}</i>
      <span><b>${esc(item.label || item.itemType)}</b><small>Используется в рецептах завода</small></span>
    </label>`).join('') : '';
  return `<section class="mn-procurement-card" data-${id}-procurement-controls>
    <header><i>🧾</i><span><h3>Бюджет скупа</h3><small>${factory ? 'Выберите нужное сырьё и оставьте деньги на закупку.' : 'Определяет, сколько предприятие может выплатить игрокам за сырьё.'}</small></span></header>
    <div class="mn-procurement-budget">
      <span><small>Доступно на скуп</small><strong data-${id}-procurement-current>0 ₴</strong></span>
      <input type="number" min="0" step="1" value="0" inputmode="numeric" data-${id}-procurement-budget>
      <button type="button" data-${id}-procurement-budget-save>Сохранить бюджет</button>
    </div>
    ${factory ? `<div class="mn-procurement-items"><h4>Что завод принимает</h4>${rows}</div>` : '<p class="mn-procurement-hint">При бюджете 0 ₴ местный скупщик не принимает сырьё. Игрок сможет оставить товар и продать его заводу через рынок.</p>'}
  </section>`;
}

export function renderProcurementControls(root, prefix, snapshot, items = [], { canManage = false, busy = false } = {}) {
  const current = Math.max(0, Math.floor(Number(snapshot?.availableBudget) || 0));
  const currentElement = root.querySelector(`[data-${prefix}-procurement-current]`);
  if (currentElement) currentElement.textContent = money(current);
  const budgetInput = root.querySelector(`[data-${prefix}-procurement-budget]`);
  if (budgetInput && document.activeElement !== budgetInput) budgetInput.value = String(current);
  const enabled = new Map((snapshot?.items || []).map(item => [String(item.itemType || item.item_type), Boolean(item.enabled)]));
  items.forEach(item => {
    const input = root.querySelector(`[data-${prefix}-procurement-item="${item.itemType}"]`);
    if (input && document.activeElement !== input) input.checked = enabled.get(item.itemType) === true;
  });
  root.querySelectorAll(`[data-${prefix}-procurement-controls] input,[data-${prefix}-procurement-controls] button`).forEach(element => {
    element.disabled = busy || !canManage;
  });
}
