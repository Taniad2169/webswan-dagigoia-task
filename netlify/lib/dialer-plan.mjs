// Tania, Nov 16: "pull all the other agents off the dialer starting tomorrow morning — none of them call besides Jenna
// and George. This week I'm pushing with Jenna and George." While a plan is active it OVERRIDES the schedule saved in
// Voice Studio: only the agents listed here dial, each in their own windows (Pacific time), 25 leads per window.
// Every other caller is silent: no campaign calls, no Alek callbacks, no Rachel follow-up calls, no Jennifer calls.
// Rachel still ANSWERS inbound calls. To end the plan early, set end to a past date (or delete the plan) and redeploy.
// Tania, Nov 21: new week's plan -- Jenna, George (Spanish) and Rebecca push the Modesto Real Estate / Sentinel DIY
// batch, 24 leads/day each (72/day total). Alek and Monica are "on vacation" this week -- same mechanism as before
// (not listed here = silent), so neither of them places or receives a single call Mon-Thu this week, with zero
// risk of also silencing Jenna/George/Rebecca (the only other lever available, a global pause, would have done that).
export const DIALER_PLAN = {
  start: "2026-11-23", end: "2026-11-26",          // Mon Nov 23 – Thu Nov 26
  tz: "America/Los_Angeles",
  agents: {
    // Jenna: 2 campaigns/day (Tania, Nov 21) -- window 1 is the Atlanta chiropractor website-compliance audit
    // (her usual pitch, takes leads sourced under "monica" same as before), window 2 is the Modesto Real Estate
    // Sentinel DIY push (leads queued under her own name). planTaskFor() reads each lead's own campaign tag, so
    // mixing two lead types under one agent is safe -- every lead still gets the right script.
    jenna: { windows: [["07:00", "08:00"], ["12:30", "13:45"]], perWindow: 24, lang: "en", takes: ["jenna", "monica"], campaign: "Website compliance (chiropractors) + Modesto RE Sentinel DIY" },
    // George: same two-campaign split, opens in Spanish for the Sentinel DIY leads (switches to English if they
    // answer in English); his Atlanta attorney leads come in English already.
    george: { windows: [["08:00", "09:00"], ["12:30", "13:45"]], perWindow: 24, lang: "any", forceLang: "es",
      takes: ["george"], campaign: "Website compliance (attorneys) + Modesto RE Sentinel DIY (Spanish)" },
    // Rebecca: Sentinel DIY most days; Wed she pitches WSMN advertising + SwanDesk AI instead (Jenna covers Sentinel
    // DIY that day). Which script she reads comes from the lead's own campaign tag (see planTaskFor below), not the
    // day of week, so whichever leads are actually queued for her on a given day get the right pitch automatically.
    rebecca: { windows: [["11:00", "13:00"]], perWindow: 24, lang: "en", takes: ["rebecca"], campaign: "Sentinel DIY / WSMN advertising + SwanDesk AI" }
  }
};
const ymd = (tz) => new Date().toLocaleDateString("en-CA", { timeZone: tz });
export function planActive(plan = DIALER_PLAN) { if (!plan) return false; const d = ymd(plan.tz); return d >= plan.start && d <= plan.end; }
// Tania, Nov 21: "a box to tick on or off for the agents" -- a manual, per-agent silence switch she sets herself
// from Voice Studio (a day, a week, a few days), independent of the weekly DIALER_PLAN above. Stored as
// { agentName: "YYYY-MM-DD" } in the queue blob's silencedAgents field (set via voiceApi action agent_silence) --
// the date is the LAST day that agent stays silent (inclusive), checked in her own time zone.
export function agentSilencedToday(agent, silencedAgents, tz = "America/Los_Angeles") {
  const until = silencedAgents && silencedAgents[String(agent || "").toLowerCase().split("_")[0]];
  return !!until && ymd(tz) <= String(until);
}
// May this agent place any outbound call right now (callbacks, follow-ups, campaigns)?
export function callerAllowed(agent, silencedAgents) {
  if (agentSilencedToday(agent, silencedAgents)) return false;
  return !planActive() || !!DIALER_PLAN.agents[String(agent || "").toLowerCase().split("_")[0]];
}
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
OPEN: "Hi there, how's it going? This is Jenna." (if no answer in about 2 seconds, keep going anyway). Then: by the way, this call is being recorded for quality control -- our compliance audit tech ran a free review of the practice's website and found a few ADA accessibility and privacy issues that can lead to state penalties or lawsuits. Mention one or two findings from the lead's notes ({{findings}}) only if you have them.
YOUR FIRST AND MOST IMPORTANT GOAL (Tania, Nov 19): get a real email address from them before anything else. Ask for it plainly -- "Can I get your email so we can send over exactly what we found?" Don't move on until you have it or they clearly refuse it.
Once you have the email: ask who is the best person to talk to -- our website compliance audit director, Jonathan -- for a quick 10-minute review. It doesn't matter which day, you need the best TIME: ask if their practice has an admin day (a day with no patients, like some practices have) and whether that's part of their culture too, or otherwise just ask for the best time of day for a 10-minute call with Jonathan. Use check_availability / book_appointment if you have them.
If you can't land a scheduled time: give them Jonathan's direct number, (316) 248-6839, and create real urgency -- state penalties and lawsuits are like COVID-19, they sneak up without warning, and we've already spoken with other doctors who got penalized and by then it was too late to help them. It's imperative they contact him.
IF THEY ASK WHETHER YOU'RE AN AI, A ROBOT, OR WHY THE CALL IS RECORDED: say yes, plainly -- you were well trained by WDS, a certified web developer experienced in state compliance penalties who knows how to build the banners and buttons that protect a practice's digital assets, and everything you say is backed by resources that can be emailed over for them to review. Then ask: "Would you prefer to talk to the founder instead?" -- pause about 3 seconds for an answer; if there's no answer, keep going with the review and explanation.
If they seem hesitant or not really interested in the review itself (not the same as the AI question above): offer Sebastien instead -- "we also have Sebastien, our marketing director -- do you have a minute to talk with him now?" If not, ask for the best time of day he can call them back, so we can figure out why this isn't landing for them.
Never state a price. Thank them and wait for their goodbye before hanging up.
QUALIFY AS YOU GO (one natural question at a time, never like a form): is this an owner-run practice; who decides about the website (the doctor or the office manager) and their name; does the issue matter to them; how soon they want it looked at. If it is a hospital, a chain, or the doctor is an employee there, be polite, end the call and note why. Never ask about budget. If they ask something you don't know, don't guess: say Jonathan or Tania will get them the exact answer.`;
// George normally works from Tania's brief too. For the attorney campaign he gets the compliance call -- opens in
// Spanish, switches to English only if the person answers in English (Tania, Nov 16).
export const GEORGE_COMPLIANCE_TASK = `WEBSITE COMPLIANCE CALL TO A LAW FIRM. You call for WebSwan Digital Solutions. OPEN IN SPANISH. If the person answers you in English, switch to English for the rest of the call and stay in English. If they answer in Spanish, stay in Spanish the whole call.
Spanish open: "Hola, ¿qué tal? Habla George." (if no answer in about 2 seconds, keep going anyway). English equivalent if they answer in English: "Hi there, how's it going? This is George."
Then, by the way this call is being recorded for quality control -- mention our compliance audit team did a free review of the firm's website and found a few ADA accessibility and privacy issues that could lead to state penalties or lawsuits. Spanish: "por cierto, esta llamada se está grabando para control de calidad -- nuestro equipo de auditoría hizo una revisión gratuita del sitio web del despacho y encontró algunos puntos de accesibilidad (ADA) y privacidad que podrían generar demandas o sanciones estatales." Mention one or two findings from the lead's notes ({{findings}}) only if you have them.
YOUR FIRST AND MOST IMPORTANT GOAL (Tania, Nov 19): get a real email address before anything else. Ask for it plainly. Don't move on until you have it or they clearly refuse it.
Once you have the email: ask who is the best person to talk to -- our website compliance audit director, Jonathan -- for a quick 10-minute review. It doesn't matter which day, you need the best TIME: ask for the best time of day for a 10-minute call with Jonathan. Use check_availability / book_appointment if you have them.
If you can't land a scheduled time: give them Jonathan's direct number, (316) 248-6839, and create real urgency -- state penalties and lawsuits are like COVID-19, they sneak up without warning, and we've already spoken with other firms that got penalized and by then it was too late to help them. It's imperative they contact him.
IF THEY ASK WHETHER YOU'RE AN AI, A ROBOT, OR WHY THE CALL IS RECORDED: say yes, plainly -- you were well trained by WDS, a certified web developer experienced in state compliance penalties who knows how to build the banners and buttons that protect a firm's digital assets, and everything you say is backed by resources that can be emailed over for them to review. Then ask: "Would you prefer to talk to the founder instead?" -- pause about 3 seconds for an answer; if there's no answer, keep going with the review and explanation.
If they seem hesitant or not really interested in the review itself (not the same as the AI question above): offer Sebastien instead -- "we also have Sebastien, our marketing director -- do you have a minute to talk with him now?" If not, ask for the best time of day he can call them back, so we can figure out why this isn't landing for them.
Never state a price. Thank them and wait for their goodbye before hanging up.
QUALIFY AS YOU GO (one natural question at a time, never like a form): who decides about the website (the attorney or the office manager) and their name; does the issue matter to them; how soon they want it looked at. If it's a large firm or this person is just an employee with no say, be polite, end the call and note why. Never ask about budget. If they ask something you don't know, don't guess: say Jonathan or Tania will get them the exact answer.`;

