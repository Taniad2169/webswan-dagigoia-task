// WebSwan Voice Studio auto-dialer: runs every minute on Netlify and dials the next lead in the queue.
// It only dials when ALL of these are true:
//   - VOICE_CALLING_ENABLED = on, the Cartesia key, an agent ID and at least one caller-ID number are set
//   - the queue is not paused (the Voice Studio kill switch pauses it too)
//   - today and now are inside the auto-dial schedule (days + start/end time, Eastern Time by default)
//   - it is business hours in the LEAD's own time zone (9 AM to 5 PM, stricter in some states)
//   - the number is valid, not on the Do Not Call list, not already called today, and the daily cap per number isn't reached
// The queue and settings are saved by Voice Studio through the voice-calls function (Netlify Blobs store "voice-studio").
import { getStore } from "@netlify/blobs";

// Runs only Tue, Wed and Thu, 15:00-16:59 UTC (covers 11 AM-12 PM Eastern in both summer and winter time).
// The schedule in Voice Studio narrows it to the exact hour; outside these times the dialer doesn't even wake up.
export const config = { schedule: "* 15-16 * * 2-4" };

const API = "https://api.cartesia.ai";
const V_CREATE = process.env.CARTESIA_VERSION || "2026-03-01";
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const TZ = { AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago", CA: "America/Los_Angeles", CO: "America/Denver", CT: "America/New_York", DE: "America/New_York", DC: "America/New_York", FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu", ID: "America/Boise", IL: "America/Chicago", IN: "America/Indiana/Indianapolis", IA: "America/Chicago", KS: "America/Chicago", KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York", MD: "America/New_York", MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago", MS: "America/Chicago", MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago", NV: "America/Los_Angeles", NH: "America/New_York", NJ: "America/New_York", NM: "America/Denver", NY: "America/New_York", NC: "America/New_York", ND: "America/Chicago", OH: "America/New_York", OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York", SC: "America/New_York", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", UT: "America/Denver", VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles", WV: "America/New_York", WI: "America/Chicago", WY: "America/Denver" };
// business-hours window in the lead's time zone [start, end) in hours; a few states are stricter
const STATE_HOURS = { CT: [9, 17], FL: [9, 17], OK: [9, 17], MD: [9, 17], WA: [9, 17], TX: [9, 17] };
const BUSINESS = [9, 17];

