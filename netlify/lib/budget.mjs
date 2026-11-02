// WebSwan Voice Studio: monthly call budget (dollar-based).
// Every function that starts a Cartesia call asks budgetGate() first and calls budgetRecord() after.
// A scheduled job (voice-usage) and the Usage page call budgetSync() to pull real durations from Cartesia,
// including calls nobody placed from Voice Studio (inbound calls to Rachel or Jennifer, or calls started in Cartesia itself).
//
// Safety rule: a call that hasn't finished yet is counted at its MAXIMUM possible cost (its max length),
// so calls already in progress can never push the month over the stop line.
import { getStore } from "@netlify/blobs";

const API = "https://api.cartesia.ai";
const V_READ = process.env.CARTESIA_READ_VERSION || "2026-08-14";

// Rates are per minute. All stop/warning lines are in DOLLARS, so a price change only needs new rates here.
export const BUDGET_DEFAULTS = {
  budgetUsd: 49,       // Startup plan prepaid agent balance
  agentRate: 0.06,     // Cartesia agent call duration
  phoneRate: 0.014,    // Cartesia-provided phone number
  llmRate: 0,          // free for UI-created agents for now; set it if Cartesia starts charging
  warn1Usd: 37,        // about 500 minutes at $0.074
  warn2Usd: 44.4,      // about 600 minutes
  stopUsd: 48.1,       // about 650 minutes: no new calls past this line
  roundUp: true,       // bill each call as whole minutes (safer); switch off if Cartesia bills by the second
  cycleDay: 1          // day of the month the Cartesia billing cycle starts
};
const NUM = { budgetUsd: [1, 5000], agentRate: [0, 2], phoneRate: [0, 2], llmRate: [0, 2], warn1Usd: [0, 5000], warn2Usd: [0, 5000], stopUsd: [1, 5000], cycleDay: [1, 28] };

export const budgetStore = () => getStore({ name: "voice-studio", consistency: "strong" });
const r2 = (n) => Math.round(n * 100) / 100;

export function sanitizeBudget(s) {
  const out = Object.assign({}, BUDGET_DEFAULTS);
  for (const [k, [lo, hi]] of Object.entries(NUM)) {
    const v = Number(s && s[k]);
    if (s && s[k] !== undefined && s[k] !== "" && isFinite(v)) out[k] = Math.min(hi, Math.max(lo, k === "cycleDay" ? Math.round(v) : v));
  }
  if (s && typeof s.roundUp === "boolean") out.roundUp = s.roundUp;
  if (out.stopUsd > out.budgetUsd) out.stopUsd = out.budgetUsd;
  if (out.warn2Usd > out.stopUsd) out.warn2Usd = out.stopUsd;
  if (out.warn1Usd > out.warn2Usd) out.warn1Usd = out.warn2Usd;
  return out;
}
export const ratePerMin = (s) => s.agentRate + s.phoneRate + s.llmRate;

// Current billing cycle start (YYYY-MM-DD, Pacific time).
export function cycleId(s, d = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(d).split("-").map(Number);
  let [y, m] = p; const day = p[2];
  if (day < s.cycleDay) { m -= 1; if (m < 1) { m = 12; y -= 1; } }
  return `${y}-${String(m).padStart(2, "0")}-${String(s.cycleDay).padStart(2, "0")}`;
}

export async function loadBudget(store) {
  const settings = sanitizeBudget(await store.get("budget-settings", { type: "json" }).catch(() => null));
  const cycle = cycleId(settings);
  const ledger = (await store.get("usage-" + cycle, { type: "json" }).catch(() => null)) || { cycle, calls: {}, syncedAt: 0, overrides: [] };
  return { settings, cycle, ledger };
}
const saveLedger = (store, L) => store.setJSON("usage-" + L.cycle, L);

function minutesFor(c, s) {
  if (c.done) { const m = (c.secs || 0) / 60; return s.roundUp ? Math.ceil(m - 1e-9) : m; }
  // still ringing or talking: assume the worst (its max length), or longer if it has somehow run past it
  const elapsed = c.placedAt ? (Date.now() - c.placedAt) / 60000 : 0;
  return Math.max(c.maxMin || 6, Math.ceil(elapsed));
}