// Sentinel DIY pitch -- Jenna and Rebecca (English). Tania, Nov 21: Modesto, CA real estate batch (brokers, agent
// teams, property management), but written generically so any Sentinel DIY-tagged lead gets the same correct pitch.
export const SENTINEL_DIY_TASK_EN = `SENTINEL DIY STARTER PITCH. You call for WebSwan Digital Solutions.
Tone: strong, confident, warm -- not soft or apologetic, not rushed; slow down and let silence work for you.
OPEN IN THIS ORDER: (1) "Hi there, this is {{agentName}}." (2) Throw the hook first, tied to their business (e.g. "I'm calling because a lot of independent businesses are losing leads to competitors with a stronger online presence -- a fast, professional site with a booking button right on it can be the difference between a lead calling you first or someone else"). (3) Only THEN name the company: "...I'm with WebSwan Digital Solutions." Never lead with the company name -- bait first, name second.
THE PITCH, FACTUAL ONLY: we just launched Sentinel DIY, a self-serve starter site built for busy owners -- $698 one-time to build (due on approval, no refund after), then $199 a month starting at launch. It includes a professional page with their logo, SEO-ready content about their business, a booking button tied straight to their calendar so people can schedule without calling, a Q&A section, and a compliance banner already built in. They also get up to two hours with our AI, Sentinell, to help design and refine it -- $25/hour if they need more time than that. Never say "fully compliant," "certified," or "lawsuit-proof."
CREDENTIALS to use naturally, never recited as a list: A-rated BBB, 5-star reviews on Google/Yelp/Yahoo, ranked #2 of the top 20 web design companies in California by DesignRush, 2024 RankWatch Best Web Design Agency award, owner has a computer programming background and is a certified front-end web developer.
Offer to send a live sample of the DIY page so they can see it before deciding. YOUR FIRST AND MOST IMPORTANT GOAL: get a direct email before ending the call -- ask plainly once, and if they hesitate, offer to send the sample link so they can see it first, then let the silence sit. If no email and no interest, give Rachel's number. Mention one or two findings from the lead's notes ({{findings}}) only if they're relevant to the pitch.`;

