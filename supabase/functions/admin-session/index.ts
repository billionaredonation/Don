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
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key: CryptoKey | Uint8Array, data: string) {
  const cryptoKey =
    key instanceof CryptoKey
      ? key
      : await crypto.subtle.importKey(
          'raw',
          key,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );

  return crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(data)
  );
}

async function verifyTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');

  if (!receivedHash) {
    return {
      ok: false,
      reason: 'missing_hash',
      user: null,
    };
  }

  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKeyBuffer = await hmacSha256(
    new TextEncoder().encode('WebAppData'),
    botToken
  );

  const secretKey = await crypto.subtle.importKey(
    'raw',
    secretKeyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const calculatedHashBuffer = await hmacSha256(secretKey, dataCheckString);
  const calculatedHash = bytesToHex(calculatedHashBuffer);

  if (calculatedHash !== receivedHash) {
    return {
      ok: false,
      reason: 'bad_hash',
      user: null,
    };
  }

  const authDateRaw = params.get('auth_date');
  const authDate = Number(authDateRaw || 0);
  const now = Math.floor(Date.now() / 1000);

  if (!authDate || now - authDate > 86400) {
    return {
      ok: false,
      reason: 'expired_init_data',
      user: null,
    };
  }

  const userRaw = params.get('user');

  if (!userRaw) {
    return {
      ok: false,
      reason: 'missing_user',
      user: null,
    };
  }

  try {
    return {
      ok: true,
      reason: 'verified',
      user: JSON.parse(userRaw),
    };
  } catch {
    return {
      ok: false,
      reason: 'invalid_user_json',
      user: null,
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      {
        ok: false,
        isAdmin: false,
        reason: 'method_not_allowed',
      },
      405
    );
  }

  try {
    const { initData } = await req.json();

    if (!initData || typeof initData !== 'string') {
      return jsonResponse(
        {
          ok: false,
          isAdmin: false,
          reason: 'missing_init_data',
        },
        400
      );
    }

    const supabaseUrl = Deno.env.get('URL');
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
    const botToken = Deno.env.get('BOT_TOKEN');

    if (!supabaseUrl || !serviceRoleKey || !botToken) {
      return jsonResponse(
        {
          ok: false,
          isAdmin: false,
          reason: 'missing_server_env',
        },
        500
      );
    }

    const verifiedTelegram = await verifyTelegramInitData(initData, botToken);

    if (!verifiedTelegram.ok || !verifiedTelegram.user?.id) {
      return jsonResponse(
        {
          ok: false,
          isAdmin: false,
          reason: verifiedTelegram.reason,
        },
        401
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const telegramId = String(verifiedTelegram.user.id);

    const { data: player, error } = await supabaseAdmin
      .from('players')
      .select('id, telegram_id, nickname, city, is_admin')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (error) {
      console.error('[admin-session] players query error:', error);

      return jsonResponse(
        {
          ok: false,
          isAdmin: false,
          reason: 'database_error',
        },
        500
      );
    }

    if (!player) {
      return jsonResponse({
        ok: true,
        isAdmin: false,
        reason: 'player_not_found',
      });
    }

    const isAdmin = player.is_admin === true;

    return jsonResponse({
      ok: true,
      isAdmin,
      player,
      reason: isAdmin ? 'admin_allowed' : 'not_admin',
    });
  } catch (error) {
    console.error('[admin-session] unexpected error:', error);

    return jsonResponse(
      {
        ok: false,
        isAdmin: false,
        reason: 'unexpected_error',
      },
      500
    );
  }
});
