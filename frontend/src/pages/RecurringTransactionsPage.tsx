import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { getAccounts } from "../api/accounts";
import {
  createRecurringTransaction,
  deleteRecurringTransaction,
  getRecurringTransactions,
  updateRecurringTransaction,
  type RecurringTransaction,
  type RecurringTransactionPayload,
} from "../api/recurringTransactions";
import type { Account } from "../api/types";
import { TopBar } from "../components/TopBar";
import { Button, DatePicker, GlassCard, GlassSelect, IconButton, Modal, TextField } from "../components/ui";
import { getCategoriesForType } from "../domain/transactionCategories";
import { getBillDisplayName, getBillStatus, getUpcomingBills } from "../domain/recurringBills";
import { formatCurrency, formatDate } from "../utils/format";

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

export function RecurringTransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [modalItem, setModalItem] = useState<RecurringTransaction | null | "create">(null);
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      const [accountData, recurringData] = await Promise.all([getAccounts(), getRecurringTransactions()]);
      setAccounts(accountData);
      setItems(recurringData);
      setError("");
    } catch {
      setError("Start the backend server to manage recurring bills.");
    }
  }

  useEffect(() => {
    void loadData();
    window.addEventListener("focus", loadData);
    return () => window.removeEventListener("focus", loadData);
  }, []);

  const upcoming = useMemo(() => getUpcomingBills(items, new Date(), 45), [items]);
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

  return (
    <section className="page recurring-page">
      <TopBar title="Recurring Bills" />
      {error && <p className="notice" role="alert">{error}</p>}

      <div className="section-heading">
        <div>
          <h2>Subscriptions & Bill Reminders</h2>
          <p className="caption-text">Track renewals, auto-pay status, reminders, and paid cycles from matched transactions.</p>
        </div>
        <Button onClick={openCreate}><Plus size={17} /> Add Bill</Button>
      </div>

      <section className="section-stack">
        <h2 className="section-title">Upcoming</h2>
        {upcoming.length ? upcoming.map(({ item, days }) => (
          <GlassCard className={`bill-card ${getBillStatus(item)}`} key={item.id}>
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
              <Button onClick={() => openEdit(item)} variant="secondary"><Pencil size={15} /> Edit</Button>
              <IconButton aria-label={`Delete ${getBillDisplayName(item)}`} disabled={saving} onClick={() => void remove(item)}><Trash2 size={17} /></IconButton>
            </div>
          </GlassCard>
        )) : <p className="empty-state">No upcoming subscriptions or bills yet.</p>}
      </section>

      <Modal isOpen={modalItem !== null} onClose={() => !saving && setModalItem(null)} title={modalItem === "create" ? "Add bill reminder" : "Edit bill reminder"}>
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