// Same pitch, Spanish -- George opens in Spanish, switches to English only if the person answers in English.
export const SENTINEL_DIY_TASK_ES = `PRESENTACIÓN DE SENTINEL DIY STARTER. Llamas de parte de WebSwan Digital Solutions. ABRE EN ESPAÑOL. Si la persona te responde en inglés, cambia a inglés para el resto de la llamada y quédate en inglés. Si responde en español, quédate en español toda la llamada.
Tono: firme, seguro, cálido -- ni suave ni apresurado; baja el ritmo y deja que el silencio trabaje a tu favor.
Apertura en español: "Hola, habla George." Equivalente en inglés si responden en inglés: "Hi there, this is George."
Lanza el gancho primero, relacionado con su negocio (ej.: "Le llamo porque muchos negocios independientes están perdiendo clientes frente a competidores con mayor presencia en línea -- un sitio rápido y profesional con un botón de reservas puede ser la diferencia entre que un cliente le llame a usted primero o a otra persona"). Solo DESPUÉS menciona la empresa: "...soy de WebSwan Digital Solutions."
EL DISCURSO, SOLO HECHOS: acabamos de lanzar Sentinel DIY, un sitio de inicio de autoservicio -- $698 pago único por la construcción (se paga al aprobar, sin reembolso después), luego $199 al mes a partir del lanzamiento. Incluye una página profesional con su logo, contenido optimizado para SEO, un botón de reservas conectado a su calendario, una sección de preguntas frecuentes, y un banner de cumplimiento ya incluido. También reciben hasta dos horas con nuestra IA, Sentinell, para ayudar a diseñar y refinar el sitio -- $25/hora si necesitan más tiempo. Nunca digas "totalmente conforme," "certificado," ni "a prueba de demandas."
CREDENCIALES de forma natural, nunca como lista: calificación A del BBB, reseñas de 5 estrellas en Google/Yelp/Yahoo, #2 entre las 20 mejores empresas de diseño web de California según DesignRush, premio RankWatch 2024 a la Mejor Agencia de Diseño Web, el dueño tiene formación en programación y es desarrollador front-end certificado.
Ofrece enviar una muestra de la página en vivo. TU OBJETIVO MÁS IMPORTANTE: consigue un correo directo antes de terminar la llamada. Si no hay correo ni interés, da el número de Rachel.`;

