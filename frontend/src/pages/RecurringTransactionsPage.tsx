import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarClock, CalendarDays, CheckCircle2, CreditCard, DollarSign, Landmark, Pencil, Plus, Repeat2, Trash2 } from "lucide-react";
import { getAccounts } from "../api/accounts";
import { getPlaidStatus } from "../api/plaid";
import {
  createRecurringTransaction,
  deleteRecurringTransaction,
  getRecurringTransactions,
  updateRecurringTransaction,
  type RecurringTransaction,
  type RecurringTransactionPayload,
} from "../api/recurringTransactions";
import { getTransactions, TRANSACTIONS_UPDATED_EVENT } from "../api/transactions";
import type { Account, Transaction } from "../api/types";
import { TopBar } from "../components/TopBar";
import { Button, DatePicker, GlassCard, GlassSelect, IconButton, Modal, TextField } from "../components/ui";
import { getCategoriesForType } from "../domain/transactionCategories";
import { getBillDisplayName, getBillStatus, getUpcomingBills, parseLocalDate } from "../domain/recurringBills";
import { summarizeRecurringBills } from "../domain/recurringSummary";
import { summarizeBankSubscriptions } from "../domain/subscriptionInsights";
import { formatCurrency, formatDate } from "../utils/format";
import "./RecurringTransactionsPage.css";

type Draft = {
  name: string;
  amount: string;
  frequency: "weekly" | "monthly";
  next_due_date: string;
  account_id: string;
  category: string;
  auto_pay_status: boolean;
  reminder_settings: number[];
  note: string;
};

const REMINDER_OPTIONS = [
  { value: 7, label: "7 days before" },
  { value: 3, label: "3 days before" },
  { value: 1, label: "1 day before" },
  { value: 0, label: "Due today" },
  { value: -1, label: "Overdue" },
];

const defaultDraft: Draft = {
  name: "",
  amount: "",
  frequency: "monthly",
  next_due_date: new Date().toISOString().slice(0, 10),
  account_id: "",
  category: "Subscriptions",
  auto_pay_status: true,
  reminder_settings: [7, 3, 1, 0, -1],
  note: "",
};

