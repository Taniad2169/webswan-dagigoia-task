// Agents that act on their own (Tania, Nov 13): no more Tania in the middle.
//  - Any AI Office agent can message a teammate: ((ASK: Jonathan | the complete message)). The note lands in the teammate's
//    chat, the teammate answers in the background, and the answer comes back to the asker's chat, who then continues.
//  - Eva can act on Tania's Gmail herself: drafts, replies (drafts), moving junk to Trash, cleaning spam/promotions/social.
//    Drafts are never sent: Tania reviews and sends. Trash keeps emails 30 days; nothing is deleted forever.
//  - Tania, Nov 14: ANY agent can schedule a task (its own, or shared with a teammate like Tatiana + Jenna) to start
//    automatically at a day/hour she gives, even if nobody is there: ((SCHEDULE: ...)). See scheduleAssignment() below.
import { AGENTS, addMessages, teamStore, history } from "./team.mjs";

// Tania, Nov 13: never touch starred/important mail, clients, leads, banks, invoices or appointments.
const SAFE = " -is:starred -is:important -subject:(invoice OR receipt OR payment OR statement OR appointment OR contract OR audit OR proposal) -from:(bank OR chase OR wellsfargo OR stripe OR paypal OR netlify OR google.com)";
export const CLEAN_Q = { spam: "in:spam", promotions: "category:promotions in:inbox older_than:2d" + SAFE, social: "category:social in:inbox older_than:2d" + SAFE, old: "in:inbox is:read older_than:30d" + SAFE };
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").slice(0, n);
export const MAX_HOPS = 4; // a conversation between agents stops after this many back-and-forths
const first = (k) => String((AGENTS[k] || {}).name || k).split(" ")[0];
// first names (and old desk names) -> agent keys
export function agentKeyByName(n) {
  const w = String(n || "").trim().toLowerCase().split(/\s+/)[0];
  if (!w) return "";
  if (w === "linda") return AGENTS.linda ? "linda" : "";
  if (w === "kobe") return AGENTS.sdr ? "sdr" : "";
  return Object.keys(AGENTS).find((k) => k === w || first(k).toLowerCase() === w) || "";
}

