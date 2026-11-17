// Background watcher (Netlify background function, up to 15 min). Started by startWatch() right after a call is placed.
// Checks the call every 15 seconds; at 2 minutes, if no live human has greeted the agent, it hangs the call up.
import { humanAnswered, watchToken, NO_HUMAN_LIMIT_SECS } from "../lib/call-watch.mjs";

const API = "https://api.cartesia.ai";
const V_READ = process.env.CARTESIA_READ_VERSION || "2026-08-14";
const V_CANCEL = process.env.CARTESIA_VERSION || "2026-03-01";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hd = (v) => ({ "Authorization": "Bearer " + process.env.CARTESIA_API_KEY, "X-API-Key": process.env.CARTESIA_API_KEY, "Cartesia-Version": v });

export default async (req) => {
  let b = {}; try { b = await req.json(); } catch (e) { return; }
  const id = String(b.callId || "").replace(/[^\w-]/g, "").slice(0, 120);
  if (!id || !process.env.CARTESIA_API_KEY || b.token !== watchToken(id)) return;
  const placedAt = Number(b.placedAt) || Date.now();
  while (true) {
    const age = (Date.now() - placedAt) / 1000;
    let c = null;
    try { const r = await fetch(API + "/agents/calls/" + encodeURIComponent(id), { headers: hd(V_READ) }); if (r.ok) c = await r.json(); } catch (e) {}
    if (c) {
      if (c.end_time || /completed|failed/i.test(String(c.status || ""))) return;        // call already over
      if (humanAnswered(c.transcript)) return;                                            // a real person is on the line: leave it alone
    }
    if (age >= NO_HUMAN_LIMIT_SECS) {
      for (let i = 0; i < 3; i++) {                                                       // 502 means "retry"
        try { const r = await fetch(API + "/agents/calls/" + encodeURIComponent(id) + "/cancel", { method: "POST", headers: hd(V_CANCEL) });
          if (r.ok || r.status === 400 || r.status === 404) break; } catch (e) {}
        await sleep(3000);
      }
      console.log("voice-watch: hung up " + id + " (" + (b.agent || "agent") + "): no human greeted within " + NO_HUMAN_LIMIT_SECS + " s");
      return;
    }
    await sleep(Math.min(15000, Math.max(1000, (NO_HUMAN_LIMIT_SECS - age) * 1000)));
  }
};
