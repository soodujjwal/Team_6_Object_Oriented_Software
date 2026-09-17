import type { Account } from "../api/types";
import type { RecurringTransaction } from "../api/recurringTransactions";
import { formatCurrency, formatDate } from "../utils/format";

export type BillStatus = "upcoming" | "due-today" | "overdue" | "paid";

export function parseLocalDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : new Date(value);
}

export function daysUntilDue(dueDate: string, today = new Date()) {
  const due = parseLocalDate(dueDate);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
}

export function getBillStatus(item: RecurringTransaction, today = new Date()): BillStatus {
  if (item.last_paid_date && parseLocalDate(item.last_paid_date) >= parseLocalDate(item.next_due_date)) return "paid";
  const days = daysUntilDue(item.next_due_date, today);
  if (days < 0) return "overdue";
  if (days === 0) return "due-today";
  return "upcoming";
}

export function getBillDisplayName(item: RecurringTransaction) {
  return item.name?.trim() || item.note?.trim() || item.category;
}

export function getUpcomingBills(items: RecurringTransaction[], today = new Date(), horizonDays = 30) {
  return items
    .filter((item) => item.transaction_type === "expense")
    .map((item) => ({ item, days: daysUntilDue(item.next_due_date, today), status: getBillStatus(item, today) }))
    .filter(({ days }) => days <= horizonDays)
    .sort((left, right) => left.days - right.days || Number(left.item.amount) - Number(right.item.amount));
}

export function buildBillNotifications(items: RecurringTransaction[], accounts: Account[], today = new Date()) {
  return getUpcomingBills(items, today, 30)
    .filter(({ item, days, status }) => {
      const settings = item.reminder_settings?.length ? item.reminder_settings : [7, 3, 1, 0, -1];
      return (days >= 0 && settings.includes(days)) || (status === "overdue" && settings.includes(-1));
    })
    .map(({ item, days, status }) => {
      const accountName = accounts.find((account) => account.id === item.account_id)?.name ?? "selected account";
      const name = getBillDisplayName(item);
      const dueCopy = status === "overdue"
        ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
        : days === 0
          ? "due today"
          : `due in ${days} day${days === 1 ? "" : "s"}`;
      return {
        id: `bill-${item.id}-${status}-${days}`,
        description: `${name} ${dueCopy}: ${formatCurrency(item.amount)} from ${accountName}.`,
        read: false,
        time: status === "overdue" ? "Overdue" : days === 0 ? "Today" : formatDate(item.next_due_date),
        title: status === "overdue" ? "Overdue Bill" : days === 0 ? "Bill Due Today" : "Upcoming Payment",
        type: "payment" as const,
      };
    });
}
