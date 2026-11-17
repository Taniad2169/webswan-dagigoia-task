// Tania, Nov 16: "after 2 minutes no one answers, hang up — they are wasting my minutes."
// Every outbound call gets a 2-minute watcher. If no live HUMAN has greeted the agent by then (only rings, phone
// menus, hold music, "this call is recorded", voicemail), Voice Studio hangs the call up through Cartesia's
// POST /agents/calls/{id}/cancel. A call where a real person said hello is never touched.
import crypto from "node:crypto";

export const NO_HUMAN_LIMIT_SECS = 120;

// Phrases that only machines say (menus, holds, recordings, voicemail).
const MACHINE = /\b(press|para espa[nñ]ol|para portugu[eê]s|dial|extension|menu|options?\b|record(ed|ing)?|monitored|quality (assurance|purposes)|please (hold|wait|stay)|stay on the line|remain on the line|your call is important|in the order (it was|they were) received|next available|all (of )?our (staff|agents|representatives|lines)|currently (busy|assisting)|office hours|our hours|we are (currently )?closed|leave (a|your) (message|name)|voice ?mail|mailbox|after the (tone|beep)|answering (machine|service)|not available|is unavailable|the (person|party|number) you (are calling|have dialed)|connecting your call|transferring|please try again|has been disconnected|hold music|beep)\b/i;
// What a live person says when they pick up.
const HUMAN = /\b(hello|hi|hey|good (morning|afternoon|evening)|how (can|may) i help|how can we help|this is [a-z]+|speaking|yes\??|who is (this|calling)|can i help|office|law (firm|office)|al[oó]|bueno|buenos d[ií]as|oi|ol[aá])\b/i;

// true when at least one caller turn sounds like a live person and not a recording.
export function humanAnswered(transcript) {
  const turns = (Array.isArray(transcript) ? transcript : []).filter((t) => t && t.role === "user" && String(t.text || "").trim());
  return turns.some((t) => {
    const x = String(t.text).trim();
    if (MACHINE.test(x)) return false;
    // short replies with a greeting are people; a long sentence with no greeting is most likely a recording
    return HUMAN.test(x) || x.split(/\s+/).length <= 6;
  });
}

export const watchToken = (callId) => crypto.createHmac("sha256", String(process.env.CARTESIA_API_KEY || "none")).update("watch:" + callId).digest("hex").slice(0, 32);

// Fire-and-forget: start the background watcher for one call. Never throws.
export async function startWatch(callId, agent, phone) {
  if (!callId) return;
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
  if (!base) return;
  try {
    await fetch(base + "/.netlify/functions/voice-watch-background", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, agent: agent || "", phone: phone || "", placedAt: Date.now(), token: watchToken(callId) }) });
  } catch (e) { /* the agent's own 2-minute rule and the 120 s silence limit still apply */ }
}
