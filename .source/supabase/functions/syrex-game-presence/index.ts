import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.83.0";

// The Minecraft client uses this endpoint without a browser Origin header.
// Only a validated Syrex account token may update that account's own status.
const origin = "https://hhhfff0056-crypto.github.io";
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Vary": "Origin",
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type"
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const envKey = (jsonName: string, fallback: string): string => {
  try {
    const keys = JSON.parse(Deno.env.get(jsonName) || "{}");
    const value = keys.default || Object.values(keys)[0];
    if (typeof value === "string" && value.length > 20) return value;
  } catch { /* legacy project key */ }
  return Deno.env.get(fallback) || "";
};

// Do not publish local/private hosts or literal IPs; send only public DNS
// hostnames that players knowingly connect to.
function publicHost(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input !== "string" || input.length > 125) return null;
  const host = input.trim().toLowerCase();
  if (!/^(?=.{4,125}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\:[0-9]{1,5})?$/.test(host)) return null;
  const name = host.replace(/:[0-9]{1,5}$/, "");
  const tld = name.split(".").pop() || "";
  if (!/[a-z]/.test(tld) || !/^[a-z]{2,24}$/.test(tld)) return null;
  if (name.endsWith(".local") || name.endsWith(".lan") || name.endsWith(".internal") ||
      name.endsWith(".localhost") || name.endsWith(".home") || name.endsWith(".test") ||
      name.endsWith(".invalid")) return null;
  const port = host.includes(":") ? Number(host.slice(host.lastIndexOf(":") + 1)) : 25565;
  if (port < 1 || port > 65535) return null;
  return host;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return req.headers.get("origin") === origin
    ? new Response(null, { status: 204, headers }) : reply({ error: "Forbidden" }, 403);
  if (req.method !== "POST" || (req.headers.get("origin") && req.headers.get("origin") !== origin))
    return reply({ error: "Forbidden" }, 403);
  const auth = req.headers.get("authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token.length > 4096) return reply({ error: "Войдите в Syrex" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anon = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anon || !secret) return reply({ error: "Server unavailable" }, 503);

  let input: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 1024) return reply({ error: "Too large" }, 413);
    input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid");
  } catch { return reply({ error: "Invalid JSON" }, 400); }
  if (input.action !== "heartbeat" && input.action !== "leave")
    return reply({ error: "Invalid action" }, 400);
  if (input.action === "heartbeat" && input.server !== null && input.server !== undefined &&
      input.server !== "" && publicHost(input.server) === null) {
    return reply({ error: "Непубличный адрес сервера не сохраняется" }, 400);
  }

  try {
    const client = createClient(supabaseUrl, anon, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user?.id) return reply({ error: "Сеанс истёк" }, 401);
    const admin = createClient(supabaseUrl, secret, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const name = user.user_metadata?.username;
    const displayName = typeof name === "string" && /^[a-z0-9_]{3,32}$/i.test(name)
      ? name : "Игрок Syrex";

    // Create an opt-in-settings row only for new accounts, without turning
    // game presence into a false "active website tab" heartbeat.
    const { error: profileError } = await admin.from("syrex_site_presence")
      .upsert({ user_id: user.id, display_name: displayName,
        last_seen_at: "1970-01-01T00:00:00.000Z" },
        { onConflict: "user_id", ignoreDuplicates: true });
    if (profileError) throw profileError;
    if (input.action === "leave") {
      const { error: clearError } = await admin.from("syrex_game_presence")
        .delete().eq("user_id", user.id);
      if (clearError) throw clearError;
      return reply({ ok: true });
    }
    const { error: pingError } = await admin.from("syrex_game_presence")
      .upsert({ user_id: user.id, server_host: publicHost(input.server),
        last_seen_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (pingError) throw pingError;
    return reply({ ok: true });
  } catch (err) {
    console.error("Syrex game presence: ", err instanceof Error ? err.message : "unknown");
    return reply({ error: "Ошибка сервера" }, 500);
  }
});
