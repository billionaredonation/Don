import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/response.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

type GetPlayerBody = {
  tg_id?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const body = await req.json() as GetPlayerBody;
    const tgId = String(body.tg_id || '').trim();

    if (!tgId) {
      return errorResponse('tg_id is required', 400);
    }

    const { data, error } = await supabaseAdmin
      .from('players')
      .select('id, tg_id, nickname, city, balance, health, food, water, level, is_admin, created_at, updated_at')
      .eq('tg_id', tgId)
      .maybeSingle();

    if (error) {
      return errorResponse('Failed to load player', 500, error.message);
    }

    return jsonResponse({
      ok: true,
      player: data ?? null,
    });
  } catch (error) {
    return errorResponse('Invalid request', 400, error instanceof Error ? error.message : error);
  }
});
