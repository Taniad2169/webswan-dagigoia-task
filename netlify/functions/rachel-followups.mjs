// Rachel follow-up calls: when Tania emailed a report (compliance) or an offer (advertising, social media,
// AI receptionist, appointment setter) and the business hasn't booked yet, Rachel calls to set a 10 to 15
// minute appointment with Tania. Tania queues each call in Voice Studio (Alek's calendar page → Rachel follow-ups).
// Runs every 15 minutes on weekdays. Calls only 9 AM to 5 PM in the business's own time zone, never on the
// Do Not Call list, never if they already booked, and only when VOICE_CALLING_ENABLED is on.
import { callerAllowed } from "../lib/dialer-plan.mjs";
import { startWatch } from "../lib/call-watch.mjs";
import { leadMemoryText } from "../lib/lead-memory.mjs";
import { getStore } from "@netlify/blobs";
import { budgetGate, budgetRecord } from "../lib/budget.mjs";
import { STATE_TZ } from "../lib/cal.mjs";
import { fallbackRachelScript, titleOf, ptTime } from "../lib/rachel-pipeline.mjs";
import { addMessages } from "../lib/team.mjs";

// Tania, Nov 14: the internal rule below already cuts calls off at 6 PM New York, so waking past that was
// pure wasted credit -- trimmed the cron window to stop at the same 6 PM Eastern cutoff.
export const config = { schedule: "*/15 13-22 * * 1-5" };
const API = "https://api.cartesia.ai";
const V_CREATE = process.env.CARTESIA_VERSION || "2026-03-01";
const e164 = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 10) d = "1" + d; return /^1[2-9]\d{2}[2-9]\d{6}$/.test(d) ? "+" + d : ""; };
const local = (tz, opt) => new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: tz }, opt)).format(new Date());

export default async () => {
  if (String(process.env.VOICE_CALLING_ENABLED || "").toLowerCase() !== "on" || !process.env.CARTESIA_API_KEY) return new Response("off");
  const store = getStore({ name: "voice-studio", consistency: "strong" });
  // Tania's hard rule (Nov 7): nothing goes out after 6 PM New York time, and never on weekends.
  { const nyH = Number(local("America/New_York", { hour: "numeric", hourCycle: "h23" })), nyD = local("America/New_York", { weekday: "short" }); if (nyH >= 18 || nyD === "Sat" || nyD === "Sun" || nyD === "Fri") return new Response("after 6 PM New York time, Friday or weekend"); }
  const list = (await store.get("rachel-followups", { type: "json" })) || [];
  let dirty = await reportFinished(store, list); // Tania, Nov 24: Rachel posts how each call went in her chat
  // Tania, Nov 24: Rachel dials ONLY scripts Tania approved in Rachel's chat (records from before this rule have no
  // "approved" field and keep working). Waiting ones get one reminder a day in Rachel's chat.
  const waiting = list.filter((c) => c.status === "scheduled" && c.approved === false && Date.parse(c.callAt) <= Date.now());
  const today = new Date().toISOString().slice(0, 10);
  const remind = waiting.filter((c) => c.notifiedAt && c.remindedOn !== today);
  if (remind.length) {
    try { await addMessages("rachel", [{ role: "agent", kind: "rachel_approval", text: "## ⏳ Waiting for your OK before I call\n" + remind.map((c) => "- " + titleOf(c)).join("\n") + "\n\nReply **OK** here and I'll start dialing (or **skip** + the practice name)." }]); } catch (e) {}
    remind.forEach((c) => { c.remindedOn = today; }); dirty = true;
  }
  const due = list.filter((c) => c.status === "scheduled" && c.approved !== false && Date.parse(c.callAt) <= Date.now());
  if (!due.length) { if (dirty) await store.setJSON("rachel-followups", list); return new Response("nothing due"); }
  const silencedAgentsRO = ((await store.get("queue", { type: "json" })) || {}).silencedAgents; // Tania, Nov 21: manual per-agent silence switch
  if (!callerAllowed("rachelout", silencedAgentsRO)) { if (dirty) await store.setJSON("rachel-followups", list); return new Response("silent: this week only Jenna and George call (dialer plan)"); }
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
    if (h < 8 || h >= 17 || wd === "Sat" || wd === "Sun") continue; // waits for their business hours (Tania, Nov 24: from 8 AM)
    const g = await budgetGate(store, 1, 10);
    if (!g.ok) { c.note = "waiting: monthly call budget reached"; continue; }
    const kind = c.kind === "advertising" ? "advertising" : "compliance";
    try {
      const r = await fetch(API + "/agents/calls", { method: "POST", headers: { Authorization: "Bearer " + process.env.CARTESIA_API_KEY, "Cartesia-Version": V_CREATE, "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agent, from_number_id: nums[Math.floor(Math.random() * nums.length)],
          outbound_calls: [{ to_number: to, metadata: { leadId: c.id, lead: c.name || "", business: c.business || "", campaign: "Rachel follow-up (" + kind + ")", by: "rachel-followups" },
            dynamic_variables: { lead_id: c.id, lead_name: c.name || "", business: c.business || "", lead_state: c.state || "", findings: [c.website && "Website: " + c.website, c.note].filter(Boolean).join(". ") || "none listed", lead_memory: await leadMemoryText(to),
              lead_language: "English", call_mode: kind === "advertising" ? "follow-up on the advertising information Tania emailed" : "follow-up on the website compliance report Tania emailed", task: "SEBASTIEN'S SCRIPT FOR THIS PROSPECT (" + kind + "; follow it in order): " + (String(c.script || "").trim() || fallbackRachelScript(c)) } }],
          ringing_timeout_seconds: 30, max_call_duration_minutes: 10 }) });
      const d = await r.json().catch(() => ({})); const c0 = (d.calls || [])[0] || {};
      if (!r.ok || !c0.agent_call_id) { c.status = "error"; c.note = String(d.message || d.error || ("HTTP " + r.status)).slice(0, 160); continue; }
      await budgetRecord(store, { id: c0.agent_call_id, agent: "rachelout", by: "rachel-followups", maxMin: 10 }); await startWatch(c0.agent_call_id, "rachelout", to);
      c.status = "called"; c.callId = c0.agent_call_id; c.calledAt = new Date().toISOString(); n++;
    } catch (e) { c.status = "error"; c.note = String(e.message || e).slice(0, 160); }
  }
  await store.setJSON("rachel-followups", list);
  return new Response("ok");
};

