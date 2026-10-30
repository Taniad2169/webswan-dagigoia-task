// Jennifer Reid (WSMN Central): patient/client requests from Rachel, and placing Jennifer's booking calls.
import { getStore } from "@netlify/blobs";
import { STATE_TZ } from "./cal.mjs";

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
