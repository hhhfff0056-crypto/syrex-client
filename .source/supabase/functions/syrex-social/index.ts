import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.83.0";

// Syrex friends and opt-in, short-lived Minecraft waypoint pings.
// User credentials, emails, HWID, IP addresses and raw tokens are never returned.
const SITE = "https://hhhfff0056-crypto.github.io";
const headers = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Vary": "Origin"
};
const respond = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });

function envKey(json: string, legacy: string): string {
  try {
    const data = JSON.parse(Deno.env.get(json) || "{}");
    const item = data.default || Object.values(data)[0];
    if (typeof item === "string" && item.length > 20) return item;
  } catch { /* legacy */ }
  return Deno.env.get(legacy) || "";
}

function sortedPair(a: string, b: string): { low_user: string; high_user: string } {
  return a < b ? { low_user: a, high_user: b } : { low_user: b, high_user: a };
}

function serverHost(input: unknown): string | null {
  if (typeof input !== "string" || input.length < 4 || input.length > 125) return null;
  const s = input.toLowerCase().trim();
  const host = s.replace(/:\d{1,5}$/, "");
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::[0-9]{1,5})?$/.test(s)) return null;
  const tld = host.split(".").at(-1) || "";
  if (!/^[a-z]{2,24}$/.test(tld)) return null;
  if ([".localhost",".local",".lan",".internal",".home",".test",".invalid"].some(x => host.endsWith(x))) return null;
  if (s.includes(":")) {
    const port = Number(s.slice(s.lastIndexOf(":") + 1));
    if (port < 1 || port > 65535) return null;
  }
  return s;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return req.headers.get("origin") === SITE
    ? new Response(null, { status: 204, headers }) : respond({ error: "Forbidden" }, 403);
  if (req.method !== "POST" || (req.headers.get("origin") && req.headers.get("origin") !== SITE))
    return respond({ error: "Forbidden" }, 403);
  let payload: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return respond({ error: "Слишком большой запрос." }, 413);
    payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw Error("JSON");
  } catch { return respond({ error: "Неверный запрос." }, 400); }

  const action = payload.action;
  const quotas: Record<string, [number, number]> = {
    list: [30, 60], search: [30, 60], request: [5, 60],
    respond: [20, 60], remove: [15, 60],
    "ping-send": [12, 60], "ping-poll": [20, 60],
    "party-status": [20, 60], "party-invite": [5, 60],
    "party-accept": [8, 60], "party-decline": [8, 60],
    "party-leave": [8, 60], "party-kick": [8, 60]
  };
  if (typeof action !== "string" || !quotas[action]) return respond({ error: "Неизвестная операция." }, 400);
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token.length > 4096) return respond({ error: "Войдите в Syrex." }, 401);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const pub = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !pub || !secret) return respond({ error: "Сервис недоступен." }, 503);
  try {
    const auth = createClient(url, pub, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authErr } = await auth.auth.getUser(token);
    if (authErr || !user?.id) return respond({ error: "Сеанс истёк." }, 401);
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const digestBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret + ":" + user.id + ":social:" + action));
    const digest = Array.from(new Uint8Array(digestBytes), x => x.toString(16).padStart(2,"0")).join("");
    const [maxHits, windowSeconds] = quotas[action];
    const { data: allowed, error: quotaError } = await admin.rpc("syrex_rate_limit_check", {
      p_scope: "social-" + action, p_subject_hash: digest,
      p_max_hits: maxHits, p_window_seconds: windowSeconds
    });
    if (quotaError || allowed !== true) return respond({ error: "Слишком много запросов. Попробуйте позже." }, 429);

    // Opportunistically register existing accounts into the searchable directory.
    const nickname = user.user_metadata?.username;
    if (typeof nickname === "string" && /^[a-z0-9_]{3,32}$/i.test(nickname)) {
      await admin.from("syrex_social_profiles").upsert(
        { user_id: user.id, nickname }, { onConflict: "user_id", ignoreDuplicates: true }
      );
    }

    const friendships = async () => {
      const { data, error } = await admin.from("syrex_friendships")
        .select("low_user,high_user,requested_by,status,created_at")
        .or("low_user.eq." + user.id + ",high_user.eq." + user.id)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    };
    const related = async (ids: string[]) => {
      if (!ids.length) return new Map();
      const [profiles, uids] = await Promise.all([
        admin.from("syrex_social_profiles").select("user_id,nickname").in("user_id", ids),
        admin.from("syrex_user_uids").select("user_id,uid").in("user_id", ids)
      ]);
      if (profiles.error || uids.error) throw profiles.error || uids.error;
      const out = new Map<string, { nickname: string; uid: number | null }>();
      for (const x of profiles.data || []) out.set(x.user_id, { nickname: x.nickname, uid: null });
      for (const x of uids.data || []) {
        const item = out.get(x.user_id) || { nickname: "Игрок Syrex", uid: null };
        item.uid = Number(x.uid);
        out.set(x.user_id, item);
      }
      return out;
    };

    if (action === "search") {
      const q = String(payload.query || "").trim();
      if (!/^[a-z0-9_]{3,32}$/i.test(q) && !/^\d{1,14}$/.test(q))
        return respond({ error: "Введите никнейм (3–32 символа) или UID." }, 400);
      let profiles = [];
      if (/^\d{1,14}$/.test(q)) {
        const { data: uid, error } = await admin.from("syrex_user_uids").select("user_id").eq("uid", Number(q)).maybeSingle();
        if (error) throw error;
        if (uid) {
          const { data, error: pErr } = await admin.from("syrex_social_profiles").select("user_id,nickname").eq("user_id", uid.user_id);
          if (pErr) throw pErr;
          profiles = data || [];
        }
      } else {
        // Exact match avoids enumerating the entire user directory.
        const { data, error } = await admin.from("syrex_social_profiles")
          .select("user_id,nickname").ilike("nickname", q).limit(3);
        if (error) throw error;
        profiles = data || [];
      }
      const found = profiles.filter(p => p.user_id !== user.id);
      const map = await related(found.map(p => p.user_id));
      const rows = await friendships();
      return respond({
        users: found.map(p => ({
          nickname: p.nickname, uid: map.get(p.user_id)?.uid ?? null,
          status: rows.find(r => r.low_user === p.user_id || r.high_user === p.user_id)?.status || null
        }))
      });
    }

    if (action === "list") {
      const rows = await friendships();
      const ids = rows.map(row => row.low_user === user.id ? row.high_user : row.low_user);
      const map = await related(ids);
      return respond({
        friends: rows.map((row, i) => ({
          nickname: map.get(ids[i])?.nickname || "Игрок Syrex",
          uid: map.get(ids[i])?.uid ?? null,
          status: row.status,
          direction: row.requested_by === user.id ? "outgoing" : "incoming"
        })),
        total: rows.filter(row => row.status === "accepted").length
      });
    }

    if (action === "request") {
      const uid = Number(payload.uid);
      if (!Number.isSafeInteger(uid) || uid < 1) return respond({ error: "Неверный UID." }, 400);
      const { data: target, error: uidErr } = await admin.from("syrex_user_uids")
        .select("user_id").eq("uid", uid).maybeSingle();
      if (uidErr) throw uidErr;
      if (!target || target.user_id === user.id) return respond({ error: "Пользователь не найден." }, 404);
      const rows = await friendships();
      if (rows.length >= 100) return respond({ error: "Достигнут лимит друзей и заявок." }, 409);
      const pair = sortedPair(user.id, target.user_id);
      const { data: present, error: pErr } = await admin.from("syrex_friendships")
        .select("status").eq("low_user", pair.low_user).eq("high_user", pair.high_user).maybeSingle();
      if (pErr) throw pErr;
      if (present) return respond({ error: "Заявка уже отправлена или вы уже друзья." }, 409);
      const { error } = await admin.from("syrex_friendships").insert({
        ...pair, requested_by: user.id, status: "pending"
      });
      if (error?.code === "23505") return respond({ error: "Заявка уже существует." }, 409);
      if (error) throw error;
      return respond({ ok: true });
    }

    if (action === "respond" || action === "remove") {
      const uid = Number(payload.uid);
      if (!Number.isSafeInteger(uid) || uid < 1) return respond({ error: "Неверный UID." }, 400);
      const { data: peer, error: uidErr } = await admin.from("syrex_user_uids")
        .select("user_id").eq("uid", uid).maybeSingle();
      if (uidErr) throw uidErr;
      if (!peer) return respond({ error: "Игрок не найден." }, 404);
      const pair = sortedPair(user.id, peer.user_id);
      const { data: row, error: readErr } = await admin.from("syrex_friendships")
        .select("status,requested_by").eq("low_user", pair.low_user).eq("high_user", pair.high_user).maybeSingle();
      if (readErr) throw readErr;
      if (!row) return respond({ error: "Заявка не найдена." }, 404);
      if (action === "respond") {
        if (row.status !== "pending" || row.requested_by === user.id ||
            !["accept", "reject"].includes(String(payload.decision))) {
          return respond({ error: "Нельзя обработать эту заявку." }, 403);
        }
        if (payload.decision === "accept") {
          const { error } = await admin.from("syrex_friendships")
            .update({ status: "accepted", updated_at: new Date().toISOString() })
            .eq("low_user", pair.low_user).eq("high_user", pair.high_user)
            .eq("status", "pending").neq("requested_by", user.id);
          if (error) throw error;
          return respond({ ok: true, accepted: true });
        }
      }
      const { error } = await admin.from("syrex_friendships")
        .delete().eq("low_user", pair.low_user).eq("high_user", pair.high_user);
      if (error) throw error;
      return respond({ ok: true });
    }

    // One party per account; only the leader can invite or kick.
    const myParty = async () => {
      const { data: member, error: memberErr } = await admin.from("syrex_party_members")
        .select("party_id").eq("user_id",user.id).maybeSingle();
      if (memberErr) throw memberErr;
      if (!member) return null;
      const { data: party, error: partyErr } = await admin.from("syrex_parties")
        .select("id,owner_user").eq("id",member.party_id).maybeSingle();
      if (partyErr) throw partyErr;
      return party;
    };
    const partyMembers = async (partyId: string) => {
      const { data, error } = await admin.from("syrex_party_members")
        .select("user_id").eq("party_id",partyId).limit(8);
      if (error) throw error;
      return (data || []).map(x => x.user_id as string);
    };
    const checkFriends = async (other: string) => {
      const pair = sortedPair(user.id,other);
      const { data, error } = await admin.from("syrex_friendships")
        .select("status").eq("low_user",pair.low_user)
        .eq("high_user",pair.high_user).maybeSingle();
      if (error) throw error;
      return data?.status === "accepted";
    };
    const myPartyPeers = async () => {
      const party = await myParty();
      if (!party) return [];
      return (await partyMembers(party.id)).filter(id => id !== user.id);
    };

    if (action === "party-status") {
      const party = await myParty();
      const ids = party ? await partyMembers(party.id) : [];
      const { data: pending, error: inviteErr } = await admin.from("syrex_party_invites")
        .select("id,party_id,invited_by,expires_at").eq("invited_user",user.id)
        .gt("expires_at",new Date().toISOString())
        .order("created_at",{ascending:false}).limit(5);
      if (inviteErr) throw inviteErr;
      const names = await related([...new Set([...ids,...(pending || []).map(x=>x.invited_by)])]);
      return respond({
        party: party ? {
          owner: names.get(party.owner_user)?.nickname || "Syrex",
          members: ids.map(id=>({
            nickname: names.get(id)?.nickname || "Игрок",
            me:id===user.id, leader:id===party.owner_user
          }))
        } : null,
        invites: (pending || []).map(x=>({
          from: names.get(x.invited_by)?.nickname || "Игрок",
          expiresAt:x.expires_at
        }))
      });
    }

    if (action === "party-invite") {
      const name = String(payload.nickname || "").trim();
      if (!/^[a-z0-9_]{3,32}$/i.test(name)) return respond({error:"Введите ник Syrex (3–32 символа)."},400);
      // Find by exact case-insensitive nickname among accepted friends.
      // LIKE/ILIKE would treat underscores in Minecraft nicknames as wildcards.
      const acceptedFriends = (await friendships()).filter(x => x.status === "accepted");
      const acceptedIds = acceptedFriends.map(x => x.low_user === user.id ? x.high_user : x.low_user);
      const acceptedNames = await related(acceptedIds);
      const targetId = acceptedIds.find(id =>
        acceptedNames.get(id)?.nickname.toLowerCase() === name.toLowerCase());
      const profile = targetId ? { user_id: targetId, nickname: acceptedNames.get(targetId)!.nickname } : null;
      if(!profile) return respond({error:"Друг с таким ником не найден. Добавьте его на сайте Syrex."},404);
      if(!(await checkFriends(profile.user_id))) return respond({error:"Добавьте игрока в друзья через сайт Syrex."},403);
      const {data:alreadyInParty,error:alreadyErr} = await admin.from("syrex_party_members")
        .select("user_id").eq("user_id",profile.user_id).maybeSingle();
      if(alreadyErr) throw alreadyErr;
      if(alreadyInParty) return respond({error:"Игрок уже состоит в пати."},409);
      let party = await myParty();
      if(party && party.owner_user!==user.id) return respond({error:"Приглашать может только лидер пати."},403);
      if(!party) {
        const {data:created,error:createErr} = await admin.from("syrex_parties")
          .insert({owner_user:user.id}).select("id,owner_user").single();
        if(createErr?.code==="23505") return respond({error:"Пати уже создаётся. Повторите команду."},409);
        if(createErr) throw createErr;
        const {error:joinErr} = await admin.from("syrex_party_members")
          .insert({party_id:created.id,user_id:user.id});
        if(joinErr) {
          await admin.from("syrex_parties").delete().eq("id",created.id).eq("owner_user",user.id);
          throw joinErr;
        }
        party=created;
      }
      const currentMembers = await partyMembers(party.id);
      if(currentMembers.length>=6) return respond({error:"В пати максимум 6 игроков."},409);
      const {data:invited,error:invErr} = await admin.from("syrex_party_invites")
        .select("id,expires_at").eq("party_id",party.id)
        .eq("invited_user",profile.user_id).maybeSingle();
      if(invErr) throw invErr;
      if(invited && new Date(invited.expires_at).getTime()>Date.now())
        return respond({error:"Приглашение уже отправлено. Оно действует 10 минут."},409);
      const fields = {party_id:party.id,invited_user:profile.user_id,invited_by:user.id,
        created_at:new Date().toISOString(),expires_at:new Date(Date.now()+600000).toISOString()};
      const {error:writeErr} = invited
        ? await admin.from("syrex_party_invites").update(fields).eq("id",invited.id)
        : await admin.from("syrex_party_invites").insert(fields);
      if(writeErr) throw writeErr;
      return respond({ok:true,invited:profile.nickname});
    }

    if(action==="party-accept" || action==="party-decline") {
      const {data:inv,error:invErr} = await admin.from("syrex_party_invites")
        .select("id,party_id,invited_by").eq("invited_user",user.id)
        .gt("expires_at",new Date().toISOString())
        .order("created_at",{ascending:false}).limit(1).maybeSingle();
      if(invErr) throw invErr;
      if(!inv) return respond({error:"Нет активных приглашений в пати."},404);
      if(action==="party-decline") {
        const {error} = await admin.from("syrex_party_invites").delete().eq("id",inv.id);
        if(error) throw error;
        return respond({ok:true,declined:true});
      }
      if(await myParty()) return respond({error:"Сначала выйдите из текущей пати: .party leave"},409);
      if(!(await checkFriends(inv.invited_by)))
        return respond({error:"Лидер больше не находится у вас в друзьях."},403);
      const members=await partyMembers(inv.party_id);
      if(members.length>=6) return respond({error:"Пати заполнена."},409);
      if(!members.includes(inv.invited_by)) return respond({error:"Пати уже не существует."},409);
      const {error:joinErr}=await admin.from("syrex_party_members")
        .insert({party_id:inv.party_id,user_id:user.id});
      if(joinErr?.code==="23505") return respond({error:"Вы уже состоите в пати."},409);
      if(joinErr) throw joinErr;
      await admin.from("syrex_party_invites").delete().eq("invited_user",user.id);
      return respond({ok:true,accepted:true});
    }

    if(action==="party-leave") {
      const party=await myParty();
      if(!party) return respond({error:"Вы не состоите в пати."},404);
      if(party.owner_user===user.id) {
        const {error} = await admin.from("syrex_parties").delete()
          .eq("id",party.id).eq("owner_user",user.id);
        if(error) throw error;
        return respond({ok:true,disbanded:true});
      }
      const {error} = await admin.from("syrex_party_members").delete()
        .eq("party_id",party.id).eq("user_id",user.id);
      if(error) throw error;
      return respond({ok:true,left:true});
    }
    if(action==="party-kick") {
      const party=await myParty();
      if(!party || party.owner_user!==user.id)
        return respond({error:"Удалять игроков может только лидер пати."},403);
      const name=String(payload.nickname||"").trim();
      if(!/^[a-z0-9_]{3,32}$/i.test(name)) return respond({error:"Укажите ник игрока."},400);
      const memberIds = (await partyMembers(party.id)).filter(id => id !== user.id);
      const membersInfo = await related(memberIds);
      const targetId = memberIds.find(id =>
        membersInfo.get(id)?.nickname.toLowerCase() === name.toLowerCase());
      if(!targetId) return respond({error:"Игрок не найден в вашей пати."},404);
      const profile = { user_id: targetId };
      const {data:deleted,error:removeErr}=await admin.from("syrex_party_members")
        .delete().eq("party_id",party.id).eq("user_id",profile.user_id)
        .select("user_id");
      if(removeErr) throw removeErr;
      if(!deleted?.length) return respond({error:"Игрок не состоит в вашей пати."},404);
      return respond({ok:true,kicked:name});
    }

    const checkMyGame = async (server: string) => {
      const { data, error } = await admin.from("syrex_game_presence")
        .select("user_id").eq("user_id", user.id).eq("server_host", server)
        .gte("last_seen_at", new Date(Date.now() - 150000).toISOString()).maybeSingle();
      if (error) throw error;
      return Boolean(data);
    };
    if (action === "ping-send") {
      const host = serverHost(payload.server);
      const dim = String(payload.dimension || "");
      const coords = [payload.x, payload.y, payload.z];
      if (!host || !/^[a-z0-9_:/.-]{2,80}$/.test(dim) ||
          coords.some(x => typeof x !== "number" || !Number.isInteger(x)) ||
          Math.abs(coords[0] as number) > 30000000 || Math.abs(coords[2] as number) > 30000000 ||
          (coords[1] as number) < -4096 || (coords[1] as number) > 4096) {
        return respond({ error: "Неверные координаты или публичный сервер." }, 400);
      }
      if (!(await checkMyGame(host))) return respond({ error: "Minecraft-сессия на сервере не подтверждена." }, 403);
      const { data: recent, error: recentError } = await admin.from("syrex_friend_pings")
        .select("id").eq("sender", user.id).gte("created_at",new Date(Date.now()-5000).toISOString()).limit(1);
      if (recentError) throw recentError;
      if (recent?.length) return respond({ error: "Метки можно отправлять раз в 5 секунд." }, 429);
      const rows = (await friendships()).filter(row => row.status === "accepted");
      const friends = new Set(rows.map(row => row.low_user === user.id ? row.high_user : row.low_user));
      const partyPeers = (await myPartyPeers()).filter(id => friends.has(id));
      if (!partyPeers.length) return respond({ sent: 0, reason: "no-party" });
      const { data: online, error } = await admin.from("syrex_game_presence")
        .select("user_id").in("user_id",partyPeers)
        .eq("server_host",host).gte("last_seen_at",new Date(Date.now()-150000).toISOString());
      if (error) throw error;
      const receivers = (online || []).slice(0,40);
      if (!receivers.length) return respond({ sent: 0 });
      const { error: insertError } = await admin.from("syrex_friend_pings").insert(
        receivers.map(item => ({
          sender: user.id, recipient: item.user_id,
          server_host: host, dimension: dim,
          x: coords[0], y: coords[1], z: coords[2]
        }))
      );
      if (insertError) throw insertError;
      return respond({ sent: receivers.length });
    }

    if (action === "ping-poll") {
      const host = serverHost(payload.server);
      const dim = String(payload.dimension || "");
      if (!host || !/^[a-z0-9_:/.-]{2,80}$/.test(dim)) return respond({ pings: [] });
      if (!(await checkMyGame(host))) return respond({ pings: [] });
      const since = Number(payload.after || 0);
      if (!Number.isSafeInteger(since) || since < 0) return respond({ error: "Неверный курсор." }, 400);
      const { data: rows, error } = await admin.from("syrex_friend_pings")
        .select("id,sender,x,y,z,expires_at")
        .eq("recipient",user.id).eq("server_host",host).eq("dimension",dim)
        .gte("expires_at",new Date().toISOString()).gt("id",since)
        .order("id",{ascending:true}).limit(40);
      if (error) throw error;
      if (!rows?.length) return respond({ pings: [] });
      const accepted = (await friendships()).filter(row => row.status === "accepted");
      const friends = new Set(accepted.map(row => row.low_user === user.id ? row.high_user : row.low_user));
      const peers = new Set(await myPartyPeers());
      const allowed = rows.filter(row => friends.has(row.sender) && peers.has(row.sender));
      const names = await related([...new Set(allowed.map(row=>row.sender))]);
      return respond({ pings: allowed.map(row => ({
        id: row.id, nickname: names.get(row.sender)?.nickname || "Друг",
        x: row.x, y: row.y, z: row.z, expiresAt: row.expires_at
      })) });
    }
    return respond({ error: "Unknown action" }, 400);
  } catch(err) {
    console.error("Syrex social error", err instanceof Error ? err.message : "unknown");
    return respond({ error: "Ошибка сервера друзей." }, 500);
  }
});