export function RecurringTransactionsPage({ onOpenAccounts }: { onOpenAccounts?: () => void }) {
  const [initialLoading, setInitialLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [bankTransactions, setBankTransactions] = useState<Transaction[]>([]);
  const [bankConnected, setBankConnected] = useState<boolean | null>(null);
  const [modalItem, setModalItem] = useState<RecurringTransaction | null | "create">(null);
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [error, setError] = useState("");
  const [subscriptionError, setSubscriptionError] = useState("");
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      const [accountData, recurringData, transactionData, plaidStatus] = await Promise.allSettled([
        getAccounts(),
        getRecurringTransactions(),
        getTransactions(),
        getPlaidStatus(),
      ]);
      if (accountData.status === "fulfilled") setAccounts(accountData.value);
      if (recurringData.status === "fulfilled") { setItems(recurringData.value); setSchedulesLoaded(true); }
      if (transactionData.status === "fulfilled") setBankTransactions(transactionData.value);
      if (plaidStatus.status === "fulfilled") setBankConnected(plaidStatus.value.connections.length > 0);
      const failed = [accountData.status === "rejected" && "accounts", recurringData.status === "rejected" && "saved bills"].filter(Boolean);
      setError(failed.length ? `Could not refresh your ${failed.join(" and ")}. Please retry.` : "");
      setSubscriptionError(transactionData.status === "rejected" || plaidStatus.status === "rejected"
        ? "Could not refresh connected-bank subscriptions. Please retry." : "");
    } catch {
      setError("Could not load recurring transactions. Check your connection and retry.");
    } finally {
      setInitialLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    window.addEventListener("focus", loadData);
    window.addEventListener(TRANSACTIONS_UPDATED_EVENT, loadData);
    return () => {
      window.removeEventListener("focus", loadData);
      window.removeEventListener(TRANSACTIONS_UPDATED_EVENT, loadData);
    };
  }, []);

  const upcoming = useMemo(() => getUpcomingBills(items, new Date(), 45), [items]);
  const subscriptionSummary = useMemo(() => summarizeBankSubscriptions(bankTransactions), [bankTransactions]);
  const todayKey = new Date().toDateString();
  const summary = useMemo(() => summarizeRecurringBills(items, new Date(todayKey)), [items, todayKey]);
  const nextPayment = summary.nextPayment;
  const accountOptions = accounts.map((account) => ({ value: String(account.id), label: `${account.name} · ${account.bank_name}` }));
  const categoryOptions = getCategoriesForType("expense").map((category) => ({ value: category.label, label: category.label }));

  function openCreate() {
    setDraft({ ...defaultDraft, account_id: String(accounts[0]?.id ?? "") });
    setModalItem("create");
  }

  function openEdit(item: RecurringTransaction) {
    setDraft({
      name: getBillDisplayName(item),
      amount: item.amount,
      frequency: item.frequency,
      next_due_date: item.next_due_date,
      account_id: String(item.account_id),
      category: item.category,
      auto_pay_status: item.auto_pay_status,
      reminder_settings: item.reminder_settings?.length ? item.reminder_settings : defaultDraft.reminder_settings,
      note: item.note ?? "",
    });
    setModalItem(item);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() || !Number(draft.amount) || !draft.account_id || !draft.next_due_date) {
      setError("Enter a name, amount, account, and due date.");
      return;
    }
    setSaving(true);
    const payload: RecurringTransactionPayload = {
      name: draft.name.trim(),
      account_id: Number(draft.account_id),
      amount: Number(draft.amount).toFixed(2),
      category: draft.category,
      transaction_type: "expense",
      frequency: draft.frequency,
      next_due_date: draft.next_due_date,
      note: draft.note.trim() || null,
      auto_pay_status: draft.auto_pay_status,
      reminder_settings: draft.reminder_settings,
    };
    try {
      if (modalItem && modalItem !== "create") await updateRecurringTransaction(modalItem.id, payload);
      else await createRecurringTransaction(payload);
      setModalItem(null);
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The recurring bill could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: RecurringTransaction) {
    setSaving(true);
    try {
      await deleteRecurringTransaction(item.id);
      await loadData();
    } catch {
      setError("The recurring bill could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  function toggleReminder(value: number) {
    setDraft((current) => ({
      ...current,
      reminder_settings: current.reminder_settings.includes(value)
        ? current.reminder_settings.filter((item) => item !== value)
        : [...current.reminder_settings, value].sort((left, right) => right - left),
    }));
  }

  if (initialLoading) return <section className="page recurring-page" aria-busy="true">
    <RecurringHeader />
    <span className="loading-sr-only" role="status">Loading recurring transactions</span>
    <div className="rt-summary">{[0, 1, 2, 3].map(value => <div className="rt-summary-card rt-loading-card" key={value}><span className="rt-skeleton" /><span className="rt-skeleton rt-skeleton-value" /></div>)}</div>
    <div className="rt-main">{[0, 1].map(value => <div className="rt-panel rt-loading-panel" key={value}><span className="rt-skeleton" /><span className="rt-skeleton rt-skeleton-body" /></div>)}</div>
  </section>;

  return (
    <section className="page recurring-page">
      <RecurringHeader />
      {error && <p className="notice" role="alert">{error} <Button variant="ghost" onClick={() => void loadData()}>Retry</Button></p>}

      <div className="rt-summary" aria-label="Recurring bill overview">
        <SummaryCard kind="monthly" label="Monthly Total" icon={DollarSign} value={!schedulesLoaded ? "—" : summary.monthlyTotal === null ? "Unavailable" : formatCurrency(summary.monthlyTotal)} note="Saved bills · monthly estimate" />
        <SummaryCard kind="subscriptions" label="Active Subscriptions" icon={Repeat2} value={schedulesLoaded ? summary.activeSubscriptions : "—"} note="Saved subscription reminders" />
        <SummaryCard kind="upcoming" label="Upcoming This Month" icon={CalendarDays} value={schedulesLoaded ? summary.upcomingThisMonth : "—"} note="Scheduled next due dates" />
        <SummaryCard kind="next" label="Next Payment" icon={CreditCard} value={schedulesLoaded && nextPayment ? <time dateTime={nextPayment.next_due_date}>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parseLocalDate(nextPayment.next_due_date))}</time> : "—"} note={schedulesLoaded && nextPayment ? `${formatCurrency(nextPayment.amount)} · ${getBillDisplayName(nextPayment)}` : schedulesLoaded ? "No upcoming payments" : "Waiting for saved bills"} />
      </div>

      <div className="rt-toolbar"><Button className="rt-add-button" onClick={openCreate}><Plus aria-hidden="true" size={18} /> Add Bill or Subscription</Button></div>

      <div className="rt-main">
      <GlassCard className="rt-panel rt-bank-panel bank-subscription-summary" aria-labelledby="rt-bank-title">
        <div className="rt-panel-heading">
          <span className="rt-panel-icon"><Landmark aria-hidden="true" size={21} /></span>
          <div><h2 id="rt-bank-title">Connected Bank Subscriptions</h2><p>Estimates from synced bank transactions.</p></div>
        </div>
        {subscriptionError ? (
          <p className="notice" role="alert">{subscriptionError} <Button variant="ghost" onClick={() => void loadData()}>Retry subscriptions</Button></p>
        ) : bankConnected === null ? (
          <p className="caption-text">Checking connected banks...</p>
        ) : bankConnected ? (
          <>
            <div className="bank-subscription-metrics">
              <div>
                <span>Detected subscriptions</span>
                <strong>{subscriptionSummary.subscriptions.length}</strong>
              </div>
              <div>
                <span>Estimated monthly cost</span>
                <strong>{formatCurrency(subscriptionSummary.monthlyTotal)}</strong>
              </div>
            </div>
            {subscriptionSummary.subscriptions.length ? (
              <div className="bank-subscription-list rt-subscription-list">
                {subscriptionSummary.subscriptions.map((subscription) => {
                  const account = accounts.find((item) => item.id === subscription.account_id);
                  return (
                    <div key={`${subscription.account_id}-${subscription.name}`}>
                      <span>
                        <strong>{subscription.name}</strong>
                        <small>{account?.name ?? "Connected account"} · Last charged {formatDate(subscription.last_charge_date)}</small>
                      </span>
                      <strong>{formatCurrency(subscription.amount)} / month</strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rt-empty"><span className="rt-empty-icon"><Repeat2 aria-hidden="true" size={28} /></span><h3>No subscriptions detected yet</h3><p>Recurring charges may appear as more bank transactions sync.</p></div>
            )}
          </>
        ) : (
          <div className="rt-empty"><span className="rt-empty-icon"><Landmark aria-hidden="true" size={28} /></span><h3>Bring your subscriptions together</h3><p>Connect a bank in Accounts. Synced transactions may help detect recurring subscriptions.</p>{onOpenAccounts && <Button variant="secondary" onClick={onOpenAccounts}>Go to Accounts</Button>}</div>
        )}
      </GlassCard>

      <GlassCard className="rt-panel rt-upcoming-panel" aria-labelledby="rt-upcoming-title">
        <div className="rt-panel-heading"><span className="rt-panel-icon"><CalendarClock aria-hidden="true" size={21} /></span><div><h2 id="rt-upcoming-title">Upcoming</h2><p>Your bills and renewal dates.</p></div><span className="rt-count">{upcoming.length}</span></div>
        <div className="rt-bills">
        {!schedulesLoaded ? <div className="rt-empty"><span className="rt-empty-icon"><CalendarClock aria-hidden="true" size={28} /></span><h3>Saved bills are unavailable</h3><p>Retry to load your existing schedules.</p><Button variant="secondary" onClick={() => void loadData()}>Retry bills</Button></div> : upcoming.length ? upcoming.map(({ item, days }) => (
          <article className={`bill-card rt-bill-row ${getBillStatus(item)}`} key={item.id}>
            <div className="bill-card-main">
              <span className="bill-icon"><CalendarClock size={19} /></span>
              <div>
                <h3>{getBillDisplayName(item)}</h3>
                <p>{item.category} · {item.frequency} · {item.auto_pay_status ? "Auto-pay on" : "Manual payment"}</p>
              </div>
            </div>
            <div className="bill-card-meta">
              <strong>{formatCurrency(item.amount)}</strong>
              <span>{days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue` : days === 0 ? "Due today" : `Due ${formatDate(item.next_due_date)}`}</span>
              {item.last_paid_date && <small><CheckCircle2 size={14} /> Paid {formatDate(item.last_paid_date)}</small>}
            </div>
            <div className="bill-card-actions">
              <Button aria-label={`Edit ${getBillDisplayName(item)}`} disabled={saving} onClick={() => openEdit(item)} variant="secondary"><Pencil size={15} aria-hidden="true" /> Edit</Button>
              <IconButton aria-label={`Delete ${getBillDisplayName(item)}`} disabled={saving} onClick={() => void remove(item)}><Trash2 size={17} /></IconButton>
            </div>
          </article>
        )) : <div className="rt-empty"><span className="rt-empty-icon"><CalendarDays aria-hidden="true" size={28} /></span><h3>{items.length ? "Nothing due soon" : "Stay one step ahead"}</h3><p>{items.length ? "No saved bills are due in the next 45 days." : "Add your subscriptions and bills to keep upcoming payments in view."}</p><Button variant="secondary" onClick={openCreate}><Plus size={17} aria-hidden="true" />{items.length ? "Add Bill or Subscription" : "Add Your First Bill"}</Button></div>}
        </div>
      </GlassCard>
      </div>

      <Modal className="rt-bill-modal" isOpen={modalItem !== null} onClose={() => !saving && setModalItem(null)} title={modalItem === "create" ? "Add bill reminder" : "Edit bill reminder"}>
        <form className="budget-editor-form" onSubmit={(event) => void save(event)}>
          <TextField autoFocus label="Name" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Netflix, Rent, Internet" required value={draft.name} />
          <TextField icon={<span>$</span>} label="Amount" min="0.01" onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} required step="0.01" type="number" value={draft.amount} />
          <GlassSelect label="Frequency" onChange={(value) => setDraft((current) => ({ ...current, frequency: value as Draft["frequency"] }))} options={[{ value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" }]} value={draft.frequency} />
          <DatePicker label="Due / renewal date" onChange={(value) => setDraft((current) => ({ ...current, next_due_date: value }))} required value={draft.next_due_date} />
          <GlassSelect label="Payment account" onChange={(value) => setDraft((current) => ({ ...current, account_id: value }))} options={accountOptions} placeholder="Choose account" value={draft.account_id} />
          <GlassSelect label="Category" onChange={(value) => setDraft((current) => ({ ...current, category: value }))} options={categoryOptions} value={draft.category} />
          <label className="bill-toggle"><input checked={draft.auto_pay_status} onChange={(event) => setDraft((current) => ({ ...current, auto_pay_status: event.target.checked }))} type="checkbox" /> Auto-pay enabled</label>
          <div className="reminder-grid" aria-label="Reminder settings">
            {REMINDER_OPTIONS.map((option) => <label key={option.value}><input checked={draft.reminder_settings.includes(option.value)} onChange={() => toggleReminder(option.value)} type="checkbox" /> {option.label}</label>)}
          </div>
          <TextField label="Note" onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Optional merchant or memo text for matching" value={draft.note} />
          <div className="budget-modal-actions"><Button disabled={saving} onClick={() => setModalItem(null)} variant="secondary">Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving..." : "Save bill"}</Button></div>
        </form>
      </Modal>
    </section>
  );
}

function RecurringHeader() {
  return <div className="rt-header"><TopBar title="Recurring Transactions" /><p>Manage your subscriptions and recurring bills in one place.</p></div>;
}

function SummaryCard({ kind, label, icon: Icon, value, note }: { kind: string; label: string; icon: typeof DollarSign; value: ReactNode; note: string }) {
  return <GlassCard className="rt-summary-card" data-summary={kind}><div className="rt-summary-top"><h2>{label}</h2><span className="rt-stat-icon"><Icon aria-hidden="true" size={18} /></span></div><strong className="rt-summary-value">{value}</strong><p>{note}</p></GlassCard>;
}
