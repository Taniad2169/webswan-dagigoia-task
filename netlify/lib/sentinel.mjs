// Sentinel Phase 1 -- read-only diagnostic helpers (Tania, Nov 18; revised after Kobe's static-inspection review).
// GitHub only in this release. NO Netlify token: Tania decided the account-wide reach of a Netlify personal
// access token is not worth the risk for a first release, so Phase 1 ships with GitHub read-only diagnostics
// plus Netlify log text Tania supplies manually in chat (scrubbed the same as everything else here -- see
// team.mjs's chat handler, where Sentinel's incoming message text is run through scrubSecrets before it's
// ever added to his context).
//
// Everything in this file is read-only and server-enforced: Sentinel's prompt never decides what's allowed,
// this file does. No write, no deploy, no credential ever reaches a reply, no PR, no exception list.
//
// Everything this file returns -- file content, commit messages, commit author names -- is UNTRUSTED evidence
// read from a repository Sentinel does not control the contents of. It is handled as data throughout: filtered
// for secrets/PII before it reaches a model, defused of directive-shaped syntax before it's ever spliced into
// any reply text (see neutralizeDirectives below), and in team.mjs it's fed back to Sentinel as a second,
// isolated model turn explicitly labeled as untrusted evidence to analyze -- never as something Sentinel's own
// earlier turn said, and never as text that runs through the shared ((ACTION: ...)) directive parser.
//
// Nov 18 (later same day): added sentinelInspectUrl -- a second, separate read-only tool, same evidence
// discipline as the GitHub reader above (secret/PII scrubbed where relevant, directive-defused, fed back as an
// isolated analysis turn, append-only audit log). This one fetches a PUBLIC website Tania hands Sentinel and
// checks static-HTML signals only (links, alt text, form labels, cookie/consent signals) -- it never touches
// Eva, Gmail, or any other agent's integration, and it never runs JavaScript, so anything a page builds client
// side (a login flow, a booking widget, a single-page app's real content) is outside what this can see. It is
// also hardened against SSRF: before any fetch, the target host (and every redirect hop, and every link it
// checks) is resolved and rejected if it's a loopback, link-local, private, or otherwise non-public address, so
// Sentinel can never be used to probe internal infrastructure through a URL in a chat message.

import { teamStore } from "./team.mjs";
import dns from "node:dns/promises";

export const SENTINEL_REPOS = ["taniad2169/webswan-dagigoia-task", "taniad2169/webswan-lead-prospector"];

const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, n || 4000);

