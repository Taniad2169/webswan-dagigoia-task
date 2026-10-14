// WebSwan Technical Audit Lab - analyzer (pure JS, runs in Node or a browser).
// analyze(html, headers, pageUrl, opts) -> report object. No network calls in here.

const VENDORS = [
  // host or inline signature -> plain-English vendor info
  { id: "ga4", name: "Google Analytics", match: [/google-analytics\.com/i, /gtag\(\s*['"]config['"]\s*,\s*['"]G-/i, /analytics\.google\.com/i], cat: "Analytics / tracking", collects: "Visitor ID, pages viewed, device, approximate location", track: true, ads: false, baa: "Google does not sign BAAs for Google Analytics" },
  { id: "gtm", name: "Google Tag Manager", match: [/googletagmanager\.com\/gtm\.js/i, /GTM-[A-Z0-9]{4,}/], cat: "Tag manager", collects: "Loads other tracking tags (what it fires depends on its setup)", track: true, ads: false, baa: "Container only; check every tag inside it" },
  { id: "gtag", name: "Google tag (gtag.js)", match: [/googletagmanager\.com\/gtag\/js/i], cat: "Analytics / ads tag", collects: "Sends visit data to Google Analytics / Google Ads", track: true, ads: true, baa: "No BAA for analytics/ads use" },
  { id: "gads", name: "Google Ads / DoubleClick", match: [/doubleclick\.net/i, /googleadservices\.com/i, /gtag\(\s*['"]config['"]\s*,\s*['"]AW-/i, /googlesyndication\.com/i], cat: "Advertising", collects: "Ad conversion and remarketing data", track: true, ads: true, baa: "No BAA for advertising" },
  { id: "meta", name: "Meta (Facebook) Pixel", match: [/connect\.facebook\.net/i, /fbq\(\s*['"]init/i, /facebook\.com\/tr\?/i], cat: "Advertising", collects: "Pages viewed and actions, linked to Facebook/Instagram profiles", track: true, ads: true, baa: "Meta does not sign BAAs" },
  { id: "tiktok", name: "TikTok Pixel", match: [/analytics\.tiktok\.com/i, /ttq\.load/i], cat: "Advertising", collects: "Pages viewed and actions for TikTok ads", track: true, ads: true, baa: "No BAA" },
  { id: "linkedin", name: "LinkedIn Insight Tag", match: [/snap\.licdn\.com/i, /_linkedin_partner_id/i], cat: "Advertising", collects: "Visitor company/profile matching for ads", track: true, ads: true, baa: "No BAA" },
  { id: "bing", name: "Microsoft Ads (Bing UET)", match: [/bat\.bing\.com/i], cat: "Advertising", collects: "Ad conversion data", track: true, ads: true, baa: "No BAA" },
  { id: "clarity", name: "Microsoft Clarity", match: [/clarity\.ms/i], cat: "Session recording", collects: "Records clicks, scrolls and what visitors type unless masked", track: true, ads: false, baa: "No BAA" },
  { id: "hotjar", name: "Hotjar", match: [/hotjar\.com/i, /hjSiteSettings|_hjSettings/i], cat: "Session recording", collects: "Records clicks, scrolls and page behavior", track: true, ads: false, baa: "No BAA" },
  { id: "callrail", name: "CallRail", match: [/callrail\.com/i, /cdn\.callrail/i], cat: "Call tracking", collects: "Swaps phone numbers and links calls to website visits", track: true, ads: false, baa: "Offers a BAA on HIPAA plans" },
  { id: "ghl", name: "GoHighLevel (LeadConnector) chat / forms", match: [/leadconnectorhq\.com/i, /msgsndr\.com/i, /\bgohighlevel\b/i], cat: "Chat / CRM", collects: "Everything visitors type in the chat or form (names, phones, messages)", track: false, ads: false, baa: "Patient messages need a signed BAA with HighLevel", phi: true },
  { id: "podium", name: "Podium chat", match: [/podium\.com/i], cat: "Chat / CRM", collects: "Chat messages and phone numbers", phi: true, baa: "Needs a signed BAA for patient messages" },
  { id: "birdeye", name: "Birdeye", match: [/birdeye\.com/i], cat: "Chat / reviews", collects: "Chat messages, reviews", phi: true, baa: "Needs a signed BAA for patient messages" },
  { id: "intercom", name: "Intercom chat", match: [/intercom(cdn)?\.(io|com)/i], cat: "Chat", collects: "Chat messages", phi: true, baa: "BAA only on specific plans" },
  { id: "tawk", name: "Tawk.to chat", match: [/tawk\.to/i], cat: "Chat", collects: "Chat messages", phi: true, baa: "No BAA" },
  { id: "livechat", name: "LiveChat", match: [/livechatinc\.com/i], cat: "Chat", collects: "Chat messages", phi: true, baa: "Needs a signed BAA" },
  { id: "drift", name: "Drift chat", match: [/drift\.com|driftt\.com/i], cat: "Chat", collects: "Chat messages", phi: true, baa: "Needs a signed BAA" },
  { id: "hubspot", name: "HubSpot", match: [/hs-scripts\.com|hsforms\.(net|com)|hubspot\.com/i], cat: "CRM / forms / tracking", collects: "Form entries and visitor tracking", track: true, phi: true, baa: "BAA only on specific plans" },
  { id: "jotform", name: "Jotform", match: [/jotform\.(com|us)/i], cat: "Online forms", collects: "Everything typed into the form", phi: true, baa: "HIPAA-ready only on Jotform's HIPAA plan with a BAA" },
  { id: "wufoo", name: "Wufoo forms", match: [/wufoo\.com/i], cat: "Online forms", collects: "Form entries", phi: true, baa: "No BAA" },
  { id: "typeform", name: "Typeform", match: [/typeform\.com/i], cat: "Online forms", collects: "Form entries", phi: true, baa: "No BAA" },
  { id: "gforms", name: "Google Forms", match: [/docs\.google\.com\/forms/i], cat: "Online forms", collects: "Form entries", phi: true, baa: "Only under a signed Google Workspace BAA" },
  { id: "calendly", name: "Calendly", match: [/calendly\.com/i], cat: "Scheduling", collects: "Names, emails, appointment details", phi: true, baa: "Calendly has generally not signed BAAs; confirm" },
  { id: "zocdoc", name: "Zocdoc", match: [/zocdoc\.com/i], cat: "Scheduling", collects: "Booking details", phi: true, baa: "Healthcare vendor (typically BAA)" },
  { id: "nexhealth", name: "NexHealth", match: [/nexhealth\.com/i], cat: "Scheduling / forms", collects: "Patient booking and forms", phi: true, baa: "Healthcare vendor (typically BAA)" },
  { id: "elfsight", name: "Elfsight widget", match: [/elfsight(cdn)?\.com/i], cat: "Widget (reviews/social feed)", collects: "Visitor IP address and browser info", baa: "Not for patient data" },
  { id: "yt", name: "YouTube video", match: [/youtube(-nocookie)?\.com\/embed/i], cat: "Video", collects: "Viewing data, Google cookies", track: true, baa: "No BAA" },
  { id: "vimeo", name: "Vimeo video", match: [/player\.vimeo\.com/i], cat: "Video", collects: "Viewing data", baa: "No BAA" },
  { id: "gmaps", name: "Google Maps", match: [/maps\.google\.com|google\.com\/maps/i], cat: "Map", collects: "Visitor IP and location data", baa: "No BAA" },
  { id: "recaptcha", name: "Google reCAPTCHA", match: [/google\.com\/recaptcha|recaptcha\.net/i], cat: "Spam protection", collects: "Browser and behavior signals sent to Google", baa: "No BAA" },
  { id: "gfonts", name: "Google Fonts", match: [/fonts\.googleapis\.com/i], cat: "Fonts", collects: "Visitor IP address", baa: "Low risk" }
];

const CONSENT_TOOLS = [
  { name: "Complianz", match: [/complianz/i, /cmplz-cookiebanner|cmplz_/i] },
  { name: "CookieYes", match: [/cookieyes\.com|cookie-law-info|cky-consent/i] },
  { name: "OneTrust", match: [/onetrust|otSDKStub|optanon/i] },
  { name: "Cookiebot", match: [/cookiebot/i] },
  { name: "Termly", match: [/termly\.io/i] },
  { name: "iubenda", match: [/iubenda/i] },
  { name: "Osano", match: [/osano\.com/i] },
  { name: "Usercentrics", match: [/usercentrics/i] },
  { name: "TrustArc", match: [/trustarc|truste\.com/i] },
  { name: "Didomi", match: [/didomi/i] },
  { name: "Borlabs Cookie", match: [/borlabs-cookie/i] },
  { name: "Cookie Notice", match: [/cookie-notice-js|cn-cookie-notice|cookie_notice/i] },
  { name: "GDPR Cookie Compliance (Moove)", match: [/moove_gdpr|gdpr-cookie-compliance/i] },
  { name: "Real Cookie Banner", match: [/real-cookie-banner/i] },
  { name: "Enzuzo", match: [/enzuzo/i] },
  { name: "CookieScript", match: [/cookie-script\.com/i] },
  { name: "Shopify consent", match: [/shopify-privacy-banner|customerPrivacy/i] },
  { name: "Squarespace cookie banner", match: [/sqs-cookie-banner/i] },
  { name: "Wix consent", match: [/consent-policy-manager|wix-cookie/i] },
  { name: "WebSwan ADA + cookie widget", match: [/thewebswan-widget|ada-widget\.js/i] },
  { name: "SiteSwan cookie banner", match: [/cc-banner|cookieconsent/i] }
];

const ADA_WIDGETS = [
  { name: "UserWay", match: [/userway\.org/i] },
  { name: "accessiBe", match: [/accessibe\.com|acsbapp/i] },
  { name: "AudioEye", match: [/audioeye\.com/i] },
  { name: "EqualWeb", match: [/equalweb\.com|nagich/i] },
  { name: "Eye-Able", match: [/eye-able/i] },
  { name: "UserWay / Level Access", match: [/levelaccess/i] },
  { name: "Recite Me", match: [/reciteme/i] },
  { name: "WebSwan ADA widget", match: [/thewebswan-widget|ada-widget-button|ada-widget\.js/i] },
  { name: "Accessibility toolbar (generic)", match: [/accessibility[-_ ]?(widget|toolbar|menu|plugin)|wp-accessibility|one-click-accessibility|pojo-a11y/i] }
];

const STATES = { AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming" };

// Short, factual state notes. Keep these conservative: they describe laws, not violations.
const STATE_NOTES = {
  CA: "California: the Unruh Civil Rights Act lets plaintiffs seek at least $4,000 per ADA violation, and California privacy law (CCPA/CPRA) gives consumers the right to opt out of the 'sale or sharing' of personal info. CCPA applies to businesses over its size thresholds.",
  NY: "New York is one of the top states for ADA website lawsuits. The New York SHIELD Act requires businesses to protect New Yorkers' private information.",
  FL: "Florida is one of the top states for ADA website lawsuits. The Florida Information Protection Act requires businesses to protect personal information.",
  NV: "Nevada law (NRS 603A) requires websites that collect visitor information to post a privacy notice.",
  TX: "The ADA is federal, so it applies in Texas. Texas also has a data privacy law (TDPSA), but most small businesses are exempt from most of it.",
  NJ: "New Jersey has a high number of ADA website lawsuits and a consumer data privacy law for businesses over its thresholds.",
  CT: "Connecticut has a consumer data privacy law (CTDPA) for businesses over its thresholds.",
  CO: "Colorado has a consumer privacy law (CPA) for businesses over its thresholds, plus a 2024 digital accessibility law for government sites.",
  WA: "Washington's My Health My Data Act covers consumer health data collected online, with very small or no size thresholds.",
  GA: "The ADA is federal, so it applies in Georgia."
};

const esc = (s) => String(s == null ? "" : s);
const stripTags = (s) => esc(s).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
function attrs(tag) {
  const out = {}; const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const body = tag.replace(/^<\s*[a-zA-Z0-9-]+/, "").replace(/\/?>$/, "");
  let m; while ((m = re.exec(body))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}
const tags = (html, name) => (html.match(new RegExp("<" + name + "\\b[^>]*>", "gi")) || []).map((t) => ({ raw: t, a: attrs(t) }));
function hostOf(u, base) { try { return new URL(u, base).hostname.toLowerCase(); } catch (e) { return ""; } }
function rootDomain(h) { const p = h.split(".").filter(Boolean); return p.slice(-2).join("."); }

export function analyze(html, headers, pageUrl, opts = {}) {
  html = esc(html); headers = headers || {};
  const h = (k) => headers[k.toLowerCase()] || "";
  const pageHost = hostOf(pageUrl);
  const site = rootDomain(pageHost);
  const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const text = stripTags(html);
  const lowerText = text.toLowerCase();

  // ---------- requests / third parties ----------
  const urls = [];
  for (const [t, at] of [["script", "src"], ["link", "href"], ["iframe", "src"], ["img", "src"], ["source", "src"], ["video", "src"], ["embed", "src"], ["form", "action"]]) {
    tags(html, t).forEach((x) => { if (x.a[at]) urls.push({ kind: t, url: x.a[at] }); });
  }
  const inlineScripts = (html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || []).join("\n");
  const embeddedUrls = inlineScripts.match(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'<>\\)]*/gi) || [];
  embeddedUrls.forEach((u) => urls.push({ kind: "inline", url: u }));
  const hosts = {};
  urls.forEach((x) => { const hh = hostOf(x.url, pageUrl); if (!hh || rootDomain(hh) === site) return; (hosts[hh] = hosts[hh] || new Set()).add(x.kind); });

  const vendorsFound = [];
  VENDORS.forEach((v) => {
    const hit = v.match.some((re) => re.test(html));
    if (hit) {
      const ids = [];
      const ga = html.match(/['"](G-[A-Z0-9]{6,})['"]/); if (v.id === "ga4" && ga) ids.push(ga[1]);
      const gtm = html.match(/GTM-[A-Z0-9]{4,}/); if (v.id === "gtm" && gtm) ids.push(gtm[0]);
      const gtag = html.match(/gtag\/js\?id=([A-Z]{1,3}-[A-Z0-9-]+)/i); if (v.id === "gtag" && gtag) ids.push(gtag[1]);
      vendorsFound.push({ ...v, match: undefined, ids });
    }
  });
  const otherHosts = Object.keys(hosts).filter((hh) => !/googletagmanager\.com|google-analytics\.com|gmpg\.org|(^|\.)w\.org$|schema\.org/i.test(hh) && !VENDORS.some((v) => v.match.some((re) => re.test(hh))));

  // ---------- consent / cookies ----------
  const consentTools = CONSENT_TOOLS.filter((c) => c.match.some((re) => re.test(html))).map((c) => c.name);
  const bannerText = /(accept|allow) (all )?cookies|cookie (settings|preferences|policy)|we use cookies|manage consent|cookie consent|this (web)?site uses cookies/i.test(text);
  const rejectText = /\b(reject|decline|deny)( all)?\b|necessary only|essential only/i.test(text);
  const complianzOptout = /complianz[\s\S]{0,4000}?["']?consenttype["']?\s*:\s*["']optout/i.test(html) || /banner-\d+-optout\.css/i.test(html);
  const complianzOptin = /["']?consenttype["']?\s*:\s*["']optin/i.test(html);
  const dnsLink = /do not sell( or share)?( my)?( personal)? information|your privacy choices|opt[- ]out preferences/i.test(text);
  const privacyLink = tags(html, "a").some((a) => /privacy/i.test(a.a.href || "")) || /privacy policy/i.test(text);
  const accessibilityStatement = tags(html, "a").some((a) => /accessib/i.test(a.a.href || "")) || /accessibility statement/i.test(text);
  const gpc = /globalPrivacyControl|global privacy control|\bGPC\b/i.test(html);
  const trackers = vendorsFound.filter((v) => v.track || v.ads);
  const adTrackers = vendorsFound.filter((v) => v.ads);
  // Is the GA tag blocked until consent? (consent tools rewrite type="text/plain")
  const blockedTags = (html.match(/<script\b[^>]*type=["']text\/plain["'][^>]*>/gi) || []).length;
  const consentModeDefaultDenied = /gtag\(\s*['"]consent['"]\s*,\s*['"]default['"][\s\S]{0,300}?denied/i.test(html);

  // ---------- forms ----------
  const formBlocks = html.match(/<form\b[\s\S]*?<\/form>/gi) || [];
  const labelFor = new Set(tags(html, "label").map((l) => l.a.for).filter(Boolean));
  const forms = formBlocks.map((f) => {
    const fa = attrs((f.match(/<form\b[^>]*>/i) || [""])[0]);
    const actionHost = fa.action ? hostOf(fa.action, pageUrl) : pageHost;
    const fields = [];
    (f.match(/<(input|select|textarea)\b[^>]*>/gi) || []).forEach((t) => {
      const a = attrs(t); const type = (a.type || (t.match(/^<(select|textarea)/i) ? t.match(/^<(\w+)/)[1].toLowerCase() : "text")).toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(type)) return;
      const nm = (a.name || a.id || a.placeholder || type);
      const labelled = !!(a["aria-label"] || a["aria-labelledby"] || a.title || (a.id && labelFor.has(a.id)) || new RegExp("<label[^>]*>[^<]*(<[^/][^>]*>[^<]*)*<(input|select|textarea)[^>]*" + (a.name ? "name=[\"']" + a.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "") , "i").test(f));
      fields.push({ name: nm, type, required: "required" in a, labelled });
    });
    const sensitive = fields.filter((x) => /birth|dob|insurance|ssn|social|symptom|condition|diagnos|medic|reason|message|comment|health|treatment|procedure|injur|case/i.test(x.name)).map((x) => x.name);
    return { method: (fa.method || "GET").toUpperCase(), action: fa.action || "(same page)", actionHost, thirdParty: !!actionHost && rootDomain(actionHost) !== site, fields, sensitive };
  }).filter((f) => f.fields.length);

  // ---------- industry ----------
  const isHealth = /\b(dentist|dental|orthodont|clinic|medical|patient|physician|doctor|surgery|surgeon|chiropract|therapy|therapist|psychiatr|psycholog|dermatolog|pediatric|optometr|ophthalm|wellness|med ?spa|counsel(ing|or)|plastic surgery|hospital|urgent care|podiatr)\b/i.test(text);
  const isLaw = /\b(attorney|lawyer|law firm|law office|legal services|esq\.|injury law|counselor at law)\b/i.test(text);

  // ---------- state ----------
  let stateCode = (opts.state || "").toUpperCase();
  let stateSource = stateCode ? "chosen" : "";
  if (!stateCode) {
    const reg = html.match(/"addressRegion"\s*:\s*"([A-Za-z .]+)"/);
    if (reg) { const r = reg[1].trim(); stateCode = r.length === 2 ? r.toUpperCase() : (Object.keys(STATES).find((k) => STATES[k].toLowerCase() === r.toLowerCase()) || ""); stateSource = "site schema data"; }
  }
  if (!stateCode) {
    const counts = {};
    (text.match(/,\s*([A-Z]{2})\s+\d{5}(-\d{4})?\b/g) || []).forEach((m) => { const c = m.match(/([A-Z]{2})/)[1]; if (STATES[c]) counts[c] = (counts[c] || 0) + 1; });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (best) { stateCode = best[0]; stateSource = "address on the site"; }
  }

  // ---------- accessibility checks ----------
  const checks = [];
  const add = (area, status, title, detail, weight) => checks.push({ area, status, title, detail, weight: weight || 1 });
  const htmlTag = (html.match(/<html\b[^>]*>/i) || [""])[0];
  const lang = attrs(htmlTag).lang;
  add("ada", lang ? "pass" : "fail", "Page language is set", lang ? 'lang="' + lang + '"' : "No lang attribute on <html>; screen readers may use the wrong voice.", 1);
  const title = stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  add("ada", title ? "pass" : "fail", "Page has a title", title || "Missing <title>.", 1);
  const imgs = tags(noScripts, "img");
  const noAlt = imgs.filter((i) => !("alt" in i.a));
  add("ada", noAlt.length ? "fail" : "pass", "Images have alt text", noAlt.length ? noAlt.length + " of " + imgs.length + " images have no alt attribute." : imgs.length + " images checked, all have an alt attribute.", 2);
  const allFields = forms.flatMap((f) => f.fields);
  const unlabeled = allFields.filter((x) => !x.labelled);
  if (allFields.length) add("ada", unlabeled.length ? "fail" : "pass", "Form fields have labels", unlabeled.length ? unlabeled.length + " of " + allFields.length + " fields have no label (" + unlabeled.map((x) => x.name).slice(0, 5).join(", ") + ")." : allFields.length + " fields, all labeled.", 2);
  const skip = /href=["']#(main|content|main-content|primary|maincontent)["']|skip[- ]to[- ](main|content)/i.test(html);
  add("ada", skip ? "pass" : "warn", "Skip-to-content link", skip ? "Found." : "No skip link found, so keyboard users must tab through the whole menu on every page.", 1);
  const heads = (noScripts.match(/<h([1-6])\b/gi) || []).map((x) => +x.slice(2));
  let skipped = false; for (let i = 1; i < heads.length; i++) if (heads[i] - heads[i - 1] > 1) skipped = true;
  add("ada", !heads.length ? "warn" : heads.includes(1) && !skipped ? "pass" : "warn", "Heading structure", !heads.length ? "No headings found." : (!heads.includes(1) ? "No H1 heading. " : "") + (skipped ? "Heading levels are skipped (for example H2 to H4)." : heads.includes(1) ? "Headings are in order." : ""), 1);
  const iframes = tags(noScripts, "iframe"); const noTitleIframes = iframes.filter((i) => !i.a.title);
  if (iframes.length) add("ada", noTitleIframes.length ? "fail" : "pass", "Embedded frames have titles", noTitleIframes.length ? noTitleIframes.length + " of " + iframes.length + " iframes have no title." : "All iframes have titles.", 1);
  const links = (noScripts.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || []);
  const emptyLinks = links.filter((l) => { const a = attrs((l.match(/<a\b[^>]*>/i) || [""])[0]); if (a["aria-label"] || a.title) return false; const inner = l.replace(/<a\b[^>]*>|<\/a>/gi, ""); const imgAlt = (inner.match(/alt=["']([^"']+)["']/i) || [])[1]; return !stripTags(inner) && !imgAlt; });
  add("ada", emptyLinks.length ? "fail" : "pass", "Links have readable names", emptyLinks.length ? emptyLinks.length + " links have no text or label (often icon links), so screen readers just say 'link'." : links.length + " links checked.", 2);
  const buttons = (noScripts.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) || []);
  const emptyBtns = buttons.filter((b) => { const a = attrs((b.match(/<button\b[^>]*>/i) || [""])[0]); return !a["aria-label"] && !a.title && !stripTags(b) && !/alt=["'][^"']+["']/i.test(b); });
  if (buttons.length) add("ada", emptyBtns.length ? "fail" : "pass", "Buttons have readable names", emptyBtns.length ? emptyBtns.length + " buttons have no text or label." : buttons.length + " buttons checked.", 1);
  const vp = (html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i) || [""])[0];
  const zoomBlocked = /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(vp);
  add("ada", zoomBlocked ? "fail" : "pass", "Visitors can zoom on phones", zoomBlocked ? "The viewport blocks pinch-zoom (user-scalable=no / maximum-scale=1)." : "Zoom is allowed.", 1);
  const adaWidgets = ADA_WIDGETS.filter((w) => w.match.some((re) => re.test(html))).map((w) => w.name);
  add("ada", adaWidgets.length ? "pass" : "warn", "Accessibility tool for visitors", adaWidgets.length ? "Found: " + adaWidgets.join(", ") + ". (A widget helps visitors but does not by itself make a site compliant.)" : "No accessibility tool or menu found for visitors.", 1);
  add("ada", accessibilityStatement ? "pass" : "warn", "Accessibility statement", accessibilityStatement ? "Found a link or text." : "No accessibility statement found.", 1);

  // ---------- privacy / cookie checks ----------
  const consentPresent = consentTools.length > 0 || bannerText;
  add("privacy", privacyLink ? "pass" : "fail", "Privacy policy", privacyLink ? "Link or text found." : "No privacy policy link found.", 2);
  if (trackers.length) {
    add("privacy", consentPresent ? "pass" : "fail", "Cookie / tracking consent banner", consentPresent ? "Found" + (consentTools.length ? ": " + consentTools.join(", ") + (bannerText ? "" : " (loads with JavaScript after the page opens)") : " (banner text on the page)") + "." : "Tracking tools are on the site but no cookie consent banner or consent tool was found.", 3);
    if (consentPresent) {
      const optoutModel = complianzOptout || (!complianzOptin && !rejectText && !consentModeDefaultDenied && !blockedTags);
      add("privacy", optoutModel ? "warn" : "pass", "Tracking waits for consent", optoutModel ? "Tracking appears to start as soon as the page loads (opt-out style). Allowed under California-style opt-out rules if the opt-out works, but not under opt-in rules." : "Tracking appears to be held until the visitor chooses" + (blockedTags ? " (" + blockedTags + " scripts blocked until consent)" : consentModeDefaultDenied ? " (Google consent mode default = denied)" : "") + ".", 2);
      if (complianzOptout) add("privacy", "warn", "Reject / opt-out choice", "The banner is set up in opt-out mode: visitors see 'Accept' and a link to opt-out preferences, but no reject button. Check whether the opt-out page asks for name and email (California rules say opting out shouldn't require that).", 2);
      else add("privacy", rejectText ? "pass" : "warn", "Reject / opt-out choice", rejectText ? "Reject or decline wording found." : "No reject or decline wording found in the page source. Check the banner by hand.", 2);
    }
  } else {
    add("privacy", "pass", "Cookie / tracking consent banner", consentPresent ? "Consent tool found and no common trackers detected." : "No common trackers detected, so a banner is less critical.", 1);
  }
  if (stateCode === "CA" && adTrackers.length) add("privacy", dnsLink ? "pass" : "fail", "'Do Not Sell or Share' link (California)", dnsLink ? "Found." : "Ad trackers are present but no 'Do Not Sell or Share My Personal Information' / 'Your Privacy Choices' link was found.", 2);
  if (gpc) add("privacy", "pass", "Global Privacy Control signal", "GPC support or wording found.", 1);
  const proto = /^https:/i.test(pageUrl);
  add("security", proto ? "pass" : "fail", "Secure connection (HTTPS)", proto ? "Page loads over HTTPS." : "Page is not on HTTPS.", 2);
  add("security", h("strict-transport-security") ? "pass" : "warn", "HSTS header", h("strict-transport-security") ? "Present." : "Missing (browsers are not forced to use HTTPS).", 1);
  add("security", h("content-security-policy") ? "pass" : "warn", "Content-Security-Policy header", h("content-security-policy") ? "Present." : "Missing (no browser-level limit on which scripts can run).", 1);

  // ---------- HIPAA ----------
  const hipaa = [];
  if (isHealth) {
    const phiVendors = vendorsFound.filter((v) => v.phi);
    phiVendors.forEach((v) => hipaa.push({ level: "high", text: v.name + " is on the site: " + v.collects + ". " + v.baa + "." }));
    if (trackers.length && (forms.length || phiVendors.length)) hipaa.push({ level: "high", text: "Tracking tools (" + trackers.map((t) => t.name).join(", ") + ") run on a healthcare site that also collects visitor information. Per HHS guidance on online tracking, tracking on pages tied to patient care can expose patient information to companies that don't sign BAAs." });
    else if (trackers.length) hipaa.push({ level: "medium", text: "Tracking tools (" + trackers.map((t) => t.name).join(", ") + ") run on a healthcare site. Check they are not on pages tied to booking, conditions or patient portals." });
    forms.forEach((f) => { if (f.sensitive.length) hipaa.push({ level: f.thirdParty ? "high" : "medium", text: "A form asks for " + f.sensitive.join(", ") + (f.thirdParty ? " and sends it to " + f.actionHost + ". That vendor needs a signed BAA." : ". Make sure the site's form handler and email delivery are HIPAA-secure.") }); });
    if (!hipaa.length) hipaa.push({ level: "low", text: "No patient-data collection or tracking tools were detected in the page source." });
  }

  // ---------- lawyers ----------
  const legal = [];
  if (isLaw) {
    legal.push({ level: /attorney advertising/i.test(text) ? "pass" : "warn", text: /attorney advertising/i.test(text) ? "'Attorney Advertising' wording found." : "No 'Attorney Advertising' label found; many state bars require it on lawyer websites." });
    legal.push({ level: /(results|outcome)s? (may vary|do not guarantee|not guaranteed)|prior results do not guarantee/i.test(text) ? "pass" : "warn", text: /(results|outcome)s? (may vary|do not guarantee|not guaranteed)|prior results do not guarantee/i.test(text) ? "Results disclaimer found." : "No 'prior results do not guarantee a similar outcome' disclaimer found; required by many state bars when case results are shown." });
    legal.push({ level: /no attorney[- ]client relationship|does not (create|form) an attorney/i.test(text) ? "pass" : "warn", text: /no attorney[- ]client relationship|does not (create|form) an attorney/i.test(text) ? "Attorney-client relationship disclaimer found." : "No 'contacting us does not create an attorney-client relationship' disclaimer found near the contact form." });
  }

  // ---------- scores ----------
  const score = (area) => { const list = checks.filter((c) => c.area === area); let tot = 0, got = 0; list.forEach((c) => { tot += c.weight; got += c.status === "pass" ? c.weight : c.status === "warn" ? c.weight * 0.5 : 0; }); return tot ? Math.round((got / tot) * 100) : null; };
  const scores = { ada: score("ada"), privacy: score("privacy"), security: score("security") };
  scores.hipaa = isHealth ? (hipaa.some((x) => x.level === "high") ? "High concern" : hipaa.some((x) => x.level === "medium") ? "Medium concern" : "Low concern") : "Not a healthcare site";
  scores.overall = Math.round(scores.ada * 0.45 + scores.privacy * 0.4 + scores.security * 0.15);

  return {
    url: pageUrl, testedAt: new Date().toISOString(),
    title, isHealth, isLaw,
    state: stateCode ? { code: stateCode, name: STATES[stateCode], source: stateSource, note: STATE_NOTES[stateCode] || "The ADA is federal, so it applies in " + STATES[stateCode] + "." } : null,
    scores, checks, hipaa, legal,
    vendors: vendorsFound.map(({ match, ...v }) => v),
    otherHosts,
    consent: { tools: consentTools, bannerText, rejectText, optoutModel: complianzOptout, dnsLink, gpc, blockedTags, consentModeDefaultDenied },
    adaWidgets, forms,
    counts: { requests: urls.length, thirdPartyHosts: Object.keys(hosts).length, forms: forms.length, fields: allFields.length, images: imgs.length, links: links.length }
  };
}

export const _lists = { VENDORS, CONSENT_TOOLS, ADA_WIDGETS, STATES };
