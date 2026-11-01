// "Make me talk" for the WebSwan Video Maker: Tania's photo or short video clip + her voice -> a lip-synced talking video.
// Uses Kling on fal.ai, pay per use (no subscription):
//   clip  = fal-ai/kling-video/lipsync/audio-to-video  (video 2-10 s, about $0.014 per 5 s of video)
//   photo = fal-ai/kling-video/v1/standard/ai-avatar    (about $0.0562 per second of output)
// Security: only Tania's Google accounts (Firebase ID token from webswan-voice-studio, same sign-in as Voice Studio),
// only from her GitHub Pages / Netlify pages, the fal key stays in Netlify, and a daily spending cap.
// Env vars (set by Tania in Netlify, never in code):
//   FAL_KEY            from fal.ai > Dashboard > Keys
//   LIPSYNC_DAILY_USD  optional daily spending cap in dollars (default 5)
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const PROJECT_ID = "webswan-voice-studio";
const OWNERS = ["thewebswann@gmail.com", "taniadomingue373@gmail.com"];
const ALLOWED_ORIGINS = ["https://taniad2169.github.io", "https://webswan-billing.netlify.app"];
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const MODELS = {
  clip: { id: "fal-ai/kling-video/lipsync/audio-to-video", cost: (s) => Math.ceil(Math.max(1, s) / 5) * 0.014 },
  photo: { id: "fal-ai/kling-video/v1/standard/ai-avatar", cost: (s) => Math.max(1, s) * 0.0562 }
};
const MAX_AUDIO_S = 60;
const UPLOAD_TYPES = /^(image\/(jpeg|png|webp)|video\/(mp4|quicktime)|audio\/(wav|x-wav|mpeg|mp3))$/;

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
  const ok = crypto.verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), crypto.createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"));
  if (!ok) throw new Error("bad signature");
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== PROJECT_ID || payload.iss !== "https://securetoken.google.com/" + PROJECT_ID) throw new Error("wrong project");
  if (!(payload.exp > now) || !(payload.iat <= now + 60) || !payload.sub) throw new Error("expired");
  if (!payload.email_verified) throw new Error("email not verified");
  return String(payload.email || "").toLowerCase();
}

const fal = (url, init = {}) => fetch(url, { ...init, headers: { Authorization: "Key " + process.env.FAL_KEY, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) } });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const isFalUrl = (u) => /^https:\/\/([a-z0-9-]+\.)*fal\.(media|ai|run)\//i.test(String(u || ""));

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Not allowed from this page." }, origin);
  let email;
  try { email = await verifyFirebaseToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")); }
  catch { return reply(401, { error: "Please sign in with Google again." }, origin); }
  if (!OWNERS.includes(email)) return reply(403, { error: "This account can't use Make me talk." }, origin);
  let b; try { b = await req.json(); } catch { return reply(400, { error: "Bad request." }, origin); }

  const store = getStore({ name: "video-maker", consistency: "strong" });
  const capUsd = parseFloat(process.env.LIPSYNC_DAILY_USD || "5") || 5;
  const spentKey = "spent-" + today();
  const spent = parseFloat((await store.get(spentKey)) || "0") || 0;

  if (b.action === "status_check") return reply(200, { ready: !!process.env.FAL_KEY, spentToday: +spent.toFixed(2), dailyCap: capUsd }, origin);
  if (!process.env.FAL_KEY) return reply(503, { error: "Make me talk isn't connected yet: add FAL_KEY in Netlify." }, origin);

  // 1) get a one-time upload link so the browser sends the photo/clip/voice straight to fal storage
  if (b.action === "upload_init") {
    const type = String(b.content_type || "");
    if (!UPLOAD_TYPES.test(type)) return reply(400, { error: "Use a JPG/PNG photo, an MP4/MOV clip, or a WAV/MP3 voice." }, origin);
    const r = await fal("https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
      method: "POST", body: JSON.stringify({ content_type: type, file_name: String(b.file_name || "upload").replace(/[^\w.-]/g, "_").slice(0, 80) })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.upload_url || !j.file_url) return reply(502, { error: "fal storage didn't accept the upload (" + r.status + ")." }, origin);
    return reply(200, { upload_url: j.upload_url, file_url: j.file_url }, origin);
  }

  // 2) start the talking video
  if (b.action === "submit") {
    const m = MODELS[b.mode];
    if (!m) return reply(400, { error: "Pick photo or video clip." }, origin);
    const seconds = Math.min(MAX_AUDIO_S, Math.max(1, parseFloat(b.seconds) || 0));
    if (!(parseFloat(b.seconds) > 0) || parseFloat(b.seconds) > MAX_AUDIO_S) return reply(400, { error: "Your voice must be 1 to 60 seconds." }, origin);
    const est = m.cost(b.mode === "clip" ? Math.min(10, parseFloat(b.clip_seconds) || 10) : seconds);
    if (spent + est > capUsd) return reply(429, { error: `That would pass today's $${capUsd} limit (spent $${spent.toFixed(2)}). Raise LIPSYNC_DAILY_USD in Netlify if you need more.` }, origin);
    if (!isFalUrl(b.audio_url) || !isFalUrl(b.mode === "clip" ? b.video_url : b.image_url)) return reply(400, { error: "Upload your files first." }, origin);
    const input = b.mode === "clip" ? { video_url: b.video_url, audio_url: b.audio_url } : { image_url: b.image_url, audio_url: b.audio_url, prompt: "A friendly professional woman speaking naturally to the camera." };
    const r = await fal("https://queue.fal.run/" + m.id, { method: "POST", body: JSON.stringify(input) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.request_id) return reply(502, { error: "fal didn't start the video (" + r.status + "): " + String(j.detail || j.message || "").slice(0, 200) }, origin);
    await store.set(spentKey, String(spent + est));
    await store.setJSON("job-" + j.request_id, { status_url: j.status_url, response_url: j.response_url, mode: b.mode, est, at: Date.now() });
    return reply(200, { request_id: j.request_id, estimate: +est.toFixed(2) }, origin);
  }

  // 3) check progress; when finished, return the video link
  if (b.action === "check") {
    const job = await store.get("job-" + String(b.request_id || "").replace(/[^\w-]/g, ""), { type: "json" });
    if (!job) return reply(404, { error: "That video job wasn't found." }, origin);
    const s = await fal(job.status_url).then((r) => r.json()).catch(() => ({}));
    if (s.status !== "COMPLETED") return reply(200, { status: s.status || "IN_QUEUE", position: s.queue_position ?? null }, origin);
    const out = await fal(job.response_url).then((r) => r.json()).catch(() => ({}));
    const url = out?.video?.url;
    if (!url) return reply(200, { status: "FAILED", error: String(out.detail || "No video came back.").slice(0, 200) }, origin);
    return reply(200, { status: "COMPLETED", video_url: url }, origin);
  }
  return reply(400, { error: "Unknown action." }, origin);
};
