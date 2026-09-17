import type { Account, Budget, Transaction } from "../api/types";
import type { SavingsGoal } from "../api/savingsGoals";
import type { RecurringTransaction } from "../api/recurringTransactions";

export type FinancialSnapshot = {
  currentSavings: number | null;
  monthlyIncome: number | null;
  monthlyExpenses: number | null;
  monthlyRecurringExpenses: number | null;
  monthlyObligations: number | null;
  monthlySurplus: number | null;
  monthlyGoalPacing: number;
  upcomingRecurringExpenses: number | null;
  budgetHeadroom: number | null;
  activeGoalCount: number;
  goalRemaining: number;
  transactionMonths: number;
};

const amountOf = (amount: string | null | undefined) => {
  const value = Number(amount);
  return Number.isFinite(value) ? value : 0;
};

function monthKey(date: string) {
  return date.slice(0, 7);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonth(date: Date) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + 1);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function recurringOccurrencesInNextMonth(item: RecurringTransaction, today: Date) {
  const start = new Date(`${item.next_due_date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  const end = addDays(today, 30);
  let occurrences = 0;
  let due = start;
  while (due < today) {
    due = item.frequency === "weekly" ? addDays(due, 7) : addMonth(due);
  }
  while (due <= end) {
    occurrences += 1;
    due = item.frequency === "weekly" ? addDays(due, 7) : addMonth(due);
  }
  return occurrences;
}

export function buildFinancialSnapshot(
  accounts: Account[] | null,
  transactions: Transaction[],
  budgets: Budget[],
  goals: SavingsGoal[],
  recurring: RecurringTransaction[],
  today = new Date(),
): FinancialSnapshot {
  const currentSavings = accounts?.length
    ? accounts.every((account) => account.current_balance !== null)
      ? accounts.reduce((total, account) => total + amountOf(account.current_balance), 0)
      : null
    : accounts
      ? 0
      : null;

  const trailingMonthKeys = new Set(
    Array.from({ length: 3 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }),
  );
  const recentTransactions = transactions.filter((transaction) =>
    trailingMonthKeys.has(monthKey(transaction.transaction_date)),
  );
  const activeMonths = new Set(recentTransactions.map((transaction) => monthKey(transaction.transaction_date)));
  const transactionMonths = activeMonths.size;
  const incomeTotal = recentTransactions
    .filter((transaction) => transaction.transaction_type === "income")
    .reduce((total, transaction) => total + amountOf(transaction.amount), 0);
  const expenseTotal = recentTransactions
    .filter((transaction) => transaction.transaction_type === "expense")
    .reduce((total, transaction) => total + amountOf(transaction.amount), 0);
  const loggedMonthlyIncome = transactionMonths ? incomeTotal / transactionMonths : null;
  const monthlyExpenses = transactionMonths ? expenseTotal / transactionMonths : null;

  const recurringIncome = recurring
    .filter((item) => item.transaction_type === "income")
    .reduce((total, item) => total + amountOf(item.amount) * (item.frequency === "weekly" ? 52 / 12 : 1), 0);
  const hasRecurringIncome = recurring.some((item) => item.transaction_type === "income");
  const monthlyIncome = loggedMonthlyIncome !== null
    ? Math.max(loggedMonthlyIncome, recurringIncome)
    : hasRecurringIncome
      ? recurringIncome
      : null;

  const monthlyRecurringExpenses = recurring
    .filter((item) => item.transaction_type === "expense")
    .reduce((total, item) => total + amountOf(item.amount) * (item.frequency === "weekly" ? 52 / 12 : 1), 0);
  const hasRecurringExpense = recurring.some((item) => item.transaction_type === "expense");
  const monthlyObligations = monthlyExpenses !== null
    ? Math.max(monthlyExpenses, monthlyRecurringExpenses)
    : hasRecurringExpense
      ? monthlyRecurringExpenses
      : null;
  const goalRemaining = goals.reduce((total, goal) => total + Math.max(0, amountOf(goal.target_amount) - amountOf(goal.current_amount)), 0);
  const monthlyGoalPacing = goals.reduce((total, goal) => {
    if (!goal.target_date) return total;
    const target = new Date(`${goal.target_date}T00:00:00`);
    if (Number.isNaN(target.getTime()) || target <= today) return total;
    const months = Math.max(1, (target.getFullYear() - today.getFullYear()) * 12 + target.getMonth() - today.getMonth());
    return total + Math.max(0, amountOf(goal.target_amount) - amountOf(goal.current_amount)) / months;
  }, 0);

  const hasCurrentBudgets = budgets.some((budget) => budget.month === today.getMonth() + 1 && budget.year === today.getFullYear());
  const currentBudgets = budgets.filter((budget) => budget.month === today.getMonth() + 1 && budget.year === today.getFullYear());
  const budgetHeadroom = hasCurrentBudgets && currentBudgets.every((budget) => budget.used_amount !== null)
    ? currentBudgets.reduce((total, budget) => total + Math.max(0, amountOf(budget.monthly_limit) - amountOf(budget.used_amount)), 0)
    : null;

  const upcomingRecurringExpenses = recurring
    .filter((item) => item.transaction_type === "expense")
    .reduce((total, item) => total + amountOf(item.amount) * recurringOccurrencesInNextMonth(item, today), 0);
  const hasUpcomingExpense = recurring.some(
    (item) => item.transaction_type === "expense" && recurringOccurrencesInNextMonth(item, today) > 0,
  );
  const monthlySurplus = monthlyIncome !== null && monthlyObligations !== null
    ? monthlyIncome - Math.max(monthlyObligations, upcomingRecurringExpenses ?? 0) - monthlyGoalPacing
    : null;

  return {
    currentSavings,
    monthlyIncome,
    monthlyExpenses,
    monthlyRecurringExpenses: hasRecurringExpense ? monthlyRecurringExpenses : null,
    monthlyObligations,
    monthlySurplus,
    monthlyGoalPacing,
    upcomingRecurringExpenses: hasUpcomingExpense ? upcomingRecurringExpenses : recurring.length ? 0 : null,
    budgetHeadroom,
    activeGoalCount: goals.filter((goal) => amountOf(goal.target_amount) > amountOf(goal.current_amount)).length,
    goalRemaining,
    transactionMonths,
  };
}

export function calculateLoan(principal: number, aprPercent: number, months: number) {
  if (principal <= 0 || months <= 0 || aprPercent < 0) return null;
  const rate = aprPercent / 100 / 12;
  const payment = rate === 0
    ? principal / months
    : principal * (rate * (1 + rate) ** months) / ((1 + rate) ** months - 1);
  const totalPayments = payment * months;
  return {
    monthlyPayment: payment,
    totalPayments,
    totalInterest: Math.max(0, totalPayments - principal),
  };
}

export function formatMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Not enough information";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function safetyBuffer(snapshot: FinancialSnapshot) {
  const knownOutflows = [snapshot.monthlyObligations, snapshot.upcomingRecurringExpenses]
    .filter((value): value is number => value !== null && value > 0);
  return knownOutflows.length ? Math.max(...knownOutflows) + snapshot.monthlyGoalPacing : null;
}

export function getCashStatus(price: number, snapshot: FinancialSnapshot) {
  const buffer = safetyBuffer(snapshot);
  if (snapshot.currentSavings === null || buffer === null) return "unknown" as const;
  const afterPurchase = snapshot.currentSavings - price;
  if (afterPurchase < 0) return "not-recommended" as const;
  return afterPurchase >= buffer ? "comfortable" as const : "tight" as const;
}

export function getMonthlyPaymentStatus(
  upfront: number,
  monthlyPayment: number,
  snapshot: FinancialSnapshot,
) {
  const buffer = safetyBuffer(snapshot);
  if (snapshot.currentSavings === null || buffer === null || snapshot.monthlySurplus === null) return "unknown" as const;
  const savingsAfterUpfront = snapshot.currentSavings - upfront;
  if (savingsAfterUpfront < 0 || snapshot.monthlySurplus < monthlyPayment) return "not-recommended" as const;
  if (
    savingsAfterUpfront < buffer ||
    snapshot.monthlySurplus === monthlyPayment ||
    (snapshot.budgetHeadroom !== null && monthlyPayment > snapshot.budgetHeadroom)
  ) return "tight" as const;
  return "comfortable" as const;
}
