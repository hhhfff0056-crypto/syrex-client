import { createClient } from "npm:@supabase/supabase-js@2.83.0";

// Syrex's independent, server-checked arithmetic CAPTCHA.
// No third-party CAPTCHA keys are needed. This is an anti-spam speed bump,
// NOT a replacement for native Supabase Auth abuse protection.
const allowedOrigins = new Set([
  'https://syrex.us.mw',
  'https://www.syrex.us.mw',
  'https://hhhfff0056-crypto.github.io',
  'https://syrex-client.pages.dev'
]);
const baseHeaders = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, apikey',
  'Vary': 'Origin',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json'
};
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

// Signed proof-of-work for the automatic Syrex browser check.
// This is an inexpensive bot speed bump, not a replacement for an upstream WAF.
const BROWSER_POW_BITS = 12;
function browserSignedText(nonce: string, expiresAt: number, agent: string): Uint8Array {
  return encoder.encode('syrex-browser-v1-challenge:' + nonce + ':' + expiresAt + ':' +
    BROWSER_POW_BITS + ':' + agent.slice(0, 256));
}
function browserProofText(nonce: string, solution: number): Uint8Array {
  return encoder.encode('syrex-browser-v1-proof:' + nonce + ':' + solution);
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
  const requestOrigin = req.headers.get('origin');
  const headers = {
    ...baseHeaders,
    ...(requestOrigin && allowedOrigins.has(requestOrigin)
      ? { 'Access-Control-Allow-Origin': requestOrigin } : {})
  };
  const json = (data: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  if (req.method === 'OPTIONS') {
    return allowedOrigins.has(requestOrigin || '')
      ? new Response(null, { status: 204, headers })
      : json({ error: 'Forbidden origin' }, 403);
  }
  if (!allowedOrigins.has(requestOrigin || '')) return json({ error: 'Forbidden origin' }, 403);
  const mode = new URL(req.url).searchParams.get('mode');
  if (Number(req.headers.get('content-length') || 0) > 2048) return json({ error: 'Request too large' }, 413);
  const isBrowserChallenge = req.method === 'GET' && mode === 'browser-challenge';
  const isBrowserVerify = req.method === 'POST' && mode === 'browser-verify';
  if ((mode === 'challenge' && req.method === 'GET') ||
      (mode === 'verify' && req.method === 'POST') || isBrowserChallenge || isBrowserVerify) {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const secret = getKeyMaterial();
    if (!url || !secret) return json({ error: 'Captcha unavailable' }, 503);
    try {
      const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
      const scope = isBrowserChallenge ? 'browser-challenge' :
        isBrowserVerify ? 'browser-verify' :
        mode === 'challenge' ? 'captcha-challenge' : 'captcha-verify';
      const limit = isBrowserChallenge ? 120 : isBrowserVerify ? 240 :
        mode === 'challenge' ? 30 : 60;
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
    if (isBrowserChallenge) {
      const nonce = crypto.randomUUID();
      const expiresAt = Date.now() + 90_000;
      const agent = req.headers.get('user-agent') || '';
      const signature = bytesToHex(new Uint8Array(
        await crypto.subtle.sign('HMAC', key, browserSignedText(nonce, expiresAt, agent))
      ));
      return json({ nonce, expiresAt, difficultyBits: BROWSER_POW_BITS, signature });
    }
    if (isBrowserVerify) {
      let data: Record<string, unknown>;
      try {
        const raw = await req.text();
        if (raw.length > 1024) return json({ verified: false, error: 'Request too large' }, 413);
        data = JSON.parse(raw);
        if (!data || Array.isArray(data) || typeof data !== 'object') throw Error('Invalid payload');
      } catch {
        return json({ verified: false, error: 'Invalid JSON' }, 400);
      }
      const { nonce, signature, expiresAt, solution } = data;
      if (typeof nonce !== 'string' || !/^[0-9a-f-]{36}$/i.test(nonce) ||
          typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature) ||
          typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) ||
          expiresAt < Date.now() || expiresAt > Date.now() + 91_000 ||
          typeof solution !== 'number' || !Number.isSafeInteger(solution) ||
          solution < 0 || solution > 250_000) {
        return json({ verified: false, error: 'Invalid or expired challenge' }, 403);
      }
      const agent = req.headers.get('user-agent') || '';
      const signed = await crypto.subtle.verify(
        'HMAC', key, hexToBytes(signature), browserSignedText(nonce, expiresAt, agent)
      );
      if (!signed) return json({ verified: false, error: 'Invalid challenge signature' }, 403);
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', browserProofText(nonce, solution)));
      if (hash[0] !== 0 || (hash[1] & 0xf0) !== 0) {
        return json({ verified: false, error: 'Incorrect proof' }, 403);
      }
      return json({ verified: true, requestId: nonce.slice(0, 8) });
    }
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