export function scrubSecrets(text) {
  let t = String(text || "");
  t = t.replace(/^(Authorization|Cookie|Set-Cookie|X-Api-Key|X-Goog-Api-Key)\s*:.*$/gim, "$1: [REDACTED]");
  t = t.replace(/\b(sk|pk|rk|ghp|gho|ghu|ghs|ghr|github_pat|AIza|xox[baprs])[A-Za-z0-9_-]{8,}/g, "[REDACTED-KEY]");
  t = t.replace(/\bBearer\s+[A-Za-z0-9\-_.]{10,}/gi, "Bearer [REDACTED]");
  t = t.replace(/\b(api[_-]?key|apikey|secret|token|password|passwd|credential|client[_-]?secret|private[_-]?key|access[_-]?key)\s*[:=]\s*["']?([A-Za-z0-9+/_.=-]{12,})["']?/gi, (m, k) => k + ": [REDACTED-KEY]");
  t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED-EMAIL]");
  t = t.replace(/\b(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[REDACTED-PHONE]");
  return t;
}

export function neutralizeDirectives(text) {
  return String(text || "").replace(/\(\(/g, "( (").replace(/\)\)/g, ") )");
}

function repoOk(repo) { return SENTINEL_REPOS.includes(String(repo || "").trim()); }

function safePath(raw) {
  const rawStr = String(raw == null ? "" : raw);
  if (rawStr.includes("\x00")) return { ok: false, error: "Path rejected: contains a null byte." };
  let p = clean(rawStr, 300).trim();
  if (!p) return { ok: false, error: "Missing file path." };
  if (p.startsWith("/")) return { ok: false, error: "Path rejected: absolute paths (a leading \"/\") are not allowed." };
  p = p.replace(/\/+$/, "");
  if (!p) return { ok: false, error: "Missing file path." };
  const segments = p.split("/");
  if (segments.some((s) => !s)) return { ok: false, error: "Path rejected: contains an empty segment (\"//\")." };
  const encoded = [];
  for (const seg of segments) {
    if (/\x00/.test(seg)) return { ok: false, error: "Path rejected: contains a null byte." };
    if (seg === "." || seg === "..") return { ok: false, error: "Path rejected: contains a \"..\" traversal segment." };
    let decoded = seg;
    for (let i = 0; i < 2; i++) { try { const d = decodeURIComponent(decoded); if (d === decoded) break; decoded = d; } catch (e) { break; } }
    if (/\.\./.test(decoded)) return { ok: false, error: "Path rejected: contains a \"..\" traversal segment." };
    if (/\x00/.test(decoded)) return { ok: false, error: "Path rejected: contains a null byte." };
    if (decoded.includes("/")) return { ok: false, error: "Path rejected: an encoded \"/\" inside one path segment is not allowed." };
    encoded.push(encodeURIComponent(seg));
  }
  return { ok: true, path: segments.join("/"), encoded: encoded.join("/") };
}

const MAX_FILE_BYTES = 300_000;

async function readCapped(r, cap) {
  if (!r.body || typeof r.body.getReader !== "function") {
    const t = await r.text();
    if (t.length > cap) return { tooLarge: true, approxBytes: t.length };
    return { tooLarge: false, text: t };
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let total = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) { try { await reader.cancel(); } catch (e) {} return { tooLarge: true, approxBytes: total }; }
      text += decoder.decode(value, { stream: true });
    }
  } finally { try { reader.releaseLock(); } catch (e) {} }
  text += decoder.decode();
  return { tooLarge: false, text };
}

export async function sentinelReadFile(repo, path, ref) {
  if (!repoOk(repo)) return { error: "Repo not in Sentinel's authorized list: " + repo };
  const sp = safePath(path);
  if (!sp.ok) return { error: sp.error };
  const pat = process.env.SENTINEL_GITHUB_PAT;
  if (!pat) return { error: "Sentinel's GitHub access isn't configured yet (SENTINEL_GITHUB_PAT missing in Netlify)." };
  const url = `https://api.github.com/repos/${repo}/contents/${sp.encoded}${ref ? "?ref=" + encodeURIComponent(clean(ref, 200)) : ""}`;
  let r;
  try { r = await fetch(url, { headers: { Authorization: "Bearer " + pat, Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "webswan-sentinel" } }); }
  catch (e) { return { error: "GitHub read did not go through: " + String(e.message || e).slice(0, 160) }; }
  if (!r.ok) return { error: "GitHub read failed (" + r.status + ") for " + repo + "/" + sp.path };
  const cl = Number(r.headers.get("content-length") || 0);
  if (cl && cl > MAX_FILE_BYTES) return { error: "File too large to diagnose directly (" + Math.round(cl / 1024) + " KB, limit " + Math.round(MAX_FILE_BYTES / 1024) + " KB): " + repo + "/" + sp.path + ". Ask about a specific function or line range instead." };
  const body = await readCapped(r, MAX_FILE_BYTES);
  if (body.tooLarge) return { error: "File too large to diagnose directly (over " + Math.round(body.approxBytes / 1024) + " KB, limit " + Math.round(MAX_FILE_BYTES / 1024) + " KB): " + repo + "/" + sp.path + ". Ask about a specific function or line range instead." };
  return { repo, path: sp.path, ref: ref || "default branch", content: scrubSecrets(body.text).slice(0, 20000) };
}

export async function sentinelReadCommits(repo, path, n) {
  if (!repoOk(repo)) return { error: "Repo not in Sentinel's authorized list: " + repo };
  const pat = process.env.SENTINEL_GITHUB_PAT;
  if (!pat) return { error: "Sentinel's GitHub access isn't configured yet (SENTINEL_GITHUB_PAT missing in Netlify)." };
  let p = "";
  if (clean(path, 300).trim()) { const sp = safePath(path); if (!sp.ok) return { error: sp.error }; p = sp.path; }
  const lim = Math.max(1, Math.min(20, Number(n) || 5));
  const url = `https://api.github.com/repos/${repo}/commits?${p ? "path=" + encodeURIComponent(p) + "&" : ""}per_page=${lim}`;
  let r;
  try { r = await fetch(url, { headers: { Authorization: "Bearer " + pat, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "webswan-sentinel" } }); }
  catch (e) { return { error: "GitHub commit read did not go through: " + String(e.message || e).slice(0, 160) }; }
  if (!r.ok) return { error: "GitHub commit read failed (" + r.status + ") for " + repo + (p ? "/" + p : "") };
  let list; try { list = await r.json(); } catch (e) { list = []; }
  return {
    repo, path: p || "(whole repo)",
    commits: (Array.isArray(list) ? list : []).slice(0, lim).map((c) => ({
      sha: (c.sha || "").slice(0, 10),
      message: scrubSecrets(clean((c.commit && c.commit.message) || "", 300)),
      author: scrubSecrets(((c.commit && c.commit.author && c.commit.author.name) || "").slice(0, 60)),
      at: (c.commit && c.commit.author && c.commit.author.date) || ""
    }))
  };
}

// ---- Live public-website inspection (SSRF-hardened) ----------------------------------------------------------

function ipToInt(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !(p >= 0 && p <= 255) || Number.isNaN(p))) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

