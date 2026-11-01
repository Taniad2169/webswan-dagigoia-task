// GBP Manager: post to Google Business Profiles in one click, through Content360 (no trip to Google's page).
// Owners and the GBP manager account can use it. Needs CONTENT360_API_KEY in Netlify.
import { reply, cors, verifyOwner, ALLOWED_ORIGINS, GBP_MANAGERS } from "../lib/auth.mjs";
import { c360Ready, accounts, uploadMedia, createPost, isGBP } from "../lib/content360.mjs";

const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, n);

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Not allowed from this page." }, origin);
  try { await verifyOwner(req, GBP_MANAGERS); } catch { return reply(401, { error: "Please sign in with your WebSwan Google account." }, origin); }
  let b; try { b = await req.json(); } catch { return reply(400, { error: "Bad request." }, origin); }
  if (!c360Ready()) return reply(400, { error: "Content360 isn't connected yet: add CONTENT360_API_KEY in Netlify." }, origin);
  try {
    const gbp = (await accounts()).filter((a) => isGBP(a.provider));
    if (b.action === "accounts") return reply(200, { accounts: gbp.map((a) => ({ id: a.id, name: a.name, authorized: a.authorized })) }, origin);
    if (b.action === "post") {
      const ids = (Array.isArray(b.accountIds) ? b.accountIds : []).map(String);
      const targets = gbp.filter((a) => ids.includes(String(a.id)));
      if (!targets.length) return reply(400, { error: "Pick at least one Google profile." }, origin);
      const text = clean(b.text, 1500).trim();
      if (text.length < 20) return reply(400, { error: "Write the update first (Google allows up to 1,500 characters)." }, origin);
      const now = b.when !== "schedule";
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      const date = now ? today : clean(b.date, 10), time = now ? new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Los_Angeles" }) : clean(b.time, 5);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return reply(400, { error: "Pick the date and time." }, origin);
      let mediaIds = [];
      if (b.image) {
        const data = String(b.image).replace(/^data:[^,]+,/, "");
        if (data.length > 5_600_000) return reply(413, { error: "Photo too large (max about 4 MB)." }, origin);
        mediaIds = [await uploadMedia(new Blob([Buffer.from(data, "base64")], { type: /png/.test(String(b.image).slice(0, 30)) ? "image/png" : "image/jpeg" }), "google-update.jpg")];
      }
      const r = await createPost({ accountIds: targets.map((a) => a.id), providers: targets.map((a) => a.provider), text, mediaIds, date, time, title: text.slice(0, 80), now });
      return reply(200, { ok: true, scheduled: r.scheduled, now, note: r.scheduled ? "" : r.why || "" }, origin);
    }
    return reply(400, { error: "Unknown action." }, origin);
  } catch (e) { return reply(502, { error: e.message || "Content360 error." }, origin); }
};
