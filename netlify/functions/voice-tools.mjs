// WebSwan Voice Studio: tools Rebecca (or any Cartesia agent) can use during a live call.
//   GET  ?action=slots&state=NY  -> a few open times on Tania's calendar, said in the lead's time zone
//   POST {action:"book", ...}    -> book one onboarding on Tania's calendar (checked again right before booking)
// Only Cartesia can call this: every request must carry the tool secret that Voice Studio created
// (saved in Netlify Blobs, never in code). Nothing here can read or change anything else.
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { emailPractice, e164 } from "../lib/central.mjs";
import { sanitizeCal, callScript, openSlots, pickChoices, say, slotAllowed, busyWindow, tzFor } from "../lib/cal.mjs";

const text = (s, status = 200) => new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

function sameSecret(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length > 20 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

export default async (req) => {
  const store = getStore({ name: "voice-studio", consistency: "strong" });
  const secret = await store.get("tool-secret");
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || !sameSecret(given, secret)) return text("Not allowed.", 401);

  const url0 = new URL(req.url);
  let b0 = {};
  if (req.method === "POST") { try { b0 = await req.clone().json(); } catch (e) { b0 = {}; } }
  if ((b0.action || url0.searchParams.get("action")) === "client") return text(await clientInfo(store, b0.called_number || url0.searchParams.get("called_number") || ""));
  if ((b0.action || url0.searchParams.get("action")) === "provider") return text(await providerLookup(b0.provider_name || url0.searchParams.get("provider_name") || "", b0.provider_id || url0.searchParams.get("provider_id") || "", b0.provider_code || url0.searchParams.get("provider_code") || ""));

  if ((b0.action || url0.searchParams.get("action")) === "wsmn_request") return text(await wsmnRequest(store, b0));
  if ((b0.action || url0.searchParams.get("action")) === "caller") return text(await callerBrief(store, b0.caller_id || url0.searchParams.get("caller_id") || ""));
  if ((b0.action || url0.searchParams.get("action")) === "heads_up") return text(await taniaHeadsUp(store, b0));

  const cal = sanitizeCal(await store.get("calendar", { type: "json" }));
  const calSecret = await store.get("cal-secret");
  const url = new URL(req.url);
  let b = {};
  if (req.method === "POST") { try { b = await req.json(); } catch (e) { b = {}; } }
  const action = b.action || url.searchParams.get("action") || "";
  const leadTz = tzFor(b.lead_state || url.searchParams.get("state") || url.searchParams.get("lead_state") || "");

  if (!cal.scriptUrl || !calSecret) return text("The calendar isn't connected, so don't offer specific times. Tell them Tania will email them a link to pick a time, and confirm their best email.");

  const now = new Date();
  let busy;
  try { busy = (await callScript(cal, calSecret, Object.assign({ action: "busy" }, busyWindow(cal, now)))).busy; }
  catch (e) { return text("The calendar can't be reached right now. Don't promise a time. Tell them Tania will email them a link to pick a time, and confirm their best email."); }

  if (action === "slots") {
    const choices = pickChoices(openSlots(cal, busy, now), leadTz);
    if (!choices.length) return text("Tania has no open times in the next few days. Tell them Tania will email them a link to pick a time, and confirm their best email.");
    return text("Tania's open times for a 10-minute onboarding call (offer two or three, never all at once):\n" +
      choices.map((s) => `- ${say(s, leadTz)} (slot_id: ${s.toISOString()})`).join("\n") +
      "\nWhen they choose, call book_appointment with that exact slot_id.");
  }

  if (action === "book") {
    const start = new Date(clean(b.slot_id, 40));
    const again = () => { const c = pickChoices(openSlots(cal, busy, now), leadTz); return c.length ? " Offer one of these instead: " + c.slice(0, 3).map((s) => `${say(s, leadTz)} (slot_id: ${s.toISOString()})`).join("; ") + "." : " Tell them Tania will email a link to pick a time."; };
    if (isNaN(start)) return text("That slot_id isn't valid. Call check_availability again and use an exact slot_id.");
    if (!slotAllowed(cal, busy, start, now)) return text("That time is no longer open on Tania's calendar." + again());
    const name = clean(b.contact_name, 100), practice = clean(b.practice_name || b.business, 160), email = clean(b.email, 160).toLowerCase(), phone = clean(b.lead_phone, 30), note = clean(b.notes, 500);
    const end = new Date(start.getTime() + cal.minutes * 60e3);
    const desc = [
      "Booked by the WebSwan AI assistant during a phone call.",
      practice && "Practice: " + practice, name && "Contact: " + name, phone && "Phone: " + phone, email && "Email: " + email,
      "Their time zone: " + leadTz, note && "Notes: " + note, b.call_id && "Call ID: " + clean(b.call_id, 80)
    ].filter(Boolean).join("\n");
    try {
      const r = await callScript(cal, calSecret, { action: "create", start: start.toISOString(), end: end.toISOString(), title: cal.title + (practice ? " · " + practice : ""), description: desc, email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : "" });
      const list = (await store.get("bookings", { type: "json" })) || [];
      list.unshift({ at: Date.now(), start: start.toISOString(), name, practice, email, phone, leadTz, leadId: clean(b.lead_id, 60), callId: clean(b.call_id, 80), eventId: r.id || "" });
      await store.setJSON("bookings", list.slice(0, 300));
    } catch (e) { return text("Booking didn't go through. Don't confirm a time. Tell them Tania will email them a link to pick a time, and confirm their best email."); }
    return text(`Booked: ${say(start, leadTz)}. Tania will call them then.` + (email ? ` A calendar invitation is being emailed to ${email}.` : " Ask for their best email so Tania can send the invitation.") + " Confirm the day and time back to them.");
  }

  return text("Unknown action.", 400);
};

