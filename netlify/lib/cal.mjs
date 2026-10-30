// Shared calendar helpers for Voice Studio (used by voice-calls and voice-tools).
// Tania's Google Calendar is reached through a small Google Apps Script web app that she deploys
// from her own Google account ("WebSwan Calendar Bridge"). It answers two things only:
//   busy   -> her busy times (Google free/busy, so appointment-schedule bookings count as busy)
//   create -> add one 10-minute onboarding to her calendar and email the invite
// The script and this server share a long random secret saved in Netlify Blobs (never in code).

export const STATE_TZ = { AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago", CA: "America/Los_Angeles", CO: "America/Denver", CT: "America/New_York", DE: "America/New_York", DC: "America/New_York", FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu", ID: "America/Boise", IL: "America/Chicago", IN: "America/Indiana/Indianapolis", IA: "America/Chicago", KS: "America/Chicago", KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York", MD: "America/New_York", MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago", MS: "America/Chicago", MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago", NV: "America/Los_Angeles", NH: "America/New_York", NJ: "America/New_York", NM: "America/Denver", NY: "America/New_York", NC: "America/New_York", ND: "America/Chicago", OH: "America/New_York", OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York", SC: "America/New_York", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", UT: "America/Denver", VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles", WV: "America/New_York", WI: "America/Chicago", WY: "America/Denver" };
const TZ_NAME = { "America/New_York": "Eastern", "America/Detroit": "Eastern", "America/Indiana/Indianapolis": "Eastern", "America/Chicago": "Central", "America/Denver": "Mountain", "America/Boise": "Mountain", "America/Phoenix": "Arizona", "America/Los_Angeles": "Pacific", "America/Anchorage": "Alaska", "Pacific/Honolulu": "Hawaii" };
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const DEFAULT_CAL = { scriptUrl: "", days: ["mon", "tue", "wed", "thu", "fri"], start: "09:00", end: "16:00", tz: "America/Los_Angeles", minutes: 10, gap: 10, noticeHours: 3, daysAhead: 5, title: "WebSwan onboarding with Tania (10 min)" };

export function tzFor(stateOrTz) {
  const s = String(stateOrTz || "").trim();
  if (STATE_TZ[s.toUpperCase()]) return STATE_TZ[s.toUpperCase()];
  if (TZ_NAME[s]) return s;
  return "America/New_York";
}
export const tzLabel = (tz) => TZ_NAME[tz] || tz;

// minutes from midnight + weekday of a moment in a time zone
function parts(d, tz) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return { day: String(g("weekday")).slice(0, 3).toLowerCase(), y: +g("year"), m: +g("month"), d: +g("day"), mins: +g("hour") * 60 + +g("minute") };
}
// the UTC moment for a wall-clock time (y-m-d hh:mm) in a time zone
function zonedToUtc(y, m, d, mins, tz) {
  let guess = Date.UTC(y, m - 1, d, Math.floor(mins / 60), mins % 60);
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(guess), tz);
    const diff = (Date.UTC(p.y, p.m - 1, p.d, Math.floor(p.mins / 60), p.mins % 60) - Date.UTC(y, m - 1, d, Math.floor(mins / 60), mins % 60));
    if (!diff) break; guess -= diff;
  }
  return new Date(guess);
}
const toMins = (s) => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : -1; };

export function sanitizeCal(c) {
  const out = Object.assign({}, DEFAULT_CAL, c || {});
  out.days = (Array.isArray(out.days) ? out.days : DEFAULT_CAL.days).filter((d) => DAYS.includes(d));
  if (toMins(out.start) < 0 || toMins(out.end) <= toMins(out.start)) { out.start = DEFAULT_CAL.start; out.end = DEFAULT_CAL.end; }
  if (!TZ_NAME[out.tz]) out.tz = DEFAULT_CAL.tz;
  out.minutes = Math.max(5, Math.min(60, parseInt(out.minutes, 10) || 10));
  out.gap = Math.max(0, Math.min(60, parseInt(out.gap, 10) || 0));
  out.noticeHours = Math.max(1, Math.min(72, parseInt(out.noticeHours, 10) || 3));
  out.daysAhead = Math.max(1, Math.min(14, parseInt(out.daysAhead, 10) || 5));
  out.title = String(out.title || DEFAULT_CAL.title).slice(0, 120);
  out.scriptUrl = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(out.scriptUrl || "").trim()) ? String(out.scriptUrl).trim() : "";
  return out;
}

export async function callScript(cal, secret, body) {
  if (!cal.scriptUrl) throw new Error("The calendar isn't connected yet.");
  const r = await fetch(cal.scriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ secret }, body)), redirect: "follow" });
  const text = await r.text();
  let d; try { d = JSON.parse(text); } catch (e) { throw new Error("The calendar script didn't answer correctly (is it deployed as a web app for 'Anyone'?)."); }
  if (d.error) throw new Error("Calendar: " + d.error);
  return d;
}

