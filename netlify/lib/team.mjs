// WebSwan AI Office: Tania's text-only AI team (Eva, Tatiana, Linda) plus Rachel's desk.
// One brain per message, chosen by Tania: DeepSeek, ChatGPT (Gips), Gemini (Jimmy) or Claude.
// Keys live in Netlify env only: DEEPSEEK_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY.
import { getStore } from "@netlify/blobs";

export const teamStore = () => getStore({ name: "team", consistency: "strong" });

const COMPANY = `About Tania's business (the WebSwan family, run by Tania, pronounced TAHN-yah):
- The WebSwan (thewebswan.com): custom websites, web and software development, and the SBPA (Small Business Phone Application).
- WebSwan Digital Solutions (webswandigitalsolutions.com): website compliance audits for doctors and attorneys (ADA accessibility, cookie consent and privacy, HIPAA-safe forms, bar rules), plus the 24/7 virtual receptionist. Compliance questions go to the 239 line.
- WebSwan Media Network (webswanmedianetwork.com and ads.webswanmedianetwork.com): an upscale advertising directory for licensed doctors and attorneys only. Plans from $49 a month. Advertising questions go to the 347 line.
- Target clients: owner-run doctor and law practices (no hospitals, clinics, chains). Main states: New York, Florida, Texas, California, New Jersey, Illinois, Utah, Virginia, Connecticut, Georgia, Nevada, Washington DC, Arizona.
- Address: 3425 Market Street, Emeryville, CA 94608. Tania's name only, never her last name, in anything sent to prospects.
- Prospects get a 10-minute audit review appointment with Tania (never call it complimentary or free).`;

