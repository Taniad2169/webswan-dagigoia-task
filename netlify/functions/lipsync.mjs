// WebSwan Video Maker backend: voices (Cartesia: Tania's voice clone + Portuguese/French/Spanish/English voices)
// and "Make me talk" talking videos, pay per use (no subscriptions):
//   kling_clip   Kling Lip Sync        your 2-10 s clip + your voice            ~$0.014 per 5 s of clip
//   kling_photo  Kling AI Avatar        your photo + your voice                  ~$0.0562 per second
//   omnihuman    OmniHuman 1.5          photo + voice + "what you do" (gestures)  ~$0.16 per second (720p, up to 60 s)
//   hedra        Hedra Character-3      photo + voice + prompt                   Hedra API wallet (~$0.05/s at 720p)
//   veo          Jimmy style (Veo 3.1)  photo + what you do + what you say; Veo speaks   ~$0.15 per second (8 s)
//   veo_myvoice  Jimmy style + MY voice Veo moves you (no sound), then Kling syncs your lips to your voice (voice up to 8 s)
// Security: only Tania's Google accounts (Firebase ID token, same sign-in as Voice Studio), only from her pages,
// keys stay in Netlify, and a daily spending cap.
// Env vars (set by Tania in Netlify, never in code):
//   FAL_KEY            fal.ai > Keys (Kling, OmniHuman, Veo)
//   HEDRA_API_KEY      optional, hedra.com > API (Hedra only)
//   CARTESIA_API_KEY   already set for Voice Studio (voices and voice clone)
//   LIPSYNC_DAILY_USD  optional daily cap in dollars (default 5)
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const PROJECT_ID = "webswan-voice-studio";
const OWNERS = ["thewebswann@gmail.com", "taniadomingue373@gmail.com"];
const ALLOWED_ORIGINS = ["https://taniad2169.github.io", "https://webswan-billing.netlify.app"];
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const CARTESIA = "https://api.cartesia.ai", CARTESIA_VERSION = "2026-03-01";
const LOCALES = { en: "en-US", pt: "pt-BR", fr: "fr-FR", es: "es-MX" };
const ENGINES = {
  kling_clip: { fal: "fal-ai/kling-video/lipsync/audio-to-video", needs: "video", maxVoice: 60, cost: (v, c) => Math.ceil(Math.max(2, c || 10) / 5) * 0.014 },
  kling_photo: { fal: "fal-ai/kling-video/v1/standard/ai-avatar", needs: "image", maxVoice: 60, cost: (v) => Math.max(1, v) * 0.0562 },
  omnihuman: { fal: "fal-ai/bytedance/omnihuman/v1.5", needs: "image", maxVoice: 60, cost: (v) => Math.max(1, v) * 0.16 },
  hedra: { needs: "image", maxVoice: 60, cost: (v) => Math.max(1, v) * 0.05 },
  veo: { fal: "fal-ai/veo3.1/fast/image-to-video", needs: "image", noVoice: true, cost: () => 8 * 0.15 },
  veo_myvoice: { fal: "fal-ai/veo3.1/fast/image-to-video", needs: "image", maxVoice: 8, cost: () => 8 * 0.10 + 0.028 }
};
const UPLOAD_TYPES = /^(image\/(jpeg|png|webp)|video\/(mp4|quicktime)|audio\/(wav|x-wav|mpeg|mp3))$/;

let jwksCache = { keys: null, at: 0 };
const cors = (origin) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin", "Cache-Control": "no-store"
});
const reply = (status, body, origin) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
const b64urlJson = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

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
const hedra = (path, init = {}) => fetch("https://api.hedra.com" + path, { ...init, headers: { Authorization: "Bearer " + process.env.HEDRA_API_KEY, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) } });
const cart = (path, init = {}) => fetch(CARTESIA + path, { ...init, headers: { Authorization: "Bearer " + process.env.CARTESIA_API_KEY, "Cartesia-Version": CARTESIA_VERSION, ...(init.headers || {}) } });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const isFalUrl = (u) => /^https:\/\/([a-z0-9-]+\.)*fal\.(media|ai|run)\//i.test(String(u || ""));
async function library(store) { // Tania's voice library: her clones first, then voices she saved
  const mine = ((await store.get("my-voices", { type: "json" })) || []).map((v) => ({ ...v, clone: true }));
  const saved = (await store.get("voice-library", { type: "json" })) || [];
  return [...mine, ...saved];
}
const falVideoUrl = (out) => out?.video?.url || out?.output?.video?.url || "";

