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

function normalizeText(value: unknown, maxLength = 160) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeQuantity(value: unknown, max = 100000) {
  const quantity = Math.floor(Number(value));
  return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= max ? quantity : null;
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key: CryptoKey | Uint8Array, data: string) {
  const cryptoKey = key instanceof CryptoKey
    ? key
    : await crypto.subtle.importKey(
      'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function verifyTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash')?.toLowerCase() || '';
  if (!/^[a-f0-9]{64}$/.test(receivedHash)) return { ok: false, reason: 'missing_or_invalid_hash', user: null };

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKeyBuffer = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const secretKey = await crypto.subtle.importKey(
    'raw', secretKeyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const calculatedHash = bytesToHex(await hmacSha256(secretKey, dataCheckString));
  if (calculatedHash !== receivedHash) return { ok: false, reason: 'bad_hash', user: null };

  const authDate = Number(params.get('auth_date') || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > 86400 || authDate - now > 300) {
    return { ok: false, reason: 'expired_init_data', user: null };
  }

  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user?.id) return { ok: false, reason: 'missing_user', user: null };
    return { ok: true, reason: 'verified', user };
  } catch {
    return { ok: false, reason: 'invalid_user_json', user: null };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || '';
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || Deno.env.get('BOT_TOKEN') || '';
    if (!supabaseUrl || !serviceRoleKey || !botToken) {
      console.error('[hospital-warehouse] Missing server environment variables');
      return jsonResponse({ ok: false, error: 'SERVER_NOT_CONFIGURED' }, 500);
    }

    const body = await req.json() as Record<string, unknown>;
    const initData = normalizeText(body.initData, 16384);
    const verified = await verifyTelegramInitData(initData, botToken);
    if (!verified.ok || !verified.user?.id) {
      return jsonResponse({ ok: false, error: 'TELEGRAM_SESSION_INVALID', reason: verified.reason }, 401);
    }

    const actorTgId = String(verified.user.id);
    const action = normalizeText(body.action, 40);
    const hospitalId = normalizeText(body.hospitalId);
    const itemType = normalizeText(body.itemType, 48);
    const medicineType = normalizeText(body.medicineType, 48);
    const target = normalizeText(body.target, 64);
    const rank = normalizeText(body.rank, 24).toLowerCase();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let functionName = '';
    let args: Record<string, unknown> = {};

    switch (action) {
      case 'context':
        if (!hospitalId) return jsonResponse({ ok: false, error: 'HOSPITAL_ID_REQUIRED' });
        functionName = 'hospital_get_context';
        args = { p_hospital_id: hospitalId, p_actor_tg_id: actorTgId };
        break;
      case 'refill':
      case 'take': {
        const quantity = normalizeQuantity(body.quantity);
        if (!hospitalId || !itemType || !quantity) return jsonResponse({ ok: false, error: 'INVALID_STOCK_REQUEST' });
        functionName = action === 'refill' ? 'hospital_refill_stock' : 'hospital_take_stock';
        args = { p_hospital_id: hospitalId, p_actor_tg_id: actorTgId, p_item_type: itemType, p_quantity: quantity };
        break;
      }
      case 'order_food': {
        const quantity = normalizeQuantity(body.quantity);
        if (!hospitalId || !quantity) return jsonResponse({ ok: false, error: 'INVALID_ORDER_REQUEST' });
        functionName = 'hospital_order_food';
        args = { p_hospital_id: hospitalId, p_actor_tg_id: actorTgId, p_quantity: quantity };
        break;
      }
      case 'employees':
        if (!hospitalId) return jsonResponse({ ok: false, error: 'HOSPITAL_ID_REQUIRED' });
        functionName = 'hospital_list_employees';
        args = { p_hospital_id: hospitalId, p_actor_tg_id: actorTgId };
        break;
      case 'set_employee_rank':
        if (!hospitalId || !target || !rank) return jsonResponse({ ok: false, error: 'INVALID_EMPLOYEE_REQUEST' });
        functionName = 'hospital_set_employee_rank';
        args = { p_hospital_id: hospitalId, p_actor_tg_id: actorTgId, p_target: target, p_rank: rank };
        break;
      case 'stats':
        if (!hospitalId) return jsonResponse({ ok: false, error: 'HOSPITAL_ID_REQUIRED' });
        functionName = 'hospital_get_stats';
        args = { p_hospital_id: hospitalId, p_actor_tg_id: actorTgId };
        break;
      case 'treat':
        if (!hospitalId || !target || !medicineType) return jsonResponse({ ok: false, error: 'INVALID_TREATMENT_REQUEST' });
        functionName = 'hospital_treat_player';
        args = { p_hospital_id: hospitalId, p_actor_tg_id: actorTgId, p_target: target, p_medicine_type: medicineType };
        break;
      case 'sell': {
        const quantity = normalizeQuantity(body.quantity, 1000);
        if (!hospitalId || !target || !medicineType || !quantity) return jsonResponse({ ok: false, error: 'INVALID_SALE_REQUEST' });
        functionName = 'hospital_sell_medicine';
        args = {
          p_hospital_id: hospitalId,
          p_actor_tg_id: actorTgId,
          p_target: target,
          p_medicine_type: medicineType,
          p_quantity: quantity,
        };
        break;
      }
      case 'process_treatment':
        functionName = 'hospital_process_my_treatment';
        args = { p_patient_tg_id: actorTgId };
        break;
      case 'pickup_layout':
        functionName = 'hospital_get_pickup_layout';
        args = { p_actor_tg_id: actorTgId };
        break;
      case 'save_pickup_layout': {
        const pickups = Array.isArray(body.pickups) ? body.pickups.slice(0, 20) : null;
        if (!pickups) return jsonResponse({ ok: false, error: 'INVALID_PICKUP_LAYOUT' });
        functionName = 'hospital_save_pickup_layout';
        args = { p_actor_tg_id: actorTgId, p_pickups: pickups };
        break;
      }
      default:
        return jsonResponse({ ok: false, error: 'UNKNOWN_ACTION' });
    }

    const { data, error } = await supabase.rpc(functionName, args);
    if (error) {
      console.warn(`[hospital-warehouse] ${functionName} failed:`, error.message);
      return jsonResponse({ ok: false, error: error.message, code: error.code });
    }
    return jsonResponse({ ok: true, result: data });
  } catch (error) {
    console.error('[hospital-warehouse] Unexpected error:', error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'INVALID_REQUEST',
    });
  }
});
