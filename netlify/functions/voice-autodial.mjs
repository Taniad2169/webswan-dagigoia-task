// WebSwan Voice Studio auto-dialer: runs every minute on Netlify and dials the next lead in the queue.
// It only dials when ALL of these are true:
//   - VOICE_CALLING_ENABLED = on, the Cartesia key, an agent ID and at least one caller-ID number are set
//   - the queue is not paused (the Voice Studio kill switch pauses it too)
//   - today and now are inside the auto-dial schedule (days + start/end time, Eastern Time by default)
//   - it is business hours in the LEAD's own time zone (9 AM to 5 PM, stricter in some states)
//   - the number is valid, not on the Do Not Call list, not already called today, and the daily cap per number isn't reached
// The queue and settings are saved by Voice Studio through the voice-calls function (Netlify Blobs store "voice-studio").
import { getStore } from "@netlify/blobs";
import { budgetGate, budgetRecord } from "../lib/budget.mjs";

// Wakes every minute 12:00-01:59 UTC, Mon-Sat UTC (covers Monday to Friday daytime in every US time zone).
// The schedule saved in Voice Studio (days + up to two windows, in Tania's chosen time zone) narrows it to the exact days and hours.
// (Before Nov 7 this was Tue-Fri UTC, so a Monday checked in the schedule never dialed.)
export const config = { schedule: "* 12-23,0-1 * * 1-6" };

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
// Each agent's own calling hours inside the dialing windows, in the schedule's time zone (Tania, Nov 6):
// Tania, Nov 10: Monica 7-8 AM and 11 AM-12, George 8-9 AM and 12-1 PM, Rebecca 9-10 AM and 1-2 PM (one caller per hour,
// a break from 10 to 11). Alek is not limited (floating, Tania's own calls). Before Nov 10: Monica 7-8 and 1-2, George 8-9, Rebecca 9-10 and 12-1.
// Voice Studio can override this by saving settings.agentHours.
const DEFAULT_AGENT_HOURS = { monica: [["07:00", "08:00"], ["11:00", "12:00"]], george: [["08:00", "09:00"], ["12:00", "13:00"]], rebecca: [["08:00", "09:00"], ["13:00", "14:00"]] };
const toMins = (s) => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const liveOn = () => String(process.env.VOICE_CALLING_ENABLED || "").toLowerCase() === "on";
const cap = () => Math.max(1, Math.min(300, parseInt(process.env.VOICE_DAILY_CAP, 10) || 80));
// Campaign caller IDs. Rachel's line (CARTESIA_ALEK_NUMBER_ID: Rachel answers it, Alek calls out on it) stays out of the
// campaign rotation so it never gets flagged as spam and is always free for inbound calls.
const ALEK_NUM = () => String(process.env.CARTESIA_ALEK_NUMBER_ID || "").trim();
const numberIds = () => { const all = String(process.env.CARTESIA_FROM_NUMBER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean), out = all.filter((id) => id !== ALEK_NUM()); return out.length ? out : all; };
let EXTRA_IDS = {};
const V_READ = process.env.CARTESIA_READ_VERSION || "2026-08-14";
async function cart(method, path, body) {
  const r = await fetch(API + path, { method, headers: { "Authorization": "Bearer " + process.env.CARTESIA_API_KEY, "X-API-Key": process.env.CARTESIA_API_KEY, "Cartesia-Version": V_READ, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(String(d.message || d.error || "Cartesia " + r.status).slice(0, 200)); return d;
}
// Alek's one agent switches to Brazilian Portuguese for pt leads and back for English/Spanish leads.
// Tania, Nov 11: Alek speaks ONE language per call. Mixing English and Spanish in the same call gets him hung up on,
// so his agent is set to a single primary language with no extra languages before every call.
const ALEK_LANGS = { en: { primary: "en", additional: [] }, es: { primary: "es-MX", additional: [] }, pt: { primary: "pt-BR", additional: [] } };
async function alekLanguage(id, lang, store) {
  const want = ALEK_LANGS[lang] || ALEK_LANGS.en;
  const d = await cart("GET", "/v1/agents/" + encodeURIComponent(id));
  const cur = ((d.config || (d.agent && d.agent.config)) || {}).language || {};
  const extras = Array.isArray(cur.additional) ? cur.additional.length : 0;
  if (String(cur.primary || "") === want.primary && !extras) return;
  await cart("PATCH", "/v1/agents/" + encodeURIComponent(id), { config: { language: want } });
}
const agentId = (name) => process.env["CARTESIA_AGENT_" + String(name || "").toUpperCase()] || EXTRA_IDS[String(name || "").toLowerCase()] || "";
function e164(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  return /^1[2-9]\d{2}[2-9]\d{6}$/.test(d) ? "+" + d : "";
}
// Tania, Nov 11: the last call of the day goes out at 4:45 PM in the LEAD's own time zone, never later.
// That stops East Coast prospects being rung as they walk out, and still leaves the West Coast open.
const LAST_CALL_MINS = 16 * 60 + 45;
function leadOpen(lead) {
  const tz = TZ[lead.state]; if (!tz) return false;
  const c = clock(tz); const w = STATE_HOURS[lead.state] || BUSINESS;
  const end = Math.min(w[1] * 60, LAST_CALL_MINS);
  return DAYS.indexOf(c.day) >= 1 && DAYS.indexOf(c.day) <= 5 && c.mins >= w[0] * 60 && c.mins < end;
}

export default async () => {
  if (!liveOn() || !process.env.CARTESIA_API_KEY || !numberIds().length) return new Response("off");
  const store = getStore({ name: "voice-studio", consistency: "strong" });
  EXTRA_IDS = (await store.get("agent-ids", { type: "json" }).catch(() => null)) || {};
  const q = await store.get("queue", { type: "json" });
  if (!q || q.paused || !Array.isArray(q.leads) || !q.leads.length) return new Response("idle");
  // Tania's hard rule (Nov 7): nothing goes out after 6 PM New York time, and never on weekends.
  const ny = clock("America/New_York");
  if (ny.hour >= 18 || ny.day === "sat" || ny.day === "sun") return new Response("after 6 PM New York time");
  // Tania, Nov 7: campaigns call Monday to Thursday only (doctors leave early or are off on Fridays). Alek's callbacks still run lead by lead.
  if (ny.day === "fri") return new Response("no campaign calls on Fridays");
  const s = q.settings || {};
  const tz = s.tz || "America/New_York", now = clock(tz);
  if (!(s.days || []).includes(now.day)) return new Response("not a dialing day");
  // Up to two dialing windows a day (for example 8-9 AM and 1-2 PM).
  const wins = [[toMins(s.start), toMins(s.end)], [toMins(s.start2), toMins(s.end2)]];
  const win = wins.findIndex(([a, b]) => a >= 0 && b > a && now.mins >= a && now.mins < b);
  if (win < 0) return new Response("outside window");

  // Monthly budget: how many more 6-minute calls fit under the stop line (unfinished calls count at full length).
  const gate = await budgetGate(store, 1, 6);
  if (!gate.ok) {
    q.paused = true; q.pauseReason = "budget"; q.lastRun = Date.now();
    await store.setJSON("queue", q);
    return new Response("paused: monthly budget reached");
  }
  let allowance = gate.allowance;

  const day = today(), countsKey = "count-" + day, dialedKey = "dialed-" + day;
  const dnc = (await store.get("dnc", { type: "json" })) || [];
  const dialed = (await store.get(dialedKey, { type: "json" })) || [];
  const counts = (await store.get(countsKey, { type: "json" })) || {};
  // pace 0.5 = one call every 2 minutes: rest on odd minutes
  if (Number(s.perMinute) === 0.5 && now.mins % 2 === 1) return new Response("resting (1 call every 2 minutes)");
  const perRun = Number(s.perMinute) === 0.5 ? 1 : Math.max(1, Math.min(5, parseInt(s.perMinute, 10) || 1));
  // Campaigns dial AT THE SAME TIME: the pace applies to each campaign line separately
  // (Media Network = Rebecca, Compliance doctors = Monica, Compliance attorneys = George, Alek on his own), and each
  // caller has her/his own limit per window (Tania, Nov 3: Monica and George each get their own 12).
  const line = (a) => a === "rebecca" ? "media" : a || "other";
  const winKey = "win-" + day, winCounts = (await store.get(winKey, { type: "json" })) || {};
  const perWin = Number(s.perWindow) || 0, placedBy = {};
  let placed = 0;

  for (const lead of q.leads) {
    if (lead.status !== "queued") continue;
    if (String(lead.agent || "").toLowerCase() === "alek") continue; // Tania, Nov 11: Alek never auto-dials; she gives him his calls herself
    if (lead.notBefore && Date.now() < lead.notBefore) continue; // Eva follow-up: waits 24 hours after her email
    if (allowance <= 0) { q.paused = true; q.pauseReason = "budget"; break; }
    const ln = line(String(lead.agent || s.agent || "").toLowerCase()), wk = win + ":" + ln;
    if ((placedBy[ln] || 0) >= perRun) continue;
    if (perWin && (winCounts[wk] || 0) >= perWin) continue; // this campaign is done for this window
    if (Object.keys(placedBy).length && placed >= perRun * 4) break;
    const to = e164(lead.phone);
    if (!to) { lead.status = "skipped"; lead.note = "invalid number"; continue; }
    if (dnc.includes(to)) { lead.status = "skipped"; lead.note = "Do Not Call"; continue; }
    if (dialed.includes(to)) continue; // try again another day
    if (!leadOpen(lead)) continue; // outside the lead's business hours; stays in the queue
    const name = String(lead.agent || s.agent || "").toLowerCase(), lang = ["es", "pt"].includes(lead.lang) ? lead.lang : "en", aid = agentId(lang === "en" ? name : name + "_" + lang) || (lang === "es" || (name === "alek" && lang === "pt") ? agentId(name) : "");
    if (!aid) continue; // agent not connected yet; stays in the queue
    const slots = (s.agentHours || DEFAULT_AGENT_HOURS)[name];
    if (slots && !slots.some(([a, b]) => now.mins >= toMins(a) && now.mins < toMins(b))) continue; // not this agent's hour; stays in the queue
    if (name === "alek" && !agentId("alek_pt")) { try { await alekLanguage(aid, lang, store); } catch (e) { lead.note = "language switch: " + String(e.message).slice(0, 100); continue; } }
    const floating = name === "alek" && lead.mode === "floating" && String(lead.task || "").length >= 10;
    const pick = floating && ALEK_NUM() ? { id: ALEK_NUM() } : numberIds().map((id) => ({ id, n: counts[id] || 0 })).filter((x) => x.n < cap()).sort((x, y) => x.n - y.n)[0];
    if (!pick) break; // every number hit today's cap
    try {
      const r = await fetch(API + "/agents/calls", {
        method: "POST",
        headers: { "Authorization": "Bearer " + process.env.CARTESIA_API_KEY, "Cartesia-Version": V_CREATE, "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: aid, from_number_id: pick.id,
          outbound_calls: [{ to_number: to, metadata: { leadId: lead.id, lead: lead.name || "", business: lead.business || "", campaign: lead.campaign || "", by: "auto-dialer" },
            dynamic_variables: { lead_id: lead.id || "", lead_name: lead.name || "", business: lead.business || "", lead_state: lead.state || "", findings: lead.findings || "none listed", lead_language: lang === "es" ? "Latin American Spanish" : lang === "pt" ? "Brazilian Portuguese" : "English", call_mode: name === "alek" ? (floating ? "Floating: follow Tania's task below" : "Selling: phone application (PWA) and digital e-card") : "standard", task: floating ? lead.task : "none" } }],
          ringing_timeout_seconds: 30, max_call_duration_minutes: 10
        })
      });
      const d = await r.json().catch(() => ({}));
      const c0 = (d.calls || [])[0] || {};
      if (!r.ok || !c0.agent_call_id) { lead.status = "error"; lead.note = String((d && (d.message || d.error)) || (c0.error && (c0.error.message || c0.error)) || ("HTTP " + r.status)).slice(0, 160); continue; }
      allowance--; await budgetRecord(store, { id: c0.agent_call_id, agent: name, by: "auto-dialer", maxMin: 6 });
      lead.status = "called"; lead.callId = c0.agent_call_id; lead.calledAt = Date.now(); lead.note = "";
      if (!(floating && ALEK_NUM())) counts[pick.id] = (counts[pick.id] || 0) + 1; dialed.push(to); placed++; placedBy[ln] = (placedBy[ln] || 0) + 1; winCounts[wk] = (winCounts[wk] || 0) + 1;
    } catch (e) { lead.status = "error"; lead.note = String(e.message || e).slice(0, 160); }
  }
  q.lastRun = Date.now();
  await store.setJSON("queue", q);
  if (placed) { await store.setJSON(countsKey, counts); await store.setJSON(dialedKey, dialed); await store.setJSON(winKey, winCounts); }
  return new Response("placed " + placed);
};
