// Tania, Nov 14: "if I have a weekly assignment for them I need them to communicate automatically... if I have set
// a time for a task to be done between them I want to tell them day hour for them to start working right on time
// ... and that goes for all of them." Every 15 minutes, wake up any agent (or pair of agents) whose scheduled
// assignment has come due -- drops the task into each one's own chat as if Tania had just typed it, and triggers
// their reply job, with no one needing to be around. Agents schedule these themselves with ((SCHEDULE: ...)); see
// scheduleAssignment() and actionsHelp() in ../lib/agent-actions.mjs.
import { AGENTS, addMessages, teamStore } from "../lib/team.mjs";
import { startJobs } from "./team-daily.mjs";
import { sweepExpiredScripts } from "./voice-calls.mjs";

const first = (k) => String((AGENTS[k] || {}).name || k).split(" ")[0];

export default async () => {
  // Tania, Nov 15: clear any phone agent's campaign SCRIPT block whose 24h-1 week window is up (personality/
  // prompt/rebuttals untouched). Runs every 15 min alongside the assignment sweep below.
  let scriptSweep = { cleared: 0, checked: 0 };
  try { scriptSweep = await sweepExpiredScripts(); } catch (e) {}

  const st = teamStore();
  const list = (await st.get("team-assignments", { type: "json" })) || [];
  const now = Date.now();
  const due = list.filter((a) => a.status === "pending" && Date.parse(a.runAt) <= now);
  if (!due.length) return new Response("nothing due; scripts cleared: " + scriptSweep.cleared);
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
export const config = { schedule: "*/15 * * * *" };
