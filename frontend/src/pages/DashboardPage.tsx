import { useEffect, useMemo, useState } from "react";
import type { Page } from "../App";
import { getAccounts } from "../api/accounts";
import { getBudgets } from "../api/budgets";
import { getTransactions } from "../api/transactions";
import type { Account, Budget, Transaction } from "../api/types";
import { MoneyCard } from "../components/MoneyCard";
import { TopBar } from "../components/TopBar";
import { TransactionItem } from "../components/TransactionItem";
import { Button, GlassCard } from "../components/ui";
import { formatCurrency } from "../utils/format";

type DashboardPageProps = {
  onNavigate: (page: Page) => void;
  userName: string;
};

export function DashboardPage({ onNavigate, userName }: DashboardPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getAccounts(), getTransactions(), getBudgets()])
      .then(([accountData, transactionData, budgetData]) => {
        setAccounts(accountData);
        setTransactions(transactionData);
        setBudgets(budgetData);
      })
      .catch(() => setError("Start the backend server to load live data."));
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

      <Button variant="secondary" onClick={() => onNavigate("settings")}>
        Account Settings
      </Button>
    </section>
  );
}
