import { loadElectricityBills } from '../energySubstation/energySubstationApi.js';
import { loadWaterUtility } from '../waterTreatment/waterTreatmentApi.js';
import { loadGasUtility } from '../ukrGaz/ukrGazApi.js';
import './businessUtilityGate.css';

const CACHE_MS = 5000;
const cache = new Map();

const norm = (value) => String(value ?? '').trim().toLowerCase().replace(/^mn-/, '');
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
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function renderBusinessUtilityGate(container, status, { isOwner = false, objectId = '' } = {}) {
  if (!container) return;
  container.querySelectorAll('[data-business-utility-gate]').forEach((node) => node.remove());
  if (!isOwner) return;

  const state = status || { electricity:false, water:false, gas:false, operational:false, missing:['electricity','water','gas'] };
  const gate = document.createElement('section');
  gate.dataset.businessUtilityGate = '1';
  gate.className = `mn-business-utility-gate ${state.operational ? 'is-online' : 'is-offline'}`;
  gate.innerHTML = `
    <div class="mn-business-utility-gate__head">
      <span><small>${state.operational ? 'КОММУНАЛЬНЫЕ СЕТИ ПОДКЛЮЧЕНЫ' : 'ПРЕДПРИЯТИЕ НЕ РАБОТАЕТ'}</small><strong>${state.operational ? 'Все обязательные подключения активны' : 'Подключите воду, газ и электричество, чтобы предприятие начало работать и функционировать.'}</strong></span>
      ${objectId ? `<b>ID ${String(objectId).replaceAll('<','&lt;').replaceAll('>','&gt;')}</b>` : ''}
    </div>
    <div class="mn-business-utility-gate__services">
      <article class="${state.electricity ? 'is-active' : 'is-missing'}"><i>⚡</i><span><small>Электричество</small><strong>${state.electricity ? 'Подключено' : 'Не подключено'}</strong></span></article>
      <article class="${state.water ? 'is-active' : 'is-missing'}"><i>💧</i><span><small>Вода</small><strong>${state.water ? 'Подключена' : 'Не подключена'}</strong></span></article>
      <article class="${state.gas ? 'is-active' : 'is-missing'}"><i>🔥</i><span><small>Газ</small><strong>${state.gas ? 'Подключён' : 'Не подключён'}</strong></span></article>
    </div>
    ${state.operational ? '' : '<p>Передайте публичный ID предприятия владельцам подстанции, водоснабжения и УкрГаза. Пока хотя бы одна услуга отсутствует, производство и рабочие операции заблокированы сервером.</p>'}
  `;
  const anchor = container.querySelector('[data-business-utility-anchor]') || container.querySelector('main') || container.querySelector('section') || container.firstElementChild || container;
  anchor.prepend(gate);
}
