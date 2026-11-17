import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.83.0";

// This function handles license issuing/redemption, under server-enforced auth.
// Never let browser-supplied roles or user IDs decide permission.
const allowedOrigin = "https://hhhfff0056-crypto.github.io";
const bucketName = "syrex-client";
const objectName = "SyrexClient.jar";
const freeObjectName = "SyrexFree.jar";
// Public Free edition: verified existing Dropbox shared link (dl=1 starts a download).
const freeFallbackUrl = "https://www.dropbox.com/scl/fi/ptjoaft0f70v5l9c110s2/Syrex-Sword-1.21.11.jar?rlkey=7hji9ywpejozagfwmq2wqjqf2&dl=1";
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};
const respond = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
const encoder = new TextEncoder();

function envKey(jsonName: string, legacyName: string): string {
  try {
    const keys = JSON.parse(Deno.env.get(jsonName) || "{}");
    const val = keys.default || Object.values(keys)[0];
    if (typeof val === "string" && val.length > 20) return val;
  } catch { /* Use legacy fallback below. */ }
  return Deno.env.get(legacyName) || "";
}

function issueKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes, (b) => alphabet[b & 31]).join("");
  return "SYREX-" + code.match(/.{5}/g)!.join("-");
}

function normalizeKey(value: unknown) {
  if (typeof value !== "string") return "";
  const compact = value.toUpperCase().replace(/[\s-]+/g, "");
  if (!/^SYREX[A-HJ-NP-Z2-9]{20}$/.test(compact)) return "";
  const part = compact.slice(5);
  return "SYREX-" + part.match(/.{5}/g)!.join("-");
}

async function sha256Hex(input: string) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Syrex keys:", message);
  return "Ошибка сервера ключей. Повторите попытку.";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return req.headers.get("origin") === allowedOrigin
      ? new Response(null, { status: 204, headers })
      : respond({ error: "Forbidden" }, 403);
  }
  if (req.method !== "POST" || req.headers.get("origin") !== allowedOrigin) {
    return respond({ error: "Недопустимый запрос." }, 403);
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) {
    return respond({ error: "Сервис ключей ещё не готов." }, 503);
  }
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return respond({ error: "Войдите в аккаунт." }, 401);

  try {
    const publicClient = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await publicClient.auth.getUser(token);
    if (authError || !user?.id) return respond({ error: "Сеанс истёк. Войдите заново." }, 401);

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Read role from Supabase Auth app_metadata fetched from server, not user_metadata.
    const isDeveloper = String(user.app_metadata?.role || "").toUpperCase() === "DEV";
    let payload: Record<string, unknown> = {};
    try { payload = await req.json(); } catch { return respond({ error: "Неверный запрос." }, 400); }
    const action = payload.action;

    if (action === "status" || action === "download" || action === "download-free") {
      const { data: license, error: dbError } = await admin.from("syrex_licenses")
        .select("expires_at,activated_at")
        .eq("user_id", user.id).maybeSingle();
      if (dbError) throw dbError;
      const expiresAt = license?.expires_at || null;
      const licensed = Boolean(license) && (!expiresAt || new Date(expiresAt).getTime() > Date.now());
      const active = licensed || isDeveloper;
      // Both editions live in the private bucket. Neither has a public URL.
      const { data: objects, error: storageError } = await admin.storage.from(bucketName).list("", {
        limit: 100
      });
      if (storageError) throw storageError;
      const premiumFileReady = Boolean(objects?.some((item) => item.name === objectName));
      const storedFreeFileReady = Boolean(objects?.some((item) => item.name === freeObjectName));
      const freeFileReady = storedFreeFileReady || Boolean(freeFallbackUrl);

      if (action === "status") {
        return respond({
          active, licensed, isDeveloper,
          edition: active ? "PREMIUM" : "FREE",
          activatedAt: license?.activated_at || null,
          expiresAt,
          fileReady: premiumFileReady,
          premiumFileReady, freeFileReady
        });
      }
      const isFreeDownload = action === "download-free";
      if (!isFreeDownload && !active) return respond({ error: "Для Premium требуется активная подписка." }, 403);
      if (isFreeDownload && !freeFileReady) return respond({ error: "Бесплатная версия ещё не загружена администратором." }, 404);
      if (isFreeDownload && !storedFreeFileReady) return respond({ url: freeFallbackUrl, external: true });
      if (!isFreeDownload && !premiumFileReady) return respond({ error: "Premium-версия ещё не загружена администратором." }, 404);
      const downloadName = isFreeDownload ? freeObjectName : objectName;
      const { data, error: linkError } = await admin.storage.from(bucketName)
        .createSignedUrl(downloadName, 60, { download: downloadName });
      if (linkError || !data?.signedUrl) throw linkError || new Error("Signed URL unavailable");
      return respond({ url: data.signedUrl, expiresInSeconds: 60 });
    }

    if (action === "redeem") {
      const code = normalizeKey(payload.key);
      if (!code) return respond({ error: "Неверный формат ключа." }, 400);
      const hash = await sha256Hex(code);
      const { data, error } = await admin.rpc("syrex_redeem_activation", {
        p_user_id: user.id, p_key_hash: hash,
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (result?.ok) return respond({ success: true, expiresAt: result.valid_until || null });
      const errors: Record<string, string> = {
        RATE_LIMIT: "Слишком много попыток. Повторите через 10 минут.",
        ALREADY_ACTIVE: "На аккаунте уже есть активная лицензия.",
        INVALID_KEY: "Ключ не найден или уже использован.",
      };
      return respond({ error: errors[result?.result_code] || "Не удалось активировать ключ." }, 400);
    }

    if (action === "generate") {
      if (!isDeveloper) return respond({ error: "Только DEV может создавать ключи." }, 403);
      const count = Number(payload.count);
      const durationDays = Number(payload.durationDays);
      if (!Number.isInteger(count) || count < 1 || count > 10 ||
          ![0, 30, 90, 180].includes(durationDays)) {
        return respond({ error: "Выберите 1–10 ключей и допустимый срок доступа." }, 400);
      }
      const codes = Array.from({ length: count }, issueKey);
      const rows = await Promise.all(codes.map(async (code) => ({
        key_hash: await sha256Hex(code),
        key_preview: code.slice(0, 11) + "•••••",
        duration_days: durationDays,
        issued_by: user.id,
      })));
      const { error: insertError } = await admin.from("syrex_activation_keys").insert(rows);
      if (insertError) throw insertError;
      // The plaintext codes are returned once, never stored in the database.
      return respond({ keys: codes, durationDays });
    }

    if (action === "history") {
      if (!isDeveloper) return respond({ error: "Только DEV может просматривать историю." }, 403);
      const { data, error } = await admin.from("syrex_activation_keys")
        .select("key_preview, duration_days, created_at, redeemed_at")
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return respond({ keys: data || [] });
    }

    return respond({ error: "Неизвестная операция." }, 400);
  } catch (error) {
    return respond({ error: normalizeError(error) }, 500);
  }
});
