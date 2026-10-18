import { utilitySupplyReason } from '../player/utilitySupplyReason.js';
import { answerPowerOffer, getSubstationError } from '../energySubstation/energySubstationApi.js';
import { answerWaterOffer, getWaterError } from '../waterTreatment/waterTreatmentApi.js';
import { answerGasOffer, getGasError } from '../ukrGaz/ukrGazApi.js';
import { loadBusinessUtilityPortal } from './businessUtilitiesApi.js';
import { previewBusinessStateSale, sellBusinessToState, businessStateSaleError } from '../businessStateSale/businessStateSaleApi.js';
import './businessUtilityGate.css';
import '../businessStateSale/businessStateSale.css';

const CACHE_MS = 10000;
const OFFER_POLL_MS = 10000;
const cache = new Map();
const statusInFlight = new Map();
const offerTimers = new WeakMap();
const gateRecords = new WeakMap();
const offerState = new WeakMap();

const norm = (value) => String(value ?? '').trim().toLowerCase().replace(/^mn-/, '');
const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
const money = (value) => `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₴`;

const portalCache = new Map();
const portalInFlight = new Map();

function idsKey(ids = []) {
  return [...new Set(
    ids
      .map((value) => String(value ?? '').trim())
      .filter(Boolean),
  )]
    .map(norm)
    .sort()
    .join('|');
}

async function loadPortal(objectIds = [], { force = false } = {}) {
  const ids = [
    ...new Set(
      objectIds
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    ),
  ];

  const key = idsKey(ids);
  const cached = portalCache.get(key);

  if (!force && cached && Date.now() - cached.at < CACHE_MS) {
    return cached.value;
  }

  const existing = portalInFlight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const value = await loadBusinessUtilityPortal(ids);
    portalCache.set(key, { at: Date.now(), value });
    return value;
  })();

  portalInFlight.set(key, request);

  try {
    return await request;
  } finally {
    if (portalInFlight.get(key) === request) {
      portalInFlight.delete(key);
    }
  }
}

export async function loadBusinessUtilityStatus(
  objectIds = [],
  { force = false } = {},
) {
  const ids = [
    ...new Set(
      objectIds
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    ),
  ];

  const portal = await loadPortal(ids, { force });

  const electricity = Boolean(portal?.electricity?.active);
  const water = Boolean(portal?.water?.active);
  const gas = Boolean(portal?.gas?.active);

  return {
    electricity,
    water,
    gas,

    electricityConnected: Boolean(portal?.electricity?.connected),
    waterConnected: Boolean(portal?.water?.connected),
    gasConnected: Boolean(portal?.gas?.connected),

    electricityStatus: String(portal?.electricity?.status || 'none'),
    waterStatus: String(portal?.water?.status || 'none'),
    gasStatus: String(portal?.gas?.status || 'none'),

    operational: electricity && water && gas,
    missing: [
      !electricity && 'electricity',
      !water && 'water',
      !gas && 'gas',
    ].filter(Boolean),

    reasons: Object.fromEntries(['electricity','water','gas'].map(key => [key, portal?.[key]?.connected && !portal?.[key]?.active ? utilitySupplyReason(portal[key], key) : ''])),
    checked: true,
    objectIds: Array.isArray(portal?.objectIds)
      ? portal.objectIds
      : ids,
  };
}

async function loadIncomingOffers(ids, { force = false } = {}) {
  const portal = await loadPortal(ids, { force });
  const offers = portal?.offers || {};

  return {
    power: Array.isArray(offers.power) ? offers.power : [],
    water: Array.isArray(offers.water) ? offers.water : [],
    gas: Array.isArray(offers.gas) ? offers.gas : [],
  };
}


function statusSignature(state = {}) {
  return [
    state.checked, state.error, state.electricityStatus, state.waterStatus, state.gasStatus,
    Boolean(state.electricity),
    Boolean(state.water),
    Boolean(state.gas),
    Boolean(state.electricityConnected),
    Boolean(state.waterConnected),
    Boolean(state.gasConnected),
    Boolean(state.operational),
  ].join('|');
}

