import { useEffect, useState } from "react";
import { DollarSign, FileText } from "lucide-react";
import { getAccounts } from "../api/accounts";
import { createTransaction, getTransactions } from "../api/transactions";
import type { Account, TransactionType } from "../api/types";
import { TopBar } from "../components/TopBar";
import { TransactionImportPanel } from "../components/TransactionImportPanel";
import { Button, CategorySelect, DatePicker, GlassCard, GlassSelect, TextField } from "../components/ui";
import { getDefaultCategory } from "../domain/transactionCategories";

type AddTransactionPageProps = {
  onDone: () => void;
};

const TYPE_HELPER_TEXT: Record<TransactionType, string> = {
  expense: "Choose the spending category that best describes this purchase.",
  income: "Choose the income category that best describes where this money came from.",
};

export function AddTransactionPage({ onDone }: AddTransactionPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<import("../api/types").Transaction[]>([]);
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(getDefaultCategory("expense"));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [accountId, setAccountId] = useState("");
  const [kind, setKind] = useState("standard");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getAccounts(), getTransactions()])
      .then(([accountData, transactionData]) => { setAccounts(accountData); setTransactions(transactionData); })
      .catch(() => setStatus("Start the backend and create an account before saving."));
  }, []);

  const submitLabel = type === "expense" ? "Save Expense" : "Save Income";

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType);
    setCategory(getDefaultCategory(nextType));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const account = accounts.find((entry) => String(entry.id) === accountId) ?? accounts[0];
    if (!account) {
      setStatus("Create an account in the API docs before adding transactions.");
      return;
    }
    if (saving) return;
    setSaving(true);
    try { await createTransaction({
      financial_kind: kind as "standard" | "reimbursement" | "transfer",
      account_id: account.id,
      amount,
      category,
      transaction_type: type,
      transaction_date: date,
      note: note || category,
    });
    onDone();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save transaction."); }
    finally { setSaving(false); }
  }

  return (
    <section className="page">
      <TopBar title="Add Transaction" />
      <Button variant="ghost" onClick={onDone}>Back to Transactions</Button>

      {status && <p className="notice warning">{status}</p>}

      <GlassCard>
        <form className="form-stack" onSubmit={handleSubmit}>
        <GlassSelect label="Account" value={accountId || String(accounts[0]?.id ?? "")} options={accounts.map((account) => ({ value: String(account.id), label: `${account.name} · ${account.bank_name}` }))} onChange={setAccountId} />
        <GlassSelect label="Financial purpose" value={kind} options={[{ value: "standard", label: "Regular expense or income" }, { value: "reimbursement", label: "Reimbursement (excluded from regular income/spending)" }, { value: "transfer", label: "Transfer between own accounts (excluded from reports)" }]} onChange={setKind} />
        <label className="ui-field">
          Select Type
          <div className="segmented-control">
            <button className={type === "expense" ? "selected" : ""} type="button" onClick={() => handleTypeChange("expense")}>
              Expense
            </button>
            <button className={type === "income" ? "selected" : ""} type="button" onClick={() => handleTypeChange("income")}>
              Income
            </button>
          </div>
        </label>

        <TextField icon={<DollarSign size={18} />} label="Amount" min="0" onChange={(event) => setAmount(event.target.value)} placeholder="$0.00" required step="0.01" type="number" value={amount} />

        <div className="category-field-stack">
          <CategorySelect onChange={setCategory} type={type} value={category} />
          <small className="field-helper">{TYPE_HELPER_TEXT[type]}</small>
        </div>

        <DatePicker label="Date" onChange={setDate} required value={date} />

        <TextField icon={<FileText size={18} />} label="Note" onChange={(event) => setNote(event.target.value)} placeholder="Grocery Store" value={note} />

        <Button disabled={saving || !accounts.length} type="submit">{saving ? "Saving…" : submitLabel}</Button>
        </form>
      </GlassCard>
      <TransactionImportPanel accounts={accounts} existingTransactions={transactions} onSaved={() => { void Promise.all([getAccounts(), getTransactions()]).then(([accountData, transactionData]) => { setAccounts(accountData); setTransactions(transactionData); }); }} />
    </section>
  );
}