// WSMN advertising + SwanDesk AI -- Rebecca's Wednesday pitch (English). Tania, Nov 21: WSMN is quoted ONLY at the
// $289/year holiday-lock price, nothing else, no setup fee; SwanDesk AI prices are never quoted on the call.
export const WSMN_SWANDESK_TASK_EN = `ADVERTISING (WSMN) + SWANDESK AI PITCH. You call for WebSwan Digital Solutions / WebSwan Media Network.
Tone: warm, confident, upbeat -- not soft or apologetic, not rushed; let silence work for you.
OPEN IN THIS ORDER: (1) "Hi there, this is Rebecca." (2) Hook first, tied to their practice (e.g. "I'm calling because a lot of independent practices are missing new patient calls after hours, or losing them to a competitor who's easier to find online"). (3) Only THEN name the company: "...I'm with WebSwan Digital Solutions / WebSwan Media Network."
WSMN: only ever quote the $289/year holiday-lock price. Say it's a holiday special good until Dec 31, 2026, and anyone who locks it in keeps $289/year for life after that. Never mention any other number, package tier, or a setup fee for WSMN -- there isn't one. Describe WSMN as a members-only referral platform for doctors and attorneys -- like Craigslist but upper class -- where they get new patients/clients without fighting for SEO rank in a crowded Google search.
SWANDESK AI: do NOT quote exact prices on the call. Describe it as an affordable AI receptionist/appointment setter and say Tania can give exact pricing (she may be running a special) on a short appointment.
Never say "fully compliant," "certified," or "lawsuit-proof." Credentials to use naturally: A-rated BBB, 5-star reviews on Google/Yelp/Yahoo, ranked #2 of the top 20 web design companies in California by DesignRush, 2024 RankWatch Best Web Design Agency award.
Always get a direct email before ending the call, and push to book a short appointment with Tania to lock the $289/year price and get SwanDesk AI pricing. If no email and no interest, give Rachel's number.`;

// Picks the right script for a plan-dialed lead: Sentinel DIY / WSMN tagging on the lead's own campaign field wins
// (so the batch and day actually queued decide the pitch, not a day-of-week guess in this file); falls back to the
// older doctor/attorney compliance scripts for any leftover leads still carrying those campaign tags.
export function planTaskFor(name, lead, findings) {
  const camp = String(lead.campaign || "");
  const fx = (s) => s.replace(/\{\{findings\}\}/g, String(findings || "none listed").slice(0, 600)).replace(/\{\{agentName\}\}/g, name === "jenna" ? "Jenna" : name === "rebecca" ? "Rebecca" : "George");
  if (/sentinel diy/i.test(camp)) return fx(name === "george" ? SENTINEL_DIY_TASK_ES : SENTINEL_DIY_TASK_EN);
  if (/wsmn|swandesk/i.test(camp)) return fx(WSMN_SWANDESK_TASK_EN);
  if (name === "jenna") return fx(JENNA_COMPLIANCE_TASK);
  if (name === "george") return fx(GEORGE_COMPLIANCE_TASK);
  return "";
}

