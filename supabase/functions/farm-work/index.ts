import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const EDGE_RELEASE = '2026-08-10-farm-prototype-v1';

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

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
  const secret = await crypto.subtle.importKey(
    'raw', secretBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );

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
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let functionName = '';
    let args: Record<string, unknown> = {};

    switch (action) {
      case 'inventory':
        functionName = 'farm_get_inventory';
        args = { p_actor_tg_id: actorTgId };
        break;
      case 'buy':
        functionName = 'farm_buy_item';
        args = { p_actor_tg_id: actorTgId, p_item_type: text(body.itemType, 48).toLowerCase() };
        break;
      case 'till':
        functionName = 'farm_till_plot';
        args = {
          p_actor_tg_id: actorTgId,
          p_city_id: text(body.cityId, 80),
          p_field_object_id: text(body.fieldObjectId, 100),
          p_x: Math.max(0, Math.min(100, finiteNumber(body.x, 50))),
          p_y: Math.max(0, Math.min(100, finiteNumber(body.y, 50))),
        };
        break;
      case 'plant':
        functionName = 'farm_plant_seed';
        args = {
          p_actor_tg_id: actorTgId,
          p_plot_id: text(body.plotId, 80),
          p_crop_type: text(body.cropType, 24).toLowerCase(),
        };
        break;
      case 'rake':
        functionName = 'farm_rake_plot';
        args = { p_actor_tg_id: actorTgId, p_plot_id: text(body.plotId, 80) };
        break;
      case 'water':
        functionName = 'farm_water_plot';
        args = { p_actor_tg_id: actorTgId, p_plot_id: text(body.plotId, 80) };
        break;
      case 'harvest':
        functionName = 'farm_harvest_plot';
        args = { p_actor_tg_id: actorTgId, p_plot_id: text(body.plotId, 80) };
        break;
      case 'sell': {
        const rawQuantity = Math.floor(Number(body.quantity));
        const quantity = Number.isSafeInteger(rawQuantity) ? Math.max(0, Math.min(100000, rawQuantity)) : 0;
        functionName = 'farm_sell_item';
        args = {
          p_actor_tg_id: actorTgId,
          p_item_type: text(body.itemType, 48).toLowerCase(),
          p_quantity: quantity,
        };
        break;
      }
      default:
        return jsonResponse({ ok: false, error: 'UNKNOWN_ACTION' });
    }

    const { data, error } = await supabase.rpc(functionName, args);
    if (error) {
      console.warn(`[farm-work] ${functionName} failed:`, error.message);
      return jsonResponse({ ok: false, error: error.message, code: error.code, action, rpc: functionName });
    }

    return jsonResponse({ ok: true, result: data, action, rpc: functionName, edgeRelease: EDGE_RELEASE });
  } catch (error) {
    console.error('[farm-work] unexpected:', error);
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : 'INVALID_REQUEST' }, 500);
  }
});
