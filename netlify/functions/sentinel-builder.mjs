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

const diyStore = () => getStore({ name: "sentinel-diy", consistency: "strong" });
const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
const newSessionId = () => "sv" + Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
const newLeadId = () => "sd" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const LANG_NAMES = { en: "English", es: "Spanish", ht: "Haitian Creole", pt: "Brazilian Portuguese" };

const SYSTEM = (fields, lang) => `You are Sentinel, a warm and efficient AI web designer for WebSwan's $698 DIY landing-page product (diy-starter). You are chatting directly with a potential customer on the product's own page -- not with Tania or her team.
What you are building: ONE landing page for their business, built and hosted by WebSwan: $698 to build (paid on approval), $199/month after launch, up to 2 hours of design time included (then $25/hour). You are not a lawyer, accountant or marketing consultant -- stick to designing their page.
Your job, in order, asking ONE question at a time and reacting naturally to what they say (never a rigid form):
1. Their business name.
2. A one-line tagline or description of what they offer (what should the headline say).
3. Their brand color -- a color name or hex code is fine; if they don't have one, offer 2-3 tasteful suggestions and let them pick.
4. A phone number or email so WebSwan can reach them about the page (at least one is required).
Once you have all four, summarize what you have back to them in one short paragraph and ask them to confirm it's right and that they're ready to move forward with WebSwan building it for $698. Only when they CLEARLY say yes / that's right / let's go / approved (an explicit confirmation, not just continuing to chat) do you consider this approved.
Known so far: businessName=${JSON.stringify(fields.businessName || "")}, tagline=${JSON.stringify(fields.tagline || "")}, color=${JSON.stringify(fields.color || "")}, phone=${JSON.stringify(fields.phone || "")}, email=${JSON.stringify(fields.email || "")}.
Reply in ${LANG_NAMES[lang] || "English"}. Keep replies short -- 1-3 sentences, friendly, no bullet lists, no markdown.
At the very end of EVERY reply, on its own, append a machine-readable snapshot of everything known so far (carry forward any field you already had even if this turn didn't change it; use "" for anything still unknown) in exactly this form, with no text after it:
<<STATE>>{"businessName":"...","tagline":"...","color":"...","phone":"...","email":"...","approved":false}<<END>>
Set "approved" to true only on the turn where they give that clear final yes, and only if businessName and at least one of phone/email are already known.`;

const STATE_RE = /<<STATE>>([\s\S]*?)<<END>>\s*$/;

function parseState(text) {
  const m = text.match(STATE_RE);
  if (!m) return { clean: text.trim(), state: null };
  let state = null;
  try { state = JSON.parse(m[1]); } catch (e) { state = null; }
  return { clean: text.slice(0, m.index).trim(), state };
}

async function queueLead(session, sessionId) {
  const f = session.fields || {};
  const st = diyStore();
  const idx = ((await st.get("lq-index", { type: "json" })) || []).filter((x) => x.status === "pending" || Date.now() - new Date(x.at).getTime() < 14 * 86400000);
  const item = {
    id: newLeadId(), kind: "create", at: new Date().toISOString(), status: "pending", by: "sentinel-diy",
    name: clean(f.businessName, 160), phone: clean(f.phone, 40), email: clean(f.email, 160),
    comment: "Sentinel DIY ($698) -- tagline: " + clean(f.tagline, 300) + " | brand color: " + clean(f.color, 60) + " | session " + sessionId,
    dropdown: "call back"
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

  if (body.hp) return reply(200, { reply: "", sessionId: newSessionId(), fields: {}, approved: false }, origin); // bot honeypot: silent fake-success

  const store = diyStore();
  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "unknown";
  const hourKey = "rl/" + crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16) + "/" + new Date().toISOString().slice(0, 13);
  const count = (await store.get(hourKey, { type: "json" })) || 0;
  if (count >= 30) return reply(429, { error: "Too many messages -- please slow down a little." }, origin);
  await store.setJSON(hourKey, count + 1);

  const lang = ["en", "es", "ht", "pt"].includes(body.lang) ? body.lang : "en";
  const message = clean(body.message, 1500);
  if (!message) return reply(400, { error: "Say something to Sentinel first." }, origin);

  let sessionId = clean(body.sessionId, 60);
  let session = sessionId ? await store.get("sess/" + sessionId, { type: "json" }) : null;
  if (!session) { sessionId = newSessionId(); session = { id: sessionId, createdAt: new Date().toISOString(), messages: [], fields: {}, approved: false, leadQueued: false }; }

  session.messages.push({ role: "user", content: message });
  const history = session.messages.slice(-16);

  let aiText;
  try { const r = await askAI("claude-only", SYSTEM(session.fields, lang), history, 600); aiText = r.text || ""; }
  catch (e) { return reply(502, { error: "Sentinel couldn't answer just now -- please try again in a moment." }, origin); }

  const { clean: visibleText, state } = parseState(aiText);
  session.messages.push({ role: "assistant", content: aiText });
  session.messages = session.messages.slice(-16);

  if (state && typeof state === "object") {
    session.fields = {
      businessName: clean(state.businessName, 160) || session.fields.businessName || "",
      tagline: clean(state.tagline, 300) || session.fields.tagline || "",
      color: clean(state.color, 60) || session.fields.color || "",
      phone: clean(state.phone, 40) || session.fields.phone || "",
      email: clean(state.email, 160) || session.fields.email || ""
    };
    const canApprove = !!session.fields.businessName && !!(session.fields.phone || session.fields.email);
    if (state.approved === true && canApprove) session.approved = true;
  }

  let queuedLeadId = null;
  if (session.approved && !session.leadQueued) {
    try { queuedLeadId = await queueLead(session, sessionId); session.leadQueued = true; session.leadId = queuedLeadId; }
    catch (e) { /* best-effort; visitor still sees their confirmation */ }
  }

  session.updatedAt = new Date().toISOString();
  await store.setJSON("sess/" + sessionId, session);

  return reply(200, { reply: visibleText || "Got it.", sessionId, fields: session.fields, approved: session.approved, leadQueued: session.leadQueued }, origin);
};
