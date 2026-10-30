// Public endpoint: a visitor on WebSwan Media Network asks Rachel to have them contacted.
//   kind "call" -> $149 Premium provider: Jennifer Reid calls them to book (now if open, otherwise queued)
//   kind "lead" -> $69 Leads provider: saved for the practice's lead email
// Only accepts requests from the WSMN sites, requires consent, checks the provider's plan, and rate-limits.
import crypto from "node:crypto";
import { store, e164, openNow, placeCentralCall } from "../lib/central.mjs";

const ORIGINS = ["https://ads.webswanmedianetwork.com", "https://find.webswanmedianetwork.com", "https://www.webswanmedianetwork.com"];
const FS = "https://firestore.googleapis.com/v1/projects/webswan-marketing/databases/(default)/documents";
const FS_KEY = "AIzaSyAqhqUzWqpS7YunkODJU_udTBG3pjsJegQ";
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
const cors = (o) => ({ "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin", "Cache-Control": "no-store" });
const reply = (st, body, o) => new Response(JSON.stringify(body), { status: st, headers: { "Content-Type": "application/json", ...cors(o) } });
const fsv = (v) => !v ? "" : "stringValue" in v ? v.stringValue : "booleanValue" in v ? v.booleanValue : "";

export default async (req) => {
  const o = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(o) });
  if (req.method !== "POST" || !ORIGINS.includes(o)) return reply(403, { error: "Not allowed." }, o);
  let b; try { b = await req.json(); } catch (e) { return reply(400, { error: "Bad request." }, o); }
  const kind = b.kind === "call" ? "call" : b.kind === "lead" ? "lead" : "";
  const name = clean(b.name, 80), phone = e164(b.phone), email = clean(b.email, 120).toLowerCase(), pid = clean(b.providerId, 60);
  if (!kind || !/^[\w-]{4,60}$/.test(pid)) return reply(400, { error: "Something went wrong. Please try again." }, o);
  if (!name) return reply(400, { error: "Please add your name." }, o);
  if (!phone) return reply(400, { error: "Please add a valid US phone number." }, o);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(400, { error: "That email doesn't look right." }, o);
  if (b.consent !== true) return reply(400, { error: "Please check the box to agree." }, o);

  // the provider must be live and on the right plan
  const pr = await fetch(FS + "/providers/" + encodeURIComponent(pid) + "?key=" + FS_KEY);
  if (!pr.ok) return reply(404, { error: "This provider isn't available right now." }, o);
  const f = (await pr.json()).fields || {};
  if (fsv(f.active) !== true) return reply(404, { error: "This provider isn't available right now." }, o);
  const plan = fsv(f.plan), code = fsv(f.code), providerName = fsv(f.name);
  if (kind === "call" && (plan !== "premium" || !code)) return reply(400, { error: "This provider doesn't offer call-backs. Please call the office directly." }, o);
  if (kind === "lead" && plan !== "leads" && plan !== "premium") return reply(400, { error: "Please contact this office directly." }, o);

  const s = store();
  const list = (await s.get("central", { type: "json" })) || [];
  const day = Date.now() - 864e5, ip = req.headers.get("x-nf-client-connection-ip") || "";
  if (list.some((x) => x.phone === phone && x.providerId === pid && x.at > day)) return reply(200, { message: "We already have your request. You'll hear from us soon." }, o);
  if (ip && list.filter((x) => x.ip === ip && x.at > Date.now() - 36e5).length >= 5) return reply(429, { error: "Too many requests. Please try again later." }, o);

  const rec = { id: "cr_" + crypto.randomBytes(6).toString("hex"), at: Date.now(), kind, status: kind === "call" ? "queued" : "new", providerId: pid, providerCode: code, providerName, providerState: fsv(f.state),
    name, phone, email, bestTime: clean(b.bestTime, 80), state: clean(b.state, 2).toUpperCase() || fsv(f.state), city: clean(b.city, 60), consent: { at: Date.now(), text: kind === "call" ? "Agreed to an AI call from Jennifer (WSMN) about booking; may be recorded." : "Agreed to share contact details with the office." }, ip };
  let message = kind === "call" ? "Thank you! Jennifer will call you during business hours to help you book." : "Thank you! We've sent your request to the office. They'll contact you soon.";
  if (kind === "call" && openNow(rec.state)) {
    const r = await placeCentralCall(s, rec);
    if (r.ok) { rec.status = "called"; rec.callId = r.callId; rec.calledAt = Date.now(); message = "Thank you! Jennifer is calling you now."; }
    else rec.note = r.why;
  }
  list.unshift(rec);
  await s.setJSON("central", list.slice(0, 3000));
  return reply(200, { ok: true, message }, o);
};
