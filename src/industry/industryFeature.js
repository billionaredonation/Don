import './industry.css';
import './industryRedesign.css';
import { INDUSTRY_ROLES, getIndustry } from './industryConfig.js';
import {
  loadIndustrySnapshot,
  purchaseIndustry,
  depositIndustry,
  withdrawIndustry,
  createIndustryOrder,
  startIndustryWork,
  completeIndustryWork,
  cancelIndustryWork,
  transferIndustryRaw,
  sellIndustryRaw,
  setIndustryBuyPrice,
  withdrawIndustryProduct,
  setIndustryRole,
  industryError,
} from './industryApi.js';
import { playIndustryMiniGame } from './industryMiniGames.js';

const esc = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const toast = (message, type = 'info') => window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));

const ITEM_LABELS = {
  farm_apple: 'Яблоки', farm_orange: 'Апельсины', farm_wheat: 'Пшеница', farm_corn: 'Кукуруза',
  lumber_log: 'Брёвна', lumber_beam: 'Брус лесоруба', mine_stone: 'Камень', mine_coal: 'Уголь',
  mine_metal: 'Металлическая руда', mine_copper: 'Медная руда', industrial_plastic: 'Промышленный пластик',
  grocery_apple_juice: 'Яблочный сок', grocery_orange_juice: 'Апельсиновый сок', grocery_fruit_puree: 'Фруктовое пюре',
  food_wheat_flour: 'Пшеничная мука', food_corn_flour: 'Кукурузная мука', wood_dry_board: 'Сухая доска',
  wood_furniture_panel: 'Мебельный щит', construction_board: 'Обрезная доска', construction_timber: 'Строительный брус',
  construction_plywood: 'Фанерный лист', construction_cement: 'Цемент', construction_concrete: 'Бетонная смесь',
  metal_steel: 'Стальной прокат', metal_copper: 'Медная катанка', electric_copper_wire: 'Медный провод',
  electric_power_cable: 'Силовой кабель', mine_tool_pickaxe: 'Кирка', lumber_tool_axe: 'Топор', lumber_tool_chainsaw: 'Бензопила',
};
const itemLabel = id => ITEM_LABELS[id] || String(id).replaceAll('_', ' ');
const money = n => `${Number(n || 0).toLocaleString('ru-RU')} ₴`;

const STAGES = {
  waiting_loader: { role: 'loader', label: 'Ожидает доставки сырья', icon: '📦' },
  waiting_operator: { role: 'operator', label: 'Ожидает оператора', icon: '⚙️' },
  rework_operator: { role: 'operator', label: 'Возврат на пересборку', icon: '♻️' },
  waiting_quality: { role: 'quality', label: 'Ожидает проверки качества', icon: '✅' },
};

function modalMarkup() {
  return `<div class="mn-industry-modal" data-industry-modal hidden>
    <button data-industry-close></button>
    <section>
      <header data-industry-header></header>
      <nav>
        <button class="is-active" data-industry-tab="work">Работа</button>
        <button data-industry-tab="production">Производство</button>
        <button data-industry-tab="warehouse">Склады</button>
        <button data-industry-tab="management">Управление</button>
      </nav>
      <main data-industry-content></main>
    </section>
  </div>`;
}

function recipeById(config, id) {
  return config.recipes.find(r => r.id === id) || null;
}

function batchCard(batch, config) {
  const recipe = recipeById(config, batch.recipeId);
  const stage = STAGES[batch.stage] || { label: batch.stage || 'В работе', icon: '⚙️' };
  return `<article class="mn-industry-pipeline-batch">
    <i>${recipe?.icon || '🏭'}</i>
    <span>
      <small>ПАРТИЯ #${esc(String(batch.id || '').slice(0, 8))}</small>
      <strong>${esc(recipe?.label || batch.recipeId)}</strong>
      <em>${stage.icon} ${esc(stage.label)}${Number(batch.reworkCount || 0) ? ` · пересборок: ${Number(batch.reworkCount)}` : ''}</em>
    </span>
  </article>`;
}

