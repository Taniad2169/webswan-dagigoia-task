// WebSwan Voice Studio bridge: places live AI calls through Cartesia (Line agents) and reads results.
// Security (all checked here on the server, never in the browser):
//   1. Caller must be signed in with Google as one of OWNERS (Firebase ID token from webswan-voice-studio, verified with Google's keys).
//   2. Only requests from the Voice Studio page origin are accepted.
//   3. The Cartesia key never leaves Netlify. Live calling stays OFF until VOICE_CALLING_ENABLED = on.
//   4. US numbers only, a server Do Not Call list, a daily cap per caller-ID number, and numbers rotate.
// Env vars (set by Tania in Netlify, never in code):
//   CARTESIA_API_KEY          sk_car_... from play.cartesia.ai (API keys)
//   CARTESIA_FROM_NUMBER_IDS  comma-separated Cartesia phone-number IDs (up to 5 on the Startup plan)
//   CARTESIA_AGENT_GEORGE     Cartesia agent ID for George  (also _REBECCA, _MONICA, _ALEK, _TATIANA)
//   VOICE_CALLING_ENABLED     "on" to allow live calls (anything else = practice only)
//   VOICE_DAILY_CAP           optional: max calls per number per day (default 60)
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { sanitizeCal, callScript, openSlots, pickChoices, say, busyWindow, scriptCode } from "../lib/cal.mjs";

const PROJECT_ID = "webswan-voice-studio";
const OWNERS = ["thewebswann@gmail.com", "taniadomingue373@gmail.com"];
const ALLOWED_ORIGINS = ["https://taniad2169.github.io", "https://webswan-billing.netlify.app"];
const AGENTS = ["george", "rebecca", "monica", "alek", "jennifer"];
// Jennifer is the AI receptionist for WSMN clients: she gets the directory lookup tool, not Tania's onboarding calendar.
const RECEPTIONISTS = ["jennifer"];
const API = "https://api.cartesia.ai";
const V_CREATE = process.env.CARTESIA_VERSION || "2026-03-01";
const V_READ = process.env.CARTESIA_READ_VERSION || "2026-08-14";
const TOOLS_URL = "https://webswan-billing.netlify.app/.netlify/functions/voice-tools";
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let jwksCache = { keys: null, at: 0 };

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
}
function reply(status, body, origin) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
}
const b64urlJson = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

async function verifyFirebaseToken(token) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) throw new Error("bad token");
  const header = b64urlJson(parts[0]), payload = b64urlJson(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("bad token header");
  if (!jwksCache.keys || Date.now() - jwksCache.at > 3600e3) {
    const r = await fetch(JWKS_URL);
    if (!r.ok) throw new Error("cannot load Google keys");
    jwksCache = { keys: (await r.json()).keys, at: Date.now() };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown key");
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const ok = crypto.verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), key, Buffer.from(parts[2], "base64url"));
  if (!ok) throw new Error("bad signature");
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== PROJECT_ID || payload.iss !== "https://securetoken.google.com/" + PROJECT_ID) throw new Error("wrong project");
  if (!(payload.exp > now) || !(payload.iat <= now + 60) || !payload.sub) throw new Error("expired");
  if (!payload.email_verified) throw new Error("email not verified");
  return String(payload.email || "").toLowerCase();
}

