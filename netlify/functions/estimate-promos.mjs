// WebSwan Project Estimate promotions (holiday specials and other offers Tania turns on).
//   GET                              -> public: only the promotions that are ON (the estimate page and its orange banner read it)
//   POST { action: "get" }           -> owner (Google sign-in): every promotion, on and off
//   POST { action: "set", promos }   -> owner: save
// Opening the back office on the page uses Tania's 7-click lock + code; saving here also needs her Google sign-in.
import { getStore } from "@netlify/blobs";
import { verifyOwner, reply, cors } from "../lib/auth.mjs";

const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
const amount = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : 0; };

function sanitize(list) {
  return (Array.isArray(list) ? list : []).slice(0, 12).map((p) => ({
    id: clean(p && p.id, 40).replace(/[^\w-]/g, "") || Math.random().toString(36).slice(2, 10),
    on: !!(p && p.on),
    name: clean(p && p.name, 80) || "Special",
    setup: amount(p && p.setup),
    monthly: amount(p && p.monthly),
    note: clean(p && p.note, 140)
  }));
}

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  const store = getStore({ name: "estimate-promos", consistency: "strong" });
  const load = async () => (await store.get("promos", { type: "json" }).catch(() => null)) || null;
  if (req.method === "GET") {
    const all = (await load()) || [];
    return new Response(JSON.stringify({ promos: all.filter((p) => p.on) }), {
      status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" }
    });
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  try { await verifyOwner(req); } catch (e) { return reply(401, { error: "Sign in with Tania's Google account." }, origin); }
  let b = {}; try { b = await req.json(); } catch (e) {}
  if (b.action === "set") {
    const promos = sanitize(b.promos);
    await store.setJSON("promos", promos);
    return reply(200, { ok: true, promos }, origin);
  }
  return reply(200, { promos: await load() }, origin);
};