function updateGateState(gate, state) {
  if (!gate?.isConnected || !state) return;

  const unknown = state.checked !== true;
  const previous = gate.dataset.utilityStatusSignature || '';
  const next = statusSignature(state);
  gate.dataset.utilityStatusSignature = next;
  gate.classList.toggle('is-online', Boolean(state.operational));
  gate.classList.toggle('is-offline', !unknown && !state.operational);
  gate.classList.toggle('is-checking', unknown);

  const head = gate.querySelector('.mn-business-utility-gate__head span');
  if (head) {
    const small = head.querySelector('small');
    const strong = head.querySelector('strong');
    if (small) small.textContent = unknown ? 'СТАТУС ЖКХ' : state.operational ? 'КОММУНАЛЬНЫЕ СЕТИ ПОДКЛЮЧЕНЫ' : 'ПРЕДПРИЯТИЕ НЕ РАБОТАЕТ';
    if (strong) strong.textContent = unknown ? (state.error ? 'Не удалось проверить подключения. Повторяем проверку автоматически.' : 'Проверяем электричество, воду и газ…') : state.operational
      ? 'Все обязательные подключения активны'
      : 'Для работы нужна активная подача электричества, воды и газа. Проверьте статусы ниже.';
  }

  const services = [
    ['electricity', 'electricityConnected', 'Подключено', 'Подача остановлена', 'Не подключено'],
    ['water', 'waterConnected', 'Подключена', 'Подача остановлена', 'Не подключена'],
    ['gas', 'gasConnected', 'Подключён', 'Подача остановлена', 'Не подключён'],
  ];

  gate.querySelectorAll('.mn-business-utility-gate__services article').forEach((article, index) => {
    const [key, connectedKey, activeText, stoppedText, missingText] = services[index] || [];
    if (!key) return;

    const active = Boolean(state[key]);
    const connected = Boolean(state[connectedKey]);

    article.classList.toggle('is-active', active);
    article.classList.toggle('is-missing', !unknown && !active && !connected);
    article.classList.toggle('is-stopped', !unknown && !active && connected);

    let reason = article.querySelector('[data-utility-reason]');
    if (!reason) { reason = document.createElement('small'); reason.dataset.utilityReason = '1'; article.querySelector('span').append(reason); }
    reason.textContent = unknown ? '' : (state.reasons?.[key] || '');
    reason.title = reason.textContent;
    reason.hidden = !reason.textContent;
    const strong = article.querySelector('strong');
    if (strong) {
      strong.textContent = unknown ? (state.error ? 'Не удалось проверить' : 'Проверяем…') : state[`${key}Status`] === 'offered' && !active ? 'Ожидает принятия договора' : active
        ? activeText
        : connected
          ? stoppedText
          : missingText;
    }
  });

  const info = gate.querySelector('[data-business-utility-info]');
  if (info) info.hidden = !unknown && Boolean(state.operational);

  if (previous && previous !== next) {
    window.dispatchEvent(new CustomEvent('mn:business-utility-status-changed', {
      detail: {
        status: state,
        objectIds: Array.isArray(state.objectIds) ? state.objectIds : [],
      },
    }));
  }
}


function offerMarkup(kind, offer) {
  if (kind === 'power') {
    return `<article class="mn-business-utility-offer" data-utility-offer="power" data-contract-id="${esc(offer.id)}">
      <div><b>⚡ Электроснабжение</b><span>Подстанция: ${esc(offer.substationName || offer.substationId || '—')}</span><small>${money(offer.retailPrice)} / кВт·ч · подключение ${money(offer.connectionFee)} из кассы предприятия</small></div>
      <div class="mn-business-utility-offer__actions"><button type="button" data-utility-answer="accept">Принять</button><button type="button" class="is-reject" data-utility-answer="reject">Отказаться</button></div>
    </article>`;
  }
  if (kind === 'water') {
    return `<article class="mn-business-utility-offer" data-utility-offer="water" data-contract-id="${esc(offer.id)}">
      <div><b>💧 Водоснабжение</b><span>Поставщик: ${esc(offer.plantName || offer.plantId || '—')}</span><small>${money(offer.unitPrice)} / л · подключение ${money(offer.connectionFee)} из кассы предприятия</small></div>
      <div class="mn-business-utility-offer__actions"><button type="button" data-utility-answer="accept">Принять</button><button type="button" class="is-reject" data-utility-answer="reject">Отказаться</button></div>
    </article>`;
  }
  return `<article class="mn-business-utility-offer" data-utility-offer="gas" data-contract-id="${esc(offer.id)}">
    <div><b>🔥 Газоснабжение</b><span>Поставщик: ${esc(offer.plantName || offer.plantId || '—')}</span><small>${money(offer.unitPrice)} / ед. · подключение ${money(offer.connectionFee)} из кассы предприятия</small></div>
    <div class="mn-business-utility-offer__actions"><button type="button" data-utility-answer="accept">Принять</button><button type="button" class="is-reject" data-utility-answer="reject">Отказаться</button></div>
  </article>`;
}

