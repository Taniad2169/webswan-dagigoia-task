// Clay webhook receiver (Tania, Nov 25 -- "build the clay/apollo account plugged too"): Clay.com has no universal
// "search leads" API the way Apollo does. Its own model is a table YOU build in Clay's UI, with an
// enrichment/Claygent column that CALLS OUT to a webhook you configure, per row, once that row is enriched. This
// function is that webhook: point a Clay table's HTTP API (or webhook) action at this URL with
// ?secret=<CLAY_WEBHOOK_SECRET> (the same value Tania sets in Netlify), and whatever Clay sends for that row is
// saved here, keyed by whatever identifier the row carries (email first, then domain/website, then company name,
// then Clay's own row id). Mariska reads it back later with her ((CLAY LOOKUP: ...)) tag (see lib/team.mjs
// clayLookup and lib/team.mjs's CLAYGENT_APOLLO_BRAIN) -- she can only ever report what actually arrived here, never
// a live Clay search she triggers herself. Inert and refuses every request until CLAY_WEBHOOK_SECRET is set.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only." }), { status: 405, headers: { "Content-Type": "application/json" } });
  const secret = process.env.CLAY_WEBHOOK_SECRET;
  if (!secret) return new Response(JSON.stringify({ error: "Not connected yet: set CLAY_WEBHOOK_SECRET in Netlify first, then point your Clay table's webhook action at this URL with ?secret=<that value>." }), { status: 400, headers: { "Content-Type": "application/json" } });
  const url = new URL(req.url);
  const got = url.searchParams.get("secret") || req.headers.get("x-clay-secret") || "";
  if (got !== secret) return new Response(JSON.stringify({ error: "Bad or missing secret." }), { status: 401, headers: { "Content-Type": "application/json" } });
  let body;
  try { body = await req.json(); } catch (e) { return new Response(JSON.stringify({ error: "Bad JSON body." }), { status: 400, headers: { "Content-Type": "application/json" } }); }
  if (!body || typeof body !== "object") return new Response(JSON.stringify({ error: "Expected a JSON object body." }), { status: 400, headers: { "Content-Type": "application/json" } });

  const norm = (v) => String(v || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const email = norm(body.email || body.Email);
  const domain = norm(body.domain || body.Domain || body.website || body.Website);
  const company = norm(body.company || body.Company || body.company_name || body.companyName);
  const rowId = String(body.row_id || body.rowId || body.id || "").trim();
  const key = email || domain || company || rowId;
  if (!key) return new Response(JSON.stringify({ error: "No email, domain/website, company name or row id in the payload -- nothing to key this result by." }), { status: 400, headers: { "Content-Type": "application/json" } });

  const st = getStore({ name: "clay-results", consistency: "strong" });
  const record = { at: new Date().toISOString(), email, domain, company, rowId, data: body };
  try {
    await st.setJSON(key, record);
    // A small rolling index of the most recent keys, so "what's new from Clay" can be answered without guessing a key.
    const idx = (await st.get("_index", { type: "json" }).catch(() => null)) || [];
    const next = [key, ...idx.filter((k) => k !== key)].slice(0, 200);
    await st.setJSON("_index", next);
  } catch (e) {
    return new Response(JSON.stringify({ error: "Storage error: " + String(e.message || e).slice(0, 160) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ ok: true, key }), { status: 200, headers: { "Content-Type": "application/json" } });
};
