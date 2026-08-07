// Hospital batch refresh 2026-07-20: warehouse edge function deploy marker.
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

function normalizeMoney(value: unknown, max = 1_000_000_000) {
  const amount = Math.floor(Number(value));
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= max ? amount : null;
}

async function applyStaminaMetabolicCost(
  supabase: ReturnType<typeof createClient>,
  actorTgId: string,
  intervals: number,
  foodPerInterval = 1,
  waterPerInterval = 1,
) {
  const safeIntervals = Math.max(1, Math.min(10, Math.floor(Number(intervals) || 1)));
  const safeFoodPerInterval = Math.max(0, Math.min(10, Math.floor(Number(foodPerInterval) || 0)));
  const safeWaterPerInterval = Math.max(0, Math.min(10, Math.floor(Number(waterPerInterval) || 0)));
  const positionPlayerId = `tg_${actorTgId}`;

  const rpcResult = await supabase.rpc('player_apply_position_stamina_cost', {
    p_actor_tg_id: actorTgId,
    p_intervals: safeIntervals,
    p_food_per_interval: safeFoodPerInterval,
    p_water_per_interval: safeWaterPerInterval,
  });

  if (!rpcResult.error && rpcResult.data) {
    return { ok: true, result: rpcResult.data };
  }

  const missingRpc = rpcResult.error && (
    rpcResult.error.code === 'PGRST202' ||
    rpcResult.error.code === '42883' ||
    /function .* does not exist|could not find the function/i.test(rpcResult.error.message || '')
  );

  if (rpcResult.error && !missingRpc) {
    return { ok: false, error: rpcResult.error.message, code: rpcResult.error.code };
  }

  // Health, food and water used by the map HUD live in player_positions.
  // Keep a direct-update fallback during a rolling deploy; the migration RPC
  // is atomic and becomes the primary path as soon as the schema cache sees it.
  const positionResult = await supabase
    .from('player_positions')
    .select('health, food, water')
    .eq('player_id', positionPlayerId)
    .maybeSingle();

  if (positionResult.error) {
    return { ok: false, error: positionResult.error.message, code: positionResult.error.code };
  }

  if (!positionResult.data) {
    return { ok: false, error: 'PLAYER_POSITION_NOT_FOUND', code: 'PGRST116' };
  }

  const health = Math.max(0, Math.min(100, Number(positionResult.data.health ?? 100)));
  const food = Math.max(0, Math.min(100, Number(positionResult.data.food ?? 100)));
  const water = Math.max(0, Math.min(100, Number(positionResult.data.water ?? 100)));
  const foodCost = safeIntervals * safeFoodPerInterval;
  const waterCost = safeIntervals * safeWaterPerInterval;
  const nextFood = Math.max(0, food - foodCost);
  const nextWater = Math.max(0, water - waterCost);

  const updateResult = await supabase
    .from('player_positions')
    .update({
      food: nextFood,
      water: nextWater,
      updated_at: new Date().toISOString(),
    })
    .eq('player_id', positionPlayerId)
    .select('health, food, water')
    .maybeSingle();

  if (updateResult.error) {
    return { ok: false, error: updateResult.error.message, code: updateResult.error.code };
  }

  if (!updateResult.data) {
    return { ok: false, error: 'STAMINA_POSITION_UPDATE_FAILED', code: 'PGRST116' };
  }

  const updatedHealth = Math.max(0, Math.min(100, Number(updateResult.data.health ?? health)));
  const updatedFood = Math.max(0, Math.min(100, Number(updateResult.data.food ?? nextFood)));
  const updatedWater = Math.max(0, Math.min(100, Number(updateResult.data.water ?? nextWater)));

  return {
    ok: true,
    result: {
      health: updatedHealth,
      food: updatedFood,
      water: updatedWater,
      foodCost,
      waterCost,
      recoveryIntervals: safeIntervals,
      sprintBlocked: updatedFood < 10 || updatedWater < 15,
      playerId: positionPlayerId,
      transport: 'player_positions_service_role_update',
    },
  };
}

