// Swan Video settings: which video Tania's video bubble plays on each WebSwan site, and its buttons.
//   GET  ?site=wsmn|webswan|digital   -> public, read-only (the widget on each site reads it)
//   POST { action: "get" }            -> owner (Google sign-in): every site + the video library
//   POST { action: "set", config }    -> owner: save
import { getStore } from "@netlify/blobs";
import { verifyOwner, reply, cors } from "../lib/auth.mjs";

const SITES = ["wsmn", "webswan", "digital"];
const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
const okVideo = (v) => /^[\w-]{11}$/.test(v) || /(youtu\.be\/|youtube\.com\/)/.test(v) || /^https:\/\/\S+\.(mp4|webm|mov)(\?\S*)?$/i.test(v);
const okIntake = (v) => !v || /^#[\w-]{1,60}$/.test(v) || /^https:\/\/\S{3,300}$/.test(v);
const okTel = (v) => !v || /^\+\d{10,15}$/.test(v);

function sanitize(c) {
  const out = { videos: [], sites: {} };
  for (const v of (Array.isArray(c && c.videos) ? c.videos : []).slice(0, 40)) {
    const url = clean(v && v.url, 300), title = clean(v && v.title, 120);
    if (url && okVideo(url)) out.videos.push({ id: clean(v.id, 40) || Math.random().toString(36).slice(2, 10), title: title || "Video", url });
  }
  for (const s of SITES) {
    const x = (c && c.sites && c.sites[s]) || {};
    const video = clean(x.video, 300), intake = clean(x.intake, 300), rachel = clean(x.rachel, 16), photo = clean(x.photo, 300);
    out.sites[s] = {
      on: x.on !== false,
      title: clean(x.title, 90),
      video: okVideo(video) ? video : "",
      rachel: okTel(rachel) ? rachel : "",
      rachelLabel: clean(x.rachelLabel, 30),
      intake: okIntake(intake) ? intake : "",
      intakeLabel: clean(x.intakeLabel, 60),
      photo: /^https:\/\/\S{3,300}$/.test(photo) ? photo : ""
    };
  }
  return out;
}

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  const store = getStore({ name: "site-video", consistency: "strong" });
  if (req.method === "GET") {
    const site = new URL(req.url).searchParams.get("site") || "";
    const cfg = (await store.get("config", { type: "json" }).catch(() => null)) || { sites: {} };
    const s = SITES.includes(site) ? (cfg.sites || {})[site] || null : null;
    return new Response(JSON.stringify({ site: s }), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } });
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  try { await verifyOwner(req); } catch (e) { return reply(401, { error: "Sign in with Tania's Google account." }, origin); }
  let b = {}; try { b = await req.json(); } catch (e) {}
  if (b.action === "set") {
    const cfg = sanitize(b.config);
    await store.setJSON("config", cfg);
    return reply(200, { ok: true, config: cfg }, origin);
  }
  return reply(200, { config: (await store.get("config", { type: "json" }).catch(() => null)) || null }, origin);
};

