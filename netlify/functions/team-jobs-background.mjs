// Background worker (up to 15 minutes) for the AI Office's long jobs: briefings, content and blogs.
import { teamStore } from "../lib/team.mjs";
import { JOBS } from "../lib/team-jobs.mjs";
import { addMessages } from "../lib/team.mjs";

export default async (req) => {
  const key = await teamStore().get("job-key");
  if (!key || req.headers.get("x-job-key") !== key) return new Response("no", { status: 403 });
  let b = {}; try { b = await req.json(); } catch {}
  for (const name of (Array.isArray(b.jobs) ? b.jobs : []).filter((j) => JOBS[j])) {
    try { await JOBS[name](); }
    catch (e) { await addMessages(name.startsWith("tatiana") ? "tatiana" : "eva", [{ role: "agent", kind: "error", text: `⚠️ I couldn't finish **${name.replace("_", " ")}**: ${String(e.message || e).slice(0, 300)}` }]); }
  }
  return new Response("ok");
};
