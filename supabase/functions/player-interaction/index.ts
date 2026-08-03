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

function nonNegativeInteger(value: unknown, max = 1_000_000_000) {
  const number = Math.floor(Number(value));
  return Number.isSafeInteger(number) && number >= 0 && number <= max ? number : null;
}

function normalizeOffer(value: unknown) {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const amount = (input: unknown) => {
    const number = Math.floor(Number(input || 0));
    return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 1_000_000_000) : 0;
  };
  const validItemType = (input: unknown) => {
    const itemType = text(input, 64).toLowerCase();
    return /^[a-z0-9][a-z0-9_:-]{0,63}$/.test(itemType) ? itemType : '';
  };
  const normalizedItems = new Map<string, {
    itemType: string;
    quantity: number;
    source: string;
    hospitalId: string | null;
  }>();
  const addItem = (rawItem: Record<string, unknown>) => {
    const itemType = validItemType(rawItem.itemType || rawItem.type);
    const quantity = amount(rawItem.quantity);
    if (!itemType || !quantity) return;
    const itemSource = text(rawItem.source || 'personal', 24).toLowerCase();
    const inventorySource = /^[a-z0-9_-]{1,24}$/.test(itemSource) ? itemSource : 'personal';
    const hospitalId = text(rawItem.hospitalId, 80) || null;
    const key = `${itemType}::${inventorySource}::${hospitalId || ''}`;
    const current = normalizedItems.get(key);
    if (current) current.quantity = Math.min(1_000_000_000, current.quantity + quantity);
    else if (normalizedItems.size < 9) {
      normalizedItems.set(key, { itemType, quantity, source: inventorySource, hospitalId });
    }
  };

  if (Array.isArray(source.items)) {
    source.items.slice(0, 9).forEach((item) => {
      if (item && typeof item === 'object') addItem(item as Record<string, unknown>);
    });
  }

  // Accept the legacy top-level shape as well. This keeps the deployed SQL
  // functions compatible while allowing the client to send arbitrary items.
  Object.entries(source).forEach(([key, quantity]) => {
    const itemType = validItemType(key);
    if (!itemType || itemType === 'money' || itemType === 'items') return;
    if ([...normalizedItems.values()].some((item) => item.itemType === itemType)) return;
    addItem({ itemType, quantity, source: 'personal' });
  });

  const items = [...normalizedItems.values()];
  // Keep the RPC payload flat: deployed trade SQL reads item types directly
  // from JSON keys. This still includes food and every other personal item,
  // while avoiding an array value that older generic SQL cannot cast.
  const result: Record<string, unknown> = { money: amount(source.money) };
  items.forEach((item) => {
    result[item.itemType] = Math.min(1_000_000_000, amount(result[item.itemType]) + item.quantity);
  });
  return result;
}