// ---------- Jennifer: look up a doctor or attorney in the WebSwan Media Network directory ----------
// Reads only ACTIVE public listings from Firestore (project webswan-marketing), the same data anyone sees on
// ads.webswanmedianetwork.com. Never returns the provider's private email.
const FS = "https://firestore.googleapis.com/v1/projects/webswan-marketing/databases/(default)/documents";
const FS_KEY = "AIzaSyAqhqUzWqpS7YunkODJU_udTBG3pjsJegQ"; // public web key (same as the site); access is limited by Firestore rules
function fsVal(v) {
  if (!v) return "";
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fsVal);
  return "";
}
function fsDoc(d) { const o = { id: String(d.name || "").split("/").pop() }; for (const [k, v] of Object.entries(d.fields || {})) o[k] = fsVal(v); return o; }
const norm2 = (s) => String(s || "").toLowerCase().replace(/\b(dr|doctor|attorney|atty|esq|md|do|dds|dc)\b\.?/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
async function providerLookup(name, id, code) {
  code = String(code || "").toUpperCase().replace(/\s+/g, "");
  try {
    let list = [];
    if (id && /^[\w-]{4,60}$/.test(id)) {
      const r = await fetch(FS + "/providers/" + encodeURIComponent(id) + "?key=" + FS_KEY);
      if (r.ok) list = [fsDoc(await r.json())];
    } else {
      const r = await fetch(FS + ":runQuery?key=" + FS_KEY, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "providers" }], where: { fieldFilter: { field: { fieldPath: "active" }, op: "EQUAL", value: { booleanValue: true } } }, limit: 500 } }) });
      if (!r.ok) throw new Error("directory " + r.status);
      const all = (await r.json()).filter((x) => x.document).map((x) => fsDoc(x.document));
      const c = /^[A-Z]{2}-?\d{4}[A-Z]{2}$/.test(code) ? (code.includes("-") ? code : code.slice(0, 2) + "-" + code.slice(2)) : "";
      if (c) list = all.filter((p) => String(p.code || "").toUpperCase() === c);
      if (!list.length) {
        const want = norm2(name);
        if (!want) return c ? "No provider has the code " + c + ". Ask for the doctor's or attorney's name and look them up again." : "Ask the caller which doctor or attorney they are calling about, then look them up again with that name.";
        const words = want.split(" ").filter((w) => w.length > 1);
        list = all.map((p) => { const hay = norm2([p.name, p.practice].join(" ")); return { p, score: words.filter((w) => hay.includes(w)).length }; })
          .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.p);
      }
    }
    return formatProviders(list);
  } catch (e) {
    return "The directory can't be reached right now. Don't guess any details. Take the caller's name, number and reason for calling, and say the office will follow up.";
  }
}
function formatProviders(list) {
  list = list.filter((p) => p && p.active !== false);
  if (!list.length) return "That provider isn't listed in the WebSwan Media Network directory. Don't guess any details. Take the caller's name, number and reason for calling, and say the office will follow up.";
  const one = (p) => [
    `Name: ${p.name}${p.credentials ? ", " + p.credentials : ""} (${p.type === "attorney" ? "attorney" : "doctor"})`,
    p.code && `Provider code: ${p.code}`,
    p.practice && `Practice or firm: ${p.practice}`,
    Array.isArray(p.specialties) && p.specialties.length && `Specialties: ${p.specialties.join(", ")}`,
    (p.address || p.city) && `Location: ${[p.address, p.city, p.state, p.zip].filter(Boolean).join(", ")}`,
    p.serviceAreas && `Also serves: ${p.serviceAreas}`,
    p.phone && `Office phone: ${p.phone}`,
    p.officeHours && `Office hours: ${p.officeHours}`,
    p.languages && `Languages: ${p.languages}`,
    p.insurance && `Insurance or fees: ${p.insurance}`,
    p.accepting === false ? "Not accepting new patients or clients right now." : "Accepting new patients or clients.",
    p.telehealth && "Offers telehealth or virtual visits.",
    p.freeConsult && "Offers a free consultation.",
    p.eveningWeekend && "Has evening or weekend hours.",
    p.yearsLicensed && `Years licensed: ${p.yearsLicensed}`,
    p.reviewRating && `Reviews: ${p.reviewRating} stars${p.reviewCount ? " from " + p.reviewCount + " reviews" : ""}${p.reviewSource ? " on " + p.reviewSource : ""}`,
    p.portalUrl && `Secure patient/client portal: ${p.portalUrl}. For forms, history or any personal details, tell them to use the portal button on the practice's WebSwan Media Network profile or the practice website. Never take those details yourself.`,
    p.bookingUrl && `Online booking page: ${p.bookingUrl} (you may tell them they can also book online on the practice's website)`,
    p.website && `Website: ${p.website}`,
    p.bio && `About: ${String(p.bio).slice(0, 500)}`,
    `provider_id: ${p.id}`
  ].filter(Boolean).join("\n");
  return (list.length > 1 ? "More than one match. Confirm with the caller which one they mean:\n\n" : "") + list.map(one).join("\n\n") +
    "\n\nShare only what is listed here. Never discuss symptoms, medical conditions, injuries or legal case details, and never give medical or legal advice. If something isn't listed (like exact office hours), say the office will confirm."
}

