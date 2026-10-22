import { supabase } from '../supabaseClient.js';
export const WEAPON_TYPES = ['weapon_knife','weapon_pistol','weapon_rifle'];
export async function weaponAction(action, itemType='', target='') {
  const initData = String(window.Telegram?.WebApp?.initData || '').trim();
  if (!initData) throw new Error('Откройте игру в Telegram.');
  const {data,error} = await supabase.functions.invoke('player-interaction', {
    body:{initData,action:'weapon_'+action,itemType,target}
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error||'WEAPON_ACTION_FAILED');
  return data.result;
}
