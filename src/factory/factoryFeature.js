import './factory.css';
import './factoryRedesign.css';
import { FACTORY_CONFIG, FACTORY_RAW_ITEMS, FACTORY_RECIPES, FACTORY_ROLES, formatFactoryMoney } from './factoryConfig.js';
import { loadFactorySnapshot, purchaseFactory, transferFruitToFactory, startFactoryBatch, cookFactoryBatch, finishFactoryBatch, depositFactory, withdrawFactory, setFactoryStaff, removeFactoryStaff, setFactoryWholesalePrice, setFactoryProductionWage, loadFactoryProductToVehicle, getFactoryError } from './factoryApi.js';
import { playCargoTransferMiniGame } from '../logistics/cargoTransferMiniGame.js';

const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const objectType = (o) => String(o?.type || o?.payload?.jobType || '');
// A map object can have its own technical id while pointing at an existing
// factory row. Always prefer the explicit binding so the market sale and the
// factory modal read/write the same warehouse.
const objectId = (o) => String(
  o?.payload?.factoryId ||
  o?.payload?.factory_id ||
  o?.factoryId ||
  o?.factory_id ||
  o?.id ||
  ''
).trim();
const notify = (message, type = 'info') => window.dispatchEvent(new CustomEvent('mn:game-toast', { detail: { message, type } }));

function markup() {
  const recipes = Object.values(FACTORY_RECIPES).map((r) => `<article class="mn-factory-recipe"><i>${r.icon}</i><span><strong>${r.label}</strong><small>${r.inputIcon} ${r.inputLabel}: ${r.inputQty} → ${r.outputQty} ед. · готовка 3 сек.</small>${r.anyFruit ? `<select data-factory-ingredient="${r.id}" aria-label="Выберите фрукт или ягоду"><option value="farm_apple">🍎 Яблоки</option><option value="farm_orange">🍊 Апельсины</option></select>` : ''}</span><button data-factory-start="${r.id}">Начать цепочку</button></article>`).join('');
  const raw = FACTORY_RAW_ITEMS.map((i) => `<article><i>${i.icon}</i><span><small>${i.label}</small><strong data-factory-raw="${i.itemType}">0</strong></span><div><input type="number" min="1" value="1" inputmode="numeric" data-factory-deliver-qty="${i.itemType}" aria-label="Количество"><button data-factory-deliver="${i.itemType}">Сдать</button></div></article>`).join('');
  const legal = FACTORY_CONFIG.legalForms.map((v) => `<option>${v}</option>`).join('');
  return `<div class="mn-factory-backdrop" data-factory-modal hidden><section class="mn-factory-panel">
    <header><div><small>ПРОИЗВОДСТВЕННОЕ ПРЕДПРИЯТИЕ</small><h2>Продуктовый завод</h2><p>Ферма → грузчик → повар (3 сек.) → упаковщик → склад → логистика → склад магазина → полка</p></div><button data-factory-close aria-label="Закрыть">×</button></header>
    <nav><button data-factory-tab="production" class="is-active">Производство</button><button data-factory-tab="warehouse">Склады</button><button data-factory-tab="management">Управление</button></nav>
    <main>
      <section data-factory-page="production"><div class="mn-factory-status"><span><small>Статус</small><strong data-factory-state>Загрузка…</strong></span><span><small>Ваша роль</small><strong data-factory-role>Посетитель</strong></span><span><small>Бюджет</small><strong data-factory-cash>—</strong></span></div><div class="mn-factory-workflow">${FACTORY_ROLES.map((role, index) => `<span><i>${role.icon}</i><b>${index + 1}. ${role.label}</b></span>`).join('<em>→</em>')}<em>→</em><span><i>🏬</i><b>Склад</b></span><em>→</em><span><i>🚚</i><b>Логистика</b></span></div><div class="mn-factory-line" data-factory-line><i>⚙️</i><span><strong>Линия свободна</strong><small>Выберите рецепт и запустите смену</small></span><button data-factory-cook hidden>Повар: готовить</button><button data-factory-finish hidden>Упаковать на склад</button></div><h3>Технологические карты</h3><div class="mn-factory-recipes">${recipes}</div></section>
      <section data-factory-page="warehouse" hidden><h3>Сырьевой склад</h3><div class="mn-factory-warehouse">${raw}</div><h3>Готовая продукция</h3><div class="mn-factory-products">${Object.values(FACTORY_RECIPES).map((r) => `<article><i>${r.icon}</i><span><small>${r.label}</small><strong data-factory-product="${r.id}">0</strong></span><div><input type="number" min="1" value="1" data-factory-load-qty="${r.id}" aria-label="Количество"><button data-factory-load="${r.id}">Забрать</button></div></article>`).join('')}</div></section>
      <section data-factory-page="management" hidden><div class="mn-factory-buy" data-factory-buy><span><small>ГОСУДАРСТВЕННЫЙ ЗАВОД</small><strong>${formatFactoryMoney(FACTORY_CONFIG.purchasePrice)}</strong><p>Выберите юридическую форму предприятия перед покупкой.</p></span><select data-factory-legal>${legal}</select><button data-factory-purchase>Купить завод</button></div><div data-factory-owned hidden><div class="mn-factory-owner"><span><small>Владелец</small><strong data-factory-owner>—</strong></span><span><small>Юр. форма</small><strong data-factory-legal-view>—</strong></span></div><div class="mn-factory-manage-grid"><article><h3>Бюджет</h3><input type="number" min="1" placeholder="Сумма" data-factory-money><div><button data-factory-deposit>Пополнить</button><button data-factory-withdraw>Снять</button></div></article><article><h3>Персонал</h3><input placeholder="Ник игрока" data-factory-staff-target><select data-factory-staff-role>${FACTORY_ROLES.map((role) => `<option value="${role.id}">${role.label}</option>`).join('')}</select><div><button data-factory-staff-save>Назначить</button><button data-factory-staff-remove>Снять</button></div></article><article class="is-wide"><h3>Оптовые цены для магазинов</h3><div class="mn-factory-price-list">${Object.values(FACTORY_RECIPES).map((r) => `<label><span>${r.icon} ${r.label}</span><input type="number" min="1" value="${Math.max(1, Math.round(r.wage / r.outputQty * 1.8))}" data-factory-wholesale-price="${r.id}"><button data-factory-wholesale-save="${r.id}">Сохранить</button></label>`).join('')}</div></article><article class="is-wide"><h3>Оплата за изготовление партии</h3><div class="mn-factory-price-list">${Object.values(FACTORY_RECIPES).map((r) => `<label><span>${r.icon} ${r.label}</span><input type="number" min="0" value="${r.wage}" data-factory-production-wage="${r.id}"><button data-factory-wage-save="${r.id}">Сохранить</button></label>`).join('')}</div></article></div></div></section>
    </main></section></div>`;
}

