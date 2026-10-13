// WebSwan Billing: checks whether a client paid a Stripe Payment Link.
// Security: same as create-payment-link (Google sign-in as an owner + page origin). Read-only.
// Stripe key needs: Checkout Sessions -> Read.
import crypto from "node:crypto";

const PROJECT_ID = "webswan-gigoia-task";
const OWNERS = ["thewebswann@gmail.com", "taniadomingue373@gmail.com"];
const ALLOWED_ORIGINS = ["https://taniad2169.github.io", "https://webswan-billing.netlify.app"];
const BRANDS = ["The WebSwan", "WebSwan Media Network", "WebSwan Digital Solutions"];
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let jwksCache = { keys: null, at: 0 };

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
}
const reply = (status, body, origin) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
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
  if (!crypto.verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), key, Buffer.from(parts[2], "base64url"))) throw new Error("bad signature");
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== PROJECT_ID || payload.iss !== "https://securetoken.google.com/" + PROJECT_ID) throw new Error("wrong project");
  if (!(payload.exp > now) || !(payload.iat <= now + 60) || !payload.sub || !payload.email_verified) throw new Error("expired");
  return String(payload.email || "").toLowerCase();
}

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Not allowed from this page." }, origin);

  let email;
  try { email = await verifyFirebaseToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")); }
  catch (e) { return reply(401, { error: "Please sign in with Google again." }, origin); }
  if (!OWNERS.includes(email)) return reply(403, { error: "This account can't check payments." }, origin);

  let b;
  try { b = await req.json(); } catch (e) { return reply(400, { error: "Bad request." }, origin); }
  const links = (Array.isArray(b.links) ? b.links : []).slice(0, 25)
    .filter((l) => l && /^plink_[A-Za-z0-9]+$/.test(l.id || "") && BRANDS.includes(l.brand));
  if (!links.length) return reply(400, { error: "No payment links to check." }, origin);

  const results = {};
  for (const l of links) {
    const secret = (l.brand === "WebSwan Media Network" && process.env.STRIPE_SECRET_KEY_MEDIA)
      || (l.brand === "WebSwan Digital Solutions" && process.env.STRIPE_SECRET_KEY_DIGITAL)
      || process.env.STRIPE_SECRET_KEY;
    if (!secret) { results[l.id] = { error: "Stripe key is not set up yet in Netlify." }; continue; }
    try {
      const url = "https://api.stripe.com/v1/checkout/sessions?limit=5&status=complete&payment_link=" + encodeURIComponent(l.id);
      const r = await fetch(url, { headers: { "Authorization": "Bearer " + secret } });
      const data = await r.json();
      if (!r.ok) throw new Error((data.error && data.error.message) || "Stripe error");
      const s = (data.data || []).find((x) => x.payment_status === "paid" || x.payment_status === "no_payment_required");
      results[l.id] = s
        ? { paid: true, paidAt: s.created * 1000, amount: (s.amount_total || 0) / 100,
            customerEmail: (s.customer_details && s.customer_details.email) || null,
            customerName: (s.customer_details && s.customer_details.name) || null }
        : { paid: false };
    } catch (e) {
      results[l.id] = { error: /permission|access/i.test(e.message)
        ? "Your Stripe key needs Checkout Sessions: Read." : "Stripe: " + e.message };
    }
  }
  return reply(200, { results }, origin);
};
