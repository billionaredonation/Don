import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import {
  adminSeedFarmBusinessBuckets,
  buyFarmBusinessTool,
  depositFarmBusiness,
  fillFarmBucketFromBarrel,
  getFarmUserErrorMessage,
  harvestFarmPlant,
  loadFarmBusinessSnapshot,
  loadFarmInventory,
  loadFarmMarket,
  loadFarmPlantStates,
  interactFarmWaterTower,
  orderFarmBusinessSupply,
  purchaseFarmBusiness,
  sellFarmItem,
  setFarmBusinessAssistant,
  setFarmBusinessToolPrice,
  takeFarmBusinessBucket,
  waterFarmPlant,
  weedFarmPlant,
  withdrawFarmBusiness,
  withdrawFarmBusinessCrop,
} from './farmApi.js';
import { FARM_ITEMS, getFarmPlantType } from './farmConfig.js';
import {
  FARM_BUCKET_CAPACITY_LITERS,
  FARM_BUSINESS_PRICE,
  FARM_PLOT_INCOME,
  FARM_TOOL_DURABILITY_COST,
  FARM_TOOL_DURABILITY_MAX,
  FARM_TOOL_MIN_PRICE,
  FARM_TOWER_CAPACITY_LITERS,
  FARM_WAREHOUSE_CAPACITY,
  getFarmBusinessId,
} from './farmBusinessConfig.js';
import { cancelFarmMiniGame, playFarmMiniGame } from './farmMiniGame.js';
import { getCropSkillStatus, publishPlayerSkills } from '../player/playerSkillState.js';
import './farm.css';

const FARM_STATE_REFRESH_MS = 5000;
const FARM_INVENTORY_REFRESH_MS = 12000;
const FARM_RAKE_ASSET_URL = `${String(import.meta.env.BASE_URL || '/')}grabl.png`;

const FREE_TOWER_WATER_BALANCE_GUARD_KEY = '__MN_FREE_TOWER_WATER_BALANCE_GUARD__';
const FREE_TOWER_WATER_LEGACY_PRICE = 5;
const FREE_TOWER_WATER_BALANCE_GUARD_MS = 4000;

function armFreeTowerWaterBalanceGuard() {
  const currentBalance = Number(state.player?.balance);
  window[FREE_TOWER_WATER_BALANCE_GUARD_KEY] = {
    reason: 'farm_tower_free_water',
    legacyPrice: FREE_TOWER_WATER_LEGACY_PRICE,
    expectedBalance: Number.isFinite(currentBalance) ? currentBalance : null,
    phase: 'armed',
    originalBalance: null,
    deductedBalance: null,
    transitions: [],
    expiresAt: Date.now() + FREE_TOWER_WATER_BALANCE_GUARD_MS,
  };
}

function finishFreeTowerWaterBalanceGuardSoon() {
  const guard = window[FREE_TOWER_WATER_BALANCE_GUARD_KEY];
  if (!guard || guard.reason !== 'farm_tower_free_water') return;
  guard.requestFinishedAt = Date.now();
  guard.expiresAt = Math.max(Number(guard.expiresAt) || 0, Date.now() + 1200);
}

function isFarmPlantObject(object = {}) {
  const type = String(object.type || object?.payload?.jobType || '');
  return Boolean(getFarmPlantType(type));
}

function isFarmStreamObject(object = {}) {
  const type = String(object.type || object?.payload?.jobType || '');
  return type === 'farm_station' || type === 'farm_water_tower' || type === 'farm_water_barrel' || isFarmPlantObject(object);
}

function emitToast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
}

function normalizePlantState(row = {}) {
  return {
    plantObjectId: String(row.plantObjectId || row.plant_object_id || ''),
    cityId: String(row.cityId || row.city_id || ''),
    cropType: String(row.cropType || row.crop_type || ''),
    stage: String(row.stage || 'ready_to_weed'),
    readyAt: row.readyAt || row.ready_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  };
}

function plantStateUpdatedAt(stateRow) {
  const timestamp = new Date(stateRow?.updatedAt || stateRow?.updated_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function shouldReplacePlantState(current, next) {
  return !current || plantStateUpdatedAt(next) >= plantStateUpdatedAt(current);
}

function secondsUntil(readyAt) {
  const target = new Date(readyAt || 0).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - Date.now()) / 1000));
}

