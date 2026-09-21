import { state } from '../state.js';
import { addRunningSkillXp, loadPlayerSkills } from '../farm/farmApi.js';
import { loadMineSkills } from '../mine/mineApi.js';
import { loadLumberSkills } from '../lumber/lumberApi.js';
import { fetchPlayerOwnedHouses } from '../houses/housesRepository.js';
import { fetchPlayerOwnedBusinesses } from '../business/businessRepository.js';
import { getCityConfig } from '../cities/index.js';
import { getSubstationError, loadElectricityBills, payElectricityBill } from '../energySubstation/energySubstationApi.js';
import { answerWaterOffer, getWaterError, loadWaterUtility, payWaterBill } from '../waterTreatment/waterTreatmentApi.js';
import { getPlayerSkillsSnapshot, publishPlayerSkills } from './playerSkillState.js';
import './playerSkills.css';

const RUNNING_XP_BATCH = 10;
const RUNNING_XP_FLUSH_MS = 8000;
const MIN_UTILITY_PAYMENT = 10;

function money(value) {
  return `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU')} ₴`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function progressPercent(skill = {}) {
  const maxLevel = Math.max(1, Number(skill.maxLevel) || 5);
  if (Number(skill.level) >= maxLevel || skill.nextLevelXp == null) return 100;
  const start = Math.max(0, Number(skill.levelStartXp) || 0);
  const next = Math.max(start + 1, Number(skill.nextLevelXp) || start + 1);
  return Math.max(0, Math.min(100, ((Number(skill.xp) - start) / (next - start)) * 100));
}

function progressCaption(skill = {}) {
  const maxLevel = Math.max(1, Number(skill.maxLevel) || 5);
  if (Number(skill.level) >= maxLevel || skill.nextLevelXp == null) return 'Максимальный уровень';
  const start = Math.max(0, Number(skill.levelStartXp) || 0);
  const next = Math.max(start + 1, Number(skill.nextLevelXp) || start + 1);
  return `${Math.max(0, Number(skill.xp) - start).toLocaleString('ru-RU')} / ${(next - start).toLocaleString('ru-RU')} XP`;
}

function levelDots(level, maxLevel = 5) {
  return Array.from({ length: Math.max(1, Number(maxLevel) || 5) }, (_, index) => (
    `<i data-filled="${index < Number(level) ? 'true' : 'false'}"></i>`
  )).join('');
}

function skillCard(skill, extra = '') {
  const maxLevel = Math.max(1, Number(skill.maxLevel) || 5);
  return `
    <article class="mn-skill-card">
      <div class="mn-skill-icon" aria-hidden="true">${escapeHtml(skill.icon || '✦')}</div>
      <div class="mn-skill-main">
        <header><strong>${escapeHtml(skill.label)}</strong><span>Уровень ${Number(skill.level) || 1}/${maxLevel}</span></header>
        <div class="mn-skill-level-dots" aria-hidden="true">${levelDots(skill.level, maxLevel)}</div>
        <div class="mn-skill-progress"><i style="width:${progressPercent(skill).toFixed(2)}%"></i></div>
        <footer><small>${progressCaption(skill)}</small>${extra}</footer>
      </div>
    </article>`;
}

function profileMarkup() {
  return `
    <div class="mn-player-profile-modal" data-player-profile-modal hidden aria-hidden="true">
      <button class="mn-player-profile-backdrop" type="button" data-profile-close aria-label="Закрыть"></button>
      <section class="mn-player-profile-panel" role="dialog" aria-modal="true" aria-labelledby="mn-profile-title">
        <header class="mn-profile-header">
          <span><small>Игрок</small><strong id="mn-profile-title" data-profile-title>Профиль</strong></span>
          <button type="button" data-profile-close aria-label="Закрыть">×</button>
        </header>

        <div class="mn-profile-page" data-profile-page="overview">
          <div class="mn-profile-identity">
            <i data-profile-avatar>И</i>
            <span><strong data-profile-nickname>Игрок</strong><small data-profile-id>ID: —</small></span>
          </div>
          <div class="mn-profile-stats">
            <article><i>₴</i><span><small>На руках</small><strong data-profile-balance>0 ₴</strong></span></article>
            <article><i>★</i><span><small>Уровень игрока</small><strong data-profile-level>1</strong></span></article>
          </div>
          <p class="mn-profile-level-note">Общий уровень уже подключён к профилю. Полную систему прогресса добавим следующим этапом.</p>
          <button class="mn-profile-skills-button" type="button" data-profile-open-skills>
            <span><i>✦</i><b>Навыки</b><small>Профессии, ресурсы и физическая форма</small></span><strong>Открыть ›</strong>
          </button>
          <button class="mn-profile-skills-button mn-profile-property-button" type="button" data-profile-open-property>
            <span><i>⌂</i><b>Дома и бизнесы</b><small>Вся собственность, включая другие города</small></span><strong>Открыть ›</strong>
          </button>
          <button class="mn-profile-skills-button mn-profile-utility-button" type="button" data-profile-open-utility>
            <span><i>⚡💧</i><b>Коммунальные услуги</b><small>Электричество, вода, договоры и ручная оплата</small></span><strong>Открыть ›</strong>
          </button>
        </div>

        <div class="mn-profile-page" data-profile-page="skills" hidden>
          <button class="mn-profile-back" type="button" data-profile-back>‹ Назад в профиль</button>
          <div class="mn-skills-content" data-skills-content>
            <div class="mn-skills-loading">Загружаем навыки…</div>
          </div>
        </div>

        <div class="mn-profile-page" data-profile-page="property" hidden>
          <button class="mn-profile-back" type="button" data-profile-back>‹ Назад в профиль</button>
          <div class="mn-profile-property-content" data-profile-property-content>
            <div class="mn-skills-loading">Загружаем собственность…</div>
          </div>
        </div>

        <div class="mn-profile-page" data-profile-page="utility" hidden>
          <button class="mn-profile-back" type="button" data-profile-back>‹ Назад в профиль</button>
          <div class="mn-profile-utility-content" data-profile-utility-content>
            <div class="mn-skills-loading">Загружаем коммунальные счета…</div>
          </div>
        </div>
      </section>
    </div>`;
}

function showLevelToast(detail = {}) {
  document.querySelectorAll('.mn-skill-level-toast').forEach((element) => element.remove());
  const toast = document.createElement('div');
  toast.className = 'mn-skill-level-toast';
  toast.innerHTML = `
    <i>${escapeHtml(detail.icon || '🏆')}</i>
    <span><small>Новый уровень</small><strong>${escapeHtml(detail.message || `Навык повышен до ${detail.level} уровня!`)}</strong></span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.dataset.visible = 'true'; });
  window.setTimeout(() => {
    toast.dataset.visible = 'false';
    window.setTimeout(() => toast.remove(), 350);
  }, 6500);
}

export function enablePlayerSkillsFeature({ root } = {}) {
  if (!root) return () => {};

  document.querySelector('[data-player-profile-modal]')?.remove();
  document.body.insertAdjacentHTML('beforeend', profileMarkup());

  const modal = document.querySelector('[data-player-profile-modal]');
  const profileButton = root.querySelector('.player-profile-card');
  const content = modal?.querySelector('[data-skills-content]');
  const skillsPage = modal?.querySelector('[data-profile-page="skills"]');
  const propertyPage = modal?.querySelector('[data-profile-page="property"]');
  const propertyContent = modal?.querySelector('[data-profile-property-content]');
  const utilityPage = modal?.querySelector('[data-profile-page="utility"]');
  const utilityContent = modal?.querySelector('[data-profile-utility-content]');
  let destroyed = false;
  let loadPromise = null;
  let runningXpPending = 0;
  let runningXpInFlight = false;
  let flushTimer = 0;
  let skillsTouch = null;
  let propertyLoadPromise = null;
  let propertySnapshot = { houses: [], businesses: [] };
  let utilitySnapshot = {
    electricity: { bills: [], totalDue: 0 },
    water: { offers: [], bills: [], totalDue: 0 },
    waterError: '',
  };
  let utilityLoading = false;
  let utilityTimer = 0;

  function utilityMoney(value) {
    return `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`;
  }

  function renderUtility() {
    if (!utilityContent) return;
    const electricity = utilitySnapshot.electricity || { bills: [], totalDue: 0 };
    const water = utilitySnapshot.water || { offers: [], bills: [], totalDue: 0 };
    const electricityBills = Array.isArray(electricity.bills) ? electricity.bills : [];
    const waterOffers = Array.isArray(water.offers) ? water.offers : [];
    const waterBills = Array.isArray(water.bills) ? water.bills : [];
    const totalDue = Math.max(0, Number(electricity.totalDue) || 0) + Math.max(0, Number(water.totalDue) || 0);
    utilityContent.innerHTML = `
      <section class="mn-profile-utility-summary">
        <span><small>ОБЩАЯ ЗАДОЛЖЕННОСТЬ</small><strong>${utilityMoney(totalDue)}</strong></span>
        <i>⚡💧</i>
      </section>
      <p class="mn-profile-utility-note">Автоматических списаний нет. Электричество и вода оплачиваются только после вашего нажатия. Минимальная сумма каждого счёта — ${utilityMoney(MIN_UTILITY_PAYMENT)}.</p>
      ${waterOffers.length ? `<section class="mn-profile-utility-section mn-profile-water-offers">
        <header><span><small>НОВЫЕ ДОГОВОРЫ</small><strong>Предложения водоснабжения</strong></span><b>${waterOffers.length}</b></header>
        <div class="mn-profile-utility-list">${waterOffers.map((offer) => `<article class="mn-profile-water-offer">
          <header><span><small>${escapeHtml(offer.houseName || 'Дом')}</small><strong>${escapeHtml(offer.plantName || 'Водоочистное сооружение')}</strong></span><b>💧 Оферта</b></header>
          <div><span><small>Подключение</small><b>${utilityMoney(offer.connectionFee)}</b></span><span><small>Тариф владельца</small><b>${utilityMoney(offer.unitPrice)} / л</b></span></div>
          <footer><button type="button" data-profile-water-answer="${escapeHtml(offer.id)}" data-accept="false">Отклонить</button><button type="button" data-profile-water-answer="${escapeHtml(offer.id)}" data-accept="true">Принять за ${utilityMoney(offer.connectionFee)}</button></footer>
        </article>`).join('')}</div>
      </section>` : ''}
      <section class="mn-profile-utility-section">
        <header><span><small>ЭЛЕКТРИЧЕСТВО</small><strong>Счета домов</strong></span><b>⚡</b></header>
      <div class="mn-profile-utility-list">
        ${electricityBills.length ? electricityBills.map((bill) => {
          const due = Math.max(0, Number(bill.amountDue) || 0);
          const canPay = Math.round(due * 100) >= MIN_UTILITY_PAYMENT * 100;
          return `<article>
            <header><span><small>${escapeHtml(bill.houseName || 'Дом')}</small><strong>${escapeHtml(bill.substationName || 'Подстанция')}</strong></span><b>${bill.powerActive ? '⚡ Свет поступает' : '⛔ Свет не поступает'}</b></header>
            <div><span><small>Потреблено</small><b>${Math.max(0, Number(bill.totalKwh) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} кВт·ч</b></span><span><small>Тариф</small><b>${utilityMoney(bill.retailPrice)} / кВт·ч</b></span><span><small>Уже оплачено</small><b>${utilityMoney(bill.totalPaid)}</b></span><span><small>К оплате</small><b>${utilityMoney(due)}</b></span></div>
            <button type="button" data-profile-utility-pay="${escapeHtml(bill.id)}" ${canPay ? '' : 'disabled'}>${due < 0.01 ? 'Задолженности нет' : canPay ? `Оплатить ${utilityMoney(due)}` : `Оплата доступна от ${utilityMoney(MIN_UTILITY_PAYMENT)}`}</button>
          </article>`;
        }).join('') : '<div class="mn-profile-property-empty"><i>⚡</i><span><strong>Счетов за электричество пока нет</strong><small>Они появятся после подключения дома к подстанции.</small></span></div>'}
      </div></section>
      <section class="mn-profile-utility-section">
        <header><span><small>ВОДОСНАБЖЕНИЕ</small><strong>Счета домов</strong></span><b>💧</b></header>
        ${utilitySnapshot.waterError ? `<p class="mn-profile-utility-service-error">${escapeHtml(utilitySnapshot.waterError)}</p>` : ''}
        <div class="mn-profile-utility-list">
          ${waterBills.length ? waterBills.map((bill) => {
            const due = Math.max(0, Number(bill.amountDue) || 0);
            const canPay = Math.round(due * 100) >= MIN_UTILITY_PAYMENT * 100;
            return `<article class="mn-profile-water-bill">
              <header><span><small>${escapeHtml(bill.houseName || 'Дом')}</small><strong>${escapeHtml(bill.plantName || 'Водоочистное сооружение')}</strong></span><b>${bill.waterActive ? '💧 Вода поступает' : '⛔ Подача остановлена'}</b></header>
              <div><span><small>Израсходовано</small><b>${Math.max(0, Number(bill.totalLiters) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} л</b></span><span><small>Расход дома</small><b>${Math.max(0, Number(bill.dailyLiters) || 0).toLocaleString('ru-RU')} л/сутки</b></span><span><small>Тариф</small><b>${utilityMoney(bill.unitPrice)} / л</b></span><span><small>К оплате</small><b>${utilityMoney(due)}</b></span></div>
              <button type="button" data-profile-water-pay="${escapeHtml(bill.id)}" ${canPay ? '' : 'disabled'}>${due < 0.01 ? 'Задолженности нет' : canPay ? `Оплатить ${utilityMoney(due)}` : `Оплата доступна от ${utilityMoney(MIN_UTILITY_PAYMENT)}`}</button>
            </article>`;
          }).join('') : '<div class="mn-profile-property-empty"><i>💧</i><span><strong>Счетов за воду пока нет</strong><small>Примите предложение предприятия, чтобы подключить дом.</small></span></div>'}
        </div>
      </section>`;
  }

  async function refreshUtility() {
    if (utilityLoading || destroyed || utilityPage?.hidden !== false) return;
    utilityLoading = true;
    try {
      const [electricityResult, waterResult] = await Promise.allSettled([
        loadElectricityBills(),
        loadWaterUtility(),
      ]);
      if (electricityResult.status === 'rejected' && waterResult.status === 'rejected') throw electricityResult.reason;
      utilitySnapshot = {
        electricity: electricityResult.status === 'fulfilled' ? electricityResult.value : { bills: [], totalDue: 0 },
        water: waterResult.status === 'fulfilled' ? waterResult.value : { offers: [], bills: [], totalDue: 0 },
        waterError: waterResult.status === 'rejected' ? getWaterError(waterResult.reason) : '',
      };
      if (!destroyed) renderUtility();
    } catch (error) {
      if (utilityContent) utilityContent.innerHTML = `<div class="mn-skills-loading is-error">${escapeHtml(getSubstationError(error))}</div>`;
    } finally {
      utilityLoading = false;
    }
  }

  async function handleUtilityClick(event) {
    const waterAnswerButton = event.target?.closest?.('[data-profile-water-answer]');
    const waterPayButton = event.target?.closest?.('[data-profile-water-pay]');
    const button = waterAnswerButton || waterPayButton || event.target?.closest?.('[data-profile-utility-pay]');
    if (!button || utilityLoading) return;
    event.preventDefault();

    if (waterAnswerButton) {
      const contractId = String(button.dataset.profileWaterAnswer || '');
      const accepted = button.dataset.accept === 'true';
      utilityLoading = true;
      button.disabled = true;
      if (accepted) window.dispatchEvent(new CustomEvent('mn:balance-sync-lock', { detail: { durationMs: 8000 } }));
      try {
        const result = await answerWaterOffer(contractId, accepted);
        const balance = Number(result?.playerBalance);
        utilitySnapshot.water = result;
        utilitySnapshot.waterError = '';
        if (Number.isFinite(balance)) window.dispatchEvent(new CustomEvent('mn:player-balance-changed', { detail: { balance, delta: accepted ? -1000 : undefined, source: 'water_connection' } }));
        renderUtility();
        window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message: accepted ? 'Водоснабжение подключено. Списано 1 000 ₴.' : 'Предложение водоснабжения отклонено.', type: 'success' } }));
      } catch (error) {
        window.dispatchEvent(new CustomEvent('mn:balance-sync-lock', { detail: { cancel: true } }));
        window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message: getWaterError(error), type: 'error' } }));
      } finally {
        utilityLoading = false;
        void refreshUtility();
      }
      return;
    }

    if (waterPayButton) {
      const contractId = String(button.dataset.profileWaterPay || '');
      const bill = (utilitySnapshot.water?.bills || []).find((item) => String(item.id) === contractId);
      const displayedAmount = Math.round(Math.max(0, Number(bill?.amountDue) || 0) * 100) / 100;
      if (displayedAmount < MIN_UTILITY_PAYMENT) {
        window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message: `Оплатить счёт за воду можно после накопления ${utilityMoney(MIN_UTILITY_PAYMENT)}.`, type: 'error' } }));
        renderUtility();
        return;
      }
      utilityLoading = true;
      button.disabled = true;
      window.dispatchEvent(new CustomEvent('mn:balance-sync-lock', { detail: { durationMs: 8000 } }));
      try {
        const result = await payWaterBill(contractId, displayedAmount);
        const balance = Number(result?.playerBalance);
        const paidAmount = Math.round(Math.max(0, Number(result?.paidAmount) || 0) * 100) / 100;
        utilitySnapshot.water = result;
        if (Number.isFinite(balance)) window.dispatchEvent(new CustomEvent('mn:player-balance-changed', { detail: { balance, delta: paidAmount > 0 ? -paidAmount : undefined, source: 'water_bill_payment' } }));
        renderUtility();
        window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message: 'Счёт за воду оплачен.', type: 'success' } }));
      } catch (error) {
        window.dispatchEvent(new CustomEvent('mn:balance-sync-lock', { detail: { cancel: true } }));
        window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message: getWaterError(error), type: 'error' } }));
      } finally {
        utilityLoading = false;
        void refreshUtility();
      }
      return;
    }

    const contractId = String(button.dataset.profileUtilityPay || '');
    const billBeforePayment = (utilitySnapshot.electricity?.bills || []).find((bill) => String(bill.id) === contractId);
    const displayedAmount = Math.round(Math.max(0, Number(billBeforePayment?.amountDue) || 0) * 100) / 100;
    if (displayedAmount < MIN_UTILITY_PAYMENT) {
      window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message: `Оплатить коммунальный счёт можно после накопления ${utilityMoney(MIN_UTILITY_PAYMENT)}.`, type: 'error' } }));
      renderUtility();
      return;
    }
    utilityLoading = true;
    button.disabled = true;
    window.dispatchEvent(new CustomEvent('mn:balance-sync-lock', { detail: { durationMs: 8000 } }));
    try {
      const result = await payElectricityBill(contractId, displayedAmount);
      utilitySnapshot.electricity = result;
      const balance = Number(result?.playerBalance);
      const paidAmount = Math.round(Math.max(0, Number(result?.paidAmount) || 0) * 100) / 100;
      if (Number.isFinite(balance)) window.dispatchEvent(new CustomEvent('mn:player-balance-changed', { detail: { balance, delta: paidAmount > 0 ? -paidAmount : undefined, source: 'electricity_bill_payment' } }));
      renderUtility();
      window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message: 'Коммунальный счёт оплачен.', type: 'success' } }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('mn:balance-sync-lock', { detail: { cancel: true } }));
      window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message: getSubstationError(error), type: 'error' } }));
    } finally {
      utilityLoading = false;
      void refreshUtility();
    }
  }

  function propertyCityName(item = {}) {
    const payload = item.payload || {};
    const cityId = String(item.cityId || item.city_id || payload.cityId || payload.city_id || '').trim();
    return cityId ? (getCityConfig(cityId)?.name || cityId) : 'Город не указан';
  }

  function renderPropertyList(items = [], type = 'house') {
    if (!items.length) {
      return `<div class="mn-profile-property-empty"><i>${type === 'house' ? '🏠' : '🛒'}</i><span><strong>${type === 'house' ? 'Домов пока нет' : 'Бизнесов пока нет'}</strong><small>Покупать имущество можно в любом городе.</small></span></div>`;
    }
    return items.map((item) => {
      const payload = item.payload || {};
      const id = String(item.mapObjectId || item.id || '').replaceAll('-', '').slice(-6).toUpperCase() || '—';
      const name = type === 'house'
        ? `${item.icon || '🏠'} Дом № ${id}`
        : `${item.icon || '🛒'} ${item.name || payload.businessLabel || 'Продуктовый магазин'}`;
      const detail = type === 'house'
        ? (payload.houseClassLabel || payload.houseClass || item.class || 'Стандарт')
        : 'Продуктовый бизнес';
      return `<article class="mn-profile-property-card" data-property-type="${type}"><i>${type === 'house' ? '🏠' : '🛒'}</i><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(propertyCityName(item))} · ${escapeHtml(detail)}</small></span><b>${escapeHtml(id)}</b></article>`;
    }).join('');
  }

  function renderProperty() {
    if (!propertyContent) return;
    const houses = propertySnapshot.houses || [];
    const businesses = propertySnapshot.businesses || [];
    propertyContent.innerHTML = `
      <section class="mn-profile-property-section">
        <header><span><small>Недвижимость</small><strong>Дома</strong></span><b>${houses.length}</b></header>
        <div>${renderPropertyList(houses, 'house')}</div>
      </section>
      <section class="mn-profile-property-section is-business">
        <header><span><small>Коммерческая собственность</small><strong>Бизнесы</strong></span><b>${businesses.length}</b></header>
        <div>${renderPropertyList(businesses, 'business')}</div>
      </section>`;
  }

  async function refreshProperty() {
    if (propertyLoadPromise) return propertyLoadPromise;
    const playerId = String(state.telegramId || state.player?.tg_id || '').trim();
    if (!playerId) return null;
    propertyLoadPromise = (async () => {
      const [housesResult, businessesResult] = await Promise.allSettled([
        fetchPlayerOwnedHouses({ playerId }),
        fetchPlayerOwnedBusinesses({ playerId }),
      ]);
      if (!destroyed) {
        propertySnapshot = {
          houses: housesResult.status === 'fulfilled' ? housesResult.value : [],
          businesses: businessesResult.status === 'fulfilled' ? businessesResult.value : [],
        };
        renderProperty();
      }
      propertyLoadPromise = null;
      return propertySnapshot;
    })();
    return propertyLoadPromise;
  }

  function usesForcedMobileRotation() {
    return Boolean(
      window.matchMedia?.('(orientation: portrait)')?.matches &&
      (
        document.documentElement.classList.contains('mn-force-rotate-landscape') ||
        document.body.classList.contains('mn-force-rotate-landscape')
      )
    );
  }

  function handleSkillsTouchStart(event) {
    if (!skillsPage || skillsPage.hidden || !usesForcedMobileRotation() || event.touches.length !== 1) {
      skillsTouch = null;
      return;
    }

    const touch = event.touches[0];
    skillsTouch = {
      identifier: touch.identifier,
      clientX: touch.clientX,
      clientY: touch.clientY,
      scrollTop: skillsPage.scrollTop,
    };
  }

  function handleSkillsTouchMove(event) {
    if (!skillsPage || !skillsTouch) return;
    const touch = Array.from(event.touches).find((item) => item.identifier === skillsTouch.identifier);
    if (!touch) return;

    const deltaX = touch.clientX - skillsTouch.clientX;
    const deltaY = touch.clientY - skillsTouch.clientY;
    const scrollDelta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : -deltaY;
    if (Math.abs(scrollDelta) < 3) return;

    const maximum = Math.max(0, skillsPage.scrollHeight - skillsPage.clientHeight);
    skillsPage.scrollTop = Math.max(0, Math.min(maximum, skillsTouch.scrollTop + scrollDelta));
    event.preventDefault();
  }

  function handleSkillsTouchEnd() {
    skillsTouch = null;
  }

  function renderOverview() {
    const snapshot = getPlayerSkillsSnapshot();
    const nickname = String(state.nickname || state.player?.nickname || 'Игрок');
    const telegramId = String(state.telegramId || state.player?.tg_id || '—');
    const avatar = modal?.querySelector('[data-profile-avatar]');
    if (avatar) avatar.textContent = nickname.charAt(0).toUpperCase() || 'И';
    const name = modal?.querySelector('[data-profile-nickname]');
    if (name) name.textContent = nickname;
    const id = modal?.querySelector('[data-profile-id]');
    if (id) id.textContent = `ID: ${telegramId}`;
    const balance = modal?.querySelector('[data-profile-balance]');
    if (balance) balance.textContent = money(state.player?.balance);
    const level = modal?.querySelector('[data-profile-level]');
    if (level) level.textContent = String(snapshot.overallLevel || state.player?.level || 1);
  }

  function renderSkills() {
    if (!content) return;
    const openedDetails = new Set(
      [...content.querySelectorAll('details[open][data-skill-details]')]
        .map((element) => element.dataset.skillDetails),
    );
    const snapshot = getPlayerSkillsSnapshot();
    const farmer = snapshot.skills?.farmer || {};
    const running = snapshot.skills?.running || {};
    const miner = snapshot.skills?.miner || {};
    const lumberjack = snapshot.skills?.lumberjack || {};
    const crops = Array.isArray(snapshot.crops) ? snapshot.crops : [];
    const mineResources = Array.isArray(snapshot.mineResources) ? snapshot.mineResources : [];
    const mineSubtypes = Array.isArray(snapshot.mineSubtypes) ? snapshot.mineSubtypes : [];
    const cropCards = crops.map((crop) => {
      if (crop.unlocked === false) {
        return `
          <article class="mn-crop-skill-card is-locked">
            <i>${escapeHtml(crop.icon)}</i>
            <span><strong>${escapeHtml(crop.label)}</strong><small>Откроется на ${crop.unlockLevel} уровне фермера</small></span>
            <b>🔒</b>
          </article>`;
      }
      return `
        <article class="mn-crop-skill-card">
          <i>${escapeHtml(crop.icon)}</i>
          <span><strong>${escapeHtml(crop.label)}</strong><small>${progressCaption(crop)}</small><em><u style="width:${progressPercent(crop).toFixed(2)}%"></u></em></span>
          <b>${crop.level}/5</b>
        </article>`;
    }).join('');

    const mineResourceBranches = mineResources.map((resource) => {
      const subtypes = mineSubtypes.filter((subtype) => subtype.resourceType === resource.resourceType);
      const locked = resource.unlocked === false;
      const subtypeCards = subtypes.map((subtype) => {
        if (locked || subtype.unlocked === false) {
          return `
            <article class="mn-mine-subtype-card is-locked">
              <i>${escapeHtml(subtype.icon || resource.icon)}</i>
              <span><strong>${escapeHtml(subtype.label)}</strong><small>${locked
                ? `Сначала откройте ${String(resource.label || '').toLowerCase()}`
                : `Откроется на ${subtype.unlockLevel} уровне ветки`}</small></span>
              <b>🔒</b>
            </article>`;
        }
        return `
          <article class="mn-mine-subtype-card">
            <i>${escapeHtml(subtype.icon || resource.icon)}</i>
            <span>
              <strong>${escapeHtml(subtype.label)}</strong>
              <small>${escapeHtml(subtype.qualityLabel || 'Грязное сырьё')} · очистка ${Number(subtype.purityPercent) || 10}%</small>
              <em><u style="width:${progressPercent(subtype).toFixed(2)}%"></u></em>
              <mark>${escapeHtml(subtype.useLabel || 'Продажа и будущие крафты')}</mark>
            </span>
            <b>${Number(subtype.level) || 1}/5</b>
          </article>`;
      }).join('');

      return `
        <details class="mn-mine-resource-branch${locked ? ' is-locked' : ''}" data-skill-details="mine-${escapeHtml(resource.resourceType)}">
          <summary>
            <i>${escapeHtml(resource.icon || '⛏️')}</i>
            <span><strong>${escapeHtml(resource.label)}</strong><small>${locked
              ? `Откроется на ${resource.unlockLevel} уровне шахтёра`
              : `Ветка ${Number(resource.level) || 1}/5 · подтипов ${subtypes.filter((item) => item.unlocked !== false).length}/${subtypes.length}`}</small></span>
            <b>${locked ? '🔒' : `${Number(resource.level) || 1}/5`}</b>
          </summary>
          <div>
            ${locked ? '<p>Сначала повышайте общий навык шахтёра на уже доступных месторождениях.</p>' : skillCard(resource, '<b>Открывает подтипы</b>')}
            <div class="mn-mine-subtype-grid">${subtypeCards}</div>
          </div>
        </details>`;
    }).join('');

    function overviewCard(skill, eyebrow, accent) {
      const maxLevel = Math.max(1, Number(skill.maxLevel) || 5);
      return `
        <article class="mn-skill-overview-card" data-accent="${accent}">
          <i>${escapeHtml(skill.icon || '✦')}</i>
          <span><small>${eyebrow}</small><strong>${escapeHtml(skill.label)}</strong><em><u style="width:${progressPercent(skill).toFixed(2)}%"></u></em></span>
          <b>${Number(skill.level) || 1}/${maxLevel}</b>
        </article>`;
    }

    content.innerHTML = `
      <section class="mn-skill-section mn-skill-hub">
        <header><span><small>Прогресс игрока</small><strong>Дерево навыков</strong></span><b>Открывайте только нужную ветку — без стены из карточек</b></header>
        <div class="mn-skill-overview-grid">
          ${overviewCard(farmer, 'Работа', 'farm')}
          ${overviewCard(miner, 'Работа', 'mine')}
          ${overviewCard(lumberjack, 'Работа', 'lumber')}
          ${overviewCard(running, 'Форма', 'running')}
        </div>
      </section>

      <details class="mn-skill-profession" data-skill-details="farmer">
        <summary><i>👨‍🌾</i><span><small>Профессия</small><strong>Фермерское дело</strong></span><b>${Number(farmer.level) || 1}/5</b></summary>
        <div class="mn-skill-profession-body">
          ${skillCard(farmer, '<b>Открытие культур</b>')}
          <div class="mn-crop-skill-grid">${cropCards}</div>
        </div>
      </details>

      <details class="mn-skill-profession is-mine" data-skill-details="miner">
        <summary><i>⛏️</i><span><small>Профессия</small><strong>Шахтёрское дело</strong></span><b>${Number(miner.level) || 1}/5</b></summary>
        <div class="mn-skill-profession-body">
          ${skillCard(miner, '<b>Камень → уголь → металл → медь</b>')}
          <p class="mn-mine-tree-note">Нажмите на ресурс, чтобы увидеть только его подтипы, очистку и назначение.</p>
          <div class="mn-mine-resource-tree">${mineResourceBranches}</div>
        </div>
      </details>

      <details class="mn-skill-profession is-lumber" data-skill-details="lumberjack">
        <summary><i>🪓</i><span><small>Профессия</small><strong>Лесозаготовка</strong></span><b>${Number(lumberjack.level) || 1}/3</b></summary>
        <div class="mn-skill-profession-body">
          ${skillCard(lumberjack, '<b>Бревно → 4 бруса → производство</b>')}
          <div class="mn-lumber-skill-roadmap">
            <article data-unlocked="true"><i>🪵</i><span><b>1 уровень</b><small>Топор, рубка деревьев, бревно 20 кг и продажа за 200 ₴</small></span></article>
            <article data-unlocked="${Number(lumberjack.level) >= 2 ? 'true' : 'false'}"><i>🪚</i><span><b>2 уровень</b><small>Бензопила: 1 бревно → 4 бруса по 5 кг; 55 ₴ за брус</small></span><strong>${Number(lumberjack.level) >= 2 ? 'Открыто' : '🔒'}</strong></article>
            <article data-unlocked="${Number(lumberjack.level) >= 3 ? 'true' : 'false'}"><i>🏭</i><span><b>3 уровень</b><small>Поставка подготовленного бруса производствам</small></span><strong>${Number(lumberjack.level) >= 3 ? 'Открыто' : '🔒'}</strong></article>
          </div>
        </div>
      </details>

      <details class="mn-skill-profession" data-skill-details="running">
        <summary><i>🏃</i><span><small>Физическая форма</small><strong>Передвижение</strong></span><b>${Number(running.level) || 1}/5</b></summary>
        <div class="mn-skill-profession-body">
          ${skillCard(running, `<b>−${Number(running.bonusPercent) || 0}% к расходу</b>`)}
        </div>
      </details>`;

    content.querySelectorAll('details[data-skill-details]').forEach((element) => {
      element.open = openedDetails.has(element.dataset.skillDetails);
    });
  }

  function setPage(page) {
    window.clearInterval(utilityTimer);
    utilityTimer = 0;
    modal?.querySelectorAll('[data-profile-page]').forEach((element) => {
      element.hidden = element.dataset.profilePage !== page;
    });
    const title = modal?.querySelector('[data-profile-title]');
    if (title) title.textContent = page === 'skills' ? 'Навыки' : page === 'property' ? 'Дома и бизнесы' : page === 'utility' ? 'Коммунальные услуги' : 'Профиль';
    if (page === 'skills') {
      renderSkills();
      if (skillsPage) skillsPage.scrollTop = 0;
    }
    if (page === 'property') {
      if (propertyPage) propertyPage.scrollTop = 0;
      if (propertyContent) propertyContent.innerHTML = '<div class="mn-skills-loading">Загружаем собственность…</div>';
      void refreshProperty();
    }
    if (page === 'utility') {
      if (utilityPage) utilityPage.scrollTop = 0;
      if (utilityContent) utilityContent.innerHTML = '<div class="mn-skills-loading">Загружаем коммунальные счета…</div>';
      void refreshUtility();
      utilityTimer = window.setInterval(refreshUtility, 5000);
    }
  }

  async function refreshSkills({ silent = true } = {}) {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const [farmResult, mineResult, lumberResult] = await Promise.allSettled([
        loadPlayerSkills(),
        loadMineSkills(),
        loadLumberSkills(),
      ]);

      if (!destroyed && farmResult.status === 'fulfilled') publishPlayerSkills(farmResult.value);
      if (!destroyed && mineResult.status === 'fulfilled') publishPlayerSkills(mineResult.value);
      if (!destroyed && lumberResult.status === 'fulfilled') publishPlayerSkills(lumberResult.value);

      if (farmResult.status === 'rejected' && !String(farmResult.reason?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSkills] farm skills load failed:', farmResult.reason);
      }
      if (mineResult.status === 'rejected' && !String(mineResult.reason?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSkills] mine skills load failed:', mineResult.reason);
      }
      if (lumberResult.status === 'rejected' && !String(lumberResult.reason?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSkills] lumber skills load failed:', lumberResult.reason);
      }

      const loaded = farmResult.status === 'fulfilled' || mineResult.status === 'fulfilled' || lumberResult.status === 'fulfilled';
      if (!loaded && !silent && content) {
        content.innerHTML = '<div class="mn-skills-loading is-error">Не удалось загрузить навыки. Закройте профиль и попробуйте ещё раз.</div>';
      }
      loadPromise = null;
      return loaded ? getPlayerSkillsSnapshot() : null;
    })();
    return loadPromise;
  }

  async function flushRunningXp() {
    if (runningXpInFlight || runningXpPending < 1) return;
    const amount = Math.max(1, Math.min(100, Math.floor(runningXpPending)));
    runningXpPending = Math.max(0, runningXpPending - amount);
    runningXpInFlight = true;
    try {
      const result = await addRunningSkillXp(amount);
      if (!destroyed) publishPlayerSkills(result, { levelUps: result?.levelUps });
    } catch (error) {
      runningXpPending = Math.min(200, runningXpPending + amount);
      if (!String(error?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSkills] running XP sync failed:', error);
      }
    } finally {
      runningXpInFlight = false;
      if (!destroyed && runningXpPending >= RUNNING_XP_BATCH) queueMicrotask(flushRunningXp);
    }
  }

  function scheduleRunningXpFlush() {
    window.clearTimeout(flushTimer);
    flushTimer = window.setTimeout(flushRunningXp, RUNNING_XP_FLUSH_MS);
  }

  function handleRunningXp(event) {
    const amount = Math.max(0, Number(event?.detail?.amount) || 0);
    if (!amount) return;
    runningXpPending = Math.min(200, runningXpPending + amount);
    if (runningXpPending >= RUNNING_XP_BATCH) void flushRunningXp();
    else scheduleRunningXpFlush();
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') void flushRunningXp();
  }

  function openProfile() {
    if (!modal) return;
    renderOverview();
    setPage('overview');
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-player-profile-open');
    void refreshSkills({ silent: false });
  }

  function closeProfile() {
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mn-player-profile-open');
    window.clearInterval(utilityTimer);
    utilityTimer = 0;
  }

  function handleSkillsChanged() {
    renderOverview();
    if (modal?.querySelector('[data-profile-page="skills"]')?.hidden === false) renderSkills();
  }

  function handleBalanceChanged(event) {
    const balance = Number(event?.detail?.balance);
    if (Number.isFinite(balance)) state.player = { ...(state.player || {}), balance };
    renderOverview();
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && modal?.hidden === false) closeProfile();
  }

  function handleLevelUp(event) {
    showLevelToast(event.detail);
  }

  function handlePropertyChanged() {
    propertyLoadPromise = null;
    if (propertyPage?.hidden === false) void refreshProperty();
  }

  profileButton?.addEventListener('click', openProfile);
  modal?.querySelectorAll('[data-profile-close]').forEach((button) => button.addEventListener('click', closeProfile));
  modal?.querySelector('[data-profile-open-skills]')?.addEventListener('click', () => setPage('skills'));
  modal?.querySelector('[data-profile-open-property]')?.addEventListener('click', () => setPage('property'));
  modal?.querySelector('[data-profile-open-utility]')?.addEventListener('click', () => setPage('utility'));
  utilityContent?.addEventListener('click', handleUtilityClick);
  modal?.querySelectorAll('[data-profile-back]').forEach((button) => button.addEventListener('click', () => setPage('overview')));
  skillsPage?.addEventListener('touchstart', handleSkillsTouchStart, { passive: true });
  skillsPage?.addEventListener('touchmove', handleSkillsTouchMove, { passive: false });
  skillsPage?.addEventListener('touchend', handleSkillsTouchEnd, { passive: true });
  skillsPage?.addEventListener('touchcancel', handleSkillsTouchEnd, { passive: true });
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('mn:player-skills-changed', handleSkillsChanged);
  window.addEventListener('mn:player-skill-level-up', handleLevelUp);
  window.addEventListener('mn:player-balance-changed', handleBalanceChanged);
  window.addEventListener('mn:player-running-xp', handleRunningXp);
  window.addEventListener('mn:houses-updated', handlePropertyChanged);
  window.addEventListener('mn:businesses-updated', handlePropertyChanged);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  void refreshSkills({ silent: true });

  return () => {
    if (runningXpPending >= 1) void flushRunningXp();
    destroyed = true;
    window.clearTimeout(flushTimer);
    window.clearInterval(utilityTimer);
    profileButton?.removeEventListener('click', openProfile);
    skillsPage?.removeEventListener('touchstart', handleSkillsTouchStart);
    skillsPage?.removeEventListener('touchmove', handleSkillsTouchMove);
    skillsPage?.removeEventListener('touchend', handleSkillsTouchEnd);
    skillsPage?.removeEventListener('touchcancel', handleSkillsTouchEnd);
    utilityContent?.removeEventListener('click', handleUtilityClick);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('mn:player-skills-changed', handleSkillsChanged);
    window.removeEventListener('mn:player-skill-level-up', handleLevelUp);
    window.removeEventListener('mn:player-balance-changed', handleBalanceChanged);
    window.removeEventListener('mn:player-running-xp', handleRunningXp);
    window.removeEventListener('mn:houses-updated', handlePropertyChanged);
    window.removeEventListener('mn:businesses-updated', handlePropertyChanged);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.body.classList.remove('mn-player-profile-open');
    modal?.remove();
    document.querySelectorAll('.mn-skill-level-toast').forEach((element) => element.remove());
  };
}