function clock(tz, d = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return { day: String(g("weekday")).slice(0, 3).toLowerCase(), mins: Number(g("hour")) * 60 + Number(g("minute")), hour: Number(g("hour")) };
}
const toMins = (s) => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const liveOn = () => String(process.env.VOICE_CALLING_ENABLED || "").toLowerCase() === "on";
const cap = () => Math.max(1, Math.min(300, parseInt(process.env.VOICE_DAILY_CAP, 10) || 60));
const numberIds = () => String(process.env.CARTESIA_FROM_NUMBER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
let EXTRA_IDS = {};
const agentId = (name) => process.env["CARTESIA_AGENT_" + String(name || "").toUpperCase()] || EXTRA_IDS[String(name || "").toLowerCase()] || "";
function e164(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  return /^1[2-9]\d{2}[2-9]\d{6}$/.test(d) ? "+" + d : "";
}
function leadOpen(lead) {
  const tz = TZ[lead.state]; if (!tz) return false;
  const c = clock(tz); const w = STATE_HOURS[lead.state] || BUSINESS;
  return DAYS.indexOf(c.day) >= 1 && DAYS.indexOf(c.day) <= 5 && c.hour >= w[0] && c.hour < w[1];
}

export default async () => {
  if (!liveOn() || !process.env.CARTESIA_API_KEY || !numberIds().length) return new Response("off");
  const store = getStore({ name: "voice-studio", consistency: "strong" });
  EXTRA_IDS = (await store.get("agent-ids", { type: "json" }).catch(() => null)) || {};
  const q = await store.get("queue", { type: "json" });
  if (!q || q.paused || !Array.isArray(q.leads) || !q.leads.length) return new Response("idle");
  const s = q.settings || {};
  const tz = s.tz || "America/New_York", now = clock(tz);
  if (!(s.days || []).includes(now.day)) return new Response("not a dialing day");
  const a = toMins(s.start), b = toMins(s.end);
  if (a < 0 || b <= a || now.mins < a || now.mins >= b) return new Response("outside window");

  const day = today(), countsKey = "count-" + day, dialedKey = "dialed-" + day;
  const dnc = (await store.get("dnc", { type: "json" })) || [];
  const dialed = (await store.get(dialedKey, { type: "json" })) || [];
  const counts = (await store.get(countsKey, { type: "json" })) || {};
  // pace 0.5 = one call every 2 minutes: rest on odd minutes
  if (Number(s.perMinute) === 0.5 && now.mins % 2 === 1) return new Response("resting (1 call every 2 minutes)");
  const perRun = Number(s.perMinute) === 0.5 ? 1 : Math.max(1, Math.min(3, parseInt(s.perMinute, 10) || 1));
  let placed = 0;

  for (const lead of q.leads) {
    if (placed >= perRun) break;
    if (lead.status !== "queued") continue;
    const to = e164(lead.phone);
    if (!to) { lead.status = "skipped"; lead.note = "invalid number"; continue; }
    if (dnc.includes(to)) { lead.status = "skipped"; lead.note = "Do Not Call"; continue; }
    if (dialed.includes(to)) continue; // try again another day
    if (!leadOpen(lead)) continue; // outside the lead's business hours; stays in the queue
    const name = String(lead.agent || s.agent || "").toLowerCase(), lang = ["es", "pt"].includes(lead.lang) ? lead.lang : "en", aid = agentId(lang === "en" ? name : name + "_" + lang);
    if (!aid) continue; // agent not connected yet; stays in the queue
    const pick = numberIds().map((id) => ({ id, n: counts[id] || 0 })).filter((x) => x.n < cap()).sort((x, y) => x.n - y.n)[0];
    if (!pick) break; // every number hit today's cap
    try {
      const r = await fetch(API + "/agents/calls", {
        method: "POST",
        headers: { "Authorization": "Bearer " + process.env.CARTESIA_API_KEY, "Cartesia-Version": V_CREATE, "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: aid, from_number_id: pick.id,
          outbound_calls: [{ to_number: to, metadata: { leadId: lead.id, lead: lead.name || "", business: lead.business || "", campaign: lead.campaign || "", by: "auto-dialer" },
            dynamic_variables: { lead_id: lead.id || "", lead_name: lead.name || "", business: lead.business || "", lead_state: lead.state || "", findings: lead.findings || "none listed", lead_language: lang === "es" ? "Latin American Spanish" : lang === "pt" ? "Brazilian Portuguese" : "English" } }],
          ringing_timeout_seconds: 30, max_call_duration_minutes: 6
        })
      });
      const d = await r.json().catch(() => ({}));
      const c0 = (d.calls || [])[0] || {};
      if (!r.ok || !c0.agent_call_id) { lead.status = "error"; lead.note = String((d && (d.message || d.error)) || (c0.error && (c0.error.message || c0.error)) || ("HTTP " + r.status)).slice(0, 160); continue; }
      lead.status = "called"; lead.callId = c0.agent_call_id; lead.calledAt = Date.now(); lead.note = "";
      counts[pick.id] = (counts[pick.id] || 0) + 1; dialed.push(to); placed++;
    } catch (e) { lead.status = "error"; lead.note = String(e.message || e).slice(0, 160); }
  }
  q.lastRun = Date.now();
  await store.setJSON("queue", q);
  if (placed) { await store.setJSON(countsKey, counts); await store.setJSON(dialedKey, dialed); }
  return new Response("placed " + placed);
};
