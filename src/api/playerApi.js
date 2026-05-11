const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function getFunctionUrl(functionName) {
  if (!SUPABASE_URL) {
    throw new Error('VITE_SUPABASE_URL is missing');
  }

  return `${SUPABASE_URL}/functions/v1/${functionName}`;
}

async function callPlayerFunction(functionName, payload) {
  const response = await fetch(getFunctionUrl(functionName), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