async function applyStaminaMetabolicCost(
  supabase: ReturnType<typeof createClient>,
  actorTgId: string,
  intervals: number,
  foodPerInterval = 1,
  waterPerInterval = 2,
) {
  const safeIntervals = Math.max(1, Math.min(10, Math.floor(Number(intervals) || 1)));
  const safeFoodPerInterval = Math.max(0, Math.min(10, Math.floor(Number(foodPerInterval) || 0)));
  const safeWaterPerInterval = Math.max(0, Math.min(10, Math.floor(Number(waterPerInterval) || 0)));
  const playerResult = await supabase
    .from('players')
    .select('health, food, water')
    .eq('tg_id', actorTgId)
    .maybeSingle();

  if (playerResult.error) {
    return { ok: false, error: playerResult.error.message, code: playerResult.error.code };
  }
  if (!playerResult.data) {
    return { ok: false, error: 'PLAYER_NOT_FOUND', code: 'PGRST116' };
  }

  const health = Math.max(0, Math.min(100, Number(playerResult.data.health ?? 100)));
  const food = Math.max(0, Math.min(100, Number(playerResult.data.food ?? 100)));
  const water = Math.max(0, Math.min(100, Number(playerResult.data.water ?? 100)));
  const foodCost = safeIntervals * safeFoodPerInterval;
  const waterCost = safeIntervals * safeWaterPerInterval;
  const nextFood = Math.max(0, food - foodCost);
  const nextWater = Math.max(0, water - waterCost);

  const updateResult = await supabase
    .from('players')
    .update({
      food: nextFood,
      water: nextWater,
      updated_at: new Date().toISOString(),
    })
    .eq('tg_id', actorTgId)
    .select('health, food, water')
    .maybeSingle();

  if (updateResult.error) {
    return { ok: false, error: updateResult.error.message, code: updateResult.error.code };
  }
  if (!updateResult.data) {
    return { ok: false, error: 'STAMINA_METABOLIC_UPDATE_FAILED', code: 'PGRST116' };
  }

  return {
    ok: true,
    result: {
      health: Math.max(0, Math.min(100, Number(updateResult.data.health ?? health))),
      food: Math.max(0, Math.min(100, Number(updateResult.data.food ?? nextFood))),
      water: Math.max(0, Math.min(100, Number(updateResult.data.water ?? nextWater))),
      foodCost,
      waterCost,
      recoveryIntervals: safeIntervals,
      sprintBlocked: nextFood < 10 || nextWater < 15,
      transport: 'player_interaction_service_role_update',
    },
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
    const hospitalId = text(body.hospitalId, 160);
    const medicineType = text(body.medicineType, 48).toLowerCase();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (
      action === 'stamina_usage' ||
      action === 'stamina_exhausted' ||
      action === 'stamina_recovery'
    ) {
      const intervals = action === 'stamina_exhausted'
        ? 1
        : positiveInteger(body.intervals, 10);

      if (!intervals) {
        return jsonResponse({ ok: false, error: 'INVALID_STAMINA_METABOLIC_REQUEST' });
      }

      const waterPerInterval = action === 'stamina_usage' ? 1 : 2;
      const staminaResult = await applyStaminaMetabolicCost(
        supabase,
        actorTgId,
        intervals,
        1,
        waterPerInterval,
      );
      if (!staminaResult.ok) {
        return jsonResponse({
          ok: false,
          error: staminaResult.error,
          code: staminaResult.code,
          action,
        });
      }

      return jsonResponse({ ok: true, result: staminaResult.result });
    }

    let functionName = '';
    let fallbackFunctionName = '';
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
      case 'treat_player_for_price': {
        const price = nonNegativeInteger(body.price);
        if (!hospitalId || !target || !medicineType || price === null) {
          return jsonResponse({ ok: false, error: 'INVALID_TREATMENT_REQUEST' });
        }
        functionName = 'hospital_treat_player_for_price_counted';
        fallbackFunctionName = 'hospital_treat_player_for_price';
        args = {
          p_hospital_id: hospitalId,
          p_actor_tg_id: actorTgId,
          p_target: target,
          p_medicine_type: medicineType,
          p_price: price,
        };
        break;
      }
      default:
        return jsonResponse({ ok: false, error: 'UNKNOWN_ACTION' });
    }

    let { data, error } = await supabase.rpc(functionName, args);
    const missingRpc = error && (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      /function .* does not exist|could not find the function/i.test(error.message || '')
    );

    if (missingRpc && fallbackFunctionName) {
      const fallback = await supabase.rpc(fallbackFunctionName, args);
      data = fallback.data;
      error = fallback.error;
      functionName = fallbackFunctionName;
    }

    if (error) {
      return jsonResponse({
        ok: false,
        error: error.message,
        code: error.code,
        action,
        rpc: functionName,
      });
    }
    return jsonResponse({ ok: true, result: data, action, rpc: functionName });
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : 'INVALID_REQUEST' }, 500);
  }
});
