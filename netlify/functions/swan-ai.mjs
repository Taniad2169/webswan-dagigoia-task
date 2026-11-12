// WebSwan SwanPad AI bridge (Tania, Nov 12).
// Why this exists: SwanPad used to call Google directly with a key pasted into the page. Two problems with that.
// 1. Google counts rate limits PER PROJECT, not per key, so SwanPad was sharing Jimmy's daily allowance and
//    reporting "quota exceeded" on days Tania had not used it at all.
// 2. The key sat in a browser on a public page. Tania's rule is that her tools stay private.
// Now SwanPad sends only a passphrase and the conversation. The provider key never leaves Netlify, and the
// provider can be swapped here without touching SwanPad.
//
// Netlify environment variables (set by Tania, never in code):
//   SWANPAD_PASS        the passphrase SwanPad sends. Rotate it here any time; SwanPad asks for it again.
//   DEEPSEEK_API_KEY    preferred provider.
//   SWANPAD_GEMINI_KEY  fallback provider. Use a key from a SEPARATE Google project, or Jimmy's quota is shared again.
//   SWANPAD_DAILY_CAP   optional, default 400 replies a day. A hard stop so a leaked passphrase cannot run up a bill.
// Passphrase rotations (a changed SWANPAD_PASS only reaches this function once the site rebuilds):
//   2026-11-12 - Tania rotated SWANPAD_PASS.
//   2026-11-12 - rotated again; rebuild so the new value reaches the function.
import { getStore } from "@netlify/blobs";

const ORIGINS = ["https://taniad2169.github.io"];
const cors = (origin) => ({
  "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
  "Access-Control-Allow-Headers": "Content-Type, x-swan-pass",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const reply = (status, body, origin) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });

const GEMINI_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const today = () => new Date().toISOString().slice(0, 10);

// OpenAI-shaped messages in, plain text out. Both providers speak this shape after conversion.
async function askDeepseek(key, system, messages, maxTokens) {
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
      max_tokens: maxTokens,
      temperature: 0.8,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("DeepSeek " + r.status + ": " + ((d.error && d.error.message) || "no detail"));
  const text = ((d.choices || [])[0]?.message?.content || "").trim();
  return { text, provider: "deepseek", model: "deepseek-chat" };
}

async function askGemini(key, system, messages, maxTokens) {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "") }],
  }));
  let last = "";
  for (const model of GEMINI_MODELS) {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.8 },
        }),
      }
    );
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      const text = (((d.candidates || [])[0]?.content?.parts || []).map((p) => p.text || "").join("")).trim();
      return { text, provider: "gemini", model };
    }
    last = (d.error && d.error.message) || "Google said " + r.status;
    // 404 means Google retired that model while still listing it: try the next one. Anything else is real.
    if (r.status !== 404) throw new Error("Gemini: " + last);
  }
  throw new Error("Gemini: " + last);
}

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "POST only." }, origin);

  // Tania, Nov 12: a passphrase pasted into Netlify often arrives wrapped in quotes, or with a stray space or
  // newline. Those are invisible in the dashboard and look exactly like "I typed it right and it still fails".
  // Both sides are now stripped the same way before comparing.
  const tidy = (s) => String(s || "").trim().replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  const pass = tidy(process.env.SWANPAD_PASS);
  if (!pass) return reply(503, { error: "SWANPAD_PASS is not readable by this function. In Netlify, open that variable and make sure its Scopes include Functions, and that it applies to the Production context. A variable added after the last deploy only reaches the function once the site redeploys." }, origin);
  const sent = tidy(req.headers.get("x-swan-pass"));
  if (sent !== pass)
    return reply(401, {
      error: "Wrong passphrase. In SwanPad press Forget on the key button, then type it again.",
      // No value is ever returned. Only whether the two are the same length, which tells Tania whether she has a
      // typo in one character or the wrong string entirely.
      sameLength: sent.length === pass.length,
      youSent: sent.length + " characters"
    }, origin);

  let b = {};
  try { b = await req.json(); } catch (e) { return reply(400, { error: "Bad request body." }, origin); }

  const system = String(b.system || "").slice(0, 8000);
  const messages = (Array.isArray(b.messages) ? b.messages : [])
    .filter((m) => m && m.content)
    .slice(-24) // a conversation, not a transcript dump
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 4000) }));
  if (!messages.length) return reply(400, { error: "Nothing to say." }, origin);
  const maxTokens = Math.min(Math.max(Number(b.maxTokens) || 400, 32), 1200);

  // Hard daily cap. Counted before the call, so a provider error still costs a slot and a runaway loop stops itself.
  const cap = Number(process.env.SWANPAD_DAILY_CAP || 400);
  const store = getStore({ name: "swanpad-ai", consistency: "strong" });
  const slot = "usage-" + today();
  const used = Number((await store.get(slot, { type: "json" }).catch(() => null))?.n || 0);
  if (used >= cap) return reply(429, { error: "SwanPad has used its " + cap + " replies for today. It resets at midnight UTC." }, origin);
  await store.setJSON(slot, { n: used + 1 }).catch(() => {});

  const ds = String(process.env.DEEPSEEK_API_KEY || "").trim();
  const gm = String(process.env.SWANPAD_GEMINI_KEY || "").trim();
  if (!ds && !gm) return reply(503, { error: "No provider key set. Add DEEPSEEK_API_KEY (or SWANPAD_GEMINI_KEY) on webswan-billing in Netlify." }, origin);

  try {
    const out = ds ? await askDeepseek(ds, system, messages, maxTokens) : await askGemini(gm, system, messages, maxTokens);
    if (!out.text) return reply(502, { error: "The model sent nothing back. Try again." }, origin);
    return reply(200, { ...out, usedToday: used + 1, cap }, origin);
  } catch (e) {
    // If DeepSeek is down and a Gemini key exists, finish the sentence rather than leaving Jennifer silent.
    if (ds && gm) {
      try {
        const out = await askGemini(gm, system, messages, maxTokens);
        if (out.text) return reply(200, { ...out, fellBackFrom: "deepseek", usedToday: used + 1, cap }, origin);
      } catch (e2) { /* report the first error below: it is the one that matters */ }
    }
    return reply(502, { error: String(e.message || e).slice(0, 300) }, origin);
  }
};
