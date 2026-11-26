// Alek's callback calendar: calls people back at the date and time Tania scheduled
// ("call me back in 2 weeks", "end of the week"), with the subject and script she wrote.
// Runs every 5 minutes on weekdays. Only calls 8 AM to 8 PM in the person's own time zone AND before 8 PM New York time (Tania, Nov 14; was 6 PM Nov 7),
// never on the Do Not Call list, and only when VOICE_CALLING_ENABLED is on.
import { callerAllowed } from "../lib/dialer-plan.mjs";
import { startWatch } from "../lib/call-watch.mjs";
import { leadMemoryText } from "../lib/lead-memory.mjs";
import { getStore } from "@netlify/blobs";
import { budgetGate, budgetRecord } from "../lib/budget.mjs";
import { STATE_TZ } from "../lib/cal.mjs";

// Tania, Nov 14: trimmed off Saturday (the internal rule below already rejected every Saturday wake-up anyway,
// so that was pure wasted credit) and the cron now stops waking at 8 PM Eastern instead of running past it.
export const config = { schedule: "*/10 13-23,0 * * 1-5" }; // Nov 16: every 10 min (was 5) to save credits
const API = "https://api.cartesia.ai";
const V_CREATE = process.env.CARTESIA_VERSION || "2026-03-01";
const e164 = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 10) d = "1" + d; return /^1[2-9]\d{2}[2-9]\d{6}$/.test(d) ? "+" + d : ""; };
const localHour = (tz) => Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));

