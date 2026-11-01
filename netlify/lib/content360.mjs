// Content360 (built on Mixpost) bridge for Tatiana Lambert: list Tania's connected accounts,
// upload videos, and create scheduled posts. Netlify env: CONTENT360_API_KEY (Content360 > Profile > Access tokens),
// optional CONTENT360_WORKSPACE (defaults to Tania's workspace).
import { teamStore } from "./team.mjs";

const BASE = "https://app.content360.io/os/api/";
const WS = () => process.env.CONTENT360_WORKSPACE || "833f16e6-79e5-4227-99f4-3be567ffca8a";
export const c360Ready = () => !!process.env.CONTENT360_API_KEY;

// Text-only posts can only go to these networks; Instagram, TikTok and YouTube need a photo or video.
export const TEXT_OK = ["facebook_page", "facebook_group", "linkedin", "linkedin_page", "twitter", "threads", "bluesky", "mastodon"];
// Posts with a picture can also go to Instagram (TikTok and YouTube are for videos only).
export const IMAGE_OK = [...TEXT_OK, "instagram", "instagram_direct", "pinterest"];
// Google Business Profile ("Google My Business" in Content360) gets the Google updates and blog summaries, not the social posts.
export const isGBP = (provider) => /google|gmb|gbp|business_profile/i.test(String(provider || ""));
export const BRANDS = ["The WebSwan", "WebSwan Digital Solutions", "WebSwan Media Network"];

export async function c360(method, path, body, isForm) {
  if (!c360Ready()) throw new Error("Content360 isn't connected yet: add CONTENT360_API_KEY in Netlify.");
  const headers = { Authorization: "Bearer " + process.env.CONTENT360_API_KEY, Accept: "application/json" };
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const r = await fetch(BASE + WS() + path, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch { j = { message: t.slice(0, 200) }; }
  if (!r.ok) {
    const errs = j.errors ? " " + Object.values(j.errors).flat().join(" ") : "";
    throw new Error(("Content360 " + r.status + ": " + (j.message || "error") + errs).slice(0, 400));
  }
  return j;
}

export async function accounts() {
  const j = await c360("GET", "/accounts");
  return (j.data || j || []).map((a) => ({ id: a.id, name: a.name, username: a.username || "", provider: a.provider, uuid: a.uuid || "", authorized: a.authorized !== false }));
}

// Upload a file (Blob) to the Content360 media library. Returns the media id.
export async function uploadMedia(blob, filename) {
  const fd = new FormData();
  fd.append("file", blob, filename);
  const j = await c360("POST", "/media", fd, true);
  const m = j.data || j;
  if (!m || m.id == null) throw new Error("Content360 didn't return a media id.");
  return m.id;
}

// Per-network options Content360 needs for videos (YouTube title, TikTok privacy, Instagram/Facebook reel).
function optionsFor(provs, title, isVideo) {
  const o = {};
  if (provs.includes("youtube")) o.youtube = { title: String(title || "").slice(0, 95) || "The WebSwan", status: "public" };
  if (provs.includes("tiktok")) o.tiktok = { privacy_level: "PUBLIC_TO_EVERYONE", allow_comments: true, allow_duet: false, allow_stitch: false, content_disclosure: false, brand_organic_toggle: false, brand_content_toggle: false };
  if (isVideo && provs.includes("instagram_direct")) o.instagram = { type: "reel" };
  if (isVideo && provs.includes("instagram")) o.instagram = { type: "reel" };
  if (isVideo && provs.includes("facebook_page")) o.facebook_page = { type: "reel" };
  return o;
}

// Create one post in Content360 for the given accounts on date "YYYY-MM-DD" at time "HH:MM" Pacific.
// If Content360 refuses to schedule it, it's saved as a draft there so Tania can finish it in Content360.
export async function createPost({ accountIds, providers, text, mediaIds = [], date, time, title, isVideo, now }) {
  const html = String(text || "").split(/\n{2,}/).map((p) => "<div>" + p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>") + "</div>").join("");
  const body = (schedule) => ({
    schedule: now ? false : schedule, schedule_now: !!(now && schedule), queue: false, date, time, timezone: "America/Los_Angeles",
    accounts: accountIds, tags: [],
    versions: [{ account_id: 0, is_original: true, content: [{ body: html, media: mediaIds, url: "" }], options: optionsFor(providers, title, isVideo) }]
  });
  try {
    const j = await c360("POST", "/posts", body(true));
    return { id: (j.data || j).uuid || (j.data || j).id, scheduled: true };
  } catch (e) {
    const j = await c360("POST", "/posts", body(false));
    return { id: (j.data || j).uuid || (j.data || j).id, scheduled: false, why: e.message };
  }
}

// Which brands each Content360 account posts for (one account can serve several brands, e.g. Instagram the_webswan posts for all 3).
export async function brandMap() {
  const m = (await teamStore().get("c360-brands", { type: "json" })) || {};
  for (const k of Object.keys(m)) m[k] = (Array.isArray(m[k]) ? m[k] : [m[k]]).filter((b) => BRANDS.includes(b));
  return m;
}
// Tania's setup (Oct 31, 2026), used until she saves her own choices:
// The WebSwan Facebook page posts for The WebSwan + Digital Solutions; the Media Network Facebook page for Media Network;
// Instagram the_webswan, LinkedIn and TikTok @taniadomngue for all three.
export function suggestedMap(accts) {
  const m = {};
  for (const a of accts) {
    const n = (a.name + " " + a.username).toLowerCase();
    if (isGBP(a.provider)) m[a.id] = [/media network/.test(n) ? BRANDS[2] : /digital solutions/.test(n) ? BRANDS[1] : BRANDS[0]];
    else if (a.provider === "facebook_page" && /media network|essence/.test(n)) m[a.id] = [BRANDS[2]];
    else if (a.provider === "facebook_page" && /webswan/.test(n)) m[a.id] = [BRANDS[0], BRANDS[1]];
    else if (/instagram/.test(a.provider) && /the_webswan/.test(n)) m[a.id] = [...BRANDS];
    else if (a.provider === "tiktok" && /taniadomngue/.test(n)) m[a.id] = [...BRANDS];
    else if (/linkedin/.test(a.provider)) m[a.id] = [...BRANDS];
  }
  return m;
}
// Disconnected accounts (red dot in Content360) are skipped so one dead login never blocks a post.
export const servesBrand = (map, acct, brand) => acct.authorized !== false && (map[acct.id] || []).includes(brand);