async function falSubmit(model, input) {
  const r = await fal("https://queue.fal.run/" + model, { method: "POST", body: JSON.stringify(input) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.request_id) throw new Error("The video service didn't start (" + r.status + "): " + clean(j.detail ? JSON.stringify(j.detail) : j.message, 200));
  return j;
}

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Not allowed from this page." }, origin);
  let email;
  try { email = await verifyFirebaseToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")); }
  catch { return reply(401, { error: "Please sign in with Google again." }, origin); }
  if (!OWNERS.includes(email)) return reply(403, { error: "This account can't use the Video Maker tools." }, origin);
  let b; try { b = await req.json(); } catch { return reply(400, { error: "Bad request." }, origin); }

  const store = getStore({ name: "video-maker", consistency: "strong" });
  const capUsd = parseFloat(process.env.LIPSYNC_DAILY_USD || "5") || 5;
  const spentKey = "spent-" + today();
  const spent = parseFloat((await store.get(spentKey)) || "0") || 0;

  try {
    if (b.action === "status_check") {
      return reply(200, { fal: !!process.env.FAL_KEY, hedra: !!process.env.HEDRA_API_KEY, cartesia: !!process.env.CARTESIA_API_KEY,
        spentToday: +spent.toFixed(2), dailyCap: capUsd, myVoices: (await store.get("my-voices", { type: "json" })) || [] }, origin);
    }

    // ---------- voices (Cartesia) ----------
    if (b.action === "voices_list") { // browse Cartesia voices: gender + language, accent filtered by keywords
      if (!process.env.CARTESIA_API_KEY) return reply(503, { error: "Add CARTESIA_API_KEY in Netlify." }, origin);
      const lang = Object.keys(LOCALES).includes(b.language) ? b.language : "en";
      const gender = ["feminine", "masculine"].includes(b.gender) ? "&gender=" + b.gender : "";
      const words = String(b.accent || "").toLowerCase().split("|").map((w) => w.trim()).filter(Boolean);
      let all = [], cursor = "";
      for (let page = 0; page < 5; page++) {
        const r = await cart(`/voices?limit=100&language=${lang}${gender}${cursor ? "&starting_after=" + encodeURIComponent(cursor) : ""}`);
        const j = await r.json().catch(() => ({}));
        const list = Array.isArray(j) ? j : j.data || [];
        all = all.concat(list);
        if (!j.has_more || !list.length) break;
        cursor = list[list.length - 1].id;
      }
      let voices = all.filter((v) => !v.language || v.language === lang)
        .map((v) => ({ id: v.id, name: v.name, description: clean(v.description, 160), gender: v.gender || "" }));
      if (words.length) voices = voices.filter((v) => words.some((w) => (v.name + " " + v.description).toLowerCase().includes(w)));
      return reply(200, { voices: voices.slice(0, 60), library: await library(store) }, origin);
    }
    if (b.action === "library") return reply(200, { library: await library(store) }, origin);
    if (b.action === "library_add") {
      if (!/^[\w-]{8,80}$/.test(String(b.id || ""))) return reply(400, { error: "Bad voice." }, origin);
      const lib = (await store.get("voice-library", { type: "json" })) || [];
      if (!lib.some((v) => v.id === b.id)) lib.push({ id: b.id, name: clean(b.name, 60), tag: clean(b.tag, 60), language: clean(b.language, 5) || "en", at: Date.now() });
      await store.setJSON("voice-library", lib.slice(-40));
      return reply(200, { library: await library(store) }, origin);
    }
    if (b.action === "library_remove") {
      const id = String(b.id || "");
      await store.setJSON("voice-library", ((await store.get("voice-library", { type: "json" })) || []).filter((v) => v.id !== id));
      await store.setJSON("my-voices", ((await store.get("my-voices", { type: "json" })) || []).filter((v) => v.id !== id));
      return reply(200, { library: await library(store) }, origin);
    }
    if (b.action === "voice_clone") {
      if (!process.env.CARTESIA_API_KEY) return reply(503, { error: "Add CARTESIA_API_KEY in Netlify." }, origin);
      const wav = Buffer.from(String(b.wav_base64 || ""), "base64");
      if (wav.length < 20000 || wav.length > 4_500_000) return reply(400, { error: "Record 10 to 60 seconds of your voice." }, origin);
      const fd = new FormData();
      fd.append("clip", new Blob([wav], { type: "audio/wav" }), "tania-voice.wav");
      fd.append("name", clean(b.name || "Tania (my voice)", 60));
      fd.append("language", Object.keys(LOCALES).includes(b.language) ? b.language : "en");
      fd.append("description", "Tania's own voice for WebSwan videos");
      const r = await cart("/voices/clone", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) return reply(502, { error: "Cartesia couldn't clone the voice (" + r.status + "): " + clean(j.message || j.error, 160) }, origin);
      const mine = (await store.get("my-voices", { type: "json" })) || [];
      mine.unshift({ id: j.id, name: j.name || b.name, tag: clean(b.tag, 60) || "My voice", language: "en", at: Date.now() });
      await store.setJSON("my-voices", mine.slice(0, 10));
      return reply(200, { id: j.id, library: await library(store) }, origin);
    }
    if (b.action === "tts") {
      if (!process.env.CARTESIA_API_KEY) return reply(503, { error: "Add CARTESIA_API_KEY in Netlify." }, origin);
      const text = clean(b.text, 1500), lang = Object.keys(LOCALES).includes(b.language) ? b.language : "en";
      if (!text) return reply(400, { error: "Write your script first." }, origin);
      if (!/^[\w-]{8,80}$/.test(String(b.voice_id || ""))) return reply(400, { error: "Pick a voice." }, origin);
      const r = await cart("/tts/bytes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        model_id: "sonic-latest", transcript: text, voice: { mode: "id", id: b.voice_id },
        output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 24000 }, locale: LOCALES[lang] }) });
      if (!r.ok) { const t = await r.text(); return reply(502, { error: "Cartesia voice error (" + r.status + "): " + clean(t, 160) }, origin); }
      return reply(200, { wav_base64: Buffer.from(await r.arrayBuffer()).toString("base64") }, origin);
    }

    // ---------- uploads to fal storage ----------
    if (b.action === "upload_init") {
      if (!process.env.FAL_KEY) return reply(503, { error: "Add FAL_KEY in Netlify to turn on Make me talk." }, origin);
      const type = String(b.content_type || "");
      if (!UPLOAD_TYPES.test(type)) return reply(400, { error: "Use a JPG/PNG photo, an MP4/MOV clip, or a WAV/MP3 voice." }, origin);
      const r = await fal("https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
        method: "POST", body: JSON.stringify({ content_type: type, file_name: String(b.file_name || "upload").replace(/[^\w.-]/g, "_").slice(0, 80) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.upload_url || !j.file_url) return reply(502, { error: "Upload storage didn't answer (" + r.status + ")." }, origin);
      return reply(200, { upload_url: j.upload_url, file_url: j.file_url }, origin);
    }

    // ---------- start a talking video ----------
    if (b.action === "submit") {
      const e = ENGINES[b.engine];
      if (!e) return reply(400, { error: "Pick a lip-sync option." }, origin);
      if (b.engine === "hedra" ? !process.env.HEDRA_API_KEY : !process.env.FAL_KEY) return reply(503, { error: b.engine === "hedra" ? "Add HEDRA_API_KEY in Netlify to use Hedra." : "Add FAL_KEY in Netlify to turn on Make me talk." }, origin);
      const voiceS = parseFloat(b.seconds) || 0, clipS = parseFloat(b.clip_seconds) || 0;
      if (!e.noVoice && (!(voiceS > 0) || voiceS > e.maxVoice)) return reply(400, { error: `For this option your voice must be under ${e.maxVoice} seconds.` }, origin);
      const media = e.needs === "video" ? b.video_url : b.image_url;
      if (!isFalUrl(media) || (!e.noVoice && !isFalUrl(b.audio_url))) return reply(400, { error: "Upload your files first." }, origin);
      const est = e.cost(voiceS, clipS);
      if (spent + est > capUsd) return reply(429, { error: `That would pass today's $${capUsd} limit (spent $${spent.toFixed(2)}). Raise LIPSYNC_DAILY_USD in Netlify if you need more.` }, origin);
      const action = clean(b.action_prompt, 400) || "Speaking warmly and naturally to the camera with natural hand gestures";
      const line = clean(b.line, 300), aspect = ["9:16", "16:9"].includes(b.aspect) ? b.aspect : (b.aspect === "1:1" ? "1:1" : "9:16");
      let job;
      if (b.engine === "hedra") {
        const r = await hedra("/v3/models/hedra-character-3", { method: "POST", body: JSON.stringify({ input: {
          prompt: action, aspect_ratio: aspect, resolution: "720p",
          start_image: { source: "url", url: media }, audio: { source: "url", url: b.audio_url } } }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.job_id) return reply(502, { error: "Hedra didn't start (" + r.status + "): " + clean(j.message || j.error || JSON.stringify(j), 200) }, origin);
        job = { kind: "hedra", job_id: j.job_id };
      } else {
        let input;
        if (b.engine === "kling_clip") input = { video_url: media, audio_url: b.audio_url };
        else if (b.engine === "kling_photo") input = { image_url: media, audio_url: b.audio_url, prompt: action };
        else if (b.engine === "omnihuman") input = { image_url: media, audio_url: b.audio_url, prompt: action, resolution: "720p" };
        else input = { image_url: media, duration: "8s", resolution: "720p", aspect_ratio: aspect === "1:1" ? "auto" : aspect,
          generate_audio: b.engine === "veo",
          prompt: b.engine === "veo" ? `${action}. She looks at the camera and says in a warm, confident voice: "${line}"` : `${action}. She is talking to the camera, mouth moving as she speaks.` };
        const j = await falSubmit(e.fal, input);
        job = { kind: "fal", status_url: j.status_url, response_url: j.response_url };
        if (b.engine === "veo_myvoice") job.chain = { audio_url: b.audio_url };
      }
      await store.set(spentKey, String(spent + est));
      const id = crypto.randomUUID();
      await store.setJSON("job-" + id, { ...job, engine: b.engine, est, at: Date.now() });
      return reply(200, { request_id: id, estimate: +est.toFixed(2) }, origin);
    }

    // ---------- check progress ----------
    if (b.action === "check") {
      const key = "job-" + String(b.request_id || "").replace(/[^\w-]/g, "");
      const job = await store.get(key, { type: "json" });
      if (!job) return reply(404, { error: "That video job wasn't found." }, origin);
      if (job.kind === "hedra") {
        const s = await hedra(`/v3/jobs/${encodeURIComponent(job.job_id)}/status`).then((r) => r.json()).catch(() => ({}));
        if (s.status === "FAILED") return reply(200, { status: "FAILED", error: clean(s.error?.message || s.message || "Hedra couldn't make it.", 200) }, origin);
        if (s.status !== "COMPLETED") return reply(200, { status: s.status || "IN_QUEUE", progress: s.progress ?? null }, origin);
        const out = await hedra(`/v3/jobs/${encodeURIComponent(job.job_id)}`).then((r) => r.json()).catch(() => ({}));
        const o = (out.outputs || [])[0] || {};
        const url = o.url || o.video_url || o.download_url || o.asset?.url || "";
        return reply(200, url ? { status: "COMPLETED", video_url: url } : { status: "FAILED", error: "Hedra finished but no video link came back." }, origin);
      }
      const s = await fal(job.status_url).then((r) => r.json()).catch(() => ({}));
      if (s.status !== "COMPLETED") return reply(200, { status: s.status || "IN_QUEUE", position: s.queue_position ?? null, step: job.chain ? "moving you" : (job.engine === "veo_myvoice" ? "syncing your voice" : null) }, origin);
      const out = await fal(job.response_url).then((r) => r.json()).catch(() => ({}));
      const url = falVideoUrl(out);
      if (!url) return reply(200, { status: "FAILED", error: clean(out.detail ? JSON.stringify(out.detail) : "No video came back.", 200) }, origin);
      if (job.chain) { // Jimmy style + my voice: step 2, sync Tania's voice onto the Veo video
        const j = await falSubmit(ENGINES.kling_clip.fal, { video_url: url, audio_url: job.chain.audio_url });
        await store.setJSON(key, { ...job, status_url: j.status_url, response_url: j.response_url, chain: null, motion_url: url });
        return reply(200, { status: "IN_PROGRESS", step: "syncing your voice" }, origin);
      }
      return reply(200, { status: "COMPLETED", video_url: url }, origin);
    }
    return reply(400, { error: "Unknown action." }, origin);
  } catch (e) {
    return reply(502, { error: clean(e.message, 300) }, origin);
  }
};
