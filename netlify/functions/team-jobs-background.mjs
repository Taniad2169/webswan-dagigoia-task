// Background worker (up to 15 minutes) for the AI Office's long jobs: briefings, content and blogs.
import { teamStore } from "../lib/team.mjs";
import { JOBS } from "../lib/team-jobs.mjs";
import { addMessages } from "../lib/team.mjs";

export default async (req) => {
  const key = await teamStore().get("job-key");
  if (!key || req.headers.get("x-job-key") !== key) return new Response("no", { status: 403 });
  let b = {}; try { b = await req.json(); } catch {}
  // A job can carry one argument after a colon, e.g. "c360_push:2026-12".
  for (const job of (Array.isArray(b.jobs) ? b.jobs : []).filter((j) => JOBS[String(j).split(":")[0]])) {
    const [name, ...rest] = String(job).split(":"); const arg = rest.join(":");
    try { await JOBS[name](name === "relay" ? (/^[a-z]{2,12}\|[a-z]{0,12}\|\d$/.test(arg || "") ? arg : undefined) : /^\d{4}-\d{2}(\|[\w-]{1,60})?$/.test(arg || "") ? arg : undefined); }
    catch (e) { await addMessages(/^jimmy/.test(name) ? "jimmy" : /^(tatiana|c360|posts)/.test(name) ? "tatiana" : "eva", [{ role: "agent", kind: "error", text: `⚠️ I couldn't finish **${name.replace("_", " ")}**: ${String(e.message || e).slice(0, 300)}` }]); }
  }
  return new Response("ok");
};