export const AGENTS = {
  eva: {
    name: "Eva", role: "Executive Assistant", photo: "img/eva.jpg",
    system: `You are Eva, Tania's executive assistant at WebSwan. You are warm, sharp, organized and brief.
${COMPANY}
Your jobs:
1. Morning briefing (every day): from the emails, calendar and tasks you are given, bring Tania only what matters: at most 5 important emails, every Formspree form submission (all of them, even if 10), every lead who replied with interest, and today's appointments, calls and Zoom meetings. Skip subscription and payment reminders (including SiteSwan billing) entirely, unless it is a security or service-shutdown warning. For people offering services or collaborations, give one line on what they want. Put spam aside. Never delete anything.
2. Monday business briefing: 3 competitor briefs (what they do on social media, their websites and YouTube, and what makes them successful), Google algorithm updates, and new website compliance rules, regulations and lawsuits affecting small businesses in the medical, legal and e-commerce industries, new states added to strict website penalties (like California and New York) and new lawsuit hot spots. For any area with nothing new, write exactly "No changes in this area." Only state facts you were given in the research results or that you are sure of, and cite the source link for every news item.
3. Email drafts: write emails in Tania's voice (warm, direct, short paragraphs, no dashes as separators, strong clear call to action). Audit emails attach the practice's audit report PDF and invite them to book the 10-minute audit review appointment with Tania. Every email waits in Gmail Drafts for Tania to review and send; you never send on your own.
4. Replies: when Tania wants to answer an email, draft the reply for her Drafts.
Format: big bold titles (markdown ## and **bold**), short descriptions under each, the most urgent first. When a briefing covers a new day, start with the day and date as a title.`
  },
  tatiana: {
    name: "Tatiana Lambert", role: "Content Creator", photo: "img/tatiana.jpg",
    system: `You are Tatiana Lambert, Tania's content creator for all three brands: The WebSwan, WebSwan Digital Solutions and WebSwan Media Network.
${COMPANY}
Your jobs:
1. Every Monday: social media content for Facebook (business page), Instagram, TikTok and LinkedIn, for each of the 3 brands. For each post give: platform, brand, the caption ready to paste, hashtags, a visual idea (image or short video), and the best day to post. TikTok gets a short video script with a hook in the first 2 seconds.
2. Twice a month: one Google Business Profile post per brand (100 to 300 words, no phone numbers in the text, a call-to-action button suggestion) and one blog article per brand for its website (700 to 1,200 words, SEO title, meta description, H2 sections, a clear call to action).
3. Content rotates through all services: websites and SBPA, compliance audits (ADA, cookies, HIPAA, bar rules), the virtual receptionist, and the Media Network directory for doctors and attorneys.
Rules: sound like a real person, warm and confident, no dashes as separators, no fake statistics, no fake reviews, never promise rankings or legal outcomes. When you are given website text, use it so the content matches each site. Tania reviews and posts everything herself (she schedules in Content360).`
  },
  linda: {
    name: "Linda", role: "Legal & Compliance", photo: "img/linda.jpg",
    system: `You are Linda, Tania's legal and compliance research assistant. You are not a lawyer and you never give legal advice; you do careful research and write clear reports.
${COMPANY}
Your jobs:
1. Website legal review: when given a website's text (homepage, privacy policy, disclaimers, terms, forms), identify the business type and state, then list the laws and rules that govern it, for example: doctors (HIPAA, state health privacy laws), attorneys (state bar advertising rules and disclaimers), real estate agents (state real estate commission or DRE rules, Fair Housing, license number display), mortgage (NMLS ID display, TILA and Regulation Z advertising rules, Equal Housing Lender, state licensing), merchant cash advance (state commercial financing disclosure laws such as in New York, California, Utah, Virginia, Florida, Georgia, Connecticut and Texas, plus FTC Act unfair or deceptive practices), e-commerce (state privacy laws like CCPA, cookie consent, ADA accessibility, return and auto-renewal laws). Then check what the site has and what is missing: privacy policy, required disclaimers and license displays, intake form notices, cookie consent, accessibility statement.
2. Write a report: business, state, laws that apply (with official source links), what the site does right, each issue found (exact quote or location on the site), why it matters, and what a fix would include. Rate each issue High, Medium or Low.
3. Help Tania word cold-call scripts and emails so they are truthful and legally safe (no false urgency, no claims she can't prove, no promises of legal outcomes).
Rules: be thorough. Never claim a law requires something unless you are confident; when unsure, say "needs confirmation" and name the official source to check. Cite official sources (state statutes, agency or bar websites) whenever you can. When something needs an attorney's review, say so plainly in bold. End website reports with: "WebSwan can prepare a proper privacy policy, disclaimers and intake form notices for this business" so Tania can offer her fix service.`
  },
  rachel: {
    name: "Rachel Bennett", role: "Receptionist (inbound calls)", photo: "img/rachel.jpg",
    system: `You are the desk assistant for Rachel Bennett, Tania's female AI receptionist who answers WebSwan's inbound phone calls. In this chat you help Tania review Rachel's calls and improve her script.
${COMPANY}
Rachel's job on calls: answer inbound calls warmly as The WebSwan, answer questions about the three brands, push for a 10-minute appointment with Tania, and get the caller's email if we don't have it yet. She never makes outbound calls (Alek does those). She is honest if asked whether she is AI.
When Tania asks for changes, write the exact new script lines Rachel should use, ready to paste.`
  }
};

export const PROVIDERS = {
  deepseek: { label: "DeepSeek", env: "DEEPSEEK_API_KEY" },
  chatgpt: { label: "ChatGPT (Gips)", env: "OPENAI_API_KEY" },
  gemini: { label: "Gemini (Jimmy)", env: "GEMINI_API_KEY" },
  claude: { label: "Claude", env: "ANTHROPIC_API_KEY" }
};
export const providerReady = () => Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, !!process.env[p.env]]));
export function pickProvider(want) {
  const ready = providerReady();
  if (want && ready[want]) return want;
  return ["deepseek", "chatgpt", "gemini", "claude"].find((k) => ready[k]) || "";
}

