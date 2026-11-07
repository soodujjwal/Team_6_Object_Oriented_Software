import type { RecurringTransaction } from "../api/recurringTransactions";
import { daysUntilDue, getBillStatus, parseLocalDate } from "./recurringBills";

function cents(amount: string): bigint | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) return null;
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

/** Display-only estimates. Saved schedules are active until removed; auto-pay
 * describes a payment method, not whether a subscription is active. */
export function summarizeRecurringBills(items: RecurringTransaction[], today = new Date()) {
  const expenses = items.filter(item => item.transaction_type === "expense");
  let twelfthsOfCents = 0n;
  let valid = true;
  for (const item of expenses) {
    const amount = cents(item.amount);
    if (amount === null || !["weekly", "monthly"].includes(item.frequency)) { valid = false; continue; }
    // Aggregate before rounding: weekly costs are annualized across 12 months.
    twelfthsOfCents += amount * (item.frequency === "weekly" ? 52n : 12n);
  }
  const rounded = (twelfthsOfCents + 6n) / 12n;
  const scheduled = expenses.filter(item => {
    const days = daysUntilDue(item.next_due_date, today);
    return Number.isFinite(days) && days >= 0 && getBillStatus(item, today) !== "paid";
  }).sort((a, b) => a.next_due_date.localeCompare(b.next_due_date) || a.id - b.id);
  return {
    monthlyTotal: valid && rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) / 100 : null,
    activeSubscriptions: expenses.filter(item => item.category.trim().toLowerCase() === "subscriptions").length,
    upcomingThisMonth: scheduled.filter(item => {
      const due = parseLocalDate(item.next_due_date);
      return due.getFullYear() === today.getFullYear() && due.getMonth() === today.getMonth();
    }).length,
    nextPayment: scheduled[0] ?? null,
  };
}
