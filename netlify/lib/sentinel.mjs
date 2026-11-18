// Sentinel Phase 1 -- read-only diagnostic helpers (Tania, Nov 18; revised after Coby's static-inspection review).
// GitHub only in this release. NO Netlify token: Tania decided the account-wide reach of a Netlify personal
// access token is not worth the risk for a first release, so Phase 1 ships with GitHub read-only diagnostics
// plus Netlify log text Tania supplies manually in chat (scrubbed the same as everything else here -- see
// team.mjs's chat handler, where Sentinel's incoming message text is run through scrubSecrets before it's
// ever added to his context).
//
// Everything in this file is read-only and server-enforced: Sentinel's prompt never decides what's allowed,
// this file does. No write, no deploy, no credential ever reaches a reply, no PR, no exception list.
//
// Everything this file returns -- file content, commit messages, commit author names -- is UNTRUSTED evidence
// read from a repository Sentinel does not control the contents of. It is handled as data throughout: filtered
// for secrets/PII before it reaches a model, defused of directive-shaped syntax before it's ever spliced into
// any reply text (see neutralizeDirectives below), and in team.mjs it's fed back to Sentinel as a second,
// isolated model turn explicitly labeled as untrusted evidence to analyze -- never as something Sentinel's own
// earlier turn said, and never as text that runs through the shared ((ACTION: ...)) directive parser.

import { teamStore } from "./team.mjs";

export const SENTINEL_REPOS = ["taniad2169/webswan-dagigoia-task", "taniad2169/webswan-lead-prospector"];

const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, n || 4000);

