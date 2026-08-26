import './factory.css';
import { FACTORY_CONFIG, FACTORY_RAW_ITEMS, FACTORY_RECIPES, formatFactoryMoney } from './factoryConfig.js';
import { loadFactorySnapshot, purchaseFactory, transferFruitToFactory, startFactoryBatch, finishFactoryBatch, depositFactory, withdrawFactory, setFactoryStaff, removeFactoryStaff, setFactoryWholesalePrice, getFactoryError } from './factoryApi.js';

const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const objectType = (o) => String(o?.type || o?.payload?.jobType || '');
const objectId = (o) => String(o?.id || o?.payload?.factoryId || o?.payload?.factory_id || '');
const notify = (message, type = 'info') => window.dispatchEvent(new CustomEvent('mn:game-toast', { detail: { message, type } }));

function markup() {
  const recipes = Object.values(FACTORY_RECIPES).map((r) => `<article class="mn-factory-recipe"><i>${r.icon}</i><span><strong>${r.label}</strong><small>${r.inputIcon} ${r.inputQty} → ${r.outputQty} ед. · ${r.seconds} сек.</small></span><button data-factory-start="${r.id}">Запустить</button></article>`).join('');
  const raw = FACTORY_RAW_ITEMS.map((i) => `<article><i>${i.icon}</i><span><small>${i.label}</small><strong data-factory-raw="${i.itemType}">0</strong></span><div><input type="number" min="1" value="1" data-factory-deliver-qty="${i.itemType}"><button data-factory-deliver="${i.itemType}">Сдать</button></div></article>`).join('');
  const legal = FACTORY_CONFIG.legalForms.map((v) => `<option>${v}</option>`).join('');
  return `<div class="mn-factory-backdrop" data-factory-modal hidden><section class="mn-factory-panel">
    <header><div><small>ПРОИЗВОДСТВЕННОЕ ПРЕДПРИЯТИЕ</small><h2>Фруктовый завод</h2><p>Приём сырья → переработка → склад готовой продукции</p></div><button data-factory-close aria-label="Закрыть">×</button></header>
    <nav><button data-factory-tab="production" class="is-active">Производство</button><button data-factory-tab="warehouse">Склады</button><button data-factory-tab="management">Управление</button></nav>
    <main>
      <section data-factory-page="production"><div class="mn-factory-status"><span><small>Статус</small><strong data-factory-state>Загрузка…</strong></span><span><small>Ваша роль</small><strong data-factory-role>Посетитель</strong></span><span><small>Бюджет</small><strong data-factory-cash>—</strong></span></div><div class="mn-factory-line" data-factory-line><i>⚙️</i><span><strong>Линия свободна</strong><small>Выберите рецепт и запустите смену</small></span><button data-factory-finish hidden>Забрать партию</button></div><h3>Технологические карты</h3><div class="mn-factory-recipes">${recipes}</div></section>
      <section data-factory-page="warehouse" hidden><h3>Сырьевой склад</h3><div class="mn-factory-warehouse">${raw}</div><h3>Готовая продукция</h3><div class="mn-factory-products"><article><i>🧃</i><span><small>Яблочный сок</small><strong data-factory-product="apple_juice">0</strong></span></article><article><i>🥤</i><span><small>Апельсиновый сок</small><strong data-factory-product="orange_juice">0</strong></span></article><article><i>🥫</i><span><small>Фруктовое пюре</small><strong data-factory-product="fruit_puree">0</strong></span></article></div></section>
      <section data-factory-page="management" hidden><div class="mn-factory-buy" data-factory-buy><span><small>ГОСУДАРСТВЕННЫЙ ЗАВОД</small><strong>${formatFactoryMoney(FACTORY_CONFIG.purchasePrice)}</strong><p>Выберите юридическую форму предприятия перед покупкой.</p></span><select data-factory-legal>${legal}</select><button data-factory-purchase>Купить завод</button></div><div data-factory-owned hidden><div class="mn-factory-owner"><span><small>Владелец</small><strong data-factory-owner>—</strong></span><span><small>Юр. форма</small><strong data-factory-legal-view>—</strong></span></div><div class="mn-factory-manage-grid"><article><h3>Бюджет</h3><input type="number" min="1" placeholder="Сумма" data-factory-money><div><button data-factory-deposit>Пополнить</button><button data-factory-withdraw>Снять</button></div></article><article><h3>Персонал</h3><input placeholder="Ник игрока" data-factory-staff-target><select data-factory-staff-role><option value="technologist">Технолог</option><option value="storekeeper">Кладовщик</option></select><div><button data-factory-staff-save>Назначить</button><button data-factory-staff-remove>Снять</button></div></article><article class="is-wide"><h3>Оптовые цены для магазинов</h3><div class="mn-factory-price-list">${Object.values(FACTORY_RECIPES).map((r) => `<label><span>${r.icon} ${r.label}</span><input type="number" min="1" value="${Math.max(1, Math.round(r.wage / r.outputQty * 1.8))}" data-factory-wholesale-price="${r.id}"><button data-factory-wholesale-save="${r.id}">Сохранить</button></label>`).join('')}</div></article></div></div></section>
    </main></section></div>`;
}

