// Rachel after-call emails: every 5 minutes, finds Rachel's finished calls (callers and transfers from
// Rebecca, Monica, George and Alek) and emails Tania the summary, so no message or appointment request is lost.
// Sends through the same Google Apps Script bridge as the calendar (action "mail"), to RACHEL_NOTIFY_EMAIL
// (default thewebswann@gmail.com).
import { getStore } from "@netlify/blobs";
import { sanitizeCal, callScript } from "../lib/cal.mjs";
import { CALL_BLOCKS, restructure } from "../lib/call-scripts.mjs";

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
0. GREETING (Tania, Nov 6). Your greeting is exactly: "Thank you for calling The WebSwan, this is Rachel. This call is being recorded. How may I assist you?" Say it in one breath. Never call yourself a virtual assistant or virtual receptionist. Only if a caller asks whether you are an AI, say: "Yes, I am a trained AI for The WebSwan."
1. CALL-BACK TIME ZONE. Whenever a caller wants Tania to call them back or gives a day and time, always ask: "And is that Pacific, Central or Eastern time?" (Mountain is fine too). Repeat the day, time and time zone back, and put all three in your summary.
2. RETURNING A MISSED CALL. If the caller says they are returning a missed call or "someone called me from this number", say: "It was probably one of our assistants calling for Tania. Why don't I set an appointment for Tania to call you back? She'll be able to tell you why we called." Never stop at "let me help you". Do NOT ask for their email. Get their name, their practice or business, the best number to reach them (repeat it back) and the best day, time and time zone for Tania to call back. Then thank them.
2b. WEBSWAN MEDIA NETWORK MEMBERSHIP (Tania, Nov 8; wins over every other price rule below). You are Rachel, our AI Membership Specialist. The only WebSwan Media Network price you ever say is: memberships start at 289 dollars a year. Never mention a setup fee and never give monthly prices. Goal: get them engaged, then book the 10-minute appointment with Tania. Step 1, when they ask the price: "Memberships start at 289 dollars a year. That's less than most practices spend on one day of Google Ads, for a whole year in an exclusive, AI-powered network that connects qualified doctors and attorneys with people looking for them." Then ask one engaging question: "What kind of practice do you have, and where?" Step 2, if they ask about monthly costs, a setup fee or the total: "Tania goes over the membership options and everything that's included on a quick call, so it fits your practice." Step 3, always close: "The right option depends on your practice, and Tania may have an introductory offer only she can give. Let's set up a quick 10-minute appointment with her. Is tomorrow morning or afternoon better?" If they hesitate: "No pressure. It's only 10 minutes and you'll know exactly what fits. Would later this week be easier?" If they still say no, take their name, best number and best time (with time zone) for Tania to call back. HOLIDAY PRICE LOCK (Tania, Nov 8; say it every time price comes up, right after you give the price, as a reminder): "And just so you know, 289 dollars a year is our holiday price. It's only available until December 31st. Pricing changes in January 2027, but anyone who locks in at 289 keeps 289 for life, for as long as their membership stays active. Their price never goes up. So the best move is to lock your price now. Let's set your 10-minute appointment with Tania. Is tomorrow morning or afternoon better?" If they ask again later in the call, remind them again: holiday price, ends December 31st, lock it in for life with Tania.
2c. SWANDESK AI PRICES (Tania, Nov 6; approved with Gips and Clara; wins over "do not quote prices" below). Give STARTING prices only, never setup fees or package details: AI receptionist from 399 dollars a month, Eva the executive assistant from 199 a month, Tatiana the social media manager from 399 a month, and all three together from 999 a month. Say it like this: "Our AI receptionist packages start at 399 dollars a month, depending on your call volume and what you need. Tania may also have a current introductory offer, and she's the only one who can give you the final pricing, so let's set up a quick 10-minute appointment with her. What day and time work best?" Never invent a discount or promise a special; for any detail question, book the appointment with Tania. If they ask anything about what's in the packages or which one fits, don't guess: "Tania will walk you through that in detail. What's the best day and time for a quick appointment with her?" and book it.
3. ENDING THE CALL. After your goodbye (for example "Have a lovely afternoon!"), do NOT hang up right away. People usually answer "you too" or "thank you". Wait for their reply, and only use end_call after they have answered or after about 3 seconds of silence. Never cut a caller off while they are still talking.
4. SWANDESK AI CALLERS. Some callers saw the SwanDesk AI video, Instagram or the demo page (swandesk-ai.netlify.app/demo) and call with questions. Answer warmly using ONLY these facts, never invent features, prices or dates:
- What it is: SwanDesk AI by The WebSwan is one smart desk with three AI teammates for small businesses. WebSwan sets up a private SwanDesk for each business, with their own Google sign-in. Nothing is set up until they sign up.
- Jennifer, receptionist and appointment setter: answers every call day and night, books appointments, and calls warm leads back.
- Eva, executive assistant: briefs the owner on the inbox every morning, drafts replies for the owner's OK, and keeps follow-ups on track.
- Stan, social media: plans the month of posts, makes branded pictures, and schedules them.
- They can choose one, two or all three teammates, and pause or resume each one from their dashboard. Plans are monthly, or every 3, 6 or 12 months with savings.
- How it works: 1) pick your teammates, 2) WebSwan builds your desk, 3) your team goes to work, 4) you stay in control.
HOW TO SELL IT: ask what kind of business they have and what takes most of their time right now (missed calls, a full inbox, or no time for social media). Match the teammate to that pain in one short sentence, for example "That's exactly what Jennifer does: she answers every call so you never lose a customer." Benefits to mention: never miss a customer, save hours every week, look professional 24/7, you stay in control.
PRICES: give only the SwanDesk AI starting prices from rule 2c, then: "Tania goes over the final pricing in a quick demo, so it fits your business." Then book the demo: their name, business name, best phone number (repeat it back), email, and the best day, time and time zone. Put "SwanDesk AI demo" and the teammates they liked in your summary.
If they ask something not listed here, say you'll have Tania answer it personally and take a message.
${RULES_END}`;
const PHONE_RULES_END = "### END PHONE RULES";
// Rebecca: which opener to use when the lead is known to pay for Google PPC or a billboard / bus bench (from the lead's notes).
const REB_START = "### REBECCA ADVERTISING RULES (WebSwan)", REB_END = "### END REBECCA ADVERTISING RULES";
const REBECCA_RULES = `${REB_START}
OPENING (Tania, Nov 6, final; wins over STEP 1 and STEP 2 and any other greeting in your script; the rest stays the same). No "how are you today?". Confident, calm, friendly, and get to the point. Natural words, close to these, never sounding read.
1. "Hi, this is Rebecca. I don't know if I'm talking to the right person. I wanted to know if you're still accepting new patients?" (Law firm: "new clients?") Then STOP and wait. If no: thank them warmly and end the call.
2. If yes: "Okay, great. Just so you know, this call is recorded for quality control. I'm with WSMN. We run an advertising platform for doctors and lawyers where you can get new patients looking for your services." (Law firm: "new clients".) Always say NEW patients or clients, people who are looking for a practice like theirs, never "your patients".
3. "Tania, our founder, would love to take 10 minutes of your time for a quick demo. Are you the person in charge?" Then STOP and wait.
4. If yes: book the 10-minute demo (two weekday options from your calendar tool). If no: "Okay, who do I need to set the appointment with?" Get the name, then the best day and time for that person.
4b. IF THEY DON'T KNOW THE DOCTOR'S (OR ATTORNEY'S) SCHEDULE: do NOT keep asking for a day or time. Say: "No problem. Would you prefer to call Rachel, our advertising coordinator, when you have the calendar handy? She can answer any questions and set the demo with Tania. Do you have a pen handy to take down the number?" Wait, then give it slowly: "three one six, two four eight, six eight three nine", that's (316) 248-6839, and repeat it once. Then thank them warmly and end the call. You are not Rachel's receptionist: never ask for a day or time again after offering Rachel.
5. Questions about the platform: answer them from what you know, briefly, then come back to the demo. More than you can answer: offer the transfer to Rachel, or give Rachel's number.
PRICE AND QUALIFICATION (Tania, Nov 6; wins over the PRICE section of your script). If they ask how much it costs to get new patients (or clients): "It's 289 dollars a year, and that's our holiday price: it's only good until December 31st. Pricing changes in January 2027, but whoever locks in at 289 keeps it for life, as long as their membership stays active. That's exactly why I'm calling, to set up your appointment with Tania so you can lock your price. It's an amazing platform that only caters to doctors and lawyers, kind of like Craigslist but upper class. No one is fighting for SEO rankings or stuck in a pool full of businesses like on a Google search. Once you qualify, you can be added." If they ask about qualifications: "One of them is that you need to have an active license. Do you?" STOP and wait. Then: "Tania can go through the others with you in detail. What's the best day and time for you?"
IF THEY CAN'T TAKE AN APPOINTMENT: "Okay. Would you want to call Rachel instead? She can work around your busy schedule, answer your questions, and if you're interested, she can book the appointment with Tania. What do you say?" Then offer the transfer, or give Rachel's number.
NEVER REPEAT: say your greeting once. If they say "Hello?" after you spoke, don't greet again; just go to your point. Never say the same sentence twice in a call.
If someone asks who is calling, give your first name: "This is Rebecca with WSMN."
ADVERTISING LINE: these rules win over STEP 3 of your script. After step 2 of the OPENING ("We run an advertising platform...") and before "Tania, our founder, would love...", look at this lead's notes: {{findings}}
- PPC: ONLY if the notes show the practice or firm pays for Google Ads or pay-per-click (PPC), say: "We're reaching out to a list of practices like yours that pay for Google pay-per-click to stay visible. But what happens when the credits run out? You're off the screen. On our platform, you stay visible all year." For a law firm say "firms like yours".
- BILLBOARD: ONLY if the notes mention a billboard, bus bench, bus stop, radio or TV ad, say: "We're reaching out to a list of practices like yours that advertise on billboards and bus benches. Those reach people driving by, but when someone searches online for a doctor, our platform keeps you visible all year." For a law firm say "firms like yours" and "an attorney".
- If the notes mention none of these, skip the advertising line and use your regular script. Never guess or claim they advertise.
Then continue with the person-in-charge question.
${REB_END}`;
// Monica (doctors) and George (attorneys): Tania's compliance opening, Nov 6. Kept short: George's script is near Cartesia's 30,000 limit.
const COMP_START = "### COMPLIANCE OPENING (WebSwan)", COMP_END = "### END COMPLIANCE OPENING";
const RACHEL_NUMBER = "(316) 248-6839", RACHEL_SPOKEN = "three one six, two four eight, six eight three nine";
const compRules = (who, boss, office, items) => `${COMP_START}
Tania's final opening (Nov 6). Wins over STEP 1, STEP 2, the CALL OPENING rule and every other greeting or scheduling rule in your script, and over "soft spoken" in HOW YOU TALK. No "how are you today?". Confident, calm, knowledgeable, authoritative: you lead the conversation. Natural words, close to these, never sounding read.
1. OPENING, after a live person finishes their greeting: "Hi, this is ${who}. I don't know if I'm talking to the right person. Just so you know, this call is recorded for quality control. Our website tech ran a compliance audit on [the website, said simply, like smithdental dot com] from WDS, covering ${items}, and there are some findings we need to bring to ${boss} [last name]'s attention. What's the best email to send the report to?" No name: "...findings we need to bring to the ${boss.toLowerCase()}'s attention." Then STOP and wait.
2. Repeat the email back naturally, the way they said it (not letter by letter): "Thank you. That's [email]. Is that correct?" Wait for the yes.
3. Then ask ONE question: "When was the last time you had the website audited?" Then STOP and wait. Whatever they answer (unless it's a question, which you answer briefly), go on.
4. THE APPOINTMENT: if you know the ${boss.toLowerCase()}'s name, say: "Okay. So when is the best time to set up a 10-minute appointment with ${boss} [last name]?" If you don't, ask: "Okay. Are you the person in charge of compliance?" If yes: "Great. When is the best day and time for a 10-minute review with Tania?" If no: "Okay, who do we need to set the appointment with? What's the best day and time?" Then book it with your calendar tools.
5. IF THEY CAN'T SET THE APPOINTMENT (they have several questions, no day works, or they don't have the ${boss.toLowerCase()}'s schedule): do NOT keep asking for a day or time. Say: "Would you be willing to call Rachel, our tech assistant? She can answer any questions about {{lead_state}} penalties and lawsuits for website compliance, and set the review appointment for the ${boss.toLowerCase()}. Do you have a pen handy to take down the number?" Wait, then give it slowly: "${RACHEL_SPOKEN}", that's ${RACHEL_NUMBER}, and repeat it once. Then thank them warmly and end the call. You are not Rachel's receptionist: never ask for a day or time again after offering Rachel.
6. Questions and objections: answer with what you know (findings, ${items}, rebuttals), then come back to the next step.
NEVER REPEAT: say your greeting once per call. If they say "Hello?" after you spoke, don't greet again; just go to your point. Never ask the same question twice. While it rings, during menus, hold and recordings, say nothing at all; press menu keys with the keypad, never say the number.
${COMP_END}`;
const COMP_AGENTS = [["monica", compRules("Monica", "Doctor", "practice", "HIPAA, ADA and privacy policy")], ["george", compRules("George", "Attorney", "practice", "ADA, privacy policy and attorney advertising rules")]];
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
// Keep an agent's prompt in the 3-part structure (prompt & personality / YOUR SCRIPT / coaching notes). Only writes when it changed.
// Brain is the master (Tania, Nov 9): this never rewrites a script, rebuttals or call-rules block that is already in the live prompt.
// It only fills in a missing block and clears out old blocks. Normally it finds nothing to do and writes nothing.
async function syncScript(agent, key) {
  const hd = { "Authorization": "Bearer " + process.env.CARTESIA_API_KEY, "X-API-Key": process.env.CARTESIA_API_KEY, "Cartesia-Version": V_READ };
  const g = await fetch(API + "/v1/agents/" + encodeURIComponent(agent), { headers: hd });
  if (!g.ok) return "read " + g.status;
  const d = await g.json(), cur = String(((d.config || (d.agent && d.agent.config)) || {}).instructions || "");
  if (cur.length < 200) return "ok";
  const next = restructure(cur, key);
  if (next === cur) return "ok";
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
Never say you are an AI or a virtual assistant unless someone asks. Never deny being AI and never deny the call is recorded. The only line about the call you say on your own is: "Just so you know, this call is recorded for quality control."
If someone asks whether you are an AI, a robot, a computer or a recording:
1. Say (Tania, Nov 9): "Yes, I am a trained AI by The WebSwan. Would you prefer to talk to a human? I can transfer you to our founder, or have her call you back. Would you want that?" Then stop and wait for their answer.
2. If they want the transfer: if you have tell_tania_who, use it first; then say "Of course. Please hold one moment while I connect you with Tania," and transfer to Tania. If you can't transfer, or they want the call back: "Of course. What's the best number and a good time for Tania to call you?" and note both. If they say no or don't mind talking with you, thank them and go right back to what you were asking: the email, the name, or the appointment. Example: "So, what's the best email to send it to?"
3. Only if they ask whether the call is being recorded: "Yes, it's recorded for quality control."
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
  // Tania, Nov 8: Monica, George and Rebecca get "HOW TO RUN YOUR CALL" (prompt) + "YOUR SCRIPT" (only the words); old opening blocks are removed.
  // Tania, Nov 9: the Brain page is the master. This only fills in a missing block; it never changes what is already there.
  for (const k of Object.keys(CALL_BLOCKS)) { const id = process.env["CARTESIA_AGENT_" + k.toUpperCase()] || ids[k]; if (id) { try { rules += " · " + k + " " + await syncScript(id, k); } catch (e) { rules += " · " + k + " error"; } } }
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
