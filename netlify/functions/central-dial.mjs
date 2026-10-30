// Every 10 minutes: Jennifer Reid calls queued $149 requests once it's 9 AM to 7 PM (Mon–Sat) in the person's time zone.
import { store, openNow, placeCentralCall, liveOn } from "../lib/central.mjs";
export const config = { schedule: "*/10 * * * *" };
export default async () => {
  if (!liveOn()) return new Response("off");
  const s = store();
  const list = (await s.get("central", { type: "json" })) || [];
  let placed = 0, changed = false;
  for (const r of list) {
    if (placed >= 3) break;
    if (r.kind !== "call" || r.status !== "queued" || !openNow(r.state)) continue;
    if (Date.now() - r.at > 3 * 864e5) { r.status = "expired"; changed = true; continue; }
    const x = await placeCentralCall(s, r); changed = true;
    if (x.ok) { r.status = "called"; r.callId = x.callId; r.calledAt = Date.now(); r.note = ""; placed++; }
    else { r.note = x.why; if (x.final) r.status = "skipped"; break; }
  }
  if (changed) await s.setJSON("central", list);
  return new Response("placed " + placed);
};
