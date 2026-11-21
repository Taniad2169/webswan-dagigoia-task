// Sentinel (DIY $698 builder) -- public chat backend for diy-starter/index.html.
// Unrelated to the internal "Sentinel" dev-ops/security agent in ../lib/sentinel.mjs: that one
// reads Tania's own GitHub repos and audits websites for her, read-only, owner-gated. This Sentinel
// is customer-facing: he chats with a visitor, collects what their page needs, and queues the
// finished lead for WorkPilot. Separate Blobs store ("sentinel-diy"), separate queue key, no shared
// code path with Sebastien's or Eva's queues -- nothing here can touch WorkPilot directly.
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { reply, cors, ALLOWED_ORIGINS } from "../lib/auth.mjs";
import { askAI } from "../lib/team.mjs";
import { store as vsStore } from "../lib/central.mjs";
import { sanitizeCal, callScript } from "../lib/cal.mjs";

const diyStore = () => getStore({ name: "sentinel-diy", consistency: "strong" });
const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
const newSessionId = () => "sv" + Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
const newLeadId = () => "sd" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const LANG_NAMES = { en: "English", es: "Spanish", ht: "Haitian Creole", pt: "Brazilian Portuguese" };
const TANIA_EMAIL = "thewebswann@gmail.com";
const h = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Sebastien's number, formatted for display -- Sentinell points visitors to him for anything beyond
// building the page itself (process questions, other WebSwan services), same as the rest of the site.
function sebastienDisplay() {
  const d = String(process.env.SEBASTIEN_NUMBER || "+12295446718").replace(/\D/g, "").replace(/^1/, "");
  return d.length === 10 ? "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6) : "(229) 544-6718";
}
const SEBASTIEN_DISPLAY = sebastienDisplay();

// The exact wording a visitor is agreeing to when they click "Agree" and pay. Stored verbatim with
// their agreement timestamp so there's a record of what they signed off on, not just that they paid.
const DISCLAIMER_TEXT = "By clicking Agree and paying, I confirm I've reviewed and approved this design concept with Sentinell, and I agree to WebSwan's $698 build fee and $199/month hosting & maintenance after launch. I understand that once my finished design is released, my first 2 edit requests are free and each additional edit after that is $75.";

const SYSTEM = (fields, lang) => `You are Sentinell (spelled with a double L -- always spell your own name that way, to tell you apart from WebSwan's internal "Sentinel" system), a warm and efficient AI web designer for WebSwan's $698 DIY landing-page product (diy-starter). You are chatting directly with a potential customer on the product's own page -- not with Tania or her team.
What you are building: ONE landing page for their business, built and hosted by WebSwan: $698 to build, $199/month after launch. It comes with SEO set up for the page, thoughtful UX/UI design, and WebSwan can add a booking calendar to it too. You are not a lawyer, accountant or marketing consultant -- stick to designing their page.
Stay warm and talkative the whole way through -- never just silently collect one answer after another. React briefly to what they just told you (their business name, their tagline, the color they picked) before moving on, and naturally mention along the way -- a line here, a line there, not all at once -- that their page also comes with SEO, clean UX/UI design, and the option of a booking calendar, so they feel informed and engaged throughout, not like they're filling out a form.
Part 1 -- collect the design, ONE question at a time, reacting naturally (never a rigid form):
1. Their business name.
2. A one-line tagline or description of what they offer (what should the headline say).
3. Their brand color -- when you ask this, a row of named color swatches pops up on their screen for them to tap, so NEVER ask for or require a hex code. Just ask what color they'd like in plain words ("what color feels right for your brand?"); they can tap a swatch or describe a color themselves ("ocean blue", "a warm red"), and either way you'll get back a name and/or hex code to use.
4. A phone number or email so WebSwan can reach them about the page (at least one is required; if only phone was given, ask for an email too since the finished design gets sent by email).
Once you have all four, summarize the design back to them in one short paragraph -- including that it'll come with SEO, UX/UI design, and (mention it as an option) a booking calendar -- and ask them to confirm it's right.
Part 2 -- once they confirm the design, explain (in your own words, naturally, not a copy-paste script) that this now goes to Tania, WebSwan's founder and certified human web designer, who personally completes it. There are two ways to get the finished design -- ask which they'd prefer:
  (a) Set a free appointment with Tania. On the day of the appointment, the finished design is emailed to them, they make their payment and the project is completed together, then it moves forward to getting their domain. If they pick this, get a day and time that works for them AND which time zone they're in (Pacific, Eastern, Central or Mountain) -- ask both together, naturally.
  (b) Pay the $698 now instead -- no appointment needed. Once paid, the finished design is emailed to them within a couple of days.
If they ask what happens if they see the full design and want changes: the first 2 edit requests after the design is released are free, and each additional edit after that is $75.
If they choose to pay now (path b), tell them you'll bring up a short agreement for them to review -- once they click Agree, they'll be taken to a secure page to complete the $698 payment. Don't try to collect any card or payment details yourself in chat. Also let them know that during their 2-day wait for the finished design, they're welcome to reach Sebastien at ${SEBASTIEN_DISPLAY} anytime with questions about the process or WebSwan's other services.
Only when ALL of this is settled -- the design confirmed, and a delivery path chosen (with day, time AND time zone for the appointment path) -- do you consider the whole thing "approved". Don't rush there: if Part 2 is still unanswered, keep going, one question at a time.
Known so far: businessName=${JSON.stringify(fields.businessName || "")}, tagline=${JSON.stringify(fields.tagline || "")}, color=${JSON.stringify(fields.color || "")}, phone=${JSON.stringify(fields.phone || "")}, email=${JSON.stringify(fields.email || "")}, deliveryChoice=${JSON.stringify(fields.deliveryChoice || "")}, apptDay=${JSON.stringify(fields.apptDay || "")}, apptTime=${JSON.stringify(fields.apptTime || "")}, apptTimezone=${JSON.stringify(fields.apptTimezone || "")}.
Reply in ${LANG_NAMES[lang] || "English"}. Keep replies short -- 1-3 sentences, friendly, no bullet lists, no markdown.
At the very end of EVERY reply, on its own, append a machine-readable snapshot of everything known so far (carry forward any field you already had even if this turn didn't change it; use "" for anything still unknown) in exactly this form, with no text after it:
<<STATE>>{"businessName":"...","tagline":"...","color":"...","phone":"...","email":"...","deliveryChoice":"appointment|pay|","apptDay":"...","apptTime":"...","apptTimezone":"...","approved":false}<<END>>
For the appointment path, set "approved" to true only on the turn everything above is settled -- never earlier. For the pay-now path, set "approved" to true as soon as businessName, phone/email and deliveryChoice="pay" are known -- payment itself happens on WebSwan's secure page, not in this chat.`;

