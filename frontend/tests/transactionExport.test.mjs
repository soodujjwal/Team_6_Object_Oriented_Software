import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/domain/transactionExport.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
const { createTransactionCsv, transactionExportFilename } = await import(moduleUrl);

const account = { id: 3, name: "Everyday Checking", bank_name: "PNC" };
const transaction = {
  id: 7,
  account_id: 3,
  amount: "42.10",
  category: "Dining",
  transaction_type: "expense",
  transaction_date: "2026-11-09",
  note: "Cafe, Downtown",
  financial_kind: "standard",
  personal_amount: "21.05",
  reporting_amount: "21.05",
};

test("exports transaction and account details as CSV", () => {
  const csv = createTransactionCsv([transaction], [account]);

  assert.match(csv, /"Date","Type","Amount","Category"/);
  assert.match(csv, /"2026-11-09","expense","42.10","Dining","Cafe, Downtown","Everyday Checking","PNC"/);
  assert.match(csv, /"21.05","21.05"$/);
});

test("escapes quotes and spreadsheet formulas", () => {
  const csv = createTransactionCsv([{ ...transaction, note: '=HYPERLINK("bad")' }], [account]);

  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
});

test("creates stable filenames for all and monthly exports", () => {
  const date = new Date(2026, 10, 10);
  assert.equal(transactionExportFilename("all", date), "finance-builder-transactions-all-2026-11-10.csv");
  assert.equal(transactionExportFilename("2026-09", date), "finance-builder-transactions-2026-09-2026-11-10.csv");
});
