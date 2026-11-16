// WebSwan Voice Studio: keeps the monthly call budget up to date.
// Every 5 minutes it reads finished calls from Cartesia (real durations, voicemails, no-answers, bookings),
// including inbound calls and calls started outside Voice Studio, so the budget gate always works from real numbers.
import { budgetStore, budgetSync, allAgentIds } from "../lib/budget.mjs";

// Tania, Nov 12: was every 5 minutes around the clock (~2,000 wakeups a week). The budget gate re-checks on
// every call anyway, so a 15-minute refresh is plenty and costs a third of the credits.
// Tania, Nov 16: weekdays only, during calling hours, every 30 minutes (the budget gate re-checks before each call anyway).
export const config = { schedule: "*/30 14-23 * * 1-5" };

export default async () => {
  if (!process.env.CARTESIA_API_KEY) return new Response("no key");
  const store = budgetStore();
  const r = await budgetSync(store, await allAgentIds(store));
  return new Response(r.ok ? "synced" + (r.errors ? " (" + r.errors + " errors)" : "") : "skipped: " + r.why);
};
