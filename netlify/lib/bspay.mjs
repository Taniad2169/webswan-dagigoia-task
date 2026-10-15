// WebSwan Business Service - one-time Stripe payment for the WebSwan service fee (The WebSwan Stripe account).
// Uses env STRIPE_SECRET_KEY (set by Tania in Netlify). Amounts come from this server table, never from the browser.
export const FEES = { ein: 69, "license-existing": 99, "license-new": 149, llc: 199, package: 299 };
const PAGE = "https://taniad2169.github.io/webswan-dagigoia-task/business-service/";

async function stripe(path, params, method = "POST") {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe key not set");
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method, headers: { "Authorization": "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "POST" ? new URLSearchParams(params).toString() : undefined
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d.error && d.error.message) || "Stripe error");
  return d;
}

// amount in dollars: the owner's final fee if set (e.g. "$249"), otherwise the starting fee for the service
export function amountFor(rec) {
  const f = parseFloat(String(rec.finalFee || "").replace(/[^0-9.]/g, ""));
  return f >= 1 && f <= 5000 ? f : FEES[rec.service];
}

export async function makePayLink(rec) {
  const amount = amountFor(rec);
  const meta = { code: rec.code, brand: "The WebSwan", source: "WebSwan Business Service", service: rec.service, state: rec.state };
  const m = (prefix) => Object.fromEntries(Object.entries(meta).map(([k, v]) => [prefix + "[" + k + "]", v]));
  const price = await stripe("prices", { currency: "usd", unit_amount: String(Math.round(amount * 100)),
    "product_data[name]": "WebSwan service fee: " + rec.serviceName + " (" + rec.code + ")", ...m("metadata") });
  const link = await stripe("payment_links", {
    "line_items[0][price]": price.id, "line_items[0][quantity]": "1",
    "restrictions[completed_sessions][limit]": "1", ...m("metadata"),
    "invoice_creation[enabled]": "true",
    "invoice_creation[invoice_data][description]": ("WebSwan service fee for " + rec.serviceName + ". Government fees are separate and not included.").slice(0, 500),
    "invoice_creation[invoice_data][footer]": "Thank you for choosing The WebSwan! Tracking code " + rec.code,
    ...m("invoice_creation[invoice_data][metadata]"),
    "after_completion[type]": "redirect",
    "after_completion[redirect][url]": PAGE + "?paid=" + rec.code
  });
  const url = link.url + "?client_reference_id=" + encodeURIComponent(rec.code) + "&prefilled_email=" + encodeURIComponent(rec.client.email || "");
  return { id: link.id, url, amount, createdAt: new Date().toISOString(), paid: false };
}

// returns true if this record's payment link has a completed, paid checkout
export async function checkPaid(rec) {
  if (!rec.pay || !rec.pay.id || rec.pay.paid) return !!(rec.pay && rec.pay.paid);
  const d = await stripe("checkout/sessions?limit=3&status=complete&payment_link=" + encodeURIComponent(rec.pay.id), null, "GET");
  const s = (d.data || []).find((x) => x.payment_status === "paid");
  if (!s) return false;
  rec.pay.paid = true; rec.pay.paidAt = new Date((s.created || Date.now() / 1000) * 1000).toISOString();
  rec.pay.amountPaid = (s.amount_total || 0) / 100;
  rec.history.push({ status: "Service fee paid ($" + rec.pay.amountPaid + ")", at: rec.pay.paidAt, by: "Stripe" });
  return true;
}
