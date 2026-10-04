import { supabase } from '../supabaseClient.js';

const initData=()=>String(window.Telegram?.WebApp?.initData||'').trim();

async function invokeStateSale(action,businessId){
  const telegram=initData();
  if(!telegram)throw new Error('TELEGRAM_SESSION_REQUIRED');

  const {data,error}=await supabase.functions.invoke('business-state-sale',{
    body:{initData:telegram,action,businessId:String(businessId||'').trim()},
  });

  if(error){
    let remote='';
    try{remote=(await error.context?.clone?.().json())?.error||'';}catch{}
    throw new Error(remote||error.message||'BUSINESS_STATE_SALE_FAILED');
  }
  if(!data?.ok)throw new Error(data?.error||'BUSINESS_STATE_SALE_FAILED');
  return data.result||{};
}

export const previewBusinessStateSale=(businessId)=>invokeStateSale('preview',businessId);
export const sellBusinessToState=(businessId)=>invokeStateSale('sell',businessId);

export function businessStateSaleError(error){
  const raw=String(error?.message||error||'');
  const messages={
    TELEGRAM_SESSION_REQUIRED:'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID:'Сессия Telegram устарела. Перезапустите мини-приложение.',
    BUSINESS_NOT_FOUND:'Предприятие не найдено.',
    BUSINESS_OWNER_REQUIRED:'Продать предприятие государству может только его владелец.',
    BUSINESS_DEBT_MUST_BE_PAID:'Сначала погасите налоговую задолженность и штрафы предприятия.',
    BUSINESS_STATE_PRICE_MISSING:'Для этого предприятия не настроена государственная цена выкупа.',
    BUSINESS_STATE_SALE_INVALID:'Не удалось рассчитать государственный выкуп предприятия.',
    PLAYER_NOT_FOUND:'Игрок не найден.',
  };
  const key=Object.keys(messages).find(k=>raw.includes(k));
  return key?messages[key]:raw||'Не удалось продать предприятие государству.';
}
