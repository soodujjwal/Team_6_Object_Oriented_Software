import type { RecurringTransaction } from "../api/recurringTransactions";

export type CashFlowEvent = {
  amount: number;
  balance: number;
  date: string;
  id: string;
  name: string;
  type: "income" | "expense";
};

export type CashFlowForecast = {
  endingBalance: number;
  events: CashFlowEvent[];
  expectedExpenses: number;
  expectedIncome: number;
  lowestBalance: number;
  status: "on-track" | "at-risk" | "no-schedule";
};

export function forecastCashFlow(
  startingBalance: number,
  recurring: RecurringTransaction[],
  today = new Date(),
  horizonDays = 30,
): CashFlowForecast {
  const start = startOfDay(today);
  const end = addDays(start, horizonDays);
  const scheduled = recurring.flatMap((item) => expandOccurrences(item, start, end));
  scheduled.sort((left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name));

  let balance = safeAmount(startingBalance);
  let lowestBalance = balance;
  let expectedIncome = 0;
  let expectedExpenses = 0;
  const events = scheduled.map((event) => {
    if (event.type === "income") expectedIncome += event.amount;
    else expectedExpenses += event.amount;
    balance += event.type === "income" ? event.amount : -event.amount;
    lowestBalance = Math.min(lowestBalance, balance);
    return { ...event, balance: roundMoney(balance) };
  });

  return {
    endingBalance: roundMoney(balance),
    events,
    expectedExpenses: roundMoney(expectedExpenses),
    expectedIncome: roundMoney(expectedIncome),
    lowestBalance: roundMoney(lowestBalance),
    status: events.length === 0 ? "no-schedule" : lowestBalance < 0 ? "at-risk" : "on-track",
  };
}

function expandOccurrences(item: RecurringTransaction, start: Date, end: Date): Omit<CashFlowEvent, "balance">[] {
  const amount = safeAmount(Number(item.amount));
  if (amount <= 0) return [];
  let due = parseDate(item.next_due_date);
  if (!due) return [];
  const anchorDay = due.getDate();

  while (due < start) due = nextOccurrence(due, item.frequency, anchorDay);
  const events: Omit<CashFlowEvent, "balance">[] = [];
  let sequence = 0;
  while (due <= end) {
    events.push({
      amount,
      date: formatDate(due),
      id: `${item.id}-${formatDate(due)}-${sequence}`,
      name: item.name || item.note || item.category,
      type: item.transaction_type,
    });
    due = nextOccurrence(due, item.frequency, anchorDay);
    sequence += 1;
  }
  return events;
}

function nextOccurrence(date: Date, frequency: RecurringTransaction["frequency"], anchorDay: number): Date {
  if (frequency === "weekly") return addDays(date, 7);
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(anchorDay, lastDay));
  return next;
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function safeAmount(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
