// Rachel follow-up calls: when Tania emailed a report (compliance) or an offer (advertising, social media,
// AI receptionist, appointment setter) and the business hasn't booked yet, Rachel calls to set a 10 to 15
// minute appointment with Tania. Tania queues each call in Voice Studio (Alek's calendar page → Rachel follow-ups).
// Runs every 15 minutes on weekdays. Calls only 9 AM to 5 PM in the business's own time zone, never on the
// Do Not Call list, never if they already booked, and only when VOICE_CALLING_ENABLED is on.
import { getStore } from "@netlify/blobs";
import { budgetGate, budgetRecord } from "../lib/budget.mjs";
import { STATE_TZ } from "../lib/cal.mjs";

export const config = { schedule: "*/15 13-23,0-1 * * 1-5" };
const API = "https://api.cartesia.ai";
const V_CREATE = process.env.CARTESIA_VERSION || "2026-03-01";
const e164 = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 10) d = "1" + d; return /^1[2-9]\d{2}[2-9]\d{6}$/.test(d) ? "+" + d : ""; };
const local = (tz, opt) => new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: tz }, opt)).format(new Date());

export default async () => {
  if (String(process.env.VOICE_CALLING_ENABLED || "").toLowerCase() !== "on" || !process.env.CARTESIA_API_KEY) return new Response("off");
  const store = getStore({ name: "voice-studio", consistency: "strong" });
  const list = (await store.get("rachel-followups", { type: "json" })) || [];
  const due = list.filter((c) => c.status === "scheduled" && Date.parse(c.callAt) <= Date.now());
  if (!due.length) return new Response("nothing due");
  const ids = (await store.get("agent-ids", { type: "json" }).catch(() => null)) || {};
  const agent = process.env.CARTESIA_AGENT_RACHELOUT || ids.rachelout;
  const nums = String(process.env.CARTESIA_FROM_NUMBER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!agent || !nums.length) return new Response("Rachel's follow-up agent or numbers not connected");
  const dnc = (await store.get("dnc", { type: "json" })) || [];
  const bookings = (await store.get("bookings", { type: "json" })) || [];
  const d10 = (x) => String(x || "").replace(/\D/g, "").slice(-10);
  let n = 0;
  for (const c of due) {
    if (n >= 2) break;
    const to = e164(c.phone);
    if (!to) { c.status = "skipped"; c.note = "invalid number"; continue; }
    if (dnc.includes(to)) { c.status = "skipped"; c.note = "Do Not Call"; continue; }
    const booked = bookings.find((x) => (x.email && c.email && x.email.toLowerCase() === c.email.toLowerCase()) || (x.phone && d10(x.phone) === d10(c.phone)));
    if (booked) { c.status = "skipped"; c.note = "already booked"; continue; }
    const tz = STATE_TZ[c.state] || "America/New_York";
    const h = Number(local(tz, { hour: "numeric", hourCycle: "h23" })), wd = local(tz, { weekday: "short" });
    if (h < 9 || h >= 17 || wd === "Sat" || wd === "Sun") continue; // waits for their business hours
    const g = await budgetGate(store, 1, 10);
    if (!g.ok) { c.note = "waiting: monthly call budget reached"; continue; }
    const kind = c.kind === "advertising" ? "advertising" : "compliance";
    try {
      const r = await fetch(API + "/agents/calls", { method: "POST", headers: { Authorization: "Bearer " + process.env.CARTESIA_API_KEY, "Cartesia-Version": V_CREATE, "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agent, from_number_id: nums[Math.floor(Math.random() * nums.length)],
          outbound_calls: [{ to_number: to, metadata: { leadId: c.id, lead: c.name || "", business: c.business || "", campaign: "Rachel follow-up (" + kind + ")", by: "rachel-followups" },
            dynamic_variables: { lead_id: c.id, lead_name: c.name || "", business: c.business || "", lead_state: c.state || "", findings: [c.website && "Website: " + c.website, c.note].filter(Boolean).join(". ") || "none listed",
              lead_language: "English", call_mode: kind === "advertising" ? "follow-up on the advertising information Tania emailed" : "follow-up on the website compliance report Tania emailed", task: kind } }],
          ringing_timeout_seconds: 30, max_call_duration_minutes: 10 }) });
      const d = await r.json().catch(() => ({})); const c0 = (d.calls || [])[0] || {};
      if (!r.ok || !c0.agent_call_id) { c.status = "error"; c.note = String(d.message || d.error || ("HTTP " + r.status)).slice(0, 160); continue; }
      await budgetRecord(store, { id: c0.agent_call_id, agent: "rachelout", by: "rachel-followups", maxMin: 10 });
      c.status = "called"; c.callId = c0.agent_call_id; c.calledAt = new Date().toISOString(); n++;
    } catch (e) { c.status = "error"; c.note = String(e.message || e).slice(0, 160); }
  }
  await store.setJSON("rachel-followups", list);
  return new Response("ok");
};