export function enableFactoryFeature({ root, cityId }) {
  root.insertAdjacentHTML('beforeend', markup());
  const modal = root.querySelector('[data-factory-modal]');
  let currentId = '', snapshot = null, timer = 0, busy = false;
  const q = (s) => modal.querySelector(s);
  const qa = (s) => [...modal.querySelectorAll(s)];
  const run = async (task) => { if (busy) return; busy = true; modal.classList.add('is-busy'); try { await task(); await refresh(); } catch (e) { notify(getFactoryError(e), 'error'); } finally { busy = false; modal.classList.remove('is-busy'); } };
  const refresh = async () => { snapshot = await loadFactorySnapshot(currentId, cityId); render(); };
  function render() {
    const s = snapshot || {}, business = s.factory || {}, raw = s.raw || {}, products = s.products || {}, prices = s.wholesalePrices || {}, batch = s.activeBatch || null;
    q('[data-factory-state]').textContent = business.ownerName ? (batch ? 'Линия работает' : 'Готов к работе') : 'Государственный';
    q('[data-factory-role]').textContent = s.roleLabel || 'Посетитель'; q('[data-factory-cash]').textContent = s.canManage ? formatFactoryMoney(business.cash) : 'Скрыто';
    q('[data-factory-buy]').hidden = Boolean(business.ownerId); q('[data-factory-owned]').hidden = !business.ownerId;
    q('[data-factory-owner]').textContent = business.ownerName || 'Государство'; q('[data-factory-legal-view]').textContent = business.legalForm || '—';
    FACTORY_RAW_ITEMS.forEach((i) => { q(`[data-factory-raw="${i.itemType}"]`).textContent = `${Number(raw[i.itemType] || 0)} ед.`; });
    Object.keys(FACTORY_RECIPES).forEach((id) => { q(`[data-factory-product="${id}"]`).textContent = `${Number(products[id] || 0)} ед.`; });
    Object.keys(FACTORY_RECIPES).forEach((id) => { const input = q(`[data-factory-wholesale-price="${id}"]`); if (input && prices[id]) input.value = String(prices[id]); });
    qa('[data-factory-start]').forEach((b) => b.disabled = !s.canProduce || Boolean(batch));
    qa('[data-factory-deliver]').forEach((b) => b.disabled = !business.ownerId);
    const line = q('[data-factory-line]'), finish = q('[data-factory-finish]');
    if (!batch) { line.querySelector('strong').textContent = 'Линия свободна'; line.querySelector('small').textContent = 'Выберите рецепт и запустите смену'; finish.hidden = true; }
    else { const recipe = FACTORY_RECIPES[batch.recipeId]; const left = Math.max(0, Math.ceil((new Date(batch.readyAt).getTime() - Date.now()) / 1000)); line.querySelector('strong').textContent = `${recipe?.label || 'Партия'} · ${left ? `${left} сек.` : 'готово'}`; line.querySelector('small').textContent = `Работник: ${batch.workerName || '—'} · зарплата ${formatFactoryMoney(batch.wage)}`; finish.hidden = left > 0 || !s.canFinish; finish.dataset.batchId = batch.id; clearTimeout(timer); if (left > 0) timer = setTimeout(render, 1000); }
    qa('[data-factory-page="management"] input, [data-factory-page="management"] select, [data-factory-page="management"] button').forEach((el) => { if (!el.matches('[data-factory-purchase],[data-factory-legal]')) el.disabled = !s.isOwner; });
  }
  function tab(name) { qa('[data-factory-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.factoryTab === name)); qa('[data-factory-page]').forEach((p) => p.hidden = p.dataset.factoryPage !== name); }
  const action = (selector, fn) => q(selector).addEventListener('click', () => run(fn));
  q('[data-factory-close]').onclick = () => { modal.hidden = true; clearTimeout(timer); };
  qa('[data-factory-tab]').forEach((b) => b.onclick = () => tab(b.dataset.factoryTab));
  action('[data-factory-purchase]', () => purchaseFactory(currentId, cityId, q('[data-factory-legal]').value));
  qa('[data-factory-deliver]').forEach((b) => b.onclick = () => run(() => transferFruitToFactory(currentId, cityId, b.dataset.factoryDeliver, Number(q(`[data-factory-deliver-qty="${b.dataset.factoryDeliver}"]`).value))));
  qa('[data-factory-start]').forEach((b) => b.onclick = () => run(() => startFactoryBatch(currentId, cityId, b.dataset.factoryStart)));
  action('[data-factory-finish]', () => finishFactoryBatch(currentId, cityId, q('[data-factory-finish]').dataset.batchId));
  action('[data-factory-deposit]', () => depositFactory(currentId, cityId, Number(q('[data-factory-money]').value)));
  action('[data-factory-withdraw]', () => withdrawFactory(currentId, cityId, Number(q('[data-factory-money]').value)));
  action('[data-factory-staff-save]', () => setFactoryStaff(currentId, cityId, q('[data-factory-staff-target]').value, q('[data-factory-staff-role]').value));
  action('[data-factory-staff-remove]', () => removeFactoryStaff(currentId, cityId, q('[data-factory-staff-target]').value));
  qa('[data-factory-wholesale-save]').forEach((b) => b.onclick = () => run(() => setFactoryWholesalePrice(currentId, cityId, b.dataset.factoryWholesaleSave, Number(q(`[data-factory-wholesale-price="${b.dataset.factoryWholesaleSave}"]`).value))));
  const onAction = (event) => { const object = event.detail?.object; if (objectType(object) !== 'fruit_factory') return; currentId = objectId(object); modal.hidden = false; tab('production'); run(async () => { snapshot = await loadFactorySnapshot(currentId, cityId); render(); }); };
  window.addEventListener('mn:factory-object-action', onAction);
  return () => { clearTimeout(timer); window.removeEventListener('mn:factory-object-action', onAction); modal.remove(); };
}
