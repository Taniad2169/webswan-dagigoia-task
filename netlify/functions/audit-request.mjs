// Free website audit requests (moved off the old Netlify-only page, Nov 17 2026).
// The page now lives on GitHub Pages and posts here. Public POST saves the request and emails Tania; owner-only {action:"list"} reads them back.
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { verifyOwner } from "../lib/auth.mjs";
import { store as vsStore } from "../lib/central.mjs";
import { sanitizeCal, callScript } from "../lib/cal.mjs";

const ORIGINS = ["https://taniad2169.github.io", "https://webswandigitalsolutions.com", "https://www.webswandigitalsolutions.com"];
const TO = "thewebswann@gmail.com";
const cors = (o) => ({
  "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization", "Vary": "Origin", "Cache-Control": "no-store"
});
const reply = (st, body, o) => new Response(JSON.stringify(body), { status: st, headers: { "Content-Type": "application/json", ...cors(o) } });
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const h = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function emailTania(rec) {
  try {
    const vs = vsStore();
    const cal = sanitizeCal(await vs.get("calendar", { type: "json" })), secret = await vs.get("cal-secret");
    if (!cal.scriptUrl || !secret) return false;
    const row = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#5f7891">${k}</td><td style="padding:4px 0"><b>${h(v)}</b></td></tr>` : "";
    const html = `<div style="font-family:Arial,sans-serif;color:#17324c;max-width:560px"><h2 style="margin:0 0 8px">New free audit request</h2>
    <table style="border-collapse:collapse;font-size:15px">${row("Name", rec.name)}${row("Business", rec.business)}${row("Website", rec.website)}${row("Phone", rec.phone)}${row("Email", rec.email)}${row("Type of business", rec.industry)}${row("Also interested in", rec.interest)}${row("Came from", rec.source)}${row("Received", new Date(rec.at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) + " PT")}</table>
    <p style="font-size:13px;color:#5f7891">They agreed to be contacted by phone, text or email about their audit.</p></div>`;
    const r = await callScript(cal, secret, { action: "mail", to: TO, subject: "New free audit request: " + rec.business, html, fromName: "WebSwan Free Audit" });
    return !!(r && r.ok);
  } catch (e) { return false; }
}

export default async (req) => {
  const o = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(o) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, o);
  let b; try { b = await req.json(); } catch (e) { return reply(400, { error: "Bad request." }, o); }
  const s = getStore({ name: "free-audit", consistency: "strong" });

  // owner-only: read the saved requests
  if (b && b.action === "list") {
    try { await verifyOwner(req); } catch (e) { return reply(401, { error: "Please sign in with Google again." }, o); }
    return reply(200, { requests: (await s.get("requests", { type: "json" })) || [] }, o);
  }

  if (!ORIGINS.includes(o)) return reply(403, { error: "Not allowed from this page." }, o);
  if (clean(b["bot-field"], 20)) return reply(200, { ok: true }, o);   // honeypot: pretend it worked
  const rec = {
    id: crypto.randomUUID(), at: Date.now(),
    name: clean(b.name, 80), business: clean(b.business, 120), website: clean(b.website, 160), phone: clean(b.phone, 40),
    email: clean(b.email, 120).toLowerCase(), industry: clean(b.industry, 60), interest: clean(b.interest, 80), source: clean(b.source, 40) || "website"
  };
  if (!rec.name || !rec.business || !rec.website) return reply(400, { error: "Please fill in your name, business and website." }, o);
  if (rec.phone.replace(/\D/g, "").length < 10) return reply(400, { error: "Please add a valid phone number." }, o);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rec.email)) return reply(400, { error: "That email doesn't look right." }, o);
  if (!(b.consent === "yes" || b.consent === true || b.consent === "on")) return reply(400, { error: "Please check the box so I can send your results." }, o);

  const list = (await s.get("requests", { type: "json" })) || [];
  const dupe = list.find((x) => x.email === rec.email && x.phone === rec.phone && Date.now() - x.at < 10 * 60e3);
  if (dupe) return reply(200, { ok: true }, o);
  list.unshift(rec);
  await s.setJSON("requests", list.slice(0, 2000));
  const emailed = await emailTania(rec);
  return reply(200, { ok: true, emailed }, o);
};
