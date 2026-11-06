// Owner-only: streams a file Jimmy made (picture or video) or a post picture back to the AI Office page.
// POST { key } with the Google sign-in token. Streamed, so videos larger than a normal function reply still come through.
import { reply, cors, verifyOwner, ALLOWED_ORIGINS } from "../lib/auth.mjs";
import { videoStore } from "../lib/team-jobs.mjs";

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Not allowed from this page." }, origin);
  try { await verifyOwner(req); } catch (e) { return reply(401, { error: "Please sign in with your WebSwan Google account." }, origin); }
  let b = {}; try { b = await req.json(); } catch {}
  const key = String(b.key || "");
  if (!/^(jimmy|ai|img)-[\w-]{1,80}$/.test(key)) return reply(400, { error: "Bad file name." }, origin);
  const buf = await videoStore().get(key, { type: "arrayBuffer" });
  if (!buf) return reply(404, { error: "That file is gone." }, origin);
  const u8 = new Uint8Array(buf), type = String(b.type || "") === "video" ? "video/mp4" : "image/png";
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < u8.length; i += 262144) c.enqueue(u8.subarray(i, i + 262144)); c.close(); } });
  return new Response(stream, { status: 200, headers: { "Content-Type": type, "Content-Length": String(u8.length), ...cors(origin) } });
};
