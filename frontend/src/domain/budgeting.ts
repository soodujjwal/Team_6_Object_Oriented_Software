import type { Budget, Transaction } from "../api/types";
import type { RecurringTransaction } from "../api/recurringTransactions";

export type BudgetGroup = "needs" | "wants" | "savingsDebt";
export type BudgetTargets = Record<BudgetGroup, number>;
export type CategoryGroups = Record<string, BudgetGroup>;
export type BudgetHealth = "on-track" | "watch" | "almost" | "over";

export const DEFAULT_BUDGET_TARGETS: BudgetTargets = {
  needs: 50,
  wants: 30,
  savingsDebt: 20,
};

export const DEFAULT_CATEGORY_GROUPS: CategoryGroups = {
  "Housing": "needs",
  "Rent/Mortgage": "needs",
  "Utilities": "needs",
  "Groceries": "needs",
  "Transportation": "needs",
  "Insurance": "needs",
  "Health & Medical": "needs",
  "Debt Payment": "needs",
  "Education": "needs",
  "Personal Care": "needs",
  "Food & Dining": "wants",
  "Entertainment": "wants",
  "Shopping": "wants",
  "Subscriptions": "wants",
  "Travel": "wants",
  "Hobbies": "wants",
  "Pets": "wants",
  "Other": "wants",
  "Savings Contribution": "savingsDebt",
  "Emergency Fund": "savingsDebt",
  "Investments": "savingsDebt",
  "Retirement": "savingsDebt",
  "Extra Debt Payment": "savingsDebt",
};

const PREFERENCES_KEY = "pfm_budget_preferences_v1";
const VALID_GROUPS = new Set<BudgetGroup>(["needs", "wants", "savingsDebt"]);

export function loadBudgetPreferences() {
  const defaults = { targets: DEFAULT_BUDGET_TARGETS, categoryGroups: DEFAULT_CATEGORY_GROUPS };
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null") as Partial<typeof defaults> | null;
    if (!parsed) return defaults;
    const targets = { ...DEFAULT_BUDGET_TARGETS, ...parsed.targets };
    for (const group of Object.keys(DEFAULT_BUDGET_TARGETS) as BudgetGroup[]) {
      const target = Number(targets[group]);
      if (!Number.isFinite(target) || target < 0 || target > 100) targets[group] = DEFAULT_BUDGET_TARGETS[group];
      else targets[group] = target;
    }
    const categoryGroups = { ...DEFAULT_CATEGORY_GROUPS, ...parsed.categoryGroups };
    for (const [category, group] of Object.entries(categoryGroups)) {
      if (!VALID_GROUPS.has(group)) delete categoryGroups[category];
    }
    return { targets, categoryGroups };
  } catch {
    return defaults;
  }
}

export function saveBudgetPreferences(targets: BudgetTargets, categoryGroups: CategoryGroups) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ targets, categoryGroups }));
  } catch {
    // Current-session preferences still apply when browser storage is unavailable.
  }
}

export function getBudgetGroup(category: string, categoryGroups: CategoryGroups): BudgetGroup {
  const matching = Object.keys(categoryGroups).find((key) => key.toLocaleLowerCase() === category.toLocaleLowerCase());
  return matching ? categoryGroups[matching] : "wants";
}

export function getBudgetHealth(percent: number): BudgetHealth {
  if (percent >= 100) return "over";
  if (percent >= 90) return "almost";
  if (percent >= 75) return "watch";
  return "on-track";
}

export function getBudgetHealthLabel(health: BudgetHealth) {
  return {
    "on-track": "On track",
    watch: "Watch spending",
    almost: "Almost at limit",
    over: "Over budget",
  }[health];
}

export function getBudgetAlertMessage(category: string, percent: number) {
  if (percent >= 100) return `You've exceeded your ${category} budget.`;
  if (percent >= 90) return `${category} is approaching its monthly limit.`;
  if (percent >= 75) return `${category} has reached ${Math.floor(percent)}% of its budget.`;
  return null;
}

export function calculateSpendingPlanProgress(actualPercentage: number, targetPercentage: number) {
  if (!Number.isFinite(actualPercentage) || !Number.isFinite(targetPercentage) || targetPercentage <= 0) {
    return 0;
  }
  return round(actualPercentage / targetPercentage * 100);
}

