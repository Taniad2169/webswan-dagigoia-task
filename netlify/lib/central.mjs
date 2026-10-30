// Jennifer Reid (WSMN Central): patient/client requests from Rachel, and placing Jennifer's booking calls.
import { getStore } from "@netlify/blobs";
import { STATE_TZ, sanitizeCal, callScript } from "./cal.mjs";

const API = "https://api.cartesia.ai";
export const store = () => getStore({ name: "voice-studio", consistency: "strong" });
export const liveOn = () => String(process.env.VOICE_CALLING_ENABLED || "").toLowerCase() === "on";
export function e164(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  return /^1[2-9]\d{2}[2-9]\d{6}$/.test(d) ? "+" + d : "";
}
// Patients/clients are called 9 AM to 7 PM their time, Monday to Saturday.
export function openNow(state) {
  const tz = STATE_TZ[String(state || "").toUpperCase()] || "America/New_York";
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date());
  const day = (p.find((x) => x.type === "weekday") || {}).value, hour = +((p.find((x) => x.type === "hour") || {}).value);
  return day !== "Sun" && hour >= 9 && hour < 19;
}
export async function placeCentralCall(s, req) {
  if (!liveOn() || !process.env.CARTESIA_API_KEY) return { ok: false, why: "calling off" };
  const ids = (await s.get("agent-ids", { type: "json" }).catch(() => null)) || {};
  const agent = process.env.CARTESIA_AGENT_JENNIFER || ids.jennifer || "";
  const from = process.env.CARTESIA_CENTRAL_NUMBER_ID || String(process.env.CARTESIA_FROM_NUMBER_IDS || "").split(",").map((x) => x.trim()).filter(Boolean)[0] || "";
  if (!agent || !from) return { ok: false, why: "Jennifer or her number isn't connected" };
  const dnc = (await s.get("dnc", { type: "json" })) || [];
  if (dnc.includes(req.phone)) return { ok: false, why: "Do Not Call", final: true };
  const r = await fetch(API + "/agents/calls", {
    method: "POST",
    headers: { "Authorization": "Bearer " + process.env.CARTESIA_API_KEY, "Cartesia-Version": process.env.CARTESIA_VERSION || "2026-03-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: agent, from_number_id: from,
      outbound_calls: [{ to_number: req.phone, metadata: { centralId: req.id, providerCode: req.providerCode, by: "rachel-central" },
        dynamic_variables: { call_mode: "Mode 1: Jennifer Reid, WSMN Central", lead_name: req.name, provider_code: req.providerCode, provider_name: req.providerName, lead_state: req.state || "", best_time: req.bestTime || "not given", lead_id: req.id, business: req.providerName, findings: "none listed", lead_language: "English", task: "none" } }],
      ringing_timeout_seconds: 30, max_call_duration_minutes: 6
    })
  });
  const d = await r.json().catch(() => ({}));
  const c0 = (d.calls || [])[0] || {};
  if (!r.ok || !c0.agent_call_id) return { ok: false, why: String(d.message || d.error || (c0.error && (c0.error.message || c0.error)) || "HTTP " + r.status).slice(0, 160) };
  return { ok: true, callId: c0.agent_call_id };
}

const h = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Email the practice about a request (both plans), with the WSMN file number (provider code). Sent from Tania's Google account.
export async function emailPractice(s, rec, to) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to || ""))) return { ok: false, why: "no practice email on the WSMN profile" };
  const cal = sanitizeCal(await s.get("calendar", { type: "json" })), secret = await s.get("cal-secret");
  if (!cal.scriptUrl || !secret) return { ok: false, why: "email bridge not connected" };
  const call = rec.kind === "call";
  const subject = (call ? "Jennifer is calling a new patient for you" : "New patient request") + " · File " + rec.providerCode + " · WebSwan Media Network";
  const row = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#5f7891">${k}</td><td style="padding:4px 0"><b>${h(v)}</b></td></tr>` : "";
  const html = `<div style="font-family:Arial,sans-serif;color:#17324c;max-width:560px">
  <h2 style="color:#082a48;margin:0 0 6px">${call ? "📞 Jennifer is calling to book" : "✉️ New request for your office"}</h2>
  <p>Hello ${h(rec.providerName)}'s office,</p>
  <p>${call ? "Someone chose your practice on WebSwan Media Network and asked us to call them to book. Jennifer, our scheduling assistant, is calling them now or during business hours, and will pass along their preferred times." : "Someone chose your practice on WebSwan Media Network and asked your office to contact them."}</p>
  <table style="border-collapse:collapse;font-size:15px">${row("File number", rec.providerCode)}${row("Name", rec.name)}${row("Phone", rec.phone)}${row("Email", rec.email)}${row("Best time to reach", rec.bestTime)}${row("Location", [rec.city, rec.state].filter(Boolean).join(", "))}${row("Received", new Date(rec.at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) + " PT")}</table>
  <p style="font-size:13px;color:#5f7891">They agreed to be contacted. No medical or legal details were collected. Please reply to this email with any questions and include your file number.</p>
  <p style="font-size:13px;color:#5f7891">WebSwan Media Network · powered by The WebSwan</p></div>`;
  try { const r = await callScript(cal, secret, { action: "mail", to, subject, html, fromName: "Jennifer · WebSwan Media Network" }); return r && r.ok ? { ok: true } : { ok: false, why: (r && r.error) || "mail failed" }; }
  catch (e) { return { ok: false, why: "mail: " + String(e.message || e).slice(0, 120) }; }
}