// Private/reserved/loopback/link-local/CGNAT/test-net/multicast/metadata ranges -- anything in here is refused.
const PRIVATE_V4 = [
  [0x00000000, 8], [0x0A000000, 8], [0x7F000000, 8], [0xA9FE0000, 16],
  [0xAC100000, 12], [0xC0A80000, 16], [0x64400000, 10], [0xC0000000, 29],
  [0xC0000200, 24], [0xC6336400, 24], [0xCB007100, 24], [0xE0000000, 4], [0xF0000000, 4]
];

function isPrivateV4(ip) {
  const n = ipToInt(ip);
  if (n == null) return true; // fail closed on anything we can't parse
  for (const [base, bits] of PRIVATE_V4) {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((n & mask) === (base & mask)) return true;
  }
  return false;
}

function isPrivateV6(ip) {
  const a = String(ip || "").toLowerCase();
  if (a === "::1" || a === "::") return true;
  if (/^fe[89ab]/.test(a)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(a)) return true; // fc00::/7 unique local
  if (a.startsWith("::ffff:")) { const v4 = a.split(":").pop(); if (v4 && v4.includes(".")) return isPrivateV4(v4); }
  return false;
}

async function assertPublicHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h) return { ok: false, error: "Missing host." };
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return { ok: false, error: "That host (" + hostname + ") looks internal/local, not a public website -- refused." };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    return isPrivateV4(h) ? { ok: false, error: "That address (" + hostname + ") is a private/internal IP -- refused." } : { ok: true };
  }
  if (h.includes(":")) {
    return isPrivateV6(h) ? { ok: false, error: "That address is a private/internal IP -- refused." } : { ok: true };
  }
  let addrs;
  try { addrs = await dns.lookup(h, { all: true, verbatim: true }); }
  catch (e) { return { ok: false, error: "Could not resolve " + hostname + ": " + String(e.message || e).slice(0, 120) }; }
  if (!addrs || !addrs.length) return { ok: false, error: "Could not resolve " + hostname + " to any address." };
  for (const a of addrs) {
    if (a.family === 4 && isPrivateV4(a.address)) return { ok: false, error: "That host resolves to a private/internal address -- refused." };
    if (a.family === 6 && isPrivateV6(a.address)) return { ok: false, error: "That host resolves to a private/internal address -- refused." };
  }
  return { ok: true };
}

function parseUrlSafe(raw) {
  const s = clean(raw, 500).trim();
  if (!s) return { error: "Missing URL." };
  // Only treat a string as already having its own scheme if it's specifically http:// or https://; anything
  // else with a "scheme://" shape (ftp://, javascript://, file://, ...) must NOT have https:// silently
  // prepended in front of it -- that would mangle it into a confusing (if still rejected) URL instead of
  // cleanly failing the protocol check below with an honest error.
  const hasHttpScheme = /^https?:\/\//i.test(s);
  const hasOtherScheme = !hasHttpScheme && /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s);
  let u;
  try { u = new URL(hasOtherScheme ? s : (hasHttpScheme ? s : "https://" + s)); }
  catch (e) { return { error: "That doesn't look like a valid URL: " + s.slice(0, 200) }; }
  if (!/^https?:$/.test(u.protocol)) return { error: "Only http/https URLs are allowed." };
  if (u.username || u.password) return { error: "A URL with embedded credentials is refused." };
  if (u.port && !["80", "443"].includes(u.port)) return { error: "Only default web ports (80/443) are allowed for a website check." };
  return { url: u };
}

