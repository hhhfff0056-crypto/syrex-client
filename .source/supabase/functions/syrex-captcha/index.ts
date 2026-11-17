import { createClient } from "npm:@supabase/supabase-js@2.83.0";

// Syrex's independent, server-checked arithmetic CAPTCHA.
// No third-party CAPTCHA keys are needed. This is an anti-spam speed bump,
// NOT a replacement for native Supabase Auth abuse protection.
const origin = 'https://hhhfff0056-crypto.github.io';
const headers = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, apikey',
  'Vary': 'Origin',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json'
};
const json = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
const encoder = new TextEncoder();

function getKeyMaterial(): string | null {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy && legacy.length > 24) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    const value = keys.default || Object.values(keys)[0];
    return typeof value === 'string' && value.length > 24 ? value : null;
  } catch {
    return null;
  }
}

async function getHmacKey(): Promise<CryptoKey> {
  const secret = getKeyMaterial();
  if (!secret) throw new Error('Server signing key unavailable');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) || [], pair => parseInt(pair, 16));
}
function signedText(nonce: string, expiresAt: number, answer: number): Uint8Array {
  return encoder.encode('syrex-captcha-v1:' + nonce + ':' + expiresAt + ':' + answer);
}
function randomInt(min: number, max: number): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return min + arr[0] % (max - min + 1);
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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.headers.get('origin') !== origin) return json({ error: 'Forbidden origin' }, 403);
  const mode = new URL(req.url).searchParams.get('mode');
  if (Number(req.headers.get('content-length') || 0) > 2048) return json({ error: 'Request too large' }, 413);
  if ((mode === 'challenge' && req.method === 'GET') || (mode === 'verify' && req.method === 'POST')) {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const secret = getKeyMaterial();
    if (!url || !secret) return json({ error: 'Captcha unavailable' }, 503);
    try {
      const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
      const scope = mode === 'challenge' ? 'captcha-challenge' : 'captcha-verify';
      const limit = mode === 'challenge' ? 30 : 60;
      if (!(await rateAllowed(admin, secret, scope, 'ip:' + peerAddress(req), limit, 300))) {
        return json({ error: 'Слишком много попыток. Повторите позже.' }, 429);
      }
    } catch {
      return json({ error: 'Проверка временно недоступна' }, 503);
    }
  }
  if (req.method === 'GET' && mode === 'status') {
    return json({ ready: Boolean(getKeyMaterial()) });
  }
  try {
    const key = await getHmacKey();
    if (req.method === 'GET' && mode === 'challenge') {
      let a = randomInt(3, 12);
      let b = randomInt(2, 10);
      const subtract = randomInt(0, 1) === 1;
      if (subtract && b > a) [a, b] = [b, a];
      const answer = subtract ? a - b : a + b;
      const nonce = crypto.randomUUID();
      const expiresAt = Date.now() + 120000;
      const signature = bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, signedText(nonce, expiresAt, answer))));
      return json({ ready: true, question: a + (subtract ? ' − ' : ' + ') + b + ' = ?', nonce, expiresAt, signature });
    }
    if (req.method === 'POST' && mode === 'verify') {
      let payload: Record<string, unknown>;
      try {
        const raw = await req.text();
        if (raw.length > 2048) return json({ success: false, error: 'Request too large' }, 413);
        payload = JSON.parse(raw);
      } catch {
        return json({ success: false, error: 'Invalid JSON' }, 400);
      }
      const nonce = payload.nonce;
      const expiresAt = payload.expiresAt;
      const signature = payload.signature;
      const rawAnswer = payload.answer;
      const answer = typeof rawAnswer === 'number' ? rawAnswer : Number(rawAnswer);
      if (typeof nonce !== 'string' || !/^[0-9a-f-]{36}$/i.test(nonce) ||
          typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature) ||
          typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) ||
          !Number.isInteger(answer) || answer < 0 || answer > 30 ||
          expiresAt < Date.now() || expiresAt > Date.now() + 121000) {
        return json({ success: false, error: 'Invalid or expired challenge' }, 403);
      }
      const verified = await crypto.subtle.verify('HMAC', key, hexToBytes(signature), signedText(nonce, expiresAt, answer));
      return verified ? json({ success: true }) : json({ success: false, error: 'Wrong answer' }, 403);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Syrex CAPTCHA unavailable:', error instanceof Error ? error.message : 'Unknown');
    return json({ error: 'CAPTCHA service unavailable' }, 503);
  }
});
