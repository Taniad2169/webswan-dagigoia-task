// Clara's read/write access into Tania's "Swan Budget" app (budget/index.html), a separate personal/business
// budget tracker synced to Firebase project "webswan-gigoia-task" (Firestore doc swan_budget/main), normally
// only reachable from the browser via Google sign-in restricted to Tania's two own emails.
//
// Needs SWAN_BUDGET_CLIENT_EMAIL + SWAN_BUDGET_PRIVATE_KEY set on webswan-billing in Netlify -- a dedicated GCP
// service account (Cloud Datastore User role) on the webswan-gigoia-task Firebase project, same pattern as
// WORKPILOT_SYNC_CLIENT_EMAIL/PRIVATE_KEY in ai-calls-workpilot.mjs. This goes through Google Cloud IAM, not
// Firestore Security Rules, so it can read AND write the doc even though the browser app itself only lets
// Tania's two emails sign in. Tania, Nov 26: "she needs to see what is going on so she can help me out ...
// if i give her an expense to enter she should be trained to do it properly" (Clara, her Budget Strategist).
import crypto from "node:crypto";

const PROJECT = process.env.SWAN_BUDGET_FIREBASE_PROJECT || "webswan-gigoia-task";
const DOC = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/swan_budget/main`;

export const EXP_CATS = ["Housing", "Utilities", "Phone & Internet", "Groceries", "Dining Out", "Transportation", "Insurance", "Healthcare", "Business Tools", "Subscriptions", "Debt Payment", "Shopping", "Entertainment", "Family", "Other Expense"];
export const INC_CATS = ["Website Clients", "Residual Income", "Salary", "Side Hustle", "Investments", "Other Income"];

let cachedToken = null, cachedExp = 0;
async function serviceAccountToken() {
  if (cachedToken && Date.now() < cachedExp - 60000) return cachedToken;
  const email = process.env.SWAN_BUDGET_CLIENT_EMAIL;
  const pkey = String(process.env.SWAN_BUDGET_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !pkey) throw new Error("Swan Budget isn't connected here yet -- add SWAN_BUDGET_CLIENT_EMAIL and SWAN_BUDGET_PRIVATE_KEY in Netlify (a GCP service account on the webswan-gigoia-task Firebase project) to turn this on.");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({ iss: email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(pkey).toString("base64url");
  const jwt = unsigned + "." + signature;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + encodeURIComponent(jwt) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error("Swan Budget auth failed: " + ((d.error_description || d.error) || r.status));
  cachedToken = d.access_token; cachedExp = now * 1000 + (d.expires_in || 3600) * 1000;
  return cachedToken;
}

function blank() { return { version: 1, savingsGoal: 0, fixedIncome: [], fixedExpenses: [], months: {} }; }
function normalize(o) {
  const s = blank();
  if (!o || typeof o !== "object") return s;
  s.savingsGoal = Number(o.savingsGoal) || 0;
  s.fixedIncome = Array.isArray(o.fixedIncome) ? o.fixedIncome : [];
  s.fixedExpenses = Array.isArray(o.fixedExpenses) ? o.fixedExpenses : [];
  s.months = o.months && typeof o.months === "object" ? o.months : {};
  return s;
}
const sum = (a) => (a || []).reduce((t, x) => t + (Number(x.amount) || 0), 0);
const monthKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
const monthLabel = (k) => { const p = k.split("-"); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function readDoc(token) {
  const r = await fetch(DOC, { headers: { authorization: "Bearer " + token } });
  if (r.status === 404) return { state: blank(), exists: false };
  if (!r.ok) throw new Error("Swan Budget read failed: " + r.status);
  const d = await r.json();
  const raw = ((d.fields || {}).json || {}).stringValue;
  let state = blank();
  if (raw) { try { state = normalize(JSON.parse(raw)); } catch (e) { /* leave blank on bad JSON rather than wipe it */ throw new Error("Swan Budget's saved data didn't parse -- not touching it."); } }
  return { state, exists: true };
}
async function writeDoc(token, state) {
  const fields = { json: { stringValue: JSON.stringify(state) }, updatedAt: { stringValue: new Date().toISOString() } };
  const mask = Object.keys(fields).map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  const r = await fetch(DOC + "?" + mask, { method: "PATCH", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error("Swan Budget save failed: " + r.status + " " + (await r.text().catch(() => "")).slice(0, 200));
}

// Clara's read: a plain-English snapshot, never the raw JSON blob.
export async function readSwanBudget(monthArg) {
  const token = await serviceAccountToken();
  const { state } = await readDoc(token);
  const mk = /^\d{4}-\d{2}$/.test(monthArg || "") ? monthArg : monthKey();
  const m = state.months[mk] || { extraIncome: [], extraExpenses: [] };
  const fixedIncomeTotal = sum(state.fixedIncome), fixedExpenseTotal = sum(state.fixedExpenses);
  const extraIncomeTotal = sum(m.extraIncome), extraExpenseTotal = sum(m.extraExpenses);
  const netThisMonth = fixedIncomeTotal + extraIncomeTotal - fixedExpenseTotal - extraExpenseTotal;
  const byCat = {};
  for (const x of [...state.fixedExpenses, ...(m.extraExpenses || [])]) byCat[x.category || "Other Expense"] = (byCat[x.category || "Other Expense"] || 0) + (Number(x.amount) || 0);
  const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    month: mk, monthLabel: monthLabel(mk), savingsGoal: state.savingsGoal,
    fixedIncomeTotal, fixedExpenseTotal, extraIncomeTotal, extraExpenseTotal, netThisMonth,
    fixedIncomeCount: state.fixedIncome.length, fixedExpenseCount: state.fixedExpenses.length,
    extraIncomeCount: (m.extraIncome || []).length, extraExpenseCount: (m.extraExpenses || []).length,
    topCategories: topCats, recentExtraExpenses: (m.extraExpenses || []).slice(-8),
  };
}

export function formatSwanBudget(s) {
  const money = (n) => "$" + Number(n || 0).toFixed(2);
  const lines = [
    `Swan Budget -- ${s.monthLabel}`,
    `Fixed: ${money(s.fixedIncomeTotal)} income (${s.fixedIncomeCount} items) / ${money(s.fixedExpenseTotal)} expenses (${s.fixedExpenseCount} items)`,
    `This month extra: ${money(s.extraIncomeTotal)} income (${s.extraIncomeCount}) / ${money(s.extraExpenseTotal)} expenses (${s.extraExpenseCount})`,
    `Net this month: ${money(s.netThisMonth)} -- savings goal ${money(s.savingsGoal)}`,
  ];
  if (s.topCategories.length) lines.push("Top expense categories: " + s.topCategories.map(([c, v]) => c + " " + money(v)).join(", "));
  if (s.recentExtraExpenses.length) lines.push("Recent entries: " + s.recentExtraExpenses.map((x) => x.name + " " + money(x.amount) + " (" + x.category + ")").join("; "));
  return lines.join("\n");
}

// Clara's write: one expense, shaped exactly like the app's own submitItem() would shape it.
// when: "extra" (a one-off expense tied to a month, the default) or "fixed" (a recurring monthly expense).
export async function addSwanExpense({ name, amount, category, type, when, month } = {}) {
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!name || !(amt > 0)) return { error: "Need a real name and a positive dollar amount to log an expense." };
  const cat = EXP_CATS.includes(category) ? category : null;
  if (!cat) return { error: `"${category}" isn't one of Tania's expense categories. Pick the closest real one: ${EXP_CATS.join(", ")}.` };
  const kind = type === "want" ? "want" : "need"; // default to "need" rather than guess wrong
  const w = when === "fixed" ? "fixed" : "extra";
  const item = { id: uid(), name: String(name).slice(0, 120), amount: amt, category: cat, type: kind };
  const token = await serviceAccountToken();
  const { state } = await readDoc(token);
  let mk = null;
  if (w === "fixed") {
    state.fixedExpenses.push(item);
  } else {
    mk = /^\d{4}-\d{2}$/.test(month || "") ? month : monthKey();
    if (!state.months[mk]) state.months[mk] = { extraIncome: [], extraExpenses: [] };
    if (!Array.isArray(state.months[mk].extraExpenses)) state.months[mk].extraExpenses = [];
    state.months[mk].extraExpenses.push(item);
  }
  await writeDoc(token, state);
  return { ok: true, item, when: w, month: mk || null };
}

export function formatExpenseAdd(out) {
  if (out.error) return out.error;
  const money = (n) => "$" + Number(n || 0).toFixed(2);
  const where = out.when === "fixed" ? "as a recurring fixed expense" : `to ${monthLabel(out.month)}`;
  return `Logged "${out.item.name}" -- ${money(out.item.amount)}, ${out.item.category} (${out.item.type}) -- ${where}.`;
}
