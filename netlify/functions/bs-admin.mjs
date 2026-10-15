// WebSwan Business Service - owner-only admin API (list, get, update requests).
import { getStore } from "@netlify/blobs";
import { reply, cors, verifyOwner, ALLOWED_ORIGINS } from "../lib/auth.mjs";
import { makePayLink, checkPaid, amountFor } from "../lib/bspay.mjs";

const STATUSES = ["Received", "Reviewing", "Needs information", "Awaiting payment", "Preparing documents", "Waiting for your approval", "Submitted to agency", "Completed", "Cancelled"];
const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, n);

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Not allowed from this page." }, origin);
  let who; try { who = await verifyOwner(req); } catch (e) { return reply(401, { error: "Please sign in with your WebSwan Google account." }, origin); }
  let body; try { body = await req.json(); } catch (e) { return reply(400, { error: "Bad request." }, origin); }
  const store = getStore("business-service");

  if (body.action === "list") {
    const { blobs } = await store.list({ prefix: "req/" });
    const recs = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    const rows = recs.filter(Boolean).map((r) => ({ code: r.code, createdAt: r.createdAt, updatedAt: r.updatedAt, status: r.status, serviceName: r.serviceName, state: r.state, client: r.client.fullName, email: r.client.email, phone: r.client.phone, business: r.business.name, paid: !!(r.pay && r.pay.paid) }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return reply(200, { rows, statuses: STATUSES }, origin);
  }
  const code = clean(body.code, 12).toUpperCase();
  const rec = /^WS-[A-Z0-9]{6}$/.test(code) ? await store.get("req/" + code, { type: "json" }) : null;
  if (!rec) return reply(404, { error: "Request not found." }, origin);

  if (body.action === "get") {
    try { const was = rec.pay && rec.pay.paid; if (await checkPaid(rec) && !was) await store.setJSON("req/" + code, rec); } catch (e) {}
    return reply(200, { rec, statuses: STATUSES }, origin);
  }

  if (body.action === "update") {
    const now = new Date().toISOString();
    if (body.status && STATUSES.includes(body.status) && body.status !== rec.status) { rec.status = body.status; rec.history.push({ status: body.status, at: now, by: who }); }
    if (typeof body.clientNote === "string") rec.clientNote = clean(body.clientNote, 1000);
    if (typeof body.finalFee === "string") rec.finalFee = clean(body.finalFee, 60);
    if (body.internalNote) rec.internalNotes.push({ at: now, by: who, text: clean(body.internalNote, 3000) });
    rec.updatedAt = now;
    // new final fee and not paid yet: replace the payment link with one for the new amount
    if (!(rec.pay && rec.pay.paid) && (!rec.pay || rec.pay.amount !== amountFor(rec))) { try { rec.pay = await makePayLink(rec); delete rec.payError; } catch (e) { rec.payError = String(e.message).slice(0, 200); } }
    await store.setJSON("req/" + code, rec);
    return reply(200, { rec, statuses: STATUSES }, origin);
  }
  return reply(400, { error: "Bad request." }, origin);
};