// After each of Rachel's follow-up calls ends, she posts the result in her AI Office chat for Tania.
async function reportFinished(store, list) {
  const todo = list.filter((c) => c.status === "called" && c.callId && !c.reportedAt && Date.now() - Date.parse(c.calledAt || 0) > 3 * 60e3).slice(0, 4);
  if (!todo.length) return false;
  const bookings = (await store.get("bookings", { type: "json" })) || [], d10 = (x) => String(x || "").replace(/\D/g, "").slice(-10);
  const cbs = (await store.get("callbacks", { type: "json" })) || [];
  const V_READ = process.env.CARTESIA_READ_VERSION || "2026-08-14";
  let changed = false;
  for (const c of todo) {
    let call = {};
    try { const r = await fetch(API + "/agents/calls/" + encodeURIComponent(c.callId), { headers: { Authorization: "Bearer " + process.env.CARTESIA_API_KEY, "Cartesia-Version": V_READ } }); call = await r.json().catch(() => ({})); } catch (e) { continue; }
    const done = call.end_time || call.ended_at || /complet|ended|failed|cancel|no.?answer|busy/i.test(String(call.status || ""));
    if (!done && Date.now() - Date.parse(c.calledAt) < 30 * 60e3) continue;
    const tr = (Array.isArray(call.transcript) ? call.transcript : []).filter((t) => t && (t.text || t.content)).map((t) => (t.role === "user" ? "Them" : "Rachel") + ": " + String(t.text || t.content).trim());
    const reason = String(call.end_reason || call.endReason || call.status || "").replace(/_/g, " ");
    const humans = tr.filter((l) => l.startsWith("Them")).length;
    const booked = bookings.find((x) => Date.parse(x.at) >= Date.parse(c.calledAt) && d10(x.phone) === d10(c.phone));
    const jon = cbs.find((x) => x.agent === "jonathan" && x.status === "scheduled" && d10(x.phone) === d10(c.phone));
    const outcome = booked ? "📅 **Booked** " + ptTime(booked.start) + (jon ? " · Jonathan is scheduled to call them" : "")
      : /voicemail/i.test(reason) ? "📭 Voicemail (I didn't leave a message)" : !humans ? "📵 No one picked up (" + (reason || "no answer") + ")" : "💬 Talked, no appointment yet";
    const summary = String(call.summary || "").trim();
    const text = "## 📞 Call report\n" + titleOf(c) + " · " + c.phone + "\n" + outcome + (summary ? "\n\n**Summary:** " + summary.slice(0, 700) : "") + (humans ? "\n\n**Last lines:**\n" + tr.slice(-6).join("\n").slice(0, 900) : "");
    try { await addMessages("rachel", [{ role: "agent", kind: "rachel_report", text }]); c.reportedAt = new Date().toISOString(); c.outcome = outcome.replace(/\*\*/g, ""); changed = true; } catch (e) {}
  }
  return changed;
}
