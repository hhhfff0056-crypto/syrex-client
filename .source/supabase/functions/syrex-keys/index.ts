import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.83.0";

// This function handles license issuing/redemption, under server-enforced auth.
// Never let browser-supplied roles or user IDs decide permission.
const allowedOrigins = new Set([
  "https://syrex.us.mw",
  "https://www.syrex.us.mw",
  "https://hhhfff0056-crypto.github.io"
]);
const bucketName = "syrex-client";
const objectName = "SyrexClient.jar";
const freeObjectName = "SyrexFree.jar";
// Public Free edition: verified existing Dropbox shared link (dl=1 starts a download).
const freeFallbackUrl = "https://www.dropbox.com/scl/fi/9gd9fev6j6hne22v1h7tf/syrex_1.21.11.jar?rlkey=pm2ak0sbwodqpyjaps00w6sx8&dl=1";
const baseHeaders = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};
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


// The hash is not reversible without the server-only secret, and raw addresses
// and auth tokens are never written into the rate-limit table.
async function rateDigest(secret: string, subject: string): Promise<string> {
  const bytes = new TextEncoder().encode("syrex-rate-v1:" + secret + ":" + subject);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
function peerAddress(req: Request): string {
  const raw = req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const candidate = raw.trim();
  return /^[a-f0-9:.]{3,80}$/i.test(candidate) ? candidate : "unknown";
}
async function rateAllowed(admin: ReturnType<typeof createClient>, secret: string,
  scope: string, subject: string, maxHits: number, windowSeconds: number): Promise<boolean> {
  const fingerprint = await rateDigest(secret, subject);
  const { data, error } = await admin.rpc("syrex_rate_limit_check", {
    p_scope: scope, p_subject_hash: fingerprint, p_max_hits: maxHits, p_window_seconds: windowSeconds
  });
  if (error) throw error; // fail closed when DB throttling cannot be enforced
  return data === true;
}

Deno.serve(async (req: Request) => {
  const requestOrigin = req.headers.get("origin");
  const headers = {
    ...baseHeaders,
    ...(requestOrigin && allowedOrigins.has(requestOrigin)
      ? { "Access-Control-Allow-Origin": requestOrigin } : {})
  };
  const respond = (data: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  if (req.method === "OPTIONS") {
    return allowedOrigins.has(requestOrigin || "")
      ? new Response(null, { status: 204, headers })
      : respond({ error: "Forbidden" }, 403);
  }
  if (req.method !== "POST" || !allowedOrigins.has(requestOrigin || "")) {
    return respond({ error: "Недопустимый запрос." }, 403);
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) {
    return respond({ error: "Сервис ключей ещё не готов." }, 503);
  }
  if (Number(req.headers.get("content-length") || 0) > 4096) {
    return respond({ error: "Слишком большой запрос." }, 413);
  }
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return respond({ error: "Войдите в аккаунт." }, 401);

  try {
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (!(await rateAllowed(admin, secret, "keys-ip", "ip:" + peerAddress(req), 240, 60))) {
      return respond({ error: "Слишком много запросов. Повторите позже." }, 429);
    }
    const publicClient = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await publicClient.auth.getUser(token);
    if (authError || !user?.id) return respond({ error: "Сеанс истёк. Войдите заново." }, 401);
    // Read role from Supabase Auth app_metadata fetched from server, not user_metadata.
    const serverRole = String(user.app_metadata?.role || "").toUpperCase();
    const isDeveloper = serverRole === "DEV" || serverRole === "DEVELOPER";
    const isAdmin = isDeveloper || serverRole === "ADMIN";
    let payload: Record<string, unknown> = {};
    try { payload = await req.json(); } catch { return respond({ error: "Неверный запрос." }, 400); }
    const action = payload.action;
    const limits: Record<string, [number, number]> = {
      status: [120, 60], download: [15, 60], "download-free": [30, 60],
      redeem: [8, 600], generate: [10, 600], history: [45, 60],
      "admin-users": [30, 60], "admin-subscription": [15, 60],
      "presence": [6, 60], "online-users": [10, 60],
      "presence-visibility": [6, 60], "presence-offline": [6, 60], "server-visibility": [6, 60]
    };
    if (typeof action !== "string" || !limits[action]) {
      return respond({ error: "Неизвестная операция." }, 400);
    }
    const [maxHits, windowSeconds] = limits[action];
    const scope = action === "download-free" ? "keys-download" :
      action === "download" ? "keys-download" : "keys-" + action;
    if (!(await rateAllowed(admin, secret, scope, "user:" + user.id, maxHits, windowSeconds))) {
      return respond({ error: "Слишком много запросов. Повторите позже." }, 429);
    }

    // Public-facing online nickname is deliberately decoupled from account email,
    // user ID, client device, and any sensitive user profile information.
    const rawName = user.user_metadata?.username;
    const displayName = typeof rawName === "string" && /^[A-Za-z0-9_]{3,32}$/.test(rawName)
      ? rawName : "Игрок Syrex";

    if (action === "presence") {
      const { error } = await admin.from("syrex_site_presence")
        .upsert({
          user_id: user.id, display_name: displayName,
          last_seen_at: new Date().toISOString()
        }, { onConflict: "user_id" });
      if (error) throw error;
      return respond({ ok: true });
    }
    if (action === "presence-offline") {
      const { error } = await admin.from("syrex_site_presence")
        .update({ last_seen_at: "1970-01-01T00:00:00.000Z" })
        .eq("user_id", user.id);
      if (error) throw error;
      return respond({ ok: true });
    }
    if (action === "presence-visibility" || action === "server-visibility") {
      if (typeof payload.enabled !== "boolean") {
        return respond({ error: "Укажите enabled: true или false." }, 400);
      }
      const { data: row, error: currentError } = await admin.from("syrex_site_presence")
        .select("user_id").eq("user_id", user.id).maybeSingle();
      if (currentError) throw currentError;
      const column = action === "server-visibility" ? "show_server" : "show_online";
      const fields = {
        display_name: displayName, [column]: payload.enabled,
        last_seen_at: new Date().toISOString()
      };
      const { error } = row
        ? await admin.from("syrex_site_presence").update(fields).eq("user_id", user.id)
        : await admin.from("syrex_site_presence").insert({ user_id: user.id, ...fields });
      if (error) throw error;
      return respond({ ok: true, visible: payload.enabled });
    }
    if (action === "online-users") {
      // Activity is temporary, inferred from distinct authenticated heartbeats.
      // Server host is visible only after explicit show_server opt-in.
      // No user IDs, tokens, emails, IPs, or hardware identifiers are returned.
      const cutoff = new Date(Date.now() - 150000).toISOString();
      const [sites, games, mineResult] = await Promise.all([
        admin.from("syrex_site_presence")
          .select("user_id,display_name,show_online,show_server,last_seen_at")
          .eq("show_online", true).limit(500),
        admin.from("syrex_game_presence").select("user_id,server_host,last_seen_at")
          .gte("last_seen_at", cutoff).limit(500),
        admin.from("syrex_site_presence").select("show_online,show_server")
          .eq("user_id", user.id).maybeSingle()
      ]);
      if (sites.error || games.error || mineResult.error) {
        throw sites.error || games.error || mineResult.error;
      }
      const currentGame = new Map((games.data || []).map((row) => [row.user_id, row]));
      const members = (sites.data || []).flatMap((row) => {
        const siteActive = new Date(row.last_seen_at).getTime() >= Date.now() - 150000;
        const game = currentGame.get(row.user_id);
        if (!siteActive && !game) return [];
        return [{
          nickname: row.display_name,
          me: row.user_id === user.id,
          onSite: siteActive,
          playing: Boolean(game),
          server: game && row.show_server ? game.server_host : null
        }];
      });
      members.sort((a, b) => Number(b.playing) - Number(a.playing) || a.nickname.localeCompare(b.nickname));
      return respond({
        count: members.length, members,
        visible: mineResult.data?.show_online !== false,
        serverVisible: mineResult.data?.show_server === true
      });
    }

    if (action === "status" || action === "download" || action === "download-free") {
      const { data: license, error: dbError } = await admin.from("syrex_licenses")
        .select("expires_at,activated_at")
        .eq("user_id", user.id).maybeSingle();
      if (dbError) throw dbError;
      const expiresAt = license?.expires_at || null;
      const licensed = Boolean(license) && (!expiresAt || new Date(expiresAt).getTime() > Date.now());
      const { data: override, error: overrideError } = await admin.from("syrex_admin_subscriptions")
        .select("mode,expires_at").eq("user_id", user.id).maybeSingle();
      if (overrideError) throw overrideError;
      const overrideActive = override?.mode === "grant" &&
        (!override.expires_at || new Date(override.expires_at).getTime() > Date.now());
      const active = isDeveloper || (override?.mode === "revoke" ? false : licensed || overrideActive);
      // Both editions live in the private bucket. Neither has a public URL.
      const { data: objects, error: storageError } = await admin.storage.from(bucketName).list("", {
        limit: 100
      });
      if (storageError) throw storageError;
      const premiumFileReady = Boolean(objects?.some((item) => item.name === objectName));
      const storedFreeFileReady = Boolean(objects?.some((item) => item.name === freeObjectName));
      const freeFileReady = storedFreeFileReady || Boolean(freeFallbackUrl);

      if (action === "status") {
        // Numeric, public-facing UID is assigned once by an auth.users DB trigger.
        // Fetch it server-side; never accept a UID supplied by the browser.
        const { data: identity, error: uidError } = await admin.from("syrex_user_uids")
          .select("uid")
          .eq("user_id", user.id).single();
        if (uidError || !identity) throw uidError || new Error("User UID not assigned");
        return respond({
          uid: Number(identity.uid),
          active, licensed, isDeveloper,
          edition: active ? "PREMIUM" : "FREE",
          activatedAt: license?.activated_at || null,
          expiresAt: overrideActive ? override?.expires_at || null : expiresAt,
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

    if (action === "admin-users") {
      if (!isAdmin) return respond({ error: "Нет прав администратора." }, 403);
      const page = Number(payload.page || 1);
      if (!Number.isInteger(page) || page < 1 || page > 1000) {
        return respond({ error: "Неверная страница." }, 400);
      }
      const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 50 });
      if (usersError) throw usersError;
      const users = usersData?.users || [];
      const ids = users.map((item) => item.id);
      const [uids, licenses, overrides] = await Promise.all([
        ids.length ? admin.from("syrex_user_uids").select("user_id,uid").in("user_id", ids) : Promise.resolve({ data: [], error: null }),
        ids.length ? admin.from("syrex_licenses").select("user_id,expires_at").in("user_id", ids) : Promise.resolve({ data: [], error: null }),
        ids.length ? admin.from("syrex_admin_subscriptions").select("user_id,mode,expires_at").in("user_id", ids) : Promise.resolve({ data: [], error: null })
      ]);
      if (uids.error || licenses.error || overrides.error) throw uids.error || licenses.error || overrides.error;
      const uidMap = new Map((uids.data || []).map((row) => [row.user_id, row.uid]));
      const licenseMap = new Map((licenses.data || []).map((row) => [row.user_id, row]));
      const overrideMap = new Map((overrides.data || []).map((row) => [row.user_id, row]));
      const { data: deviceBindings, error: deviceError } = isDeveloper && ids.length
        ? await admin.from("syrex_device_bindings")
          .select("user_id,fingerprint_digest,bound_at,last_seen_at").in("user_id", ids)
        : { data: [], error: null };
      if (deviceError) throw deviceError;
      const deviceMap = new Map((deviceBindings || []).map((item) => [item.user_id, item]));
      const { data: presence, error: presenceError } = await admin.from("syrex_site_presence")
        .select("user_id,last_seen_at").in("user_id", ids);
      if (presenceError) throw presenceError;
      const presenceMap = new Map((presence || []).map((item) => [item.user_id, item.last_seen_at]));
      const now = Date.now();
      return respond({
        users: users.map((entry) => {
          const existing = licenseMap.get(entry.id);
          const override = overrideMap.get(entry.id);
          const existingActive = Boolean(existing) && (!existing.expires_at || new Date(existing.expires_at).getTime() > now);
          const granted = override?.mode === "grant" && (!override.expires_at || new Date(override.expires_at).getTime() > now);
          const role = String(entry.app_metadata?.role || "USER").toUpperCase();
          return {
            id: entry.id, uid: uidMap.get(entry.id) ?? null,
            username: String(entry.user_metadata?.username || entry.email?.split("@")[0] || "User").slice(0, 80),
            email: entry.email || "", role, createdAt: entry.created_at,
            online: Boolean(presenceMap.get(entry.id)) && now - new Date(presenceMap.get(entry.id)).getTime() < 180000,
            lastSeenAt: presenceMap.get(entry.id) || null,
            device: isDeveloper && deviceMap.has(entry.id) ? {
              fingerprint: deviceMap.get(entry.id).fingerprint_digest.slice(0, 16),
              boundAt: deviceMap.get(entry.id).bound_at,
              lastSeenAt: deviceMap.get(entry.id).last_seen_at
            } : null,
            premium: role === "DEV" || role === "DEVELOPER" ||
              (override?.mode !== "revoke" && (existingActive || granted)),
            expiresAt: granted ? override?.expires_at || null : existing?.expires_at || null,
            overrideMode: override?.mode || null
          };
        }),
        page, hasMore: users.length === 50
      });
    }

    if (action === "admin-subscription") {
      if (!isAdmin) return respond({ error: "Нет прав администратора." }, 403);
      const target = typeof payload.userId === "string" ? payload.userId : "";
      const mode = payload.mode;
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(target) || !["grant", "revoke", "reset"].includes(mode)) {
        return respond({ error: "Неверные параметры." }, 400);
      }
      if (target === user.id) return respond({ error: "Нельзя изменять собственную подписку." }, 403);
      const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(target);
      if (targetError || !targetData?.user) return respond({ error: "Аккаунт не найден." }, 404);
      const targetRole = String(targetData.user.app_metadata?.role || "").toUpperCase();
      if (["ADMIN", "DEV", "DEVELOPER"].includes(targetRole)) {
        return respond({ error: "Нельзя изменять подписку администратора." }, 403);
      }
      if (mode === "reset") {
        const { error } = await admin.from("syrex_admin_subscriptions").delete().eq("user_id", target);
        if (error) throw error;
      } else {
        const days = Number(payload.days);
        if (mode === "grant" && (![7, 30, 90, 365, 0].includes(days))) {
          return respond({ error: "Недопустимый срок Premium." }, 400);
        }
        const expires = mode === "grant" && days > 0
          ? new Date(Date.now() + days * 86400000).toISOString() : null;
        const { error } = await admin.from("syrex_admin_subscriptions").upsert({
          user_id: target, mode, expires_at: expires, updated_at: new Date().toISOString(),
          updated_by: user.id
        }, { onConflict: "user_id" });
        if (error) throw error;
      }
      return respond({ success: true });
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