const STATE_RE = /<<STATE>>([\s\S]*?)<<END>>\s*$/;

function parseState(text) {
  const m = text.match(STATE_RE);
  if (!m) return { clean: text.trim(), state: null };
  let state = null;
  try { state = JSON.parse(m[1]); } catch (e) { state = null; }
  return { clean: text.slice(0, m.index).trim(), state };
}

// -- Stripe (The WebSwan's own account; STRIPE_SECRET_KEY is already set in Netlify for Business
// Service / Residual billing -- reused here, same brand, same account) --------------------------
const PAGE_URL = "https://taniad2169.github.io/webswan-dagigoia-task/diy-starter/";

async function stripePost(path, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe key not set");
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString()
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d.error && d.error.message) || "Stripe error");
  return d;
}

async function stripeGet(path) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe key not set");
  const r = await fetch("https://api.stripe.com/v1/" + path, { headers: { Authorization: "Bearer " + key } });
  const d = await r.json();
  if (!r.ok) throw new Error((d.error && d.error.message) || "Stripe error");
  return d;
}

async function makeSentinelPayLink(fields, sessionId) {
  const meta = { source: "Sentinell DIY", sessionId, businessName: clean(fields.businessName, 100) };
  const m = (prefix) => Object.fromEntries(Object.entries(meta).map(([k, v]) => [prefix + "[" + k + "]", v]));
  const price = await stripePost("prices", {
    currency: "usd", unit_amount: "69800",
    "product_data[name]": "Sentinell DIY website build -- " + (fields.businessName || "landing page"),
    ...m("metadata")
  });
  const params = {
    "line_items[0][price]": price.id, "line_items[0][quantity]": "1",
    "restrictions[completed_sessions][limit]": "1",
    ...m("metadata"),
    "after_completion[type]": "redirect",
    "after_completion[redirect][url]": PAGE_URL + "?paid=" + sessionId,
    "invoice_creation[enabled]": "true",
    "invoice_creation[invoice_data][description]": "Sentinell DIY website build ($698), $199/mo hosting & maintenance after launch.",
    ...m("invoice_creation[invoice_data][metadata]")
  };
  if (fields.email) params["customer_email"] = clean(fields.email, 160);
  const link = await stripePost("payment_links", params);
  return { id: link.id, url: link.url, amount: 698, paid: false, createdAt: new Date().toISOString() };
}

async function checkSentinelPaid(payLink) {
  if (!payLink || payLink.paid) return !!(payLink && payLink.paid);
  const d = await stripeGet("checkout/sessions?limit=3&status=complete&payment_link=" + encodeURIComponent(payLink.id));
  const s = (d.data || []).find((x) => x.payment_status === "paid");
  if (!s) return false;
  payLink.paid = true;
  payLink.paidAt = new Date((s.created || Date.now() / 1000) * 1000).toISOString();
  payLink.amountPaid = (s.amount_total || 0) / 100;
  return true;
}

