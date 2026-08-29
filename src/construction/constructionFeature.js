import '../factory/factory.css';
import './construction.css';
import { CONSTRUCTION_FACTORY_CONFIG, CONSTRUCTION_RAW_ITEMS, CONSTRUCTION_RECIPES, formatConstructionMoney } from './constructionConfig.js';
import { loadConstructionSnapshot, purchaseConstructionFactory, startConstructionBatch, finishConstructionBatch, depositConstructionFactory, withdrawConstructionFactory, setConstructionWholesalePrice, transferLumberToConstructionFactory, getConstructionError } from './constructionApi.js';

const objectType = (o) => String(o?.type || o?.payload?.jobType || '');
const objectId = (o) => String(o?.id || o?.payload?.factoryId || o?.payload?.factory_id || '');
const notify = (message, type = 'info') => window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));

function markup() {
  const recipes = Object.values(CONSTRUCTION_RECIPES).map((r) => `<article class="mn-factory-recipe"><i>${r.icon}</i><span><strong>${r.label}</strong><small>${r.inputIcon} ${r.inputQty} → ${r.outputQty} ед. · ${r.seconds} сек.</small></span><button data-construction-start="${r.id}">Запустить</button></article>`).join('');
  const raw = CONSTRUCTION_RAW_ITEMS.map((i) => `<article><i>${i.icon}</i><span><small>${i.label}</small><strong data-construction-raw="${i.itemType}">0</strong></span><div><input type="number" min="1" value="1" inputmode="numeric" data-construction-deliver-qty="${i.itemType}" aria-label="Количество"><button data-construction-deliver="${i.itemType}">Сдать</button></div></article>`).join('');
  return `<div class="mn-factory-backdrop mn-construction-backdrop" data-construction-modal hidden><section class="mn-factory-panel"><header><div><small>ПРОИЗВОДСТВЕННОЕ ПРЕДПРИЯТИЕ</small><h2>Завод стройматериалов</h2><p>Древесина лесорубов → обработка → инструментальный магазин</p></div><button data-construction-close>×</button></header><nav><button data-construction-tab="production" class="is-active">Производство</button><button data-construction-tab="warehouse">Склады</button><button data-construction-tab="management">Управление</button></nav><main>
    <section data-construction-page="production"><div class="mn-factory-status"><span><small>Статус</small><strong data-construction-state>Загрузка…</strong></span><span><small>Ваша роль</small><strong data-construction-role>Посетитель</strong></span><span><small>Бюджет</small><strong data-construction-cash>—</strong></span></div><div class="mn-factory-line" data-construction-line><i>🏗️</i><span><strong>Линия свободна</strong><small>Выберите технологическую карту</small></span><button data-construction-finish hidden>Забрать партию</button></div><h3>Технологические карты</h3><div class="mn-factory-recipes">${recipes}</div></section>
    <section data-construction-page="warehouse" hidden><h3>Сырьевой склад</h3><div class="mn-factory-warehouse">${raw}</div><h3>Готовые стройматериалы</h3><div class="mn-factory-products">${Object.values(CONSTRUCTION_RECIPES).map((r) => `<article><i>${r.icon}</i><span><small>${r.label}</small><strong data-construction-product="${r.id}">0</strong></span></article>`).join('')}</div></section>
    <section data-construction-page="management" hidden><div class="mn-factory-buy" data-construction-buy><span><small>ГОСУДАРСТВЕННОЕ ПРЕДПРИЯТИЕ</small><strong>${formatConstructionMoney(CONSTRUCTION_FACTORY_CONFIG.purchasePrice)}</strong><p>После покупки предприятие принимает древесину и поставляет стройматериалы.</p></span><select data-construction-legal>${CONSTRUCTION_FACTORY_CONFIG.legalForms.map((v) => `<option>${v}</option>`).join('')}</select><button data-construction-purchase>Купить</button></div><div data-construction-owned hidden><div class="mn-factory-owner"><span><small>Владелец</small><strong data-construction-owner>—</strong></span><span><small>Юр. форма</small><strong data-construction-legal-view>—</strong></span></div><div class="mn-factory-manage-grid"><article><h3>Бюджет</h3><input type="number" min="1" placeholder="Сумма" data-construction-money><div><button data-construction-deposit>Пополнить</button><button data-construction-withdraw>Снять</button></div></article><article class="is-wide"><h3>Оптовые цены для инструментальных магазинов</h3><div class="mn-factory-price-list">${Object.values(CONSTRUCTION_RECIPES).map((r) => `<label><span>${r.icon} ${r.label}</span><input type="number" min="1" value="${r.suggestedPrice}" data-construction-price="${r.id}"><button data-construction-price-save="${r.id}">Сохранить</button></label>`).join('')}</div></article></div></div></section>
  </main></section></div>`;
}

