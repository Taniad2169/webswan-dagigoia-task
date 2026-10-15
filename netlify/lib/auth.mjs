// Shared helpers for WebSwan functions: Firebase (Google sign-in) owner check + CORS.
import crypto from "node:crypto";

export const PROJECT_ID = "webswan-gigoia-task";
export const OWNERS = ["thewebswann@gmail.com", "taniadomingue373@gmail.com"];
export const ALLOWED_ORIGINS = ["https://taniad2169.github.io", "https://webswan-billing.netlify.app"];
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let jwksCache = { keys: null, at: 0 };

export const cors = (origin) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin", "Cache-Control": "no-store"
});
export const reply = (status, body, origin) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
const b64urlJson = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

export async function verifyOwner(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
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
  const email = String(payload.email || "").toLowerCase();
  if (!OWNERS.includes(email)) throw new Error("not owner");
  return email;
}
