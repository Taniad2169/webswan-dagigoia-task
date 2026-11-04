// v2 (Nov 3): needs WORKPILOT_FIREBASE_KEY on webswan-billing.
// AI calls -> WorkPilot: every 15 minutes, every finished call by Rebecca, Monica, George, Alek (outbound)
// and Rachel (inbound) becomes a row in WorkPilot's "From AI Calls (Voice Studio)" list (blue), with the agent's
// name, the outcome (Hang up, Call back, Voicemail, Talked, Email captured, Appointment booked, Do not call),
// the summary and what the person said, so Tania can follow up herself.
// Netlify env (set by Tania): WORKPILOT_FIREBASE_KEY (same value as in webswan-lead-prospector).
import { getStore } from "@netlify/blobs";

export const config = { schedule: "*/15 12-23,0-2 * * 1-6" };
const API = "https://api.cartesia.ai";
const V_READ = process.env.CARTESIA_READ_VERSION || "2026-08-14";
const PROJECT = process.env.WORKPILOT_FIREBASE_PROJECT || "webswan-marketing";
const AGENTS = [["rebecca", "Rebecca"], ["monica", "Monica"], ["george", "George"], ["alek", "Alek"], ["rachel", "Rachel"], ["rachelout", "Rachel (follow-up)"]];
const digits = (p) => String(p || "").replace(/\D/g, "").slice(-10);
const pretty = (p) => { const d = digits(p); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || ""); };

async function idToken(key, s) {
  const saved = await s.get("workpilot-auth", { type: "json" }).catch(() => null);
  if (saved && saved.refreshToken) {
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(saved.refreshToken) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.id_token) return d.id_token;
  }
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.idToken) throw new Error("WorkPilot sign-in failed: " + ((d.error && d.error.message) || r.status));
  await s.setJSON("workpilot-auth", { refreshToken: d.refreshToken });
  return d.idToken;
}

