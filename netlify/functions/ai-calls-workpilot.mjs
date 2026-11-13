// v2 (Nov 3): needs WORKPILOT_FIREBASE_KEY on webswan-billing.
// AI calls -> WorkPilot: every 15 minutes, every finished call by Rebecca, Monica, George, Alek (outbound)
// and Rachel (inbound) becomes a row in WorkPilot's "From AI Calls (Voice Studio)" list (blue), with the agent's
// name, the outcome (Hang up, Call back, Voicemail, Talked, Email captured, Transferred to Rachel, Got Rachel's number,
// Appointment booked, Do not call),
// the summary and what the person said, so Tania can follow up herself.
// Netlify env (set by Tania): WORKPILOT_FIREBASE_KEY (same value as in webswan-lead-prospector).
import { getStore } from "@netlify/blobs";

export const config = { schedule: "*/15 * * * *" }; // every 15 minutes, all day and night, so evening and late-night calls reach WorkPilot too
const API = "https://api.cartesia.ai";
const V_READ = process.env.CARTESIA_READ_VERSION || "2026-08-14";
const PROJECT = process.env.WORKPILOT_FIREBASE_PROJECT || "webswan-marketing";
const AGENTS = [["rebecca", "Rebecca"], ["monica", "Monica"], ["george", "George"], ["alek", "Alek"], ["rachel", "Rachel"], ["rachelout", "Rachel (follow-up)"]];
const digits = (p) => String(p || "").replace(/\D/g, "").slice(-10);
// Tania's own phones: test calls to these never go to WorkPilot.
const TEST_PHONES = new Set(["4156189200", "4158770687", "5166100203"]);
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

// Phone menus ("press 1"), voicemail greetings and AI/virtual receptionists are not people: those calls stay blue in WorkPilot.
const IVR = /(press (one|two|three|four|five|six|seven|eight|nine|zero|pound|star|\d)|para espa(ñ|n)ol|listen carefully|menu (has|options) (have )?changed|menu options|dial by name|(dial|enter) (the|your) (party'?s )?extension|your call is important|please (stay on the line|hold)|all (of )?our (representatives|staff|agents)|you(?:'ve| have) reached|office (hours|is (currently )?closed)|(our|the) office is (currently )?closed|after the (tone|beep)|leave (a|your) message|mailbox|not available to take your call|record your (name|message)|state your name|google voice|the (person|party|number) you (are|have) (calling|called|dialed)|call screening|this call (may|will) be recorded|for quality (and|or) training)/i;
const BOT = /(i'?m an? (ai|automated|virtual|digital)|i am an? (ai|automated|virtual|digital)|(virtual|ai|automated|digital) (assistant|receptionist|agent)|this is an automated|answering service)/i;
const HUMAN = /(who'?s calling|who is (this|calling)|can i ask who|may i ask who|what is (this|it) (about|regarding)|what'?s this (about|regarding)|(she|he)'?s (not (in|here|available)|with a patient|busy)|the doctor (is|isn'?t)|hold on|one moment|let me (check|see|transfer|get)|not interested|we'?re (good|all set)|i'?m the (office )?manager)/i;
export const automatedOnly = (said) => { const t = String(said || ""); return !!t && (BOT.test(t) || (IVR.test(t) && !HUMAN.test(t))); };

// The agent sent them to Rachel: a live transfer, or gave Rachel's number to call ((239) 667-0151 or (347) 646-7086).
const TO_RACHEL = /transferr?ing you (over )?to rachel|transfer you (over )?to rachel|connect(ing)? you (with|to) rachel|put(ting)? you through to rachel/i;
const RACHEL_NUM = /(239|two three nine)\D{0,8}(667|six six seven)\D{0,8}(0151|zero one five one|oh one five one)|(347|three four seven)\D{0,8}(646|six four six)\D{0,8}(7086|seven zero eight six|seven oh eight six)|(316|three one six)\D{0,8}(248|two four eight)\D{0,8}(6839|six eight three nine)|rachel'?s (number|direct line|line)/i;

// Tania, Nov 11: an email only counts when the PERSON said it on the call. Voicemail greetings read their own
// address out, website names look like addresses, and the word "at" shows up inside a spoken phone number: the
// loose test used before counted all three as a capture. This is the same detector as the end-of-cycle report,
// so WorkPilot and Clara's numbers can never disagree again. It also returns the address, so it reaches the
// email field on the WorkPilot row instead of being buried in the comment.
function emailFrom(transcript) {
  const t = transcript || [];
  const REAL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  // Tania, Nov 12: a captured address must survive these or it is noise, not a lead.
  const JUNK_LOCAL = /^(abc|test|testing|example|sample|noreply|no-reply|donotreply|email|name|yourname|info@example)$/i;
  const ok = (e) => {
    e = String(e || "").replace(/[.,;:!?)]+$/, "").toLowerCase();
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return "";
    if (/\d{7,}/.test(e)) return "";                       // a phone number parsed as an address
    if (JUNK_LOCAL.test(e.split("@")[0])) return "";        // test or placeholder addresses
    if (/example\.(com|net|org)$/.test(e)) return "";
    return e;
  };
  const SPELLED = /\b[A-Za-z0-9._%+-]{2,}\s+at\s+([A-Za-z][A-Za-z0-9.-]*\.\s?[A-Za-z]{2,})\b/i;
  const GREETING = /leave a (name|message)|after the tone|you have reached|thank you for calling|currently unavailable|we have missed you|our office hours|please feel free to (visit|reach)|press \d|visit (us|the website)/i;
  for (let i = 0; i < t.length; i++) {
    if (t[i].role !== "user") continue;
    const txt = String(t[i].text || "");
    if (txt.length > 170 || GREETING.test(txt) || /www\.|https?:/i.test(txt)) continue;
    if (!t.slice(0, i).some((x) => x.role !== "user" && String(x.text || "").trim())) continue; // nothing said yet: a greeting, not an answer
    const m1 = txt.match(REAL);
    if (m1) { const e = ok(m1[0]); if (e) return e; }
    const m2 = txt.match(SPELLED);
    if (m2 && !/^\d/.test(m2[1])) { const e = ok(m2[0].replace(/\s+at\s+/i, "@").replace(/\s+/g, "")); if (e) return e; }
  }
  return "";
}

