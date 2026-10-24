// WebSwan Billing: lists providers who paid the self-serve WebSwan Media Network link on ads.webswanmedianetwork.com,
// so the Residual page can add them to the Residual list under WebSwan Media Network.
// Security: Google sign-in as an owner + page origin (same as check-payment). Read-only.
// Stripe key needs: Payment Links -> Read, Checkout Sessions -> Read.
import { verifyOwner, reply, cors, ALLOWED_ORIGINS } from "../lib/auth.mjs";

// The self-serve link shown on ads.webswanmedianetwork.com ($400 setup + $289 first year today, then $29/month after 30 days)
const SELF_SERVE_URLS = ["https://buy.stripe.com/5kQ28rgWs0m9fIO3hY5ZC04"];

async function sget(secret, path) {
  const r = await fetch("https://api.stripe.com/v1/" + path, { headers: { "Authorization": "Bearer " + secret } });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || "Stripe error");
  return data;
}

async function findLinks(secret) {
  const found = [];
  let after = "";
  for (let page = 0; page < 10 && found.length < SELF_SERVE_URLS.length; page++) {
    const data = await sget(secret, "payment_links?limit=100" + (after ? "&starting_after=" + after : ""));
    for (const l of data.data || []) if (SELF_SERVE_URLS.includes(l.url)) found.push(l.id);
    if (!data.has_more || !data.data.length) break;
    after = data.data[data.data.length - 1].id;
  }
  return found;
}

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Not allowed from this page." }, origin);
  try { await verifyOwner(req); } catch (e) { return reply(401, { error: "Please sign in with Google again." }, origin); }

  const secrets = [process.env.STRIPE_SECRET_KEY_MEDIA, process.env.STRIPE_SECRET_KEY].filter(Boolean);
  if (!secrets.length) return reply(500, { error: "Stripe key is not set up yet in Netlify." }, origin);

  let lastErr = null;
  for (const secret of [...new Set(secrets)]) {
    try {
      const ids = await findLinks(secret);
      if (!ids.length) continue;   // link lives in the other Stripe account
      const signups = [];
      for (const id of ids) {
        let after = "";
        for (let page = 0; page < 5; page++) {
          const data = await sget(secret, "checkout/sessions?limit=100&status=complete&payment_link=" + id + (after ? "&starting_after=" + after : ""));
          for (const s of data.data || []) {
            if (!(s.payment_status === "paid" || s.payment_status === "no_payment_required")) continue;
            const cd = s.customer_details || {};
            const biz = (s.custom_fields || []).map((f) => (f.text && f.text.value) || (f.dropdown && f.dropdown.value) || "").find(Boolean) || "";
            signups.push({
              sessionId: s.id, paidAt: s.created * 1000, amount: (s.amount_total || 0) / 100,
              name: cd.name || "", email: cd.email || "", phone: cd.phone || "", business: biz,
              reference: s.client_reference_id || ""
            });
          }
          if (!data.has_more || !data.data.length) break;
          after = data.data[data.data.length - 1].id;
        }
      }
      return reply(200, { signups }, origin);
    } catch (e) {
      lastErr = /permission|access/i.test(e.message) ? "Your Stripe key needs Payment Links: Read and Checkout Sessions: Read." : "Stripe: " + e.message;
    }
  }
  return reply(lastErr ? 502 : 404, { error: lastErr || "Could not find the ads-site payment link in Stripe." }, origin);
};
