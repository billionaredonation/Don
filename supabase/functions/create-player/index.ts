import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/response.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

type CreatePlayerBody = {
  tg_id?: string;
  nickname?: string;
  city?: string;
};

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function isValidNickname(nickname: string) {
  return /^[a-zA-Zа-яА-ЯёЁіІїЇєЄґҐ0-9_-]{3,16}$/.test(nickname);
}

function isValidCity(city: string) {
  return /^[a-z0-9-]{2,40}$/.test(city);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const body = await req.json() as CreatePlayerBody;

    const tgId = normalizeText(body.tg_id);
    const nickname = normalizeText(body.nickname);
    const city = normalizeText(body.city);

    if (!tgId) {
      return errorResponse('tg_id is required', 400);
    }

    if (!isValidNickname(nickname)) {
      return errorResponse('Nickname must be 3-16 valid characters', 400);
    }

    if (!isValidCity(city)) {
      return errorResponse('Invalid city', 400);
    }

    const { data: existingPlayer, error: existingError } = await supabaseAdmin
      .from('players')
      .select('id, tg_id, nickname, city, balance, level, is_admin, created_at, updated_at')
      .eq('tg_id', tgId)
      .maybeSingle();

    if (existingError) {
      return errorResponse('Failed to check existing player', 500, existingError.message);
    }

    if (existingPlayer) {
      return jsonResponse({
        ok: true,
        created: false,
        player: existingPlayer,
      });
    }

    const { data: player, error: insertError } = await supabaseAdmin
      .from('players')
      .insert({
        tg_id: tgId,
        nickname,
        city,
        balance: 0,
        level: 1,
        is_admin: false,
      })
      .select('id, tg_id, nickname, city, balance, level, is_admin, created_at, updated_at')
      .single();

    if (insertError) {
      return errorResponse('Failed to create player', 500, insertError.message);
    }

    return jsonResponse({
      ok: true,
      created: true,
      player,
    });
  } catch (error) {
    return errorResponse('Invalid request', 400, error instanceof Error ? error.message : error);
  }
});