function outcome(c, said, booked, agentSaid = "", email = "") {
  const secs = c.start_time && c.end_time ? (new Date(c.end_time) - new Date(c.start_time)) / 1000 : 0;
  const end = String(c.end_reason || c.status || "");
  const t = said.toLowerCase(), all = (said + " " + (c.summary || "")).toLowerCase();
  if (booked) return "Appointment booked";
  if (/don'?t call|do not call|remove (me|us|our)|take (me|us) off|stop calling/.test(t)) return "Do not call";
  if (/voicemail/.test(end)) return "Voicemail";
  if (automatedOnly(said)) return /leave (a|your) message|mailbox|after the (tone|beep)|not available to take your call/i.test(said) ? "Voicemail" : "Automated (no human)";
  if (/no_answer|busy|failed/.test(end) && !said) return "No answer";
  // Green in WorkPilot: sent to Rachel (transfer or her number), with the email if they gave one too.
  const gaveEmail = !!email;
  if (said && TO_RACHEL.test(agentSaid)) return gaveEmail ? "Transferred to Rachel · Email captured" : "Transferred to Rachel";
  if (said && RACHEL_NUM.test(agentSaid)) return gaveEmail ? "Got Rachel's number · Email captured" : "Got Rachel's number";
  if (/call (me |us )?back|callback|call later|try (again|later)|not (in|available) (right now|today)|out of the office/.test(all)) return "Call back";
  // Interest: they asked for info, price or a demo, or said yes to it (not "not interested").
  const interested = !/not interested|no thank|no, thank|we'?re (good|all set|fine)/.test(t) && /\binterested\b|sounds (good|great|interesting)|tell me more|send (me|it|us|over)|how much|what('?s| is| are) the (price|cost|fee)|pricing|\bdemo\b|sign (me|us) up|let'?s do it|i'?d like to (know|learn|see|hear)/.test(t);
  if (gaveEmail) return interested ? "Email captured (interested)" : "Email captured";
  if (interested) return "Interested";
  const turns = (c.transcript || []).filter((x) => x.role === "user" && x.text).length;
  if (secs < 30 || turns <= 2) return "Hang up";
  return "Talked";
}

export default async () => new Response(JSON.stringify(await runWorkpilotSync()));

// Also run on demand from Voice Studio ("Sync AI calls to WorkPilot now"), with the real error if it fails.
export async function runWorkpilotSync(hours) {
  const key = String(process.env.WORKPILOT_FIREBASE_KEY || "").trim().replace(/^["']|["']$/g, ""), ck = process.env.CARTESIA_API_KEY;
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
    let calls = [], ok = false;
    for (const from of [new Date(Date.now() - 3 * 3600e3).toISOString(), since]) { // newest calls first, so a busy day never cuts them off
      const qs = new URLSearchParams({ agent_id: aid, limit: "100", expand: "transcript", start_time_gte: from });
      const r = await fetch(API + "/agents/calls?" + qs, { headers: { "Authorization": "Bearer " + ck, "X-API-Key": ck, "Cartesia-Version": V_READ } });
      if (!r.ok) { lastErr = "Cartesia " + r.status + " for " + label; continue; }
      ok = true; const seen = new Set(calls.map((x) => x.id || x.agent_call_id));
      for (const x of ((await r.json()).data || [])) if (!seen.has(x.id || x.agent_call_id)) calls.push(x);
    }
    if (!ok) continue;
    for (const c of calls) {
      const id = c.id || c.agent_call_id;
      if (!id || done.has(id)) continue;
      if (!c.end_time && !/ended|completed|failed/i.test(String(c.status || ""))) continue; // still in progress
      const tp = c.telephony_params || {}, md = c.metadata || {};
      const inbound = a === "rachel";
      const other = inbound ? (tp.from || c.from) : (tp.to || c.to);
      if (TEST_PHONES.has(digits(other))) { done.add(id); continue; } // Tania's test call
      const lead = byPhone.get(digits(other)) || {};
      const said = (c.transcript || []).filter((x) => x.role === "user" && x.text).map((x) => x.text).join(" ").trim();
      if (inbound && !said) { done.add(id); continue; } // empty inbound ring
      const agentSaid = (c.transcript || []).filter((x) => x.role !== "user" && x.text).map((x) => x.text).join(" ");
      const booked = bookings.find((b) => b.callId === id);
      const email = (booked && booked.email) || emailFrom(c.transcript);
      const out = outcome(c, said, booked, agentSaid, email);
      if (out === "Do not call") { done.add(id); continue; } // Tania doesn't want do-not-call leads in WorkPilot
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
        email,
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
  const st = { at: new Date().toISOString(), ok: !errors, sent, errors, error: lastErr, keyHint: key.slice(0, 10) + "… (" + key.length + " characters)" };
  await s.setJSON("wp-sync-status", st);
  return st;
}
