import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(key: Uint8Array, data: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      new TextEncoder().encode(data),
    ),
  );
}

async function verifyTelegramInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    throw new Error("Missing hash");
  }

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(BOT_TOKEN),
  );

  const signature = await hmacSha256(
    new Uint8Array(secretKey),
    dataCheckString,
  );

  const calculatedHash = hex(signature);

  if (calculatedHash !== hash) {
    throw new Error("Invalid Telegram hash");
  }

  const userRaw = params.get("user");

  if (!userRaw) {
    throw new Error("Missing Telegram user");
  }

  return JSON.parse(userRaw);
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const { initData } = await req.json();

    if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error("Server env is not configured");
    }

    if (!initData) {
      throw new Error("Missing initData");
    }

    const user = await verifyTelegramInitData(initData);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    await supabase
      .from("telegram_sessions")
      .upsert({
        telegram_id: String(user.id),
        username: user.username || null,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        last_seen_at: new Date().toISOString(),
      });

    return Response.json({
      ok: true,
      telegramUser: {
        id: String(user.id),
        username: user.username || null,
        firstName: user.first_name || null,
        lastName: user.last_name || null,
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error?.message || "Unauthorized",
      },
      { status: 401 },
    );
  }
});
