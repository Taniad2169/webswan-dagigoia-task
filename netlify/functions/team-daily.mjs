// Every morning around 7am Pacific: start the day's AI Office jobs in the background worker.
import crypto from "node:crypto";
import { teamStore } from "../lib/team.mjs";
import { dueJobs } from "../lib/team-jobs.mjs";

export async function startJobs(jobs) {
  const s = teamStore();
  let key = await s.get("job-key");
  if (!key) { key = crypto.randomBytes(24).toString("base64url"); await s.set("job-key", key); }
  const base = process.env.URL || "https://webswan-billing.netlify.app";
  await fetch(base + "/.netlify/functions/team-jobs-background", { method: "POST", headers: { "x-job-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ jobs }) });
}

export default async () => { await startJobs(dueJobs()); return new Response("ok"); };
export const config = { schedule: "5 14 * * *" };