const FETCH_TIMEOUT_MS = 9000;
const MAX_PAGE_BYTES = 2_000_000;
const MAX_LINKS_CHECKED = 20;

async function fetchWithTimeout(url, opts) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try { return await fetch(url, { ...(opts || {}), signal: ac.signal, redirect: "manual" }); }
  finally { clearTimeout(t); }
}

async function safeFetchPage(startUrl) {
  let current = startUrl;
  for (let hop = 0; hop < 4; hop++) {
    const check = await assertPublicHost(current.hostname);
    if (!check.ok) return { error: check.error };
    let r;
    try { r = await fetchWithTimeout(current.toString(), { headers: { "User-Agent": "WebSwanSentinel/1.0 (+read-only compliance check)" } }); }
    catch (e) { return { error: "Fetch did not go through: " + String(e.message || e).slice(0, 160) }; }
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get("location");
      if (!loc) return { error: "Redirected (" + r.status + ") with no Location header to follow." };
      let next;
      try { next = new URL(loc, current); } catch (e) { return { error: "Redirect target is not a valid URL." }; }
      if (!/^https?:$/.test(next.protocol)) return { error: "Redirected to a non-http(s) URL -- refused." };
      current = next;
      continue;
    }
    return { response: r, finalUrl: current };
  }
  return { error: "Too many redirects (stopped after 4 hops)." };
}

async function checkLinkStatus(href, baseUrl) {
  let u;
  try { u = new URL(href, baseUrl); } catch (e) { return { error: "not a resolvable URL" }; }
  if (!/^https?:$/.test(u.protocol)) return { skipped: true, reason: "non-http(s) link (" + u.protocol + ")" };
  const check = await assertPublicHost(u.hostname);
  if (!check.ok) return { skipped: true, reason: "internal/private host -- not checked" };
  try {
    let r = await fetchWithTimeout(u.toString(), { method: "HEAD", headers: { "User-Agent": "WebSwanSentinel/1.0" } });
    if (r.status === 405 || r.status === 501) r = await fetchWithTimeout(u.toString(), { method: "GET", headers: { "User-Agent": "WebSwanSentinel/1.0", Range: "bytes=0-0" } });
    return { status: r.status };
  } catch (e) { return { error: String(e.message || e).slice(0, 100) }; }
}