// Tania asked to always be notified when a Sentinell landing page is completed/approved -- not just
// queued silently for WorkPilot. Same mail pattern as package-lead.mjs (Tania's own Calendar Bridge
// script handles the actual sending; best-effort, never blocks the visitor's own confirmation).
async function emailTania(session, sessionId) {
  try {
    const vs = vsStore();
    const cal = sanitizeCal(await vs.get("calendar", { type: "json" })), secret = await vs.get("cal-secret");
    if (!cal.scriptUrl || !secret) return false;
    const f = session.fields || {};
    const row = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#5f7891">${k}</td><td style="padding:4px 0"><b>${h(v)}</b></td></tr>` : "";
    const deliveryRow = f.deliveryChoice === "appointment"
      ? row("Delivery", "Appointment with Tania: " + [f.apptDay, f.apptTime, f.apptTimezone].filter(Boolean).join(" "))
      : f.deliveryChoice === "pay"
        ? row("Delivery", "Paid $698 upfront" + (session.payLink && session.payLink.paid ? " -- payment confirmed via Stripe" : " -- payment pending"))
        : "";
    const html = `<div style="font-family:Arial,sans-serif;color:#17324c;max-width:560px"><h2 style="margin:0 0 8px">Sentinell DIY landing page completed -- $698</h2>
    <table style="border-collapse:collapse;font-size:15px">${row("Business", f.businessName)}${row("Tagline", f.tagline)}${row("Brand color", f.color)}${row("Phone", f.phone)}${row("Email", f.email)}${deliveryRow}${row("Session", sessionId)}</table></div>`;
    const r = await callScript(cal, secret, { action: "mail", to: TANIA_EMAIL, subject: "Sentinell DIY completed: " + (f.businessName || sessionId), html, fromName: "Sentinell" });
    return !!(r && r.ok);
  } catch (e) { return false; }
}

async function queueLead(session, sessionId) {
  const f = session.fields || {};
  const st = diyStore();
  const idx = ((await st.get("lq-index", { type: "json" })) || []).filter((x) => x.status === "pending" || Date.now() - new Date(x.at).getTime() < 14 * 86400000);
  const deliveryBit = f.deliveryChoice === "appointment"
    ? "appointment with Tania: " + clean(f.apptDay, 40) + " " + clean(f.apptTime, 40) + " " + clean(f.apptTimezone, 20) + " -- design + payment + domain handled that day"
    : f.deliveryChoice === "pay"
      ? "paid $698 upfront -- design emailed within a couple days" + (session.payLink && session.payLink.paid ? " (payment confirmed via Stripe)" : " (payment pending)")
      : "delivery path not yet chosen";
  const item = {
    id: newLeadId(), kind: "create", at: new Date().toISOString(), status: "pending", by: "sentinel-diy",
    name: clean(f.businessName, 160), phone: clean(f.phone, 40), email: clean(f.email, 160),
    comment: "Sentinell DIY ($698) -- tagline: " + clean(f.tagline, 300) + " | brand color: " + clean(f.color, 60) + " | " + deliveryBit + " | session " + sessionId,
    dropdown: "call back",
    // Record of what was agreed to and the full chat it came from, for Tania's files.
    transcript: (session.messages || []).map((m) => ({ role: m.role, content: m.content })),
    disclaimer: session.disclaimer || null,
    payLink: session.payLink ? { id: session.payLink.id, amount: session.payLink.amount, paid: !!session.payLink.paid, paidAt: session.payLink.paidAt || null } : null
  };
  idx.push(item);
  await st.setJSON("lq-index", idx.slice(-500));
  return item.id;
}

