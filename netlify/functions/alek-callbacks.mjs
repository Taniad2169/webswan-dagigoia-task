// Alek's callback calendar: calls people back at the date and time Tania scheduled
// ("call me back in 2 weeks", "end of the week"), with the subject and script she wrote.
// Runs every 5 minutes on weekdays. Only calls 8 AM to 8 PM in the person's own time zone AND before 6 PM New York time (Tania, Nov 7),
// never on the Do Not Call list, and only when VOICE_CALLING_ENABLED is on.
import { getStore } from "@netlify/blobs";
import { budgetGate, budgetRecord } from "../lib/budget.mjs";
import { STATE_TZ } from "../lib/cal.mjs";

export const config = { schedule: "*/5 13-23,0-3 * * 1-6" };
const API = "https://api.cartesia.ai";
const V_CREATE = process.env.CARTESIA_VERSION || "2026-03-01";
const e164 = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 10) d = "1" + d; return /^1[2-9]\d{2}[2-9]\d{6}$/.test(d) ? "+" + d : ""; };
const localHour = (tz) => Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));

export default async () => {
  if (String(process.env.VOICE_CALLING_ENABLED || "").toLowerCase() !== "on" || !process.env.CARTESIA_API_KEY) return new Response("off");
  const store = getStore({ name: "voice-studio", consistency: "strong" });
  // Tania's hard rule (Nov 7): nothing goes out after 6 PM New York time, and never on weekends.
  { const nyH = localHour("America/New_York"), nyD = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date()); if (nyH >= 18 || nyD === "Sat" || nyD === "Sun") return new Response("after 6 PM New York time"); }
  const list = (await store.get("callbacks", { type: "json" })) || [];
  const due = list.filter((c) => c.status === "scheduled" && Date.parse(c.callAt) <= Date.now());
  if (!due.length) return new Response("nothing due");
  const ids = (await store.get("agent-ids", { type: "json" }).catch(() => null)) || {};
  const alek = process.env.CARTESIA_AGENT_ALEK || ids.alek;
  const from = process.env.CARTESIA_ALEK_NUMBER_ID || String(process.env.CARTESIA_FROM_NUMBER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean)[0];
  if (!alek || !from) return new Response("Alek or his number not connected");
  const dnc = (await store.get("dnc", { type: "json" })) || [];
  for (const c of due.slice(0, 2)) {
    const to = e164(c.phone);
    if (!to) { c.status = "skipped"; c.note = "invalid number"; continue; }
    if (dnc.includes(to)) { c.status = "skipped"; c.note = "Do Not Call"; continue; }
    const tz = STATE_TZ[c.state] || "America/Los_Angeles", h = localHour(tz);
    if (h < 8 || h >= 20) continue; // waits for 8 AM their time
    const g = await budgetGate(store, 1, 10);
    if (!g.ok) { c.note = "waiting: monthly call budget reached"; continue; }
    const task = `CALLBACK Tania scheduled. Subject: ${c.subject}. ${c.name ? "They asked to be called back; you are Alek, Tania's virtual assistant." : ""} Instructions and script: ${c.script}`.slice(0, 1500);
    try {
      const r = await fetch(API + "/agents/calls", { method: "POST", headers: { Authorization: "Bearer " + process.env.CARTESIA_API_KEY, "Cartesia-Version": V_CREATE, "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: alek, from_number_id: from,
          outbound_calls: [{ to_number: to, metadata: { leadId: c.id, lead: c.name || "", business: c.business || "", campaign: "Alek callback", by: "callback-calendar" },
            dynamic_variables: { lead_id: c.id, lead_name: c.name || "", business: c.business || "", lead_state: c.state || "", findings: "none listed", lead_language: c.lang === "es" ? "Latin American Spanish" : c.lang === "pt" ? "Brazilian Portuguese" : "English", call_mode: "Floating: follow Tania's task below", task } }],
          ringing_timeout_seconds: 30, max_call_duration_minutes: 10 }) });
      const d = await r.json().catch(() => ({})); const c0 = (d.calls || [])[0] || {};
      if (!r.ok || !c0.agent_call_id) { c.status = "error"; c.note = String(d.message || d.error || ("HTTP " + r.status)).slice(0, 160); continue; }
      await budgetRecord(store, { id: c0.agent_call_id, agent: "alek", by: "callback-calendar", maxMin: 10 });
      c.status = "called"; c.callId = c0.agent_call_id; c.calledAt = new Date().toISOString(); c.note = "";
    } catch (e) { c.status = "error"; c.note = String(e.message || e).slice(0, 160); }
  }
  await store.setJSON("callbacks", list);
  return new Response("ok");
};