function attrOf(tag, name) {
  const m = tag.match(new RegExp(name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  if (!m) return null;
  return m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
}

function extractTags(html, re) { return [...html.matchAll(re)].map((m) => m[0]); }

export async function sentinelInspectUrl(rawUrl, checksRaw) {
  const parsed = parseUrlSafe(rawUrl);
  if (parsed.error) return { error: parsed.error };
  const fetched = await safeFetchPage(parsed.url);
  if (fetched.error) return { error: fetched.error };
  const r = fetched.response;
  const ct = r.headers.get("content-type") || "";
  if (!/text\/html/i.test(ct)) { try { await r.body?.cancel?.(); } catch (e) {} return { error: "That URL did not return an HTML page (content-type: " + (ct || "unknown") + ") -- nothing to inspect." }; }
  const body = await readCapped(r, MAX_PAGE_BYTES);
  if (body.tooLarge) return { error: "Page too large to inspect directly (over " + Math.round(MAX_PAGE_BYTES / 1024) + " KB)." };
  const html = body.text;
  const base = fetched.finalUrl;

  const wanted = new Set(clean(checksRaw, 200).toLowerCase().split(",").map((s) => s.trim()).filter(Boolean));
  const want = (k) => wanted.size === 0 || wanted.has(k);

  const limitations = ["This reads the page's raw HTML as delivered by the server -- it does not run JavaScript, so anything a page builds client-side (a login flow, a booking widget, a single-page app's real content) is not seen or checked."];
  const out = { url: parsed.url.toString(), finalUrl: base.toString(), checks: [] };

  if (want("links")) {
    const hrefs = [];
    for (const a of extractTags(html, /<a\b[^>]*>/gi)) { const h = attrOf(a, "href"); if (h && !/^(javascript:|mailto:|tel:|#)/i.test(h.trim())) hrefs.push(h.trim()); }
    const uniq = [...new Set(hrefs)].slice(0, MAX_LINKS_CHECKED);
    const results = [];
    for (const h of uniq) results.push({ href: h, ...(await checkLinkStatus(h, base)) });
    out.checks.push({ type: "links", totalFound: hrefs.length, checked: uniq.length, results });
    if (hrefs.length > uniq.length) limitations.push("Only the first " + MAX_LINKS_CHECKED + " unique links on this page were checked (" + hrefs.length + " found in total).");
  }
  if (want("alt")) {
    const missing = [], empty = [];
    const imgs = extractTags(html, /<img\b[^>]*>/gi);
    for (const tag of imgs) {
      const alt = attrOf(tag, "alt"); const src = attrOf(tag, "src") || "(no src)";
      if (alt === null) missing.push(src); else if (alt.trim() === "") empty.push(src);
    }
    out.checks.push({ type: "alt_text", totalImages: imgs.length, missingAlt: missing.slice(0, 25), emptyAlt: empty.slice(0, 25) });
    limitations.push("Empty alt=\"\" can be intentional for a purely decorative image -- flagged for review, not assumed to be a violation.");
  }
  if (want("forms")) {
    const fields = extractTags(html, /<(input|select|textarea)\b[^>]*>/gi).filter((t) => !/type\s*=\s*["']?(hidden|submit|button|image)["']?/i.test(t));
    const labelFors = new Set([...html.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
    const unlabeled = [];
    for (const tag of fields) {
      const id = attrOf(tag, "id");
      const hasLabel = (id && labelFors.has(id)) || attrOf(tag, "aria-label") || attrOf(tag, "aria-labelledby") || attrOf(tag, "title");
      if (!hasLabel) unlabeled.push(tag.slice(0, 120));
    }
    out.checks.push({ type: "form_labels", totalFields: fields.length, unlabeled: unlabeled.slice(0, 25) });
    limitations.push("Form-field labeling is checked by pattern (for=/id, aria-label, aria-labelledby, title) -- a label that wraps the field instead can be missed, so this is a lead to confirm, not a final verdict.");
  }
  if (want("cookies")) {
    const lower = html.toLowerCase();
    const foundLibs = ["cookieconsent", "onetrust", "cookiebot", "cookieyes", "termly", "iubenda", "cookie-law-info", "complianz"].filter((k) => lower.includes(k));
    const hasBannerText = /\b(we use cookies|cookie policy|accept cookies|manage cookies|cookie preferences)\b/i.test(html);
    const privacyLink = [...html.matchAll(/<a\b[^>]*href=["']([^"']*)["'][^>]*>/gi)].some((m) => /privacy/i.test(m[1]));
    out.checks.push({ type: "cookie_signals", consentLibraryDetected: foundLibs, bannerTextDetected: hasBannerText, privacyPolicyLinkDetected: privacyLink });
    limitations.push("Cookie/consent detection looks for known banner libraries and common wording in the static HTML -- a banner injected only by JavaScript would not be seen, and this never rules on legal compliance itself (that's Jonathan's job, not Sentinel's).");
  }
  out.limitations = limitations;
  return out;
}

// ---- Live site-wide technical/privacy/accessibility scan via the WebSwan Technical Audit Lab -------------
// (Tania, Nov 19): sentinelInspectUrl above only checks links/alt/forms/cookies from raw HTML -- it cannot see
// tracking pixels, CSP headers, or categorize findings the way a real compliance pre-check needs. Rather than
// duplicate that logic here (and risk it drifting out of sync), this calls the REAL, already-correct scanner
// that already powers the standalone Audit Lab tool (repo webswan-technical-audit-lab, netlify/functions/scan.mts)
// over its public HTTPS API. Same evidence discipline as every other Sentinel tool: read-only, SSRF-checked
// before the call, result handed back as real named findings (never invented), and the one thing no scan of any
// kind can ever establish -- whether a vendor BAA is actually signed, or whether language rises to a bar-rule
// violation -- is explicitly flagged as unverifiable here rather than guessed at.
const AUDIT_LAB_SCAN_URL = "https://silver-malabi-1a1324.netlify.app/api/scan";
const SCAN_TIMEOUT_MS = 15000;

// Vendors whose own standard / free-tier terms do not include a signed Business Associate Agreement -- this is
// a fact about the VENDOR's public terms, not a claim about whatever contract this particular business may or
// may not have separately negotiated. Used only to raise a flag worth Jonathan's review, never as a verdict.
const NO_STANDARD_BAA_VENDORS = ["Meta (Facebook) Pixel", "TikTok Pixel", "LinkedIn Insight Tag", "Pinterest Tag", "Google Ads / DoubleClick", "Hotjar", "Microsoft Clarity", "Microsoft Ads (UET)", "X (Twitter) Pixel"];

const AUDIT_LAB_COVERED_STATES = { CA: "California", NY: "New York", FL: "Florida", TX: "Texas", UT: "Utah", NV: "Nevada", NJ: "New Jersey", AZ: "Arizona", CT: "Connecticut", GA: "Georgia", VA: "Virginia" };
const STATE_NAME_TO_CODE = Object.fromEntries(Object.entries(AUDIT_LAB_COVERED_STATES).map(([code, name]) => [name.toLowerCase(), code]));

// Resolves whatever Sentinel passed (a code, a full name, or something not on the Lab's covered-state list) into
// either a covered two-letter code, or OTHER with the original name preserved -- the Lab's scan.mts rejects any
// state value that isn't a covered code or literally "OTHER", so this never lets a bad state value block the scan.
function resolveAuditLabState(rawState) {
  const raw = clean(rawState, 40).trim();
  if (!raw) return { state: "", other: "" };
  const upper = raw.toUpperCase();
  if (AUDIT_LAB_COVERED_STATES[upper]) return { state: upper, other: "" };
  const byName = STATE_NAME_TO_CODE[raw.toLowerCase()];
  if (byName) return { state: byName, other: "" };
  if (upper === "OTHER") return { state: "OTHER", other: "" };
  return { state: "OTHER", other: raw.slice(0, 60) };
}

export async function sentinelScanSite(rawUrl, rawState, rawOther) {
  const parsed = parseUrlSafe(rawUrl);
  if (parsed.error) return { error: parsed.error };
  const hostCheck = await assertPublicHost(parsed.url.hostname);
  if (!hostCheck.ok) return { error: hostCheck.error };
  const resolved = resolveAuditLabState(rawState);
  const state = resolved.state;
  const other = resolved.other || clean(rawOther, 60).trim();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SCAN_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(AUDIT_LAB_SCAN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: parsed.url.toString(), state: state || undefined, other: other || undefined }),
      signal: ac.signal
    });
  } catch (e) { clearTimeout(timer); return { error: "The Audit Lab scanner did not respond: " + String(e.message || e).slice(0, 160) }; }
  clearTimeout(timer);
  let body;
  try { body = await res.json(); } catch (e) { body = null; }
  if (!body) return { error: "The Audit Lab scanner returned an unreadable response (HTTP " + res.status + ")." };
  if (body.error) return { error: body.error };
  if (!res.ok) return { error: "The Audit Lab scanner returned an error (HTTP " + res.status + ")." };
  return body;
}

export function formatSiteScan(r) {
  const meta = r.meta || {};
  const lines = [
    "Site scanned: " + (meta.finalUrl || meta.url || "(unknown)"),
    "Scanned at: " + (meta.scannedAt || "(unknown)"),
    "HTTP status: " + meta.status,
  ];
  if (meta.jsHeavy) lines.push("NOTE: this page builds most of its real content with JavaScript -- the raw HTML this scan reads is nearly empty, so results marked \"not checkable\" (na) may actually pass or fail once the page fully loads in a browser.");
  lines.push("", "SUMMARY (count of checks by result): " + (r.summary ? Object.entries(r.summary).map(([k, v]) => k + "=" + v).join(", ") : "(none)"), "");
  const flaggedVendors = [];
  for (const g of (r.groups || [])) {
    lines.push(String(g.title || "").toUpperCase() + ":");
    for (const c of (g.checks || [])) {
      lines.push("  [" + String(c.status || "").toUpperCase() + "] " + c.label + " -- " + c.detail);
      if (c.id === "trackers" && c.detail) for (const v of NO_STANDARD_BAA_VENDORS) if (c.detail.includes(v)) flaggedVendors.push(v);
    }
    lines.push("");
  }
  if (r.notCovered && r.notCovered.length) {
    lines.push("NOT COVERED BY THIS SCAN AT ALL (not checked -- not a pass, not evidence of anything):");
    for (const n of r.notCovered) lines.push("  - " + n);
    lines.push("");
  }
  if (r.notes && r.notes.length) { lines.push("NOTES:"); for (const n of r.notes) lines.push("  - " + n); lines.push(""); }
  if (flaggedVendors.length) {
    lines.push("COMPLIANCE FLAG TO VERIFY (a fact about the vendor's own standard terms, not a finding about this business): " +
      [...new Set(flaggedVendors)].join(", ") +
      " -- under each vendor's own standard/free-tier terms, none of these offer a signed Business Associate Agreement. If this site can collect any protected health information, firing one of these trackers on a page where that happens is a real HIPAA red flag worth Jonathan's review. This scan cannot see whether this specific business has a separate, negotiated BAA with any vendor -- that is a private contract, never visible from a site scan -- so report this as a flag to verify with Jonathan, never as a confirmed violation.");
    lines.push("");
  }
  lines.push("WHAT THIS SCAN CAN NEVER ESTABLISH: whether a Business Associate Agreement is or isn't actually signed with any vendor (a private contract, not a site property); a HIPAA-compliance or state-bar-advertising-rule verdict as a legal conclusion (Jonathan's call, same as every other Sentinel finding); anything a page only builds client-side with JavaScript after it loads; or whether consent/opt-out requests are actually honored server-side.");
  return lines.join("\n");
}

export function formatUrlInspection(r) {
  const lines = ["URL checked: " + r.url, "Final URL after redirects: " + r.finalUrl, ""];
  for (const c of r.checks) {
    if (c.type === "links") {
      lines.push("LINKS: " + c.checked + " of " + c.totalFound + " unique links checked.");
      for (const res of c.results) {
        if (res.skipped) lines.push("  - " + res.href + " -> skipped (" + res.reason + ")");
        else if (res.error) lines.push("  - " + res.href + " -> could not verify (" + res.error + ")");
        else lines.push("  - " + res.href + " -> HTTP " + res.status + (res.status >= 400 ? "  [BROKEN]" : ""));
      }
    } else if (c.type === "alt_text") {
      lines.push("ALT TEXT: " + c.totalImages + " <img> tags found.");
      lines.push("  Missing alt attribute entirely (" + c.missingAlt.length + "): " + (c.missingAlt.join(", ") || "none"));
      lines.push("  Present but empty alt=\"\" (" + c.emptyAlt.length + ", may be intentional/decorative): " + (c.emptyAlt.join(", ") || "none"));
    } else if (c.type === "form_labels") {
      lines.push("FORM FIELDS: " + c.totalFields + " non-hidden input/select/textarea fields found.");
      lines.push("  No detected label/aria-label/aria-labelledby/title (" + c.unlabeled.length + "): " + (c.unlabeled.join(" | ") || "none"));
    } else if (c.type === "cookie_signals") {
      lines.push("COOKIE/PRIVACY SIGNALS:");
      lines.push("  Known consent library detected: " + (c.consentLibraryDetected.length ? c.consentLibraryDetected.join(", ") : "none"));
      lines.push("  Cookie-banner-style wording detected: " + (c.bannerTextDetected ? "yes" : "no"));
      lines.push("  A link to a privacy policy detected: " + (c.privacyPolicyLinkDetected ? "yes" : "no"));
    }
    lines.push("");
  }
  lines.push("LIMITATIONS / what this check could NOT verify:");
  for (const l of r.limitations) lines.push("  - " + l);
  return lines.join("\n");
}

export async function sentinelLog(entry) {
  const st = teamStore();
  const idx = ((await st.get("sentinel-log", { type: "json" })) || []).filter((x) => Date.now() - new Date(x.at).getTime() < 90 * 86400000);
  const rec = {
    id: "sl" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    at: new Date().toISOString(),
    action: clean(entry.action, 40),
    target: clean(entry.target, 300),
    evidence: clean(entry.evidence, 1500),
    finding: clean(entry.finding, 2000)
  };
  idx.push(rec);
  await st.setJSON("sentinel-log", idx.slice(-1000));
  return rec;
}

export async function sentinelLogList(limit) {
  const st = teamStore();
  const idx = ((await st.get("sentinel-log", { type: "json" })) || []).filter((x) => Date.now() - new Date(x.at).getTime() < 90 * 86400000);
  return idx.slice(-Math.max(1, Math.min(200, Number(limit) || 50))).reverse();
}