function setNotice(gate, text) {
  const node=gate.querySelector('[data-utility-notice]');
  if(node && node.textContent!==text){node.textContent=text;node.title=text;}
}
function offersList(offers){
  return [...offers.power.map(o=>['power',o]),...offers.water.map(o=>['water',o]),...offers.gas.map(o=>['gas',o])];
}
function showOffers(gate, ids, options) {
  const live=offerState.get(gate);
  if(!live?.offers || live.answering || !gate.isConnected)return;
  const box=gate.querySelector('[data-business-utility-offers]');
  if(!box)return;
  if(live.status)updateGateState(gate,live.status);
  live.shownStatus=live.status ? statusSignature(live.status) : '';
  const all=offersList(live.offers);
  box.hidden=false;
  box.innerHTML=all.length ? all.map(([kind,o])=>offerMarkup(kind,o)).join('') : '<p>Новых предложений на подключение нет.</p>';
  box.onclick=async event=>{
    const button=event.target.closest('[data-utility-answer]');
    if(!button||live.answering)return;
    const row=button.closest('[data-utility-offer]');
    const kind=row?.dataset.utilityOffer, contractId=row?.dataset.contractId;
    if(!kind||!contractId)return;
    const accept=button.dataset.utilityAnswer==='accept';
    live.answering=true;
    box.querySelectorAll('button').forEach(el=>{el.disabled=true;});
    try{
      if(kind==='power')await answerPowerOffer(contractId,accept);
      else if(kind==='water')await answerWaterOffer(contractId,accept);
      else await answerGasOffer(contractId,accept);
      portalCache.clear();
      window.dispatchEvent(new CustomEvent('mn:toast',{detail:{message:accept?'Коммунальный договор принят.':'Коммунальный договор отклонён.',type:'success'}}));
      window.dispatchEvent(new CustomEvent('mn:business-utility-contract-changed',{detail:{kind,contractId,accepted:accept,objectIds:ids}}));
      live.answering=false;
      await refreshOfferBox(gate,ids,options);
      if(gate.isConnected)showOffers(gate,ids,options);
    }catch(error){
      const message=kind==='power'?getSubstationError(error):kind==='water'?getWaterError(error):getGasError(error);
      window.dispatchEvent(new CustomEvent('mn:toast',{detail:{message,type:'error'}}));
    }finally{
      live.answering=false;
      box.querySelectorAll('button').forEach(el=>{el.disabled=false;});
    }
  };
}
async function refreshOfferBox(gate, ids, options) {
  if(!gate?.isConnected)return;
  let live=offerState.get(gate);
  if(!live){live={loading:false,answering:false,offers:null,status:null,shownStatus:gate.dataset.utilityStatusSignature||''};offerState.set(gate,live);}
  if(live.loading||live.answering)return;
  live.loading=true;
  try{
    const offers=await loadIncomingOffers(ids,{force:true});
    if(!gate.isConnected || offerState.get(gate)!==live)return;
    const status=await loadBusinessUtilityStatus(ids);
    if(!gate.isConnected || offerState.get(gate)!==live)return;
    const first=!live.offers;
    live.offers=offers;live.status=status;
    // Hydrate once; subsequent polls only replace one fixed-height text line.
    if(first){updateGateState(gate,status);live.shownStatus=statusSignature(status);}
    const labels=[['power','свет'],['water','вода'],['gas','газ']].filter(([key])=>offers[key].length).map(([key,label])=>`${label}: ${offers[key].length}`);
    const changed=statusSignature(status)!==live.shownStatus;
    setNotice(gate,labels.length?`Предложения — ${labels.join(', ')}. Нажмите «Посмотреть».`:changed?'Статус ЖКХ изменился. Нажмите «Посмотреть».':'Новых предложений нет. Проверка каждые 10 секунд.');
  }catch(error){
    if(gate.isConnected)setNotice(gate,'Не удалось проверить ЖКХ. Повторим через 10 секунд.');
  }finally{live.loading=false;}
}