function contractsMarkup(contracts = [], actorId = '') {
  if (!contracts.length) return '<p class="mn-factory-contract-empty">Договоров пока нет. Сырьё без согласованной поставки завод не принимает.</p>';
  return contracts.map((contract) => {
    const remaining = Math.max(0, Number(contract.quantity) - Number(contract.deliveredQuantity || 0));
    const isSupplier = String(contract.supplierTgId || '') === String(actorId || '');
    const status = { pending:'Ожидает решения', active:'Действует', rejected:'Отклонён', completed:'Выполнен', cancelled:'Отменён' }[contract.status] || contract.status;
    return `<article data-status="${esc(contract.status)}"><header><i>${contract.itemType === 'farm_orange' ? '🍊' : '🍎'}</i><span><strong>${contract.itemType === 'farm_orange' ? 'Апельсины' : 'Яблоки'} · ${Number(contract.quantity)} ед.</strong><small>${esc(contract.supplierName || contract.supplierTgId)} · ${esc(contract.supplierType === 'farm' ? 'владелец фермы' : 'игрок')}</small></span><b>${esc(status)}</b></header><div><span>Цена: <b>${formatFactoryMoney(contract.unitPrice)} / ед.</b></span><span>Качество: <b>${contract.qualityGrade === 'premium' ? 'Премиум' : 'Стандарт'}</b></span><span>Свежесть: <b>от ${Number(contract.minFreshness)}%</b></span><span>Осталось: <b>${remaining} ед.</b></span></div>${contract.terms ? `<p>${esc(contract.terms)}</p>` : ''}<footer>${isSupplier && contract.status === 'pending' ? `<button data-factory-contract-respond="${esc(contract.id)}" data-decision="accepted">Принять</button><button class="is-danger" data-factory-contract-respond="${esc(contract.id)}" data-decision="rejected">Отказаться</button>` : ''}${isSupplier && contract.status === 'active' && remaining > 0 ? `<input type="number" min="1" max="${remaining}" value="${Math.min(remaining,100)}" data-factory-contract-deliver-qty="${esc(contract.id)}"><button data-factory-contract-deliver="${esc(contract.id)}">Сдать партию</button>` : ''}</footer></article>`;
  }).join('');
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
    const s = snapshot || {}, business = s.factory || {}, raw = s.raw || {}, products = s.products || {}, prices = s.wholesalePrices || {}, wages = s.productionWages || {}, batch = s.activeBatch || null;
    q('[data-factory-state]').textContent = business.ownerName ? (batch ? 'Линия работает' : 'Готов к работе') : 'Государственный';
    q('[data-factory-role]').textContent = s.roleLabel || 'Посетитель'; q('[data-factory-cash]').textContent = s.canManage ? formatFactoryMoney(business.cash) : 'Скрыто';
    q('[data-factory-buy]').hidden = Boolean(business.ownerId); q('[data-factory-owned]').hidden = !business.ownerId;
    q('[data-factory-owner]').textContent = business.ownerName || 'Государство'; q('[data-factory-legal-view]').textContent = business.legalForm || '—';
    FACTORY_RAW_ITEMS.forEach((i) => { q(`[data-factory-raw="${i.itemType}"]`).textContent = `${Number(raw[i.itemType] || 0)} ед.`; });
    Object.keys(FACTORY_RECIPES).forEach((id) => { q(`[data-factory-product="${id}"]`).textContent = `${Number(products[id] || 0)} ед.`; });
    qa('[data-factory-load]').forEach((b) => { b.disabled = !s.canManage || Number(products[b.dataset.factoryLoad] || 0) < 1; });
    Object.keys(FACTORY_RECIPES).forEach((id) => { const input = q(`[data-factory-wholesale-price="${id}"]`); if (input && prices[id]) input.value = String(prices[id]); });
    Object.keys(FACTORY_RECIPES).forEach((id) => { const input = q(`[data-factory-production-wage="${id}"]`); if (input && wages[id] !== undefined) input.value = String(wages[id]); });
    qa('[data-factory-start]').forEach((b) => b.disabled = !business.ownerId || Boolean(batch));
    qa('[data-factory-deliver]').forEach((b) => b.disabled = !s.isOwner);
    const line = q('[data-factory-line]'), cook = q('[data-factory-cook]'), finish = q('[data-factory-finish]');
    cook.hidden = true; finish.hidden = true;
    if (!batch) { line.querySelector('strong').textContent = 'Линия свободна'; line.querySelector('small').textContent = 'Грузчик может подать сырьё по выбранному рецепту'; }
    else {
      const recipe = FACTORY_RECIPES[batch.recipeId];
      const left = Math.max(0, Math.ceil((new Date(batch.readyAt).getTime() - Date.now()) / 1000));
      if (batch.stage === 'loaded') {
        line.querySelector('strong').textContent = `${recipe?.label || 'Партия'} · сырьё подано`;
        line.querySelector('small').textContent = 'Теперь повар должен разложить ингредиенты и начать готовку';
        cook.hidden = false; cook.disabled = !s.canCook; cook.dataset.batchId = batch.id;
      } else {
        line.querySelector('strong').textContent = `${recipe?.label || 'Партия'} · ${left ? `готовится ${left} сек.` : 'готово к упаковке'}`;
        line.querySelector('small').textContent = left ? 'Повар готовит блюдо' : 'Упаковщик может передать продукт на склад';
        finish.hidden = left > 0; finish.disabled = !s.canPack; finish.dataset.batchId = batch.id;
        clearTimeout(timer); if (left > 0) timer = setTimeout(render, 1000);
      }
    }
    qa('[data-factory-page="management"] input, [data-factory-page="management"] select, [data-factory-page="management"] button').forEach((el) => { if (!el.matches('[data-factory-purchase],[data-factory-legal]')) el.disabled = !s.isOwner; });
  }
  function tab(name) { qa('[data-factory-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.factoryTab === name)); qa('[data-factory-page]').forEach((p) => p.hidden = p.dataset.factoryPage !== name); }
  const action = (selector, fn) => q(selector).addEventListener('click', () => run(fn));
  q('[data-factory-close]').onclick = () => { modal.hidden = true; clearTimeout(timer); };
  qa('[data-factory-tab]').forEach((b) => b.onclick = () => tab(b.dataset.factoryTab));
  action('[data-factory-purchase]', () => purchaseFactory(currentId, cityId, q('[data-factory-legal]').value));
  qa('[data-factory-start]').forEach((b) => b.onclick = () => run(() => startFactoryBatch(currentId, cityId, b.dataset.factoryStart, q(`[data-factory-ingredient="${b.dataset.factoryStart}"]`)?.value || '')));
  action('[data-factory-cook]', () => cookFactoryBatch(currentId, cityId, q('[data-factory-cook]').dataset.batchId));
  action('[data-factory-finish]', () => finishFactoryBatch(currentId, cityId, q('[data-factory-finish]').dataset.batchId));
  action('[data-factory-deposit]', () => depositFactory(currentId, cityId, Number(q('[data-factory-money]').value)));
  action('[data-factory-withdraw]', () => withdrawFactory(currentId, cityId, Number(q('[data-factory-money]').value)));
  qa('[data-factory-deliver]').forEach((b) => { b.onclick = () => run(async () => {
    const result = await transferFruitToFactory(currentId, cityId, b.dataset.factoryDeliver, Number(q(`[data-factory-deliver-qty="${b.dataset.factoryDeliver}"]`).value));
    window.dispatchEvent(new CustomEvent('mn:farm-inventory-changed', { detail: { inventory: result?.inventory } }));
    notify('Сырьё перемещено на склад предприятия.', 'success');
  }); });
  qa('[data-factory-load]').forEach((b) => { b.onclick = () => run(async () => {
    const productType = b.dataset.factoryLoad;
    const quantity = Math.max(1, Math.floor(Number(q(`[data-factory-load-qty="${productType}"]`).value) || 1));
    const available = Number(snapshot?.products?.[productType] || 0);
    if (quantity > available) {
      notify(`На складе только ${available} ед. готового товара.`, 'error');
      return;
    }
    const game = await playCargoTransferMiniGame({ direction: 'factory_to_vehicle', productType, quantity });
    if (!game.success) return;
    await loadFactoryProductToVehicle(currentId, cityId, productType, quantity);
    notify(`Партия ${quantity} ед. загружена в машину.`, 'success');
  }); });
  action('[data-factory-staff-save]', () => setFactoryStaff(currentId, cityId, q('[data-factory-staff-target]').value, q('[data-factory-staff-role]').value));
  action('[data-factory-staff-remove]', () => removeFactoryStaff(currentId, cityId, q('[data-factory-staff-target]').value));
  qa('[data-factory-wholesale-save]').forEach((b) => b.onclick = () => run(() => setFactoryWholesalePrice(currentId, cityId, b.dataset.factoryWholesaleSave, Number(q(`[data-factory-wholesale-price="${b.dataset.factoryWholesaleSave}"]`).value))));
  qa('[data-factory-wage-save]').forEach((b) => b.onclick = () => run(() => setFactoryProductionWage(currentId, cityId, b.dataset.factoryWageSave, Number(q(`[data-factory-production-wage="${b.dataset.factoryWageSave}"]`).value))));
  const onAction = (event) => { const object = event.detail?.object; if (objectType(object) !== 'fruit_factory') return; currentId = objectId(object); modal.hidden = false; tab('production'); run(async () => { snapshot = await loadFactorySnapshot(currentId, cityId); render(); }); };
  window.addEventListener('mn:factory-object-action', onAction);
  return () => { clearTimeout(timer); window.removeEventListener('mn:factory-object-action', onAction); modal.remove(); };
}
