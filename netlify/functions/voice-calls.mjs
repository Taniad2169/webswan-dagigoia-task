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
//   VOICE_DAILY_CAP           optional: max calls per number per day (default 80)
import { runWorkpilotSync } from "./ai-calls-workpilot.mjs";
import { askAI } from "../lib/team.mjs";
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { sanitizeCal, callScript, openSlots, pickChoices, say, busyWindow, scriptCode } from "../lib/cal.mjs";
import { loadBudget, budgetSummary, budgetGate, budgetRecord, budgetSync, allAgentIds, sanitizeBudget } from "../lib/budget.mjs";

const PROJECT_ID = "webswan-voice-studio";
const OWNERS = ["thewebswann@gmail.com", "taniadomingue373@gmail.com"];
const ALLOWED_ORIGINS = ["https://taniad2169.github.io", "https://webswan-billing.netlify.app"];
const AGENTS = ["george", "rebecca", "monica", "alek", "jennifer", "rachel", "rachelout"];
// Rachel, Tania's virtual coordinator: 239 answers compliance questions, 347 answers WebSwan Media Network (advertising) questions.
const RACHEL_COMPLIANCE = process.env.RACHEL_COMPLIANCE_NUMBER || "+12396670151";
const RACHEL_ADVERTISING = process.env.RACHEL_ADVERTISING_NUMBER || "+13476467086";
function rachelTransfers(agent) {
  const comp = { destination: { type: "phone", phone_number: RACHEL_COMPLIANCE }, condition: "The person has questions about website compliance, ADA, privacy, HIPAA, the audit findings or the risk, and agrees to be transferred to Rachel, WebSwan Digital Solutions' compliance coordinator." };
  const ads = { destination: { type: "phone", phone_number: RACHEL_ADVERTISING }, condition: "The person wants more information about WebSwan Media Network, advertising, visibility or being added to the directory, and agrees to be transferred to Rachel, the advertising coordinator." };
  // Rachel (our own Cartesia receptionist) hands the caller to Tania when TANIA_TRANSFER_NUMBER is set
  const tania = String(process.env.TANIA_TRANSFER_NUMBER || "").trim();
  const toTania = tania ? [{ destination: { type: "phone", phone_number: tania }, condition: "The caller wants to speak with Tania, or asks something only Tania can answer, and agrees to be connected." }] : null;
  // When both lines are the same (our own Rachel answers both), merge them into one transfer: Cartesia needs unique destinations.
  const both = RACHEL_COMPLIANCE === RACHEL_ADVERTISING ? [{ destination: comp.destination, condition: "The person has questions about website compliance (ADA, privacy, HIPAA, the audit findings or the risk) or about WebSwan Media Network (advertising, visibility, the directory), and agrees to be transferred to Rachel." }] : [comp, ads];
  return { monica: [comp], george: both, rebecca: [ads], alek: both, rachel: toTania }[agent] || null;
}
// Jennifer is the AI receptionist for WSMN clients: she gets the directory lookup tool, not Tania's onboarding calendar.
const RECEPTIONISTS = ["jennifer"];
// Which webhook tools each agent gets. Rachel answers The WebSwan's own line: directory lookup + Tania's calendar.
// Every calling agent gets Tania's calendar (check_availability reads her Google Calendar busy times; book_appointment re-checks before booking).
// Receptionists answer calls that Voice Studio didn't start, so there are no dynamic variables (lead_state, lead_id):
// they get the "In" versions of the calendar tools, which ask the model for those details instead.
const TOOLSET = (a) => a === "jennifer" ? ["provider", "client", "slotsIn", "bookIn"] : a === "rachel" ? ["caller", "provider", "slotsIn", "bookIn"] : ["slots", "book"];
// Virtual-receptionist plans. "basic" = appointment setter only: Jennifer gets name, practice, phone and hours, nothing else.
const CLIENT_PLANS = {
  basic299: { label: "$299 Partial (standalone): appointment setter only", full: false },
  wsmn69_399: { label: "$69 WSMN Found + Leads + $399 receptionist", full: true },
  wsmn149_299: { label: "(old) $149 WSMN + $299 receptionist", full: true },
  full499: { label: "$499 Full Service (standalone)", full: true }
};
const CLIENT_FIELDS = { type: 12, providerName: 160, practiceName: 200, address: 300, officePhone: 30, notifyEmail: 160, jennLine: 30, hours: 1000, greeting: 400,
  website: 300, specialties: 1000, yearsInBusiness: 60, reviews: 300, insurance: 1000, cashPay: 300, consultation: 300, providerCode: 12, script: 45000, notes: 2000, minutesIncluded: 8,
  contactName: 160, contactPhone: 30, startDate: 20, baaSigned: 20, source: 30 };