function formatRemaining(seconds) {
  const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (safe < 60) return `${safe} сек.`;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function farmModalMarkup() {
  return `
    <div class="mn-farm-modal" data-farm-modal hidden aria-hidden="true">
      <button class="mn-farm-modal-backdrop" type="button" data-farm-close aria-label="Закрыть"></button>
      <section class="mn-farm-panel mn-farm-ui4" role="dialog" aria-modal="true" aria-labelledby="mn-farm-title">
        <header class="mn-farm4-header">
          <div class="mn-farm4-brand">
            <span class="mn-farm4-brand-icon" aria-hidden="true">🌱</span>
            <span class="mn-farm4-brand-copy">
              <small>Работа · фермерское предприятие</small>
              <strong id="mn-farm-title">Фермерская лавка</strong>
            </span>
          </div>
          <div class="mn-farm4-header-actions">
            <b class="mn-farm4-role" data-farm-business-role>Работник</b>
            <button class="mn-farm4-close" type="button" data-farm-close aria-label="Закрыть">×</button>
          </div>
        </header>

        <div class="mn-farm4-shell">
          <aside class="mn-farm4-sidebar">
            <nav class="mn-farm4-tabs" aria-label="Разделы фермы" role="tablist">
              <button type="button" data-farm-tab="tools" data-active="true" role="tab" aria-selected="true">
                <i aria-hidden="true">🧰</i><span><b>Инструменты</b><small>Покупка и состояние</small></span>
              </button>
              <button type="button" data-farm-tab="sell" role="tab" aria-selected="false">
                <i aria-hidden="true">₴</i><span><b>Продажа</b><small>Урожай и рынок</small></span>
              </button>
              <button type="button" data-farm-tab="business" role="tab" aria-selected="false">
                <i aria-hidden="true">⚙</i><span><b>Управление</b><small>Бизнес и склад</small></span>
              </button>
            </nav>

            <div class="mn-farm4-cycle" aria-label="Порядок работы на ферме">
              <small>Цикл работы</small>
              <div>
                <span><i><img src="${FARM_RAKE_ASSET_URL}" alt=""></i><b>Прополоть</b></span>
                <em>→</em>
                <span><i>💧</i><b>Полить</b></span>
                <em>→</em>
                <span><i>✂️</i><b>Собрать</b></span>
              </div>
              <p data-farm-owner-income-note hidden>Доход владельца: ${FARM_PLOT_INCOME} ₴ за завершённый участок.</p>
            </div>
          </aside>

          <main class="mn-farm4-content">
            <section class="mn-farm4-page" data-farm-page="tools">
              <div class="mn-farm4-page-head">
                <span><small>Рабочее снаряжение</small><h3>Инструменты</h3><p>Купите инструмент один раз и следите за его прочностью. Новый можно взять после поломки.</p></span>
              </div>

              <div class="mn-farm4-tool-grid">
                <button type="button" class="mn-farm4-tool-card" data-farm-buy="farm_rake">
                  <i class="mn-farm4-tool-icon is-rake" aria-hidden="true"><img src="${FARM_RAKE_ASSET_URL}" alt=""></i>
                  <span class="mn-farm4-tool-copy">
                    <span class="mn-farm4-card-title"><b>Грабли</b><strong><span data-farm-tool-price="farm_rake">${FARM_TOOL_MIN_PRICE}</span> ₴</strong></span>
                    <small>100 прочности · −${FARM_TOOL_DURABILITY_COST} за куст</small>
                    <span class="mn-farm4-tool-meta"><em>На складе <b data-farm-tool-stock="farm_rake">0</b> шт.</em><em>Прочность <b data-farm-durability="farm_rake">—</b></em></span>
                    <span class="mn-farm4-progress"><i data-farm-durability-meter="farm_rake"></i></span>
                  </span>
                </button>

                <button type="button" class="mn-farm4-tool-card" data-farm-buy="farm_scissors">
                  <i class="mn-farm4-tool-icon is-scissors" aria-hidden="true">✂️</i>
                  <span class="mn-farm4-tool-copy">
                    <span class="mn-farm4-card-title"><b>Ножницы</b><strong><span data-farm-tool-price="farm_scissors">${FARM_TOOL_MIN_PRICE}</span> ₴</strong></span>
                    <small>100 прочности · −${FARM_TOOL_DURABILITY_COST} за куст</small>
                    <span class="mn-farm4-tool-meta"><em>На складе <b data-farm-tool-stock="farm_scissors">0</b> шт.</em><em>Прочность <b data-farm-durability="farm_scissors">—</b></em></span>
                    <span class="mn-farm4-progress"><i data-farm-durability-meter="farm_scissors"></i></span>
                  </span>
                </button>
              </div>

              <section class="mn-farm4-info-card is-water-info">
                <i aria-hidden="true">💧</i>
                <span><b>Полив идёт через водоснабжение фермы</b><small>Владелец или помощник берёт ведро со склада, набирает воду у бесконечной бочки и переносит её в башню. Работник набирает воду для полива уже из башни.</small></span>
              </section>
            </section>

            <section class="mn-farm4-page" data-farm-page="sell" hidden>
              <div class="mn-farm4-page-head is-market">
                <span><small>Рынок предприятия</small><h3>Продажа урожая</h3><p>Выплата идёт с баланса бизнеса. Цена и лимит обновляются каждые 3 часа.</p></span>
                <strong class="mn-farm4-countdown"><small>До обновления</small><b data-farm-market-reset>Загрузка…</b></strong>
              </div>

              <div class="mn-farm4-crop-grid">
                <article class="mn-farm4-crop-card" data-farm-sale-row="farm_apple">
                  <div class="mn-farm4-crop-main"><i aria-hidden="true">🍎</i><span><b>Яблоко</b><small data-farm-sale-level="farm_apple">ур. 1</small></span></div>
                  <div class="mn-farm4-crop-stats"><span><small>У вас</small><b><em data-farm-sale-count="farm_apple">0</em> шт.</b></span><span><small>Цена</small><b><mark data-farm-sale-price="farm_apple">—</mark> ₴</b></span><span><small>Лимит</small><b><mark data-farm-sale-limit="farm_apple">—</mark></b></span></div>
                  <div class="mn-farm4-crop-actions"><button type="button" data-farm-sell="farm_apple" data-quantity="1">Продать 1</button><button type="button" data-farm-sell="farm_apple" data-quantity="0">Продать всё</button></div>
                </article>

                <article class="mn-farm4-crop-card" data-farm-sale-row="farm_orange">
                  <div class="mn-farm4-crop-main"><i aria-hidden="true">🍊</i><span><b>Апельсин</b><small data-farm-sale-level="farm_orange">ур. 1</small></span></div>
                  <div class="mn-farm4-crop-stats"><span><small>У вас</small><b><em data-farm-sale-count="farm_orange">0</em> шт.</b></span><span><small>Цена</small><b><mark data-farm-sale-price="farm_orange">—</mark> ₴</b></span><span><small>Лимит</small><b><mark data-farm-sale-limit="farm_orange">—</mark></b></span></div>
                  <div class="mn-farm4-crop-actions"><button type="button" data-farm-sell="farm_orange" data-quantity="1">Продать 1</button><button type="button" data-farm-sell="farm_orange" data-quantity="0">Продать всё</button></div>
                </article>

                <article class="mn-farm4-crop-card" data-farm-sale-row="farm_wheat">
                  <div class="mn-farm4-crop-main"><i aria-hidden="true">🌾</i><span><b>Пшеница</b><small data-farm-sale-level="farm_wheat">ур. 1</small></span></div>
                  <div class="mn-farm4-crop-stats"><span><small>У вас</small><b><em data-farm-sale-count="farm_wheat">0</em> шт.</b></span><span><small>Цена</small><b><mark data-farm-sale-price="farm_wheat">—</mark> ₴</b></span><span><small>Лимит</small><b><mark data-farm-sale-limit="farm_wheat">—</mark></b></span></div>
                  <div class="mn-farm4-crop-actions"><button type="button" data-farm-sell="farm_wheat" data-quantity="1">Продать 1</button><button type="button" data-farm-sell="farm_wheat" data-quantity="0">Продать всё</button></div>
                </article>

                <article class="mn-farm4-crop-card" data-farm-sale-row="farm_corn">
                  <div class="mn-farm4-crop-main"><i aria-hidden="true">🌽</i><span><b>Кукуруза</b><small data-farm-sale-level="farm_corn">ур. 1</small></span></div>
                  <div class="mn-farm4-crop-stats"><span><small>У вас</small><b><em data-farm-sale-count="farm_corn">0</em> шт.</b></span><span><small>Цена</small><b><mark data-farm-sale-price="farm_corn">—</mark> ₴</b></span><span><small>Лимит</small><b><mark data-farm-sale-limit="farm_corn">—</mark></b></span></div>
                  <div class="mn-farm4-crop-actions"><button type="button" data-farm-sell="farm_corn" data-quantity="1">Продать 1</button><button type="button" data-farm-sell="farm_corn" data-quantity="0">Продать всё</button></div>
                </article>
              </div>
            </section>

            <section class="mn-farm4-page mn-farm4-business-page" data-farm-page="business" hidden>
              <div class="mn-farm4-page-head">
                <span><small>Фермерское ООО</small><h3>Управление предприятием</h3><p>Ключевые показатели, склад, вода, персонал и финансы — в одном месте.</p></span>
              </div>

              <div class="mn-farm4-business-summary">
                <article><i aria-hidden="true">🏢</i><span><small>Форма</small><strong>ООО</strong><em>Фермерское предприятие</em></span></article>
                <article><i aria-hidden="true">👤</i><span><small>Владелец</small><strong data-farm-owner>Государство</strong><em data-farm-assistant>Помощник: нет</em></span></article>
                <article data-farm-private><i aria-hidden="true">₴</i><span><small>Баланс бизнеса</small><strong data-farm-cash>0 ₴</strong><em>Оплата урожая и поставок</em></span></article>
                <article data-farm-private><i aria-hidden="true">💧</i><span><small>Водоснабжение</small><strong><span data-farm-tower-water>0</span> / ${FARM_TOWER_CAPACITY_LITERS} л</strong><em>Бочка: <b data-farm-barrel-present>нет</b> · ведра: <b data-farm-bucket-stock>0</b></em><span class="mn-farm4-progress is-water"><i data-farm-water-meter></i></span></span></article>
              </div>

              <section class="mn-farm4-buy-business" data-farm-business-buy>
                <div><i aria-hidden="true">🌾</i><span><small>Государственная продажа</small><strong>Купить фермерское ООО</strong><p>После покупки выкуп урожая, доход участков, инструменты и вода работают через баланс предприятия.</p></span></div>
                <button type="button" data-farm-business-purchase>Купить за ${FARM_BUSINESS_PRICE.toLocaleString('ru-RU')} ₴</button>
              </section>

              <div class="mn-farm4-business-owned" data-farm-business-owned hidden>
                <div class="mn-farm4-kpis">
                  <span data-farm-owner-income-kpi hidden><small>Доход с участков</small><b data-farm-plot-income>0 ₴</b></span>
                  <span><small>Выкуп урожая</small><b data-farm-crop-spend>0 ₴</b></span>
                  <span><small>Башня</small><b data-farm-tower-present>не установлена</b></span>
                  <span><small>Склад урожая</small><b><em data-farm-warehouse-used>0</em> / ${FARM_WAREHOUSE_CAPACITY}</b></span>
                </div>

                <div class="mn-farm4-management" data-farm-business-management hidden>
                  <section class="mn-farm4-manage-card is-finance" data-farm-owner-only>
                    <header><i aria-hidden="true">＋</i><span><b>Пополнить баланс</b><small>Оборотные средства предприятия</small></span></header>
                    <div class="mn-farm4-inline"><input type="number" min="1" step="1" inputmode="numeric" placeholder="Сумма" data-farm-deposit-amount><button type="button" data-farm-deposit>Внести</button></div>
                    <p>Используются для выкупа урожая и закупки инструментов.</p>
                  </section>

                  <section class="mn-farm4-manage-card is-profit" data-farm-owner-only>
                    <header><i aria-hidden="true">↗</i><span><b>Снять прибыль</b><small>Перевод владельцу</small></span></header>
                    <div class="mn-farm4-compact-stat">Доступно: <b data-farm-withdrawable>0 ₴</b></div>
                    <div class="mn-farm4-inline"><input type="number" min="1" step="1" inputmode="numeric" placeholder="Сумма" data-farm-withdraw-amount><button type="button" data-farm-withdraw>Снять</button><button type="button" class="is-ghost" data-farm-withdraw-all>Всё</button></div>
                  </section>

                  <section class="mn-farm4-manage-card is-assistant" data-farm-owner-only>
                    <header><i aria-hidden="true">👥</i><span><b>Помощник</b><small>Доступ к воде и ведрам</small></span></header>
                    <div class="mn-farm4-inline"><input type="text" maxlength="40" placeholder="Ник или Telegram ID" data-farm-assistant-target><button type="button" data-farm-assistant-save>Назначить</button><button type="button" class="is-ghost" data-farm-assistant-clear>Снять</button></div>
                    <p>Финансы и поставки инструментов остаются под контролем владельца.</p>
                  </section>

                  <section class="mn-farm4-manage-card is-warehouse">
                    <header class="mn-farm4-warehouse-head"><i aria-hidden="true">📦</i><span><b>Склад урожая</b><small>Вместимость ${FARM_WAREHOUSE_CAPACITY} ед.</small></span><strong><em data-farm-warehouse-used>0</em> / ${FARM_WAREHOUSE_CAPACITY}</strong></header>
                    <span class="mn-farm4-progress is-warehouse"><i data-farm-warehouse-meter></i></span>
                    <div class="mn-farm4-warehouse-grid">
                      <span><i>🍎</i><small>Яблоко</small><b data-farm-warehouse-item="farm_apple">0</b></span>
                      <span><i>🍊</i><small>Апельсин</small><b data-farm-warehouse-item="farm_orange">0</b></span>
                      <span><i>🌾</i><small>Пшеница</small><b data-farm-warehouse-item="farm_wheat">0</b></span>
                      <span><i>🌽</i><small>Кукуруза</small><b data-farm-warehouse-item="farm_corn">0</b></span>
                    </div>
                    <div class="mn-farm4-warehouse-withdraw" data-farm-owner-only>
                      <label><span>Что снимаем</span><select data-farm-crop-withdraw-type><option value="farm_apple">🍎 Яблоки</option><option value="farm_orange">🍊 Апельсины</option><option value="farm_wheat">🌾 Пшеница</option><option value="farm_corn">🌽 Кукуруза</option></select></label>
                      <label><span>Количество</span><input type="number" min="1" max="100" step="1" inputmode="numeric" value="1" data-farm-crop-withdraw-quantity></label>
                      <button type="button" data-farm-crop-withdraw>Снять урожай</button>
                    </div>
                  </section>

                  <section class="mn-farm4-manage-card is-water">
                    <header><i aria-hidden="true">💧</i><span><b>Вода и ведра</b><small>Хозяйственная система полива</small></span></header>
                    <div class="mn-farm4-water-stats"><span><small>На складе</small><b><span data-farm-bucket-stock>0</span> вед.</b></span><span><small>У вас</small><b><span data-farm-player-buckets>0</span> вед.</b></span><span><small>В ведрах</small><b><span data-farm-player-water>0</span> / <span data-farm-player-water-capacity>0</span> л</b></span></div>
                    <div class="mn-farm4-inline"><button type="button" data-farm-take-bucket>Взять ведро</button><button type="button" class="is-ghost" data-farm-admin-seed-buckets data-farm-admin-only hidden>Админ: +10 ведер</button></div>
                    <p>Наполните ведро у бесконечной бочки ♾️, затем перенесите воду к башне 🚰.</p>
                  </section>

                  <section class="mn-farm4-manage-card is-order" data-farm-owner-only>
                    <header><i aria-hidden="true">↓</i><span><b>Поставка инструментов</b><small>Закупка на склад предприятия</small></span></header>
                    <div class="mn-farm4-supply-grid">
                      <label><span><b>Грабли</b><small>70 ₴/шт.</small></span><input type="number" min="1" max="1000" value="10" data-farm-order-quantity="farm_rake"><button type="button" data-farm-order="farm_rake">Заказать</button></label>
                      <label><span><b>Ножницы</b><small>70 ₴/шт.</small></span><input type="number" min="1" max="1000" value="10" data-farm-order-quantity="farm_scissors"><button type="button" data-farm-order="farm_scissors">Заказать</button></label>
                    </div>
                  </section>

                  <section class="mn-farm4-manage-card is-pricing" data-farm-owner-only>
                    <header><i aria-hidden="true">%</i><span><b>Цены инструментов</b><small>Розничная цена для работников</small></span></header>
                    <div class="mn-farm4-supply-grid">
                      <label><span><b>Грабли</b><small>минимум 100 ₴</small></span><input type="number" min="100" value="100" data-farm-price-input="farm_rake"><button type="button" data-farm-price-save="farm_rake">Сохранить</button></label>
                      <label><span><b>Ножницы</b><small>минимум 100 ₴</small></span><input type="number" min="100" value="100" data-farm-price-input="farm_scissors"><button type="button" data-farm-price-save="farm_scissors">Сохранить</button></label>
                    </div>
                  </section>
                </div>
              </div>
            </section>
          </main>
        </div>

        <footer class="mn-farm4-status"><small data-farm-status></small></footer>
      </section>
    </div>`;
}

export function enableFarmFeature({ root, cityId } = {}) {
  if (!root || !cityId) return () => {};

  document.querySelector('[data-farm-modal]')?.remove();
  cancelFarmMiniGame();
  document.body.insertAdjacentHTML('beforeend', farmModalMarkup());

  const modal = document.querySelector('[data-farm-modal]');
  const panel = modal?.querySelector('.mn-farm-panel');
  const status = modal?.querySelector('[data-farm-status]');
  const tabButtons = [...(modal?.querySelectorAll('[data-farm-tab]') || [])];
  const tabPages = [...(modal?.querySelectorAll('[data-farm-page]') || [])];

  let destroyed = false;
  let busy = false;
  let inventoryState = { items: [] };
  let marketState = { items: [] };
  let businessState = null;
  let activeFarmObject = null;
  let activeBuyerObjectId = '';
  let plantStates = new Map();
  let plantStatesReady = false;
  let plantStatesLoadPromise = null;
  let stateRefreshTimer = 0;
  let inventoryRefreshTimer = 0;
  let marketCountdownTimer = 0;
  let marketRefreshPromise = null;
  let businessRefreshPromise = null;
  let realtimeChannel = null;
  let scrollTouch = null;
  let scrollClickBlockedUntil = 0;

  window.__MN_FARM_PLANT_STATES_READY__ = false;

  function setStatus(message = '', type = 'info') {
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
  }

  function publishPlantStates() {
    window.__MN_FARM_PLANT_STATES__ = Object.fromEntries(
      [...plantStates.entries()].map(([id, value]) => [id, { ...value }]),
    );
    document.querySelectorAll('[data-map-object-id]').forEach((element) => {
      const objectId = String(element.dataset.mapObjectId || '');
      const saved = plantStates.get(objectId);
      const waiting = saved?.stage === 'cooldown' && secondsUntil(saved.readyAt) > 0;
      element.classList.toggle('is-farm-plant-cooldown', waiting);
      if (saved?.stage) element.dataset.farmPlantStage = saved.stage;
      else delete element.dataset.farmPlantStage;
    });
    window.dispatchEvent(new CustomEvent('mn:farm-plant-states-changed', {
      detail: { cityId, states: window.__MN_FARM_PLANT_STATES__ },
    }));
  }

  function upsertPlantState(row) {
    const next = normalizePlantState(row);
    if (!next.plantObjectId || (next.cityId && next.cityId !== String(cityId))) return;
    const current = plantStates.get(next.plantObjectId);
    if (!shouldReplacePlantState(current, next)) return;
    plantStates.set(next.plantObjectId, next);
    publishPlantStates();
  }

  function removePlantState(plantObjectId) {
    plantStates.delete(String(plantObjectId || ''));
    publishPlantStates();
  }

  function publishInventory(result) {
    const payload = result?.inventory && typeof result.inventory === 'object' ? result.inventory : result;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    inventoryState = payload && typeof payload === 'object' ? payload : { items };
    window.__MN_FARM_INVENTORY_ITEMS__ = items.map((item) => ({ ...item }));
    window.__MN_FARM_INVENTORY_STATE__ = inventoryState;
    window.dispatchEvent(new CustomEvent('mn:farm-inventory-changed', {
      detail: { inventory: inventoryState, items: window.__MN_FARM_INVENTORY_ITEMS__ },
    }));

    const balance = Number(inventoryState.balance);
    if (Number.isFinite(balance)) {
      state.player = { ...(state.player || {}), balance };
      window.dispatchEvent(new CustomEvent('mn:player-balance-changed', {
        detail: { balance, source: 'farm_job' },
      }));
    }
    renderInventory();
    return inventoryState;
  }

  function inventoryItem(itemType) {
    return inventoryState?.items?.find?.((item) => String(item.itemType || item.item_type || '') === String(itemType)) || null;
  }

  function itemQuantity(itemType) {
    return Number(inventoryItem(itemType)?.quantity || 0);
  }

  function toolDurability(itemType) {
    const direct = Number(inventoryItem(itemType)?.durability);
    if (Number.isFinite(direct)) return direct;
    const row = businessState?.playerTools?.find?.((item) => String(item.itemType || item.item_type || '') === String(itemType));
    const value = Number(row?.durability);
    return Number.isFinite(value) ? value : null;
  }

  function syncBusinessToolsIntoInventory() {
    const rows = Array.isArray(businessState?.playerTools) ? businessState.playerTools : [];
    if (!rows.length || !Array.isArray(inventoryState?.items)) return;
    const byType = new Map(rows.map((item) => [String(item.itemType || item.item_type || ''), item]));
    inventoryState.items = inventoryState.items.map((item) => {
      const row = byType.get(String(item.itemType || item.item_type || ''));
      return row ? { ...item, durability: Number(row.durability), maxDurability: Number(row.maxDurability || FARM_TOOL_DURABILITY_MAX), broken: Number(row.durability) <= 0 } : item;
    });
    window.__MN_FARM_INVENTORY_ITEMS__ = inventoryState.items.map((item) => ({ ...item }));
    window.__MN_FARM_INVENTORY_STATE__ = inventoryState;
  }

  function formatMoney(value) {
    return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ru-RU')} ₴`;
  }

  function renderBusiness() {
    if (!modal) return;
    const business = businessState;
    const owned = Boolean(business?.owned);
    const role = String(business?.role || 'worker');
    const isOwner = role === 'owner';
    const isStaff = isOwner || role === 'assistant';
    const isAdmin = Boolean(business?.isAdmin);
    const roleLabel = role === 'owner' ? 'Владелец' : role === 'assistant' ? 'Помощник' : isAdmin ? 'Администратор' : 'Работник';

    const roleEl = modal.querySelector('[data-farm-business-role]');
    if (roleEl) {
      roleEl.textContent = roleLabel;
      roleEl.dataset.role = role;
    }
    const canManage = isStaff || isAdmin;
    const businessTab = modal.querySelector('[data-farm-tab="business"]');
    if (businessTab) {
      businessTab.hidden = owned && !canManage;
      const label = businessTab.querySelector('b');
      const hint = businessTab.querySelector('small');
      if (label) label.textContent = canManage ? 'Управление' : 'Предприятие';
      if (hint) hint.textContent = canManage ? 'Финансы и склад' : 'Покупка бизнеса';
    }
    modal.querySelectorAll('[data-farm-private]').forEach((element) => { element.hidden = !canManage; });
    modal.querySelectorAll('[data-farm-owner-income-note], [data-farm-owner-income-kpi]').forEach((element) => {
      element.hidden = !isOwner;
    });
    const ownerEl = modal.querySelector('[data-farm-owner]');
    if (ownerEl) ownerEl.textContent = owned ? (business?.ownerNickname || business?.ownerTgId || 'Владелец') : 'Государство';
    const assistantEl = modal.querySelector('[data-farm-assistant]');
    if (assistantEl) assistantEl.textContent = `Помощник: ${business?.assistantNickname || business?.assistantTgId || 'нет'}`;
    const cashBalance = Math.max(0, Math.floor(Number(business?.cashBalance) || 0));
    const cashEl = modal.querySelector('[data-farm-cash]');
    if (cashEl) cashEl.textContent = formatMoney(cashBalance);
    modal.querySelectorAll('[data-farm-withdrawable]').forEach((element) => { element.textContent = formatMoney(cashBalance); });
    const withdrawAmountInput = modal.querySelector('[data-farm-withdraw-amount]');
    if (withdrawAmountInput) withdrawAmountInput.max = String(cashBalance);
    modal.querySelectorAll('[data-farm-withdraw], [data-farm-withdraw-all]').forEach((button) => { button.disabled = busy || !isOwner || cashBalance <= 0; });
    const towerWater = Math.max(0, Number(business?.towerWaterLiters || 0));
    const towerWaterEl = modal.querySelector('[data-farm-tower-water]');
    if (towerWaterEl) towerWaterEl.textContent = towerWater.toLocaleString('ru-RU');
    const towerWaterPercent = Math.min(100, (towerWater / FARM_TOWER_CAPACITY_LITERS) * 100);
    modal.querySelectorAll('[data-farm-water-meter]').forEach((element) => {
      element.style.setProperty('--mn-farm-meter-value', `${towerWaterPercent}%`);
    });
    const barrelPresentEl = modal.querySelector('[data-farm-barrel-present]');
    if (barrelPresentEl) barrelPresentEl.textContent = business?.barrelPresent ? 'есть' : 'нет';
    modal.querySelectorAll('[data-farm-bucket-stock]').forEach((element) => { element.textContent = String(Number(business?.bucketStock || 0)); });
    const cargo = business?.playerWaterCargo || {};
    modal.querySelectorAll('[data-farm-player-buckets]').forEach((element) => { element.textContent = String(Number(cargo.bucketCount || 0)); });
    modal.querySelectorAll('[data-farm-player-water]').forEach((element) => { element.textContent = Number(cargo.waterLiters || 0).toLocaleString('ru-RU'); });
    modal.querySelectorAll('[data-farm-player-water-capacity]').forEach((element) => { element.textContent = Number(cargo.capacityLiters || 0).toLocaleString('ru-RU'); });
    const warehouse = business?.warehouse || { capacity: FARM_WAREHOUSE_CAPACITY, used: 0, free: FARM_WAREHOUSE_CAPACITY, items: {} };
    const warehouseUsed = Math.max(0, Number(warehouse.used || 0));
    const warehouseCapacity = Math.max(1, Number(warehouse.capacity || FARM_WAREHOUSE_CAPACITY));
    modal.querySelectorAll('[data-farm-warehouse-used]').forEach((element) => { element.textContent = String(warehouseUsed); });
    const warehousePercent = Math.min(100, (warehouseUsed / warehouseCapacity) * 100);
    modal.querySelectorAll('[data-farm-warehouse-meter]').forEach((element) => {
      element.style.setProperty('--mn-farm-meter-value', `${warehousePercent}%`);
    });
    ['farm_apple', 'farm_orange', 'farm_wheat', 'farm_corn'].forEach((itemType) => {
      modal.querySelectorAll(`[data-farm-warehouse-item="${itemType}"]`).forEach((element) => { element.textContent = String(Number(warehouse?.items?.[itemType]?.quantity || 0)); });
    });
    const plotIncomeEl = modal.querySelector('[data-farm-plot-income]');
    if (plotIncomeEl) plotIncomeEl.textContent = formatMoney(business?.plotIncomeTotal || 0);
    const cropSpendEl = modal.querySelector('[data-farm-crop-spend]');
    if (cropSpendEl) cropSpendEl.textContent = formatMoney(business?.cropPurchaseSpend || 0);
    const towerPresentEl = modal.querySelector('[data-farm-tower-present]');
    if (towerPresentEl) towerPresentEl.textContent = business?.towerPresent ? 'установлена' : 'не установлена';

    const buyBlock = modal.querySelector('[data-farm-business-buy]');
    if (buyBlock) buyBlock.hidden = owned;
    const ownedBlock = modal.querySelector('[data-farm-business-owned]');
    if (ownedBlock) ownedBlock.hidden = !owned && !isAdmin;
    const management = modal.querySelector('[data-farm-business-management]');
    if (management) management.hidden = (!owned && !isAdmin) || (!isStaff && !isAdmin);
    modal.querySelectorAll('[data-farm-owner-only]').forEach((element) => { element.hidden = !isOwner; });
    modal.querySelectorAll('[data-farm-admin-only]').forEach((element) => { element.hidden = !isAdmin; });
    const takeBucketButton = modal.querySelector('[data-farm-take-bucket]');
    if (takeBucketButton) takeBucketButton.disabled = busy || Number(business?.bucketStock || 0) <= 0;

    ['farm_rake', 'farm_scissors'].forEach((itemType) => {
      const tool = business?.tools?.[itemType] || {};
      modal.querySelectorAll(`[data-farm-tool-stock="${itemType}"]`).forEach((element) => { element.textContent = String(Number(tool.stock || 0)); });
      modal.querySelectorAll(`[data-farm-tool-price="${itemType}"]`).forEach((element) => { element.textContent = String(Number(tool.price || FARM_TOOL_MIN_PRICE)); });
      const priceInput = modal.querySelector(`[data-farm-price-input="${itemType}"]`);
      if (priceInput && document.activeElement !== priceInput) priceInput.value = String(Number(tool.price || FARM_TOOL_MIN_PRICE));
    });

    syncBusinessToolsIntoInventory();
    renderInventory();
  }

  function publishBusiness(result) {
    const business = result?.business && typeof result.business === 'object' ? result.business : result;
    if (!business || typeof business !== 'object') return businessState;
    businessState = business;
    const playerBalance = Number(business.playerBalance ?? result?.playerBalance);
    if (Number.isFinite(playerBalance)) {
      state.player = { ...(state.player || {}), balance: playerBalance };
      window.dispatchEvent(new CustomEvent('mn:player-balance-changed', { detail: { balance: playerBalance, source: 'farm_business' } }));
    }
    window.__MN_FARM_BUSINESS_STATE__ = { ...businessState };
    renderBusiness();
    return businessState;
  }

  async function refreshBusiness({ silent = true } = {}) {
    if (!activeBuyerObjectId) return null;
    if (businessRefreshPromise) return businessRefreshPromise;
    const requestedId = activeBuyerObjectId;
    businessRefreshPromise = (async () => {
      try {
        const result = await loadFarmBusinessSnapshot({ businessId: requestedId, cityId });
        if (requestedId === activeBuyerObjectId) {
          const published = publishBusiness(result);
          return published;
        }
        return result;
      } catch (error) {
        if (!silent) setStatus(getFarmUserErrorMessage(error), 'error');
        return null;
      } finally {
        businessRefreshPromise = null;
      }
    })();
    return businessRefreshPromise;
  }

  function applyToolDurability(result) {
    const itemType = String(result?.itemType || result?.item_type || '');
    const durability = Number(result?.durability);
    if (!itemType || !Number.isFinite(durability)) return;
    const row = inventoryItem(itemType);
    if (row) {
      row.durability = durability;
      row.maxDurability = Number(result?.maxDurability || FARM_TOOL_DURABILITY_MAX);
      row.broken = durability <= 0;
    }
    if (businessState) {
      const rows = Array.isArray(businessState.playerTools) ? businessState.playerTools : [];
      const index = rows.findIndex((item) => String(item.itemType || item.item_type || '') === itemType);
      const next = { itemType, durability, maxDurability: Number(result?.maxDurability || FARM_TOOL_DURABILITY_MAX) };
      if (index >= 0) rows[index] = { ...rows[index], ...next };
      else rows.push(next);
      businessState.playerTools = rows;
    }
    window.__MN_FARM_INVENTORY_ITEMS__ = (inventoryState.items || []).map((item) => ({ ...item }));
    renderInventory();
  }

  function marketItem(itemType) {
    return marketState?.items?.find?.((item) => item.itemType === itemType) || null;
  }

  function renderMarketCountdown() {
    const element = modal?.querySelector('[data-farm-market-reset]');
    if (!element) return;
    const target = new Date(marketState?.refreshAt || 0).getTime();
    if (!Number.isFinite(target) || target <= 0) {
      element.textContent = activeBuyerObjectId ? 'Обновляем…' : 'Нет скупщика';
      return;
    }
    const seconds = Math.max(0, Math.ceil((target - Date.now()) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    element.textContent = `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
    if (seconds <= 0 && modal?.hidden === false) void refreshMarket({ silent: true });
  }

  function publishMarket(result) {
    marketState = result && typeof result === 'object' ? result : { items: [] };
    ['farm_apple', 'farm_orange', 'farm_wheat', 'farm_corn'].forEach((itemType) => {
      const item = marketItem(itemType);
      const row = modal?.querySelector(`[data-farm-sale-row="${itemType}"]`);
      row?.classList.toggle('is-market-locked', item?.unlocked === false);
      row?.classList.toggle('is-market-empty', Number(item?.remainingQuantity) <= 0);
      row?.querySelectorAll(`[data-farm-sale-price="${itemType}"]`).forEach((element) => {
        element.textContent = item?.unlocked === false ? '🔒' : String(item?.unitPrice ?? '—');
      });
      row?.querySelectorAll(`[data-farm-sale-limit="${itemType}"]`).forEach((element) => {
        element.textContent = item?.unlocked === false
          ? `с ${item.unlockLevel} ур. фермера`
          : Number(item?.remainingQuantity ?? 0).toLocaleString('ru-RU');
      });
      row?.querySelectorAll(`[data-farm-sale-level="${itemType}"]`).forEach((element) => {
        element.textContent = `ур. ${Number(item?.masteryLevel) || 1}`;
      });
    });
    renderMarketCountdown();
    renderInventory();
    return marketState;
  }

  function renderInventory() {
    ['farm_apple', 'farm_orange', 'farm_wheat', 'farm_corn'].forEach((itemType) => {
      modal?.querySelectorAll(`[data-farm-sale-count="${itemType}"]`).forEach((element) => {
        element.textContent = String(itemQuantity(itemType));
      });
      modal?.querySelectorAll(`[data-farm-sale-row="${itemType}"] button`).forEach((button) => {
        const market = marketItem(itemType);
        button.disabled = busy
          || itemQuantity(itemType) <= 0
          || !activeBuyerObjectId
          || market?.unlocked === false
          || Number(market?.remainingQuantity ?? 0) <= 0
          || Number(businessState?.warehouse?.free ?? FARM_WAREHOUSE_CAPACITY) <= 0;
      });
    });

    ['farm_rake', 'farm_scissors'].forEach((itemType) => {
      const button = modal?.querySelector(`[data-farm-buy="${itemType}"]`);
      const durability = toolDurability(itemType);
      const legacyOwned = itemQuantity(itemType) > 0;
      const needsMigration = legacyOwned && durability === null;
      const usable = Number.isFinite(durability) && durability > 0;
      const stock = Number(businessState?.tools?.[itemType]?.stock || 0);
      if (button) {
        button.disabled = busy || usable || (!needsMigration && businessState?.owned !== false && stock <= 0);
        button.dataset.owned = usable ? 'true' : 'false';
        button.dataset.broken = Number.isFinite(durability) && durability <= 0 ? 'true' : 'false';
        button.title = needsMigration ? 'Активировать систему прочности для старого инструмента' : usable ? `Осталось ${durability}% прочности` : '';
      }
      modal?.querySelectorAll(`[data-farm-durability="${itemType}"]`).forEach((element) => {
        element.textContent = durability === null ? (legacyOwned ? 'активировать' : 'нет') : `${Math.max(0, durability).toFixed(durability % 1 ? 1 : 0)} / ${FARM_TOOL_DURABILITY_MAX}`;
      });
      const durabilityPercent = Number.isFinite(durability)
        ? Math.min(100, Math.max(0, (durability / FARM_TOOL_DURABILITY_MAX) * 100))
        : 0;
      modal?.querySelectorAll(`[data-farm-durability-meter="${itemType}"]`).forEach((element) => {
        element.style.setProperty('--mn-farm-meter-value', `${durabilityPercent}%`);
      });
    });
  }

  async function refreshInventory({ silent = true } = {}) {
    try {
      publishInventory(await loadFarmInventory());
    } catch (error) {
      if (!silent) setStatus(getFarmUserErrorMessage(error), 'error');
    }
  }

  async function refreshMarket({ silent = true } = {}) {
    if (!activeBuyerObjectId) return null;
    if (marketRefreshPromise) return marketRefreshPromise;
    const requestedBuyerId = activeBuyerObjectId;
    marketRefreshPromise = (async () => {
      try {
        const result = await loadFarmMarket({ cityId, buyerObjectId: requestedBuyerId });
        if (requestedBuyerId === activeBuyerObjectId) return publishMarket(result);
        return result;
      } catch (error) {
        if (!silent) setStatus(getFarmUserErrorMessage(error), 'error');
        return null;
      } finally {
        marketRefreshPromise = null;
      }
    })();
    return marketRefreshPromise;
  }

  function refreshPlantStates() {
    if (plantStatesLoadPromise) return plantStatesLoadPromise;

    plantStatesLoadPromise = (async () => {
      try {
        const result = await loadFarmPlantStates(cityId);
        if (destroyed) return false;
        const rows = Array.isArray(result?.states) ? result.states : Array.isArray(result) ? result : [];
        const mergedStates = new Map(plantStates);
        rows.map(normalizePlantState).filter((row) => row.plantObjectId).forEach((row) => {
          const current = mergedStates.get(row.plantObjectId);
          if (shouldReplacePlantState(current, row)) mergedStates.set(row.plantObjectId, row);
        });
        plantStates = mergedStates;
        plantStatesReady = true;
        window.__MN_FARM_PLANT_STATES_READY__ = true;
        publishPlantStates();
        return true;
      } catch (error) {
        console.warn('[farm] plant state refresh failed:', error);
        return false;
      } finally {
        plantStatesLoadPromise = null;
      }
    })();

    return plantStatesLoadPromise;
  }

  function startFarmStreamLoading() {
    if (destroyed) return;
    const wasActive = Boolean(realtimeChannel || stateRefreshTimer || inventoryRefreshTimer);

    if (!realtimeChannel) {
      realtimeChannel = supabase
        .channel(`farm-plants:${cityId}:${Math.random().toString(16).slice(2)}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'farm_plant_states',
          filter: `city_id=eq.${cityId}`,
        }, (payload) => {
          if (payload.eventType === 'DELETE') removePlantState(payload.old?.plant_object_id);
          else upsertPlantState(payload.new);
        })
        .subscribe();
    }
    if (!stateRefreshTimer) {
      stateRefreshTimer = window.setInterval(refreshPlantStates, FARM_STATE_REFRESH_MS);
    }
    if (!inventoryRefreshTimer) {
      inventoryRefreshTimer = window.setInterval(() => {
        void refreshInventory({ silent: true });
        if (modal?.hidden === false && activeBuyerObjectId) void refreshBusiness({ silent: true });
      }, FARM_INVENTORY_REFRESH_MS);
    }
    if (!wasActive) {
      void refreshPlantStates();
      void refreshInventory({ silent: true });
    }
  }

  function stopFarmStreamLoading() {
    window.clearInterval(stateRefreshTimer);
    window.clearInterval(inventoryRefreshTimer);
    stateRefreshTimer = 0;
    inventoryRefreshTimer = 0;
    if (realtimeChannel) {
      const channel = realtimeChannel;
      realtimeChannel = null;
      void supabase.removeChannel(channel);
    }
  }

  function handleJobStreamWindow(event) {
    if (event?.detail?.cityId && String(event.detail.cityId) !== String(cityId)) return;
    const objects = Array.isArray(event?.detail?.objects) ? event.detail.objects : [];
    if (objects.some(isFarmStreamObject)) startFarmStreamLoading();
    else stopFarmStreamLoading();
  }

  function openModal(object) {
    if (!modal || busy) return;
    startFarmStreamLoading();
    activeFarmObject = object || null;
    activeBuyerObjectId = String(object?.id || '');
    marketState = { items: [] };
    businessState = null;
    publishMarket(marketState);
    renderBusiness();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-farm-modal-open');
    setTab('tools');
    void refreshInventory({ silent: false });
    void refreshMarket({ silent: true });
    void refreshBusiness({ silent: false });
  }

  function closeModal() {
    if (!modal || busy) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mn-farm-modal-open');
    activeFarmObject = null;
    setStatus('');
  }

  function setTab(tab) {
    if (modal) modal.dataset.activeTab = String(tab || 'tools');
    tabButtons.forEach((button) => {
      const active = button.dataset.farmTab === tab;
      button.dataset.active = active ? 'true' : 'false';
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    tabPages.forEach((page) => {
      const active = page.dataset.farmPage === tab;
      page.hidden = !active;
      if (active) page.scrollTop = 0;
    });
    if (tab === 'sell') void refreshMarket({ silent: true });
    if (tab === 'business') void refreshBusiness({ silent: true });
  }

  function usesForcedMobileRotation() {
    return Boolean(
      window.matchMedia?.('(orientation: portrait)')?.matches
      && (
        document.documentElement.classList.contains('mn-force-rotate-landscape')
        || document.body.classList.contains('mn-force-rotate-landscape')
      )
    );
  }

  function handleScrollTouchStart(event) {
    const page = event.target?.closest?.('[data-farm-page]');
    if (!page || page.hidden || !usesForcedMobileRotation() || event.touches.length !== 1) {
      scrollTouch = null;
      return;
    }
    const touch = event.touches[0];
    scrollTouch = {
      page,
      identifier: touch.identifier,
      clientX: touch.clientX,
      clientY: touch.clientY,
      scrollTop: page.scrollTop,
    };
  }

  function handleScrollTouchMove(event) {
    if (!scrollTouch) return;
    const touch = Array.from(event.touches).find((item) => item.identifier === scrollTouch.identifier);
    if (!touch) return;
    const deltaX = touch.clientX - scrollTouch.clientX;
    const deltaY = touch.clientY - scrollTouch.clientY;
    const scrollDelta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : -deltaY;
    if (Math.abs(scrollDelta) < 3) return;
    const maximum = Math.max(0, scrollTouch.page.scrollHeight - scrollTouch.page.clientHeight);
    scrollTouch.page.scrollTop = Math.max(0, Math.min(maximum, scrollTouch.scrollTop + scrollDelta));
    scrollClickBlockedUntil = performance.now() + 350;
    event.preventDefault();
  }

  function handleScrollTouchEnd() {
    scrollTouch = null;
  }

  function getPlantAction(object) {
    const objectType = String(object?.type || object?.payload?.jobType || '');
    const plant = getFarmPlantType(objectType);
    if (!plant) return null;

    const saved = plantStates.get(String(object?.id || ''));
    if (!saved) return { action: 'weed', plant, remaining: 0 };
    if (saved.stage === 'cooldown') {
      const remaining = secondsUntil(saved.readyAt);
      return remaining > 0
        ? { action: 'wait', plant, remaining }
        : { action: 'weed', plant, remaining: 0 };
    }
    if (saved.stage === 'weeded') return { action: 'water', plant, remaining: 0 };
    if (saved.stage === 'watered') return { action: 'harvest', plant, remaining: 0 };
    return { action: 'weed', plant, remaining: 0 };
  }

  async function runMiniGameAction(action, callback, gameOptions = {}) {
    if (busy || window.__MN_PLAYER_CONTROLS_LOCKED__ === true) return null;
    busy = true;
    window.__MN_PLAYER_CONTROLS_LOCKED__ = true;
    renderInventory();
    try {
      const gameResult = await playFarmMiniGame({ action, ...gameOptions });
      if (destroyed || gameResult.cancelled) return null;
      const result = await callback(gameResult.score);
      if (!result || typeof result !== 'object') return result;
      if (result?.state) upsertPlantState(result.state);
      if (result?.inventory) publishInventory(result.inventory);
      result.miniGameScore = Number(result.miniGameScore ?? gameResult.score);
      result.miniGameGrade = String(result.miniGameGrade || gameResult.grade);
      void refreshPlantStates();
      return result;
    } catch (error) {
      emitToast(getFarmUserErrorMessage(error), 'error');
      void refreshPlantStates();
      void refreshInventory({ silent: true });
      return null;
    } finally {
      window.__MN_PLAYER_CONTROLS_LOCKED__ = false;
      busy = false;
      renderInventory();
    }
  }

  function ensureToolReady(itemType) {
    const quantity = itemQuantity(itemType);
    const durability = toolDurability(itemType);
    if (quantity <= 0) {
      emitToast(itemType === 'farm_rake' ? 'Для прополки нужны грабли. Купите их у фермерского предприятия.' : 'Для сбора урожая нужны ножницы. Купите их у фермерского предприятия.', 'error');
      return false;
    }
    if (durability === null) {
      emitToast('Старый инструмент нужно один раз активировать в лавке фермы, чтобы получить 100 прочности.', 'info');
      return false;
    }
    if (durability <= 0) {
      emitToast('Инструмент сломан. Купите новый в лавке фермы.', 'error');
      return false;
    }
    return true;
  }

  async function workWithPlant(object) {
    if (!isFarmPlantObject(object) || busy) return;
    startFarmStreamLoading();

    if (!plantStatesReady) {
      emitToast('Проверяем сохранённое состояние растения…', 'info');
      const loaded = await refreshPlantStates();
      if (!loaded) {
        emitToast('Не удалось загрузить состояние растения. Попробуйте ещё раз.', 'error');
        return;
      }
      if (busy) return;
    }

    const businessId = getFarmBusinessId(object);
    if (!businessId) {
      emitToast('Этот участок не привязан к фермерскому бизнесу. Администратор должен указать ID фермы у объекта растения.', 'error');
      return;
    }

    const next = getPlantAction(object);
    if (!next) return;
    const cropSkill = getCropSkillStatus(next.plant.cropType);
    if (cropSkill.unlocked === false) {
      emitToast(`Культура «${cropSkill.label}» откроется на ${cropSkill.unlockLevel} уровне навыка «Фермер».`, 'info');
      return;
    }
    if (next.action === 'wait') {
      emitToast(`Растение ещё не готово. Подождите ${formatRemaining(next.remaining)}, чтобы прополоть.`, 'info');
      return;
    }

    const request = { cityId, businessId, plantObjectId: String(object.id || '') };
    const gameOptions = {
      cropType: next.plant.cropType,
      cropIcon: next.plant.icon,
      cropLabel: next.plant.label,
    };
    if (next.action === 'weed') {
      if (!ensureToolReady('farm_rake')) return;
      const result = await runMiniGameAction(
        'weed',
        (miniGameScore) => weedFarmPlant({ ...request, miniGameScore }),
        gameOptions,
      );
      if (result) {
        if (result.toolDurability) applyToolDurability(result.toolDurability);
        emitToast(`Растение прополото · точность ${result.miniGameScore}%. Грабли −${FARM_TOOL_DURABILITY_COST} прочности. Теперь полейте его водой 💧`, 'success');
      }
      return;
    }
    if (next.action === 'water') {
      // Не делаем отдельную проверку water_status перед мини-игрой.
      // Источник истины — серверная farm_water_plot: именно она проверяет и
      // расходует техническую воду, которую игрок набрал из башни.
      // Старый water_status мог видеть устаревший/неполный снимок inventory и
      // ложно блокировал полив сразу после успешного набора воды.
      const result = await runMiniGameAction(
        'water',
        (miniGameScore) => waterFarmPlant({ ...request, miniGameScore }),
        gameOptions,
      );
      if (result) {
        const remainingUses = Math.max(0, Math.floor(Number(result.waterUsesRemaining ?? result.waterUses ?? 0)));
        emitToast(`Растение полито водой из башни · точность ${result.miniGameScore}% · осталось поливов: ${remainingUses}. Теперь соберите урожай ✂️`, 'success');
        // Technical water is stored by farm-business, not by the legacy farm inventory.
        // Refresh immediately so the inventory shows the remaining virtual water item.
        void refreshInventory({ silent: true });
      }
      return;
    }
    if (next.action === 'harvest') {
      if (!ensureToolReady('farm_scissors')) return;
      const result = await runMiniGameAction(
        'harvest',
        (miniGameScore) => harvestFarmPlant({ ...request, miniGameScore }),
        gameOptions,
      );
      if (result) {
        if (result.toolDurability) applyToolDurability(result.toolDurability);
        if (result.skills) publishPlayerSkills(result, { levelUps: result.levelUps });
        const harvested = FARM_ITEMS[result.harvestedItemType] || FARM_ITEMS[next.plant.harvestItemType];
        const quantity = Math.max(1, Number(result.harvestQuantity) || 1);
        const quality = Number(result.harvestQuality ?? result.miniGameScore) || 0;
        const item = `${harvested?.icon || next.plant.icon} ${harvested?.label || next.plant.label} ×${quantity}`;
        if (result.plotIncome?.credited && businessState?.businessId === businessId) {
          businessState.cashBalance = Number(result.plotIncome.cashBalance ?? businessState.cashBalance ?? 0);
          businessState.plotIncomeTotal = Number(businessState.plotIncomeTotal || 0) + Number(result.plotIncome.amount || FARM_PLOT_INCOME);
          renderBusiness();
        }
        emitToast(`${item} · качество ${quality}%. Ножницы −${FARM_TOOL_DURABILITY_COST} прочности · ферме +${result.plotIncome?.credited ? Number(result.plotIncome.amount || FARM_PLOT_INCOME) : 0} ₴. Новый урожай через ${formatRemaining(result.respawnSeconds || next.plant.respawnSeconds)}.`, 'success');
      }
    }
  }

  async function handleBuy(event) {
    const button = event.target?.closest?.('[data-farm-buy]');
    if (!button || busy || !activeBuyerObjectId || performance.now() < scrollClickBlockedUntil) return;
    const itemType = String(button.dataset.farmBuy || '');
    busy = true;
    renderInventory();
    setStatus('Покупаем инструмент…');
    try {
      const result = await buyFarmBusinessTool({ businessId: activeBuyerObjectId, cityId, itemType });
      if (result?.inventory) publishInventory(result.inventory);
      if (result?.business) publishBusiness(result.business);
      const durability = Number(result?.business?.playerTools?.find?.((row) => String(row.itemType || row.item_type) === itemType)?.durability ?? FARM_TOOL_DURABILITY_MAX);
      setStatus(result?.migrated ? `${FARM_ITEMS[itemType]?.label || 'Инструмент'} активирован · прочность ${durability}/100.` : `${FARM_ITEMS[itemType]?.label || 'Инструмент'} куплен · прочность 100/100.`, 'success');
    } catch (error) {
      setStatus(getFarmUserErrorMessage(error), 'error');
    } finally {
      busy = false;
      renderInventory();
    }
  }

  async function handleSell(event) {
    const button = event.target?.closest?.('[data-farm-sell]');
    if (!button || busy || performance.now() < scrollClickBlockedUntil) return;
    const itemType = String(button.dataset.farmSell || '');
    const quantity = Math.max(0, Math.floor(Number(button.dataset.quantity) || 0));
    busy = true;
    renderInventory();
    setStatus('Продаём урожай…');
    try {
      const result = await sellFarmItem({
        cityId,
        buyerObjectId: activeBuyerObjectId,
        itemType,
        quantity,
      });
      if (result?.inventory || Array.isArray(result?.items)) publishInventory(result);
      else void refreshInventory({ silent: true });
      if (result?.market) publishMarket(result.market);
      else void refreshMarket({ silent: true });
      if (result?.business) publishBusiness(result.business);
      setStatus(
        `Продано ${result.soldQuantity || 0} шт. по ${Number(result.unitPrice || 0)} ₴ · +${Number(result.totalPrice || 0).toLocaleString('ru-RU')} ₴. Выплата списана с баланса фермы.`,
        'success',
      );
    } catch (error) {
      setStatus(getFarmUserErrorMessage(error), 'error');
    } finally {
      busy = false;
      renderInventory();
    }
  }

  async function handleTowerInteraction(object) {
    if (busy) return;
    const businessId = getFarmBusinessId(object);
    if (!businessId) {
      emitToast('Эта водонапорная башня не привязана к ферме. Укажите ID бизнеса в админке.', 'error');
      return;
    }
    busy = true;
    armFreeTowerWaterBalanceGuard();
    try {
      const result = await interactFarmWaterTower({
        businessId,
        cityId,
        towerObjectId: String(object?.id || ''),
      });
      // farm-business now keeps irrigation water in its own authoritative state.
      // Reload through loadFarmInventory() so the virtual technical-water item appears
      // immediately and stale legacy farm_water_bottle rows are ignored.
      const freshInventory = await loadFarmInventory();
      publishInventory(freshInventory);
      if (result?.business && activeBuyerObjectId === businessId) publishBusiness(result.business);
      if (result?.mode === 'poured') {
        emitToast(`В башню вылито ${Number(result.pouredLiters || 0).toLocaleString('ru-RU')} л 💧 · теперь ${Number(result?.business?.towerWaterLiters ?? result?.towerWaterLiters ?? 0).toLocaleString('ru-RU')} / ${FARM_TOWER_CAPACITY_LITERS} л.`, 'success');
      } else {
        emitToast(`Набран 1 л воды для полива 💧 · в башне осталось ${Number(result?.business?.towerWaterLiters ?? result?.towerWaterLiters ?? 0).toLocaleString('ru-RU')} л.`, 'success');
      }
    } catch (error) {
      emitToast(getFarmUserErrorMessage(error), 'error');
    } finally {
      finishFreeTowerWaterBalanceGuardSoon();
      busy = false;
      renderInventory();
    }
  }

  async function handleFillBucketAtBarrel(object) {
    if (busy) return;
    const businessId = getFarmBusinessId(object);
    if (!businessId) {
      emitToast('Эта бочка не привязана к ферме. Укажите ID бизнеса в админке.', 'error');
      return;
    }
    busy = true;
    try {
      const result = await fillFarmBucketFromBarrel({ businessId, cityId, barrelObjectId: String(object?.id || '') });
      if (result?.business && activeBuyerObjectId === businessId) publishBusiness(result.business);
      emitToast(`В ведра набрано +${Number(result.filledLiters || 0).toLocaleString('ru-RU')} л 💧 · у вас ${Number(result.waterLiters || 0).toLocaleString('ru-RU')} / ${Number(result.capacityLiters || 0).toLocaleString('ru-RU')} л.`, 'success');
    } catch (error) {
      emitToast(getFarmUserErrorMessage(error), 'error');
    } finally {
      busy = false;
      renderInventory();
    }
  }

  async function runBusinessAction(label, action) {
    if (busy || !activeBuyerObjectId) return;
    busy = true;
    renderInventory();
    setStatus(label);
    try {
      const result = await action();
      const snapshot = result?.business || (
        result?.warehouse || result?.cashBalance !== undefined || result?.ownerTgId !== undefined
          ? result
          : null
      );
      if (snapshot) publishBusiness(snapshot);
      setStatus('Готово.', 'success');
      return result;
    } catch (error) {
      setStatus(getFarmUserErrorMessage(error), 'error');
      return null;
    } finally {
      busy = false;
      renderInventory();
    }
  }

  async function handleBusinessControls(event) {
    if (performance.now() < scrollClickBlockedUntil) return;
    const purchase = event.target?.closest?.('[data-farm-business-purchase]');
    if (purchase) {
      await runBusinessAction('Оформляем покупку фермерского ООО…', () => purchaseFarmBusiness({ businessId: activeBuyerObjectId, cityId }));
      return;
    }

    const deposit = event.target?.closest?.('[data-farm-deposit]');
    const withdraw = event.target?.closest?.('[data-farm-withdraw]');
    const withdrawAll = event.target?.closest?.('[data-farm-withdraw-all]');
    if (deposit || withdraw || withdrawAll) {
      const amount = deposit
        ? Math.max(0, Math.floor(Number(modal?.querySelector('[data-farm-deposit-amount]')?.value) || 0))
        : withdrawAll
          ? Math.max(0, Math.floor(Number(businessState?.cashBalance) || 0))
          : Math.max(0, Math.floor(Number(modal?.querySelector('[data-farm-withdraw-amount]')?.value) || 0));
      const fn = deposit ? depositFarmBusiness : withdrawFarmBusiness;
      const result = await runBusinessAction(
        deposit ? 'Пополняем баланс предприятия…' : 'Переводим прибыль владельцу…',
        () => fn({ businessId: activeBuyerObjectId, cityId, amount }),
      );
      if (result) {
        const input = modal?.querySelector(deposit ? '[data-farm-deposit-amount]' : '[data-farm-withdraw-amount]');
        if (input) input.value = '';
      }
      return;
    }

    const assistantSave = event.target?.closest?.('[data-farm-assistant-save]');
    const assistantClear = event.target?.closest?.('[data-farm-assistant-clear]');
    if (assistantSave || assistantClear) {
      const target = assistantClear ? '' : String(modal?.querySelector('[data-farm-assistant-target]')?.value || '').trim();
      const result = await runBusinessAction(assistantClear ? 'Снимаем помощника…' : 'Назначаем помощника…', () => setFarmBusinessAssistant({ businessId: activeBuyerObjectId, cityId, target }));
      if (result && modal?.querySelector('[data-farm-assistant-target]')) modal.querySelector('[data-farm-assistant-target]').value = '';
      return;
    }

    const cropWithdraw = event.target?.closest?.('[data-farm-crop-withdraw]');
    if (cropWithdraw) {
      const itemType = String(modal?.querySelector('[data-farm-crop-withdraw-type]')?.value || '');
      const quantityInput = modal?.querySelector('[data-farm-crop-withdraw-quantity]');
      const quantity = Math.max(0, Math.floor(Number(quantityInput?.value) || 0));
      const result = await runBusinessAction(
        'Передаём урожай владельцу…',
        () => withdrawFarmBusinessCrop({ businessId: activeBuyerObjectId, cityId, itemType, quantity }),
      );
      if (result) {
        if (quantityInput) quantityInput.value = '1';
        await Promise.all([
          refreshBusiness({ silent: true }),
          refreshInventory({ silent: true }),
        ]);
        emitToast(`Со склада снято ${quantity} ед. урожая.`, 'success');
      }
      return;
    }

    const takeBucket = event.target?.closest?.('[data-farm-take-bucket]');
    if (takeBucket) {
      await runBusinessAction('Берём ведро со склада…', () => takeFarmBusinessBucket({ businessId: activeBuyerObjectId, cityId, quantity: 1 }));
      return;
    }

    const adminSeedBuckets = event.target?.closest?.('[data-farm-admin-seed-buckets]');
    if (adminSeedBuckets) {
      await runBusinessAction('Добавляем тестовые ведра на склад…', () => adminSeedFarmBusinessBuckets({ businessId: activeBuyerObjectId, cityId, quantity: 10 }));
      return;
    }

    const order = event.target?.closest?.('[data-farm-order]');
    if (order) {
      const supplyType = String(order.dataset.farmOrder || '');
      const quantity = Math.max(0, Number(modal?.querySelector(`[data-farm-order-quantity="${supplyType}"]`)?.value) || 0);
      await runBusinessAction('Оформляем поставку…', () => orderFarmBusinessSupply({ businessId: activeBuyerObjectId, cityId, supplyType, quantity }));
      return;
    }

    const priceSave = event.target?.closest?.('[data-farm-price-save]');
    if (priceSave) {
      const itemType = String(priceSave.dataset.farmPriceSave || '');
      const price = Math.max(0, Math.floor(Number(modal?.querySelector(`[data-farm-price-input="${itemType}"]`)?.value) || 0));
      await runBusinessAction('Сохраняем розничную цену…', () => setFarmBusinessToolPrice({ businessId: activeBuyerObjectId, cityId, itemType, price }));
    }
  }

  function handleFarmObjectEvent(event) {
    const object = event?.detail?.object;
    const type = String(object?.type || object?.payload?.jobType || '');
    if (type === 'farm_station') {
      openModal(object);
    } else if (type === 'farm_water_tower') {
      void handleTowerInteraction(object);
    } else if (type === 'farm_water_barrel') {
      void handleFillBucketAtBarrel(object);
    } else if (isFarmPlantObject(object)) {
      void workWithPlant(object);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && modal?.hidden === false) closeModal();
  }

  tabButtons.forEach((button) => button.addEventListener('click', () => setTab(button.dataset.farmTab)));
  tabPages.forEach((page) => {
    page.addEventListener('touchstart', handleScrollTouchStart, { passive: true });
    page.addEventListener('touchmove', handleScrollTouchMove, { passive: false });
    page.addEventListener('touchend', handleScrollTouchEnd, { passive: true });
    page.addEventListener('touchcancel', handleScrollTouchEnd, { passive: true });
  });
  modal?.querySelectorAll('[data-farm-close]').forEach((button) => button.addEventListener('click', closeModal));
  panel?.addEventListener('click', handleBuy);
  panel?.addEventListener('click', handleSell);
  panel?.addEventListener('click', handleBusinessControls);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('mn:farm-object-action', handleFarmObjectEvent);
  window.addEventListener('mn:player-skills-changed', renderInventory);
  window.addEventListener('mn:job-stream-window-changed', handleJobStreamWindow);
  marketCountdownTimer = window.setInterval(renderMarketCountdown, 1000);
  handleJobStreamWindow({
    detail: {
      cityId,
      objects: window.__MN_ACTIVE_JOB_OBJECTS_BY_CITY__?.[String(cityId)] || [],
    },
  });

  return () => {
    destroyed = true;
    stopFarmStreamLoading();
    window.clearInterval(marketCountdownTimer);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('mn:farm-object-action', handleFarmObjectEvent);
    window.removeEventListener('mn:player-skills-changed', renderInventory);
    window.removeEventListener('mn:job-stream-window-changed', handleJobStreamWindow);
    tabPages.forEach((page) => {
      page.removeEventListener('touchstart', handleScrollTouchStart);
      page.removeEventListener('touchmove', handleScrollTouchMove);
      page.removeEventListener('touchend', handleScrollTouchEnd);
      page.removeEventListener('touchcancel', handleScrollTouchEnd);
    });
    document.body.classList.remove('mn-farm-modal-open');
    modal?.remove();
    cancelFarmMiniGame();
    delete window.__MN_FARM_PLANT_STATES__;
    window.__MN_FARM_PLANT_STATES_READY__ = false;
  };
}


