// Tania, Nov 13: Jonathan knows the WebSwan Audit Command Center inside out (https://taniad2169.github.io/Daily-task/webswan-audit-command-center.html),
// so he can explain it to Tania, the callers and prospects, and add the compliance paragraph to Eva's light grey emails.
const LAW_FACTS = {
      hipaa: 'HIPAA civil penalties run from $145 up to $73,011 per violation, with a yearly cap of $2,190,294 (2026 HHS amounts), and HHS has warned that tracking tools on appointment and patient pages can expose protected health information.',
      adaFed: '8,667 ADA Title III website and accessibility lawsuits were filed in federal court in 2025; a business that is sued usually pays to fix the site plus the other side\'s attorney fees.',
      CA: {
        name: 'California',
        tracking: 'California\'s Invasion of Privacy Act (CIPA) lets website visitors sue for $5,000 per violation when tracking tools capture their information without consent, and thousands of these website-tracking claims are filed every year.',
        ada: 'California\'s Unruh Civil Rights Act adds at least $4,000 in damages per violation on top of the ADA, and California had the most ADA lawsuits in the country in 2025 (3,252 federal filings).',
        cookie: 'For businesses large enough to fall under the CCPA (for example, more than $26.6 million in yearly revenue), the state can fine up to $2,663 per violation, or $7,988 if intentional.'
      },
      WA: {
        name: 'Washington',
        health: 'Washington\'s My Health My Data Act covers consumer health information collected through websites, tracking tools included, and lets people sue for their damages, attorney fees and up to triple damages (up to $25,000).'
      },
      NY: {
        name: 'New York',
        ada: 'New York is one of the top three states for ADA lawsuits (1,471 federal filings in 2025), and many website accessibility cases are now filed in New York state court as well.',
        security: 'New York\'s SHIELD Act requires reasonable safeguards for New Yorkers\' private information, and the Attorney General can seek up to $5,000 per violation.'
      },
      TX: {
        name: 'Texas',
        health: 'Texas HB 300 applies to anyone who collects or stores health information about Texans, with penalties from $5,000 up to $1.5 million per year.',
        tracking: 'Under the Texas Data Privacy and Security Act, the Attorney General can fine up to $7,500 per violation (after a 30-day chance to fix); even small businesses may not sell sensitive data without consent.'
      },
      FL: {
        name: 'Florida',
        ada: 'Florida had the second-most ADA lawsuits in the country in 2025 (1,823 federal filings).'
      },
      OTHER: { name: 'the U.S. (federal rules)' }
    };
export const AUDIT_KNOWLEDGE = `
THE WEBSWAN AUDIT COMMAND CENTER (Tania's audit software; you know it fully and can explain it simply to Tania, the team or a prospect):
Link: https://taniad2169.github.io/Daily-task/webswan-audit-command-center.html
How it works, 4 steps: (1) Type the prospect's website, pick the industry, click Run Deep Audit (it copies the Console Sniffer). Open their site in an Incognito window with ad blockers off, do NOT touch the cookie banner, wait 10 seconds, press F12 > Console, paste, Enter. (2) Paste the JSON result into Tab 2 and click Analyze Real Telemetry: it separates trackers that actually SENT data from ones that only loaded or only sit in the code, and checks forms and accessibility. (3) Preview & Print Client Audit Report: a branded PDF with Tania's photo and logo showing only what the scan measured. (4) Tab 4 Outreach Playbook: an email and phone script written only from the measured findings; Tab 3 has the Zero-Liability Portal and consent code once they hire WebSwan.
The 5 pillars it checks: Tracking before consent (which pixels sent data before the visitor chose); Cookie banner (exists? Reject button, settings, really blocks trackers, early cookies, Privacy Policy, California "Do Not Sell or Share" link); ADA / WCAG 2.1 AA (accessibility statement or widget, alt text, labels, button and link names, contrast, headings, page language, zoom, skip link); HIPAA risk (sensitive form fields on pages where pixels send data, patient or booking pages with pixels, forms over http or GET, outside form tools needing a BAA; it flags RISK, never a legal ruling); HTTPS and broken links (insecure files and forms, up to 50 site links and 25 outside links).
The WebSwan score: no cookie banner AND no accessibility statement/widget = 10/100; only one of the two = 40/100; both = 50 to 100 depending on how well they pass.
Tracker colors: "Sent data" = a real request to Meta, Google etc. before consent (the strongest finding); "Loaded" = code downloaded, no data request seen yet; "In source only" = written in the code but did not load (housekeeping, NEVER say it sent data). Pillars not measured show "—", never a made-up number.
Best habits: scan the intake/booking page; save the JSON with the date in WorkPilot as proof; rescan after a fix for a before/after green report. The report is a technical scan, not legal advice.
The law facts the tool uses (use only these numbers, and only for the prospect's state or federal): ${JSON.stringify(LAW_FACTS)}
When you add to Eva's email: write 2 to 3 short plain-English sentences on why the measured findings matter for THIS practice in THIS state, using only the findings given and the facts above. Never say guaranteed, certified, lawsuit-proof, fully compliant, or that they broke the law; say "can expose", "creates risk", "is the kind of issue that". No legal advice, no scare tactics, friendly and curious.`;
