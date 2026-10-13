// WebSwan Billing: creates a Stripe Payment Link for a client.
// Security (all checked here on the server, never in the browser):
//   1. Caller must be signed in with Google as one of OWNERS (Firebase ID token verified with Google's public keys).
//   2. Caller must send the billing security key (env BILLING_KEY), compared in constant time.
//   3. Only requests from the Residual page origin are accepted.
// Env vars (set by Tania in Netlify, never in code):
//   STRIPE_SECRET_KEY        restricted key for The WebSwan Stripe account (Prices: write, Products: write, Payment Links: write)
//   STRIPE_SECRET_KEY_MEDIA  optional: key for a separate WebSwan Media Network Stripe account
//   STRIPE_SECRET_KEY_DIGITAL optional: key for a separate WebSwan Digital Solutions Stripe account
//   BILLING_KEY              the billing security key typed in the Billing tab
import crypto from "node:crypto";

const PROJECT_ID = "webswan-gigoia-task";
const OWNERS = ["thewebswann@gmail.com", "taniadomingue373@gmail.com"];
const ALLOWED_ORIGINS = ["https://taniad2169.github.io", "https://webswan-billing.netlify.app"];
const BRANDS = ["The WebSwan", "WebSwan Media Network", "WebSwan Digital Solutions"];
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let jwksCache = { keys: null, at: 0 };

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Billing-Key",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
}
function reply(status, body, origin) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
}
const b64urlJson = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

async function verifyFirebaseToken(token) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) throw new Error("bad token");
  const header = b64urlJson(parts[0]), payload = b64urlJson(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("bad token header");
  if (!jwksCache.keys || Date.now() - jwksCache.at > 3600e3) {
    const r = await fetch(JWKS_URL);
    if (!r.ok) throw new Error("cannot load Google keys");
    jwksCache = { keys: (await r.json()).keys, at: Date.now() };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown key");
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const ok = crypto.verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), key, Buffer.from(parts[2], "base64url"));
  if (!ok) throw new Error("bad signature");
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== PROJECT_ID || payload.iss !== "https://securetoken.google.com/" + PROJECT_ID) throw new Error("wrong project");
  if (!(payload.exp > now) || !(payload.iat <= now + 60) || !payload.sub) throw new Error("expired");
  if (!payload.email_verified) throw new Error("email not verified");
  return String(payload.email || "").toLowerCase();
}

function keyMatches(given, expected) {
  if (!given || !expected) return false;
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

async function stripe(secret, path, params) {
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST",
    headers: { "Authorization": "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString()
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || "Stripe error");
  return data;
}

const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const cents = (n) => Math.round(Number(n) * 100);

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Not allowed from this page." }, origin);

  // 1) Google sign-in, owner only
  let email;
  try { email = await verifyFirebaseToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")); }
  catch (e) { return reply(401, { error: "Please sign in with Google again." }, origin); }
  if (!OWNERS.includes(email)) return reply(403, { error: "This account can't create payment links." }, origin);

  // 2) billing security key
  if (!keyMatches(req.headers.get("x-billing-key"), process.env.BILLING_KEY)) {
    await new Promise((r) => setTimeout(r, 1200)); // slow down guessing
    return reply(403, { error: "Wrong billing security key." }, origin);
  }

  // 3) validate the plan
  let b;
  try { b = await req.json(); } catch (e) { return reply(400, { error: "Bad request." }, origin); }
  const brand = BRANDS.includes(b.brand) ? b.brand : null;
  const planName = clean(b.planName, 120);
  const clientName = clean(b.clientName, 120), company = clean(b.company, 120), clientEmail = clean(b.email, 200);
  const interval = ["month", "year", "none"].includes(b.interval) ? b.interval : null;
  const setup = Number(b.setup) || 0, recur = interval === "none" ? 0 : Number(b.recur) || 0;
  const delayDays = Math.max(0, Math.min(365, parseInt(b.delayDays, 10) || 0));
  if (!brand || !planName || !interval) return reply(400, { error: "Missing brand, plan name or interval." }, origin);
  if (setup < 0 || recur < 0 || setup > 50000 || recur > 20000) return reply(400, { error: "Amounts look wrong." }, origin);
  if (setup <= 0 && recur <= 0) return reply(400, { error: "Enter a setup fee or a recurring charge." }, origin);
  if (recur > 0 && recur < 0.5) return reply(400, { error: "Recurring charge must be at least $0.50." }, origin);
  if (setup > 0 && recur <= 0 && setup < 0.5) return reply(400, { error: "Setup fee must be at least $0.50." }, origin);

  const secret = (brand === "WebSwan Media Network" && process.env.STRIPE_SECRET_KEY_MEDIA)
    || (brand === "WebSwan Digital Solutions" && process.env.STRIPE_SECRET_KEY_DIGITAL)
    || process.env.STRIPE_SECRET_KEY;
  if (!secret) return reply(500, { error: "Stripe key is not set up yet in Netlify." }, origin);

  const who = company || clientName;
  const meta = { brand, client: who, created_by: email, source: "WebSwan Residual billing" };
  try {
    const items = [];
    if (recur > 0) {
      const p = await stripe(secret, "prices", {
        currency: "usd", unit_amount: String(cents(recur)), "recurring[interval]": interval,
        "product_data[name]": `${planName} (${brand})`, ...Object.fromEntries(Object.entries(meta).map(([k, v]) => ["metadata[" + k + "]", v]))
      });
      items.push(p.id);
    }
    if (setup > 0) {
      const p = await stripe(secret, "prices", {
        currency: "usd", unit_amount: String(cents(setup)),
        "product_data[name]": `${planName} - setup fee (${brand})`, ...Object.fromEntries(Object.entries(meta).map(([k, v]) => ["metadata[" + k + "]", v]))
      });
      items.push(p.id);
    }
    const params = {};
    items.forEach((id, i) => { params[`line_items[${i}][price]`] = id; params[`line_items[${i}][quantity]`] = "1"; });
    Object.entries(meta).forEach(([k, v]) => { params[`metadata[${k}]`] = v; });
    if (clientEmail) params["metadata[client_email]"] = clientEmail;
    params["restrictions[completed_sessions][limit]"] = "1";   // one payment per link, like an invoice
    if (recur <= 0) {
      // one-time payment: Stripe creates a real invoice and emails it (with the receipt) to the client after they pay
      params["invoice_creation[enabled]"] = "true";
      params["invoice_creation[invoice_data][description]"] = `${planName} (${brand})`.slice(0, 500);
      params["invoice_creation[invoice_data][footer]"] = `Thank you for choosing ${brand}!`;
      Object.entries(meta).forEach(([k, v]) => { params[`invoice_creation[invoice_data][metadata][${k}]`] = v; });
    }
    if (recur > 0) {
      Object.entries(meta).forEach(([k, v]) => { params[`subscription_data[metadata][${k}]`] = v; });
      if (delayDays > 0) params["subscription_data[trial_period_days]"] = String(delayDays);
    }
    const link = await stripe(secret, "payment_links", params);
    return reply(200, { url: link.url, id: link.id }, origin);
  } catch (e) {
    return reply(502, { error: "Stripe: " + e.message }, origin);
  }
};
