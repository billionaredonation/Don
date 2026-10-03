import { loadElectricityBills, loadPowerInbox, answerPowerOffer, getSubstationError } from '../energySubstation/energySubstationApi.js';
import { loadWaterUtility, answerWaterOffer, getWaterError } from '../waterTreatment/waterTreatmentApi.js';
import { loadGasUtility, answerGasOffer, getGasError } from '../ukrGaz/ukrGazApi.js';
import './businessUtilityGate.css';

const CACHE_MS = 5000;
const OFFER_POLL_MS = 5000;
const STATUS_POLL_MS = 1000;
const cache = new Map();
const offerTimers = new WeakMap();
const statusTimers = new WeakMap();

const norm = (value) => String(value ?? '').trim().toLowerCase().replace(/^mn-/, '');
const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
const money = (value) => `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₴`;

const valuesOf = (row = {}) => [
  row.houseId, row.house_id, row.objectId, row.object_id,
  row.businessId, row.business_id, row.consumerId, row.consumer_id,
  row.publicBusinessId, row.public_business_id,
].map(norm).filter(Boolean);

function rowsFrom(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.bills)) return result.bills;
  if (Array.isArray(result?.contracts)) return result.contracts;
  if (Array.isArray(result?.consumers)) return result.consumers;
  return [];
}

function match(rows, ids) {
  const wanted = new Set(ids.map(norm).filter(Boolean));
  return rows.find((row) => valuesOf(row).some((value) => wanted.has(value))) || null;
}

function offersFrom(result) {
  return Array.isArray(result?.offers) ? result.offers : [];
}

function matchingOffers(result, ids) {
  const wanted = new Set(ids.map(norm).filter(Boolean));
  if (!wanted.size) return [];
  return offersFrom(result).filter((offer) => valuesOf(offer).some((value) => wanted.has(value)));
}

