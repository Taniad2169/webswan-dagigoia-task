// WebSwan Brain master (Tania, Nov 8): each phone agent's live Cartesia prompt (edited on the Voice Studio 🧠 Brain page)
// is the ONE source of truth. Role play, practice calls, agent profiles and lead briefs all read it from here,
// so every place uses the same script, prompt, rebuttals and personality.
(function () {
  const VAPI = "https://webswan-billing.netlify.app/.netlify/functions/voice-calls";
  const MK = {
    script: ["### YOUR SCRIPT (WebSwan)", "### END YOUR SCRIPT"],
    rebuttals: ["### REBUTTALS (WebSwan)", "### END REBUTTALS"],
    how: ["### HOW TO RUN YOUR CALL (WebSwan)", "### END HOW TO RUN YOUR CALL"],
    notes: ["=== TANIA'S COACHING NOTES", "=== END OF TANIA'S COACHING NOTES ==="]
  };
  // markers only count at the start of a line (a rule's text may mention a block's name)
  function at(t, m, f) { const k = t.indexOf("\n" + m, f || 0); return k < 0 ? (!f && t.startsWith(m) ? 0 : -1) : k + 1; }
  function take(t, pair) {
    const i = at(t, pair[0]), j = i >= 0 ? at(t, pair[1], i + 1) : -1;
    if (i < 0 || j < i) return { rest: t, body: "" };
    const bodyStart = t.indexOf("\n", i); // the first line is the marker (notes marker is a long line)
    return { rest: (t.slice(0, i) + t.slice(j + pair[1].length)).replace(/\n{3,}/g, "\n\n").trim(), body: t.slice(bodyStart < 0 || bodyStart > j ? i + pair[0].length : bodyStart, j).trim() };
  }
  function split(full) {
    let t = String(full || ""); const out = { full: t };
    for (const k of ["script", "rebuttals", "how", "notes"]) { const r = take(t, MK[k]); out[k] = r.body; t = r.rest; }
    out.prompt = t.trim();
    const p = (t.match(/0\. YOUR PERSONALITY:[^\n]*/) || [""])[0]; out.personality = p.replace(/^0\. YOUR PERSONALITY:\s*/, "");
    // the script as spoken turns: every [PAUSE] ends a turn; labels like (yes) stay so the reader sees the branch
    out.turns = out.script ? out.script.split(/\n?\s*\[PAUSE\]\s*\n?/).map((s) => s.replace(/^EN ESPAÑOL[\s\S]*$/m, "").trim()).filter(Boolean) : [];
    const first = out.turns[0] || ""; out.opening = (first.match(/"([^"]+)"/) || ["", first.replace(/^\d+\.\s*/, "")])[1];
    return out;
  }
  // text handed to the AI Office in role play: script and rebuttals first, so nothing important is cut off
  function forRoleplay(p) {
    if (!p || !p.full) return "";
    return [
      "THIS IS YOUR MASTER SCRIPT FROM YOUR BRAIN: exactly what you use on real calls. Say YOUR SCRIPT lines in order, in your own natural words. Use a REBUTTAL only when the person asks a question or objects, then go back to the next script line. Follow HOW TO RUN YOUR CALL and your prompt. Never invent a different opening.",
      p.script && MK.script[0] + "\n" + p.script + "\n" + MK.script[1],
      p.rebuttals && MK.rebuttals[0] + "\n" + p.rebuttals + "\n" + MK.rebuttals[1],
      p.how && MK.how[0] + "\n" + p.how + "\n" + MK.how[1],
      p.notes && "TANIA'S COACHING NOTES:\n" + p.notes,
      "YOUR PROMPT AND PERSONALITY:\n" + p.prompt
    ].filter(Boolean).join("\n\n").slice(0, 36000);
  }
  const cache = {};
  async function get(agent, token, maxAgeMs) {
    const k = String(agent || "").toLowerCase(), c = cache[k];
    if (c && Date.now() - c.at < (maxAgeMs == null ? 60000 : maxAgeMs)) return c.p;
    const tok = typeof token === "function" ? await token() : token;
    if (!tok) throw new Error("Please sign in first.");
    const r = await fetch(VAPI, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify({ action: "agent_get", agent: k }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || ("Error " + r.status));
    const p = split(j.instructions || ""); cache[k] = { at: Date.now(), p };
    return p;
  }
  window.BrainMaster = { split, forRoleplay, get, cache, MASTER_AGENTS: ["monica", "george", "rebecca"] };
})();