function outcome(c, said, booked) {
  const secs = c.start_time && c.end_time ? (new Date(c.end_time) - new Date(c.start_time)) / 1000 : 0;
  const end = String(c.end_reason || c.status || "");
  const t = said.toLowerCase(), all = (said + " " + (c.summary || "")).toLowerCase();
  if (booked) return "Appointment booked";
  if (/don'?t call|do not call|remove (me|us|our)|take (me|us) off|stop calling/.test(t)) return "Do not call";
  if (/voicemail/.test(end)) return "Voicemail";
  if (/no_answer|busy|failed/.test(end) && !said) return "No answer";
  if (/call (me |us )?back|callback|call later|try (again|later)|not (in|available) (right now|today)|out of the office/.test(all)) return "Call back";
  if (/@| at gmail| dot com| dot net| dot org/.test(t)) return "Email captured";
  const turns = (c.transcript || []).filter((x) => x.role === "user" && x.text).length;
  if (secs < 30 || turns <= 2) return "Hang up";
  return "Talked";
}

export default async () => new Response(JSON.stringify(await runWorkpilotSync()));

// Also run on demand from Voice Studio ("Sync AI calls to WorkPilot now"), with the real error if it fails.
export async function runWorkpilotSync(hours) {
  const key = process.env.WORKPILOT_FIREBASE_KEY, ck = process.env.CARTESIA_API_KEY;
  const s0 = getStore({ name: "voice-studio", consistency: "strong" });
  if (!key || !ck) { const st = { at: new Date().toISOString(), ok: false, error: !key ? "WORKPILOT_FIREBASE_KEY is not set on webswan-billing in Netlify" : "CARTESIA_API_KEY is missing" }; await s0.setJSON("wp-sync-status", st); return st; }
  const s = getStore({ name: "voice-studio", consistency: "strong" });
  const ids = (await s.get("agent-ids", { type: "json" }).catch(() => null)) || {};
  const done = new Set((await s.get("wp-sync-done", { type: "json" }).catch(() => null)) || []);
  const q = (await s.get("queue", { type: "json" }).catch(() => null)) || { leads: [] };
  const byPhone = new Map(); for (const l of q.leads || []) if (l.phone) byPhone.set(digits(l.phone), l);
  const bookings = (await s.get("bookings", { type: "json" }).catch(() => null)) || [];
  const since = new Date(Date.now() - (hours || 24) * 3600e3).toISOString();
  let token = null, sent = 0, errors = 0, lastErr = "";
  for (const [a, label] of AGENTS) {
    const aid = process.env["CARTESIA_AGENT_" + a.toUpperCase()] || ids[a];
    if (!aid) continue;
    const qs = new URLSearchParams({ agent_id: aid, limit: "100", expand: "transcript", start_time_gte: since });
    const r = await fetch(API + "/agents/calls?" + qs, { headers: { "Authorization": "Bearer " + ck, "X-API-Key": ck, "Cartesia-Version": V_READ } });
    if (!r.ok) { lastErr = "Cartesia " + r.status + " for " + label; continue; }
    const calls = (await r.json()).data || [];
    for (const c of calls) {
      const id = c.id || c.agent_call_id;
      if (!id || done.has(id)) continue;
      if (!c.end_time && !/ended|completed|failed/i.test(String(c.status || ""))) continue; // still in progress
      const tp = c.telephony_params || {}, md = c.metadata || {};
      const inbound = a === "rachel";
      const other = inbound ? (tp.from || c.from) : (tp.to || c.to);
      const lead = byPhone.get(digits(other)) || {};
      const said = (c.transcript || []).filter((x) => x.role === "user" && x.text).map((x) => x.text).join(" ").trim();
      if (inbound && !said) { done.add(id); continue; } // empty inbound ring
      const booked = bookings.find((b) => b.callId === id);
      const out = outcome(c, said, booked);
      const start = c.start_time ? new Date(c.start_time) : new Date();
      const secs = c.start_time && c.end_time ? Math.round((new Date(c.end_time) - start) / 1000) : 0;
      const when = start.toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PT";
      const site = ((String(lead.findings || "").match(/Website:\s*([^\s;]+)/) || [])[1] || "").replace(/\.$/, "");
      const comment = [
        `${out} · ${label} · ${when} · ${secs}s`,
        booked ? `Booked: ${new Date(booked.start).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} PT${booked.email ? " · " + booked.email : ""}` : "",
        c.summary ? "Summary: " + String(c.summary).trim() : "",
        said ? "What they said: " + said.slice(0, 1800) : "",
        lead.findings ? "Findings: " + lead.findings : "",
        lead.campaign ? "Campaign: " + lead.campaign : "",
        `Call ID ${id} (recording in Voice Studio → Call records)`,
      ].filter(Boolean).join("\n");
      const data = {
        name: lead.name || md.lead || (inbound ? "Caller " + pretty(other) : pretty(other)),
        decisionMakerName: lead.name || md.lead || "",
        companyName: lead.business || md.business || "",
        phone: pretty(other),
        email: booked && booked.email ? booked.email : "",
        website: site,
        industry: inbound ? "Inbound call to Rachel" : (lead.campaign || md.campaign || ""),
        category: out,
        status: out,
        comment,
        telemarketerId: label,
        source: "voice-studio",
        timestamp: start.toISOString(),
      };
      const fields = {};
      for (const [k, v] of Object.entries(data)) if (v !== "" && v != null) fields[k] = { stringValue: String(v).slice(0, 3000) };
      try {
        if (!token) token = await idToken(key, s);
        const docId = "ai-" + String(id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
        const w = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/leads?documentId=${docId}`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ fields }) });
        if (w.ok || w.status === 409) { done.add(id); sent++; } else { errors++; lastErr = "WorkPilot database " + w.status + ": " + (await w.text().catch(() => "")).slice(0, 200); }
      } catch (e) { errors++; lastErr = String(e.message || e).slice(0, 200); }
    }
  }
  await s.setJSON("wp-sync-done", [...done].slice(-5000));
  const st = { at: new Date().toISOString(), ok: !errors, sent, errors, error: lastErr };
  await s.setJSON("wp-sync-status", st);
  return st;
}