export async function loadBusinessUtilityStatus(objectIds = [], { force = false } = {}) {
  const ids = [...new Set(objectIds.map((value) => String(value ?? '').trim()).filter(Boolean))];
  const key = ids.map(norm).sort().join('|');
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const [power, water, gas] = await Promise.allSettled([
    loadElectricityBills(), loadWaterUtility(), loadGasUtility(),
  ]);
  const powerBill = power.status === 'fulfilled' ? match(rowsFrom(power.value), ids) : null;
  const waterBill = water.status === 'fulfilled' ? match(rowsFrom(water.value), ids) : null;
  const gasBill = gas.status === 'fulfilled' ? match(rowsFrom(gas.value), ids) : null;
  const electricity = Boolean(powerBill && (powerBill.powerActive ?? powerBill.power_active));
  const waterActive = Boolean(waterBill && (waterBill.waterActive ?? waterBill.water_active));
  const gasActive = Boolean(gasBill && (gasBill.gasActive ?? gasBill.gas_active));
  const value = {
    electricity,
    water: waterActive,
    gas: gasActive,
    operational: electricity && waterActive && gasActive,
    missing: [!electricity && 'electricity', !waterActive && 'water', !gasActive && 'gas'].filter(Boolean),
    checked: power.status === 'fulfilled' || water.status === 'fulfilled' || gas.status === 'fulfilled',
    objectIds: ids,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function loadIncomingOffers(ids) {
  const [power, water, gas] = await Promise.allSettled([
    loadPowerInbox(), loadWaterUtility(), loadGasUtility(),
  ]);
  return {
    power: power.status === 'fulfilled' ? matchingOffers(power.value, ids) : [],
    water: water.status === 'fulfilled' ? matchingOffers(water.value, ids) : [],
    gas: gas.status === 'fulfilled' ? matchingOffers(gas.value, ids) : [],
  };
}


function statusSignature(state = {}) {
  return [Boolean(state.electricity), Boolean(state.water), Boolean(state.gas), Boolean(state.operational)].join('|');
}

function updateGateState(gate, state) {
  if (!gate?.isConnected || !state) return;

  const previous = gate.dataset.utilityStatusSignature || '';
  const next = statusSignature(state);
  gate.dataset.utilityStatusSignature = next;
  gate.classList.toggle('is-online', Boolean(state.operational));
  gate.classList.toggle('is-offline', !state.operational);

  const head = gate.querySelector('.mn-business-utility-gate__head span');
  if (head) {
    const small = head.querySelector('small');
    const strong = head.querySelector('strong');
    if (small) small.textContent = state.operational ? 'КОММУНАЛЬНЫЕ СЕТИ ПОДКЛЮЧЕНЫ' : 'ПРЕДПРИЯТИЕ НЕ РАБОТАЕТ';
    if (strong) strong.textContent = state.operational
      ? 'Все обязательные подключения активны'
      : 'Подключите воду, газ и электричество, чтобы предприятие начало работать и функционировать.';
  }

  const services = [
    ['electricity', 'Электричество', 'Подключено', 'Не подключено'],
    ['water', 'Вода', 'Подключена', 'Не подключена'],
    ['gas', 'Газ', 'Подключён', 'Не подключён'],
  ];

  gate.querySelectorAll('.mn-business-utility-gate__services article').forEach((article, index) => {
    const [key, , activeText, missingText] = services[index] || [];
    if (!key) return;
    const active = Boolean(state[key]);
    article.classList.toggle('is-active', active);
    article.classList.toggle('is-missing', !active);
    const strong = article.querySelector('strong');
    if (strong) strong.textContent = active ? activeText : missingText;
  });

  const info = gate.querySelector('[data-business-utility-info]');
  if (info) info.hidden = Boolean(state.operational);

  if (previous && previous !== next) {
    window.dispatchEvent(new CustomEvent('mn:business-utility-status-changed', {
      detail: {
        status: state,
        objectIds: Array.isArray(state.objectIds) ? state.objectIds : [],
      },
    }));
  }
}

async function pollUtilityStatus(gate, ids) {
  if (!gate?.isConnected) return;
  try {
    const fresh = await loadBusinessUtilityStatus(ids, { force: true });
    if (!gate.isConnected) return;
    updateGateState(gate, fresh);
  } catch (error) {
    console.warn('[businessUtilityGate] status refresh failed:', error);
  }
}

function offerMarkup(kind, offer) {
  if (kind === 'power') {
    return `<article class="mn-business-utility-offer" data-utility-offer="power" data-contract-id="${esc(offer.id)}">
      <div><b>⚡ Электроснабжение</b><span>Подстанция: ${esc(offer.substationName || offer.substationId || '—')}</span><small>${money(offer.retailPrice)} / кВт·ч · подключение ${money(offer.connectionFee)}</small></div>
      <div class="mn-business-utility-offer__actions"><button type="button" data-utility-answer="accept">Принять</button><button type="button" class="is-reject" data-utility-answer="reject">Отказаться</button></div>
    </article>`;
  }
  if (kind === 'water') {
    return `<article class="mn-business-utility-offer" data-utility-offer="water" data-contract-id="${esc(offer.id)}">
      <div><b>💧 Водоснабжение</b><span>Поставщик: ${esc(offer.plantName || offer.plantId || '—')}</span><small>${money(offer.unitPrice)} / л · подключение ${money(offer.connectionFee)}</small></div>
      <div class="mn-business-utility-offer__actions"><button type="button" data-utility-answer="accept">Принять</button><button type="button" class="is-reject" data-utility-answer="reject">Отказаться</button></div>
    </article>`;
  }
  return `<article class="mn-business-utility-offer" data-utility-offer="gas" data-contract-id="${esc(offer.id)}">
    <div><b>🔥 Газоснабжение</b><span>Поставщик: ${esc(offer.plantName || offer.plantId || '—')}</span><small>${money(offer.unitPrice)} / ед. · подключение ${money(offer.connectionFee)}</small></div>
    <div class="mn-business-utility-offer__actions"><button type="button" data-utility-answer="accept">Принять</button><button type="button" class="is-reject" data-utility-answer="reject">Отказаться</button></div>
  </article>`;
}

async function refreshOfferBox(gate, ids, options) {
  if (!gate?.isConnected) return;
  const box = gate.querySelector('[data-business-utility-offers]');
  if (!box) return;
  try {
    const offers = await loadIncomingOffers(ids);
    if (!gate.isConnected) return;
    const all = [
      ...offers.power.map((offer) => ['power', offer]),
      ...offers.water.map((offer) => ['water', offer]),
      ...offers.gas.map((offer) => ['gas', offer]),
    ];
    box.hidden = !all.length;
    box.innerHTML = all.length
      ? `<div class="mn-business-utility-offers__title"><strong>Входящие коммунальные договоры</strong><small>Решение принимает владелец этого предприятия.</small></div>${all.map(([kind, offer]) => offerMarkup(kind, offer)).join('')}`
      : '';

    box.querySelectorAll('[data-utility-answer]').forEach((button) => {
      button.onclick = async () => {
        const row = button.closest('[data-utility-offer]');
        const kind = row?.dataset.utilityOffer;
        const contractId = row?.dataset.contractId;
        const accept = button.dataset.utilityAnswer === 'accept';
        if (!kind || !contractId) return;
        row.querySelectorAll('button').forEach((el) => { el.disabled = true; });
        try {
          if (kind === 'power') await answerPowerOffer(contractId, accept);
          else if (kind === 'water') await answerWaterOffer(contractId, accept);
          else await answerGasOffer(contractId, accept);

          cache.clear();
          window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message: accept ? 'Коммунальный договор принят.' : 'Коммунальный договор отклонён.', type: 'success' } }));
          window.dispatchEvent(new CustomEvent('mn:business-utility-contract-changed', { detail: { kind, contractId, accepted: accept, objectIds: ids } }));

          const fresh = await loadBusinessUtilityStatus(ids, { force: true });
          renderBusinessUtilityGate(options.container, fresh, options.renderOptions);
        } catch (error) {
          const message = kind === 'power' ? getSubstationError(error) : kind === 'water' ? getWaterError(error) : getGasError(error);
          window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type: 'error' } }));
          row.querySelectorAll('button').forEach((el) => { el.disabled = false; });
        }
      };
    });
  } catch (error) {
    console.warn('[businessUtilityGate] incoming offers refresh failed:', error);
  }
}