export function calculateBudgetMonth(
  transactions: Transaction[],
  budgets: Budget[],
  recurring: RecurringTransaction[],
  categoryGroups: CategoryGroups,
  month: number,
  year: number,
  targets: BudgetTargets = DEFAULT_BUDGET_TARGETS,
  today = new Date(),
) {
  const inMonth = transactions.filter((transaction) => {
    const [transactionYear, transactionMonth] = transaction.transaction_date.slice(0, 10).split("-").map(Number);
    return transactionYear === year && transactionMonth === month;
  });
  const expenses = inMonth.filter((transaction) => transaction.transaction_type === "expense");
  const income = round(inMonth
    .filter((transaction) => transaction.transaction_type === "income")
    .reduce((sum, transaction) => sum + safeNumber(transaction.amount), 0));
  const spent = round(expenses.reduce((sum, transaction) => sum + safeNumber(transaction.amount), 0));
  const budgeted = round(budgets
    .filter((budget) => budget.month === month && budget.year === year)
    .reduce((sum, budget) => sum + safeNumber(budget.monthly_limit), 0));
  const categorySpent: Record<string, number> = {};
  const groupAmounts: Record<BudgetGroup, number> = { needs: 0, wants: 0, savingsDebt: 0 };
  for (const transaction of expenses) {
    const amount = safeNumber(transaction.amount);
    categorySpent[transaction.category] = round((categorySpent[transaction.category] ?? 0) + amount);
    const group = getBudgetGroup(transaction.category, categoryGroups);
    groupAmounts[group] = round(groupAmounts[group] + amount);
  }
  const groupPercentages: BudgetTargets = income > 0
    ? {
        needs: round(groupAmounts.needs / income * 100),
        wants: round(groupAmounts.wants / income * 100),
        savingsDebt: round(groupAmounts.savingsDebt / income * 100),
      }
    : { needs: 0, wants: 0, savingsDebt: 0 };
  const groupProgress: BudgetTargets = {
    needs: calculateSpendingPlanProgress(groupPercentages.needs, targets.needs),
    wants: calculateSpendingPlanProgress(groupPercentages.wants, targets.wants),
    savingsDebt: calculateSpendingPlanProgress(groupPercentages.savingsDebt, targets.savingsDebt),
  };
  const selectedBudgets = budgets.filter((budget) => budget.month === month && budget.year === year);
  const plannedByCategory: Record<string, number> = {};
  for (const budget of selectedBudgets) {
    plannedByCategory[budget.category] = round((plannedByCategory[budget.category] ?? 0) + safeNumber(budget.monthly_limit));
  }
  const categoryBudgets = selectedBudgets.map((budget) => {
    const amount = safeNumber(budget.monthly_limit);
    const actual = categorySpent[budget.category] ?? 0;
    const percent = amount > 0 ? actual / amount * 100 : actual > 0 ? 100 : 0;
    return {
      ...budget,
      actual,
      remaining: round(amount - actual),
      percent,
      progress: Math.min(100, Math.max(0, percent)),
      health: getBudgetHealth(percent),
    };
  }).sort((left, right) => right.percent - left.percent || left.category.localeCompare(right.category));
  const plannedVsActualByCategory = [...new Set([...Object.keys(plannedByCategory), ...Object.keys(categorySpent)])]
    .map((category) => {
      const planned = plannedByCategory[category] ?? 0;
      const actual = categorySpent[category] ?? 0;
      const percent = planned > 0 ? actual / planned * 100 : actual > 0 ? 100 : 0;
      return {
        category,
        planned,
        actual,
        remaining: round(planned - actual),
        percent,
        progress: Math.min(100, Math.max(0, percent)),
        health: getBudgetHealth(percent),
        unbudgeted: planned <= 0 && actual > 0,
      };
    })
    .sort((left, right) => {
      if (left.unbudgeted !== right.unbudgeted) return left.unbudgeted ? -1 : 1;
      return (right.actual + right.planned) - (left.actual + left.planned) || left.category.localeCompare(right.category);
    });
  const remaining = round(budgeted - spent);
  const netCashFlow = round(income - spent);

  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysElapsed = isCurrentMonth ? today.getDate() : 0;
  const futureRecurring = isCurrentMonth ? sumUpcomingRecurring(recurring, today, year, month) : 0;
  const recordedRecurring = isCurrentMonth ? sumRecordedRecurring(expenses, recurring) : 0;
  const projectedSpending = isCurrentMonth && daysElapsed >= 4
    ? round(Math.max(0, spent - recordedRecurring) / daysElapsed * daysInMonth + recordedRecurring + futureRecurring)
    : null;

  return {
    income,
    spent,
    budgeted,
    remaining,
    netCashFlow,
    categorySpent,
    groupAmounts,
    groupPercentages,
    groupProgress,
    categoryBudgets,
    plannedVsActualByCategory,
    progress: budgeted > 0 ? Math.min(100, Math.max(0, spent / budgeted * 100)) : 0,
    projection: {
      amount: projectedSpending,
      futureRecurring,
      isCurrentMonth,
      daysElapsed,
      daysInMonth,
    },
  };
}

function sumUpcomingRecurring(recurring: RecurringTransaction[], today: Date, year: number, month: number) {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const monthEnd = new Date(year, month, 0);
  let total = 0;
  for (const payment of recurring) {
    if (payment.transaction_type !== "expense") continue;
    const due = parseLocalDate(payment.next_due_date);
    if (!due) continue;
    for (let attempts = 0; due <= todayStart && attempts < 60; attempts += 1) {
      advanceDueDate(due, payment.frequency);
    }
    if (due <= todayStart) continue;
    for (let attempts = 0; due <= monthEnd && attempts < 60; attempts += 1) {
      total += safeNumber(payment.amount);
      advanceDueDate(due, payment.frequency);
    }
  }
  return round(total);
}

function sumRecordedRecurring(expenses: Transaction[], recurring: RecurringTransaction[]) {
  const matched = new Set<number>();
  for (const schedule of recurring) {
    if (schedule.transaction_type !== "expense") continue;
    const match = expenses.find((transaction) =>
      !matched.has(transaction.id)
      && transaction.account_id === schedule.account_id
      && transaction.category.toLocaleLowerCase() === schedule.category.toLocaleLowerCase()
      && Math.abs(safeNumber(transaction.amount) - safeNumber(schedule.amount)) < 0.005,
    );
    if (match) matched.add(match.id);
  }
  return round(expenses
    .filter((transaction) => matched.has(transaction.id))
    .reduce((sum, transaction) => sum + safeNumber(transaction.amount), 0));
}

function advanceDueDate(date: Date, frequency: RecurringTransaction["frequency"]) {
  if (frequency === "weekly") {
    date.setDate(date.getDate() + 7);
    return;
  }
  const day = date.getDate();
  const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const finalDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  nextMonth.setDate(Math.min(day, finalDay));
  date.setTime(nextMonth.getTime());
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function safeNumber(value: string | number | null | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
