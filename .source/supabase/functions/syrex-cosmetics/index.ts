import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.83.0";

// Cosmetic IDs are public by design; account IDs, emails and tokens never go into lookups.
const site = "https://hhhfff0056-crypto.github.io";
const cors = {
  "Access-Control-Allow-Origin": site,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};
const response = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: cors });
const categories = new Set([
  "bodywear", "wings", "hat", "accessory", "pet", "cape", "sword", "mace", "shield",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readKey(jsonName: string, legacyName: string): string {
  try {
    const all = JSON.parse(Deno.env.get(jsonName) || "{}");
    const value = all.default || Object.values(all)[0];
    if (typeof value === "string" && value.length > 20) return value;
  } catch { /* Compatible with older projects */ }
  return Deno.env.get(legacyName) || "";
}
function validUuid(value: unknown): string | null {
  if (typeof value !== "string" || !uuidPattern.test(value)) return null;
  const v = value.toLowerCase();
  if (v === "00000000-0000-0000-0000-000000000000") return null;
  return v;
}
function selection(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  const keys = Object.keys(value);
  if (keys.length > 9) return null;
  for (const key of keys) {
    if (!categories.has(key)) return null;
    const id = (value as Record<string, unknown>)[key];
    if (id === null || id === -1) continue; // Unequipped.
    if (typeof id !== "number" || !Number.isInteger(id) || id < 1 || id > 5000) return null;
    out[key] = id;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return origin === site
    ? new Response(null, { status: 204, headers: cors })
    : response({ error: "Forbidden" }, 403);
  if (req.method !== "POST" || (origin && origin !== site)) {
    return response({ error: "Недопустимый запрос" }, 403);
  }
  if (Number(req.headers.get("content-length") || 0) > 4096) {
    return response({ error: "Слишком большой запрос" }, 413);
  }
  let data: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return response({ error: "Слишком большой запрос" }, 413);
    data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid body");
  } catch {
    return response({ error: "Некорректный JSON" }, 400);
  }
  const action = data.action;
  if (!["lookup", "mine", "link", "save"].includes(String(action))) {
    return response({ error: "Неизвестная операция" }, 400);
  }
  const url = Deno.env.get("SUPABASE_URL") || "";
  const pub = readKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = readKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !pub || !secret) return response({ error: "Сервис временно недоступен" }, 503);
  try {
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return response({ error: "Войдите в Syrex" }, 401);
    const publicClient = createClient(url, pub, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await publicClient.auth.getUser(token);
    if (authError || !user?.id) return response({ error: "Сеанс истёк" }, 401);

    // Read-only lookup requires an authenticated Syrex account, and returns only equipped IDs.
    if (action === "lookup") {
      if (!Array.isArray(data.uuids) || data.uuids.length < 1 || data.uuids.length > 30) {
        return response({ error: "Укажите от 1 до 30 UUID" }, 400);
      }
      const uuids = data.uuids.map(validUuid);
      if (uuids.some((id) => !id)) return response({ error: "Неверный UUID" }, 400);
      const { data: rows, error } = await admin.from("syrex_player_cosmetics")
        .select("player_uuid,equipped,updated_at")
        .in("player_uuid", [...new Set(uuids as string[])])
        .not("selection_saved_at", "is", null);
      if (error) throw error;
      return response({
        profiles: (rows || []).map((row) => ({
          uuid: row.player_uuid, equipped: row.equipped, updatedAt: row.updated_at,
        })),
      });
    }

    const { data: existing, error: readError } = await admin.from("syrex_player_cosmetics")
      .select("player_uuid,equipped,selection_saved_at,updated_at")
      .eq("user_id", user.id).maybeSingle();
    if (readError) throw readError;

    if (action === "mine") return response({
      linked: Boolean(existing?.player_uuid),
      playerUuid: existing?.player_uuid || null,
      saved: Boolean(existing?.selection_saved_at),
      equipped: existing?.equipped || {},
      updatedAt: existing?.updated_at || null,
    });

    if (action === "link") {
      const playerUuid = validUuid(data.playerUuid);
      if (!playerUuid) return response({ error: "Неверный UUID игрока" }, 400);
      if (existing?.player_uuid && existing.player_uuid !== playerUuid) {
        return response({ error: "Аккаунт уже привязан к другому UUID Minecraft" }, 409);
      }
      if (!existing) {
        const { error } = await admin.from("syrex_player_cosmetics")
          .insert({ user_id: user.id, player_uuid: playerUuid });
        if (error?.code === "23505") return response({ error: "UUID уже занят другим аккаунтом" }, 409);
        if (error) throw error;
      } else if (!existing.player_uuid) {
        const { data: result, error } = await admin.from("syrex_player_cosmetics")
          .update({ player_uuid: playerUuid, updated_at: new Date().toISOString() })
          .eq("user_id", user.id).is("player_uuid", null).select("player_uuid");
        if (error?.code === "23505") return response({ error: "UUID уже занят другим аккаунтом" }, 409);
        if (error) throw error;
        if (!result?.length) return response({ error: "Повторите привязку" }, 409);
      }
      return response({ linked: true, playerUuid, saved: Boolean(existing?.selection_saved_at),
        equipped: existing?.equipped || {} });
    }

    if (action === "save") {
      const equipped = selection(data.equipped);
      if (!equipped) return response({ error: "Неверный набор косметики" }, 400);
      const now = new Date().toISOString();
      const fields = { equipped, selection_saved_at: now, updated_at: now };
      if (!existing) {
        const { error } = await admin.from("syrex_player_cosmetics")
          .insert({ user_id: user.id, ...fields });
        if (error) throw error;
      } else {
        const { error } = await admin.from("syrex_player_cosmetics")
          .update(fields).eq("user_id", user.id);
        if (error) throw error;
      }
      return response({ saved: true, equipped });
    }
    return response({ error: "Неизвестная операция" }, 400);
  } catch (error) {
    console.error("Syrex cosmetics:", error instanceof Error ? error.message : "unknown");
    return response({ error: "Ошибка сервера косметики" }, 500);
  }
});