export function actionsHelp(agent) {
  const mates = Object.keys(AGENTS).filter((k) => k !== agent).map((k) => first(k) + " (" + clean(AGENTS[k].role, 60) + ")").join(", ");
  let t = "\n\nTALK TO YOUR TEAMMATES YOURSELF (no need for Tania in the middle). When you need a teammate's part (legal review from Jonathan, cost from Clara, a picture from Jimmy, a post from Tatiana, email or calendar from Eva, call coaching from Kobe...), end your answer with ONE line in exactly this form:\n((ASK: <teammate first name> | <the complete, standalone message: what you need, all the details and any text they must review>))\nTheir answer comes back to your chat automatically and you continue from it. Tell Tania in one short line that you asked them. Only ask when you truly need them; never ask about something you can do yourself. Teammates: " + mates + ".";
  if (agent === "eva") t += "\n\nTANIA'S GMAIL: YOU CAN ACT ON IT YOURSELF. When Tania asks (or it is clearly part of the job she gave you), end your answer with one line per action:\n((GMAIL: draft | <to email> | <subject> | <full email body>))  saves a draft in Tania's Gmail (never sent; Tania reviews and sends)\n((GMAIL: reply | <threadId> | <full reply body>))  saves a reply draft in that thread\n((GMAIL: trash | <threadId>, <threadId>, ...))  moves those emails to Trash (Gmail keeps them 30 days)\n((GMAIL: clean | spam))  or promotions, social, old: clears that whole category to Trash\nUse threadIds from the email data you were given. Never claim it is done before the confirmation line appears; the system adds ✅ or ❌ after each action. Never trash an email from a lead, a client, a payment or a security notice.";
  t += "\n\nSTART A TASK AT A GIVEN DAY/HOUR, EVEN WITH NOBODY AROUND: when Tania gives you a task (yours alone, or a weekly/shared assignment with a teammate like Jenna or Tatiana) and tells you the day and time to start, end your answer with ONE line in exactly this form:\n((SCHEDULE: <your own first name>[, <teammate first name>, ...] | <YYYY-MM-DD HH:MM> | <the complete, standalone task: what to do, for whom, and any detail a cold start would need>))\nAlways resolve the day to an actual calendar date yourself (you were told today's date above) and use 24-hour Pacific time, e.g. a Monday 9am becomes \"2026-11-17 09:00\". At that moment, each teammate you listed gets this task dropped into their own chat and wakes up on it automatically, with no one needing to prompt them; if you listed more than one teammate, each starts at the same time and should message the other with ((ASK: ...)) for whatever part is theirs, exactly like a normal handoff. Tell Tania in one short line what you scheduled and for when (Pacific time). Only use this when she actually gave a day/time to start; for \"right now\" work, just do it.";
  return t;
}
// Tania, Nov 14: stores a scheduled assignment; team-schedule.mjs wakes the listed agent(s) up at runAt, automatically,
// by dropping the task into each one's own chat (as if Tania had just typed it) and triggering their reply job.
export async function scheduleAssignment({ agents, runAt, task }) {
  const st = teamStore(), list = (await st.get("team-assignments", { type: "json" })) || [];
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  list.push({ id, agents, runAt, task, createdAt: new Date().toISOString(), status: "pending" });
  await st.setJSON("team-assignments", list.slice(-200));
  return id;
}
// "2026-11-17 09:00" (Pacific wall-clock) -> the correct UTC instant, without a timezone library.
function ptToUtc(dateStr, timeStr) {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`);
  if (isNaN(guess)) return null;
  const asPT = new Date(guess.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  return new Date(guess.getTime() + (guess.getTime() - asPT.getTime()));
}

// Pull the action lines out of an agent's answer and carry them out. Returns the cleaned text plus the result lines.
export async function runActions(agent, text, ctx) {
  const { scriptCall, startJobs, hop = 0 } = ctx || {};
  const acts = [];
  let out = String(text || "")
    .replace(/\(\(\s*ASK:\s*([\s\S]*?)\s*\)\)/gi, (m, p) => { acts.push({ kind: "ask", raw: p }); return ""; })
    .replace(/\(\(\s*GMAIL:\s*([\s\S]*?)\s*\)\)/gi, (m, p) => { acts.push({ kind: "gmail", raw: p }); return ""; })
    .replace(/\(\(\s*SCHEDULE:\s*([\s\S]*?)\s*\)\)/gi, (m, p) => { acts.push({ kind: "schedule", raw: p }); return ""; })
    .replace(/\n{3,}/g, "\n\n").trim();
  const done = [];
  for (const a of acts.slice(0, 6)) {
    try {
      if (a.kind === "ask") {
        const i = a.raw.indexOf("|"), to = agentKeyByName(i > 0 ? a.raw.slice(0, i) : ""), msg = clean(i > 0 ? a.raw.slice(i + 1) : "", 8000).trim();
        if (!to || to === agent) { done.push("⚠️ I couldn't find that teammate, so nothing was sent."); continue; }
        if (!msg) { done.push("⚠️ My message to " + first(to) + " was empty, so nothing was sent."); continue; }
        if (hop >= MAX_HOPS) { done.push("⏸ " + first(to) + " and I have gone back and forth enough for now; Tania, please step in."); continue; }
        // Tania, Nov 17: files travel between teammates too. When the note talks about a file/report/picture, the latest file on
        // the sender's desk goes along with it (the same way a file goes when Tania hands one over).
        let pass = null;
        if (/\b(file|attach\w*|pdf|report|document|doc|picture|image|photo|screenshot|spreadsheet|sheet)\b/i.test(msg)) { try { pass = ((await history(agent)).slice(-10).reverse().find((m) => m.file && m.file.id) || {}).file || null; } catch (e) { pass = null; } }
        await addMessages(to, [{ role: "user", kind: "agentmsg", from: agent, hop: hop + 1, ...(pass ? { file: pass } : {}), text: "📨 From " + first(agent) + " (teammate):\n\n" + msg + (pass ? "\n📎 " + pass.name : "") }]);
        let started = true; try { await startJobs(["relay:" + to + "|" + agent + "|" + (hop + 1)]); } catch (e) { started = false; }
        done.push(started ? "📨 Asked " + first(to) + ". Their answer will appear here in a minute or two." : "📨 Left the message in " + first(to) + "'s chat, but they couldn't be woken up automatically (" + "background worker unavailable" + ").");
      } else if (a.kind === "schedule") {
        const parts = a.raw.split("|").map((x) => x.trim());
        const names = (parts[0] || "").split(",").map((x) => agentKeyByName(x)).filter(Boolean);
        if (!names.includes(agent)) names.unshift(agent); // the agent writing this is always in on it
        const uniq = [...new Set(names)];
        const when = (parts[1] || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
        const task = clean(parts.slice(2).join("|"), 4000).trim();
        if (!uniq.length) { done.push("⚠️ I couldn't tell who this was for, so nothing was scheduled."); continue; }
        if (!when || !task) { done.push("⚠️ I need a clear date, time and task to schedule this, so nothing was saved."); continue; }
        const runAt = ptToUtc(when[1], when[2].padStart(2, "0") + ":" + when[3]);
        if (!runAt || isNaN(runAt) || runAt.getTime() < Date.now() - 5 * 60e3) { done.push("⚠️ That date/time didn't make sense, so nothing was scheduled."); continue; }
        await scheduleAssignment({ agents: uniq, runAt: runAt.toISOString(), task });
        const whenLabel = runAt.toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        done.push("📅 Scheduled for " + uniq.map(first).join(" + ") + " — starts automatically on " + whenLabel + " PT, no one needs to be around.");
      } else if (a.kind === "gmail") {
        if (agent !== "eva") { done.push("⚠️ Only Eva works in Tania's Gmail."); continue; }
        const parts = a.raw.split("|").map((x) => x.trim()), op = (parts[0] || "").toLowerCase();
        if (op === "draft") {
          const to = parts[1] || "", subject = clean(parts[2] || "", 200), body = clean(parts.slice(3).join("|"), 30000).trim();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { done.push("❌ No draft saved: \"" + clean(to, 80) + "\" isn't a valid email address."); continue; }
          const html = body.split(/\n{2,}/).map((p) => "<p>" + p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>") + "</p>").join("");
          const r = await scriptCall({ action: "draft", to, subject, text: body, html, fromName: "Tania | WebSwan" });
          done.push(r && r.ok ? "✅ Draft saved in your Gmail to **" + to + "**: \"" + subject + "\". Open Gmail → Drafts to review and send." : "❌ The draft was NOT saved (" + ((r && r.error) || "no confirmation from Gmail") + ").");
        } else if (op === "reply") {
          const tid = clean(parts[1] || "", 100), body = clean(parts.slice(2).join("|"), 30000).trim();
          const r = await scriptCall({ action: "reply_draft", threadId: tid, text: body });
          done.push(r && r.ok ? "✅ Reply draft saved in that email thread (Gmail → Drafts)." : "❌ The reply draft was NOT saved (" + ((r && r.error) || "no confirmation") + ").");
        } else if (op === "trash") {
          const ids = (parts[1] || "").split(/[\s,]+/).map((x) => clean(x, 40)).filter((x) => /^[\w-]{6,40}$/.test(x)).slice(0, 300);
          if (!ids.length) { done.push("❌ Nothing moved: I didn't have the email IDs."); continue; }
          const r = await scriptCall({ action: "trash", ids });
          done.push("🧹 Moved **" + ((r && r.moved) || 0) + "** of " + ids.length + " emails to Trash (Gmail keeps them 30 days).");
        } else if (op === "clean") {
          // Listing and trashing in one chat request runs past Netlify's 30 seconds, so cleaning runs as a background job in small batches.
          const kind = (parts[1] || "").toLowerCase().trim().replace("junk", "spam");
          if (!CLEAN_Q[kind]) { done.push("❌ I can clean spam, promotions, social or old read emails."); continue; }
          if (!startJobs) { done.push("❌ Cleaning couldn't start here."); continue; }
          await startJobs(["eva_clean:" + kind]);
          done.push("🧹 Cleaning **" + kind + "** now in the background; I'll post how many I moved to Trash in a few minutes.");
        } else done.push("❌ I don't know the Gmail action \"" + clean(op, 30) + "\".");
      }
    } catch (e) { done.push("❌ That didn't go through (" + clean(e.message || e, 140) + ")."); }
  }
  return { text: out + (done.length ? "\n\n" + done.join("\n") : ""), done };
}
