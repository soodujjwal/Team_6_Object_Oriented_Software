import { useEffect, useMemo, useState } from "react";
import type { Page } from "../App";
import { getAccounts } from "../api/accounts";
import { BUDGETS_UPDATED_EVENT, getBudgets } from "../api/budgets";
import { getRecurringTransactions, RECURRING_TRANSACTIONS_UPDATED_EVENT, type RecurringTransaction } from "../api/recurringTransactions";
import { getSavingsGoals, SAVINGS_GOALS_UPDATED_EVENT, type SavingsGoal } from "../api/savingsGoals";
import { getTransactions, TRANSACTIONS_UPDATED_EVENT } from "../api/transactions";
import type { Account, Budget, Transaction } from "../api/types";
import { MoneyCard } from "../components/MoneyCard";
import { TopBar } from "../components/TopBar";
import { TransactionItem } from "../components/TransactionItem";
import { Button, GlassCard } from "../components/ui";
import { ProgressBar } from "../components/ProgressBar";
import { getBillDisplayName, getBillStatus, getUpcomingBills } from "../domain/recurringBills";
import { formatCurrency } from "../utils/format";

type DashboardPageProps = {
  onNavigate: (page: Page) => void;
  userName: string;
};

export function DashboardPage({ onNavigate, userName }: DashboardPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    function loadDashboard() {
      return Promise.all([getAccounts(), getTransactions(), getBudgets(), getRecurringTransactions(), getSavingsGoals()])
      .then(([accountData, transactionData, budgetData, recurringData, goalData]) => {
        setAccounts(accountData);
        setTransactions(transactionData);
        setBudgets(budgetData);
        setRecurring(recurringData);
        setGoals(goalData);
      })
      .catch(() => setError("Start the backend server to load live data."));
    }
    void loadDashboard();
    window.addEventListener(TRANSACTIONS_UPDATED_EVENT, loadDashboard);
    window.addEventListener(BUDGETS_UPDATED_EVENT, loadDashboard);
    window.addEventListener(RECURRING_TRANSACTIONS_UPDATED_EVENT, loadDashboard);
    window.addEventListener(SAVINGS_GOALS_UPDATED_EVENT, loadDashboard);
    window.addEventListener("focus", loadDashboard);
    return () => {
      window.removeEventListener(TRANSACTIONS_UPDATED_EVENT, loadDashboard);
      window.removeEventListener(BUDGETS_UPDATED_EVENT, loadDashboard);
      window.removeEventListener(RECURRING_TRANSACTIONS_UPDATED_EVENT, loadDashboard);
      window.removeEventListener(SAVINGS_GOALS_UPDATED_EVENT, loadDashboard);
      window.removeEventListener("focus", loadDashboard);
    };
  }, []);

  const totals = useMemo(() => {
    const income = transactions
      .filter((transaction) => transaction.transaction_type === "income")
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const spent = transactions
      .filter((transaction) => transaction.transaction_type === "expense")
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const balance = accounts.reduce(
      (sum, account) => sum + Number(account.current_balance ?? account.starting_balance),
      0,
    );
    return { income, spent, balance };
  }, [accounts, transactions]);

  const recent = transactions.slice(-3).reverse();
  const upcomingBills = getUpcomingBills(recurring).slice(0, 4);

  return (
    <section className="page">
      <TopBar title="Dashboard" />
      <p className="welcome-line">Welcome, {userName}</p>
      {error && <p className="notice">{error}</p>}

      <GlassCard className="balance-panel" variant="elevated">
        <p className="section-label">Available Balance</p>
        <div className="balance-card">{formatCurrency(totals.balance)}</div>
        <p className="caption-text">{accounts.length} linked financial account{accounts.length === 1 ? "" : "s"}</p>
      </GlassCard>

      <div className="money-grid">
        <MoneyCard label="Income" value={formatCurrency(totals.income)} tone="income" />
        <MoneyCard label="Spent" value={formatCurrency(totals.spent)} tone="expense" />
      </div>

      <section className="section-stack">
        <div className="section-heading">
          <h2>Recent Transactions</h2>
          <Button variant="secondary" onClick={() => onNavigate("add")}>
            Add
          </Button>
        </div>
        {recent.length > 0 ? (
          recent.map((transaction) => (
            <TransactionItem key={transaction.id} transaction={transaction} />
          ))
        ) : (
          <p className="empty-state">No transactions yet.</p>
        )}
      </section>

      <section className="section-stack">
        <div className="section-heading">
          <h2>Budgets</h2>
          <Button variant="secondary" onClick={() => onNavigate("budgets")}>
            View
          </Button>
        </div>
        <GlassCard variant="subtle">
          <p className="subtle">{budgets.length} monthly budgets active</p>
        </GlassCard>
      </section>

      <section className="section-stack">
        <div className="section-heading">
          <h2>Savings Goals</h2>
          <Button variant="secondary" onClick={() => onNavigate("goals")}>
            View
          </Button>
        </div>
        {goals.length ? goals.slice(0, 2).map((goal) => (
          <GlassCard className="dashboard-goal-row" key={goal.id} variant="subtle">
            <div>
              <strong>{goal.name}</strong>
              <small>{formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)}</small>
            </div>
            <ProgressBar label={`${goal.name} progress`} value={Number(goal.progress_percent ?? 0)} />
          </GlassCard>
        )) : <p className="empty-state">No savings goals yet.</p>}
      </section>

      <section className="section-stack">
        <div className="section-heading">
          <h2>Upcoming Bills</h2>
          <Button variant="secondary" onClick={() => onNavigate("recurring")}>
            Manage
          </Button>
        </div>
        {upcomingBills.length ? upcomingBills.map(({ item, days }) => {
          const status = getBillStatus(item);
          return (
            <GlassCard className="bill-row" key={item.id} variant="subtle">
              <div>
                <strong>{getBillDisplayName(item)}</strong>
                <small>{item.category} · {item.auto_pay_status ? "Auto-pay on" : "Manual payment"}</small>
              </div>
              <div>
                <strong>{formatCurrency(item.amount)}</strong>
                <small>{status === "overdue" ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue` : days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`}</small>
              </div>
            </GlassCard>
          );
        }) : <p className="empty-state">No upcoming bills scheduled.</p>}
      </section>

      <Button variant="secondary" onClick={() => onNavigate("settings")}>
        Account Settings
      </Button>
    </section>
  );
}
