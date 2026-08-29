import { supabase } from '../supabaseClient.js';
const initData=()=>String(window.Telegram?.WebApp?.initData||'').trim();
async function invoke(action,payload={}){const telegramData=initData();if(!telegramData)throw new Error('TELEGRAM_SESSION_REQUIRED');const {data,error}=await supabase.functions.invoke('industry-factory',{body:{initData:telegramData,action,...payload}});if(error)throw new Error(error.message||'INDUSTRY_REQUEST_FAILED');if(!data?.ok)throw new Error(data?.error||'INDUSTRY_REQUEST_FAILED');return data.result;}
export const loadIndustrySnapshot=(factoryId,cityId,industryId)=>invoke('snapshot',{factoryId,cityId,industryId});
export const purchaseIndustry=(factoryId,cityId,industryId,legalForm)=>invoke('purchase',{factoryId,cityId,industryId,legalForm});
export const depositIndustry=(factoryId,cityId,amount)=>invoke('deposit',{factoryId,cityId,amount});
export const withdrawIndustry=(factoryId,cityId,amount)=>invoke('withdraw',{factoryId,cityId,amount});
export const startIndustryShift=(factoryId,cityId,roleId)=>invoke('shift_start',{factoryId,cityId,roleId});
export const completeIndustryTask=(factoryId,cityId,taskId,result)=>invoke('task_complete',{factoryId,cityId,taskId,result});
export const startIndustryBatch=(factoryId,cityId,recipeId)=>invoke('batch_start',{factoryId,cityId,recipeId});
export const finishIndustryBatch=(factoryId,cityId,batchId)=>invoke('batch_finish',{factoryId,cityId,batchId});
export const transferIndustryRaw=(factoryId,cityId,itemType,quantity)=>invoke('raw_transfer',{factoryId,cityId,itemType,quantity});
export const withdrawIndustryProduct=(factoryId,cityId,itemType,quantity)=>invoke('product_withdraw',{factoryId,cityId,itemType,quantity});
export const setIndustryRole=(factoryId,cityId,target,roleId)=>invoke('staff_set',{factoryId,cityId,target,roleId});
export const loadIndustryExchange=()=>invoke('exchange_snapshot');
export const createIndustryOffer=payload=>invoke('exchange_offer_create',payload);
export const createIndustryRequest=payload=>invoke('exchange_request_create',payload);
export const acceptIndustryRequest=(requestId,factoryId,cityId)=>invoke('exchange_request_accept',{requestId,factoryId,cityId});
export const buyIndustryOffer=(offerId,businessId)=>invoke('exchange_offer_buy',{offerId,businessId});
export function industryError(e){const raw=String(e?.message||e||'INDUSTRY_REQUEST_FAILED');const map={TELEGRAM_SESSION_REQUIRED:'Откройте игру через Telegram.',INDUSTRY_OWNER_REQUIRED:'Действие доступно владельцу.',INDUSTRY_STAFF_REQUIRED:'Вы не приняты на это предприятие.',INDUSTRY_INPUT_NOT_ENOUGH:'На складе недостаточно сырья.',INDUSTRY_WAREHOUSE_FULL:'Склад предприятия заполнен.',INDUSTRY_TASK_EXPIRED:'Рабочее задание уже недействительно.',INDUSTRY_MIGRATION_REQUIRED:'Примените миграцию промышленной системы.'};return Object.entries(map).find(([k])=>raw.includes(k))?.[1]||raw;}