function workPage(snapshot, config) {
  const batches = snapshot.batches || [];
  const available = roleId => batches.filter(b => STAGES[b.stage]?.role === roleId);
  const descriptions = {
    loader: 'Заберите сырьё со склада и доставьте его к производственной линии.',
    operator: 'Изготовьте продукцию. Для разных технологических карт используются разные процессы.',
    quality: 'Найдите дефекты. После успешной мини-игры сервер проводит проверку: 90% приёмка, 10% возврат на пересборку.',
  };

  return `<div class="mn-industry-work-intro">
      <strong>Производственная цепочка</strong>
      <span>Грузчик → Оператор станка → Контроль качества → Склад готовой продукции → Логистика</span>
    </div>
    <div class="mn-industry-role-grid">
      ${Object.keys(INDUSTRY_ROLES).map(roleId => {
        const role = INDUSTRY_ROLES[roleId];
        const jobs = available(roleId);
        return `<article>
          <i>${role.icon}</i>
          <span><strong>${role.label}</strong><small>${descriptions[roleId]}</small></span>
          <div class="mn-industry-work-jobs">
            ${jobs.length ? jobs.map(batch => {
              const recipe = recipeById(config, batch.recipeId);
              return `<button data-industry-work="${roleId}" data-batch-id="${esc(batch.id)}">
                ${batch.stage === 'rework_operator' ? 'Пересобрать' : 'Выполнить'} · ${esc(recipe?.label || batch.recipeId)}
              </button>`;
            }).join('') : '<button disabled>Сейчас работы нет</button>'}
          </div>
        </article>`;
      }).join('')}
    </div>
    <h3 class="mn-industry-pipeline-title">Партии в производстве</h3>
    <div class="mn-industry-pipeline-list">${batches.length ? batches.map(b => batchCard(b, config)).join('') : '<div class="mn-industry-empty">Активных партий нет. Создайте заказ во вкладке «Производство».</div>'}</div>`;
}

function productionPage(snapshot, config) {
  const batches = snapshot.batches || [];
  const canCreate = snapshot.isOwner || snapshot.role === 'operator';
  return `<div class="mn-industry-summary">
      <article><small>Активных партий</small><strong>${batches.length}</strong></article>
      <article><small>Ваша роль</small><strong>${esc(snapshot.roleLabel || 'Посетитель')}</strong></article>
      <article><small>Бюджет</small><strong>${snapshot.isOwner ? money(snapshot.business?.cash) : 'Скрыто'}</strong></article>
    </div>
    <div class="mn-industry-banner"><i>⚙️</i><span><small>ПРОИЗВОДСТВЕННАЯ ЛИНИЯ</small><strong>${batches.length ? 'Есть партии в работе' : 'Линия свободна'}</strong><em>Заказ создаёт партию. Сырьё спишется только после работы грузчика.</em></span></div>
    <h3>Технологические карты</h3>
    <div class="mn-industry-recipes">
      ${config.recipes.map(r => `<article>
        <header><i>${r.icon}</i><span><strong>${r.label}</strong><small>${Object.entries(r.inputs).map(([id, q]) => `${q} × ${itemLabel(id)}`).join(' + ')} → ${Object.entries(r.output).map(([id, q]) => `${q} × ${itemLabel(id)}`).join('')}</small></span></header>
        <footer><span>Оператор: ${money(r.wage)} · грузчик/контроль оплачиваются отдельно</span><button data-industry-order="${r.id}"${canCreate ? '' : ' disabled'}>Создать партию</button></footer>
      </article>`).join('')}
    </div>
    ${!canCreate ? '<div class="mn-industry-empty">Создание производственных партий доступно владельцу или назначенному оператору.</div>' : ''}`;
}

