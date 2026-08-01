import { supabase } from '../supabaseClient.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLIC_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

const PLAYER_SELECT =
  'id, tg_id, nickname, city, balance, health, food, water, level, is_admin, created_at, updated_at';

function getFunctionUrl(functionName) {
  if (!SUPABASE_URL) {
    throw new Error('VITE_SUPABASE_URL is missing');
  }

  return `${SUPABASE_URL}/functions/v1/${functionName}`;
}

async function callPlayerFunction(functionName, payload) {
  if (!SUPABASE_PUBLIC_KEY) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY is missing');
  }

  const response = await fetch(getFunctionUrl(functionName), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Function ${functionName} failed`);
  }

  return data;
}

export async function getPlayer(tgId) {
  const cleanTgId = String(tgId || '').trim();

  if (!cleanTgId) {
    throw new Error('tg_id is required');
  }

  try {
    return await callPlayerFunction('get-player', {
      tg_id: cleanTgId,
    });
  } catch (edgeError) {
    console.warn(
      '[playerApi] get-player Edge Function unavailable, trying direct database read:',
      edgeError
    );

    const { data, error } = await supabase
      .from('players')
      .select(PLAYER_SELECT)
      .eq('tg_id', cleanTgId)
      .maybeSingle();

    if (error) {
      const combinedError = new Error(
        `Failed to load player through Edge Function and direct database read: ${error.message}`
      );

      combinedError.cause = edgeError;
      throw combinedError;
    }

    if (!data) {
      // Under RLS an unauthorised SELECT can look exactly like a missing row.
      // The failed Edge Function therefore cannot confirm that this player is
      // genuinely absent, so keep the boot flow in the retry/error state.
      const unconfirmedError = new Error(
        'Direct database read could not confirm the player after get-player failed'
      );

      unconfirmedError.cause = edgeError;
      throw unconfirmedError;
    }

    return {
      ok: true,
      player: data,
      transport: 'direct_fallback',
    };
  }
}

export async function createPlayer({ tgId, nickname, city }) {
  return callPlayerFunction('create-player', {
    tg_id: String(tgId || '').trim(),
    nickname: String(nickname || '').trim(),
    city: String(city || '').trim(),
  });
}