export default async (req, context) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Not allowed from this page." }, origin);
  let body; try { body = await req.json(); } catch (e) { return reply(400, { error: "Bad request." }, origin); }

  const store = diyStore();

  // A lightweight check the frontend polls after sending the visitor to Stripe -- never trusts the
  // client's own claim that they paid; always re-checks with Stripe directly.
  if (body.action === "checkPayment") {
    const sessionId = clean(body.sessionId, 60);
    const session = sessionId ? await store.get("sess/" + sessionId, { type: "json" }) : null;
    if (!session || !session.payLink) return reply(200, { paid: false }, origin);
    let paidNow = false;
    try { paidNow = await checkSentinelPaid(session.payLink); } catch (e) { /* Stripe hiccup; visitor can poll again */ }
    if (paidNow && !session.approved) session.approved = true;
    let queuedLeadId = session.leadId || null;
    if (session.approved && !session.leadQueued) {
      try { queuedLeadId = await queueLead(session, sessionId); session.leadQueued = true; session.leadId = queuedLeadId; await emailTania(session, sessionId); }
      catch (e) { /* best-effort */ }
    }
    session.updatedAt = new Date().toISOString();
    await store.setJSON("sess/" + sessionId, session);
    return reply(200, { paid: !!(session.payLink && session.payLink.paid), approved: session.approved }, origin);
  }

  if (body.hp) return reply(200, { reply: "", sessionId: newSessionId(), fields: {}, approved: false }, origin); // bot honeypot: silent fake-success

  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "unknown";
  const hourKey = "rl/" + crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16) + "/" + new Date().toISOString().slice(0, 13);
  const count = (await store.get(hourKey, { type: "json" })) || 0;
  if (count >= 30) return reply(429, { error: "Too many messages -- please slow down a little." }, origin);
  await store.setJSON(hourKey, count + 1);

  const lang = ["en", "es", "ht", "pt"].includes(body.lang) ? body.lang : "en";
  const message = clean(body.message, 1500);
  if (!message) return reply(400, { error: "Say something to Sentinell first." }, origin);

  let sessionId = clean(body.sessionId, 60);
  let session = sessionId ? await store.get("sess/" + sessionId, { type: "json" }) : null;
  if (!session) { sessionId = newSessionId(); session = { id: sessionId, createdAt: new Date().toISOString(), messages: [], fields: {}, approved: false, leadQueued: false, payLink: null, disclaimer: null }; }

  session.messages.push({ role: "user", content: message });
  const history = session.messages.slice(-16);

  let aiText;
  try { const r = await askAI("claude-only", SYSTEM(session.fields, lang), history, 600); aiText = r.text || ""; }
  catch (e) { return reply(502, { error: "Sentinell couldn't answer just now -- please try again in a moment." }, origin); }

  const { clean: visibleText, state } = parseState(aiText);
  session.messages.push({ role: "assistant", content: aiText });
  session.messages = session.messages.slice(-16);

  if (state && typeof state === "object") {
    const dc = ["appointment", "pay"].includes(state.deliveryChoice) ? state.deliveryChoice : (session.fields.deliveryChoice || "");
    session.fields = {
      businessName: clean(state.businessName, 160) || session.fields.businessName || "",
      tagline: clean(state.tagline, 300) || session.fields.tagline || "",
      color: clean(state.color, 60) || session.fields.color || "",
      phone: clean(state.phone, 40) || session.fields.phone || "",
      email: clean(state.email, 160) || session.fields.email || "",
      deliveryChoice: dc,
      apptDay: clean(state.apptDay, 40) || session.fields.apptDay || "",
      apptTime: clean(state.apptTime, 40) || session.fields.apptTime || "",
      apptTimezone: clean(state.apptTimezone, 20) || session.fields.apptTimezone || ""
    };
    const f = session.fields;
    const hasContact = !!(f.phone || f.email);
    const appointmentSettled = f.deliveryChoice === "appointment" && !!f.apptDay && !!f.apptTime && !!f.apptTimezone;
    const paySettled = f.deliveryChoice === "pay";

    if (state.approved === true && !!f.businessName && hasContact && appointmentSettled) {
      session.approved = true; // appointment path: fully settled right here, no payment needed in chat
    }
    // Pay-now path: generate the one-time Stripe link as soon as the visitor has chosen "pay" and we
    // have what we need, independent of the model's own "approved" flag -- Sentinell's narrated text
    // ("the agreement should be on your screen now") can't be left waiting on the AI also remembering
    // to flip approved in the same turn. Real approval for this path waits for Stripe to confirm the
    // payment itself (see the checkPayment action below), not for anything said in chat.
    if (!!f.businessName && hasContact && paySettled && !session.payLink) {
      try {
        session.payLink = await makeSentinelPayLink(f, sessionId);
        session.disclaimer = { text: DISCLAIMER_TEXT, agreedAt: new Date().toISOString() };
      } catch (e) { /* Stripe hiccup; visitor can be told to try again */ }
    }
  }

  let queuedLeadId = session.leadId || null;
  if (session.approved && !session.leadQueued) {
    try { queuedLeadId = await queueLead(session, sessionId); session.leadQueued = true; session.leadId = queuedLeadId; await emailTania(session, sessionId); }
    catch (e) { /* best-effort; visitor still sees their confirmation */ }
  }

  session.updatedAt = new Date().toISOString();
  await store.setJSON("sess/" + sessionId, session);

  return reply(200, {
    reply: visibleText || "Got it.", sessionId, fields: session.fields, approved: session.approved, leadQueued: session.leadQueued,
    payLink: session.payLink && !session.payLink.paid ? { url: session.payLink.url, amount: session.payLink.amount } : null,
    disclaimerText: session.payLink && !session.payLink.paid ? DISCLAIMER_TEXT : null
  }, origin);
};