export function budgetSummary(B) {
  const { settings: s, ledger: L } = B, rate = ratePerMin(s);
  const counts = { placed: 0, inbound: 0, answered: 0, unanswered: 0, voicemail: 0, booked: 0, inProgress: 0 };
  let doneMin = 0, pendMin = 0;
  for (const c of Object.values(L.calls)) {
    if (c.dir === "in") counts.inbound++; else counts.placed++;
    if (!c.done) { counts.inProgress++; pendMin += minutesFor(c, s); continue; }
    doneMin += minutesFor(c, s);
    if (c.outcome && counts[c.outcome] !== undefined) counts[c.outcome]++;
    if (c.booked) counts.booked++;
  }
  const extra = (L.overrides || []).reduce((n, o) => n + (Number(o.usd) || 0), 0);
  const spentUsd = r2(doneMin * rate), pendingUsd = r2(pendMin * rate), stopAt = r2(s.stopUsd + extra);
  const committed = spentUsd + pendingUsd;
  const level = committed >= stopAt ? "stopped" : committed >= s.warn2Usd + extra ? "warn2" : committed >= s.warn1Usd + extra ? "warn1" : "ok";
  return {
    cycle: L.cycle, rate: r2(rate * 1000) / 1000, minutes: Math.round(doneMin * 10) / 10, pendingMinutes: pendMin,
    spentUsd, pendingUsd, committedUsd: r2(committed), stopAt, extraUsd: r2(extra), level,
    minutesLeft: Math.max(0, Math.floor((stopAt - committed) / rate)),
    warn1Min: Math.round(s.warn1Usd / rate), warn2Min: Math.round(s.warn2Usd / rate), stopMin: Math.round(stopAt / rate),
    counts, costPerBooked: counts.booked ? r2(spentUsd / counts.booked) : null,
    overrides: (L.overrides || []).slice(-10), syncedAt: L.syncedAt || 0
  };
}

// Can we start `n` more calls of up to `maxMin` minutes each? Counts finished calls at their real cost
// and every unfinished call at its maximum cost.
export async function budgetGate(store, n = 1, maxMin = 6) {
  const B = await loadBudget(store), S = budgetSummary(B), add = n * maxMin * ratePerMin(B.settings);
  const ok = S.committedUsd + add <= S.stopAt + 1e-9;
  return { ok, summary: S, allowance: Math.max(0, Math.floor((S.stopAt - S.committedUsd) / (maxMin * ratePerMin(B.settings)) + 1e-9)),
    why: ok ? "" : `Monthly call budget reached: $${S.committedUsd.toFixed(2)} used or reserved of the $${S.stopAt.toFixed(2)} stop line. New calls are paused until next cycle or until Tania approves more.` };
}

export async function budgetRecord(store, info) {
  if (!info || !info.id) return;
  try {
    const B = await loadBudget(store);
    if (!B.ledger.calls[info.id]) {
      B.ledger.calls[info.id] = { id: info.id, dir: "out", agent: info.agent || "", by: info.by || "", placedAt: Date.now(), maxMin: info.maxMin || 6, done: false };
      await saveLedger(store, B.ledger);
    }
  } catch (e) { /* the sync job will still find the call through Cartesia */ }
}

