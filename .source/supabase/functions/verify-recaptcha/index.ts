// Google reCAPTCHA v2 verification. Deploy to Supabase Edge Functions.
// The secret RECAPTCHA_SECRET_KEY must be configured in Supabase, never in Git.
const allowedOrigin = "https://hhhfff0056-crypto.github.io";
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey",
  "Vary": "Origin",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const reply = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.headers.get("origin") !== allowedOrigin) return reply({ error: "Origin not allowed" }, 403);
  const secret = Deno.env.get("RECAPTCHA_SECRET_KEY");
  if (req.method === "GET") return reply({ ready: Boolean(secret) });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (!secret) return reply({ error: "reCAPTCHA is not configured on the server" }, 503);

  let token = "";
  try {
    const body = await req.json();
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    return reply({ error: "Invalid request" }, 400);
  }
  if (token.length < 20 || token.length > 4096) return reply({ error: "Invalid CAPTCHA token" }, 400);

  try {
    const google = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token })
    });
    if (!google.ok) return reply({ error: "Google verification unavailable" }, 502);
    const verification = await google.json();
    if (verification.success !== true || verification.hostname !== "hhhfff0056-crypto.github.io") {
      return reply({ error: "CAPTCHA verification failed" }, 403);
    }
    return reply({ success: true });
  } catch {
    return reply({ error: "CAPTCHA service unavailable" }, 502);
  }
});