export function enableConstructionFeature({ root, cityId }) {
  root.insertAdjacentHTML('beforeend', markup());
  const modal = root.querySelector('[data-construction-modal]');
  const q = (s) => modal.querySelector(s), qa = (s) => [...modal.querySelectorAll(s)];
  let currentId = '', snapshot = null, busy = false, timer = 0;
  const refresh = async () => { snapshot = await loadConstructionSnapshot(currentId, cityId); render(); };
  const run = async (task) => { if (busy) return; busy = true; modal.classList.add('is-busy'); try { await task(); await refresh(); } catch (e) { notify(getConstructionError(e), 'error'); } finally { busy = false; modal.classList.remove('is-busy'); } };
  function render() {
    const s = snapshot || {}, factory = s.factory || {}, raw = s.raw || {}, products = s.products || {}, prices = s.wholesalePrices || {}, batch = s.activeBatch || null;
    q('[data-construction-state]').textContent = factory.ownerName ? (batch ? 'Линия работает' : 'Готов к работе') : 'Государственный';
    q('[data-construction-role]').textContent = s.roleLabel || 'Посетитель'; q('[data-construction-cash]').textContent = s.canManage ? formatConstructionMoney(factory.cash) : 'Скрыто';
    q('[data-construction-buy]').hidden = Boolean(factory.ownerId); q('[data-construction-owned]').hidden = !factory.ownerId;
    q('[data-construction-owner]').textContent = factory.ownerName || 'Государство'; q('[data-construction-legal-view]').textContent = factory.legalForm || '—';
    CONSTRUCTION_RAW_ITEMS.forEach((i) => { q(`[data-construction-raw="${i.itemType}"]`).textContent = `${Number(raw[i.itemType] || 0)} ед.`; });
    Object.keys(CONSTRUCTION_RECIPES).forEach((id) => { q(`[data-construction-product="${id}"]`).textContent = `${Number(products[id] || 0)} ед.`; const input = q(`[data-construction-price="${id}"]`); if (input && prices[id]) input.value = String(prices[id]); });
    qa('[data-construction-start]').forEach((b) => { b.disabled = !factory.ownerId || Boolean(batch); });
    qa('[data-construction-deliver]').forEach((b) => { b.disabled = !s.isOwner; });
    const line = q('[data-construction-line]'), finish = q('[data-construction-finish]'); clearTimeout(timer);
    if (!batch) { line.querySelector('strong').textContent = 'Линия свободна'; line.querySelector('small').textContent = 'Выберите технологическую карту'; finish.hidden = true; }
    else { const recipe = CONSTRUCTION_RECIPES[batch.recipeId]; const left = Math.max(0, Math.ceil((new Date(batch.readyAt).getTime() - Date.now()) / 1000)); line.querySelector('strong').textContent = `${recipe?.label || 'Партия'} · ${left ? `${left} сек.` : 'готово'}`; line.querySelector('small').textContent = `Работник: ${batch.workerName || '—'} · зарплата ${formatConstructionMoney(batch.wage)}`; finish.hidden = left > 0; finish.dataset.batchId = batch.id; if (left > 0) timer = setTimeout(render, 1000); }
    qa('[data-construction-page="management"] input, [data-construction-page="management"] select, [data-construction-page="management"] button').forEach((el) => { if (!el.matches('[data-construction-purchase],[data-construction-legal]')) el.disabled = !s.isOwner; });
  }
  function tab(name) { qa('[data-construction-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.constructionTab === name)); qa('[data-construction-page]').forEach((p) => { p.hidden = p.dataset.constructionPage !== name; }); }
  q('[data-construction-close]').onclick = () => { modal.hidden = true; clearTimeout(timer); };
  qa('[data-construction-tab]').forEach((b) => { b.onclick = () => tab(b.dataset.constructionTab); });
  q('[data-construction-purchase]').onclick = () => run(() => purchaseConstructionFactory(currentId, cityId, q('[data-construction-legal]').value));
  qa('[data-construction-start]').forEach((b) => { b.onclick = () => run(async () => {
    notify('Запускаем производственную линию…');
    await startConstructionBatch(currentId, cityId, b.dataset.constructionStart);
    notify('Линия запущена.', 'success');
  }); });
  q('[data-construction-finish]').onclick = () => run(() => finishConstructionBatch(currentId, cityId, q('[data-construction-finish]').dataset.batchId));
  q('[data-construction-deposit]').onclick = () => run(() => depositConstructionFactory(currentId, cityId, Number(q('[data-construction-money]').value)));
  q('[data-construction-withdraw]').onclick = () => run(() => withdrawConstructionFactory(currentId, cityId, Number(q('[data-construction-money]').value)));
  qa('[data-construction-price-save]').forEach((b) => { b.onclick = () => run(() => setConstructionWholesalePrice(currentId, cityId, b.dataset.constructionPriceSave, Number(q(`[data-construction-price="${b.dataset.constructionPriceSave}"]`).value))); });
  qa('[data-construction-deliver]').forEach((b) => { b.onclick = () => run(async () => {
    const result = await transferLumberToConstructionFactory(currentId, cityId, b.dataset.constructionDeliver, Number(q(`[data-construction-deliver-qty="${b.dataset.constructionDeliver}"]`).value));
    window.dispatchEvent(new CustomEvent('mn:lumber-inventory-changed', { detail: { inventory: result?.inventory } }));
    notify('Сырьё перемещено на склад предприятия.', 'success');
  }); });
  
  const onAction = (event) => { const object = event.detail?.object; if (objectType(object) !== 'construction_factory') return; currentId = objectId(object); modal.hidden = false; tab('production'); void run(refresh); };
  window.addEventListener('mn:construction-object-action', onAction);
  return () => { clearTimeout(timer); window.removeEventListener('mn:construction-object-action', onAction); modal.remove(); };
}