function mergeProfessionalTreatmentStats(panelValue: unknown, statsValue: unknown) {
  if (!panelValue || typeof panelValue !== 'object' || Array.isArray(panelValue)) return panelValue;

  const panel = panelValue as Record<string, unknown>;
  const hospitals = Array.isArray(panel.hospitals) ? panel.hospitals : [];
  const statsPayload = statsValue && typeof statsValue === 'object' && !Array.isArray(statsValue)
    ? statsValue as Record<string, unknown>
    : {};
  const rows = Array.isArray(statsPayload.stats) ? statsPayload.stats : [];
  const treatmentCountByHospital = new Map<string, number>();

  rows.forEach((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const row = value as Record<string, unknown>;
    const hospitalId = String(row.hospitalId ?? row.hospital_id ?? '');
    const count = Number(row.professionalTreatments ?? row.playersTreated ?? row.players_treated ?? 0);
    if (hospitalId && Number.isFinite(count)) treatmentCountByHospital.set(hospitalId, Math.max(0, count));
  });

  return {
    ...panel,
    hospitals: hospitals.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      const hospital = value as Record<string, unknown>;
      const hospitalId = String(hospital.hospitalId ?? hospital.hospital_id ?? '');
      const extraTreatments = treatmentCountByHospital.get(hospitalId) || 0;
      const ownStats = hospital.ownStats && typeof hospital.ownStats === 'object' && !Array.isArray(hospital.ownStats)
        ? hospital.ownStats as Record<string, unknown>
        : {};

      return {
        ...hospital,
        ownStats: {
          ...ownStats,
          playersTreated: Math.max(0, Number(ownStats.playersTreated ?? ownStats.players_treated ?? 0)) + extraTreatments,
        },
      };
    }),
  };
}

function mergeItemPayload(primaryValue: unknown, extraValue: unknown) {
  const primary = primaryValue && typeof primaryValue === 'object' && !Array.isArray(primaryValue)
    ? primaryValue as Record<string, unknown>
    : {};
  const extra = extraValue && typeof extraValue === 'object' && !Array.isArray(extraValue)
    ? extraValue as Record<string, unknown>
    : {};
  const itemsByType = new Map<string, Record<string, unknown>>();

  const addItems = (value: unknown) => {
    if (!Array.isArray(value)) return;
    value.forEach((rawItem) => {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return;
      const item = rawItem as Record<string, unknown>;
      const itemType = String(item.itemType ?? item.item_type ?? '').trim();
      if (!itemType) return;
      itemsByType.set(itemType, { ...(itemsByType.get(itemType) || {}), ...item, itemType });
    });
  };

  addItems(primary.items);
  addItems(extra.items);

  return {
    ...primary,
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'items')),
    items: [...itemsByType.values()],
  };
}

