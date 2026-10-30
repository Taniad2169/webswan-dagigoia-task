// WebSwan Voice Studio: tools Rebecca (or any Cartesia agent) can use during a live call.
//   GET  ?action=slots&state=NY  -> a few open times on Tania's calendar, said in the lead's time zone
//   POST {action:"book", ...}    -> book one onboarding on Tania's calendar (checked again right before booking)
// Only Cartesia can call this: every request must carry the tool secret that Voice Studio created
// (saved in Netlify Blobs, never in code). Nothing here can read or change anything else.
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
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
  const full = c.plan === "wsmn149_299" || c.plan === "full499";
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