// ---------- Jennifer Kennedy: the office profile for the line that was dialed ----------
// Matched ONLY by the number the caller dialed (system__called_number), so Jennifer can never load another practice.
// Plan rules are enforced here: on the $299 basic plan she receives name, practice, phone, hours, greeting and script only.
async function clientInfo(store, called) {
  let d = String(called || "").replace(/\D/g, ""); if (d.length === 10) d = "1" + d;
  const num = /^1\d{10}$/.test(d) ? "+" + d : "";
  if (!num) return "No office is connected to this call. Say: \"Thank you for calling, this is Jennifer.\" Take the caller's name, number and message, and say the office will call them back.";
  const list = (await store.get("clients", { type: "json" })) || [];
  const c = list.find((x) => x.jennLine === num && x.active !== false);
  if (!c) return "This line isn't connected to an active office yet. Say: \"Thank you for calling, this is Jennifer.\" Take the caller's name, number and message, and say the office will call them back.";
  const full = c.plan === "wsmn69_399" || c.plan === "wsmn149_299" || c.plan === "full499";
  const L = [
    "OFFICE YOU ARE ANSWERING FOR (use only this; never mention any other practice):",
    `Provider: ${c.providerName} (${c.type === "attorney" ? "attorney" : "doctor"})`,
    `Practice: ${c.practiceName}`,
    c.officePhone && `Office phone: ${c.officePhone}`,
    c.hours && `Hours of operation: ${c.hours}`,
    `Greeting to use: ${c.greeting || `Thank you for calling ${c.practiceName}, this is Jennifer. This call may be recorded. How can I help you today?`}`
  ];
  if (full) L.push(
    c.address && `Address: ${c.address}`,
    c.website && `Website: ${c.website}`,
    c.specialties && `Specialties: ${c.specialties}`,
    c.yearsInBusiness && `In business: ${c.yearsInBusiness}`,
    c.reviews && `Reviews: ${c.reviews}`,
    c.insurance && `Insurance accepted: ${c.insurance}`,
    c.cashPay && `Cash / self-pay: ${c.cashPay}`,
    c.consultation && `Consultations: ${c.consultation}`
  );
  L.push(full
    ? "YOUR ROLE: Answer questions using only the details above and the office script below, and push for an appointment."
    : "YOUR ROLE: You are the appointment setter only. You may give the practice name, phone and hours, book or request an appointment, and take a message. For any other question, say: \"The office will be happy to answer that. Let me take your name and number so they can call you back.\"");
  if (c.script) L.push("OFFICE SCRIPT AND INSTRUCTIONS:\n" + c.script);
  L.push("Never give medical or legal advice, never discuss symptoms or case details, and follow your emergency protocol.");
  return L.filter(Boolean).join("\n");
}

