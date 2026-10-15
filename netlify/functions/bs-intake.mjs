// WebSwan Business Service - public intake + status lookup.
// Stores requests in Netlify Blobs (store "business-service"). Never accepts SSNs/tax IDs.
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { reply, cors, ALLOWED_ORIGINS } from "../lib/auth.mjs";
import { makePayLink, checkPaid, amountFor } from "../lib/bspay.mjs";

const SERVICES = { ein: "EIN application assistance", "license-existing": "Existing business license application", "license-new": "New business license registration assistance", llc: "LLC formation assistance", package: "Business startup package" };
const STATES = ["NY", "FL", "WA", "TX"];
const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
const SSN_RE = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/;
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => "WS-" + Array.from(crypto.randomBytes(6), (b) => ALPH[b % ALPH.length]).join("");

function scrub(obj, depth = 0) {
  // walk the client object, clean every string and refuse anything that looks like an SSN/ITIN
  if (depth > 3 || obj == null) return null;
  if (typeof obj === "string") { if (SSN_RE.test(obj)) throw new Error("SSN"); return clean(obj, 1500); }
  if (typeof obj === "boolean" || typeof obj === "number") return obj;
  if (Array.isArray(obj)) return obj.slice(0, 10).map((x) => scrub(x, depth + 1));
  const out = {}; Object.keys(obj).slice(0, 30).forEach((k) => { out[clean(k, 40)] = scrub(obj[k], depth + 1); }); return out;
}

export default async (req, context) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Not allowed from this page." }, origin);
  let body; try { body = await req.json(); } catch (e) { return reply(400, { error: "Bad request." }, origin); }
  const store = getStore("business-service");
  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "unknown";

  if (body.action === "status") {
    const code = clean(body.code, 12).toUpperCase(), email = clean(body.email, 200).toLowerCase();
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    const rec = /^WS-[A-Z0-9]{6}$/.test(code) ? await store.get("req/" + code, { type: "json" }) : null;
    if (!rec || rec.client.email.toLowerCase() !== email) return reply(404, { error: "We couldn't find a request with that code and email." }, origin);
    let paid = false;
    try { const was = rec.pay && rec.pay.paid; paid = await checkPaid(rec); if (paid && !was) { rec.updatedAt = new Date().toISOString(); await store.setJSON("req/" + code, rec); } } catch (e) { paid = !!(rec.pay && rec.pay.paid); }
    // if Tania changed the final fee after the link was made, make a fresh link for the new amount
    if (!paid && rec.status !== "Cancelled") {
      try { if (!rec.pay || rec.pay.amount !== amountFor(rec)) { rec.pay = await makePayLink(rec); await store.setJSON("req/" + code, rec); } } catch (e) {}
    }
    return reply(200, { status: rec.status, serviceName: rec.serviceName, business: rec.business.name, clientNote: rec.clientNote || "", updatedAt: rec.updatedAt,
      paid, payUrl: !paid && rec.status !== "Cancelled" && rec.pay ? rec.pay.url : "", payAmount: rec.pay ? rec.pay.amount : null }, origin);
  }

  if (body.action !== "create") return reply(400, { error: "Bad request." }, origin);
  const d = body.data || {};
  if (d.hp) return reply(200, { code: newCode() }, origin); // bot honeypot: pretend success
  // simple rate limit: 8 requests per IP per hour
  const hourKey = "rl/" + crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16) + "/" + new Date().toISOString().slice(0, 13);
  const count = (await store.get(hourKey, { type: "json" })) || 0;
  if (count >= 8) return reply(429, { error: "Too many requests. Please call us instead." }, origin);
  await store.setJSON(hourKey, count + 1);

  let data;
  try { data = scrub(d); } catch (e) { return reply(400, { error: "Please remove any Social Security or tax ID numbers. We will collect those securely only if needed." }, origin); }
  const c = data.client || {}, b = data.business || {}, sig = (data.consent || {}).signature || {};
  if (!SERVICES[data.service] || !STATES.includes(data.state)) return reply(400, { error: "Choose a service and state." }, origin);
  if (!c.fullName || !c.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) || !c.phone || !b.name) return reply(400, { error: "Please fill in your name, email, phone and business name." }, origin);
  if (!sig.name || !sig.font || !(data.consent && data.consent.feeAck) || ((data.consent.acks || []).length < 5)) return reply(400, { error: "Please review the disclosures and sign." }, origin);
  if (sig.name.toLowerCase().replace(/\s+/g, " ") !== c.fullName.toLowerCase().replace(/\s+/g, " ")) return reply(400, { error: "Your signature must match your full legal name." }, origin);

  let code; for (let i = 0; i < 5; i++) { code = newCode(); if (!(await store.get("req/" + code))) break; }
  const now = new Date().toISOString();
  const rec = {
    code, createdAt: now, updatedAt: now, status: "Received",
    history: [{ status: "Received", at: now, by: "client" }],
    service: data.service, serviceName: SERVICES[data.service], serviceFee: data.serviceFee, state: data.state,
    client: c, business: b, llc: data.llc || null, ein: data.ein || null, notes: data.notes || "",
    consent: { ...data.consent, signedAt: sig.at || now, receivedAt: now, ip, serverUserAgent: clean(req.headers.get("user-agent"), 300) },
    clientNote: "", internalNotes: [], finalFee: ""
  };
  try { rec.pay = await makePayLink(rec); } catch (e) { rec.pay = null; rec.payError = String(e.message).slice(0, 200); }
  await store.setJSON("req/" + code, rec);

  // notify Tania (no sensitive data in this email)
  try {
    await fetch("https://formspree.io/f/meaowdvq", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ _subject: "New WebSwan Business Service request " + code, code, service: rec.serviceName, state: rec.state, client: c.fullName, email: c.email, phone: c.phone, business: b.name, signedAs: sig.name }) });
  } catch (e) { /* notification is best-effort */ }

  return reply(200, { code, payUrl: rec.pay ? rec.pay.url : "", payAmount: rec.pay ? rec.pay.amount : null }, origin);
};
