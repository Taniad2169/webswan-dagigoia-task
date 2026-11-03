// Rachel after-call emails: every 5 minutes, finds Rachel's finished calls (callers and transfers from
// Rebecca, Monica, George and Alek) and emails Tania the summary, so no message or appointment request is lost.
// Sends through the same Google Apps Script bridge as the calendar (action "mail"), to RACHEL_NOTIFY_EMAIL
// (default thewebswann@gmail.com).
import { getStore } from "@netlify/blobs";
import { sanitizeCal, callScript } from "../lib/cal.mjs";

export const config = { schedule: "*/5 * * * *" };
const API = "https://api.cartesia.ai";
const V_READ = process.env.CARTESIA_READ_VERSION || "2026-08-14";
const h = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pretty = (p) => { const d = String(p || "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || "unknown"); };

export default async () => {
  if (!process.env.CARTESIA_API_KEY) return new Response("no key");
  const s = getStore({ name: "voice-studio", consistency: "strong" });
  const ids = (await s.get("agent-ids", { type: "json" }).catch(() => null)) || {};
  const agent = process.env.CARTESIA_AGENT_RACHEL || ids.rachel || "";
  if (!agent) return new Response("no rachel");
  const cal = sanitizeCal(await s.get("calendar", { type: "json" })), secret = await s.get("cal-secret");
  if (!cal.scriptUrl || !secret) return new Response("email bridge not connected");
  const to = String(process.env.RACHEL_NOTIFY_EMAIL || "thewebswann@gmail.com").trim();

  const done = new Set((await s.get("rachel-done", { type: "json" })) || []);
  const since = new Date(Date.now() - 6 * 3600e3).toISOString();
  const q = new URLSearchParams({ agent_id: agent, limit: "50", expand: "transcript", start_time_gte: since });
  const r = await fetch(API + "/agents/calls?" + q, { headers: { "Authorization": "Bearer " + process.env.CARTESIA_API_KEY, "X-API-Key": process.env.CARTESIA_API_KEY, "Cartesia-Version": V_READ } });
  if (!r.ok) return new Response("cartesia " + r.status);
  const calls = ((await r.json()).data || []);
  let sent = 0;
  for (const c of calls) {
    const id = c.id || c.agent_call_id; if (!id || done.has(id)) continue;
    if (!c.end_time && !/ended|completed|failed/i.test(String(c.status || ""))) continue; // still in progress
    done.add(id);
    const t = c.telephony_params || {};
    const said = (Array.isArray(c.transcript) ? c.transcript : []).filter((x) => x.role === "user" && x.text).map((x) => x.text).join(" ");
    if (!said.trim()) continue; // nobody spoke
    const start = c.start_time ? new Date(c.start_time) : new Date(), end = c.end_time ? new Date(c.end_time) : start;
    const mins = Math.max(1, Math.ceil((end - start) / 60000));
    const when = start.toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) + " PT";
    const summary = String(c.summary || "").trim() || "No summary was generated for this call.";
    const lines = (Array.isArray(c.transcript) ? c.transcript : []).filter((x) => x.text && x.role !== "system").map((x) => (x.role === "user" ? "Caller: " : "Rachel: ") + x.text).join("\n").slice(0, 6000);
    const html = `<div style="font-family:Arial,sans-serif;color:#17324c;max-width:600px">
  <h2 style="color:#1182f0;margin:0 0 6px">📞 Rachel took a call</h2>
  <table style="border-collapse:collapse;font-size:15px">
    <tr><td style="padding:4px 14px 4px 0;color:#5f7891">Caller</td><td><b>${h(pretty(t.from))}</b></td></tr>
    <tr><td style="padding:4px 14px 4px 0;color:#5f7891">When</td><td><b>${h(when)}</b></td></tr>
    <tr><td style="padding:4px 14px 4px 0;color:#5f7891">Length</td><td><b>${mins} min</b></td></tr></table>
  <h3 style="color:#1182f0;margin:16px 0 6px;font-size:16px">Summary</h3>
  <p style="background:#f4fafd;border:1px solid #6ca1d4;border-radius:10px;padding:12px;white-space:pre-wrap">${h(summary)}</p>
  <details><summary style="cursor:pointer;color:#5f7891">Full conversation</summary><pre style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:13px">${h(lines)}</pre></details>
  <p style="font-size:13px;color:#5f7891">Sent automatically by WebSwan Voice Studio.</p></div>`;
    try {
      const m = await callScript(cal, secret, { action: "mail", to, subject: `Rachel: call from ${pretty(t.from)} · ${when}`, html, fromName: "Rachel · WebSwan Receptionist" });
      if (m && m.ok) sent++;
    } catch (e) { /* try again next run is not needed: the summary stays in Voice Studio's call records */ }
  }
  await s.setJSON("rachel-done", [...done].slice(-3000));
  return new Response("sent " + sent);
};