// ---------- Rachel Bennett (phone): a caller wants a WebSwan Media Network doctor or attorney to contact them ----------
// Same path as the website: Jennifer Reid emails that practice the caller's request (name, phone, email, best time).
// The caller must agree to share their details. No medical or legal details are taken.

// Rachel's heads-up: who is calling and why. Works for transfers from Monica, George, Rebecca or Alek
// (looks at their calls from the last few minutes) and for people they called earlier who call back.
const OUR_LINES = ["6812936217", "2512946344", "9783818982", "3162486839"];
const AGENT_TOPIC = { monica: ["Monica", "website compliance (ADA, privacy, HIPAA) for a medical practice"], george: ["George", "website compliance (ADA, privacy, attorney advertising rules) for a law firm"], rebecca: ["Rebecca", "WebSwan Media Network advertising"], alek: ["Alek", "WebSwan follow-up"] };
async function callerBrief(store, callerRaw) {
  const d10 = (x) => String(x || "").replace(/\D/g, "").slice(-10);
  const caller = d10(callerRaw);
  const ck = process.env.CARTESIA_API_KEY;
  const ids = (await store.get("agent-ids", { type: "json" }).catch(() => null)) || {};
  const q = (await store.get("queue", { type: "json" }).catch(() => null)) || { leads: [] };
  const lead = caller && (q.leads || []).find((l) => d10(l.phone) === caller);
  let best = null;
  if (ck) {
    const since = new Date(Date.now() - 4 * 3600e3).toISOString();
    for (const a of Object.keys(AGENT_TOPIC)) {
      const aid = process.env["CARTESIA_AGENT_" + a.toUpperCase()] || ids[a];
      if (!aid) continue;
      try {
        const r = await fetch("https://api.cartesia.ai/agents/calls?" + new URLSearchParams({ agent_id: aid, limit: "40", start_time_gte: since }), { headers: { "Authorization": "Bearer " + ck, "X-API-Key": ck, "Cartesia-Version": process.env.CARTESIA_READ_VERSION || "2026-08-14" } });
        if (!r.ok) continue;
        for (const c of ((await r.json()).data || [])) {
          const tp = c.telephony_params || {}, to = d10(tp.to || c.to);
          const t = new Date(c.end_time || c.start_time || 0).getTime();
          const live = !c.end_time;
          const matchLead = caller && to === caller;
          const transfer = /transfer/i.test(String(c.end_reason || c.status || "")) || (live && (Date.now() - t) < 15 * 60e3);
          const fresh = Date.now() - t < 5 * 60e3;
          const score = (matchLead ? 3 : 0) + (transfer && fresh ? 2 : 0) + (fresh ? 1 : 0);
          if (score >= 2 && (!best || score > best.score || (score === best.score && t > best.t))) best = { a, c, t, score, to };
        }
      } catch (e) { /* ignore */ }
    }
  }
  if (!best && !lead) return OUR_LINES.includes(caller) ? "This looks like a transfer from one of our calling agents, but the details aren't available. Greet warmly, say you'll be happy to help, and ask what they'd like to know about the report or the advertising." : "Regular caller: no recent call from our agents. Greet normally.";
  const L = best ? (q.leads || []).find((l) => d10(l.phone) === best.to) || lead || {} : lead;
  const md = (best && best.c.metadata) || {};
  const [who, topic] = best ? AGENT_TOPIC[best.a] : ["one of our agents", String(L.campaign || "")];
  const kind = /media|advert|rebecca/i.test((best ? best.a : "") + " " + (L.campaign || "")) ? "advertising" : "compliance";
  const name = L.name || md.lead || "", biz = L.business || md.business || "";
  const findings = String(L.findings || "").slice(0, 500);
  return [
    `HEADS-UP: this is ${best && best.score >= 4 ? "a transfer" : "most likely a transfer or call-back"} from ${who} (${topic}).`,
    name && `Person: ${name}`, biz && `Business: ${biz}`, findings && `What ${who} told them about: ${findings}`,
    kind === "compliance"
      ? `Greet like this: "Hi${name ? " " + name.split(" ")[0] : ""}, this is Rachel. ${who} told me you have a few questions about the website compliance report${biz ? " for " + biz : ""}. How can I help?" Then answer, and book a 10 to 15 minute review appointment with Tania.`
      : `Greet like this: "Hi${name ? " " + name.split(" ")[0] : ""}, this is Rachel. ${who} told me you'd like to hear more about getting ${biz || "your practice"} in front of more patients and clients. How can I help?" Then answer, and book a 10 to 15 minute demo with Tania.`
  ].filter(Boolean).join("\n");
}