const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const numberIds = () => String(process.env.CARTESIA_FROM_NUMBER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
// agents created from Voice Studio are remembered in Blobs ("agent-ids"); a Netlify env var always wins
let EXTRA_IDS = {};
const agentId = (name) => process.env["CARTESIA_AGENT_" + String(name || "").toUpperCase()] || EXTRA_IDS[String(name || "").toLowerCase()] || "";
// Languages: an agent's English version is its base name; other languages are separate Cartesia agents
// saved as name_es (Latin American Spanish) and name_pt (Brazilian Portuguese).
const LANGS = { en: "English", es: "Latin American Spanish", pt: "Brazilian Portuguese" };
const ALLOWED_LANGS = { rebecca: ["en", "es"], monica: ["en", "es"], george: ["en", "es"], alek: ["en", "es", "pt"], jennifer: ["en", "es"] };
const agentKey = (name, lang) => (lang && lang !== "en" ? name + "_" + lang : name);
// The English agents are multilingual (English + Mexican Spanish), so Spanish calls use them when no separate Spanish agent exists.
const callAgentId = (name, lang) => agentId(agentKey(name, lang)) || (lang === "es" || (name === "alek" && lang === "pt") ? agentId(name) : "");
// Alek has no separate Portuguese agent (plan limit): his one agent switches to Brazilian Portuguese for a pt call
// and back to English + Mexican Spanish for the next English or Spanish call.
const ALEK_DEFAULT_LANG = { primary: "en", additional: [{ code: "es-MX" }] };
async function alekLanguage(id, lang, store) {
  const d = await cartesia("GET", "/v1/agents/" + encodeURIComponent(id), V_READ);
  const cur = (d.config || (d.agent && d.agent.config) || {}).language || {};
  const isPt = String(cur.primary || "").startsWith("pt");
  if (lang === "pt" && !isPt) {
    await store.setJSON("alek-lang", cur);
    await cartesia("PATCH", "/v1/agents/" + encodeURIComponent(id), V_READ, { config: { language: { primary: "pt-BR", additional: [] } }, version_description: "Alek: Brazilian Portuguese call" });
  } else if (lang !== "pt" && isPt) {
    const orig = (await store.get("alek-lang", { type: "json" }).catch(() => null)) || ALEK_DEFAULT_LANG;
    await cartesia("PATCH", "/v1/agents/" + encodeURIComponent(id), V_READ, { config: { language: String(orig.primary || "").startsWith("pt") ? ALEK_DEFAULT_LANG : orig }, version_description: "Alek: back to English and Spanish" });
  }
}
const MODES = { selling: "Selling: phone application (PWA) and digital e-card", floating: "Floating: follow Tania's task below" };
const LANG_RULE = {
  es: "LANGUAGE (HIGHEST PRIORITY): Speak only in neutral Latin American Spanish (Mexican / Latin American style, use \"usted\"). Never use Spain Spanish words or the \"vosotros\" form. If the person clearly prefers English, switch to English politely.",
  pt: "LANGUAGE (HIGHEST PRIORITY): Speak only in Brazilian Portuguese (português do Brasil), never European Portuguese. If the person clearly prefers English, switch to English politely."
};
const liveOn = () => String(process.env.VOICE_CALLING_ENABLED || "").toLowerCase() === "on";
const cap = () => Math.max(1, Math.min(300, parseInt(process.env.VOICE_DAILY_CAP, 10) || 60));
function e164(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  return /^1[2-9]\d{2}[2-9]\d{6}$/.test(d) ? "+" + d : "";
}
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

async function cartesia(method, path, version, body) {
  const r = await fetch(API + path, {
    method,
    headers: { "Authorization": "Bearer " + process.env.CARTESIA_API_KEY, "X-API-Key": process.env.CARTESIA_API_KEY, "Cartesia-Version": version, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch (e) { data = { message: text.slice(0, 300) }; }
  if (!r.ok) throw new Error((data && (data.message || data.error || data.detail)) ? String(data.message || data.error || JSON.stringify(data.detail)).slice(0, 300) : "Cartesia error " + r.status);
  return data;
}

// Keep only what Voice Studio needs (no raw provider data).
function slimCall(c) {
  if (!c) return null;
  const t = c.telephony_params || {};
  return {
    id: c.id || c.agent_call_id || "", agentId: c.agent_id || "", status: c.status || "",
    start: c.start_time || null, end: c.end_time || null, endReason: c.end_reason || "",
    to: t.to || "", from: t.from || "", summary: c.summary || "",
    metadata: c.metadata || null,
    transcript: Array.isArray(c.transcript) ? c.transcript.slice(0, 400).map((x) => ({ role: x.role, text: clean(x.text, 2000), at: x.start_timestamp })) : []
  };
}

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Not allowed from this page." }, origin);

  let email;
  try { email = await verifyFirebaseToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")); }
  catch (e) { return reply(401, { error: "Please sign in with Google again." }, origin); }
  if (!OWNERS.includes(email)) return reply(403, { error: "This account can't place calls." }, origin);

  let b;
  try { b = await req.json(); } catch (e) { return reply(400, { error: "Bad request." }, origin); }
  const store = getStore({ name: "voice-studio", consistency: "strong" });
  EXTRA_IDS = (await store.get("agent-ids", { type: "json" }).catch(() => null)) || {};
  const hasKey = !!process.env.CARTESIA_API_KEY, nums = numberIds();

  // ---------- status: what is connected (never returns secrets) ----------
  if (b.action === "status") {
    const counts = (await store.get("count-" + today(), { type: "json" })) || {};
    return reply(200, {
      keySet: hasKey, numbers: nums.length, live: liveOn(), dailyCap: cap(),
      agents: AGENTS.filter((a) => agentId(a)),
      languages: Object.fromEntries(AGENTS.filter((a) => agentId(a)).map((a) => [a, (ALLOWED_LANGS[a] || ["en"]).filter((l) => callAgentId(a, l))])),
      allowedLanguages: ALLOWED_LANGS,
      callsToday: Object.values(counts).reduce((s, n) => s + n, 0)
    }, origin);
  }

  // ---------- Do Not Call list (server side, shared by every device) ----------
  if (b.action === "dnc") {
    const list = (await store.get("dnc", { type: "json" })) || [];
    const n = e164(b.phone);
    if (b.add && n && !list.includes(n)) { list.push(n); await store.setJSON("dnc", list); }
    return reply(200, { count: list.length, listed: n ? list.includes(n) : false }, origin);
  }

  // ---------- auto-dial queue (dialed every minute by voice-autodial) ----------
  if (b.action === "queue_get" || b.action === "queue_set") {
    const q = (await store.get("queue", { type: "json" })) || { settings: { days: ["tue", "wed", "thu"], start: "11:00", end: "12:00", tz: "America/New_York", agent: "rebecca", perMinute: 1 }, leads: [], paused: true };
    if (b.action === "queue_set") {
      const s = b.settings;
      if (s) {
        const days = (Array.isArray(s.days) ? s.days : []).filter((d) => ["mon", "tue", "wed", "thu", "fri"].includes(d));
        const hm = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")) ? String(v) : null;
        const start = hm(s.start), end = hm(s.end);
        if (!start || !end || end <= start) return reply(400, { error: "Pick a start and end time (end after start)." }, origin);
        q.settings = { days, start, end, tz: "America/New_York", agent: AGENTS.includes(String(s.agent || "").toLowerCase()) ? String(s.agent).toLowerCase() : "rebecca", perMinute: Number(s.perMinute) === 0.5 ? 0.5 : Math.max(1, Math.min(3, parseInt(s.perMinute, 10) || 1)) };
      }
      if (typeof b.paused === "boolean") q.paused = b.paused;
      if (b.clear === "all") q.leads = [];
      if (b.clear === "done") q.leads = q.leads.filter((l) => l.status === "queued");
      if (Array.isArray(b.add)) {
        const have = new Set(q.leads.filter((l) => l.status === "queued").map((l) => e164(l.phone)));
        for (const x of b.add.slice(0, 1000)) {
          const phone = e164(x && x.phone), st = clean(x && x.state, 2).toUpperCase();
          if (!phone || have.has(phone) || !/^[A-Z]{2}$/.test(st)) continue;
          const ag = String((x && x.agent) || "").toLowerCase();
          q.leads.push({ id: clean(x.id, 60), name: clean(x.name, 120), business: clean(x.business, 160), phone, state: st, agent: AGENTS.includes(ag) ? ag : "", lang: LANGS[x.lang] ? x.lang : "en", mode: x.mode === "floating" ? "floating" : "selling", task: String(x.task || "").replace(/[\u0000-\u0008\u000b-\u001f<>]/g, " ").trim().slice(0, 1500), findings: clean(x.findings, 400), campaign: clean(x.campaign, 120), status: "queued", addedAt: Date.now() });
          have.add(phone);
        }
        if (q.leads.length > 2000) q.leads = q.leads.slice(-2000);
      }
      await store.setJSON("queue", q);
    }
    const n = (k) => q.leads.filter((l) => l.status === k).length;
    return reply(200, { settings: q.settings, paused: !!q.paused, lastRun: q.lastRun || null, counts: { queued: n("queued"), called: n("called"), skipped: n("skipped"), error: n("error") },
      leads: q.leads.slice(-300).map((l) => ({ id: l.id, name: l.name, business: l.business, state: l.state, agent: l.agent, lang: l.lang || "en", status: l.status, note: l.note || "", callId: l.callId || "", calledAt: l.calledAt || null })) }, origin);
  }


  // ---------- calendar booking settings (Tania's Google Calendar via her Apps Script) ----------
  if (b.action === "cal_get" || b.action === "cal_set" || b.action === "cal_test") {
    let calSecret = await store.get("cal-secret");
    if (!calSecret) { calSecret = crypto.randomBytes(24).toString("base64url"); await store.set("cal-secret", calSecret); }
    let cal = sanitizeCal(await store.get("calendar", { type: "json" }));
    if (b.action === "cal_set" && b.calendar) {
      const raw = String(b.calendar.scriptUrl || "").trim();
      if (raw && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(raw)) return reply(400, { error: "That isn't an Apps Script web app link. It should start with https://script.google.com/macros/s/ and end with /exec." }, origin);
      cal = sanitizeCal(Object.assign({}, cal, b.calendar));
      await store.setJSON("calendar", cal);
    }
    const out = { calendar: cal, script: scriptCode(calSecret), bookings: ((await store.get("bookings", { type: "json" })) || []).slice(0, 50) };
    if (b.action === "cal_test") {
      try {
        const ping = await callScript(cal, calSecret, { action: "ping" });
        const busy = (await callScript(cal, calSecret, Object.assign({ action: "busy" }, busyWindow(cal)))).busy;
        out.test = { ok: true, account: ping.account, calendar: ping.calendar, next: pickChoices(openSlots(cal, busy), cal.tz).map((s) => say(s, cal.tz)) };
      } catch (e) { out.test = { ok: false, error: e.message }; }
    }
    return reply(200, out, origin);
  }

  if (!hasKey) return reply(503, { error: "Cartesia isn't connected yet. Add CARTESIA_API_KEY in Netlify, then redeploy." }, origin);


  // ---------- connect calendar tools + safety switches to the Cartesia agents ----------
  if (b.action === "agent_setup") {
    let toolSecret = await store.get("tool-secret");
    if (!toolSecret) { toolSecret = crypto.randomBytes(32).toString("base64url"); await store.set("tool-secret", toolSecret); }
    const auth = { mode: "bearer", token: { type: "secret", secret_value: toolSecret } };
    const defs = [
      { key: "slots", body: { type: "webhook", name: "check_availability", description: "Get Tania's open times for a 10-minute onboarding call. Use it as soon as the doctor or attorney agrees to a call with Tania, before suggesting any day or time.", pre_tool_speech: "auto", execution_mode: "immediate", response_timeout_secs: 20,
          api_schema: { url: TOOLS_URL, method: "GET", query_params_schema: { properties: { action: { type: "string", constant_value: "slots" }, lead_state: { type: "string", dynamic_variable: "lead_state" } } }, authentication: auth } } },
      { key: "book", body: { type: "webhook", name: "book_appointment", description: "Book the onboarding call on Tania's calendar after the person picks one of the times from check_availability. Never book a time that did not come from check_availability.", pre_tool_speech: "auto", execution_mode: "immediate", response_timeout_secs: 25,
          api_schema: { url: TOOLS_URL, method: "POST", request_body_schema: { type: "object", properties: {
            action: { type: "string", constant_value: "book" },
            slot_id: { type: "string", description: "The exact slot_id of the time they chose, copied from check_availability." },
            contact_name: { type: "string", description: "Name of the doctor or attorney Tania will speak with." },
            practice_name: { type: "string", description: "Name of the practice or law firm." },
            email: { type: "string", description: "Best email for the calendar invitation, spelled out and confirmed with them. Empty if they would not give one." },
            notes: { type: "string", description: "Anything useful Tania should know, in one or two sentences." },
            lead_state: { type: "string", dynamic_variable: "lead_state" },
            lead_id: { type: "string", dynamic_variable: "lead_id" },
            call_id: { type: "string", dynamic_variable: "system__conversation_id" },
            lead_phone: { type: "string", dynamic_variable: "system__called_number" }
          }, required: ["slot_id"] }, authentication: auth } } }
      ,{ key: "provider", body: { type: "webhook", name: "lookup_provider", description: "Look up a doctor or attorney in the WebSwan Media Network directory: specialty, location, phone, languages, insurance, whether they take new patients or clients. Use it as soon as you know which provider the call is about.", pre_tool_speech: "auto", execution_mode: "immediate", response_timeout_secs: 15,
          api_schema: { url: TOOLS_URL, method: "POST", request_body_schema: { type: "object", properties: {
            action: { type: "string", constant_value: "provider" },
            provider_name: { type: "string", description: "The doctor's or attorney's name, or the practice name, as the caller said it." },
            provider_id: { type: "string", description: "The provider_id from your call details or from an earlier lookup, if you have one. Otherwise leave empty." }
          } }, authentication: auth } } }
    ];
    const saved = (await store.get("tool-ids", { type: "json" })) || {};
    const tries = async (method, path, body) => { try { return await cartesia(method, path, V_READ, body); } catch (e) { if (/not found|404/i.test(e.message)) return await cartesia(method, "/v1" + path, V_READ, body); throw e; } };
    const report = { tools: {}, agents: {} };
    try {
      for (const d of defs) {
        if (saved[d.key]) { try { await tries("PATCH", "/agents/tools/" + saved[d.key], d.body); report.tools[d.body.name] = "updated"; continue; } catch (e) { delete saved[d.key]; } }
        const t = await tries("POST", "/agents/tools", d.body);
        saved[d.key] = t.id || (t.tool && t.tool.id) || ""; report.tools[d.body.name] = saved[d.key] ? "created" : "created (no id returned)";
      }
      await store.setJSON("tool-ids", saved);
    } catch (e) { return reply(502, { error: "Couldn't create the calendar tools in Cartesia: " + e.message }, origin); }
    for (const a of AGENTS.flatMap((n) => (ALLOWED_LANGS[n] || ["en"]).map((l) => agentKey(n, l)))) {
      const id = agentId(a); if (!id) continue;
      try {
        await cartesia("PATCH", "/v1/agents/" + encodeURIComponent(id), V_READ, { config: {
          tools: Object.entries(saved).filter(([k, x]) => x && (RECEPTIONISTS.includes(a.split("_")[0]) ? k === "provider" : k !== "provider")).map(([, x]) => ({ id: x })),
          system_tools: { end_call: {}, send_dtmf: {}, voicemail_detection: {} }
        } });
        report.agents[a] = "connected";
      } catch (e) { report.agents[a] = "error: " + e.message; }
    }
    return reply(200, report, origin);
  }

  // ---------- forget a deleted agent's ID (e.g. after deleting it in Cartesia to free a slot) ----------
  if (b.action === "agent_unlink") {
    const key = String(b.key || "").toLowerCase();
    if (!/^[a-z]+(_(es|pt))?$/.test(key) || !AGENTS.includes(key.split("_")[0])) return reply(400, { error: "Unknown agent." }, origin);
    if (process.env["CARTESIA_AGENT_" + key.toUpperCase()]) return reply(409, { error: "This agent is set in Netlify (CARTESIA_AGENT_" + key.toUpperCase() + "). Remove that variable there and redeploy." }, origin);
    const had = !!EXTRA_IDS[key]; delete EXTRA_IDS[key]; await store.setJSON("agent-ids", EXTRA_IDS);
    return reply(200, { ok: true, removed: had, key }, origin);
  }

  // ---------- update one agent's instructions (system prompt) in Cartesia ----------
  if (b.action === "agent_prompt") {
    const name = String(b.agent || "").toLowerCase(), id = AGENTS.includes(name) ? agentId(agentKey(name, LANGS[b.lang] ? b.lang : "en")) : "";
    if (!id) return reply(400, { error: "No Cartesia agent is linked for " + (b.agent || "that agent") + "." }, origin);
    const ins = String(b.instructions || "").trim();
    if (ins.length < 50 || ins.length > 30000) return reply(400, { error: "The prompt looks empty or too long." }, origin);
    try {
      await cartesia("PATCH", "/v1/agents/" + encodeURIComponent(id), V_READ, { config: { instructions: ins }, version_description: "Updated from WebSwan Voice Studio" });
      return reply(200, { ok: true, agent: name, chars: ins.length }, origin);
    } catch (e) { return reply(502, { error: "Cartesia: " + e.message }, origin); }
  }

  // ---------- start one live call ----------
  if (b.action === "start") {
    if (!liveOn()) return reply(403, { error: "Live calling is switched off (VOICE_CALLING_ENABLED is not on)." }, origin);
    const name = String(b.agent || "").toLowerCase();
    const lang = LANGS[b.lang] ? b.lang : "en";
    if (AGENTS.includes(name) && !(ALLOWED_LANGS[name] || ["en"]).includes(lang)) return reply(400, { error: `${name} doesn't call in ${LANGS[lang]}.` }, origin);
    const aid = AGENTS.includes(name) ? callAgentId(name, lang) : "";
    const mode = b.mode === "floating" ? "floating" : "selling", task = String(b.task || "").replace(/[\u0000-\u0008\u000b-\u001f<>]/g, " ").trim().slice(0, 1500);
    if (name === "alek" && mode === "floating" && task.length < 10) return reply(400, { error: "Give Alek his task or script for this call first." }, origin);
    if (name === "alek" && aid && !agentId("alek_pt")) { try { await alekLanguage(aid, lang, store); } catch (e) { return reply(502, { error: "Couldn't switch Alek's language: " + e.message }, origin); } }
    if (!aid) return reply(400, { error: lang === "en" ? `No Cartesia agent is set for ${b.agent || "this agent"} (CARTESIA_AGENT_${name.toUpperCase() || "NAME"}).` : `${name}'s ${LANGS[lang]} version isn't created yet (AI Team > Coach > Live Cartesia agents).` }, origin);
    if (!nums.length) return reply(400, { error: "No caller-ID numbers yet (CARTESIA_FROM_NUMBER_IDS)." }, origin);
    const to = e164(b.phone);
    if (!to) return reply(400, { error: "That isn't a valid US phone number." }, origin);
    const dnc = (await store.get("dnc", { type: "json" })) || [];
    if (dnc.includes(to)) return reply(403, { error: "This number is on the Do Not Call list." }, origin);

    // one call per lead number per day, and rotate caller IDs under the daily cap
    const day = today(), countsKey = "count-" + day, dialedKey = "dialed-" + day;
    const dialed = (await store.get(dialedKey, { type: "json" })) || [];
    if (dialed.includes(to) && !b.force) return reply(409, { error: "This number was already called today." }, origin);
    const counts = (await store.get(countsKey, { type: "json" })) || {};
    const pick = nums.map((id) => ({ id, n: counts[id] || 0 })).filter((x) => x.n < cap()).sort((a, b2) => a.n - b2.n)[0];
    if (!pick) return reply(429, { error: `Every number reached today's cap of ${cap()} calls. Try again tomorrow.` }, origin);

    const metadata = { leadId: clean(b.leadId, 60), lead: clean(b.leadName, 120), business: clean(b.business, 160), campaign: clean(b.campaign, 120), by: email };
    let data;
    try {
      data = await cartesia("POST", "/agents/calls", V_CREATE, {
        agent_id: aid, from_number_id: pick.id,
        outbound_calls: [{ to_number: to, metadata, dynamic_variables: { lead_id: metadata.leadId, lead_name: metadata.lead, business: metadata.business, lead_state: clean(b.state, 2).toUpperCase(), findings: clean(b.findings, 400) || "none listed", lead_language: LANGS[lang], call_mode: name === "alek" ? MODES[mode] : "standard", task: name === "alek" && mode === "floating" ? task : "none" } }],
        ringing_timeout_seconds: 30, max_call_duration_minutes: 6
      });
    } catch (e) { return reply(502, { error: "Cartesia: " + e.message }, origin); }
    const r0 = (data.calls || [])[0] || {};
    if (!r0.agent_call_id) return reply(502, { error: "Cartesia didn't start the call: " + clean(r0.error && (r0.error.message || r0.error) || "unknown", 200) }, origin);
    counts[pick.id] = (counts[pick.id] || 0) + 1; dialed.push(to);
    await store.setJSON(countsKey, counts); await store.setJSON(dialedKey, dialed);
    return reply(200, { callId: r0.agent_call_id, to, fromNumberId: pick.id, agent: name, lang }, origin);
  }

  // ---------- read one call (status, transcript, summary) ----------
  if (b.action === "get") {
    const id = clean(b.callId, 120);
    if (!/^[\w-]+$/.test(id)) return reply(400, { error: "Bad call id." }, origin);
    try { return reply(200, { call: slimCall(await cartesia("GET", "/agents/calls/" + encodeURIComponent(id), V_READ)) }, origin); }
    catch (e) { return reply(502, { error: "Cartesia: " + e.message }, origin); }
  }

  // ---------- list recent calls for one agent (to backfill the call log) ----------
  if (b.action === "list") {
    const name = String(b.agent || "").toLowerCase(), aid = agentId(name);
    if (!aid || !AGENTS.includes(name.split("_")[0])) return reply(400, { error: "Unknown agent." }, origin);
    const q = new URLSearchParams({ agent_id: aid, limit: String(Math.max(1, Math.min(100, parseInt(b.limit, 10) || 50))), expand: "transcript" });
    if (b.since) q.set("start_time_gte", new Date(Number(b.since) || b.since).toISOString());
    try {
      const d = await cartesia("GET", "/agents/calls?" + q.toString(), V_READ);
      return reply(200, { agent: name, calls: (d.data || []).map(slimCall), hasMore: !!d.has_more }, origin);
    } catch (e) { return reply(502, { error: "Cartesia: " + e.message }, origin); }
  }

  // ---------- read one agent's live Cartesia settings (instructions, voice) ----------
  if (b.action === "agent_get") {
    const name = String(b.agent || "").toLowerCase(), id = AGENTS.includes(name) ? agentId(agentKey(name, LANGS[b.lang] ? b.lang : "en")) : "";
    if (!id) return reply(400, { error: "No Cartesia agent is linked for " + (b.agent || "that agent") + "." }, origin);
    try {
      const d = await cartesia("GET", "/v1/agents/" + encodeURIComponent(id), V_READ);
      const cfg = d.config || (d.agent && d.agent.config) || {};
      return reply(200, { agent: name, id, name: d.name || "", instructions: cfg.instructions || "", language: cfg.language || null, voiceId: (cfg.audio && cfg.audio.output && cfg.audio.output.voice_id) || "" }, origin);
    } catch (e) { return reply(502, { error: "Cartesia: " + e.message }, origin); }
  }

  // ---------- a few English voices to choose from (for a new agent) ----------
  if (b.action === "voices") {
    try {
      const d = await cartesia("GET", "/voices?limit=100", V_READ);
      const list = (Array.isArray(d) ? d : d.data || []).filter((v) => !v.language || v.language === "en")
        .map((v) => ({ id: v.id, name: v.name || "", gender: v.gender || "", description: clean(v.description, 140) }));
      const want = String(b.gender || "").toLowerCase();
      return reply(200, { voices: (want ? list.filter((v) => String(v.gender).toLowerCase().startsWith(want.slice(0, 4))) : list).slice(0, 40) }, origin);
    } catch (e) { return reply(502, { error: "Cartesia: " + e.message }, origin); }
  }

  // ---------- create a new calling agent (copies Rebecca's tools, model and safety switches) ----------
  if (b.action === "agent_create") {
    const name = String(b.agent || "").toLowerCase();
    if (!AGENTS.includes(name)) return reply(400, { error: "Unknown agent name." }, origin);
    const lang = LANGS[b.lang] ? b.lang : "en";
    if (!(ALLOWED_LANGS[name] || ["en"]).includes(lang)) return reply(400, { error: `${name} isn't set up to call in ${LANGS[lang]}.` }, origin);
    const key = agentKey(name, lang);
    if (agentId(key)) return reply(409, { error: name[0].toUpperCase() + name.slice(1) + (lang === "en" ? "" : " (" + LANGS[lang] + ")") + " already has a Cartesia agent." }, origin);
    // a language version starts from the same person's English agent; a brand-new agent starts from Rebecca
    const fromId = lang !== "en" ? agentId(name) : agentId(String(b.from || "rebecca").toLowerCase());
    if (!fromId) return reply(400, { error: lang !== "en" ? "Create or link the English version first." : "Rebecca's Cartesia agent is needed as the starting point." }, origin);
    let ins = String(b.instructions || "").trim();
    if (lang !== "en" && ins.length < 200) {
      const src0 = await cartesia("GET", "/v1/agents/" + encodeURIComponent(fromId), V_READ).catch(() => null);
      ins = String(((src0 && (src0.config || (src0.agent && src0.agent.config))) || {}).instructions || "").trim();
    }
    if (lang !== "en" && LANG_RULE[lang] && !ins.startsWith("LANGUAGE")) ins = LANG_RULE[lang] + "\n\n" + ins;
    if (ins.length < 200 || ins.length > 30000) return reply(400, { error: "The new agent needs her full instructions (script)." }, origin);
    try {
      const src = await cartesia("GET", "/v1/agents/" + encodeURIComponent(fromId), V_READ);
      const c = src.config || (src.agent && src.agent.config) || {};
      const config = {};
      for (const k of ["language", "audio", "model", "tools", "system_tools", "turn", "timezone"]) if (c[k] !== undefined) config[k] = JSON.parse(JSON.stringify(c[k]));
      config.instructions = ins;
      config.initial_message = null;
      // English agent: keep its own language settings. Spanish = Latin American (es-MX) only; Portuguese = Brazil (pt-BR) only.
      const langTries = lang === "en" ? [config.language || null] : lang === "es" ? [{ primary: "es-MX" }, { primary: "es", additional: [] }, { primary: "es" }] : [{ primary: "pt-BR" }, { primary: "pt", additional: [] }, { primary: "pt" }];
      if (b.voiceId && /^[\w-]{8,80}$/.test(String(b.voiceId))) { config.audio = config.audio || {}; config.audio.output = Object.assign({}, config.audio.output || {}, { voice_id: String(b.voiceId) }); }
      const label = (clean(b.displayName, 60) || (name[0].toUpperCase() + name.slice(1))) + (lang === "en" ? "" : " - " + (lang === "es" ? "Español" : "Português"));
      let made = null, lastErr = null;
      for (const lt of langTries) {
        if (lt) config.language = lt; else delete config.language;
        try { made = await cartesia("POST", "/v1/agents", V_READ, { name: label + " (WebSwan)", description: clean(b.description, 300) || "Created from WebSwan Voice Studio", config }); break; } catch (e) { lastErr = e; }
      }
      if (!made) throw lastErr || new Error("Cartesia refused the new agent.");
      const newId = made.id || (made.agent && made.agent.id) || "";
      if (!newId) return reply(502, { error: "Cartesia didn't return the new agent's id." }, origin);
      EXTRA_IDS[key] = newId; await store.setJSON("agent-ids", EXTRA_IDS);
      return reply(200, { ok: true, agent: name, lang, id: newId }, origin);
    } catch (e) { return reply(502, { error: "Cartesia: " + e.message }, origin); }
  }

  // ---------- play a call recording (streams the WAV from Cartesia) ----------
  if (b.action === "audio") {
    const id = clean(b.callId, 120);
    if (!/^[\w-]+$/.test(id)) return reply(400, { error: "Bad call id." }, origin);
    const r = await fetch(API + "/agents/calls/" + encodeURIComponent(id) + "/audio", { headers: { "Authorization": "Bearer " + process.env.CARTESIA_API_KEY, "X-API-Key": process.env.CARTESIA_API_KEY, "Cartesia-Version": V_READ } });
    if (!r.ok) return reply(r.status === 404 ? 404 : 502, { error: r.status === 404 ? "No recording for this call yet." : "Cartesia recording error " + r.status }, origin);
    return new Response(r.body, { status: 200, headers: { "Content-Type": r.headers.get("content-type") || "audio/wav", ...cors(origin) } });
  }

  return reply(400, { error: "Unknown action." }, origin);
};
