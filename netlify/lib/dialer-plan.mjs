// Tania, Nov 16: "pull all the other agents off the dialer starting tomorrow morning — none of them call besides Jenna
// and George. This week I'm pushing with Jenna and George." While a plan is active it OVERRIDES the schedule saved in
// Voice Studio: only the agents listed here dial, each in their own windows (Pacific time), 25 leads per window.
// Every other caller is silent: no campaign calls, no Alek callbacks, no Rachel follow-up calls, no Jennifer calls.
// Rachel still ANSWERS inbound calls. To end the plan early, set end to a past date (or delete the plan) and redeploy.
export const DIALER_PLAN = {
  start: "2026-11-17", end: "2026-11-20",          // Tue Nov 17 – Fri Nov 20 (Fridays never dial anyway)
  tz: "America/Los_Angeles",
  agents: {
    // Jenna: website compliance, DOCTORS, English. She takes the queued English doctor-compliance leads (Monica's line).
    jenna: { windows: [["07:00", "08:00"], ["12:30", "13:45"]], perWindow: 25, lang: "en", takes: ["monica"], campaign: "Website compliance · doctors (English)" },
    // George: website compliance, ATTORNEYS. Tania, Nov 16 (later): 12 in the morning window, 13 in the afternoon, and he
    // calls his attorney leads in whatever language they're marked (the 27 she sent from Prospector come in as English).
    george: { windows: [["08:00", "09:00"], ["12:30", "13:45"]], perWindow: [12, 13], lang: "any", takes: ["george"], campaign: "Website compliance · attorneys",
      addedSince: "2026-11-17T00:00:00Z" } // only the attorney leads Tania sends tonight (Nov 16, after 4 PM PT), not his older queue
  }
};
const ymd = (tz) => new Date().toLocaleDateString("en-CA", { timeZone: tz });
export function planActive(plan = DIALER_PLAN) { if (!plan) return false; const d = ymd(plan.tz); return d >= plan.start && d <= plan.end; }
// May this agent place any outbound call right now (callbacks, follow-ups, campaigns)?
export function callerAllowed(agent) { return !planActive() || !!DIALER_PLAN.agents[String(agent || "").toLowerCase().split("_")[0]]; }
// Which plan caller (if any) dials this queued lead.
export function planCallerFor(lead) {
  const owner = String(lead.agent || "").toLowerCase(), lang = ["es", "pt"].includes(lead.lang) ? lead.lang : "en";
  for (const [name, a] of Object.entries(DIALER_PLAN.agents)) if (a.takes.includes(owner) && (a.lang === "any" || a.lang === lang) && (!a.addedSince || Number(lead.addedAt || 0) >= Date.parse(a.addedSince))) return name;
  return "";
}
// How many calls this agent places in window number i (perWindow can be one number or one per window).
export function planCap(name, i) { const a = DIALER_PLAN.agents[name]; if (!a) return 0; return Array.isArray(a.perWindow) ? (a.perWindow[i] || 0) : a.perWindow; }
// Index of the plan window this agent is in right now (-1 = not their time).
export function planWindow(name, mins) {
  const a = DIALER_PLAN.agents[name]; if (!a) return -1;
  const t = (s) => { const m = String(s).match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : -1; };
  return a.windows.findIndex(([x, y]) => mins >= t(x) && mins < t(y));
}
// Jenna normally works from Tania's brief (the "task" variable). For the doctor campaign she gets the compliance call.
export const JENNA_COMPLIANCE_TASK = `WEBSITE COMPLIANCE CALL TO A DOCTOR'S PRACTICE (English). You call for WebSwan Digital Solutions.
After a live person greets you: "Hi, this is Jenna, how are you today?" (if no answer in about 2 seconds, keep going). Then: "I don't know if I'm talking to the right person, but our compliance audit tech at WebSwan Digital Solutions ran an audit on the practice's website and found a few ADA and privacy issues that can lead to state penalties or lawsuits." Mention one or two findings from the lead's notes ({{findings}}) only if you have them.
Goal: a quick 10-minute review with the doctor or office manager on Tania's calendar (use check_availability / book_appointment if you have them). If they can't decide or ask detailed questions, give Rachel's number, (316) 248-6839: she is our audit tech and answers any question about website regulations, penalties and lawsuits. If they won't give an email, offer the appointment instead. Never state a price. Thank them and wait for their goodbye before hanging up.`;
