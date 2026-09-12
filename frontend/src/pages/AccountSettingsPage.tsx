import { useEffect, useState } from "react";
import { ArrowRight, Check, Landmark, Moon, Sun, WalletCards } from "lucide-react";
import { createAccount, deleteAccount, getAccounts, updateAccount } from "../api/accounts";
import type { User } from "../api/auth";
import type { Account } from "../api/types";
import { BankSelector } from "../components/BankSelector";
import { TopBar } from "../components/TopBar";
import { Button, GlassCard, TextField } from "../components/ui";
import type { Theme } from "../theme/theme";
import { formatCurrency } from "../utils/format";

type AccountSettingsPageProps = {
  user: User;
  onLogout: () => void;
  onThemeChange: (theme: Theme) => void;
  theme: Theme;
};

export function AccountSettingsPage({ user, onLogout, onThemeChange, theme }: AccountSettingsPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedBank, setSelectedBank] = useState("");
  const [bankError, setBankError] = useState("");
  const [accountName, setAccountName] = useState("Checking");
  const [startingBalance, setStartingBalance] = useState("");
  const [status, setStatus] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    loadAccounts();
  }, []);

  function loadAccounts() {
    getAccounts()
      .then(setAccounts)
      .catch(() => setStatus("Start the backend server to manage accounts."));
  }

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
      loadAccounts();
    } catch {
      setStatus("Could not create account.");
    }
  }

  async function handleDeleteAccount(accountId: number) {
    const confirmed = window.confirm("Delete this account and its transactions?");
    if (!confirmed) return;
    setStatus("");
    try {
      await deleteAccount(accountId);
      loadAccounts();
    } catch {
      setStatus("Could not delete account.");
    }
  }

  async function handleRenameAccount(account: Account) {
    const name = editingName.trim();
    if (!name) return;
    setStatus("");
    try {
      await updateAccount(account.id, { name });
      setEditingId(null);
      setEditingName("");
      loadAccounts();
    } catch {
      setStatus("Could not update account.");
    }
  }

  return (
    <section className="page">
      <TopBar title="Account Settings" />
      {status && <p className="notice">{status}</p>}

      <GlassCard className="settings-panel">
        <h2>Profile</h2>
        <div className="profile-summary">
          <div aria-label={`${user.name} profile avatar`} className="profile-avatar">
            {getInitials(user.name)}
          </div>
          <div className="profile-details">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
            {user.phone_number && <span>{user.phone_number}</span>}
          </div>
          <Button
            className="profile-edit-button"
            onClick={() => setStatus("Profile editing is not available yet.")}
            variant="secondary"
          >
            Edit Profile <ArrowRight aria-hidden="true" size={16} />
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="settings-panel appearance-panel">
        <div className="appearance-heading">
          <div>
            <h2>Appearance</h2>
            <p>Choose your preferred theme.</p>
          </div>
        </div>
        <div aria-label="Color theme" className="theme-toggle" role="group">
          <button
            aria-pressed={theme === "light"}
            className={theme === "light" ? "selected" : ""}
            onClick={() => onThemeChange("light")}
            type="button"
          >
            <Sun aria-hidden="true" size={18} />
            Light
            {theme === "light" && <Check aria-hidden="true" className="theme-check" size={16} />}
          </button>
          <button
            aria-pressed={theme === "dark"}
            className={theme === "dark" ? "selected" : ""}
            onClick={() => onThemeChange("dark")}
            type="button"
          >
            <Moon aria-hidden="true" size={18} />
            Dark
            {theme === "dark" && <Check aria-hidden="true" className="theme-check" size={16} />}
          </button>
        </div>
      </GlassCard>

      <GlassCard className="settings-panel">
        <h2>Create Account</h2>
        <form className="form-stack" onSubmit={handleCreateAccount}>
          <BankSelector
            error={bankError}
            onChange={(bankName) => {
              setSelectedBank(bankName);
              setBankError("");
            }}
            value={selectedBank}
          />
          <TextField icon={<Landmark size={18} />} label="Account Name" onChange={(event) => setAccountName(event.target.value)} required value={accountName} />
          <TextField icon={<WalletCards size={18} />} label="Starting Balance" min="0" onChange={(event) => setStartingBalance(event.target.value)} placeholder="$0.00" step="0.01" type="number" value={startingBalance} />
          <Button type="submit">
            Create Account
          </Button>
        </form>
      </GlassCard>

      <GlassCard className="settings-panel" variant="subtle">
        <h2>Your Accounts</h2>
        <div className="account-list">
          {accounts.length > 0 ? (
            accounts.map((account) => (
              <GlassCard className="account-row" key={account.id} variant="subtle">
                {editingId === account.id ? (
                  <input
                    autoFocus
                    onChange={(event) => setEditingName(event.target.value)}
                    value={editingName}
                  />
                ) : (
                  <div>
                    <strong>{account.name}</strong>
                    <span>{account.bank_name}</span>
                    <span>{formatCurrency(account.current_balance ?? account.starting_balance)}</span>
                  </div>
                )}
                <div className="account-actions">
                  {editingId === account.id ? (
                    <Button variant="secondary" onClick={() => handleRenameAccount(account)}>
                      Save
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingId(account.id);
                        setEditingName(account.name);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                  <Button variant="danger" onClick={() => handleDeleteAccount(account.id)}>
                    Delete
                  </Button>
                </div>
              </GlassCard>
            ))
          ) : (
            <p className="empty-state">No accounts yet.</p>
          )}
        </div>
      </GlassCard>

      <Button variant="ghost" onClick={onLogout}>
        Logout
      </Button>
    </section>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0] ?? "?").slice(0, 2).toUpperCase();
}
