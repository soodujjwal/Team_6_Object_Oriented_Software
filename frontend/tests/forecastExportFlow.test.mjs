import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";

const dom = new JSDOM('<div id="root"></div>', { url: "https://finance.example/app", pretendToBeVisual: true });
for (const key of ["window", "document", "HTMLElement", "HTMLInputElement", "Event", "KeyboardEvent", "Node"])
  globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = clearTimeout;
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const { createRoot } = await import("react-dom/client");
let accounts, transactions, recurring, accountFailure, scheduleFailure, budgetFailure, pendingAccounts;
let native, available, saveResult, saveFailure, saved, downloads, blobs, revoked, downloadFailure;
const api = {
  getAccounts: async () => { if (accountFailure) throw Error("Account outage"); return pendingAccounts || accounts; },
  getTransactions: async () => transactions,
  getRecurringTransactions: async () => { if (scheduleFailure) throw Error("Schedule outage"); return recurring; },
  getBudgets: async () => { if (budgetFailure) throw Error("Budget outage"); return []; },
  getSavingsGoals: async () => [], getTransactionMatches: async () => [],
  confirmTransactionMatch: async () => {}, updateTransaction: async () => {},
};
const capacitor = {
  Capacitor: { isNativePlatform: () => native, isPluginAvailable: () => available },
  registerPlugin: () => ({ save: async (options) => { saved.push(options); if (saveFailure) throw Error("Disk full"); return saveResult; } }),
};
const result = await build({
  stdin: { contents: 'export { DashboardPage } from "./src/pages/DashboardPage"; export { TransactionsPage } from "./src/pages/TransactionsPage"; export { downloadCsv } from "./src/services/csvDownload";',
    resolveDir: fileURLToPath(new URL("..", import.meta.url)), loader: "ts" },
  bundle: true, platform: "node", format: "cjs", packages: "external", write: false, loader: { ".css": "empty" }, define: { "import.meta.env": "{}" },
  plugins: [{ name: "test-api", setup(builder) {
    for (const [file, names] of Object.entries({ accounts: ["getAccounts"], transactions: ["getTransactions", "getTransactionMatches", "confirmTransactionMatch", "updateTransaction"], recurringTransactions: ["getRecurringTransactions"], budgets: ["getBudgets"], savingsGoals: ["getSavingsGoals"] })) {
      builder.onLoad({ filter: new RegExp('[\\\\/]api[\\\\/]' + file + '\\.ts$') }, () => ({
        contents: names.map(name => `export const ${name}=(...args)=>globalThis.__api.${name}(...args);`).join("\n")
          + ['TRANSACTIONS_UPDATED_EVENT', 'RECURRING_TRANSACTIONS_UPDATED_EVENT', 'BUDGETS_UPDATED_EVENT', 'SAVINGS_GOALS_UPDATED_EVENT'].map(name => `\nexport const ${name}="${name}";`).join(""), loader: "ts",
      }));
    }
    builder.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: "capacitor", namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const Capacitor=globalThis.__capacitor.Capacitor; export const registerPlugin=globalThis.__capacitor.registerPlugin;" }));
  } }],
});
const module = { exports: {} };
runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: createRequire(import.meta.url),
  window, document, HTMLElement, Event, Error, URL, Blob, setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame, __api: api, __capacitor: capacitor });
const { DashboardPage, TransactionsPage, downloadCsv } = module.exports;
const date = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
let root, destination;
function setup() {
  accountFailure = scheduleFailure = budgetFailure = native = saveFailure = downloadFailure = false;
  available = true; saveResult = { saved: true }; saved = []; downloads = []; blobs = []; revoked = [];
  pendingAccounts = null; destination = null;
  accounts = [{ id: 1, name: "Checking", bank_name: "Test Bank", account_type: "checking", starting_balance: "1000", current_balance: "1000" }];
  transactions = [{ id: 1, account_id: 1, transaction_type: "expense", amount: "20", category: "Dining", note: "Cafe", transaction_date: "2026-11-10", receipt_metadata: { source: "plaid" } }];
  recurring = [{ id: 1, account_id: 1, name: "Rent", amount: "200", category: "Housing", transaction_type: "expense", frequency: "monthly", next_due_date: date(5) }];
  URL.createObjectURL = blob => { blobs.push(blob); return `blob:test-${blobs.length}`; };
  URL.revokeObjectURL = url => revoked.push(url);
  dom.window.HTMLAnchorElement.prototype.click = function () { if (downloadFailure) throw Error("Download blocked"); downloads.push({ filename: this.download, href: this.href }); };
  root = createRoot(document.querySelector("#root"));
}
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 70)); }); }
async function show(Component) {
  await act(async () => root.render(createElement(Component, { userName: "Test", onNavigate: value => destination = value, onAddTransaction() {}, onManageBills() {} })));
  await settle();
}
async function cleanup() { await act(async () => root.unmount()); }
const button = text => [...document.querySelectorAll("button")].find(node => node.textContent.includes(text));
async function click(node) { assert.ok(node); await act(async () => node.click()); }
async function select(label, value) {
  const field = [...document.querySelectorAll(".glass-select-field")].find(node => node.querySelector("span")?.textContent === label);
  await click(field?.querySelector('[aria-haspopup="listbox"]'));
  await click([...document.querySelectorAll('[role="option"]')].find(node => node.textContent === value));
}