async function wsmnRequest(store, b) {
  const id = clean(b.provider_id, 60), name = clean(b.caller_name, 80), email = clean(b.caller_email, 120).toLowerCase();
  const phone = e164(b.caller_phone || b.system__caller_number || "");
  if (b.consent !== true && String(b.consent).toLowerCase() !== "true") return "First ask: 'May I share your name and number with the office so they can contact you?' Only call this again if they say yes, with consent true.";
  if (!/^[\w-]{4,60}$/.test(id)) return "Look the doctor or attorney up first (provider lookup), then use the provider_id it gives you.";
  if (!name || !phone) return "Get the caller's full name and best phone number (repeat it back), then try again.";
  try {
    const r = await fetch(FS + "/providers/" + encodeURIComponent(id) + "?key=" + FS_KEY);
    if (!r.ok) return "That provider isn't in the directory. Take the caller's name and number and say Tania's office will follow up.";
    const p = fsDoc(await r.json());
    if (p.active === false) return "That provider isn't listed right now. Take the caller's name and number and say Tania's office will follow up.";
    const list = (await store.get("central", { type: "json" })) || [];
    if (list.some((x) => x.phone === phone && x.providerId === id && x.at > Date.now() - 864e5)) return "This request was already sent today. Tell the caller the office has it and will contact them soon.";
    const rec = { id: "cr_" + crypto.randomBytes(6).toString("hex"), at: Date.now(), kind: "lead", status: "new", source: "rachel-phone", providerId: id, providerCode: p.code || "", providerName: p.name || p.practice || "", providerState: p.state || "",
      name, phone, email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : "", bestTime: clean(b.best_time, 80), state: p.state || "", city: "", consent: { at: Date.now(), text: "Agreed by phone (Rachel) to share contact details with the office." }, callId: clean(b.call_id, 80) };
    const m = await emailPractice(store, rec, p.email);
    rec.emailed = m.ok; rec.status = m.ok ? "emailed" : "new"; if (!m.ok) rec.note = "email: " + m.why;
    list.unshift(rec); await store.setJSON("central", list.slice(0, 3000));
    return m.ok ? `Done. ${rec.providerName}'s office has the request and will contact ${name}. Tell the caller that, thank them, and end warmly.` : `Saved. Tania's office will make sure ${rec.providerName}'s office gets it. Tell the caller the office will contact them soon.`;
  } catch (e) { return "The directory can't be reached right now. Take the caller's name and number and say Tania's office will follow up."; }
}

// Tania, Nov 7: heads-up email right before a caller transfers someone to her (Cartesia transfers can't whisper).
async function taniaHeadsUp(store, b) {
  const c = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
  const esc = (v) => c(v, 400).replace(/&/g, "&amp;");
  const who = c(b.person, 120) || c(b.lead_name, 120) || "someone at the office", biz = c(b.business, 160), why = c(b.reason, 400), agent = c(b.agent_name, 30) || "Your caller";
  const phone = c(b.lead_phone, 30);
  const log = (await store.get("tania-headsups", { type: "json" }).catch(() => null)) || [];
  log.push({ at: new Date().toISOString(), who, biz, why, agent, phone, callId: c(b.call_id, 80), leadId: c(b.lead_id, 60) });
  await store.setJSON("tania-headsups", log.slice(-200));
  const to = String(process.env.TANIA_ALERT_EMAIL || "designs@thewebswan.com").trim();
  const cal = sanitizeCal(await store.get("calendar", { type: "json" })), secret = await store.get("cal-secret");
  if (cal.scriptUrl && secret) {
    const subject = "📞 " + agent + " is transferring " + who + (biz ? " (" + biz + ")" : "") + " to you now";
    const html = `<div style="font-family:Arial,sans-serif;font-size:16px;color:#17324c"><h2 style="margin:0 0 8px">📞 Incoming transfer from ${esc(agent)}</h2>
      <p><b>Who:</b> ${esc(who)}</p>${biz ? `<p><b>Practice:</b> ${esc(biz)}</p>` : ""}${phone ? `<p><b>Their number:</b> ${esc(phone)}</p>` : ""}${why ? `<p><b>Why:</b> ${esc(why)}</p>` : ""}
      <p style="color:#5f7891;font-size:13px">They asked to speak with you. Your phone should ring in a few seconds.</p></div>`;
    try { await callScript(cal, secret, { action: "mail", to, subject, html, fromName: "WebSwan Voice Studio" }); } catch (e) {}
  }
  return "Tania has been told who is coming. Now say \"Please hold one moment while I connect you with Tania\" and transfer the call to Tania.";
}
