// WebSwan Technical Audit Lab - server-side page fetch + analysis.
// POST { url, state? } with a Firebase ID token (owner Google account) in Authorization.
// Safety: owner-only, http(s) only, blocks private/internal addresses, 15s timeout, 3 MB cap.
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { analyze } from "../../audit-lab/analyze.mjs";

const PROJECT_ID = "webswan-gigoia-task";
const OWNERS = ["thewebswann@gmail.com", "taniadomingue373@gmail.com"];
const ALLOWED_ORIGINS = ["https://webswan-billing.netlify.app", "https://taniad2169.github.io"];
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 WebSwanAuditLab/2.0";
let jwksCache = { keys: null, at: 0 };

const cors = (origin) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin", "Cache-Control": "no-store"
});
const reply = (status, body, origin) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
const b64urlJson = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

async function verifyFirebaseToken(token) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) throw new Error("bad token");
  const header = b64urlJson(parts[0]), payload = b64urlJson(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("bad token header");
  if (!jwksCache.keys || Date.now() - jwksCache.at > 3600e3) {
    const r = await fetch(JWKS_URL);
    if (!r.ok) throw new Error("cannot load Google keys");
    jwksCache = { keys: (await r.json()).keys, at: Date.now() };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown key");
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  if (!crypto.verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), key, Buffer.from(parts[2], "base64url"))) throw new Error("bad signature");
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== PROJECT_ID || payload.iss !== "https://securetoken.google.com/" + PROJECT_ID) throw new Error("wrong project");
  if (!(payload.exp > now) || !payload.email_verified) throw new Error("expired");
  return String(payload.email || "").toLowerCase();
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}
async function safeUrl(raw) {
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw); } catch (e) { throw new Error("That doesn't look like a website address."); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http and https websites can be scanned.");
  if (u.username || u.password) throw new Error("Website addresses with logins can't be scanned.");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname)) throw new Error("That address can't be scanned.");
  const addrs = net.isIP(u.hostname) ? [u.hostname] : (await dns.lookup(u.hostname, { all: true })).map((x) => x.address);
  if (!addrs.length || addrs.some(isPrivateIp)) throw new Error("That address can't be scanned.");
  return u;
}

async function fetchPage(startUrl) {
  let url = startUrl, res;
  for (let hop = 0; hop < 6; hop++) {
    await safeUrl(url.href);
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
    try { res = await fetch(url.href, { redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" } }); }
    finally { clearTimeout(t); }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { url = new URL(res.headers.get("location"), url); continue; }
    break;
  }
  const reader = res.body.getReader(); const chunks = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 3e6) { reader.cancel(); break; } chunks.push(value); }
  const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
  const headers = {}; res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  return { finalUrl: url.href, status: res.status, html, headers };
}

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Not allowed from this page." }, origin);
  let email;
  try { email = await verifyFirebaseToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")); }
  catch (e) { return reply(401, { error: "Please sign in with Google again." }, origin); }
  if (!OWNERS.includes(email)) return reply(403, { error: "This account can't run audits." }, origin);
  let body; try { body = await req.json(); } catch (e) { return reply(400, { error: "Bad request." }, origin); }
  const state = /^[A-Za-z]{2}$/.test(body.state || "") ? body.state.toUpperCase() : "";
  try {
    const start = await safeUrl(String(body.url || "").trim());
    const page = await fetchPage(start);
    if (page.status >= 400) return reply(502, { error: "The website answered with an error (" + page.status + "). It may block automated checks." }, origin);
    if (!/<html|<body|<head/i.test(page.html)) return reply(502, { error: "The website didn't return a normal web page." }, origin);
    const report = analyze(page.html, page.headers, page.finalUrl, { state });
    report.httpStatus = page.status;
    return reply(200, report, origin);
  } catch (e) {
    const msg = e.name === "AbortError" ? "The website took too long to answer." : (e.message || "Scan failed.");
    return reply(400, { error: msg }, origin);
  }
};