function warehousePage(snapshot, config) {
  const raw = snapshot.raw || {};
  const products = snapshot.products || {};
  const prices = snapshot.buyPrices || {};
  const rawIds = [...new Set(config.recipes.flatMap(r => Object.keys(r.inputs)))];
  const productIds = [...new Set(config.recipes.flatMap(r => Object.keys(r.output)))];

  return `<div class="mn-industry-section-head"><span><small>ПРИЁМКА И ХРАНЕНИЕ</small><h3>Сырьевой склад</h3></span><b>${rawIds.reduce((n, id) => n + Number(raw[id] || 0), 0)} ед.</b></div>
    <div class="mn-industry-stock">${rawIds.map(id => `<article><i>📦</i><span><small>${itemLabel(id)}</small><strong>${Number(raw[id] || 0)} ед. · закупка ${money(prices[id])}</strong></span>
      ${Number(prices[id] || 0) > 0 ? `<div><input type="number" min="1" value="1" data-industry-raw-qty="${esc(id)}"><button data-industry-sell="${esc(id)}">Продать</button></div>` : ''}
    </article>`).join('')}</div>
    <div class="mn-industry-section-head"><span><small>ПОСЛЕ КОНТРОЛЯ КАЧЕСТВА</small><h3>Готовая продукция</h3></span><b>${productIds.reduce((n, id) => n + Number(products[id] || 0), 0)} ед.</b></div>
    <div class="mn-industry-stock">${productIds.map(id => `<article><i>🏷️</i><span><small>${itemLabel(id)}</small><strong>${Number(products[id] || 0)} ед.</strong></span>${snapshot.isOwner ? `<div><input type="number" min="1" value="1" data-industry-product-qty="${esc(id)}"><button data-industry-product="${esc(id)}">Забрать</button></div>` : ''}</article>`).join('')}</div>`;
}

function managementPage(snapshot, config) {
  if (!snapshot.business?.ownerId) return `<div class="mn-industry-buy"><h3>Предприятие продаётся государством</h3><strong>${money(snapshot.business?.price || 1500000)}</strong><select data-industry-legal><option value="tov">ТОВ</option><option value="at">АТ</option><option value="private">Частное предприятие</option></select><button data-industry-purchase>Купить</button></div>`;
  if (!snapshot.isOwner) return '<div class="mn-industry-empty">Управление доступно владельцу.</div>';
  const rawIds = [...new Set(config.recipes.flatMap(r => Object.keys(r.inputs)))];
  return `<div class="mn-industry-manage">
    <article><h3>Бюджет · ${money(snapshot.business.cash)}</h3><input type="number" min="1" data-industry-money placeholder="Сумма"><div><button data-industry-deposit>Пополнить</button><button data-industry-withdraw>Снять</button></div></article>
    <article><h3>Закупочные цены</h3>${rawIds.map(id => `<div><span>${itemLabel(id)}</span><input type="number" min="0" value="${Number((snapshot.buyPrices || {})[id] || 0)}" data-industry-price-value="${esc(id)}"><button data-industry-price="${esc(id)}">Сохранить</button></div>`).join('')}</article>
    <article><h3>Персонал</h3><small>Назначение не требуется для обычной работы, но роль даёт право создавать партии оператору.</small><input data-industry-target placeholder="Ник игрока"><select data-industry-role>${Object.keys(INDUSTRY_ROLES).map(id => `<option value="${id}">${INDUSTRY_ROLES[id].label}</option>`).join('')}</select><button data-industry-staff>Назначить</button></article>
  </div>`;
}

