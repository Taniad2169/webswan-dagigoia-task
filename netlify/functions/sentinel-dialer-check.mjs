// Tania, Nov 19: Sentinel's nightly job -- confirm the auto-dialer is actually ready to kick off tomorrow
// morning, and say so plainly in his own chat so Tania can see a clear green check (or exactly what's broken)
// before she goes to bed, without opening Voice Studio herself. READ-ONLY: this never changes a setting, pauses
// or unpauses anything, or touches a lead -- it only looks and reports, consistent with Sentinel's boundaries.
import { getStore } from "@netlify/blobs";
import { addMessages } from "../lib/team.mjs";
import { budgetGate } from "../lib/budget.mjs";
import { DIALER_PLAN } from "../lib/dialer-plan.mjs";
import { ptHour } from "../lib/team-jobs.mjs";

const liveOn = () => String(process.env.VOICE_CALLING_ENABLED || "").toLowerCase() === "on";
const agentId = (name, extra) => process.env["CARTESIA_AGENT_" + String(name || "").toUpperCase()] || (extra || {})[String(name || "").toLowerCase()] || "";

export default async () => {
  if (ptHour() !== 21) return new Response("not 9pm Pacific");
  const store = getStore({ name: "voice-studio", consistency: "strong" });
  const todayPT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const guardKey = "sentinel-dialer-check-" + todayPT;
  if (await store.get(guardKey)) return new Response("already ran today");
  await store.set(guardKey, "1");

  const issues = [], ok = [];

  if (!liveOn()) issues.push("Live calling is OFF (VOICE_CALLING_ENABLED is not \"on\") -- the dialer will not call anyone tomorrow.");
  else ok.push("Live calling is ON.");

  if (!process.env.CARTESIA_API_KEY) issues.push("No Cartesia API key is set.");
  const numIds = String(process.env.CARTESIA_FROM_NUMBER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!numIds.length) issues.push("No caller-ID numbers are set (CARTESIA_FROM_NUMBER_IDS).");
  else ok.push(numIds.length + " caller-ID number(s) configured.");

  const q = (await store.get("queue", { type: "json" })) || {};
  if (q.paused) issues.push("The dialer queue is PAUSED" + (q.pauseReason ? " (reason: " + q.pauseReason + ")" : "") + " -- it will not place any calls until unpaused.");
  else ok.push("The dialer queue is not paused.");

  const queued = (q.leads || []).filter((l) => l.status === "queued");
  if (!queued.length) issues.push("There are no queued leads at all right now -- nothing to call tomorrow.");
  else {
    const byAgent = {};
    queued.forEach((l) => { const a = String(l.agent || "other").toLowerCase(); byAgent[a] = (byAgent[a] || 0) + 1; });
    ok.push(queued.length + " lead(s) queued (" + Object.entries(byAgent).map(([a, n]) => a + ": " + n).join(", ") + ").");
  }

  let gate = null; try { gate = await budgetGate(store, 1, 6); } catch (e) {}
  if (gate && !gate.ok) issues.push("The monthly call budget is already exhausted -- the dialer will pause itself on its first attempt tomorrow.");
  else if (gate) ok.push("Monthly call budget has room (about " + gate.allowance + " more 6-minute calls).");

  // Tomorrow, Eastern Time (the dialer's own hard cutoff day check uses America/New_York).
  const tmrw = new Date(Date.now() + 24 * 3600e3);
  const tmrwDayName = tmrw.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long" });
  const tmrwDay3 = tmrwDayName.slice(0, 3).toLowerCase();
  if (tmrwDay3 === "fri" || tmrwDay3 === "sat" || tmrwDay3 === "sun") {
    ok.push("Tomorrow is " + tmrwDayName + " -- no outbound campaign calls by design (Monday-Thursday only).");
  } else {
    const s = q.settings || {};
    if (!(s.days || []).includes(tmrwDay3)) issues.push("Tomorrow (" + tmrwDayName + ") is not checked in Voice Studio's Auto-dialer Days -- it won't dial even though it's a weekday.");
    else ok.push("Tomorrow (" + tmrwDayName + ") is a checked dialing day.");
  }

  // Is the temporary dialer plan (this week: only Jenna + George) still active tomorrow?
  const tmrwPlanYmd = tmrw.toLocaleDateString("en-CA", { timeZone: DIALER_PLAN.tz });
  const planActiveTomorrow = tmrwPlanYmd >= DIALER_PLAN.start && tmrwPlanYmd <= DIALER_PLAN.end;
  const activeAgents = planActiveTomorrow ? Object.keys(DIALER_PLAN.agents) : ["monica", "george", "rebecca"];
  if (planActiveTomorrow) ok.push("The temporary dialer plan (" + activeAgents.join(" + ") + " only) is active through " + DIALER_PLAN.end + ".");

  const extraIds = (await store.get("agent-ids", { type: "json" }).catch(() => null)) || {};
  const missingAgents = activeAgents.filter((a) => !agentId(a, extraIds));
  if (missingAgents.length) issues.push("No Cartesia agent ID is set for: " + missingAgents.join(", ") + " -- they can't be dialed even if leads are queued for them.");
  else ok.push("Cartesia agent IDs are set for everyone dialing tomorrow (" + activeAgents.join(", ") + ").");

  let needsInfoCount = 0;
  try { needsInfoCount = ((await store.get("needs-info", { type: "json" })) || []).length; } catch (e) {}
  if (needsInfoCount) ok.push(needsInfoCount + " lead(s) sitting in the Needs Info queue (missing a real name) -- not blocking tomorrow, but worth Sebastien clearing them.");

  const headline = issues.length ? ("🔴 " + issues.length + " thing" + (issues.length > 1 ? "s" : "") + " will stop the dialer tomorrow morning:") : "🟢 Dialer is ready to kick off tomorrow morning.";
  const body = [headline, issues.length ? issues.map((x) => "- " + x).join("\n") : "", "", "Checked just now:", ok.map((x) => "- " + x).join("\n")].filter(Boolean).join("\n");
  try { await addMessages("sentinel", [{ role: "agent", kind: issues.length ? "error" : "success", text: "## 🌙 Nightly dialer check\n" + body }]); } catch (e) {}
  return new Response(issues.length ? "issues: " + issues.length : "ready");
};
export const config = { schedule: "5 4,5 * * *" };
