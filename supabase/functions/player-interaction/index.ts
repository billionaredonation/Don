import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function text(value: unknown, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function positiveInteger(value: unknown, max = 1_000_000_000) {
  const number = Math.floor(Number(value));
  return Number.isSafeInteger(number) && number > 0 && number <= max ? number : null;
}

function normalizeOffer(value: unknown) {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const amount = (key: string) => {
    const number = Math.floor(Number(source[key] || 0));
    return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 1_000_000_000) : 0;
  };
  return {
    money: amount('money'),
    medicine_light: amount('medicine_light'),
    medicine_strong: amount('medicine_strong'),
    medicine_resuscitation: amount('medicine_resuscitation'),
  };
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: CryptoKey | Uint8Array, data: string) {
  const cryptoKey = key instanceof CryptoKey
    ? key
    : await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function verifyTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash')?.toLowerCase() || '';
  if (!/^[a-f0-9]{64}$/.test(receivedHash)) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretBuffer = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const secret = await crypto.subtle.importKey('raw', secretBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  if (bytesToHex(await hmacSha256(secret, dataCheckString)) !== receivedHash) return null;
  const authDate = Number(params.get('auth_date') || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > 86400 || authDate - now > 300) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || Deno.env.get('BOT_TOKEN') || '';
    if (!supabaseUrl || !serviceRoleKey || !botToken) {
      return jsonResponse({ ok: false, error: 'SERVER_NOT_CONFIGURED' }, 500);
    }

    const body = await req.json() as Record<string, unknown>;
    const user = await verifyTelegramInitData(text(body.initData, 16384), botToken);
    if (!user?.id) return jsonResponse({ ok: false, error: 'TELEGRAM_SESSION_INVALID' }, 401);

    const actorTgId = String(user.id);
    const action = text(body.action, 40);
    const target = text(body.target, 64);
    const offerId = text(body.offerId, 80);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let functionName = '';
    let args: Record<string, unknown> = {};
    switch (action) {
      case 'transfer_money': {
        const amount = positiveInteger(body.amount);
        if (!target || !amount) return jsonResponse({ ok: false, error: 'INVALID_MONEY_TRANSFER' });
        functionName = 'player_transfer_money';
        args = { p_sender_tg_id: actorTgId, p_target: target, p_amount: amount };
        break;
      }
      case 'trade_inventory':
        functionName = 'player_trade_inventory';
        args = { p_actor_tg_id: actorTgId };
        break;
      case 'create_trade':
        if (!target) return jsonResponse({ ok: false, error: 'TRADE_TARGET_REQUIRED' });
        functionName = 'player_create_trade_offer';
        args = { p_actor_tg_id: actorTgId, p_target: target, p_offer: normalizeOffer(body.offer) };
        break;
      case 'pending_trade':
        functionName = 'player_get_pending_trade';
        args = { p_actor_tg_id: actorTgId };
        break;
      case 'accept_trade':
        if (!offerId) return jsonResponse({ ok: false, error: 'TRADE_ID_REQUIRED' });
        functionName = 'player_accept_trade';
        args = { p_actor_tg_id: actorTgId, p_offer_id: offerId, p_offer: normalizeOffer(body.offer) };
        break;
      case 'reject_trade':
        if (!offerId) return jsonResponse({ ok: false, error: 'TRADE_ID_REQUIRED' });
        functionName = 'player_reject_trade';
        args = { p_actor_tg_id: actorTgId, p_offer_id: offerId };
        break;
      default:
        return jsonResponse({ ok: false, error: 'UNKNOWN_ACTION' });
    }

    const { data, error } = await supabase.rpc(functionName, args);
    if (error) return jsonResponse({ ok: false, error: error.message, code: error.code });
    return jsonResponse({ ok: true, result: data });
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : 'INVALID_REQUEST' }, 500);
  }
});

