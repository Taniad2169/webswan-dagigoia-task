// Jennifer Kennedy after-call emails: every 5 minutes, finds Jennifer's finished calls,
// matches each one to the client whose line was dialed, emails that client's own notification
// email (never Tania's), and logs the minutes for that client's monthly allowance.
import { getStore } from "@netlify/blobs";
import { sanitizeCal, callScript } from "../lib/cal.mjs";

export const config = { schedule: "*/5 * * * *" };
const API = "https://api.cartesia.ai";
const V_READ = process.env.CARTESIA_READ_VERSION || "2026-08-14";
const h = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const e164 = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 10) d = "1" + d; return /^1\d{10}$/.test(d) ? "+" + d : ""; };
const pretty = (p) => { const d = String(p || "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || "unknown"); };
const month = (t) => new Date(t).toISOString().slice(0, 7);

export default async () => {
  if (!process.env.CARTESIA_API_KEY) return new Response("no key");
  const s = getStore({ name: "voice-studio", consistency: "strong" });
  const ids = (await s.get("agent-ids", { type: "json" }).catch(() => null)) || {};
  const agent = process.env.CARTESIA_AGENT_JENNIFER || ids.jennifer || "";
  if (!agent) return new Response("no jennifer");
  const clients = ((await s.get("clients", { type: "json" })) || []).filter((c) => c.jennLine && c.active !== false);
  if (!clients.length) return new Response("no active clients");
  const cal = sanitizeCal(await s.get("calendar", { type: "json" })), secret = await s.get("cal-secret");
  if (!cal.scriptUrl || !secret) return new Response("email bridge not connected");

  const done = new Set((await s.get("jk-done", { type: "json" })) || []);
  const since = new Date(Date.now() - 6 * 3600e3).toISOString();
  const q = new URLSearchParams({ agent_id: agent, limit: "50", expand: "transcript", start_time_gte: since });
  const r = await fetch(API + "/agents/calls?" + q, { headers: { "Authorization": "Bearer " + process.env.CARTESIA_API_KEY, "X-API-Key": process.env.CARTESIA_API_KEY, "Cartesia-Version": V_READ } });
  if (!r.ok) return new Response("cartesia " + r.status);
  const calls = ((await r.json()).data || []);
  const usage = (await s.get("jk-usage", { type: "json" })) || {};
  const log = (await s.get("jk-log", { type: "json" })) || [];
  let sent = 0;

  for (const c of calls) {
    const id = c.id || c.agent_call_id; if (!id || done.has(id)) continue;
    if (!c.end_time && !/ended|completed|failed|no.?answer|busy/i.test(String(c.status || ""))) continue; // still in progress
    const t = c.telephony_params || {};
    const dialed = e164(t.to), caller = t.from || "";
    const client = clients.find((x) => x.jennLine === dialed);
    done.add(id);
    if (!client) continue; // not a receptionist client's line (e.g. an outbound call)
    const start = c.start_time ? new Date(c.start_time) : new Date(), end = c.end_time ? new Date(c.end_time) : start;
    const mins = Math.max(1, Math.ceil((end - start) / 60000));
    const mk = client.id + ":" + month(start);
    usage[mk] = (usage[mk] || 0) + mins;
    const included = parseInt(client.minutesIncluded, 10) || 0, used = usage[mk];
    const summary = String(c.summary || "").trim() || "No summary was generated for this call.";
    const when = start.toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) + " PT";
    const row = (k, v) => v ? `<tr><td style="padding:4px 14px 4px 0;color:#5f7891;vertical-align:top">${k}</td><td style="padding:4px 0"><b>${h(v)}</b></td></tr>` : "";
    const html = `<div style="font-family:Arial,sans-serif;color:#17324c;max-width:580px">
  <h2 style="color:#082a48;margin:0 0 6px">📞 New call answered by Jennifer</h2>
  <p>Hello ${h(client.practiceName)},</p>
  <p>Jennifer, your virtual receptionist, just handled a call on your line. Here are the details:</p>
  <table style="border-collapse:collapse;font-size:15px">${row("Caller", pretty(caller))}${row("When", when)}${row("Length", mins + " min")}</table>
  <h3 style="color:#082a48;margin:16px 0 6px;font-size:16px">What the caller needed</h3>
  <p style="background:#f4fafd;border:1px solid #dce8f1;border-radius:10px;padding:12px;white-space:pre-wrap">${h(summary)}</p>
  <p style="font-size:13px;color:#5f7891">Please follow up with the caller directly. Jennifer does not give medical or legal advice and does not collect sensitive details by phone.${included ? ` Minutes used this month: ${used} of ${included}.` : ""}</p>
  <p style="font-size:13px;color:#5f7891">Virtual receptionist by WebSwan · reply to this email with any questions.</p></div>`;
    try {
      const m = await callScript(cal, secret, { action: "mail", to: client.notifyEmail, subject: `New call for ${client.practiceName} · ${pretty(caller)} · ${when}`, html, fromName: "Jennifer · Virtual Receptionist" });
      log.unshift({ at: Date.now(), callId: id, clientId: client.id, practice: client.practiceName, caller, mins, emailed: !!(m && m.ok), note: m && m.ok ? "" : String((m && m.error) || "mail failed").slice(0, 120) });
      if (m && m.ok) sent++;
    } catch (e) { log.unshift({ at: Date.now(), callId: id, clientId: client.id, practice: client.practiceName, caller, mins, emailed: false, note: String(e.message || e).slice(0, 120) }); }
  }
  await s.setJSON("jk-done", [...done].slice(-3000));
  await s.setJSON("jk-usage", usage);
  await s.setJSON("jk-log", log.slice(0, 1000));
  return new Response("sent " + sent);
};
