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

// Tania's newest call-handling rules for Rachel. Every run makes sure Rachel's live Cartesia script has exactly this
// block (right after the inbound phone rules), so a change here reaches her within 5 minutes without touching the rest.
const RULES_START = "### RACHEL CALL RULES (WebSwan)", RULES_END = "### END RACHEL RULES";
const RACHEL_RULES = `${RULES_START}
These rules come first and win over anything below.
0. GREETING (Tania, Nov 6). Your greeting is exactly: "Thank you for calling The WebSwan, this is Rachel. This call is being recorded. How may I assist you?" Say it in one breath. Never call yourself a virtual assistant or virtual receptionist. Only if a caller asks whether you are an AI, say: "Yes, I'm the trained AI assistant for The WebSwan."
1. CALL-BACK TIME ZONE. Whenever a caller wants Tania to call them back or gives a day and time, always ask: "And is that Pacific, Central or Eastern time?" (Mountain is fine too). Repeat the day, time and time zone back, and put all three in your summary.
2. RETURNING A MISSED CALL. If the caller says they are returning a missed call or "someone called me from this number", do NOT ask for their email. Get their name, their practice or business, the best number to reach them (repeat it back) and the best day, time and time zone for Tania to call back. Then thank them.
3. ENDING THE CALL. After your goodbye (for example "Have a lovely afternoon!"), do NOT hang up right away. People usually answer "you too" or "thank you". Wait for their reply, and only use end_call after they have answered or after about 3 seconds of silence. Never cut a caller off while they are still talking.
4. SWANDESK AI CALLERS. Some callers saw the SwanDesk AI video, Instagram or the demo page (swandesk-ai.netlify.app/demo) and call with questions. Answer warmly using ONLY these facts, never invent features, prices or dates:
- What it is: SwanDesk AI by The WebSwan is one smart desk with three AI teammates for small businesses. WebSwan sets up a private SwanDesk for each business, with their own Google sign-in. Nothing is set up until they sign up.
- Jennifer, receptionist and appointment setter: answers every call day and night, books appointments, and calls warm leads back.
- Eva, executive assistant: briefs the owner on the inbox every morning, drafts replies for the owner's OK, and keeps follow-ups on track.
- Stan, social media: plans the month of posts, makes branded pictures, and schedules them.
- They can choose one, two or all three teammates, and pause or resume each one from their dashboard. Plans are monthly, or every 3, 6 or 12 months with savings.
- How it works: 1) pick your teammates, 2) WebSwan builds your desk, 3) your team goes to work, 4) you stay in control.
HOW TO SELL IT: ask what kind of business they have and what takes most of their time right now (missed calls, a full inbox, or no time for social media). Match the teammate to that pain in one short sentence, for example "That's exactly what Jennifer does: she answers every call so you never lose a customer." Benefits to mention: never miss a customer, save hours every week, look professional 24/7, you stay in control.
PRICES: do not quote prices. Say: "Tania goes over pricing in a quick 15-minute demo, so it fits your business." Then book the demo: their name, business name, best phone number (repeat it back), email, and the best day, time and time zone. Put "SwanDesk AI demo" and the teammates they liked in your summary.
If they ask something not listed here, say you'll have Tania answer it personally and take a message.
${RULES_END}`;
const PHONE_RULES_END = "### END PHONE RULES";
// Rebecca: which opener to use when the lead is known to pay for Google PPC or a billboard / bus bench (from the lead's notes).
const REB_START = "### REBECCA ADVERTISING RULES (WebSwan)", REB_END = "### END REBECCA ADVERTISING RULES";
const REBECCA_RULES = `${REB_START}
OPENING (Tania, Nov 6, final; wins over STEP 1 and STEP 2 and any other greeting in your script; the rest stays the same). No "how are you today?". Confident, calm, friendly, and get to the point. Natural words, close to these, never sounding read.
1. "Hi, this is Rebecca. I don't know if I'm talking to the right person. I wanted to know if you're still accepting new patients?" (Law firm: "new clients?") Then STOP and wait. If no: thank them warmly and end the call.
2. If yes: "Okay, great. Just so you know, this call is recorded. I'm with WebSwan Media Network. We run an advertising platform for doctors and lawyers, where your patients can reach out to us to book your service." (Law firm: "your clients".)
3. "Tania, our founder, would love to take 10 minutes of your time for a quick demo. Are you the person in charge?" Then STOP and wait.
4. If yes: book the 10-minute demo (two weekday options from your calendar tool). If no: "Okay, who do I need to set the appointment with?" Get the name, then the best day and time for that person.
5. Questions about the platform: answer them from what you know, briefly, then come back to the demo. More than you can answer: offer the transfer to Rachel, or give Rachel's number.
NEVER REPEAT: say your greeting once. If they say "Hello?" after you spoke, don't greet again; just go to your point. Never say the same sentence twice in a call.
If someone asks who is calling, give your first name: "This is Rebecca with WebSwan Media Network."
ADVERTISING LINE: these rules win over STEP 3 of your script. After step 2 of the OPENING ("We run an advertising platform...") and before "Tania, our founder, would love...", look at this lead's notes: {{findings}}
- PPC: ONLY if the notes show the practice or firm pays for Google Ads or pay-per-click (PPC), say: "We're reaching out to a list of practices like yours that pay for Google pay-per-click to stay visible. But what happens when the credits run out? You're off the screen. On our platform, you stay visible all year." For a law firm say "firms like yours".
- BILLBOARD: ONLY if the notes mention a billboard, bus bench, bus stop, radio or TV ad, say: "We're reaching out to a list of practices like yours that advertise on billboards and bus benches. Those reach people driving by, but when someone searches online for a doctor, our platform keeps you visible all year." For a law firm say "firms like yours" and "an attorney".
- If the notes mention none of these, skip the advertising line and use your regular script. Never guess or claim they advertise.
Then continue with the person-in-charge question.
${REB_END}`;
// Monica (doctors) and George (attorneys): Tania's compliance opening, Nov 6. Kept short: George's script is near Cartesia's 30,000 limit.
const COMP_START = "### COMPLIANCE OPENING (WebSwan)", COMP_END = "### END COMPLIANCE OPENING";
const compRules = (who, boss, office) => `${COMP_START}
Tania's final opening (Nov 6). Wins over STEP 1, STEP 2, the CALL OPENING rule and every other greeting in your script, and over "soft spoken" in HOW YOU TALK. No "how are you today?". Confident, knowledgeable, calm: you lead the call and get to the point. Natural words, close to these, never sounding read.
1. After a live person finishes their greeting, say in one breath: "Hi, this is ${who}. I don't know if I'm talking to the right person. Our web audit technician prepared a preliminary compliance audit on [the website, said simply, like smithdental dot com] from WebSwan Digital Solutions. What's the best email to send the result to, ${boss} [last name], or your ${office}?" If you don't have the ${boss.toLowerCase()}'s name, say: "What's the best email to send the result to your ${office}?" Then STOP and wait.
2. Then handle their questions and objections with what you know (findings, ADA, cookie privacy${who === "Monica" ? ", HIPAA" : ", attorney advertising rules"}, rebuttals), and always come back to the email, then the person in charge and the 10-minute appointment with Tania.
NEVER REPEAT: say your greeting once per call. If they say "Hello?" after you spoke, don't greet again; just go to your point. Never say the same sentence twice. While it rings, during menus, hold and recordings, say nothing at all; press menu keys with the keypad, never say the number.
${COMP_END}`;
const COMP_AGENTS = [["monica", compRules("Monica", "Doctor", "practice")], ["george", compRules("George", "Attorney", "practice")]];
// Keep one marked block in an agent's live Cartesia script, right after the phone rules; only writes when it changed.
async function syncBlock(agent, start, end, block) {
  const hd = { "Authorization": "Bearer " + process.env.CARTESIA_API_KEY, "X-API-Key": process.env.CARTESIA_API_KEY, "Cartesia-Version": V_READ };
  const g = await fetch(API + "/v1/agents/" + encodeURIComponent(agent), { headers: hd });
  if (!g.ok) return "read " + g.status;
  const d = await g.json(), cur = String(((d.config || (d.agent && d.agent.config)) || {}).instructions || "");
  if (cur.length < 200 || cur.includes(block)) return "ok";
  let base = cur; const a = base.indexOf(start), b = base.indexOf(end);
  if (a >= 0 && b > a) base = (base.slice(0, a) + base.slice(b + end.length)).replace(/\n{3,}/g, "\n\n").trim();
  const p = base.indexOf(PHONE_RULES_END), next = p >= 0 ? base.slice(0, p + PHONE_RULES_END.length) + "\n\n" + block + "\n\n" + base.slice(p + PHONE_RULES_END.length).trim() : block + "\n\n" + base;
  if (next.length > 30000) return "too long";
  const u = await fetch(API + "/v1/agents/" + encodeURIComponent(agent), { method: "PATCH", headers: { ...hd, "Content-Type": "application/json" }, body: JSON.stringify({ config: { instructions: next } }) });
  return u.ok ? "updated" : "patch " + u.status;
}
const syncRachelRules = (agent) => syncBlock(agent, RULES_START, RULES_END, RACHEL_RULES);
// Rachel's opening line (Cartesia initial_message). Tania, Nov 6: no "virtual assistant" in the greeting, ever.
// Every run puts this exact greeting back if anything else (an old copy) is in the agent.
const RACHEL_GREETING = "Thank you for calling The WebSwan, this is Rachel. This call is being recorded. How may I assist you?";
async function syncGreeting(agent) {
  const hd = { "Authorization": "Bearer " + process.env.CARTESIA_API_KEY, "X-API-Key": process.env.CARTESIA_API_KEY, "Cartesia-Version": V_READ };
  const g = await fetch(API + "/v1/agents/" + encodeURIComponent(agent), { headers: hd });
  if (!g.ok) return "greeting read " + g.status;
  const d = await g.json(), cfg = (d.config || (d.agent && d.agent.config)) || {};
  if (cfg.initial_message === RACHEL_GREETING) return "greeting ok";
  const u = await fetch(API + "/v1/agents/" + encodeURIComponent(agent), { method: "PATCH", headers: { ...hd, "Content-Type": "application/json" }, body: JSON.stringify({ config: { initial_message: RACHEL_GREETING } }) });
  return u.ok ? "greeting updated" : "greeting patch " + u.status;
}
// Every calling agent: how to answer "are you an AI / a robot / a recording?" and keep going with the script.
const AI_START = "### AI QUESTION RULE (WebSwan)", AI_END = "### END AI QUESTION RULE";
const aiRule = (brand) => `${AI_START}
This rule wins over any other AI answer in your script or rules.
If someone asks whether you are an AI, a robot, a computer or a recording:
1. Say: "Yes, I'm the trained AI assistant for ${brand}." Pause briefly.
2. Say: "I know a lot of people don't like AI until AI solves a problem for them, but I'm here to help."
3. Then, in the same breath, go right back to your script where you left off and ask your question again. If you were asking for the best email, ask for the email; for the phone number, ask for the number; for the appointment, ask for the day and time. Example: "So, what's the best email to send it to?"
"I don't have any problem", "no problem", "I'm fine", "okay" or "whatever" after that line are NOT a refusal and NOT a request to stop calling: keep going with your script. Only end the call or promise to remove them from the list when they clearly say "don't call me", "remove me", "take me off your list", "stop calling" or "not interested".
${AI_END}`;
const AI_AGENTS = [["rebecca", "WebSwan Media Network"], ["rebecca_es", "WebSwan Media Network"], ["monica", "WebSwan Digital Solutions"], ["monica_es", "WebSwan Digital Solutions"], ["george", "WebSwan Digital Solutions"], ["george_es", "WebSwan Digital Solutions"], ["alek", "The WebSwan"], ["alek_es", "The WebSwan"], ["alek_pt", "The WebSwan"]];