// Added to every agent's instructions by "agent setup" (replaced, never duplicated, when it changes).
const PHONE_RULES_START = "### PHONE MENU, HUMAN AND VOICEMAIL RULES (WebSwan)";
const PHONE_RULES_END = "### END PHONE RULES";
const PHONE_RULES = `${PHONE_RULES_START}
These rules come before everything else in your script.
1. PHONE MENUS. If a recording answers with options ("press 1 for appointments, press 2 for billing..."), NEVER say the number out loud. Use the send_dtmf tool to press the key on the keypad. Pick the option for the front desk, reception, the operator, new patients or new clients, or "all other questions". If there is no good option, press 0. If the menu asks for an extension or "dial by name", press 0. If it says "stay on the line", do nothing and wait.
2. STAY SILENT UNTIL A HUMAN SPEAKS. After you press a key, or while you hear hold music, a recording, "your call is important to us" or "please hold", say nothing. Do not start your greeting or pitch to a recording. Wait for a live person to say hello.
3. HOW TO TELL A HUMAN FROM A RECORDING. A recording sounds scripted and polished, lists options or office hours, keeps going when you speak, and never answers you. A human says hello or the office name, pauses for you, reacts to what you say, and may say "who's calling?" or "how can I help you?". If you are not sure, say only "Hello?" right away. A human answers; a recording keeps playing.
3c. NEVER NARRATE. When you stay silent (rings, menus, hold, recordings), output nothing at all. Never say what you are doing, like "I'm waiting on hold" or "staying silent".
3d. ONE BREATH GREETING. Say your whole greeting in one sentence without stopping after "Hi" ("Hi, this is [name], how are you today?").
3b. ANSWER A LIVE PERSON IMMEDIATELY. The moment a live person finishes their greeting ("Law office of...", "How can I help you?", "Hello?"), start your greeting at once, with no pause. Never make a person say "Hello?" twice: if they say "Hello?", answer right away with your greeting.
4. VOICEMAIL: HANG UP. If you reach voicemail or an answering machine ("leave a message", "after the tone", "after the beep", "the mailbox", "is not available to take your call", "the person you are calling"), do NOT leave a message. Use the end_call tool right away, before the beep.
5. LONG HOLD. If you have been on hold or in menus for about 90 seconds with no live person, use end_call.
6. "ARE YOU A ROBOT?" If someone asks whether you are a robot or AI, answer honestly and warmly in one sentence ("Yes, I'm an AI assistant calling for Tania at WebSwan.") and continue politely. If they ask you to stop calling, apologize, say they will not be called again, and use end_call.
${PHONE_RULES_END}`;
// Rachel only ANSWERS calls (inbound and transfers), so she gets "greet right away" instead of the outbound phone rules.
const INBOUND_RULES = `${PHONE_RULES_START}
You answer incoming calls and calls transferred to you. Speak first, right away, with your greeting; never wait in silence.
If you are ever on hold or reach a recording, say nothing and wait; if no person speaks for about a minute, use end_call.
If someone asks whether you are a robot or AI, answer honestly and warmly, then continue helping.
${PHONE_RULES_END}`;
function withPhoneRules(ins, agent) {
  const text = String(ins || "");
  const a = text.indexOf(PHONE_RULES_START), b = text.indexOf(PHONE_RULES_END);
  const base = a >= 0 && b > a ? (text.slice(0, a) + text.slice(b + PHONE_RULES_END.length)).trim() : text.trim();
  return base ? (agent === "rachel" ? INBOUND_RULES : PHONE_RULES) + "\n\n" + base : "";
}
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
    await cartesia("PATCH", "/v1/agents/" + encodeURIComponent(id), V_READ, { config: { language: { primary: "pt-BR", additional: [] } } });
  } else if (lang !== "pt" && isPt) {
    const orig = (await store.get("alek-lang", { type: "json" }).catch(() => null)) || ALEK_DEFAULT_LANG;
    await cartesia("PATCH", "/v1/agents/" + encodeURIComponent(id), V_READ, { config: { language: String(orig.primary || "").startsWith("pt") ? ALEK_DEFAULT_LANG : orig } });
  }
}
const MODES = { selling: "Selling: phone application (PWA) and digital e-card", floating: "Floating: follow Tania's task below" };
const LANG_RULE = {
  es: "LANGUAGE (HIGHEST PRIORITY): Speak only in neutral Latin American Spanish (Mexican / Latin American style, use \"usted\"). Never use Spain Spanish words or the \"vosotros\" form. If the person clearly prefers English, switch to English politely.",
  pt: "LANGUAGE (HIGHEST PRIORITY): Speak only in Brazilian Portuguese (português do Brasil), never European Portuguese. If the person clearly prefers English, switch to English politely."
};
const liveOn = () => String(process.env.VOICE_CALLING_ENABLED || "").toLowerCase() === "on";
const cap = () => Math.max(1, Math.min(300, parseInt(process.env.VOICE_DAILY_CAP, 10) || 80));
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
      callsToday: Object.values(counts).reduce((s, n) => s + n, 0),
      budget: budgetSummary(await loadBudget(store))
    }, origin);
  }

  // ---------- monthly call budget: live usage, settings and Tania's override ----------
  if (b.action === "usage" || b.action === "usage_set" || b.action === "usage_override") {
    if (b.action === "usage_set" && b.settings) await store.setJSON("budget-settings", sanitizeBudget(b.settings));
    if (b.action === "usage_override") {
      const usd = Math.round(Number(b.usd) * 100) / 100;
      if (!(usd > 0 && usd <= 500)) return reply(400, { error: "Enter an amount between $1 and $500." }, origin);
      if (String(b.confirm || "").trim().toUpperCase() !== "APPROVE") return reply(400, { error: "Type APPROVE to confirm the extra spending." }, origin);
      const B0 = await loadBudget(store);
      B0.ledger.overrides = (B0.ledger.overrides || []).concat([{ usd, by: email, at: new Date().toISOString(), note: clean(b.note, 160) }]);
      await store.setJSON("usage-" + B0.ledger.cycle, B0.ledger);
    }
    let sync = null;
    if (b.sync !== false) { try { sync = await budgetSync(store, await allAgentIds(store)); } catch (e) { sync = { ok: false, why: e.message }; } }
    const B = await loadBudget(store);
    // which AI model each live agent runs on (read from Cartesia, so it is always current)
    const models = {};
    if (b.models && hasKey) for (const a of AGENTS) {
      const id = agentId(a); if (!id) continue;
      try {
        const d = await cartesia("GET", "/v1/agents/" + encodeURIComponent(id), V_READ);
        const m = (d.config || (d.agent && d.agent.config) || {}).model;
        models[a] = !m ? "Cartesia default" : typeof m === "string" ? m : clean(m.name || m.id || m.model || JSON.stringify(m), 120);
      } catch (e) { models[a] = "couldn't read: " + clean(e.message, 80); }
    }
    return reply(200, { settings: B.settings, summary: budgetSummary(B), sync, models }, origin);
  }

  // ---------- Do Not Call list (server side, shared by every device) ----------
  if (b.action === "dnc") {
    const list = (await store.get("dnc", { type: "json" })) || [];
    const n = e164(b.phone);
    if (b.add && n && !list.includes(n)) { list.push(n); await store.setJSON("dnc", list); }
    return reply(200, { count: list.length, listed: n ? list.includes(n) : false }, origin);
  }

  // ---------- auto-dial queue (dialed every minute by voice-autodial) ----------
  // ---------- Alek's callback calendar ----------
  // ---------- Rachel follow-ups: report emailed, no appointment yet → Rachel calls to set the 10-15 minute appointment ----------
  if (b.action === "followup_list" || b.action === "followup_add" || b.action === "followup_cancel") {
    const team = getStore({ name: "team", consistency: "strong" });
    let list = (await store.get("rachel-followups", { type: "json" })) || [];
    let drafts = (await team.get("followups", { type: "json" })) || [];
    if (b.action === "followup_add") {
      const f = b.followup || {};
      const phone = e164(f.phone), st = clean(f.state, 2).toUpperCase();
      if (!phone) return reply(400, { error: "Add a valid US phone number." }, origin);
      if (!/^[A-Z]{2}$/.test(st)) return reply(400, { error: "Add the state (2 letters) so Rachel calls in their business hours." }, origin);
      const when = Date.parse(f.callAt) || Date.now();
      list.push({ id: "rf_" + crypto.randomBytes(5).toString("hex"), kind: f.kind === "advertising" ? "advertising" : "compliance", name: clean(f.name, 120), business: clean(f.business, 160), email: clean(f.email, 160), website: clean(f.website, 200), phone, state: st,
        note: clean(f.note, 600), callAt: new Date(Math.max(when, Date.now())).toISOString(), status: "scheduled", createdAt: new Date().toISOString() });
      if (Number.isInteger(f.draftIndex) && drafts[f.draftIndex]) { drafts[f.draftIndex].done = true; drafts[f.draftIndex].rachel = true; await team.setJSON("followups", drafts); }
      list = list.slice(-500); await store.setJSON("rachel-followups", list);
    }
    if (b.action === "followup_cancel") {
      if (b.id) { const x = list.find((c) => c.id === b.id); if (x && x.status === "scheduled") { x.status = "cancelled"; await store.setJSON("rachel-followups", list); } }
      if (Number.isInteger(b.draftIndex) && drafts[b.draftIndex]) { drafts[b.draftIndex].done = true; await team.setJSON("followups", drafts); }
    }
    const pending = drafts.map((d, i) => Object.assign({ index: i }, d)).filter((d) => !d.done).slice(-40);
    return reply(200, { followups: list.slice().sort((x, y) => Date.parse(y.callAt) - Date.parse(x.callAt)).slice(0, 120), drafts: pending }, origin);
  }

  if (b.action === "callback_list" || b.action === "callback_add" || b.action === "callback_cancel") {
    let list = (await store.get("callbacks", { type: "json" })) || [];
    if (b.action === "callback_add") {
      const c = b.callback || {};
      const phone = e164(c.phone), when = Date.parse(c.callAt), st = clean(c.state, 2).toUpperCase();
      if (!phone) return reply(400, { error: "Add a valid US phone number." }, origin);
      if (!(when > Date.now() - 6e4)) return reply(400, { error: "Pick a date and time in the future." }, origin);
      if (!/^[A-Z]{2}$/.test(st)) return reply(400, { error: "Add the person's state (for their local time)." }, origin);
      if (String(c.script || "").trim().length < 10) return reply(400, { error: "Write what Alek should say (at least a sentence)." }, origin);
      list.push({ id: "cb_" + crypto.randomBytes(5).toString("hex"), name: clean(c.name, 120), business: clean(c.business, 160), phone, state: st, lineType: c.lineType === "cell" ? "cell" : "landline",
        consent: !!c.consent, callAt: new Date(when).toISOString(), subject: clean(c.subject, 160), script: String(c.script || "").replace(/[\u0000-\u0008\u000b-\u001f<>]/g, " ").trim().slice(0, 1300), lang: ["es", "pt"].includes(c.lang) ? c.lang : "en", status: "scheduled", createdAt: new Date().toISOString() });
      list = list.slice(-500);
      await store.setJSON("callbacks", list);
    }
    if (b.action === "callback_cancel") { const x = list.find((c) => c.id === b.id); if (x && x.status === "scheduled") { x.status = "cancelled"; await store.setJSON("callbacks", list); } }
    return reply(200, { callbacks: list.slice().sort((x, y) => Date.parse(x.callAt) - Date.parse(y.callAt)) }, origin);
  }

  if (b.action === "queue_get" || b.action === "queue_set") {
    const q = (await store.get("queue", { type: "json" })) || { settings: { days: ["tue", "wed", "thu"], start: "08:00", end: "09:00", start2: "13:00", end2: "14:00", tz: "America/Los_Angeles", perWindow: 25, agent: "rebecca", perMinute: 1 }, leads: [], paused: true };
    if (b.action === "queue_set") {
      const s = b.settings;
      if (s) {
        const days = (Array.isArray(s.days) ? s.days : []).filter((d) => ["mon", "tue", "wed", "thu", "fri"].includes(d));
        const hm = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")) ? String(v) : null;
        const start = hm(s.start), end = hm(s.end), start2 = hm(s.start2), end2 = hm(s.end2);
        if (!start || !end || end <= start) return reply(400, { error: "Pick a start and end time (end after start)." }, origin);
        if ((start2 || end2) && (!start2 || !end2 || end2 <= start2 || (start2 < end && end2 > start))) return reply(400, { error: "The second window needs a start and end, and can't overlap the first." }, origin);
        const tz = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"].includes(s.tz) ? s.tz : "America/New_York";
        q.settings = { days, start, end, start2: start2 || "", end2: end2 || "", tz, perWindow: Math.max(0, Math.min(300, parseInt(s.perWindow, 10) || 0)), agent: AGENTS.includes(String(s.agent || "").toLowerCase()) ? String(s.agent).toLowerCase() : "rebecca", perMinute: Number(s.perMinute) === 0.5 ? 0.5 : Math.max(1, Math.min(5, parseInt(s.perMinute, 10) || 1)) };
      }
      if (typeof b.paused === "boolean") { q.paused = b.paused; if (!b.paused) delete q.pauseReason; }
      if (b.clear === "all") q.leads = [];
      if (b.clear === "done") q.leads = q.leads.filter((l) => l.status === "queued");
      if (Array.isArray(b.add)) {
        const have = new Set(q.leads.filter((l) => l.status === "queued").map((l) => e164(l.phone)));
        for (const x of b.add.slice(0, 1000)) {
          const phone = e164(x && x.phone), st = clean(x && x.state, 2).toUpperCase();
          if (!phone || have.has(phone) || !/^[A-Z]{2}$/.test(st)) continue;
          const ag = String((x && x.agent) || "").toLowerCase();
          q.leads.push({ id: clean(x.id, 60), name: clean(x.name, 120), business: clean(x.business, 160), phone, state: st, agent: AGENTS.includes(ag) ? ag : "", lang: LANGS[x.lang] ? x.lang : "en", mode: x.mode === "floating" ? "floating" : "selling", task: String(x.task || "").replace(/[\u0000-\u0008\u000b-\u001f<>]/g, " ").trim().slice(0, 1500), findings: clean(x.findings, 900), campaign: clean(x.campaign, 120), status: "queued", addedAt: Date.now() });
          have.add(phone);
        }
        if (q.leads.length > 2000) q.leads = q.leads.slice(-2000);
      }
      await store.setJSON("queue", q);
    }
    const n = (k) => q.leads.filter((l) => l.status === k).length;
    return reply(200, { settings: q.settings, paused: !!q.paused, pauseReason: q.pauseReason || "", lastRun: q.lastRun || null, counts: { queued: n("queued"), called: n("called"), skipped: n("skipped"), error: n("error") },
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
      ,{ key: "slotsIn", body: { type: "webhook", name: "check_calendar", description: "Get Tania's open times for a 10-minute call. Use it as soon as the caller wants an appointment with Tania, before suggesting any day or time.", pre_tool_speech: "auto", execution_mode: "immediate", response_timeout_secs: 20,
          api_schema: { url: TOOLS_URL, method: "GET", query_params_schema: { properties: { action: { type: "string", constant_value: "slots" }, state: { type: "string", description: "The caller's US state as 2 letters (like NY or CA) if you know it; otherwise leave empty." } } }, authentication: auth } } }
      ,{ key: "bookIn", body: { type: "webhook", name: "book_call", description: "Book the 10-minute call on Tania's calendar after the caller picks one of the times from check_calendar. Never book a time that did not come from check_calendar.", pre_tool_speech: "auto", execution_mode: "immediate", response_timeout_secs: 25,
          api_schema: { url: TOOLS_URL, method: "POST", request_body_schema: { type: "object", properties: {
            action: { type: "string", constant_value: "book" },
            slot_id: { type: "string", description: "The exact slot_id of the time they chose, copied from check_calendar." },
            contact_name: { type: "string", description: "The caller's name." },
            practice_name: { type: "string", description: "Name of the practice, law firm or business." },
            email: { type: "string", description: "Best email for the calendar invitation, confirmed with them. Empty if they would not give one." },
            lead_phone: { type: "string", description: "The caller's best phone number, confirmed with them." },
            lead_state: { type: "string", description: "The caller's US state as 2 letters if known." },
            notes: { type: "string", description: "What they want to talk about, in one or two sentences." }
          }, required: ["slot_id"] }, authentication: auth } } }
      ,{ key: "provider", body: { type: "webhook", name: "lookup_provider", description: "Look up a doctor or attorney in the WebSwan Media Network directory: specialty, location, phone, languages, insurance, whether they take new patients or clients. Use it as soon as you know which provider the call is about, by provider code if you have one, otherwise by name.", pre_tool_speech: "auto", execution_mode: "immediate", response_timeout_secs: 15,
          api_schema: { url: TOOLS_URL, method: "POST", request_body_schema: { type: "object", properties: {
            action: { type: "string", constant_value: "provider" },
            provider_name: { type: "string", description: "The doctor's or attorney's name, or the practice name, as the caller said it." },
            provider_code: { type: "string", description: "The provider code if you were given one, like CA-0045TB (2 letters, dash, 4 digits, 2 letters). Otherwise leave empty." },
            provider_id: { type: "string", description: "The provider_id from your call details or from an earlier lookup, if you have one. Otherwise leave empty." }
          } }, authentication: auth } } }
      ,{ key: "caller", body: { type: "webhook", name: "identify_caller", description: "Find out who is calling and why: whether Monica, George, Rebecca or Alek just transferred this person to you (and about compliance or advertising), with their name and business. Use it only when the caller says they were just transferred or connected, mentions Monica, George, Rebecca or Alek, or mentions a report we sent. Never use it for regular callers.", pre_tool_speech: "off", execution_mode: "immediate", response_timeout_secs: 8,
          api_schema: { url: TOOLS_URL, method: "POST", request_body_schema: { type: "object", properties: {
            action: { type: "string", constant_value: "caller" },
            caller_id: { type: "string", dynamic_variable: "system__caller_id" }
          } }, authentication: auth } } }
      ,{ key: "client", body: { type: "webhook", name: "get_office_info", description: "Load the office you are answering for on this call: its name, greeting, hours, and the only details you may share. Call it at the very start of every call to a practice's own line.", pre_tool_speech: "off", execution_mode: "immediate", response_timeout_secs: 10,
          api_schema: { url: TOOLS_URL, method: "POST", request_body_schema: { type: "object", properties: {
            action: { type: "string", constant_value: "client" },
            called_number: { type: "string", dynamic_variable: "system__called_number" }
          } }, authentication: auth } } }
    ];
    const saved = (await store.get("tool-ids", { type: "json" })) || {};
    const tries = async (method, path, body) => { try { return await cartesia(method, path, V_READ, body); } catch (e) { if (/not found|404/i.test(e.message)) return await cartesia(method, "/v1" + path, V_READ, body); throw e; } };
    const report = { tools: {}, agents: {} };
    try {
      // Reuse tools that already exist with the same name, so running setup again never makes duplicates.
      let existing = [];
      try { const l = await tries("GET", "/agents/tools"); existing = Array.isArray(l) ? l : (l.data || l.tools || []); } catch (e) {}
      for (const d of defs) {
        if (!saved[d.key]) { const same = existing.filter((x) => x && x.name === d.body.name).sort((x, y) => String(y.updated_at || y.created_at || "").localeCompare(String(x.updated_at || x.created_at || ""))); if (same[0] && same[0].id) saved[d.key] = same[0].id; }
        if (saved[d.key]) { try { const { type, ...patch } = d.body; await tries("PATCH", "/agents/tools/" + saved[d.key], patch); report.tools[d.body.name] = "updated"; continue; } catch (e) { report.toolErrors = (report.toolErrors || []).concat(d.body.name + ": " + String(e.message || e).slice(0, 120)); delete saved[d.key]; } }
        const t = await tries("POST", "/agents/tools", d.body);
        saved[d.key] = t.id || (t.tool && t.tool.id) || ""; report.tools[d.body.name] = saved[d.key] ? "created" : "created (no id returned)";
      }
      await store.setJSON("tool-ids", saved);
    } catch (e) { return reply(502, { error: "Couldn't create the calendar tools in Cartesia: " + e.message }, origin); }
    for (const a of AGENTS.flatMap((n) => (ALLOWED_LANGS[n] || ["en"]).map((l) => agentKey(n, l)))) {
      const id = agentId(a); if (!id) continue;
      try {
        // keypad + human/voicemail rules at the top of the agent's instructions
        let ins = "";
        try { const cur = await cartesia("GET", "/v1/agents/" + encodeURIComponent(id), V_READ); ins = withPhoneRules(((cur.config || (cur.agent && cur.agent.config)) || {}).instructions || "", a.split("_")[0]); } catch (e) {}
        await cartesia("PATCH", "/v1/agents/" + encodeURIComponent(id), V_READ, { config: {
          ...(ins.length > 200 && ins.length <= 30000 ? { instructions: ins } : {}),
          tools: Object.entries(saved).filter(([k, x]) => x && TOOLSET(a.split("_")[0]).includes(k)).map(([, x]) => ({ id: x })),
          system_tools: Object.assign({ end_call: {}, send_dtmf: {}, voicemail_detection: {} }, rachelTransfers(a.split("_")[0]) ? { transfer_to_number: { pre_tool_speech: "force", transfers: rachelTransfers(a.split("_")[0]) } } : {})
        } });
        report.agents[a] = ins.length > 200 ? "connected · phone-menu & voicemail rules on" : "connected (rules not added: no script found)";
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

  // ---------- Jennifer's back office: one private profile per virtual-receptionist client ----------
  if (b.action === "client_list" || b.action === "client_set" || b.action === "client_delete" || b.action === "client_preview") {
    const list = (await store.get("clients", { type: "json" })) || [];
    if (b.action === "client_set") {
      const c = b.client || {};
      const err = [];
      const plan = CLIENT_PLANS[c.plan] ? c.plan : "";
      if (!plan) err.push("plan");
      const out = { id: /^[\w-]{6,40}$/.test(String(c.id || "")) ? String(c.id) : "cl_" + crypto.randomBytes(6).toString("hex"), plan, active: c.active !== false };
      for (const [k, max] of Object.entries(CLIENT_FIELDS)) out[k] = String(c[k] == null ? "" : c[k]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
      out.type = out.type === "attorney" ? "attorney" : "doctor";
      out.jennLine = out.jennLine ? e164(out.jennLine) : "";
      if (c.jennLine && !out.jennLine) err.push("Jennifer's line (valid US number)");
      out.notifyEmail = out.notifyEmail.toLowerCase();
      if (!out.providerName) err.push("provider name");
      if (!out.practiceName) err.push("practice name");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.notifyEmail)) err.push("notification email");
      if (out.providerCode && !/^[A-Z]{2}-\d{4}[A-Z]{2}$/.test(out.providerCode.toUpperCase())) err.push("provider code like CA-0045TB");
      out.providerCode = out.providerCode.toUpperCase();
      const words = out.script ? out.script.split(/\s+/).filter(Boolean).length : 0;
      if (words > 6000) err.push("script under 6,000 words (now " + words + ")");
      if (out.jennLine && list.some((x) => x.id !== out.id && x.jennLine === out.jennLine)) err.push("a different line (that number already belongs to another client)");
      if (err.length) return reply(400, { error: "Please fix: " + err.join(", ") + "." }, origin);
      out.updatedAt = Date.now(); out.updatedBy = email;
      const i = list.findIndex((x) => x.id === out.id);
      if (i >= 0) { out.createdAt = list[i].createdAt || Date.now(); list[i] = out; } else { out.createdAt = Date.now(); list.push(out); }
      await store.setJSON("clients", list);
      return reply(200, { ok: true, client: out, clients: list }, origin);
    }
    if (b.action === "client_delete") {
      const next = list.filter((x) => x.id !== String(b.id || ""));
      if (next.length === list.length) return reply(404, { error: "Client not found." }, origin);
      await store.setJSON("clients", next);
      return reply(200, { ok: true, clients: next }, origin);
    }
    if (b.action === "client_preview") {
      const c = list.find((x) => x.id === String(b.id || ""));
      if (!c) return reply(404, { error: "Save the client first." }, origin);
      const toolSecret = await store.get("tool-secret");
      if (!toolSecret) return reply(400, { error: "Jennifer's tools aren't set up yet." }, origin);
      if (!c.jennLine) return reply(400, { error: "Add Jennifer's line for this client to preview what she hears on a call to it." }, origin);
      const r = await fetch(TOOLS_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + toolSecret }, body: JSON.stringify({ action: "client", called_number: c.jennLine }) });
      return reply(200, { text: await r.text() }, origin);
    }
    const usage = (await store.get("jk-usage", { type: "json" })) || {}, mo = new Date().toISOString().slice(0, 7);
    const callLog = ((await store.get("jk-log", { type: "json" })) || []).slice(0, 100);
    return reply(200, { clients: list.map((c) => Object.assign({}, c, { minutesThisMonth: usage[c.id + ":" + mo] || 0 })), plans: CLIENT_PLANS, callLog }, origin);
  }

  // ---------- Jennifer Reid (WSMN Central) requests from Rachel ----------
  if (b.action === "central_list") {
    const list = (await store.get("central", { type: "json" })) || [];
    return reply(200, { requests: list.slice(0, 200).map(({ ip, ...r }) => r) }, origin);
  }

  // ---------- change one agent's voice (keeps every other audio setting) ----------
  if (b.action === "agent_voice") {
    const name = String(b.agent || "").toLowerCase(), id = AGENTS.includes(name) ? agentId(agentKey(name, LANGS[b.lang] ? b.lang : "en")) : "";
    if (!id) return reply(400, { error: "No Cartesia agent is linked for " + (b.agent || "that agent") + "." }, origin);
    if (!/^[\w-]{8,80}$/.test(String(b.voiceId || ""))) return reply(400, { error: "Pick a voice first." }, origin);
    try {
      const d = await cartesia("GET", "/v1/agents/" + encodeURIComponent(id), V_READ);
      const audio = JSON.parse(JSON.stringify((d.config || (d.agent && d.agent.config) || {}).audio || {}));
      audio.output = Object.assign({}, audio.output || {}, { voice_id: String(b.voiceId) });
      await cartesia("PATCH", "/v1/agents/" + encodeURIComponent(id), V_READ, { config: { audio } });
      return reply(200, { ok: true, agent: name, voiceId: String(b.voiceId) }, origin);
    } catch (e) { return reply(502, { error: "Cartesia: " + e.message }, origin); }
  }

  // ---------- launch readiness: test everything that can be tested without placing a call ----------
  if (b.action === "preflight") {
    const checks = [];
    const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: String(detail || "") });
    add("Cartesia key", hasKey, hasKey ? "set" : "missing");
    add("Caller-ID numbers", nums.length > 0, nums.length + " in CARTESIA_FROM_NUMBER_IDS (need 4 for outbound)");
    add("Live calling switch", liveOn(), liveOn() ? "on" : "off (set VOICE_CALLING_ENABLED=on on launch day)");
    const savedTools = (await store.get("tool-ids", { type: "json" })) || {};
    const voices = {};
    for (const a of AGENTS) {
      const id = agentId(a);
      if (!id) { add("Agent: " + a, false, "not linked"); continue; }
      try {
        const d = await cartesia("GET", "/v1/agents/" + encodeURIComponent(id), V_READ);
        const c = d.config || (d.agent && d.agent.config) || {};
        const have = new Set((c.tools || []).map((t) => t.id || t));
        const want = TOOLSET(a);
        const missing = want.filter((k) => !savedTools[k] || !have.has(savedTools[k]));
        const v = (c.audio && c.audio.output && c.audio.output.voice_id) || "";
        voices[a] = v;
        add("Agent: " + a, !missing.length && (c.instructions || "").length > 200, (d.name || id) + (missing.length ? " · missing tools: " + missing.join(", ") : " · tools OK") + " · voice " + (v ? v.slice(0, 8) : "none"));
      } catch (e) { add("Agent: " + a, false, e.message); }
    }
    const dup = Object.entries(voices).filter(([a, v]) => v && Object.entries(voices).some(([b2, w]) => b2 !== a && w === v)).map(([a]) => a);
    add("Each agent has her/his own voice", !dup.length, dup.length ? "shared by: " + dup.join(", ") : "all different");
    const toolSecret = await store.get("tool-secret");
    async function tool(body) {
      const r = await fetch(TOOLS_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + toolSecret }, body: JSON.stringify(body) });
      return { ok: r.ok, text: (await r.text()).slice(0, 300) };
    }
    if (!toolSecret) add("Jennifer directory lookup", false, "tools not set up (run agent setup)");
    else {
      const code = clean(b.testCode, 12), nm = clean(b.testName, 80) || "Colbert";
      try { const t = await tool({ action: "provider", provider_name: nm }); add("Jennifer lookup by name (" + nm + ")", t.ok && /Name:/.test(t.text), t.text.split("\n")[0]); } catch (e) { add("Jennifer lookup by name", false, e.message); }
      if (code) { try { const t = await tool({ action: "provider", provider_code: code }); add("Jennifer lookup by code (" + code + ")", t.ok && /Name:/.test(t.text), t.text.split("\n")[0]); } catch (e) { add("Jennifer lookup by code", false, e.message); } }
      try { const r = await fetch(TOOLS_URL + "?action=slots&state=CA", { headers: { Authorization: "Bearer " + toolSecret } }); const t = await r.text(); add("Booking tool: Tania's open times", r.ok && /slot_id/.test(t), t.split("\n").slice(0, 2).join(" ").slice(0, 160)); } catch (e) { add("Booking tool", false, e.message); }
    }
    const q = (await store.get("queue", { type: "json" })) || {};
    add("Auto-dial queue", true, (q.paused ? "paused" : "running") + " · " + ((q.leads || []).filter((l) => l.status === "queued").length) + " queued");
    return reply(200, { ready: checks.every((c) => c.ok), checks }, origin);
  }

  // ---------- move queued leads from one caller to another (e.g. George's attorneys -> Alek for SwanDesk AI) ----------
  if (b.action === "queue_reassign") {
    const from = String(b.from || "").toLowerCase(), to = String(b.to || "").toLowerCase();
    if (!AGENTS.includes(from) || !AGENTS.includes(to)) return reply(400, { error: "Pick two callers." }, origin);
    const q = (await store.get("queue", { type: "json" })) || { leads: [] };
    const task = String(b.task || "").replace(/[\u0000-\u0008\u000b-\u001f<>]/g, " ").trim().slice(0, 1500);
    if (to === "alek" && b.mode === "floating" && task.length < 10) return reply(400, { error: "Give Alek his script." }, origin);
    let moved = 0;
    for (const l of q.leads || []) {
      if (l.status !== "queued" || String(l.agent || "").toLowerCase() !== from) continue;
      l.agent = to; if (b.mode === "floating") { l.mode = "floating"; l.task = task; } if (b.campaign) l.campaign = String(b.campaign).slice(0, 120); moved++;
    }
    await store.setJSON("queue", q);
    return reply(200, { moved }, origin);
  }

  // ---------- SDR AI brain (Voice Studio): call reviews and script coaching, answered as JSON ----------
  // Runs here with the server's AI keys (Gemini first) instead of Firebase AI Logic in the browser.
  if (b.action === "sdr_brain") {
    const system = String(b.system || "").slice(0, 6000), task = String(b.task || "").slice(0, 8000);
    const data = JSON.stringify(b.data == null ? {} : b.data).slice(0, 30000);
    if (!task) return reply(400, { error: "Nothing to ask." }, origin);
    let lastErr = "";
    const parse = (t) => { const txt = String(t || "").replace(/^\s*```(json)?/i, "").replace(/```\s*$/, "").trim(); const i = txt.indexOf("{"), j = txt.lastIndexOf("}"); return JSON.parse(i >= 0 ? txt.slice(i, j + 1) : txt); };
    // Fast path (must finish inside Netlify's ~10 s limit): Gemini Flash-Lite, no thinking, JSON mode.
    if (process.env.GEMINI_API_KEY) {
      for (const model of ["gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-flash-latest"]) {
        try {
          const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
          const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(process.env.GEMINI_API_KEY), { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: task + "\n\nDATA:\n" + data }] }],
              generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 2000, thinkingConfig: { thinkingBudget: 0 } } }) });
          clearTimeout(tm);
          const j = await r.json().catch(() => ({}));
          if (!r.ok) { lastErr = "Gemini " + model + ": " + ((j.error && j.error.message) || r.status); continue; }
          const t = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map((x) => x.text || "").join("");
          return reply(200, { result: parse(t), provider: "gemini" }, origin);
        } catch (e) { lastErr = String(e.name === "AbortError" ? "Gemini took too long" : e.message || e).slice(0, 200); }
      }
    }
    try { const r = await askAI("deepseek", system + "\nAlways answer with valid JSON only, no markdown.", [{ role: "user", content: task + "\n\nDATA:\n" + data }], 1500); return reply(200, { result: parse(r.text), provider: r.provider }, origin); }
    catch (e) { lastErr = String(e.message || e).slice(0, 200); }
    return reply(502, { error: "The SDR brain couldn't answer: " + lastErr }, origin);
  }

  // ---------- push finished AI calls into WorkPilot's blue list right now ----------
  if (b.action === "wp_sync") {
    try { return reply(200, await runWorkpilotSync(Math.min(24 * 14, Math.max(1, Number(b.hours) || 72))), origin); }
    catch (e) { return reply(502, { error: String(e.message || e).slice(0, 300) }, origin); }
  }
  if (b.action === "wp_sync_status") return reply(200, (await store.get("wp-sync-status", { type: "json" }).catch(() => null)) || { never: true }, origin);

  // ---------- update one agent's instructions (system prompt) in Cartesia ----------
  if (b.action === "agent_prompt") {
    const name = String(b.agent || "").toLowerCase(), id = AGENTS.includes(name) ? agentId(agentKey(name, LANGS[b.lang] ? b.lang : "en")) : "";
    if (!id) return reply(400, { error: "No Cartesia agent is linked for " + (b.agent || "that agent") + "." }, origin);
    const ins = withPhoneRules(String(b.instructions || "").trim(), name);
    if (ins.length < 50 || ins.length > 30000) return reply(400, { error: "The prompt looks empty or too long." }, origin);
    try {
      await cartesia("PATCH", "/v1/agents/" + encodeURIComponent(id), V_READ, { config: { instructions: ins } });
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
    const alekNum = String(process.env.CARTESIA_ALEK_NUMBER_ID || "").trim(), camp = nums.filter((id) => id !== alekNum);
    const chosen = String(b.fromNumberId || "").trim();
    const pick = chosen && nums.includes(chosen) ? { id: chosen } : name === "alek" && alekNum ? { id: alekNum } : (camp.length ? camp : nums).map((id) => ({ id, n: counts[id] || 0 })).filter((x) => x.n < cap()).sort((a, b2) => a.n - b2.n)[0];
    if (!pick) return reply(429, { error: `Every number reached today's cap of ${cap()} calls. Try again tomorrow.` }, origin);

    const gate = await budgetGate(store, 1, 6);
    if (!gate.ok) return reply(402, { error: gate.why, budget: gate.summary }, origin);

    const metadata = { leadId: clean(b.leadId, 60), lead: clean(b.leadName, 120), business: clean(b.business, 160), campaign: clean(b.campaign, 120), by: email };
    let data;
    try {
      data = await cartesia("POST", "/agents/calls", V_CREATE, {
        agent_id: aid, from_number_id: pick.id,
        outbound_calls: [{ to_number: to, metadata, dynamic_variables: { lead_id: metadata.leadId, lead_name: metadata.lead, business: metadata.business, lead_state: clean(b.state, 2).toUpperCase(), findings: clean(b.findings, 900) || "none listed", lead_language: LANGS[lang], call_mode: name === "alek" ? MODES[mode] : "standard", task: name === "alek" && mode === "floating" ? task : "none" } }],
        ringing_timeout_seconds: 30, max_call_duration_minutes: 10
      });
    } catch (e) { return reply(502, { error: "Cartesia: " + e.message }, origin); }
    const r0 = (data.calls || [])[0] || {};
    if (!r0.agent_call_id) return reply(502, { error: "Cartesia didn't start the call: " + clean(r0.error && (r0.error.message || r0.error) || "unknown", 200) }, origin);
    counts[pick.id] = (counts[pick.id] || 0) + 1; dialed.push(to);
    await store.setJSON(countsKey, counts); await store.setJSON(dialedKey, dialed);
    await budgetRecord(store, { id: r0.agent_call_id, agent: name, by: email, maxMin: 6 });
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

  // ---------- call quality report from Cartesia's own per-turn timings ----------
  // greeting latency = end of the first person turn -> start of the agent's first audio; reply latency = the same for later turns.
  if (b.action === "latency_report") {
    const since = new Date(Number(b.since) || Date.now() - 6 * 3600e3).toISOString(), until = b.until ? new Date(Number(b.until)).toISOString() : "";
    const names = (Array.isArray(b.agents) && b.agents.length ? b.agents : ["monica", "george", "rebecca", "alek", "rachelout"]).filter((x) => AGENTS.includes(x));
    const greet = [], reply_ = [], llm = [], ttfb = [], per = []; let calls = 0, humanCalls = 0, noGreeting = 0, interruptedGreeting = 0;
    for (const n of names) { const aid = agentId(n); if (!aid) continue;
      let list = []; try { const q = new URLSearchParams({ agent_id: aid, limit: "100", start_time_gte: since }); list = ((await cartesia("GET", "/agents/calls?" + q, V_READ)).data || []).filter((c) => !until || String(c.start_time || "") < until); } catch (e) { continue; }
      for (const c0 of list) { calls++;
        let c; try { c = await cartesia("GET", "/agents/calls/" + encodeURIComponent(c0.id), V_READ); } catch (e) { continue; }
        const t = (c.transcript || []).filter((x) => x.role !== "system" || x.log_metric);
        t.forEach((x) => { if (x.log_metric && x.log_metric.name === "llm_first_text_ms") llm.push(x.log_metric.value); if (x.tts_ttfb) ttfb.push(x.tts_ttfb * 1000); });
        const turns = t.filter((x) => x.role === "user" || x.role === "assistant");
        const human = turns.find((x) => x.role === "user" && /how (can|may) i (help|assist)|speaking|this is|good (morning|afternoon)|hello|law (office|firm)|dental|chiropractic|office of/i.test(x.text || "") && !/press \d|para espa|if you know|leave a message|after the (tone|beep)|is not available|office hours|stay on the line|your call is|please hold|extension|recorded|monitored|is now closed|business hours/i.test(x.text || ""));
        if (!human) continue; humanCalls++;
        let first = true;
        for (let i = turns.indexOf(human); i < turns.length; i++) { const u = turns[i]; if (u.role !== "user") continue; const a = turns.slice(i + 1).find((x) => x.role === "assistant" && String(x.text || "").trim()); if (!a) { if (first) { noGreeting++; per.push({ agent: n, callId: c.id, issue: "no greeting after a live person" }); } break; }
          const gap = (a.start_timestamp - u.end_timestamp) * 1000; if (gap < -500 || gap > 60000) { first = false; continue; }
          (first ? greet : reply_).push(gap); if (first) { if (a.was_interrupted) interruptedGreeting++; if (gap > 3000) per.push({ agent: n, callId: c.id, issue: "greeting " + Math.round(gap) + " ms after the person finished" }); }
          first = false; }
      } }
    const st = (arr) => { const v = arr.slice().sort((x, y) => x - y); const q = (p) => v.length ? Math.round(v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))]) : null; return { n: v.length, p50: q(0.5), p95: q(0.95), max: v.length ? Math.round(v[v.length - 1]) : null, over3s: v.filter((x) => x > 3000).length }; };
    return reply(200, { since, calls, callsWithLivePerson: humanCalls, greeting: st(greet), replies: st(reply_), llmFirstText: st(llm), ttsFirstAudio: st(ttfb), noGreeting, interruptedGreeting, slowOrMissed: per.slice(0, 30) }, origin);
  }

  // ---------- what timing/event data Cartesia keeps for one call (field names and timestamps only) ----------
  if (b.action === "call_raw") {
    const id = clean(b.callId, 120); if (!/^[\w-]+$/.test(id)) return reply(400, { error: "Bad call id." }, origin);
    try { const d = await cartesia("GET", "/agents/calls/" + encodeURIComponent(id), V_READ); const t = Array.isArray(d.transcript) ? d.transcript : [];
      return reply(200, { keys: Object.keys(d), transcriptKeys: t[0] ? Object.keys(t[0]) : [], sample: t.slice(0, 6).map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== "text"))), events: d.events ? (Array.isArray(d.events) ? d.events.slice(0, 20) : Object.keys(d.events)) : null }, origin); }
    catch (e) { return reply(502, { error: "Cartesia: " + e.message }, origin); }
  }

  // ---------- Cartesia's model catalog (speed and price per model) ----------
  if (b.action === "agent_models") {
    try { const d = await cartesia("GET", "/v1/agents/models", V_READ); return reply(200, { models: d.data || d.models || d }, origin); }
    catch (e) { return reply(502, { error: "Cartesia: " + e.message }, origin); }
  }
  // ---------- switch the speaking brain (LLM) for phone agents ----------
  if (b.action === "agent_model_set") {
    const model = String(b.model || "").slice(0, 80), names = (Array.isArray(b.agents) ? b.agents : []).map((x) => String(x).toLowerCase()).filter((x) => AGENTS.includes(x));
    if (!/^[a-z0-9.\-_:\/]+$/i.test(model) || !names.length) return reply(400, { error: "Pick a model and agents." }, origin);
    const done = [];
    for (const n of names) for (const k of [n, n + "_es", n + "_pt"]) { const id = agentId(k); if (!id) continue;
      const cfg = { model: { id: model, fallback_strategy: { type: "auto" } } };
      if (b.turn) cfg.turn = { inactivity_check_in_secs: Math.max(3, Math.min(20, Number(b.turn.checkIn) || 8)), inactivity_end_call_secs: Math.max(30, Math.min(600, Number(b.turn.endCall) || 240)) };
      try { await cartesia("PATCH", "/v1/agents/" + encodeURIComponent(id), V_READ, { config: cfg }); done.push(k); } catch (e) { done.push(k + ": " + e.message.slice(0, 80)); } }
    return reply(200, { done }, origin);
  }

  // ---------- read an agent's full config (no instructions text) to check speed settings ----------
  if (b.action === "agent_raw") {
    const name = String(b.agent || "").toLowerCase(), id = AGENTS.includes(name) ? agentId(name) : "";
    if (!id) return reply(400, { error: "Unknown agent." }, origin);
    try { const d = await cartesia("GET", "/v1/agents/" + encodeURIComponent(id), V_READ); const cfg = JSON.parse(JSON.stringify(d.config || (d.agent && d.agent.config) || {})); const len = String(cfg.instructions || "").length; delete cfg.instructions; return reply(200, { instructionsChars: len, config: cfg, top: Object.keys(d) }, origin); }
    catch (e) { return reply(502, { error: "Cartesia: " + e.message }, origin); }
  }

  // ---------- a few English voices to choose from (for a new agent) ----------
  if (b.action === "voices") {
    try {
      const d = await cartesia("GET", "/voices?limit=100", V_READ);
      const list = (Array.isArray(d) ? d : d.data || []).filter((v) => !v.language || v.language === "en")
        .map((v) => ({ id: v.id, name: v.name || "", gender: v.gender || "", description: clean(v.description, 140) }));
      const want = String(b.gender || "").toLowerCase(), g = /^f/.test(want) ? /^(fem|female|woman)/ : /^m/.test(want) ? /^(masc|male|man)/ : null;
      return reply(200, { voices: (g ? list.filter((v) => g.test(String(v.gender).toLowerCase())) : list).slice(0, 40) }, origin);
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
