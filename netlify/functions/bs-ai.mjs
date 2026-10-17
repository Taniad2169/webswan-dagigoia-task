// WebSwan Business Service - owner-only AI assistant (Claude or ChatGPT).
// Env vars Tania sets in Netlify (never in code): ANTHROPIC_API_KEY, OPENAI_API_KEY,
// optional ANTHROPIC_MODEL and OPENAI_MODEL to choose models.
import { reply, cors, verifyOwner, ALLOWED_ORIGINS, OWNERS, GBP_MANAGERS } from "../lib/auth.mjs";

const SYSTEM = `You are the internal assistant for WebSwan Business Service, a private document-preparation service run by Tania that helps clients in New York, Florida, Washington and Texas with LLC formation, IRS EIN applications and business license applications.
You help Tania (not the client directly) with: answering her questions about filing steps and state requirements, preparing application content, and writing emails and letters to clients and agencies.
Rules:
- WebSwan is not a law firm, CPA or government agency. Write client-facing text that never gives legal or tax advice, never promises approval or timing, and keeps the WebSwan service fee clearly separate from government fees. Mention that the IRS EIN is free when relevant.
- When a question needs a lawyer or tax professional (choosing an entity type, tax elections, disputes, liability), say so plainly and suggest Tania refer the client.
- Never ask for or repeat full Social Security numbers, ITINs, bank or card numbers.
- The EIN responsible party must be the real owner, never WebSwan.
- Fees and rules change: when you state a government fee or deadline, say it should be confirmed on the official agency website.
- Be clear, warm and concise. For emails and letters, give a ready-to-send draft with a subject line.`;

const GBP_SYSTEM = `You are the Google Business Profile assistant for WebSwan (run by Tania), who sets up and manages Google Business Profiles for local businesses every month.
You help Tania write: Google Business Profile posts (updates, offers, events), business descriptions (max 750 characters, no URLs, no promotional ALL CAPS), review replies, Q&A, photo ideas, monthly report emails to clients, and setup or verification checklists.
Rules: follow Google Business Profile guidelines. Use the real business name only (no keyword stuffing). Never write fake reviews or ask for reviews in exchange for anything. Do not put phone numbers in post text; use the call-to-action button instead. Keep posts 100 to 300 words or shorter, friendly, local, and specific to the business, with a suggested call-to-action button (Book, Order, Learn more, Call). Never promise rankings. Be warm and concise.`;

const clean = (v, n) => String(v == null ? "" : v).slice(0, n);

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Not allowed from this page." }, origin);
  let who; try { who = await verifyOwner(req, GBP_MANAGERS); } catch (e) { return reply(401, { error: "Please sign in with your WebSwan Google account." }, origin); }
  let body; try { body = await req.json(); } catch (e) { return reply(400, { error: "Bad request." }, origin); }
  if (!OWNERS.includes(who) && body.mode !== "gbp") return reply(403, { error: "This account can only use the GBP assistant." }, origin);
  const provider = body.provider === "openai" ? "openai" : "claude";
  const sys = body.mode === "gbp" ? GBP_SYSTEM : SYSTEM;
  const prompt = clean(body.prompt, 8000).trim();
  const context = clean(body.context, 6000).trim();
  if (!prompt) return reply(400, { error: "Type a question or request." }, origin);
  const user = (context ? "Client request details (no sensitive numbers):\n" + context + "\n\n" : "") + prompt;

  try {
    if (provider === "claude") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return reply(500, { error: "Claude isn't connected yet. Add ANTHROPIC_API_KEY in Netlify." }, origin);
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5", max_tokens: 1500, system: sys, messages: [{ role: "user", content: user }] }) });
      const j = await r.json();
      if (!r.ok) throw new Error((j.error && j.error.message) || "Claude error");
      return reply(200, { text: (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n"), provider: "Claude" }, origin);
    } else {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return reply(500, { error: "ChatGPT isn't connected yet. Add OPENAI_API_KEY in Netlify." }, origin);
      const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST",
        headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1", messages: [{ role: "system", content: sys }, { role: "user", content: user }] }) });
      const j = await r.json();
      if (!r.ok) throw new Error((j.error && j.error.message) || "OpenAI error");
      return reply(200, { text: j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : "", provider: "ChatGPT" }, origin);
    }
  } catch (e) { return reply(502, { error: "The AI service didn't answer: " + e.message }, origin); }
};
