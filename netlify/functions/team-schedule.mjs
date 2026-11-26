// Tania, Nov 14: "if I have a weekly assignment for them I need them to communicate automatically... if I have set
// a time for a task to be done between them I want to tell them day hour for them to start working right on time
// ... and that goes for all of them." Every 15 minutes, wake up any agent (or pair of agents) whose scheduled
// assignment has come due -- drops the task into each one's own chat as if Tania had just typed it, and triggers
// their reply job, with no one needing to be around. Agents schedule these themselves with ((SCHEDULE: ...)); see
// scheduleAssignment() and actionsHelp() in ../lib/agent-actions.mjs.
import { AGENTS, addMessages, teamStore } from "../lib/team.mjs";
import { startJobs } from "./team-daily.mjs";
import { sweepExpiredScripts } from "./voice-calls.mjs";
import { ptClock, toMins } from "../lib/team-routines.mjs";
import { DIALER_PLAN, planActive, dialerBlackoutActive } from "../lib/dialer-plan.mjs";

const first = (k) => String((AGENTS[k] || {}).name || k).split(" ")[0];

export default async () => {
  // Tania, Nov 15: clear any phone agent's campaign SCRIPT block whose 24h-1 week window is up (personality/
  // prompt/rebuttals untouched). Runs every 15 min alongside the assignment sweep below.
  let scriptSweep = { cleared: 0, checked: 0 };
  try { scriptSweep = await sweepExpiredScripts(); } catch (e) {}

  const st = teamStore();
  // Tania, Nov 16: Eva's reminders. Anything due (or due in the next 30 minutes, since this runs every 30) is posted in
  // Eva's chat as a reminder, once. The Google Calendar event Eva created already pings Tania's phone at the exact minute.
  let reminded = 0;
  try {
    const rem = (await st.get("tania-reminders", { type: "json" })) || [];
    const soon = Date.now() + 30 * 60000;
    const dueR = rem.filter((r) => r.status === "pending" && Date.parse(r.at) <= soon);
    if (dueR.length) {
      await addMessages("eva", dueR.map((r) => ({ role: "agent", kind: "reminder", text: "## ⏰ Reminder for Tania\n**" + r.what + "** — " + new Date(r.at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", minute: "2-digit" }) + " PT" })));
      dueR.forEach((r) => { r.status = "sent"; r.sentAt = new Date().toISOString(); }); reminded = dueR.length;
      await st.setJSON("tania-reminders", rem.slice(-300));
    }
  } catch (e) {}
  // Tania, Nov 17: Sebastien reviews Jenna every Friday afternoon (she never dials Fridays), and before each of Jenna's calling
  // windows her team preps her (Jonathan only joins when the leads are compliance calls). Each runs once, in the background.
  let routines = "";
  try {
    const c = ptClock(), done = (await st.get("routines-done", { type: "json" })) || [];
    const mark = async (k) => { done.push(k); await st.setJSON("routines-done", done.slice(-80)); };
    // Tania, Nov 25 ("turn off dialer for the whole weekend... having the meetings in brain roleplay... chewing my
    // credits -- block it, seal it"): both the huddle prep below and Jenna's Friday call review are themselves
    // LLM roleplay jobs tied to a calling week that isn't happening this week, so they're paused for the same
    // window as the dialer blackout, not just the calls themselves.
    if (!dialerBlackoutActive() && c.day === "fri" && c.mins >= 15 * 60 && c.mins < 19 * 60 && !done.includes("jr-" + c.date)) { await mark("jr-" + c.date); await startJobs(["jenna_review"]); routines += " review started;"; }
    if (!dialerBlackoutActive() && planActive() && ["mon", "tue", "wed", "thu"].includes(c.day)) {
      const wins = ((DIALER_PLAN.agents || {}).jenna || {}).windows || [];
      for (let i = 0; i < wins.length; i++) {
        const t = toMins(wins[i][0]), key = "hd-" + c.date + "-" + i;
        if (t >= 0 && c.mins >= t - 45 && c.mins < t && !done.includes(key)) { await mark(key); await startJobs(["huddle:" + c.date + "|" + i]); routines += " huddle " + i + " started;"; }
      }
    }
  } catch (e) { routines = " routines error: " + String(e.message || e).slice(0, 80); }
  const list = (await st.get("team-assignments", { type: "json" })) || [];
  const now = Date.now();
  const due = list.filter((a) => a.status === "pending" && Date.parse(a.runAt) <= now);
  if (!due.length) return new Response("nothing due; reminders sent: " + reminded + "; scripts cleared: " + scriptSweep.cleared + ";" + routines);
  for (const a of due) {
    a.status = "dispatched"; a.dispatchedAt = new Date().toISOString();
    const mates = (a.agents || []).filter((k) => AGENTS[k]);
    for (const agentKey of mates) {
      if (!AGENTS[agentKey]) continue;
      const others = mates.filter((k) => k !== agentKey).map(first);
      const text = "📅 Scheduled task (Tania set this day/time) — starting now:\n\n" + a.task
        + (others.length ? "\n\nYou're doing this together with " + others.join(" and ") + ". If part of it is theirs, send them ((ASK: " + others[0] + " | ...)) with exactly what you need; don't wait for Tania to relay it." : "");
      try {
        await addMessages(agentKey, [{ role: "user", kind: "scheduled", text }]);
        await startJobs(["reply_" + agentKey]);
      } catch (e) {
        try { await addMessages(agentKey, [{ role: "agent", kind: "error", text: "⚠️ A scheduled task for " + new Date(a.runAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) + " PT couldn't start itself (" + String(e.message || e).slice(0, 160) + "). It's sitting above — just send me anything to wake me up on it." }]); } catch {}
      }
    }
  }
  await st.setJSON("team-assignments", list.slice(-200));
  return new Response("dispatched " + due.length + "; scripts cleared: " + scriptSweep.cleared);
};
// Tania, Nov 16: not all night -- every 30 minutes, 5am to 8:30pm Pacific. Assignments/script expiries due overnight start at 5am.
export const config = { schedule: "*/30 13-23,0-4 * * *" };
