import { useCallback, useEffect, useState } from "react";
import { Landmark, WalletCards } from "lucide-react";
import { createAccount, deleteAccount, getAccounts, updateAccount } from "../api/accounts";
import type { Account } from "../api/types";
import { BankSelector } from "../components/BankSelector";
import { TopBar } from "../components/TopBar";
import { Button, GlassCard, TextField } from "../components/ui";
import { formatCurrency } from "../utils/format";

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedBank, setSelectedBank] = useState("");
  const [accountName, setAccountName] = useState("Checking");
  const [startingBalance, setStartingBalance] = useState("");
  const [bankError, setBankError] = useState("");
  const [status, setStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await getAccounts());
      setStatus("");
    } catch {
      setStatus("Could not load accounts. Check that the backend is running.");
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  async function handleCreateAccount(event: React.FormEvent) {
    event.preventDefault();
    setStatus("");
    setBankError("");
    if (!selectedBank) {
      setBankError("Select a bank before creating an account.");
      return;
    }
    try {
      await createAccount({
        bank_name: selectedBank,
        name: accountName,
        starting_balance: startingBalance || "0",
      });
      setSelectedBank("");
      setAccountName("Checking");
      setStartingBalance("");
      setShowForm(false);
      await loadAccounts();
    } catch {
      setStatus("Could not create the account. Check the entered values.");
    }
  }

  async function handleRename(account: Account) {
    const name = editingName.trim();
    if (!name) {
      setStatus("Account name cannot be empty.");
      return;
    }
    try {
      await updateAccount(account.id, { name });
      setEditingId(null);
      setEditingName("");
      await loadAccounts();
    } catch {
      setStatus("Could not update the account.");
    }
  }

  async function handleDelete(account: Account) {
    if (!window.confirm(`Delete ${account.name} and all of its transactions?`)) return;
    try {
      await deleteAccount(account.id);
      await loadAccounts();
    } catch {
      setStatus("Could not delete the account.");
    }
  }

  const totalBalance = accounts.reduce(
    (sum, account) => sum + Number(account.current_balance ?? account.starting_balance),
    0,
  );

  return (
    <section className="page">
      <TopBar title="Accounts" />
      {status && <p className="notice">{status}</p>}

      <GlassCard className="balance-panel" variant="elevated">
        <p className="section-label">Total available balance</p>
        <div className="balance-card">{formatCurrency(totalBalance)}</div>
        <p className="caption-text">
          {accounts.length} financial account{accounts.length === 1 ? "" : "s"}
        </p>
      </GlassCard>

      <div className="section-heading">
        <h2>Your Accounts</h2>
        <Button variant="secondary" onClick={() => setShowForm((current) => !current)}>
          {showForm ? "Cancel" : "Add Account"}
        </Button>
      </div>

      {showForm && (
        <GlassCard>
          <form className="form-stack" onSubmit={handleCreateAccount}>
            <BankSelector
              error={bankError}
              onChange={(bankName) => {
                setSelectedBank(bankName);
                setBankError("");
              }}
              value={selectedBank}
            />
            <TextField
              icon={<Landmark size={18} />}
              label="Account Name"
              onChange={(event) => setAccountName(event.target.value)}
              required
              value={accountName}
            />
            <TextField
              icon={<WalletCards size={18} />}
              label="Starting Balance"
              min="0"
              onChange={(event) => setStartingBalance(event.target.value)}
              placeholder="$0.00"
              step="0.01"
              type="number"
              value={startingBalance}
            />
            <Button type="submit">Create Account</Button>
          </form>
        </GlassCard>
      )}

      <div className="section-stack">
        {accounts.length > 0 ? (
          accounts.map((account) => (
            <GlassCard className="management-row" key={account.id}>
              {editingId === account.id ? (
                <TextField
                  label="Account Name"
                  onChange={(event) => setEditingName(event.target.value)}
                  value={editingName}
                />
              ) : (
                <div className="management-summary">
                  <span>{account.bank_name}</span>
                  <strong>{account.name}</strong>
                  <b>{formatCurrency(account.current_balance ?? account.starting_balance)}</b>
                </div>
              )}
              <div className="row-actions">
                {editingId === account.id ? (
                  <>
                    <Button variant="secondary" onClick={() => void handleRename(account)}>Save</Button>
                    <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingId(account.id);
                      setEditingName(account.name);
                    }}
                  >
                    Rename
                  </Button>
                )}
                <Button variant="danger" onClick={() => void handleDelete(account)}>Delete</Button>
              </div>
            </GlassCard>
          ))
        ) : (
          <p className="empty-state">No accounts yet. Add one before recording transactions.</p>
        )}
      </div>
    </section>
  );
}
