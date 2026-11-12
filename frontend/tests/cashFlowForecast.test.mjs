import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/domain/cashFlowForecast.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { forecastCashFlow } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

function schedule(overrides = {}) {
  return {
    id: 1,
    name: "Rent",
    amount: "900.00",
    category: "Housing",
    transaction_type: "expense",
    frequency: "monthly",
    next_due_date: "2026-11-15",
    ...overrides,
  };
}

test("projects income and expenses over the next 30 days", () => {
  const result = forecastCashFlow(1500, [
    schedule(),
    schedule({ id: 2, name: "Paycheck", amount: "1200", transaction_type: "income", next_due_date: "2026-11-20" }),
  ], new Date(2026, 10, 12));

  assert.equal(result.expectedIncome, 1200);
  assert.equal(result.expectedExpenses, 900);
  assert.equal(result.endingBalance, 1800);
  assert.equal(result.lowestBalance, 600);
  assert.equal(result.status, "on-track");
});

test("repeats weekly schedules and rolls an overdue date forward", () => {
  const result = forecastCashFlow(500, [
    schedule({ amount: "25", frequency: "weekly", next_due_date: "2026-11-01" }),
  ], new Date(2026, 10, 12), 30);

  assert.equal(result.events.length, 4);
  assert.equal(result.expectedExpenses, 100);
  assert.equal(result.endingBalance, 400);
});

test("marks a forecast at risk when an upcoming bill makes the balance negative", () => {
  const result = forecastCashFlow(300, [schedule()], new Date(2026, 10, 12));
  assert.equal(result.lowestBalance, -600);
  assert.equal(result.status, "at-risk");
});

test("returns a no-schedule state without inventing activity", () => {
  const result = forecastCashFlow(300, [], new Date(2026, 10, 12));
  assert.equal(result.endingBalance, 300);
  assert.equal(result.events.length, 0);
  assert.equal(result.status, "no-schedule");
});

test("month-end schedules return to their original day after a short month", () => {
  const result = forecastCashFlow(1000, [schedule({ amount: "10", next_due_date: "2027-01-31" })], new Date(2027, 0, 30), 65);
  assert.deepEqual(result.events.map((event) => event.date), ["2027-01-31", "2027-02-28", "2027-03-31"]);
});

test("the 30-day window includes today and excludes day 31", () => {
  const result = forecastCashFlow(1000, [
    schedule({ id: 1, next_due_date: "2026-11-12", frequency: "weekly", amount: "10" }),
    schedule({ id: 2, next_due_date: "2026-12-12", amount: "900" }),
  ], new Date(2026, 10, 12));
  assert.equal(result.events[0].date, "2026-11-12");
  assert.equal(result.events.at(-1).date, "2026-12-10");
  assert.equal(result.expectedExpenses, 50);
});

test("paid occurrences are not deducted from the current balance again", () => {
  const result = forecastCashFlow(1000, [schedule({ next_due_date: "2026-11-12", last_paid_date: "2026-11-12" })], new Date(2026, 10, 12));
  assert.equal(result.events.length, 0);
  assert.equal(result.endingBalance, 1000);
});

test("invalid dates, amounts and unsupported frequencies do not invent events", () => {
  const result = forecastCashFlow(1000, [
    schedule({ next_due_date: "2026-02-30" }), schedule({ amount: "NaN" }),
    schedule({ amount: "-2" }), schedule({ frequency: "yearly" }),
  ], new Date(2026, 10, 12));
  assert.deepEqual(result.events, []);
});

test("same-day bills conservatively precede income regardless of schedule order", () => {
  const income = schedule({ id: 2, name: "A paycheck", transaction_type: "income", amount: "1000" });
  for (const items of [[income, schedule()], [schedule(), income]]) {
    const result = forecastCashFlow(100, items, new Date(2026, 10, 12));
    assert.equal(result.endingBalance, 200);
    assert.equal(result.lowestBalance, -800);
    assert.equal(result.status, "at-risk");
  }
});

test("zero-day windows contain no activity", () => {
  assert.equal(forecastCashFlow(100, [schedule()], new Date(2026, 10, 12), 0).events.length, 0);
});

test("cent rounding does not flag an exactly funded balance as a shortfall", () => {
  const result = forecastCashFlow(0.3, [schedule({ amount: "0.10" }), schedule({ id: 2, amount: "0.20" })], new Date(2026, 10, 12));
  assert.equal(result.endingBalance, 0);
  assert.equal(result.lowestBalance, 0);
  assert.equal(result.status, "on-track");
});