export function scrubSecrets(text) {
  let t = String(text || "");
  t = t.replace(/^(Authorization|Cookie|Set-Cookie|X-Api-Key|X-Goog-Api-Key)\s*:.*$/gim, "$1: [REDACTED]");
  t = t.replace(/\b(sk|pk|rk|ghp|gho|ghu|ghs|ghr|github_pat|AIza|xox[baprs])[A-Za-z0-9_-]{8,}/g, "[REDACTED-KEY]");
  t = t.replace(/\bBearer\s+[A-Za-z0-9\-_.]{10,}/gi, "Bearer [REDACTED]");
  t = t.replace(/\b(api[_-]?key|apikey|secret|token|password|passwd|credential|client[_-]?secret|private[_-]?key|access[_-]?key)\s*[:=]\s*["']?([A-Za-z0-9+/_.=-]{12,})["']?/gi, (m, k) => k + ": [REDACTED-KEY]");
  t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED-EMAIL]");
  t = t.replace(/\b(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[REDACTED-PHONE]");
  return t;
}

export function neutralizeDirectives(text) {
  return String(text || "").replace(/\(\(/g, "( (").replace(/\)\)/g, ") )");
}

function repoOk(repo) { return SENTINEL_REPOS.includes(String(repo || "").trim()); }

function safePath(raw) {
  const rawStr = String(raw == null ? "" : raw);
  if (rawStr.includes("\x00")) return { ok: false, error: "Path rejected: contains a null byte." };
  let p = clean(rawStr, 300).trim();
  if (!p) return { ok: false, error: "Missing file path." };
  if (p.startsWith("/")) return { ok: false, error: "Path rejected: absolute paths (a leading \"/\") are not allowed." };
  p = p.replace(/\/+$/, "");
  if (!p) return { ok: false, error: "Missing file path." };
  const segments = p.split("/");
  if (segments.some((s) => !s)) return { ok: false, error: "Path rejected: contains an empty segment (\"//\")." };
  const encoded = [];
  for (const seg of segments) {
    if (/\x00/.test(seg)) return { ok: false, error: "Path rejected: contains a null byte." };
    if (seg === "." || seg === "..") return { ok: false, error: "Path rejected: contains a \"..\" traversal segment." };
    let decoded = seg;
    for (let i = 0; i < 2; i++) { try { const d = decodeURIComponent(decoded); if (d === decoded) break; decoded = d; } catch (e) { break; } }
    if (/\.\./.test(decoded)) return { ok: false, error: "Path rejected: contains a \"..\" traversal segment." };
    if (/\x00/.test(decoded)) return { ok: false, error: "Path rejected: contains a null byte." };
    if (decoded.includes("/")) return { ok: false, error: "Path rejected: an encoded \"/\" inside one path segment is not allowed." };
    encoded.push(encodeURIComponent(seg));
  }
  return { ok: true, path: segments.join("/"), encoded: encoded.join("/") };
}

const MAX_FILE_BYTES = 300_000;

async function readCapped(r, cap) {
  if (!r.body || typeof r.body.getReader !== "function") {
    const t = await r.text();
    if (t.length > cap) return { tooLarge: true, approxBytes: t.length };
    return { tooLarge: false, text: t };
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let total = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) { try { await reader.cancel(); } catch (e) {} return { tooLarge: true, approxBytes: total }; }
      text += decoder.decode(value, { stream: true });
    }
  } finally { try { reader.releaseLock(); } catch (e) {} }
  text += decoder.decode();
  return { tooLarge: false, text };
}

export async function sentinelReadFile(repo, path, ref) {
  if (!repoOk(repo)) return { error: "Repo not in Sentinel's authorized list: " + repo };
  const sp = safePath(path);
  if (!sp.ok) return { error: sp.error };
  const pat = process.env.SENTINEL_GITHUB_PAT;
  if (!pat) return { error: "Sentinel's GitHub access isn't configured yet (SENTINEL_GITHUB_PAT missing in Netlify)." };
  const url = `https://api.github.com/repos/${repo}/contents/${sp.encoded}${ref ? "?ref=" + encodeURIComponent(clean(ref, 200)) : ""}`;
  let r;
  try { r = await fetch(url, { headers: { Authorization: "Bearer " + pat, Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "webswan-sentinel" } }); }
  catch (e) { return { error: "GitHub read did not go through: " + String(e.message || e).slice(0, 160) }; }
  if (!r.ok) return { error: "GitHub read failed (" + r.status + ") for " + repo + "/" + sp.path };
  const cl = Number(r.headers.get("content-length") || 0);
  if (cl && cl > MAX_FILE_BYTES) return { error: "File too large to diagnose directly (" + Math.round(cl / 1024) + " KB, limit " + Math.round(MAX_FILE_BYTES / 1024) + " KB): " + repo + "/" + sp.path + ". Ask about a specific function or line range instead." };
  const body = await readCapped(r, MAX_FILE_BYTES);
  if (body.tooLarge) return { error: "File too large to diagnose directly (over " + Math.round(body.approxBytes / 1024) + " KB, limit " + Math.round(MAX_FILE_BYTES / 1024) + " KB): " + repo + "/" + sp.path + ". Ask about a specific function or line range instead." };
  return { repo, path: sp.path, ref: ref || "default branch", content: scrubSecrets(body.text).slice(0, 20000) };
}

export async function sentinelReadCommits(repo, path, n) {
  if (!repoOk(repo)) return { error: "Repo not in Sentinel's authorized list: " + repo };
  const pat = process.env.SENTINEL_GITHUB_PAT;
  if (!pat) return { error: "Sentinel's GitHub access isn't configured yet (SENTINEL_GITHUB_PAT missing in Netlify)." };
  let p = "";
  if (clean(path, 300).trim()) { const sp = safePath(path); if (!sp.ok) return { error: sp.error }; p = sp.path; }
  const lim = Math.max(1, Math.min(20, Number(n) || 5));
  const url = `https://api.github.com/repos/${repo}/commits?${p ? "path=" + encodeURIComponent(p) + "&" : ""}per_page=${lim}`;
  let r;
  try { r = await fetch(url, { headers: { Authorization: "Bearer " + pat, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "webswan-sentinel" } }); }
  catch (e) { return { error: "GitHub commit read did not go through: " + String(e.message || e).slice(0, 160) }; }
  if (!r.ok) return { error: "GitHub commit read failed (" + r.status + ") for " + repo + (p ? "/" + p : "") };
  let list; try { list = await r.json(); } catch (e) { list = []; }
  return {
    repo, path: p || "(whole repo)",
    commits: (Array.isArray(list) ? list : []).slice(0, lim).map((c) => ({
      sha: (c.sha || "").slice(0, 10),
      message: scrubSecrets(clean((c.commit && c.commit.message) || "", 300)),
      author: scrubSecrets(((c.commit && c.commit.author && c.commit.author.name) || "").slice(0, 60)),
      at: (c.commit && c.commit.author && c.commit.author.date) || ""
    }))
  };
}

export async function sentinelLog(entry) {
  const st = teamStore();
  const idx = ((await st.get("sentinel-log", { type: "json" })) || []).filter((x) => Date.now() - new Date(x.at).getTime() < 90 * 86400000);
  const rec = {
    id: "sl" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    at: new Date().toISOString(),
    action: clean(entry.action, 40),
    target: clean(entry.target, 300),
    evidence: clean(entry.evidence, 1500),
    finding: clean(entry.finding, 2000)
  };
  idx.push(rec);
  await st.setJSON("sentinel-log", idx.slice(-1000));
  return rec;
}

export async function sentinelLogList(limit) {
  const st = teamStore();
  const idx = ((await st.get("sentinel-log", { type: "json" })) || []).filter((x) => Date.now() - new Date(x.at).getTime() < 90 * 86400000);
  return idx.slice(-Math.max(1, Math.min(200, Number(limit) || 50))).reverse();
}