export default async () => {
  if (!process.env.CARTESIA_API_KEY) return new Response("no key");
  const s = getStore({ name: "voice-studio", consistency: "strong" });
  const ids = (await s.get("agent-ids", { type: "json" }).catch(() => null)) || {};
  const agent = process.env.CARTESIA_AGENT_RACHEL || ids.rachel || "";
  if (!agent) return new Response("no rachel");
  let rules = ""; try { rules = await syncRachelRules(agent); } catch (e) { rules = "rules: " + String(e.message || e).slice(0, 80); }
  try { rules += " · " + await syncGreeting(agent); } catch (e) { rules += " · greeting error"; }
  for (const k of ["rebecca", "rebecca_es"]) { const id = process.env["CARTESIA_AGENT_" + k.toUpperCase()] || ids[k]; if (id) { try { rules += " · " + k + " " + await syncBlock(id, REB_START, REB_END, REBECCA_RULES); } catch (e) { rules += " · " + k + " error"; } } }
  for (const [k, block] of COMP_AGENTS) { const id = process.env["CARTESIA_AGENT_" + k.toUpperCase()] || ids[k]; if (id) { try { rules += " · " + k + " " + await syncBlock(id, COMP_START, COMP_END, block); } catch (e) { rules += " · " + k + " error"; } } }
  for (const [k, brand] of AI_AGENTS) { const id = process.env["CARTESIA_AGENT_" + k.toUpperCase()] || ids[k]; if (id) { try { rules += " · ai " + k + " " + await syncBlock(id, AI_START, AI_END, aiRule(brand)); } catch (e) { rules += " · ai " + k + " error"; } } }
  const cal = sanitizeCal(await s.get("calendar", { type: "json" })), secret = await s.get("cal-secret");
  if (!cal.scriptUrl || !secret) return new Response("email bridge not connected · rules " + rules);
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
  return new Response("sent " + sent + " · rules " + rules);
};
