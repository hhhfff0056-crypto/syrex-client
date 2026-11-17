import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.83.0";

// Account-bound device licensing for Syrex. The client sends only SHA-256
// of a stable, user-consented device identifier; raw hardware IDs never leave the PC.
const allowedOrigin = "https://hhhfff0056-crypto.github.io";
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  Vary: "Origin",
};
const json = (value: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(value), { status, headers });

function envKey(jsonName: string, legacyName: string): string {
  try {
    const keys = JSON.parse(Deno.env.get(jsonName) || "{}");
    const candidate = keys.default || Object.values(keys)[0];
    if (typeof candidate === "string" && candidate.length > 20) return candidate;
  } catch { /* Fall back to the legacy key. */ }
  return Deno.env.get(legacyName) || "";
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newSalt(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return origin === allowedOrigin
      ? new Response(null, { status: 204, headers })
      : json({ error: "Forbidden" }, 403);
  }
  // Browsers must use the published site. Native clients normally have no Origin header.
  if (req.method !== "POST" || (origin && origin !== allowedOrigin)) {
    return json({ error: "Недопустимый запрос." }, 403);
  }
  if (Number(req.headers.get("content-length") || 0) > 2048) {
    return json({ error: "Слишком большой запрос." }, 413);
  }
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Войдите в аккаунт Syrex." }, 401);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return json({ error: "Сервис недоступен." }, 503);

  try {
    const publicClient = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await publicClient.auth.getUser(token);
    if (authError || !user?.id) return json({ error: "Сеанс истёк. Войдите снова." }, 401);

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let payload: Record<string, unknown> = {};
    try {
      const raw = await req.text();
      if (raw.length > 2048) return json({ error: "Слишком большой запрос." }, 413);
      payload = JSON.parse(raw);
      if (!payload || Array.isArray(payload) || typeof payload !== "object") throw new Error("Invalid JSON");
    } catch {
      return json({ error: "Некорректные данные." }, 400);
    }

    const action = payload.action;
    if (action !== "status" && action !== "bind" && action !== "verify") {
      return json({ error: "Неизвестная операция." }, 400);
    }
    const { data: existing, error: bindingError } = await admin
      .from("syrex_device_bindings")
      .select("salt, fingerprint_digest, bound_at, last_seen_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (bindingError) throw bindingError;

    if (action === "status") {
      return json({
        bound: Boolean(existing),
        boundAt: existing?.bound_at || null,
        lastSeenAt: existing?.last_seen_at || null,
      });
    }

    // Never accept raw serials, MAC addresses, hardware records or arbitrary IDs.
    const clientHash = typeof payload.hwidHash === "string"
      ? payload.hwidHash.toLowerCase() : "";
    if (!/^[0-9a-f]{64}$/.test(clientHash)) {
      return json({ error: "Неверный формат HWID. Нужен SHA-256." }, 400);
    }

    let binding = existing;
    if (!binding && action === "verify") {
      return json({ code: "DEVICE_NOT_BOUND", error: "Сначала привяжите устройство." }, 409);
    }
    if (!binding && action === "bind") {
      const salt = newSalt();
      const fingerprint_digest = await sha256Hex(salt + ":" + clientHash);
      // The user_id primary key makes simultaneous first logins race-safe.
      const { error: insertError } = await admin.from("syrex_device_bindings").insert({
        user_id: user.id, salt, fingerprint_digest,
      });
      if (insertError && insertError.code !== "23505") throw insertError;
      const { data: current, error: readError } = await admin
        .from("syrex_device_bindings")
        .select("salt, fingerprint_digest, bound_at, last_seen_at")
        .eq("user_id", user.id).single();
      if (readError) throw readError;
      binding = current;
    }
    if (!binding) return json({ error: "Не удалось привязать устройство." }, 500);

    const candidate = await sha256Hex(binding.salt + ":" + clientHash);
    if (candidate !== binding.fingerprint_digest) {
      return json({
        code: "DEVICE_MISMATCH",
        error: "Аккаунт уже привязан к другому устройству. Обратитесь в поддержку для сброса HWID.",
      }, 409);
    }

    // Avoid an extra database write on every frame or repeated API call.
    if (Date.now() - new Date(binding.last_seen_at).getTime() > 15 * 60 * 1000) {
      const { error: seenError } = await admin.from("syrex_device_bindings")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (seenError) throw seenError;
    }

    const [{ data: license, error: licenseError }, { data: identity, error: idError }] =
      await Promise.all([
        admin.from("syrex_licenses").select("expires_at,activated_at")
          .eq("user_id", user.id).maybeSingle(),
        admin.from("syrex_user_uids").select("uid")
          .eq("user_id", user.id).single(),
      ]);
    if (licenseError || idError || !identity) throw licenseError || idError || new Error("UID missing");
    const licensed = Boolean(license) && (!license?.expires_at ||
      new Date(license.expires_at).getTime() > Date.now());
    const isDeveloper = String(user.app_metadata?.role || "").toUpperCase() === "DEV";
    const active = licensed || isDeveloper;

    return json({
      success: true,
      bound: true,
      uid: Number(identity.uid),
      edition: active ? "PREMIUM" : "FREE",
      premium: active,
      expiresAt: license?.expires_at || null,
    });
  } catch (error) {
    console.error("Syrex device API failure:", error instanceof Error ? error.message : "unknown");
    return json({ error: "Не удалось проверить устройство. Повторите попытку." }, 500);
  }
});
