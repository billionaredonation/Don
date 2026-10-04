import { loadCommunity } from './communityApi.js';

let cache=null, cacheAt=0, pending=null;
const TTL=15000;

async function state(){
  const now=Date.now();
  if(cache&&now-cacheAt<TTL)return cache;
  if(!pending){
    pending=loadCommunity().then(v=>{cache=v||null;cacheAt=Date.now();return cache;}).finally(()=>{pending=null;});
  }
  return pending;
}

export async function renderStatePurchaseBenefit(root,{basePrice,priceSelector}={}){
  if(!root)return;
  const price=root.querySelector(priceSelector);
  const host=price?.parentElement;
  if(!host)return;
  host.querySelector('[data-community-state-purchase-benefit]')?.remove();
  try{
    const community=await state();
    if(!community?.membership)return;
    const base=Math.max(0,Number(basePrice)||0);
    const finalPrice=Math.round(base*0.97*100)/100;
    price.textContent=`${finalPrice.toLocaleString('ru-RU',{maximumFractionDigits:2})} ₴`;
    const note=document.createElement('small');
    note.dataset.communityStatePurchaseBenefit='1';
    note.className='mn-community-state-purchase-benefit';
    note.textContent=`Сообщество: −3% · госцена ${base.toLocaleString('ru-RU')} ₴`;
    host.append(note);
  }catch{}
}