export function renderBusinessUtilityGate(container, status, { isOwner = false, objectId = '', objectIds = null } = {}) {
  if (!container) return;
  container.querySelectorAll('[data-business-utility-gate]').forEach((node) => {
    const offerTimer = offerTimers.get(node);
    const statusTimer = statusTimers.get(node);
    if (offerTimer) clearInterval(offerTimer);
    if (statusTimer) clearInterval(statusTimer);
    node.remove();
  });
  if (!isOwner) return;

  const state = status || { electricity:false, water:false, gas:false, operational:false, missing:['electricity','water','gas'], objectIds:[] };
  const ids = [...new Set([...(Array.isArray(objectIds) ? objectIds : []), ...(Array.isArray(state.objectIds) ? state.objectIds : []), objectId].map((v) => String(v ?? '').trim()).filter(Boolean))];
  const gate = document.createElement('section');
  gate.dataset.businessUtilityGate = '1';
  gate.className = `mn-business-utility-gate ${state.operational ? 'is-online' : 'is-offline'}`;
  gate.dataset.utilityStatusSignature = statusSignature(state);
  gate.innerHTML = `
    <div class="mn-business-utility-gate__head">
      <span><small>${state.operational ? 'КОММУНАЛЬНЫЕ СЕТИ ПОДКЛЮЧЕНЫ' : 'ПРЕДПРИЯТИЕ НЕ РАБОТАЕТ'}</small><strong>${state.operational ? 'Все обязательные подключения активны' : 'Подключите воду, газ и электричество, чтобы предприятие начало работать и функционировать.'}</strong></span>
      ${objectId ? `<b>ID ${esc(objectId)}</b>` : ''}
    </div>
    <div class="mn-business-utility-gate__services">
      <article class="${state.electricity ? 'is-active' : 'is-missing'}"><i>⚡</i><span><small>Электричество</small><strong>${state.electricity ? 'Подключено' : 'Не подключено'}</strong></span></article>
      <article class="${state.water ? 'is-active' : 'is-missing'}"><i>💧</i><span><small>Вода</small><strong>${state.water ? 'Подключена' : 'Не подключена'}</strong></span></article>
      <article class="${state.gas ? 'is-active' : 'is-missing'}"><i>🔥</i><span><small>Газ</small><strong>${state.gas ? 'Подключён' : 'Не подключён'}</strong></span></article>
    </div>
    <p data-business-utility-info ${state.operational ? 'hidden' : ''}>Электричество конечному объекту предлагает только владелец подстанции. ГЭС/АЭС/УЭС поставляют энергию подстанциям и не могут подключать предприятие напрямую. Воду и газ предлагают соответствующие коммунальные предприятия.</p>
    <div class="mn-business-utility-offers" data-business-utility-offers hidden></div>
  `;
  const anchor = container.querySelector('[data-business-utility-anchor]') || container.querySelector('main') || container.querySelector('section') || container.firstElementChild || container;
  anchor.prepend(gate);

  const renderOptions = { isOwner, objectId, objectIds: ids };
  const options = { container, renderOptions };
  void refreshOfferBox(gate, ids, options);
  const offerTimer = setInterval(() => void refreshOfferBox(gate, ids, options), OFFER_POLL_MS);
  offerTimers.set(gate, offerTimer);

  // Utility status is intentionally polled faster than offers.
  // This bypasses the 5-second cache so an accepted/activated utility
  // appears in an already opened business window almost immediately.
  void pollUtilityStatus(gate, ids);
  const statusTimer = setInterval(() => void pollUtilityStatus(gate, ids), STATUS_POLL_MS);
  statusTimers.set(gate, statusTimer);
}