test("dashboard forecasts real balances and refreshes after recurring activity changes", async () => {
  setup(); try {
    await show(DashboardPage);
    assert.match(document.querySelector(".forecast-summary-grid").textContent, /\$800\.00/);
    assert.match(document.querySelector(".forecast-events").textContent, /Rent/);
    recurring = [{ ...recurring[0], amount: "1200" }];
    await act(async () => window.dispatchEvent(new Event("RECURRING_TRANSACTIONS_UPDATED_EVENT"))); await settle();
    assert.match(document.querySelector(".forecast-status").textContent, /Shortfall risk/);
    assert.match(document.querySelector(".forecast-summary-grid").textContent, /-\$200\.00/);
  } finally { await cleanup(); }
});

test("forecast waits for account balances instead of projecting from a false zero", async () => {
  setup(); let resolve;
  pendingAccounts = new Promise(done => resolve = done);
  try {
    await show(DashboardPage);
    assert.equal(document.querySelector(".forecast-summary-grid"), null);
    assert.equal(document.querySelector(".forecast-status"), null);
    await act(async () => resolve(accounts));
    assert.match(document.querySelector(".forecast-summary-grid").textContent, /\$800\.00/);
  } finally { await cleanup(); }
});

test("failed balances or schedules hide projections and recover on refresh", async () => {
  for (const fail of ["accounts", "schedule"]) {
    setup(); if (fail === "accounts") accountFailure = true; else scheduleFailure = true;
    try {
      await show(DashboardPage);
      assert.match(document.querySelector(".cash-flow-forecast").textContent, /Forecast unavailable/);
      assert.equal(document.querySelector(".forecast-summary-grid"), null);
      accountFailure = scheduleFailure = false;
      await act(async () => window.dispatchEvent(new Event("focus"))); await settle();
      assert.ok(document.querySelector(".forecast-summary-grid"));
    } finally { await cleanup(); }
  }
});

test("unrelated failures preserve the forecast and empty schedules offer working navigation", async () => {
  setup(); budgetFailure = true; recurring = [];
  try {
    await show(DashboardPage);
    assert.match(document.body.textContent, /Add recurring income and bills/);
    await click(button("Set up recurring activity")); assert.equal(destination, "recurring");
  } finally { await cleanup(); }
});

test("CSV button exports exactly the visible search, type, source and month filters", async () => {
  setup();
  transactions.push(...[
    { id: 2, transaction_type: "income" }, { id: 3, receipt_metadata: { source: "receipt" } },
    { id: 4, transaction_date: "2026-10-10" }, { id: 5, note: "Groceries" },
  ].map(update => ({ ...transactions[0], ...update })));
  try {
    await show(TransactionsPage);
    const search = document.querySelector('input[placeholder="Search merchant, category, account"]');
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(search,"Cafe"); search.dispatchEvent(new Event("input",{bubbles:true})); });
    await select("Type", "Expenses"); await select("Source", "Connected Bank"); await select("Month", "November 2026");
    assert.equal(document.querySelectorAll(".transaction-history-item").length, 1);
    await click(button("Export visible transactions (1)"));
    assert.equal(downloads.length, 1); assert.match(downloads[0].filename, /transactions-2026-11-/);
    const csv = await blobs[0].text(); assert.equal(csv.split("\r\n").length, 2); assert.match(csv, /"Cafe","Checking","Test Bank","plaid"/);
    assert.deepEqual([...new Uint8Array(await blobs[0].arrayBuffer()).slice(0,3)], [239,187,191]);
    assert.match(document.body.textContent, /CSV download started for 1 transaction\./);
    assert.equal(document.querySelector('a[download]'), null);
    assert.deepEqual(revoked, []); await new Promise(resolve => setTimeout(resolve, 1050)); assert.equal(revoked.length, 1);
  } finally { await cleanup(); }
});

test("empty filtered transaction lists cannot export", async () => {
  setup(); transactions = [];
  try { await show(TransactionsPage); assert.ok(button("Export visible transactions (0)").disabled); await click(button("Export visible transactions")); assert.equal(downloads.length,0); }
  finally { await cleanup(); }
});

test("Android export saves through the native picker and reports cancellation or errors honestly", async () => {
  setup(); native = true;
  try {
    await show(TransactionsPage); await click(button("Export visible transactions"));
    assert.equal(saved.length,1); assert.ok(saved[0].content.startsWith("\uFEFF")); assert.equal(downloads.length,0);
    assert.match(document.body.textContent,/Saved 1 transaction\./);
    saveResult = { saved:false }; await click(button("Export visible transactions")); assert.match(document.body.textContent,/Export canceled/);
    saveFailure = true; await click(button("Export visible transactions")); assert.match(document.body.textContent,/Disk full/);
    available = false; await click(button("Export visible transactions")); assert.match(document.body.textContent,/Install the latest Finance Builder/);
  } finally { await cleanup(); }
});

test("browser download errors remove the temporary link and release the blob", async () => {
  setup(); downloadFailure = true;
  try {
    await assert.rejects(downloadCsv("csv", "file.csv"), /Download blocked/);
    assert.equal(document.querySelector('a[download]'),null);
    await new Promise(resolve => setTimeout(resolve,1050)); assert.equal(revoked.length,1);
  } finally { await cleanup(); }
});
