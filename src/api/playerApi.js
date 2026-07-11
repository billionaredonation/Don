const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLIC_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  return callPlayerFunction('get-player', {
    tg_id: String(tgId || '').trim(),
  });
}

export async function createPlayer({ tgId, nickname, city }) {
  return callPlayerFunction('create-player', {
    tg_id: String(tgId || '').trim(),
    nickname: String(nickname || '').trim(),
    city: String(city || '').trim(),
  });
}