export function clearBusinessUtilityGate(container) {
  const record=container && gateRecords.get(container);
  if(record){clearInterval(offerTimers.get(record.gate));offerState.delete(record.gate);gateRecords.delete(container);}
  container?.querySelectorAll('[data-business-utility-gate]').forEach(node => {
    clearInterval(offerTimers.get(node));
    offerTimers.delete(node);
    offerState.delete(node);
    node.remove();
  });
}

export function renderBusinessUtilityGate(container, status, { isOwner = false, objectId = '', objectIds = null, showStateSale = true } = {}) {
  if (!container) return;
  const state = status ? { ...status, checked:status.checked !== false } : { electricity:false, water:false, gas:false, operational:false, missing:['electricity','water','gas'], objectIds:[] };
  const ids = [...new Set([...(Array.isArray(objectIds) ? objectIds : []), ...(Array.isArray(state.objectIds) ? state.objectIds : []), objectId].map(v=>String(v??'').trim()).filter(Boolean))];
  const key=JSON.stringify([isOwner,idsKey(ids),objectId,showStateSale]);
  const previous=gateRecords.get(container);
  if(isOwner && previous?.key===key){
    if(!container.contains(previous.gate)){
      const anchor=container.querySelector('[data-business-utility-anchor]')||container.querySelector('main')||container.querySelector('section')||container.firstElementChild||container;
      anchor.prepend(previous.gate);
    }
    // Reuse the same panel when production counters replace the host DOM.
    return;
  }
  clearBusinessUtilityGate(container);
  if(!isOwner)return;
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
      <article class="${state.electricity ? 'is-active' : state.electricityConnected ? 'is-stopped' : 'is-missing'}"><i>⚡</i><span><small>Электричество</small><strong>${state.electricity ? 'Подключено' : state.electricityConnected ? 'Подача остановлена' : 'Не подключено'}</strong></span></article>
      <article class="${state.water ? 'is-active' : state.waterConnected ? 'is-stopped' : 'is-missing'}"><i>💧</i><span><small>Вода</small><strong>${state.water ? 'Подключена' : state.waterConnected ? 'Подача остановлена' : 'Не подключена'}</strong></span></article>
      <article class="${state.gas ? 'is-active' : state.gasConnected ? 'is-stopped' : 'is-missing'}"><i>🔥</i><span><small>Газ</small><strong>${state.gas ? 'Подключён' : state.gasConnected ? 'Подача остановлена' : 'Не подключён'}</strong></span></article>
    </div>
    <p data-business-utility-info ${state.operational ? 'hidden' : ''}>Чтобы подключить предприятие: владелец подстанции отправляет предложение на электричество, водоканал — на воду, УкрГаз — на газ. После отправки договор появится ниже в разделе «Входящие коммунальные договоры», где владелец предприятия сможет его принять.</p>
    <div class="mn-utility-notification"><span data-utility-notice role="status" aria-live="polite">Проверяем предложения на подключение…</span><button type="button" data-utility-view>Посмотреть</button></div>
    <div class="mn-business-utility-offers" data-business-utility-offers hidden></div>
    <div class="mn-business-state-sale">
      <div>
        <strong>Продажа государству</strong>
        <small>Государство выкупает предприятие по базовой госцене. Комиссия: 20%, для участника сообщества — 18%.</small>
      </div>
      <button type="button" data-business-state-sale>Продать государству</button>
    </div>
  `;
  const anchor = container.querySelector('[data-business-utility-anchor]') || container.querySelector('main') || container.querySelector('section') || container.firstElementChild || container;
  anchor.prepend(gate);
  updateGateState(gate, state);
  if (!showStateSale) gate.querySelector('.mn-business-state-sale')?.remove();
  const saleButton = gate.querySelector('[data-business-state-sale]');
  if (saleButton) {
    saleButton.onclick = async () => {
      const saleId = String(objectId || ids[0] || '').trim();
      if (!saleId) return;

      saleButton.disabled = true;
      const previous = saleButton.textContent;
      saleButton.textContent = 'Расчёт…';

      try {
        const preview = await previewBusinessStateSale(saleId);
        const base = Number(preview?.basePrice || 0).toLocaleString('ru-RU',{maximumFractionDigits:2});
        const payoutPreview = Number(preview?.payout || 0).toLocaleString('ru-RU',{maximumFractionDigits:2});
        const ratePreview = Number(preview?.commissionRate || 20).toLocaleString('ru-RU',{maximumFractionDigits:2});

        const accepted = window.confirm(
          `Продать предприятие государству?\n\n` +
          `Государственная цена: ${base} ₴\n` +
          `Комиссия: ${ratePreview}%\n` +
          `Вы получите: ${payoutPreview} ₴\n\n` +
          'Склад, касса предприятия, сотрудники и активные коммунальные договоры будут сброшены.'
        );

        if (!accepted) {
          saleButton.disabled = false;
          saleButton.textContent = previous;
          return;
        }

        saleButton.textContent = 'Продажа…';
        const result = await sellBusinessToState(saleId);
        const payout = Number(result?.payout || 0).toLocaleString('ru-RU',{maximumFractionDigits:2});
        const rate = Number(result?.commissionRate || 20).toLocaleString('ru-RU',{maximumFractionDigits:2});
        window.dispatchEvent(new CustomEvent('mn:toast',{
          detail:{
            type:'success',
            message:`Предприятие продано государству. Получено ${payout} ₴. Комиссия ${rate}%.`,
          },
        }));
        window.dispatchEvent(new CustomEvent('mn:business-sold-to-state',{
          detail:{businessId:saleId,result},
        }));
        gate.innerHTML = `<div class="mn-business-state-sale-result"><strong>Предприятие продано государству</strong><span>Получено ${payout} ₴ · комиссия ${rate}%</span></div>`;
      } catch (error) {
        window.dispatchEvent(new CustomEvent('mn:toast',{
          detail:{type:'error',message:businessStateSaleError(error)},
        }));
        saleButton.disabled = false;
        saleButton.textContent = previous;
      }
    };
  }


  const renderOptions = { isOwner, objectId, objectIds: ids, showStateSale };
  const options = { container, renderOptions };
  gateRecords.set(container,{key,gate});
  gate.querySelector('[data-utility-view]').onclick=()=>{const box=gate.querySelector('[data-business-utility-offers]');if(!box.hidden){box.hidden=true;return;}showOffers(gate,ids,options);};
  void refreshOfferBox(gate, ids, options);
  const offerTimer = setInterval(() => {
    if (!gate.isConnected) { clearInterval(offerTimer); return; }
    if (document.hidden || gate.closest('[hidden], [aria-hidden="true"]') || gate.closest('dialog:not([open])')) return;
    void refreshOfferBox(gate, ids, options);
  }, OFFER_POLL_MS);
  offerTimers.set(gate, offerTimer);

  // One read-only business utility portal is refreshed by the existing
  // 10-second offer timer. Accept/Reject forces an immediate refresh.
}


// Reuse an existing panel while unrelated production counters are rendered.
// Rebuild on business switch, ownership change, or replacement of its DOM.
export function syncBusinessUtilityGate(container, { isOwner = false, objectId = '', objectIds = [] } = {}) {
  if(!container)return;
  const ids=[...new Set([objectId,...objectIds].map(v=>String(v||'').trim()).filter(v=>v&&v!=='—'))];
  if(!isOwner||!ids.length){clearBusinessUtilityGate(container);return;}
  renderBusinessUtilityGate(container,null,{isOwner:true,objectId,objectIds:ids,showStateSale:false});
}
