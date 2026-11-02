// WebSwan Voice Studio: keeps the monthly call budget up to date.
// Every 5 minutes it reads finished calls from Cartesia (real durations, voicemails, no-answers, bookings),
// including inbound calls and calls started outside Voice Studio, so the budget gate always works from real numbers.
import { budgetStore, budgetSync, allAgentIds } from "../lib/budget.mjs";

export const config = { schedule: "*/5 * * * *" };

export default async () => {
  if (!process.env.CARTESIA_API_KEY) return new Response("no key");
  const store = budgetStore();
  const r = await budgetSync(store, await allAgentIds(store));
  return new Response(r.ok ? "synced" + (r.errors ? " (" + r.errors + " errors)" : "") : "skipped: " + r.why);
};
