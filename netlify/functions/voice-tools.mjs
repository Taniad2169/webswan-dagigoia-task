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