export function enableIndustryFeature({ root, cityId }) {
  root.insertAdjacentHTML('beforeend', modalMarkup());
  const modal = root.querySelector('[data-industry-modal]');
  const content = modal.querySelector('[data-industry-content]');
  const header = modal.querySelector('[data-industry-header]');
  let objectId = '', config = null, snapshot = null, tab = 'work', busy = false;

  const close = () => { modal.hidden = true; };
  const render = () => {
    if (!config || !snapshot) return;
    header.innerHTML = `<i>${config.icon}</i><span><small>ПРОМЫШЛЕННОЕ ПРЕДПРИЯТИЕ</small><strong>${config.label}</strong><em>${snapshot.roleLabel || 'Посетитель'} · ${snapshot.business?.ownerName || 'Государство'}</em></span><button data-industry-x>×</button>`;
    content.innerHTML = tab === 'work' ? workPage(snapshot, config) : tab === 'production' ? productionPage(snapshot, config) : tab === 'warehouse' ? warehousePage(snapshot, config) : managementPage(snapshot, config);
    header.querySelector('[data-industry-x]').onclick = close;
  };
  const refresh = async () => { snapshot = await loadIndustrySnapshot(objectId, cityId, config.id); render(); };
  const run = async task => {
    if (busy) return;
    busy = true;
    modal.classList.add('is-busy');
    try { await task(); await refresh(); }
    catch (e) { toast(industryError(e), 'error'); }
    finally { busy = false; modal.classList.remove('is-busy'); }
  };

  modal.querySelector('[data-industry-close]').onclick = close;
  modal.querySelectorAll('[data-industry-tab]').forEach(button => button.onclick = () => {
    tab = button.dataset.industryTab;
    modal.querySelectorAll('[data-industry-tab]').forEach(x => x.classList.toggle('is-active', x === button));
    render();
  });

  content.onclick = e => {
    const target = e.target.closest('button');
    if (!target) return;

    if (target.dataset.industryWork) void run(async () => {
      const roleId = target.dataset.industryWork;
      const batchId = target.dataset.batchId;
      const batch = (snapshot.batches || []).find(b => String(b.id) === String(batchId));
      const recipe = recipeById(config, batch?.recipeId);
      const task = await startIndustryWork(objectId, cityId, roleId, batchId);
      const result = await playIndustryMiniGame(roleId, { recipe, rework: batch?.stage === 'rework_operator' });
      if (result.cancelled) {
        await cancelIndustryWork(objectId, cityId, task.id);
        return;
      }
      const done = await completeIndustryWork(objectId, cityId, task.id, result);
      if (done?.qualityOutcome === 'defect') toast(`Брак найден. Партия «${recipe?.label || ''}» возвращена оператору на пересборку.`, 'warning');
      if (done?.qualityOutcome === 'accepted') toast(`Контроль качества пройден. Партия «${recipe?.label || ''}» отправлена на склад.`, 'success');
    });

    if (target.dataset.industryOrder) void run(() => createIndustryOrder(objectId, cityId, target.dataset.industryOrder));
    if (target.dataset.industrySell) void run(() => sellIndustryRaw(objectId, cityId, target.dataset.industrySell, Number(content.querySelector(`[data-industry-raw-qty="${target.dataset.industrySell}"]`).value)));
    if (target.dataset.industryPrice) void run(() => setIndustryBuyPrice(objectId, cityId, target.dataset.industryPrice, Number(content.querySelector(`[data-industry-price-value="${target.dataset.industryPrice}"]`).value)));
    if (target.dataset.industryRaw) void run(() => transferIndustryRaw(objectId, cityId, target.dataset.industryRaw, Number(content.querySelector(`[data-industry-raw-qty="${target.dataset.industryRaw}"]`).value)));
    if (target.dataset.industryProduct) void run(() => withdrawIndustryProduct(objectId, cityId, target.dataset.industryProduct, Number(content.querySelector(`[data-industry-product-qty="${target.dataset.industryProduct}"]`).value)));
    if (target.matches('[data-industry-purchase]')) void run(() => purchaseIndustry(objectId, cityId, config.id, content.querySelector('[data-industry-legal]').value));
    if (target.matches('[data-industry-deposit]')) void run(() => depositIndustry(objectId, cityId, Number(content.querySelector('[data-industry-money]').value)));
    if (target.matches('[data-industry-withdraw]')) void run(() => withdrawIndustry(objectId, cityId, Number(content.querySelector('[data-industry-money]').value)));
    if (target.matches('[data-industry-staff]')) void run(() => setIndustryRole(objectId, cityId, content.querySelector('[data-industry-target]').value, content.querySelector('[data-industry-role]').value));
  };

  const action = e => {
    const object = e.detail?.object;
    const id = String(object?.type || object?.payload?.jobType || '');
    config = getIndustry(id);
    if (!config) return;
    objectId = String(object?.id || object?.payload?.factoryId || '');
    tab = 'work';
    modal.querySelectorAll('[data-industry-tab]').forEach(x => x.classList.toggle('is-active', x.dataset.industryTab === 'work'));
    modal.hidden = false;
    void run(refresh);
  };

  window.addEventListener('mn:industry-object-action', action);
  return () => { window.removeEventListener('mn:industry-object-action', action); modal.remove(); };
}
