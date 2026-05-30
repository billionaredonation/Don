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

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const userRaw = params.get('user');

  if (!userRaw) return null;

  try {
    return JSON.parse(userRaw);
  } catch {
    return null;
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

    const telegramUser = parseInitData(initData);

    if (!telegramUser?.id) {
      return jsonResponse(
        {
          ok: false,
          isAdmin: false,
          reason: 'invalid_telegram_user',
        },
        401
      );
    }

    const supabaseUrl = Deno.env.get('URL');
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[admin-session] missing env:', {
        hasUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });

      return jsonResponse(
        {
          ok: false,
          isAdmin: false,
          reason: 'missing_server_env',
        },
        500
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const telegramId = String(telegramUser.id);

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