export default async () => {
  if (String(process.env.VOICE_CALLING_ENABLED || "").toLowerCase() !== "on" || !process.env.CARTESIA_API_KEY) return new Response("off");
  const store = getStore({ name: "voice-studio", consistency: "strong" });
  // Tania's hard rule (Nov 14, was 6 PM Nov 7): nothing goes out after 8 PM New York time, and never on weekends.
  { const nyH = localHour("America/New_York"), nyD = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date()); if (nyH >= 20 || nyD === "Sat" || nyD === "Sun") return new Response("after 8 PM New York time"); }
  const list = (await store.get("callbacks", { type: "json" })) || [];
  const due = list.filter((c) => c.status === "scheduled" && Date.parse(c.callAt) <= Date.now());
  if (!due.length) return new Response("nothing due");
  const ids = (await store.get("agent-ids", { type: "json" }).catch(() => null)) || {};
  const alek = process.env.CARTESIA_AGENT_ALEK || ids.alek;
  const from = process.env.CARTESIA_ALEK_NUMBER_ID || String(process.env.CARTESIA_FROM_NUMBER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean)[0];
  if (!alek || !from) return new Response("Alek or his number not connected");
  // Tania, Nov 12: Jenna (WebSwan Intelligence Director) is dialled from the same calendar, on her own line when CARTESIA_JENNA_NUMBER_ID is set.
  const jenna = process.env.CARTESIA_AGENT_JENNA || ids.jenna;
  const fromJenna = String(process.env.CARTESIA_JENNA_NUMBER_ID || "").trim() || from;
  // Tania, Nov 23: Jonathan (Compliance Tech Coordinator, outbound-only) calls back at the exact time Rachel,
  // Jenna or Mariska already booked with the prospect, going over that lead's real audit findings. No dedicated
  // number of his own yet -- he shares the general caller-ID pool.
  const jonathan = process.env.CARTESIA_AGENT_JONATHAN || ids.jonathan;
  // Tania, Nov 25: Mariska Lightborn (Rebecca's old line and Cartesia agent, reused -- no new number purchased)
  // calls back for SwanDesk AI / The WebSwan / WebSwan Media Network appointments Rachel booked. These replace
  // what used to land as an inbound call for Sebastien; Sebastien is back to coaching only.
  const mariska = process.env.CARTESIA_AGENT_REBECCA || ids.rebecca;
  const fromMariska = String(process.env.CARTESIA_REBECCA_NUMBER_ID || "").trim() || from;
  const dnc = (await store.get("dnc", { type: "json" })) || [];
  const silencedAgents = ((await store.get("queue", { type: "json" })) || {}).silencedAgents; // Tania, Nov 21: manual per-agent silence switch
  for (const c of due.filter((c) => callerAllowed(["jenna", "jonathan", "rebecca"].includes(c.agent) ? c.agent : "alek", silencedAgents)).slice(0, 2)) { // Nov 16 plan: only Jenna/George call this week
    const to = e164(c.phone);
    if (!to) { c.status = "skipped"; c.note = "invalid number"; continue; }
    if (dnc.includes(to)) { c.status = "skipped"; c.note = "Do Not Call"; continue; }
    const tz = STATE_TZ[c.state] || "America/Los_Angeles", h = localHour(tz);
    if (h < 8 || h >= 20) continue; // waits for 8 AM their time
    const g = await budgetGate(store, 1, 10);
    if (!g.ok) { c.note = "waiting: monthly call budget reached"; continue; }
    const who = ["jenna", "jonathan", "rebecca"].includes(c.agent) ? c.agent : "alek", aid = who === "jenna" ? jenna : who === "jonathan" ? jonathan : who === "rebecca" ? mariska : alek;
    if (!aid) { c.status = "error"; c.note = (who === "jenna" ? "Jenna" : who === "jonathan" ? "Jonathan" : who === "rebecca" ? "Mariska" : "Alek") + " is not connected to Cartesia yet"; continue; }
    const task = who === "jenna" ? `LEAD FROM TANIA. ${c.subject ? "Subject: " + c.subject + ". " : ""}${c.name ? "Ask for: " + c.name + ". " : ""}Her brief for this call: ${c.script}`.slice(0, 9000) /* Nov 16: room for an attached document */
      : who === "jonathan" ? "" // Jonathan isn't floating/tasked -- he runs his own fixed script and reads {{findings}} directly, set below.
      : who === "rebecca" ? `APPOINTMENT CALLBACK (SwanDesk AI / The WebSwan / WebSwan Media Network). Rachel already booked this with the prospect -- this is not a cold call, skip your cold opener and call as the confirmed appointment. ${c.subject ? "Subject: " + c.subject + ". " : ""}${c.name ? "Ask for: " + c.name + ". " : ""}What's already known: ${c.script}`.slice(0, 2500)
      : `CALLBACK Tania scheduled. Subject: ${c.subject}. ${c.name ? "They asked to be called back; you are Alek, Tania's virtual assistant." : ""} Instructions and script: ${c.script}`.slice(0, 1500);
    // Jonathan's whole call is going over the real findings Rachel/Jenna/Mariska entered when they booked this -- never "none listed" for him.
    const findings = who === "jonathan" ? (String(c.script || "").trim() || "none listed") : "none listed";
    try {
      const r = await fetch(API + "/agents/calls", { method: "POST", headers: { Authorization: "Bearer " + process.env.CARTESIA_API_KEY, "Cartesia-Version": V_CREATE, "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: aid, from_number_id: who === "jenna" ? fromJenna : who === "rebecca" ? fromMariska : from,
          outbound_calls: [{ to_number: to, metadata: { leadId: c.id, lead: c.name || "", business: c.business || "", campaign: who === "jenna" ? "Jenna: lead from Tania" : who === "jonathan" ? "Jonathan: compliance review callback" : who === "rebecca" ? "Mariska: SwanDesk/WebSwan/Media Network appointment callback" : "Alek callback", by: "callback-calendar" },
            dynamic_variables: { lead_id: c.id, lead_name: c.name || "", business: c.business || "", lead_state: c.state || "", findings, lead_memory: await leadMemoryText(to), lead_language: c.lang === "es" ? "Latin American Spanish" : c.lang === "pt" ? "Brazilian Portuguese" : "English", call_mode: who === "jonathan" ? "standard" : "Floating: follow Tania's task below", task } }],
          ringing_timeout_seconds: 30, max_call_duration_minutes: 10 }) });
      const d = await r.json().catch(() => ({})); const c0 = (d.calls || [])[0] || {};
      if (!r.ok || !c0.agent_call_id) { c.status = "error"; c.note = String(d.message || d.error || ("HTTP " + r.status)).slice(0, 160); continue; }
      await budgetRecord(store, { id: c0.agent_call_id, agent: who, by: "callback-calendar", maxMin: 10 }); await startWatch(c0.agent_call_id, who, to);
      c.status = "called"; c.callId = c0.agent_call_id; c.calledAt = new Date().toISOString(); c.note = "";
    } catch (e) { c.status = "error"; c.note = String(e.message || e).slice(0, 160); }
  }
  await store.setJSON("callbacks", list);
  return new Response("ok");
};
