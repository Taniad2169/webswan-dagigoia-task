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
const AGENTS = ["george", "rebecca", "monica", "alek", "tatiana"];
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
const agentId = (name) => process.env["CARTESIA_AGENT_" + String(name || "").toUpperCase()] || "";
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
    headers: { "Authorization": "Bearer " + process.env.CARTESIA_API_KEY, "Cartesia-Version": version, ...(body ? { "Content-Type": "application/json" } : {}) },
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
  const hasKey = !!process.env.CARTESIA_API_KEY, nums = numberIds();

  // ---------- status: what is connected (never returns secrets) ----------
  if (b.action === "status") {
    const counts = (await store.get("count-" + today(), { type: "json" })) || {};
    return reply(200, {
      keySet: hasKey, numbers: nums.length, live: liveOn(), dailyCap: cap(),
      agents: AGENTS.filter((a) => agentId(a)),
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
        q.settings = { days, start, end, tz: "America/New_York", agent: AGENTS.includes(String(s.agent || "").toLowerCase()) ? String(s.agent).toLowerCase() : "rebecca", perMinute: Math.max(1, Math.min(3, parseInt(s.perMinute, 10) || 1)) };
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
          q.leads.push({ id: clean(x.id, 60), name: clean(x.name, 120), business: clean(x.business, 160), phone, state: st, agent: AGENTS.includes(ag) ? ag : "", campaign: clean(x.campaign, 120), status: "queued", addedAt: Date.now() });
          have.add(phone);
        }
        if (q.leads.length > 2000) q.leads = q.leads.slice(-2000);
      }
      await store.setJSON("queue", q);
    }
    const n = (k) => q.leads.filter((l) => l.status === k).length;
    return reply(200, { settings: q.settings, paused: !!q.paused, lastRun: q.lastRun || null, counts: { queued: n("queued"), called: n("called"), skipped: n("skipped"), error: n("error") },
      leads: q.leads.slice(-300).map((l) => ({ id: l.id, name: l.name, business: l.business, state: l.state, agent: l.agent, status: l.status, note: l.note || "", callId: l.callId || "", calledAt: l.calledAt || null })) }, origin);
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
    for (const a of AGENTS) {
      const id = agentId(a); if (!id) continue;
      try {
        await tries("PATCH", "/agents/" + encodeURIComponent(id), { config: {
          tools: Object.values(saved).filter(Boolean).map((x) => ({ id: x })),
          system_tools: { end_call: {}, send_dtmf: {}, voicemail_detection: {} }
        } });
        report.agents[a] = "connected";
      } catch (e) { report.agents[a] = "error: " + e.message; }
    }
    return reply(200, report, origin);
  }

  // ---------- start one live call ----------
  if (b.action === "start") {
    if (!liveOn()) return reply(403, { error: "Live calling is switched off (VOICE_CALLING_ENABLED is not on)." }, origin);
    const name = String(b.agent || "").toLowerCase();
    const aid = AGENTS.includes(name) ? agentId(name) : "";
    if (!aid) return reply(400, { error: `No Cartesia agent is set for ${b.agent || "this agent"} (CARTESIA_AGENT_${name.toUpperCase() || "NAME"}).` }, origin);
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
        outbound_calls: [{ to_number: to, metadata, dynamic_variables: { lead_id: metadata.leadId, lead_name: metadata.lead, business: metadata.business, lead_state: clean(b.state, 2).toUpperCase() } }],
        ringing_timeout_seconds: 30, max_call_duration_minutes: 6
      });
    } catch (e) { return reply(502, { error: "Cartesia: " + e.message }, origin); }
    const r0 = (data.calls || [])[0] || {};
    if (!r0.agent_call_id) return reply(502, { error: "Cartesia didn't start the call: " + clean(r0.error && (r0.error.message || r0.error) || "unknown", 200) }, origin);
    counts[pick.id] = (counts[pick.id] || 0) + 1; dialed.push(to);
    await store.setJSON(countsKey, counts); await store.setJSON(dialedKey, dialed);
    return reply(200, { callId: r0.agent_call_id, to, fromNumberId: pick.id, agent: name }, origin);
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
    if (!aid) return reply(400, { error: "Unknown agent." }, origin);
    const q = new URLSearchParams({ agent_id: aid, limit: String(Math.max(1, Math.min(100, parseInt(b.limit, 10) || 50))), expand: "transcript" });
    if (b.since) q.set("start_time_gte", new Date(Number(b.since) || b.since).toISOString());
    try {
      const d = await cartesia("GET", "/agents/calls?" + q.toString(), V_READ);
      return reply(200, { agent: name, calls: (d.data || []).map(slimCall), hasMore: !!d.has_more }, origin);
    } catch (e) { return reply(502, { error: "Cartesia: " + e.message }, origin); }
  }

  return reply(400, { error: "Unknown action." }, origin);
};
