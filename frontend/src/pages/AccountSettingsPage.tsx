import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, BriefcaseBusiness, Check, Landmark, Mail, Moon, Sun, User as UserIcon, WalletCards } from "lucide-react";
import { createAccount, deleteAccount, getAccounts, updateAccount } from "../api/accounts";
import { AUTH_TOKEN_KEY } from "../api/client";
import { changePassword, deleteCurrentUser, updateProfile, type User } from "../api/auth";
import type { Account } from "../api/types";
import { BankSelector } from "../components/BankSelector";
import { MoveFunds } from "../components/MoveFunds";
import { TRANSACTIONS_UPDATED_EVENT } from "../api/transactions";
import { TopBar } from "../components/TopBar";
import { Button, GlassCard, GlassSelect, Modal, TextField } from "../components/ui";
import type { Theme } from "../theme/theme";
import { formatCurrency } from "../utils/format";

type AccountSettingsPageProps = {
  user: User;
  onLogout: () => void;
  onThemeChange: (theme: Theme) => void;
  onUserUpdate: (user: User, accessToken?: string) => void;
  theme: Theme;
};

const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "other", label: "Other" },
];

export function AccountSettingsPage({ user, onLogout, onThemeChange, onUserUpdate, theme }: AccountSettingsPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedBank, setSelectedBank] = useState("");
  const [bankError, setBankError] = useState("");
  const [accountName, setAccountName] = useState("Checking");
  const [accountType, setAccountType] = useState<Account["account_type"]>("checking");
  const [editingType, setEditingType] = useState<Account["account_type"]>("other");
  const [startingBalance, setStartingBalance] = useState("");
  const [status, setStatus] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ name: user.name, email: user.email, occupation: user.occupation ?? "" });
  const [passwordDraft, setPasswordDraft] = useState({ current: "", next: "", confirm: "" });
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    loadAccounts();
    window.addEventListener(TRANSACTIONS_UPDATED_EVENT, loadAccounts);
    return () => window.removeEventListener(TRANSACTIONS_UPDATED_EVENT, loadAccounts);
  }, []);

  function loadAccounts() {
    getAccounts()
      .then(setAccounts)
      .catch(() => setStatus("Start the backend server to manage accounts."));
  }

  function openProfileEditor() {
    setProfileDraft({ name: user.name, email: user.email, occupation: user.occupation ?? "" });
    setPasswordDraft({ current: "", next: "", confirm: "" });
    setDeleteConfirm("");
    setProfileMessage("");
    setProfileOpen(true);
  }

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileMessage("");
    try {
      const session = await updateProfile({
        name: profileDraft.name.trim(),
        email: profileDraft.email.trim(),
        occupation: profileDraft.occupation.trim(),
      });
      onUserUpdate(session.user, session.access_token);
      setProfileMessage("Profile updated.");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Could not update profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    setProfileMessage("");
    if (passwordDraft.next !== passwordDraft.confirm) {
      setProfileMessage("New password and confirmation do not match.");
      return;
    }
    if (passwordDraft.next.length < 8) {
      setProfileMessage("New password must be at least 8 characters.");
      return;
    }
    setProfileSaving(true);
    try {
      await changePassword({ current_password: passwordDraft.current, new_password: passwordDraft.next });
      setPasswordDraft({ current: "", next: "", confirm: "" });
      setProfileMessage("Password changed.");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Could not change password.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleDeleteProfile() {
    setProfileMessage("");
    if (deleteConfirm !== user.email) {
      setProfileMessage("Type your email address exactly to confirm account deletion.");
      return;
    }
    setProfileSaving(true);
    try {
      await deleteCurrentUser();
      localStorage.removeItem(AUTH_TOKEN_KEY);
      onLogout();
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Could not delete account.");
      setProfileSaving(false);
    }
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
        account_type: accountType,
        starting_balance: startingBalance || "0",
      });
      setSelectedBank("");
      setAccountName("Checking");
      setAccountType("checking");
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
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete account.");
    }
  }

  async function handleRenameAccount(account: Account) {
    const name = editingName.trim();
    if (!name) return;
    setStatus("");
    try {
      await updateAccount(account.id, { name, account_type: editingType });
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
            {user.occupation && <span>{user.occupation}</span>}
            {user.phone_number && <span>{user.phone_number}</span>}
          </div>
          <Button
            className="profile-edit-button"
            onClick={openProfileEditor}
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
          <GlassSelect label="Account Type" options={ACCOUNT_TYPES} value={accountType} onChange={(value) => {
            setAccountType(value as Account["account_type"]);
            if (["Checking", "Savings", "Other"].includes(accountName)) setAccountName(ACCOUNT_TYPES.find((item) => item.value === value)!.label);
          }} />
          <TextField icon={<WalletCards size={18} />} label="Starting Balance" min="0" onChange={(event) => setStartingBalance(event.target.value)} placeholder="$0.00" step="0.01" type="number" value={startingBalance} />
          <Button type="submit">
            Create Account
          </Button>
        </form>
      </GlassCard>

      <MoveFunds accounts={accounts} />

      <GlassCard className="settings-panel" variant="subtle">
        <h2>Your Accounts</h2>
        <div className="account-list">
          {accounts.length > 0 ? (
            accounts.map((account) => (
              <GlassCard className="account-row" key={account.id} variant="subtle">
                {editingId === account.id ? (
                  <div className="form-stack">
                    <TextField label="Account Name" autoFocus onChange={(event) => setEditingName(event.target.value)} value={editingName} />
                    <GlassSelect label="Account Type" options={ACCOUNT_TYPES} value={editingType} onChange={(value) => setEditingType(value as Account["account_type"])} />
                  </div>
                ) : (
                  <div>
                    <strong>{account.name}</strong>
                    <span>{account.bank_name}</span>
                    <span>{ACCOUNT_TYPES.find((item) => item.value === account.account_type)?.label}</span>
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
                        setEditingType(account.account_type);
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

      <Modal isOpen={profileOpen} onClose={() => !profileSaving && setProfileOpen(false)} title="Edit Profile">
        <div className="profile-editor">
          <form className="profile-editor-section" onSubmit={handleSaveProfile}>
            <h3>Profile Details</h3>
            <TextField
              icon={<UserIcon size={18} />}
              label="Name"
              onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))}
              required
              value={profileDraft.name}
            />
            <TextField
              icon={<Mail size={18} />}
              label="Email"
              onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))}
              required
              type="email"
              value={profileDraft.email}
            />
            <TextField
              icon={<BriefcaseBusiness size={18} />}
              label="Occupation"
              onChange={(event) => setProfileDraft((current) => ({ ...current, occupation: event.target.value }))}
              placeholder="Student, Designer, Engineer"
              value={profileDraft.occupation}
            />
            <div className="budget-modal-actions">
              <Button disabled={profileSaving} type="submit">
                {profileSaving ? "Saving..." : "Save Profile"}
              </Button>
            </div>
          </form>

          <form className="profile-editor-section" onSubmit={handleChangePassword}>
            <h3>Change Password</h3>
            <TextField
              label="Current Password"
              onChange={(event) => setPasswordDraft((current) => ({ ...current, current: event.target.value }))}
              required
              type="password"
              value={passwordDraft.current}
            />
            <TextField
              label="New Password"
              minLength={8}
              onChange={(event) => setPasswordDraft((current) => ({ ...current, next: event.target.value }))}
              required
              type="password"
              value={passwordDraft.next}
            />
            <TextField
              label="Confirm New Password"
              minLength={8}
              onChange={(event) => setPasswordDraft((current) => ({ ...current, confirm: event.target.value }))}
              required
              type="password"
              value={passwordDraft.confirm}
            />
            <div className="budget-modal-actions">
              <Button disabled={profileSaving} type="submit" variant="secondary">
                Change Password
              </Button>
            </div>
          </form>

          <section className="profile-editor-section danger-zone">
            <h3>Danger Zone</h3>
            <p>Deleting your account is permanent. You will be logged out and this login will no longer work.</p>
            <TextField label={`Type ${user.email} to confirm`} onChange={(event) => setDeleteConfirm(event.target.value)} value={deleteConfirm} />
            <div className="budget-modal-actions">
              <Button disabled={profileSaving || deleteConfirm !== user.email} onClick={() => void handleDeleteProfile()} variant="danger">
                Delete Account
              </Button>
            </div>
          </section>

          {profileMessage && <p className="notice" role="status">{profileMessage}</p>}
        </div>
      </Modal>
    </section>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0] ?? "?").slice(0, 2).toUpperCase();
}
