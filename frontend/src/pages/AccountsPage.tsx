import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Landmark, Plus, WalletCards } from "lucide-react";
import { getAccounts } from "../api/accounts";
import { TRANSACTIONS_UPDATED_EVENT } from "../api/transactions";
import type { Account } from "../api/types";
import { MoneyCard } from "../components/MoneyCard";
import { TopBar } from "../components/TopBar";
import { Button, GlassCard } from "../components/ui";
import { formatCurrency } from "../utils/format";

type AccountsPageProps = {
  onAddAccount: () => void;
};

export function AccountsPage({ onAddAccount }: AccountsPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    loadAccounts();
    window.addEventListener(TRANSACTIONS_UPDATED_EVENT, loadAccounts);
    return () => window.removeEventListener(TRANSACTIONS_UPDATED_EVENT, loadAccounts);
  }, []);

  const totals = useMemo(() => {
    return accounts.reduce(
      (summary, account) => {
        const balance = getAccountBalance(account);
        summary.total += balance;
        if (balance >= 0) summary.availableCash += balance;
        else summary.creditDebt += Math.abs(balance);
        return summary;
      },
      { availableCash: 0, creditDebt: 0, total: 0 },
    );
  }, [accounts]);

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];

  function loadAccounts() {
    getAccounts()
      .then((data) => {
        setAccounts(data);
        setStatus("");
        setSelectedAccountId((current) => current ?? data[0]?.id ?? null);
      })
      .catch(() => setStatus("Start the backend server to view accounts."));
  }

  return (
    <section className="page accounts-page">
      <TopBar title="Accounts" />

      {status && <p className="notice" role="alert">{status}</p>}

      <div className="accounts-page-heading">
        <div>
          <h2>Accounts</h2>
          <p>Manage balances, cash, and debt from one place.</p>
        </div>
        <Button onClick={onAddAccount}>
          <Plus aria-hidden="true" size={18} /> Add Account
        </Button>
      </div>

      <div className="accounts-summary-grid">
        <MoneyCard label="Total Balance" value={formatCurrency(totals.total)} />
        <MoneyCard label="Available Cash" tone="income" value={formatCurrency(totals.availableCash)} />
        <MoneyCard label="Credit Debt" tone="expense" value={formatCurrency(totals.creditDebt)} />
      </div>

      <div className="accounts-management-layout">
        <GlassCard className="accounts-list-card">
          <div className="accounts-section-heading">
            <h2>Your Accounts</h2>
            <span>{accounts.length} account{accounts.length === 1 ? "" : "s"}</span>
          </div>

          <div className="accounts-list">
            {accounts.length ? accounts.map((account) => {
              const balance = getAccountBalance(account);
              const isSelected = account.id === selectedAccount?.id;
              return (
                <GlassCard className={`accounts-list-item${isSelected ? " selected" : ""}`} key={account.id} variant="subtle">
                  <div className="account-icon">
                    {isCashAccount(account) ? <WalletCards aria-hidden="true" size={20} /> : <Landmark aria-hidden="true" size={20} />}
                  </div>
                  <div>
                    <strong>{account.name}</strong>
                    <span>{account.bank_name || "Manual account"}</span>
                    <small>Last updated today</small>
                  </div>
                  <div className="account-balance-block">
                    <strong className={balance < 0 ? "negative" : ""}>{formatCurrency(balance)}</strong>
                    <Button onClick={() => setSelectedAccountId(account.id)} variant="secondary">
                      View <ArrowRight aria-hidden="true" size={15} />
                    </Button>
                  </div>
                </GlassCard>
              );
            }) : (
              <div className="budget-empty-state">
                <span className="budget-empty-icon"><WalletCards aria-hidden="true" size={22} /></span>
                <h3>No accounts yet</h3>
                <p>Add a bank, savings, credit, or cash account to start tracking balances.</p>
                <Button onClick={onAddAccount}>
                  <Plus aria-hidden="true" size={18} /> Add Account
                </Button>
              </div>
            )}
          </div>
        </GlassCard>

        {selectedAccount && (
          <GlassCard className="account-detail-card" variant="elevated">
            <div className="accounts-section-heading">
              <h2>{selectedAccount.name}</h2>
              <span>{selectedAccount.bank_name || "Manual account"}</span>
            </div>
            <div className="account-detail-balance">
              <span>Current Balance</span>
              <strong className={getAccountBalance(selectedAccount) < 0 ? "negative" : ""}>
                {formatCurrency(getAccountBalance(selectedAccount))}
              </strong>
            </div>
            <dl className="account-detail-list">
              <div>
                <dt>Starting Balance</dt>
                <dd>{formatCurrency(selectedAccount.starting_balance)}</dd>
              </div>
              <div>
                <dt>Available Now</dt>
                <dd>{formatCurrency(Math.max(getAccountBalance(selectedAccount), 0))}</dd>
              </div>
              <div>
                <dt>Debt</dt>
                <dd>{formatCurrency(Math.max(Math.abs(Math.min(getAccountBalance(selectedAccount), 0)), 0))}</dd>
              </div>
            </dl>
            <Button onClick={onAddAccount} variant="secondary">
              Manage Accounts
            </Button>
          </GlassCard>
        )}
      </div>
    </section>
  );
}

function getAccountBalance(account: Account) {
  return Number(account.current_balance ?? account.starting_balance);
}

function isCashAccount(account: Account) {
  return `${account.name} ${account.bank_name}`.toLowerCase().includes("cash");
}
