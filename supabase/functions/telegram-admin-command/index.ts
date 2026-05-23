import { createClient } from 'supabase';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const OWNER_TELEGRAM_IDS = Deno.env.get('OWNER_TELEGRAM_IDS') || '';

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeNickname(value: unknown) {
  return normalizeText(value).replace(/^@/, '').toLowerCase();
}

function isOwnerTelegramId(id: unknown) {
  const cleanId = normalizeText(id);

  if (!cleanId) return false;

  return OWNER_TELEGRAM_IDS
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(cleanId);
}

async function sendTelegramMessage(chatId: string | number, text: string) {
  if (!BOT_TOKEN || !chatId) return;

  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  });
}

function parseCommand(text: string) {
  const parts = text.trim().split(/\s+/);

  const command = parts[0]?.toLowerCase() || '';
  const action = parts[1]?.toLowerCase() || '';
  const role = parts[2]?.toLowerCase() || '';
  const nickname = parts[3] || '';

  return {
    command,
    action,
    role,
    nickname,
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error('Server env is not configured');
    }

    const update = await req.json();

    const message = update.message || update.edited_message || null;
    const chatId = message?.chat?.id;
    const fromId = message?.from?.id;
    const text = normalizeText(message?.text);

    if (!message || !chatId || !text) {
      return Response.json({ ok: true, skipped: true });
    }

    if (!isOwnerTelegramId(fromId)) {
      return Response.json({ ok: true, ignored: true });
    }

    const { command, action, role, nickname } = parseCommand(text);

    if (command !== '/set') {
      return Response.json({ ok: true, ignored: true });
    }

    if (action !== 'admin') {
      await sendTelegramMessage(chatId, 'Команда: /set admin nickname');
      return Response.json({ ok: true });
    }

    if (!nickname) {
      await sendTelegramMessage(chatId, 'Укажи ник: /set admin nickname');
      return Response.json({ ok: true });
    }

    const cleanNickname = normalizeNickname(nickname);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    if (role && role !== cleanNickname && role !== nickname.toLowerCase()) {
      // поддержка формата /set admin nickname уже есть.
      // role тут не используется отдельно, чтобы не ломать команду.
    }

    const { data: player, error: findError } = await supabase
      .from('players')
      .select('id, tg_id, nickname, is_admin')
      .ilike('nickname', cleanNickname)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    if (!player) {
      await sendTelegramMessage(
        chatId,
        `Игрок <b>${cleanNickname}</b> не найден в БД. Админка не выдана.`
      );

      return Response.json({
        ok: true,
        found: false,
      });
    }

    const { data: updatedPlayer, error: updateError } = await supabase
      .from('players')
      .update({
        is_admin: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', player.id)
      .select('id, tg_id, nickname, is_admin')
      .single();

    if (updateError) {
      throw updateError;
    }

    await sendTelegramMessage(
      chatId,
      `Админка выдана игроку <b>${updatedPlayer.nickname}</b>.`
    );

    return Response.json({
      ok: true,
      found: true,
      player: updatedPlayer,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
});