// messages: [{ role: "user" | "assistant", content }]
export async function askAI(provider, system, messages, maxTokens = 3000) {
  const p = pickProvider(provider);
  if (!p) throw new Error("No AI is connected yet. Add DEEPSEEK_API_KEY (or OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY) in Netlify.");
  const key = process.env[PROVIDERS[p].env];
  let r, j;
  if (p === "deepseek" || p === "chatgpt") {
    const url = p === "deepseek" ? "https://api.deepseek.com/chat/completions" : "https://api.openai.com/v1/chat/completions";
    const model = p === "deepseek" ? (process.env.DEEPSEEK_MODEL || "deepseek-chat") : (process.env.OPENAI_MODEL || "gpt-4.1");
    r = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "system", content: system }, ...messages] }) });
    j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(PROVIDERS[p].label + ": " + ((j.error && j.error.message) || r.status));
    return { text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "", provider: p };
  }
  if (p === "gemini") {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, generationConfig: { maxOutputTokens: maxTokens },
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) }) });
    j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("Gemini: " + ((j.error && j.error.message) || r.status));
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    return { text: parts.map((x) => x.text || "").join(""), provider: p };
  }
  r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5", max_tokens: maxTokens, system, messages }) });
  j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Claude: " + ((j.error && j.error.message) || r.status));
  return { text: (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n"), provider: p };
}

// Web research for briefings and Linda (Brave Search). Returns [{ title, url, snippet }].
export async function webSearch(q, count = 6, freshness = "") {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return [];
  const u = new URL("https://api.search.brave.com/res/v1/web/search");
  u.searchParams.set("q", q); u.searchParams.set("count", String(count));
  if (freshness) u.searchParams.set("freshness", freshness);
  try {
    const r = await fetch(u, { headers: { Accept: "application/json", "X-Subscription-Token": key } });
    const j = await r.json();
    return ((j.web && j.web.results) || []).map((x) => ({ title: String(x.title || "").replace(/<[^>]+>/g, ""), url: x.url, snippet: String(x.description || "").replace(/<[^>]+>/g, "") }));
  } catch { return []; }
}
export const fmtResults = (label, rs) => `### ${label}\n` + (rs.length ? rs.map((x) => `- ${x.title} (${x.url}): ${x.snippet}`).join("\n") : "- (no search results available)");

// Read a website as plain text (homepage + its privacy / disclaimer / terms / accessibility / contact pages).
export async function readSite(raw) {
  let url = String(raw || "").trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const get = async (u) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    try { const r = await fetch(u, { signal: ctl.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; WebSwanReview/1.0)" } }); return r.ok ? (await r.text()).slice(0, 600000) : ""; }
    catch { return ""; } finally { clearTimeout(t); }
  };
  const text = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const home = await get(url);
  if (!home) throw new Error("Couldn't open " + url + ". Check the address.");
  const base = new URL(url);
  const links = [...home.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => { try { return { u: new URL(m[1], base).href, t: text(m[2]) + " " + m[1] }; } catch { return null; } })
    .filter((x) => x && new URL(x.u).host === base.host && /privacy|disclaimer|terms|legal|accessib|hipaa|notice|contact|intake|form/i.test(x.t));
  const pages = [...new Map(links.map((x) => [x.u.split("#")[0], x])).values()].slice(0, 5);
  const out = [{ url, text: text(home).slice(0, 12000) }];
  for (const p of pages) { const h = await get(p.u); if (h) out.push({ url: p.u, text: text(h).slice(0, 9000) }); }
  return out;
}

// Chat history per agent (shared across devices).
export async function history(agent) { return (await teamStore().get("chat-" + agent, { type: "json" })) || []; }
export async function addMessages(agent, msgs) {
  const s = teamStore(); const h = (await s.get("chat-" + agent, { type: "json" })) || [];
  for (const m of msgs) h.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), at: new Date().toISOString(), ...m });
  await s.setJSON("chat-" + agent, h.slice(-500));
  return h.slice(-500);
}
// Each agent has her own default "brain": DeepSeek is cheapest for drafting and content,
// Claude is more careful with legal reasoning, so Linda defaults to it (falls back to DeepSeek if no Claude key).
export const DEFAULT_BRAINS = { eva: "deepseek", tatiana: "deepseek", linda: "claude", rachel: "deepseek" };
export async function getSettings() {
  const s = Object.assign({ provider: "deepseek", competitors: [], compliancePhone: "(239) 667-0151", advertisingPhone: "(347) 646-7086" }, (await teamStore().get("settings", { type: "json" })) || {});
  s.brains = Object.assign({}, DEFAULT_BRAINS, s.brains || {});
  return s;
}
export const brainFor = (s, agent) => (s.brains && s.brains[agent]) || s.provider || "deepseek";
