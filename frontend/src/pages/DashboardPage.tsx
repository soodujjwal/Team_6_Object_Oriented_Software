import { useEffect, useMemo, useState } from "react";
import type { Page } from "../App";
import { getAccounts } from "../api/accounts";
import { reportingAmount } from "../domain/financialTracking";
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
import { getEffectiveBudgets } from "../domain/budgeting";
import { formatCurrency } from "../utils/format";
import { DashboardSkeleton, Skeleton } from "../components/LoadingScreen";
import { createRefreshQueue } from "../services/refreshQueue";
import { forecastCashFlow } from "../domain/cashFlowForecast";
import { AlertTriangle, CalendarRange, TrendingUp } from "lucide-react";

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
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [transactionsLoaded, setTransactionsLoaded] = useState(false);
  const [loadedSections, setLoadedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      const failed: string[] = [];
      async function load<T>(name: string, fetchData: () => Promise<T>, apply: (data: T) => void) {
        try {
          const data = await fetchData();
          if (active) { apply(data); setLoadedSections((current) => ({ ...current, [name]: true })); }
        } catch {
          failed.push(name);
        }
      }
      await Promise.all([
        load("accounts", getAccounts, (data) => { setAccounts(data); setAccountsLoaded(true); }),
        load("transactions", getTransactions, (data) => { setTransactions(data); setTransactionsLoaded(true); }),
        load("budgets", getBudgets, setBudgets),
        load("recurring bills", getRecurringTransactions, setRecurring),
        load("savings goals", getSavingsGoals, setGoals),
      ]);
      if (active) setError(failed.length ? `Could not refresh ${failed.join(", ")}. Try refreshing the page.` : "");
    }
    const queue = createRefreshQueue(loadDashboard);
    queue.request();
    const events = [TRANSACTIONS_UPDATED_EVENT, BUDGETS_UPDATED_EVENT, RECURRING_TRANSACTIONS_UPDATED_EVENT, SAVINGS_GOALS_UPDATED_EVENT, "focus"];
    for (const event of events) window.addEventListener(event, queue.request);
    return () => {
      active = false;
      queue.dispose();
      for (const event of events) window.removeEventListener(event, queue.request);
    };
  }, []);

  const totals = useMemo(() => {
    const income = transactions
      .filter((transaction) => transaction.transaction_type === "income")
      .reduce((sum, transaction) => sum + reportingAmount(transaction), 0);
    const spent = transactions
      .filter((transaction) => transaction.transaction_type === "expense")
      .reduce((sum, transaction) => sum + reportingAmount(transaction), 0);
    const balance = accounts.reduce(
      (sum, account) => sum + Number(account.current_balance ?? account.starting_balance),
      0,
    );
    return { income, spent, balance };
  }, [accounts, transactions]);

  const recent = transactions.slice(-3).reverse();
  const upcomingBills = getUpcomingBills(recurring).slice(0, 4);
  const today = new Date();
  const activeBudgets = getEffectiveBudgets(budgets, today.getMonth() + 1, today.getFullYear());
  const forecast = useMemo(() => forecastCashFlow(totals.balance, recurring, today), [recurring, totals.balance]);
  const forecastPoints = useMemo(() => chartPoints(totals.balance, forecast.events.map((event) => event.balance)), [forecast.events, totals.balance]);

  if (!accountsLoaded && !transactionsLoaded && !error) return <section className="page" aria-busy="true">
    <TopBar title="Dashboard" />
    <p className="welcome-line">Welcome, {userName}</p>
    <span className="loading-sr-only" role="status">Loading your dashboard</span>
    <DashboardSkeleton />
  </section>;

  return (
    <section className="page">
      <TopBar title="Dashboard" />
      <p className="welcome-line">Welcome, {userName}</p>
      {error && <p className="notice" role="alert">{error}</p>}

      <GlassCard className="balance-panel" variant="elevated">
        <p className="section-label">Estimated Balance</p>
        <div className="balance-card">{accountsLoaded ? formatCurrency(totals.balance) : error ? "Unavailable" : <Skeleton className="sk-amount" />}</div>
      </GlassCard>

      <GlassCard className={`cash-flow-forecast ${forecast.status}`} variant="elevated">
        <div className="forecast-heading">
          <div>
            <span className="forecast-eyebrow"><CalendarRange aria-hidden="true" size={17} /> Next 30 days</span>
            <h2>Cash-Flow Outlook</h2>
          </div>
          {loadedSections["recurring bills"] && forecast.status !== "no-schedule" && (
            <span className={`forecast-status ${forecast.status}`}>
              {forecast.status === "at-risk" ? <AlertTriangle aria-hidden="true" size={16} /> : <TrendingUp aria-hidden="true" size={16} />}
              {forecast.status === "at-risk" ? "Shortfall risk" : "On track"}
            </span>
          )}
        </div>

        {!loadedSections["recurring bills"] ? (error ? <p className="empty-state">Forecast unavailable.</p> : <Skeleton className="sk-progress" />) : forecast.status === "no-schedule" ? (
          <div className="forecast-empty">
            <p>Add recurring income and bills to see where your balance is heading.</p>
            <Button variant="secondary" onClick={() => onNavigate("recurring")}>Set up recurring activity</Button>
          </div>
        ) : (
          <>
            <div className="forecast-summary-grid">
              <div><span>Projected balance</span><strong>{formatCurrency(forecast.endingBalance)}</strong></div>
              <div className="positive"><span>Expected income</span><strong>+{formatCurrency(forecast.expectedIncome)}</strong></div>
              <div className="negative"><span>Expected bills</span><strong>-{formatCurrency(forecast.expectedExpenses)}</strong></div>
            </div>
            <div className="forecast-chart" role="img" aria-label={`Projected balance changes from ${formatCurrency(totals.balance)} to ${formatCurrency(forecast.endingBalance)} over 30 days`}>
              <svg viewBox="0 0 600 150" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" y1="130" x2="600" y2="130" className="forecast-grid-line" />
                <polyline points={forecastPoints} className="forecast-line" />
              </svg>
            </div>
            <div className="forecast-events">
              {forecast.events.slice(0, 3).map((event) => (
                <div key={event.id}>
                  <span>{new Date(`${event.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {event.name}</span>
                  <strong className={event.type === "income" ? "positive" : "negative"}>{event.type === "income" ? "+" : "-"}{formatCurrency(event.amount)}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </GlassCard>

      <div className="money-grid">
        <MoneyCard label="Income" value={transactionsLoaded ? formatCurrency(totals.income) : error ? "Unavailable" : <Skeleton className="sk-value" />} tone="income" />
        <MoneyCard label="Spent" value={transactionsLoaded ? formatCurrency(totals.spent) : error ? "Unavailable" : <Skeleton className="sk-value" />} tone="expense" />
      </div>

      <section className="section-stack">
        <div className="section-heading">
          <h2>Recent Transactions</h2>
          <Button variant="secondary" onClick={() => onNavigate("transactions")}>
            View
          </Button>
        </div>
        {recent.length > 0 ? (
          recent.map((transaction) => (
            <TransactionItem key={transaction.id} transaction={transaction} />
          ))
        ) : (
          transactionsLoaded ? <p className="empty-state">No transactions yet.</p> : error ? <p className="empty-state">Transactions unavailable.</p> : <Skeleton className="sk-progress" />
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
          {loadedSections.budgets ? <p className="subtle">{activeBudgets.length} monthly budget{activeBudgets.length === 1 ? "" : "s"} active</p> : error ? <p className="empty-state">Budgets unavailable.</p> : <Skeleton className="sk-heading" />}
        </GlassCard>
      </section>

      <section className="section-stack">
        <div className="section-heading">
          <h2>Savings Goals</h2>
          <Button variant="secondary" onClick={() => onNavigate("goals")}>
            View
          </Button>
        </div>
        {!loadedSections["savings goals"] ? (error ? <p className="empty-state">Savings goals unavailable.</p> : <Skeleton className="sk-progress" />) : goals.length ? goals.slice(0, 2).map((goal) => (
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
        {!loadedSections["recurring bills"] ? (error ? <p className="empty-state">Upcoming bills unavailable.</p> : <Skeleton className="sk-progress" />) : upcomingBills.length ? upcomingBills.map(({ item, days }) => {
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

      <Button variant="secondary" onClick={() => onNavigate("accounts")}>
        Manage/View Accounts
      </Button>
    </section>
  );
}

function chartPoints(startingBalance: number, balances: number[]): string {
  const values = [startingBalance, ...balances];
  if (values.length === 1) return "0,75 600,75";
  const minimum = Math.min(...values, 0);
  const maximum = Math.max(...values, 0);
  const range = maximum - minimum || 1;
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * 600;
    const y = 130 - ((value - minimum) / range) * 110;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}
