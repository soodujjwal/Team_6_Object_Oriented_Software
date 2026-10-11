import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/domain/subscriptionInsights.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { summarizeBankSubscriptions } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

function transaction(id, note, amount, transactionDate, source = "plaid", accountId = 1) {
  return {
    id,
    account_id: accountId,
    amount,
    category: "Other",
    transaction_type: "expense",
    transaction_date: transactionDate,
    note,
    receipt_metadata: { source },
  };
}

test("summarizes unique known subscriptions using their latest bank charge", () => {
  const summary = summarizeBankSubscriptions([
    transaction(1, "NETFLIX.COM", "15.49", "2026-08-02"),
    transaction(2, "NETFLIX.COM", "16.49", "2026-09-02"),
    transaction(3, "SPOTIFY USA", "11.99", "2026-09-08"),
  ]);

  assert.equal(summary.subscriptions.length, 2);
  assert.equal(summary.monthlyTotal, 28.48);
  assert.deepEqual(summary.subscriptions.map(({ name, amount }) => ({ name, amount })), [
    { name: "Netflix", amount: 16.49 },
    { name: "Spotify", amount: 11.99 },
  ]);
});

test("detects stable repeated monthly bank charges not in the merchant list", () => {
  const summary = summarizeBankSubscriptions([
    transaction(1, "LOCAL NEWS MEMBERSHIP", "8.00", "2026-07-10"),
    transaction(2, "LOCAL NEWS MEMBERSHIP", "8.00", "2026-08-10"),
  ]);

  assert.equal(summary.subscriptions.length, 1);
  assert.equal(summary.subscriptions[0].name, "LOCAL NEWS MEMBERSHIP");
  assert.equal(summary.subscriptions[0].confidence, "medium");
});

test("ignores non-Plaid, income, and non-monthly transactions", () => {
  const income = { ...transaction(1, "NETFLIX", "100", "2026-09-01"), transaction_type: "income" };
  const summary = summarizeBankSubscriptions([
    transaction(2, "NETFLIX", "15.49", "2026-09-02", "csv"),
    income,
    transaction(3, "ONE OFF SHOP", "20", "2026-09-03"),
    transaction(4, "VARIABLE SERVICE", "10", "2026-07-01"),
    transaction(5, "VARIABLE SERVICE", "30", "2026-08-01"),
  ]);

  assert.deepEqual(summary, { monthlyTotal: 0, subscriptions: [] });
});
