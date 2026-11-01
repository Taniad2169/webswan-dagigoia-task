// Every morning at 7am Pacific (runs at 14:05 and 15:05 UTC so daylight-saving changes never move it):
// start the day's AI Office jobs in the background worker, once per day.
import crypto from "node:crypto";
import { teamStore, addMessages } from "../lib/team.mjs";
import { dueJobs, ptHour } from "../lib/team-jobs.mjs";

export async function startJobs(jobs) {
  const s = teamStore();
  let key = await s.get("job-key");
  if (!key) { key = crypto.randomBytes(24).toString("base64url"); await s.set("job-key", key); }
  const base = process.env.URL || "https://webswan-billing.netlify.app";
  const r = await fetch(base + "/.netlify/functions/team-jobs-background", { method: "POST", headers: { "x-job-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ jobs }) });
  if (!r.ok && r.status !== 202) throw new Error("background worker answered " + r.status);
}

export default async () => {
  if (ptHour() !== 7) return new Response("not 7am Pacific");
  const s = teamStore(), today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  if ((await s.get("last-daily")) === today) return new Response("already ran");
  await s.set("last-daily", today);
  const jobs = dueJobs();
  try { await startJobs(jobs); }
  catch (e) { await addMessages("eva", [{ role: "agent", kind: "error", text: `⚠️ This morning's jobs (${jobs.join(", ")}) didn't start: ${String(e.message || e).slice(0, 200)}. Use the buttons above to run them now.` }]); }
  return new Response("ok");
};
export const config = { schedule: "5 14,15 * * *" };
