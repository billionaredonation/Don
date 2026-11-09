import { supabase } from '../supabaseClient.js';

/** Read-only profession snapshot. All XP is awarded on the server only. */
export async function loadProfessionSkills() {
  const initData = String(window.Telegram?.WebApp?.initData || '').trim();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');
  const { data, error } = await supabase.functions.invoke('profession-snapshot', {
    body: { initData },
  });
  if (error) throw error;
  if (!data?.ok || !Array.isArray(data.skills)) throw new Error(data?.error || 'PROFESSION_SNAPSHOT_INVALID');
  return data.skills;
}
