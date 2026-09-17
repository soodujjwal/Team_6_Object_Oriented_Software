import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { allocate, calculateBill } = await load("../src/domain/splitBill.ts");
const { parseReceiptText } = await load("../src/services/splitReceipt.ts");
const draft = { people: [{ id: "self", name: "Ujjwal" }, { id: "friend", name: "Friend" }],
  items: [{ quantity: 1, price: "15", people: ["self"] }, { quantity: 1, price: "6", people: ["friend"] }, { quantity: 1, price: "20", people: ["self", "friend"] }], tax: "4.10", tip: "8.20", receipt_total: "53.30", tip_method: "bank" };

test("example assigns shared pizza and proportional tax and tip", () => {
  const result = calculateBill(draft);
  assert.deepEqual(result.people.map(({ subtotal, tax, tip, total }) => ({ subtotal, tax, tip, total })), [{ subtotal: 2500, tax: 250, tip: 500, total: 3250 }, { subtotal: 1600, tax: 160, tip: 320, total: 2080 }]);
  assert.equal(result.allocated, result.total);
  assert.equal(result.matches, true);
  assert.equal(calculateBill({ ...draft, tip_method: "cash" }).bank_debit, 4510);
});
test("odd cents and large allocations reconcile exactly", () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  for (const cents of [1, 7, 999, 99999999999]) {
    const result = allocate(cents, [999999999, 888888881, 0]);
    assert.equal(result.reduce((a, b) => a + b, 0), cents);
    assert.equal(result[2], 0);
  }
});
test("unassigned items and receipt mismatch prevent reconciliation", () => {
  const result = calculateBill({ ...draft, items: [{ quantity: 2, price: "15", people: [] }] });
  assert.equal(result.unassigned, 3000);
  assert.equal(result.all_assigned, false);
  assert.equal(result.matches, false);
});
test("receipt parsing separates items, tax and totals without counting tender twice", () => {
  const result = parseReceiptText("Restaurant\nBurger 15.00\nFries 6.00\nPizza 20.00\nSubtotal 41.00\nTax 4.10\nTip 8.20\nTotal 53.30\nVisa 53.30\nSuggested Tip 10.00");
  assert.equal(result.items.length, 3);
  assert.equal(result.subtotal, "41.00");
  assert.equal(result.total, "53.30");
  assert.equal(result.tax, "4.10");
  assert.equal(result.tip, "8.20");
});
test("receipt quantity text preserves the printed line total for review", () => {
  const result = parseReceiptText("Kroger\n2 x Pizza 20.00\nSales Tax 1.50\nLocal Tax 0.50\nTOTAL 22.00");
  assert.deepEqual(result.items, [{ name: "2 x Pizza", quantity: 1, price: "20.00" }]);
  assert.equal(result.tax, "2.00");
});
