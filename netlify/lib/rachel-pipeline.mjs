// Tania, Nov 24: "that workflow needs to be mandatory ... I don't need to babysit."
// Eva drafts the email (light grey or SwanDesk/advertising) -> Sebastien writes Rachel's word-for-word script for
// that prospect -> Rachel calls the next weekday at 8 AM Pacific. Before this, the hand-off to Sebastien was only a
// chat message (and the light grey queue skipped it entirely), so nothing actually scheduled Rachel's call. Now it is
// code, not memory: every Eva draft schedules Rachel's call right away, Sebastien's script is written by the server
// and saved ON the call itself, and if his script ever fails Rachel still calls with a safe script built from the facts.
import { getStore } from "@netlify/blobs";
import { AGENTS, askAI, brainFor, getSettings, addMessages } from "./team.mjs";

const vs = () => getStore({ name: "voice-studio", consistency: "strong" });
const digits = (p) => String(p || "").replace(/\D/g, "").slice(-10);
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b-\u001f<>]/g, " ").trim().slice(0, n);

// Next Monday-Thursday at 8:00 AM Pacific (Rachel's follow-ups never run on Friday or the weekend -- Tania's rule).
export function nextRachelSlot(from = new Date()) {
  const la = (d, o) => new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: "America/Los_Angeles" }, o)).format(d);
  for (let i = 1; i <= 7; i++) {
    const day = new Date(from.getTime() + i * 864e5);
    const wd = la(day, { weekday: "short" });
    if (["Fri", "Sat", "Sun"].includes(wd)) continue;
    const [m, d, y] = la(day, { year: "numeric", month: "2-digit", day: "2-digit" }).split("/").map(Number);
    let t = Date.UTC(y, m - 1, d, 16, 0, 0); // 8 AM PST
    const h = Number(la(new Date(t), { hour: "numeric", hourCycle: "h23" }));
    t += (8 - h) * 3600e3; // 8 AM PDT when daylight time applies
    return new Date(t).toISOString();
  }
  return new Date(from.getTime() + 864e5).toISOString();
}

export function kindOf(text) {
  return /advertis|swandesk|swan desk|media network|directory|visibility|ai receptionist|ai employee/i.test(String(text || "")) ? "advertising" : "compliance";
}

// Used when Sebastien's script isn't there (AI error) -- built only from facts on the record, never invented.
export function fallbackRachelScript(c) {
  const who = c.kind === "advertising" ? "Sebastien, our marketing director" : "Jonathan, our compliance coordinator";
  const what = c.kind === "advertising" ? "the information Tania emailed about getting more visibility for the business" : "the website compliance review Tania emailed";
  return `1. "Hi, this is Rachel Bennett with WebSwan. How are you today?" [PAUSE]
2. "I'm following up on ${what}${c.email ? " to " + c.email : ""}. Did you get a chance to see it?" [PAUSE]
3. Yes: "Great. The next step is a quick 10-minute call with ${who}, to walk you through it. What day and time works best?" Book it.
   No: "No problem, I can resend it. Is ${c.email || "this the best email"} still the right email?" Then offer the 10-minute call.
4. Only mention findings written in the details. Never invent a finding, a price or a promise.
5. "Who am I speaking with?" [PAUSE] "Thanks, [their name]. Have a great day."`;
}

// Sebastien writes Rachel's script for this prospect. Returns "" on any failure (the call still happens).
export async function sebastienScript(c, emailText) {
  try {
    const s = await getSettings();
    const ask = `MANDATORY TASK (Tania's standing workflow, runs automatically): Eva just drafted Tania's email to this prospect. Write RACHEL'S word-for-word follow-up call script for this one prospect. Rachel calls them ${new Date(c.callAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "long", hour: "numeric", minute: "2-digit" })} Pacific.
Business: ${c.business || "(unknown)"} | Contact: ${c.name || "(unknown)"} | State: ${c.state || "?"} | Website: ${c.website || "(none)"} | Email sent to: ${c.email || "?"}
Type: ${c.kind === "advertising" ? "advertising / SwanDesk / WebSwan Media Network -- the appointment is a call with Sebastien" : "compliance -- the appointment is a 10-minute review call with Jonathan, our compliance coordinator"}
Findings / notes on file: ${c.note || "(none)"}
WHAT THE EMAIL SAID:
${String(emailText || "").slice(0, 2500)}
RULES: plain text only, no markdown. 6 to 9 short numbered lines; spoken words in "quotes", silent directions in [brackets], a [PAUSE] after each question. Open: "Hi, this is Rachel Bennett with WebSwan." Reference the email and the 1 or 2 strongest REAL findings above (never invent one). Goal: book the 10-minute appointment (day and time). If they didn't get the email, confirm the address. Prices: only ones written in the email. Never give legal advice. End by asking their name and thanking them. Under 1,400 characters. Output ONLY the script.`;
    const ans = await askAI(brainFor(s, "sebastien"), AGENTS.sebastien.system, [{ role: "user", content: ask }], 900);
    const t = String((ans && ans.text) || "").replace(/```[a-z]*|```/g, "").trim();
    return t.length >= 80 ? t.slice(0, 1600) : "";
  } catch (e) { return ""; }
}

// Called from every Eva draft. Never throws.
export async function queueRachelFollowup({ name, business, phone, email, state, website, findings, emailText, subject }) {
  try {
    if (digits(phone).length !== 10) return { ok: false, why: "no valid phone number" };
    const st = vs();
    const list = (await st.get("rachel-followups", { type: "json" })) || [];
    let c = list.find((x) => x.status === "scheduled" && (digits(x.phone) === digits(phone) || (email && x.email && x.email.toLowerCase() === String(email).toLowerCase())));
    if (!c) { c = { id: "rf_" + Math.random().toString(36).slice(2, 10), status: "scheduled", createdAt: new Date().toISOString(), source: "eva-auto" }; list.push(c); }
    Object.assign(c, {
      name: clean(name, 120), business: clean(business, 160), phone: clean(phone, 40), email: clean(email, 160), state: clean(state, 2).toUpperCase(),
      website: clean(website, 300), note: clean(findings, 900), kind: kindOf((subject || "") + " " + (emailText || "")), callAt: nextRachelSlot()
    });
    c.script = await sebastienScript(c, emailText);
    c.scriptBy = c.script ? "sebastien" : "fallback";
    await st.setJSON("rachel-followups", list.slice(-500));
    try {
      await addMessages("sebastien", [{ role: "agent", kind: "rachel_script", text: `## 📞 Rachel's script is ready (automatic)\n**${c.business || c.email}** · Rachel calls ${new Date(c.callAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} PT · ${c.kind === "advertising" ? "appointment for Sebastien" : "appointment for Jonathan"}\n\n${c.script || "(I couldn't write it this time, so Rachel will use the safe standard follow-up script.)"}` }]);
    } catch (e) {}
    return { ok: true, id: c.id, callAt: c.callAt, script: !!c.script };
  } catch (e) { return { ok: false, why: String(e.message || e).slice(0, 200) }; }
}
