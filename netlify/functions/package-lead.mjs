// Public lead-capture backend for the "Take me there" banners/forms on thewebswan.com,
// WebSwan Media Network and WebSwan Digital Solutions.
//   kind "websitePackage" -> the $899-to-start / $499mo Managed Website Program (banner now lives
//     on WebSwan Media Network, not thewebswan.com)
//   kind "fullAudit" -> the $799 full compliance/security audit (WebSwan Digital Solutions)
// Saves the lead, emails Tania, and queues it for WorkPilot pickup (mirrors sentinel-builder.mjs's
// lead queue -- separate store/queue, no shared code path with Sebastien's or Sentinel's queues).
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { reply, cors, ALLOWED_ORIGINS } from "../lib/auth.mjs";
import { store as vsStore } from "../lib/central.mjs";
import { sanitizeCal, callScript } from "../lib/cal.mjs";

const TO = "thewebswann@gmail.com";
const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const h = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pkgStore = () => getStore({ name: "package-leads", consistency: "strong" });

const PACKAGES = {
  websitePackage: { label: "Managed Website Program ($899 to start + $499/mo)", from: "WebSwan Media Network" },
  fullAudit: { label: "Full Compliance & Security Audit ($799)", from: "WebSwan Digital Solutions" },
  sentinell: { label: "Sentinell DIY website ($698 to build + $199/mo)", from: "thewebswan.com" }
};

async function emailTania(rec, pkg) {
  try {
    const vs = vsStore();
    const cal = sanitizeCal(await vs.get("calendar", { type: "json" })), secret = await vs.get("cal-secret");
    if (!cal.scriptUrl || !secret) return false;
    const row = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#5f7891">${k}</td><td style="padding:4px 0"><b>${h(v)}</b></td></tr>` : "";
    const html = `<div style="font-family:Arial,sans-serif;color:#17324c;max-width:560px"><h2 style="margin:0 0 8px">New "Take me there" lead -- ${h(pkg.label)}</h2>
    <table style="border-collapse:collapse;font-size:15px">${row("Name", rec.name)}${row("Business", rec.business)}${row("Phone", rec.phone)}${row("Email", rec.email)}${row("Note", rec.note)}${row("Came from", pkg.from)}${row("Received", new Date(rec.at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) + " PT")}</table></div>`;
    const r = await callScript(cal, secret, { action: "mail", to: TO, subject: `New ${pkg.label} lead: ${rec.business || rec.name}`, html, fromName: "WebSwan Take Me There" });
    return !!(r && r.ok);
  } catch (e) { return false; }
}

async function queueForWorkPilot(rec, kind, pkg) {
  const st = pkgStore();
  const idx = ((await st.get("lq-index", { type: "json" })) || []).filter((x) => x.status === "pending" || Date.now() - new Date(x.at).getTime() < 14 * 86400000);
  const item = {
    id: "pk" + Date.now().toString(36) + crypto.randomBytes(4).toString("hex"), kind: "create", at: new Date().toISOString(),
    status: "pending", by: "package-lead", name: rec.business || rec.name, phone: rec.phone, email: rec.email,
    comment: pkg.label + " (" + pkg.from + ")" + (rec.note ? " -- " + rec.note : ""), dropdown: "call back"
  };
  idx.push(item);
  await st.setJSON("lq-index", idx.slice(-500));
}

export default async (req) => {
  const o = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(o) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, o);
  if (!ALLOWED_ORIGINS.includes(o)) return reply(403, { error: "Not allowed from this page." }, o);
  let b; try { b = await req.json(); } catch (e) { return reply(400, { error: "Bad request." }, o); }

  if (clean(b.hp, 20)) return reply(200, { ok: true }, o); // honeypot

  const kind = PACKAGES[b.kind] ? b.kind : "";
  if (!kind) return reply(400, { error: "Something went wrong. Please try again." }, o);
  const pkg = PACKAGES[kind];

  const rec = {
    id: crypto.randomUUID(), at: Date.now(), kind,
    name: clean(b.name, 80), business: clean(b.business, 120), phone: clean(b.phone, 40), email: clean(b.email, 120).toLowerCase(), note: clean(b.note, 400)
  };
  if (!rec.name) return reply(400, { error: "Please add your name." }, o);
  if (rec.phone.replace(/\D/g, "").length < 10) return reply(400, { error: "Please add a valid phone number." }, o);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rec.email)) return reply(400, { error: "That email doesn't look right." }, o);
  if (!(b.consent === true || b.consent === "on" || b.consent === "yes")) return reply(400, { error: "Please check the box so we can reach you." }, o);

  const s = pkgStore();
  const list = (await s.get("requests", { type: "json" })) || [];
  const dupe = list.find((x) => x.email === rec.email && x.phone === rec.phone && x.kind === kind && Date.now() - x.at < 10 * 60e3);
  if (!dupe) {
    list.unshift(rec);
    await s.setJSON("requests", list.slice(0, 2000));
    await queueForWorkPilot(rec, kind, pkg);
  }
  const emailed = await emailTania(rec, pkg);
  return reply(200, { ok: true, emailed }, o);
};
