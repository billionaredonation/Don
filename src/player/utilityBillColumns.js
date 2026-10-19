import './utilityBillColumns.css';

// Patch existing nodes so background amount updates keep focus and scroll intact.
function patchNode(current, next) {
  if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
    current.replaceWith(next.cloneNode(true));
    return;
  }
  if (current.nodeType === 3) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  if (current.nodeType !== 1) return;
  for (const attr of [...current.attributes]) if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  for (const attr of next.attributes) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  const before = [...current.childNodes], after = [...next.childNodes];
  after.forEach((child, index) => before[index] ? patchNode(before[index], child) : current.append(child.cloneNode(true)));
  before.slice(after.length).forEach(child => child.remove());
}

export function renderUtilityBillColumns(container, staging) {
  if (!container.querySelector('[data-bill-columns]')) {
    container.innerHTML = `<div data-bill-summary></div>
      <p class="mn-profile-utility-note">Оплата вручную. «Не оплачено» — счета от 10 ₴. «Оплачено» — остаток меньше 10 ₴, пока платить не нужно. Новые начисления продолжаются. Проверка каждые 10 секунд.</p>
      <p class="mn-profile-utility-service-error" data-bill-error hidden></p>
      <div class="mn-bill-columns" data-bill-columns>
        <section class="mn-profile-utility-section"><header><strong>Не оплачено</strong><b data-bill-count="unpaid"></b></header><div class="mn-bill-scroll"><div class="mn-profile-utility-list" data-bill-list="unpaid"></div><p data-bill-empty="unpaid">Счетов от 10 ₴ нет.</p></div></section>
        <section class="mn-profile-utility-section"><header><strong>Оплачено</strong><b data-bill-count="paid"></b></header><div class="mn-bill-scroll"><div class="mn-profile-utility-list" data-bill-list="paid"></div><p data-bill-empty="paid">Счетов меньше 10 ₴ нет.</p></div></section>
      </div><div data-bill-offers></div>`;
  }
  const scroll = [...container.querySelectorAll('.mn-bill-scroll')].map(node => [node, node.scrollTop]);
  const summary = container.querySelector('[data-bill-summary]');
  const nextSummary = staging.querySelector('.mn-profile-utility-summary');
  if (nextSummary) {
    if (summary.firstElementChild) patchNode(summary.firstElementChild, nextSummary);
    else summary.append(nextSummary);
  }
  const existing = new Map([...container.querySelectorAll('[data-bill-key]')].map(node => [node.dataset.billKey, node]));
  const seen = new Set(), counts = { paid: 0, unpaid: 0 };
  const buttons = staging.querySelectorAll('[data-profile-utility-pay], [data-profile-water-pay], [data-gas-pay]');
  for (const button of buttons) {
    const card = button.closest('article');
    const type = button.hasAttribute('data-profile-utility-pay') ? 'electricity' : button.hasAttribute('data-profile-water-pay') ? 'water' : 'gas';
    const id = button.getAttribute(type === 'electricity' ? 'data-profile-utility-pay' : type === 'water' ? 'data-profile-water-pay' : 'data-gas-pay');
    const key = `${type}:${id}`, group = button.disabled ? 'paid' : 'unpaid';
    card.dataset.billKey = key;
    if (group === 'paid' && type === 'gas') button.textContent = button.textContent.replace('Оплатить ', 'Остаток: ');
    const label = document.createElement('small');
    label.className = 'mn-bill-service';
    label.textContent = {electricity: '⚡ Электричество', water: '💧 Вода', gas: '🔥 Газ / отопление'}[type];
    card.prepend(label);
    let node = existing.get(key);
    if (node) patchNode(node, card);
    else node = card.cloneNode(true);
    const list = container.querySelector(`[data-bill-list="${group}"]`);
    // Keep server sorting changes from shuffling cards. Move only on a status change.
    if (node.parentElement !== list) list.append(node);
    seen.add(key); counts[group]++;
    card.remove();
  }
  existing.forEach((node, key) => { if (!seen.has(key)) node.remove(); });
  for (const group of ['unpaid', 'paid']) {
    container.querySelector(`[data-bill-count="${group}"]`).textContent = counts[group];
    container.querySelector(`[data-bill-empty="${group}"]`).hidden = counts[group] !== 0;
  }
  const errors = [...staging.querySelectorAll('.mn-profile-utility-service-error')].map(node => node.textContent);
  const offers = document.createElement('div');
  offers.setAttribute('data-bill-offers', '');
  for (const section of staging.querySelectorAll('.mn-profile-utility-section')) {
    if (section.querySelector('button')) offers.append(section);
  }
  patchNode(container.querySelector('[data-bill-offers]'), offers);
  const error = container.querySelector('[data-bill-error]');
  error.textContent = errors.join(' · '); error.hidden = !errors.length;
  scroll.forEach(([node, top]) => { node.scrollTop = top; });
}