async function sendSurvivalWarning(botToken: string, actorTgId: string, result: unknown) {
  if (!botToken || !actorTgId || !result || typeof result !== 'object' || Array.isArray(result)) return false;
  const payload = result as Record<string, unknown>;
  const health = Math.max(0, Math.round(Number(payload.health || 0)));
  const food = Math.max(0, Math.round(Number(payload.food || 0)));
  const water = Math.max(0, Math.round(Number(payload.water || 0)));
  const needs = [food < 10 ? 'покушать' : '', water < 15 ? 'попить' : ''].filter(Boolean).join(' и ');
  const message = `⚠️ Вашему персонажу срочно нужно ${needs || 'покушать и попить'}, чтобы не умереть от голода и обезвоживания. Осталось HP: ${health}/100.`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: actorTgId, text: message }),
    });
    return response.ok;
  } catch (error) {
    console.warn('[hospital-warehouse] Telegram survival warning failed:', error);
    return false;
  }
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
    const hospitalCityId = normalizeText(body.hospitalCityId, 80);
    const hospitalCityName = normalizeText(body.hospitalCityName, 80);
    const requestedHospitalNumber = Number(body.hospitalNumber);
    const hospitalNumber = Number.isSafeInteger(requestedHospitalNumber) && requestedHospitalNumber > 0
      ? requestedHospitalNumber
      : null;
    const itemType = normalizeText(body.itemType, 48);
    const medicineType = normalizeText(body.medicineType, 48);
    const target = normalizeText(body.target, 64);
    const rank = normalizeText(body.rank, 24).toLowerCase();
    const source = normalizeText(body.source, 32).toLowerCase();
    const isActive = body.active === true;
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
        : normalizeQuantity(body.intervals, 10);

      if (!intervals) {
        return jsonResponse({ ok: false, error: 'INVALID_STAMINA_RECOVERY_REQUEST' });
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
        console.warn('[hospital-warehouse] stamina metabolic update failed:', staminaResult.error);
        return jsonResponse({
          ok: false,
          error: staminaResult.error,
          code: staminaResult.code,
          action,
        });
      }

      return jsonResponse({ ok: true, result: staminaResult.result });
    }

    if (action === 'survival_tick') {
      const survivalResult = await supabase.rpc('player_process_position_survival_tick', {
        p_actor_tg_id: actorTgId,
        p_is_active: isActive,
      });

      if (survivalResult.error) {
        console.warn('[hospital-warehouse] player_process_position_survival_tick failed:', survivalResult.error.message);
        return jsonResponse({
          ok: false,
          error: survivalResult.error.message,
          code: survivalResult.error.code,
          action,
        });
      }

      let result = survivalResult.data;

      if (
        result && typeof result === 'object' && !Array.isArray(result) &&
        (result as Record<string, unknown>).notificationRequired === true
      ) {
        const telegramWarningSent = await sendSurvivalWarning(botToken, actorTgId, result);

        if (telegramWarningSent) {
          const notificationAck = await supabase.rpc('player_mark_position_survival_warning_sent', {
            p_actor_tg_id: actorTgId,
          });
          if (notificationAck.error) {
            console.warn('[hospital-warehouse] survival notification ack failed:', notificationAck.error.message);
          }
        }

        result = { ...(result as Record<string, unknown>), telegramWarningSent };
      }

      return jsonResponse({ ok: true, result });
    }

    let functionName = '';
    let fallbackFunctionName = '';
    let args: Record<string, unknown> = {};

    switch (action) {
      case 'register_hospital':
        if (!hospitalId || !hospitalCityId) return jsonResponse({ ok: false, error: 'HOSPITAL_IDENTITY_REQUIRED' });
        functionName = 'hospital_register_identity';
        args = {
          p_hospital_id: hospitalId,
          p_city_id: hospitalCityId,
          p_city_name: hospitalCityName || null,
          p_preferred_number: hospitalNumber,
        };
        break;
      case 'context':
        if (!hospitalId) return jsonResponse({ ok: false, error: 'HOSPITAL_ID_REQUIRED' });
        if (hospitalCityId) {
          const registration = await supabase.rpc('hospital_register_identity', {
            p_hospital_id: hospitalId,
            p_city_id: hospitalCityId,
            p_city_name: hospitalCityName || null,
            p_preferred_number: hospitalNumber,
          });
          if (registration.error) {
            console.warn('[hospital-warehouse] hospital_register_identity failed:', registration.error.message);
            return jsonResponse({ ok: false, error: registration.error.message, code: registration.error.code });
          }
        }
        functionName = 'hospital_get_context';
        args = { p_hospital_id: hospitalId, p_actor_tg_id: actorTgId };
        break;
      case 'my_employments':
        functionName = 'hospital_get_my_employments';
        args = { p_actor_tg_id: actorTgId };
        break;
      case 'management_panel':
        functionName = 'hospital_get_management_panel';
        args = { p_actor_tg_id: actorTgId };
        break;
      case 'management_purchase': {
        const quantity = normalizeQuantity(body.quantity);
        if (!hospitalId || !itemType || !quantity) return jsonResponse({ ok: false, error: 'INVALID_PURCHASE_REQUEST' });
        functionName = 'hospital_management_purchase';
        args = { p_hospital_id: hospitalId, p_actor_tg_id: actorTgId, p_item_type: itemType, p_quantity: quantity };
        break;
      }
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
        functionName = 'hospital_treat_player_with_metabolic_cost';
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
      case 'issue_medicine': {
        const price = normalizeMoney(body.price);
        if (!hospitalId || !target || !medicineType || price === null) {
          return jsonResponse({ ok: false, error: 'INVALID_ISSUE_REQUEST' });
        }
        functionName = 'hospital_issue_medicine';
        args = {
          p_hospital_id: hospitalId,
          p_actor_tg_id: actorTgId,
          p_target: target,
          p_medicine_type: medicineType,
          p_price: price,
        };
        break;
      }
      case 'treat_player_for_price': {
        const price = normalizeMoney(body.price);
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
      case 'my_medicine':
        functionName = 'player_get_medical_inventory';
        args = { p_actor_tg_id: actorTgId };
        break;
      case 'use_medicine':
        if (!medicineType) return jsonResponse({ ok: false, error: 'INVALID_MEDICINE_REQUEST' });
        functionName = 'player_apply_medicine_with_metabolic_cost';
        args = { p_actor_tg_id: actorTgId, p_medicine_type: medicineType };
        break;
      case 'use_inventory_item':
        if (!itemType) return jsonResponse({ ok: false, error: 'INVALID_ITEM_REQUEST' });
        if (itemType === 'water_bottle') {
          functionName = 'player_use_consumable_item';
          args = { p_actor_tg_id: actorTgId, p_item_type: itemType };
        } else if (itemType.startsWith('medicine_') && hospitalId) {
          functionName = 'hospital_use_own_inventory_medicine';
          args = {
            p_hospital_id: hospitalId,
            p_actor_tg_id: actorTgId,
            p_item_type: itemType,
            p_source: source || 'service',
          };
        } else if (itemType.startsWith('medicine_')) {
          functionName = 'player_use_inventory_item_with_metabolic_cost';
          args = {
            p_actor_tg_id: actorTgId,
            p_item_type: itemType,
            p_source: source || 'personal',
            p_hospital_id: hospitalId || null,
          };
        } else {
          functionName = 'player_use_inventory_item';
          args = {
            p_actor_tg_id: actorTgId,
            p_item_type: itemType,
            p_source: source || 'personal',
            p_hospital_id: hospitalId || null,
          };
        }
        break;
      case 'cafeteria_menu':
        functionName = 'cafeteria_get_menu';
        args = {};
        break;
      case 'cafeteria_buy': {
        const quantity = normalizeQuantity(body.quantity, 100);
        if (!itemType || !quantity) return jsonResponse({ ok: false, error: 'INVALID_CAFETERIA_BUY_REQUEST' });
        functionName = itemType === 'water_bottle' ? 'player_buy_consumable_item' : 'cafeteria_buy_item';
        args = { p_actor_tg_id: actorTgId, p_item_type: itemType, p_quantity: quantity };
        break;
      }
      case 'reception_offer':
        functionName = 'hospital_get_reception_offer';
        args = {};
        break;
      case 'reception_treat':
        functionName = 'hospital_buy_reception_treatment';
        args = { p_actor_tg_id: actorTgId };
        break;
      case 'sprint_usage':
        functionName = 'player_apply_sprint_usage';
        args = { p_actor_tg_id: actorTgId };
        break;
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

    let { data, error } = await supabase.rpc(functionName, args);
    const missingRpc = error && (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      /function .* does not exist|could not find the function/i.test(error.message || '')
    );

    // The treatment itself must keep working during a rolling deployment when
    // the base atomic RPC is present but the statistics wrapper is not yet in
    // PostgREST's schema cache. Statistics can catch up after the migration;
    // medicine, money and HP still remain one transaction in the base RPC.
    if (missingRpc && fallbackFunctionName) {
      const fallback = await supabase.rpc(fallbackFunctionName, args);
      data = fallback.data;
      error = fallback.error;
      functionName = fallbackFunctionName;
    }

    if (error) {
      console.warn(`[hospital-warehouse] ${functionName} failed:`, error.message);
      return jsonResponse({ ok: false, error: error.message, code: error.code });
    }

    let result = data;
    if (action === 'management_panel') {
      const treatmentStats = await supabase.rpc('hospital_get_professional_treatment_stats', {
        p_actor_tg_id: actorTgId,
      });

      if (treatmentStats.error) {
        console.warn('[hospital-warehouse] hospital_get_professional_treatment_stats failed:', treatmentStats.error.message);
      } else {
        result = mergeProfessionalTreatmentStats(data, treatmentStats.data);
      }
    }

    if (action === 'my_medicine') {
      const consumables = await supabase.rpc('player_get_consumable_inventory', {
        p_actor_tg_id: actorTgId,
      });
      if (consumables.error) {
        console.warn('[hospital-warehouse] player_get_consumable_inventory failed:', consumables.error.message);
      } else {
        result = mergeItemPayload(result, consumables.data);
      }
    }

    if (action === 'cafeteria_menu') {
      const consumables = await supabase.rpc('player_get_consumable_catalog');
      if (consumables.error) {
        console.warn('[hospital-warehouse] player_get_consumable_catalog failed:', consumables.error.message);
      } else {
        result = mergeItemPayload(result, consumables.data);
      }
    }

    if (
      (
        action === 'stamina_usage' ||
        action === 'stamina_exhausted' ||
        action === 'sprint_usage'
      ) &&
      result && typeof result === 'object' && !Array.isArray(result) &&
      (result as Record<string, unknown>).notificationRequired === true
    ) {
      const telegramWarningSent = await sendSurvivalWarning(botToken, actorTgId, result);
      if (!telegramWarningSent) {
        const retryNotification = await supabase.rpc('player_retry_survival_notification', {
          p_actor_tg_id: actorTgId,
        });
        if (retryNotification.error) {
          console.warn('[hospital-warehouse] survival notification retry reset failed:', retryNotification.error.message);
        }
      }
      result = { ...(result as Record<string, unknown>), telegramWarningSent };
    }

    return jsonResponse({ ok: true, result });
  } catch (error) {
    console.error('[hospital-warehouse] Unexpected error:', error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'INVALID_REQUEST',
    });
  }
});