const VM = /voice ?mail|leave (a|your) (message|name)|after the (tone|beep)|mailbox|answering machine|record your message|not available.{0,40}message/i;
const NOANS = /no[_ -]?answer|unanswer|not[_ -]?answer|busy|fail|reject|cancel|timeout|unreachable/i;
function classify(c, bookedIds) {
  const t = c.telephony_params || {};
  const start = Date.parse(c.start_time || ""), end = Date.parse(c.end_time || "");
  const status = String(c.status || ""), why = String(c.end_reason || "");
  const done = !!c.end_time || /complet|ended|finish|fail|busy|no[_ -]?answer|cancel|error/i.test(status);
  const secs = isFinite(start) && isFinite(end) && end > start ? Math.round((end - start) / 1000) : 0;
  const tr = Array.isArray(c.transcript) ? c.transcript : [];
  const userTurns = tr.filter((x) => x && x.role === "user" && String(x.text || "").trim()).length;
  const text = [why, c.summary || "", ...tr.map((x) => (x && x.text) || "")].join(" ");
  let outcome = "answered";
  if (VM.test(text)) outcome = "voicemail";
  else if (NOANS.test(status + " " + why) || (!userTurns && secs < 8)) outcome = "unanswered";
  const id = c.id || c.agent_call_id || "";
  return { done, secs, outcome, booked: bookedIds.has(id), status, endReason: why.slice(0, 80), to: t.to || "", from: t.from || "",
    dir: t.direction === "inbound" || /inbound/i.test(String(c.direction || "")) ? "in" : null };
}

async function cartesiaGet(path) {
  const r = await fetch(API + path, { headers: { "Authorization": "Bearer " + process.env.CARTESIA_API_KEY, "X-API-Key": process.env.CARTESIA_API_KEY, "Cartesia-Version": V_READ } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(String(d.message || d.error || "Cartesia " + r.status).slice(0, 200));
  return d;
}

// Pull finished-call durations from Cartesia and pick up calls placed outside Voice Studio.
export async function budgetSync(store, agentIds) {
  if (!process.env.CARTESIA_API_KEY) return { ok: false, why: "no key" };
  const B = await loadBudget(store), L = B.ledger;
  const bookedIds = new Set(((await store.get("bookings", { type: "json" }).catch(() => null)) || []).map((x) => x.callId).filter(Boolean));
  const cycleStart = Date.parse(L.cycle + "T00:00:00-08:00");
  const since = Math.max(cycleStart, (L.syncedAt || 0) - 30 * 60000);
  let errors = 0;
  const apply = (c, agentName) => {
    const id = c.id || c.agent_call_id; if (!id) return;
    const placed = Date.parse(c.start_time || c.created_at || "") || Date.now();
    if (placed < cycleStart) return;
    const k = classify(c, bookedIds), old = L.calls[id];
    L.calls[id] = Object.assign(old || { id, dir: k.dir || "in", agent: agentName, by: "outside Voice Studio", placedAt: placed, maxMin: 10 },
      { done: k.done, secs: k.secs, outcome: k.outcome, booked: k.booked, status: k.status, endReason: k.endReason }, k.dir ? { dir: k.dir } : {});
  };
  // 1. finish the calls we know about
  for (const c of Object.values(L.calls).filter((x) => !x.done).slice(0, 40)) {
    try { apply(await cartesiaGet("/agents/calls/" + encodeURIComponent(c.id)), c.agent); } catch (e) { errors++; }
  }
  // 2. anything new on each agent since the last sync (inbound calls, calls started in Cartesia)
  for (const [name, aid] of Object.entries(agentIds || {})) {
    if (!aid) continue;
    try {
      const q = new URLSearchParams({ agent_id: aid, limit: "100", expand: "transcript", start_time_gte: new Date(since).toISOString() });
      const d = await cartesiaGet("/agents/calls?" + q.toString());
      for (const c of d.data || []) apply(c, name);
    } catch (e) { errors++; }
  }
  // 3. bookings that came in after a call finished
  for (const c of Object.values(L.calls)) if (!c.booked && bookedIds.has(c.id)) c.booked = true;
  L.syncedAt = Date.now();
  await saveLedger(store, L);
  return { ok: true, errors };
}

// Agent IDs from Netlify env vars plus the ones created from Voice Studio.
export async function allAgentIds(store) {
  const extra = (await store.get("agent-ids", { type: "json" }).catch(() => null)) || {};
  const out = Object.assign({}, extra);
  for (const [k, v] of Object.entries(process.env)) { const m = k.match(/^CARTESIA_AGENT_([A-Z_]+)$/); if (m && v) out[m[1].toLowerCase()] = v; }
  return out;
}
