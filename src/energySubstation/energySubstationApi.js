import { supabase } from '../supabaseClient.js';

const initData=()=>String(window.Telegram?.WebApp?.initData||'').trim();
async function invoke(action,payload={}){
  const telegramData=initData();
  if(!telegramData)throw new Error('TELEGRAM_SESSION_REQUIRED');
  const {data,error}=await supabase.functions.invoke('energy-substation',{body:{initData:telegramData,action,...payload}});
  if(error){let remote='';try{remote=(await error.context?.clone?.().json())?.error||'';}catch{}throw new Error(remote||error.message||'SUBSTATION_REQUEST_FAILED');}
  if(!data?.ok)throw new Error(data?.error||'SUBSTATION_REQUEST_FAILED');
  return data.result;
}

export const loadSubstation=(substationId,cityId)=>invoke('snapshot',{substationId,cityId});
export const buySubstation=(substationId,cityId)=>invoke('purchase',{substationId,cityId});
export const addSubstationBudget=(substationId,cityId,amount)=>invoke('add_budget',{substationId,cityId,amount});
export const withdrawSubstationMoney=(substationId,cityId,amount)=>invoke('withdraw',{substationId,cityId,amount});
export const loadTransformer=(transformerId,cityId)=>invoke('transformer_snapshot',{transformerId,cityId});
export const buyTransformer=(transformerId,cityId,substationId)=>invoke('transformer_purchase',{transformerId,cityId,substationId});
export const payTransformerMaintenance=(substationId,cityId,transformerId)=>invoke('transformer_maintenance',{substationId,cityId,transformerId});
export const acceptSupply=(substationId,cityId,sourceType,contractId)=>invoke('supply_accept',{substationId,cityId,sourceType,contractId});
export const toggleSupply=(substationId,cityId,linkId,enabled)=>invoke('supply_toggle',{substationId,cityId,linkId,enabled});
export const offerHousePower=(substationId,cityId,payload)=>invoke('consumer_offer',{substationId,cityId,...payload});
export const loadPowerInbox=()=>invoke('consumer_inbox');
export const answerPowerOffer=(contractId,accept)=>invoke('consumer_answer',{contractId,accept});
export const loadElectricityBills=()=>invoke('consumer_billing');
export const payElectricityBill=(contractId,amount)=>invoke('consumer_pay',{contractId,amount});

export function getSubstationError(error){
  const raw=String(error?.message||error||'SUBSTATION_REQUEST_FAILED');
  const map={TELEGRAM_SESSION_REQUIRED:'Откройте игру через Telegram.',TELEGRAM_SESSION_INVALID:'Сессия Telegram устарела.',SUBSTATION_NOT_FOUND:'Подстанция не найдена.',SUBSTATION_ALREADY_OWNED:'У подстанции уже есть владелец.',SUBSTATION_OWNER_REQUIRED:'Действие доступно только владельцу подстанции.',SUBSTATION_AMOUNT_INVALID:'Укажите корректную сумму.',PLAYER_BALANCE_NOT_ENOUGH:'Недостаточно денег.',SUBSTATION_BALANCE_NOT_ENOUGH:'На счёте подстанции недостаточно денег для обслуживания.',TRANSFORMER_NOT_FOUND:'Трансформатор не найден.',TRANSFORMER_MAINTENANCE_NOT_REQUIRED:'Обслуживание этого трансформатора пока не требуется.',TRANSFORMER_ALREADY_OWNED:'Этот трансформатор уже принадлежит другой подстанции.',TRANSFORMER_LIMIT_REACHED:'На одну подстанцию можно купить не более пяти трансформаторов.',TRANSFORMER_WRONG_CITY:'Подстанция и трансформатор должны находиться в одном городе.',SUPPLY_CONTRACT_NOT_FOUND:'Предложение электростанции уже недоступно.',SUPPLY_CONTRACT_EXPIRED:'Срок этого договора уже закончился.',SUPPLY_CONTRACT_EXISTS:'Этот контракт уже подключён.',SUPPLY_CONTRACT_REQUIRED:'Сначала примите действующий контракт от ГЭС, АЭС или УЭС.',HOUSE_NOT_FOUND:'Дом не найден.',HOUSE_OUT_OF_RANGE:'Дом находится вне зоны этого трансформатора.',HOUSE_POWER_CONTRACT_EXISTS:'У этого дома уже есть договор электроснабжения.',TRANSFORMER_CONSUMER_LIMIT:'К трансформатору уже подключено шесть потребителей.',POWER_OFFER_NOT_FOUND:'Предложение подключения уже недоступно.',POWER_OFFER_OWNER_REQUIRED:'Принять предложение может только владелец дома.',POWER_BILL_NOT_FOUND:'Счёт за электричество не найден.',POWER_BILL_EMPTY:'Задолженности за электричество пока нет.',POWER_BILL_MINIMUM_NOT_REACHED:'Оплата доступна после накопления минимум 10,00 ₴.',POWER_BILL_AMOUNT_INVALID:'Сумма коммунального платежа устарела. Обновите счёт.',POWER_CONNECTION_FEE_INVALID:'Подключение должно стоить не меньше 500 ₴.',POWER_TARIFF_INVALID:'Укажите корректный тариф за кВт·ч.'};
  const code=Object.keys(map).find(key=>raw.includes(key));return code?map[code]:raw;
}
