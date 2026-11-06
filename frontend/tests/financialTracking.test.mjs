import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function moduleUrl(path, replacements = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  let { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  for (const [name, url] of Object.entries(replacements)) outputText = outputText.replaceAll(`"${name}"`, `"${url}"`);
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const financial = await moduleUrl("../src/domain/financialTracking.ts");
const client = await moduleUrl("../src/api/client.ts");
const accountStorage = await moduleUrl("../src/api/accountStorage.ts", { "./client": client });
const budgeting = await moduleUrl("../src/domain/budgeting.ts", { "./financialTracking": financial, "../api/accountStorage": accountStorage });
const { reportingAmount } = await import(financial);
const { calculateBudgetMonth } = await import(budgeting);
const { buildFinancialSnapshot } = await import(await moduleUrl("../src/domain/purchaseAnalysis.ts", { "./financialTracking": financial, "./budgeting": budgeting }));
const transaction = (id, amount, type = "expense", extra = {}) => ({ id, amount, transaction_type: type, account_id: 1,
  transaction_date: "2026-09-20", category: "Food & Dining", note: "Dinner", ...extra });
const rows = [transaction(1, "100", "expense", { reporting_amount: "50", personal_amount: "50" }),
  transaction(2, "50", "income", { financial_kind: "reimbursement" }),
  transaction(3, "200", "expense", { financial_kind: "transfer" }),
  transaction(4, "200", "income", { financial_kind: "transfer" }),
  transaction(5, "1000", "income"),
  transaction(6, "20", "expense", { receipt_metadata: { pending: true } }),
  transaction(7, "30", "expense", { receipt_metadata: { bank_removed: true } })];

test("reporting keeps personal split shares and excludes reimbursements, transfers, pending and removed entries", () => {
  assert.deepEqual(rows.map(reportingAmount), [50, 0, 0, 0, 1000, 0, 0]);
});
test("budgets agree with personal spending and earned income", () => {
  const result = calculateBudgetMonth(rows, [], [], {}, 9, 2026, undefined, new Date(2026, 8, 20));
  assert.equal(result.spent, 50);
  assert.equal(result.income, 1000);
  assert.equal(result.netCashFlow, 950);
  assert.deepEqual(result.categorySpent, { "Food & Dining": 50 });
});
test("affordability uses the same report amounts without changing actual account cash", () => {
  const snapshot = buildFinancialSnapshot([{ id: 1, current_balance: "950" }], rows, [], [], [], new Date(2026, 8, 20));
  assert.equal(snapshot.monthlyIncome, 1000);
  assert.equal(snapshot.monthlyExpenses, 50);
  assert.equal(snapshot.currentSavings, 950);
});