// every open start time in the next daysAhead allowed days, as Date objects
export function openSlots(cal, busy, now = new Date()) {
  const step = cal.minutes + cal.gap, startM = toMins(cal.start), endM = toMins(cal.end);
  const earliest = now.getTime() + cal.noticeHours * 3600e3;
  const B = (busy || []).map((b) => [new Date(b.start).getTime() - cal.gap * 60e3, new Date(b.end).getTime() + cal.gap * 60e3]);
  const out = []; let counted = 0;
  for (let i = 0; i < 21 && counted < cal.daysAhead; i++) {
    const p = parts(new Date(now.getTime() + i * 864e5), cal.tz);
    if (!cal.days.includes(p.day)) continue;
    counted++;
    for (let m = startM; m + cal.minutes <= endM; m += step) {
      const s = zonedToUtc(p.y, p.m, p.d, m, cal.tz), e = s.getTime() + cal.minutes * 60e3;
      if (s.getTime() < earliest) continue;
      if (B.some(([a, b]) => s.getTime() < b && e > a)) continue;
      out.push(s);
    }
  }
  return out;
}

// pick a few easy-to-say choices: up to 2 per day (the earliest, and one a couple of hours later), max 6
export function pickChoices(slots, leadTz) {
  const byDay = new Map();
  for (const s of slots) {
    const p = parts(s, leadTz), k = p.y + "-" + p.m + "-" + p.d;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push({ s, mins: p.mins });
  }
  const out = [];
  for (const list of byDay.values()) {
    const first = list[0], later = list.find((x) => x.mins >= first.mins + 150) || (list.length > 3 ? list[list.length - 1] : null);
    [first, later].filter(Boolean).forEach((x) => out.push(x.s));
    if (out.length >= 6) break;
  }
  return out.slice(0, 6);
}

export function say(d, tz) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d).replace(/:00 /, " ") + " " + tzLabel(tz) + " time";
}

// is this start time one of Tania's allowed, still-open slots?
export function slotAllowed(cal, busy, start, now = new Date()) {
  const t = start.getTime();
  return openSlots(cal, busy, now).some((s) => s.getTime() === t);
}

export function busyWindow(cal, now = new Date()) {
  return { from: new Date(now.getTime()).toISOString(), to: new Date(now.getTime() + 21 * 864e5).toISOString() };
}

// Apps Script code Tania pastes into script.google.com (secret filled in for her)
export function scriptCode(secret) {
  return `// WebSwan Calendar Bridge: lets the agents check Tania's free times, book onboardings, and email practices (Jennifer's lead and call notices).
// Paste into script.google.com > New project, then Deploy > New deployment > Web app
// (Execute as: Me, Who has access: Anyone). Copy the Web app URL into Voice Studio.
const SECRET = '${secret}';
function doPost(e) {
  var b = {};
  try { b = JSON.parse(e.postData.contents); } catch (x) {}
  if (b.secret !== SECRET) return out({ error: 'not allowed' });
  try {
    if (b.action === 'ping') return out({ ok: true, account: Session.getEffectiveUser().getEmail(), calendar: CalendarApp.getDefaultCalendar().getName() });
    if (b.action === 'busy') {
      var r = UrlFetchApp.fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        payload: JSON.stringify({ timeMin: b.from, timeMax: b.to, items: [{ id: 'primary' }] })
      });
      var j = JSON.parse(r.getContentText());
      if (!j.calendars) return out({ error: 'free/busy failed' });
      return out({ busy: j.calendars.primary.busy || [] });
    }
    if (b.action === 'create') {
      var s = new Date(b.start), en = new Date(b.end);
      var opts = { description: String(b.description || '').slice(0, 4000) };
      if (b.email && /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(b.email)) { opts.guests = b.email; opts.sendInvites = true; }
      var ev = CalendarApp.getDefaultCalendar().createEvent(String(b.title || 'Onboarding').slice(0, 200), s, en, opts);
      ev.addPopupReminder(10);
      return out({ ok: true, id: ev.getId() });
    }
    if (b.action === 'mail') {
      if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(String(b.to || ''))) return out({ error: 'bad recipient' });
      MailApp.sendEmail({ to: b.to, subject: String(b.subject || '').slice(0, 200), htmlBody: String(b.html || '').slice(0, 20000), name: String(b.fromName || 'WebSwan Media Network').slice(0, 80), replyTo: b.replyTo || undefined });
      return out({ ok: true });
    }
    return out({ error: 'unknown action' });
  } catch (err) { return out({ error: String(err && err.message || err) }); }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
// Run this once from the editor (select setup, press Run) to approve calendar access.
function setup() { CalendarApp.getDefaultCalendar().getName(); UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true }); MailApp.getRemainingDailyQuota(); }
`;
}
