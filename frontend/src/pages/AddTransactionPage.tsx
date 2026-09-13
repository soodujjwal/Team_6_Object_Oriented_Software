import { useEffect, useState } from "react";
import { ChevronDown, DollarSign, FileText, Tag } from "lucide-react";
import { getAccounts } from "../api/accounts";
import { createTransaction } from "../api/transactions";
import type { Account, TransactionType } from "../api/types";
import { TopBar } from "../components/TopBar";
import { Button, DatePicker, GlassCard, TextField } from "../components/ui";
import {
  getCategoriesForType,
  getDefaultCategory,
} from "../domain/transactionCategories";

type AddTransactionPageProps = {
  onDone: () => void;
};

const TYPE_HELPER_TEXT: Record<TransactionType, string> = {
  expense: "Choose the spending category that best describes this purchase.",
  income: "Choose the income category that best describes where this money came from.",
};

export function AddTransactionPage({ onDone }: AddTransactionPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(getDefaultCategory("expense"));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    getAccounts()
      .then(setAccounts)
      .catch(() => setStatus("Start the backend and create an account before saving."));
  }, []);

  const categories = getCategoriesForType(type);
  const submitLabel = type === "expense" ? "Save Expense" : "Save Income";

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType);
    setCategory(getDefaultCategory(nextType));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const account = accounts[0];
    if (!account) {
      setStatus("Create a financial account from the Accounts page before adding transactions.");
      return;
    }
    await createTransaction({
      account_id: account.id,
      amount,
      category,
      transaction_type: type,
      transaction_date: date,
      note: note || category,
    });
    onDone();
  }

  return (
    <section className="page">
      <TopBar title="Add Transaction" />
      <Button variant="ghost" onClick={onDone}>Back to Dashboard</Button>

      {status && <p className="notice">{status}</p>}

      <GlassCard>
        <form className="form-stack" onSubmit={handleSubmit}>
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

        <label className="ui-field">
          Category
          <div className="ui-field-control">
            <Tag size={18} />
            <select onChange={(event) => setCategory(event.target.value)} value={category}>
              {categories.map((categoryOption) => (
                <option key={categoryOption.id} value={categoryOption.label}>
                  {categoryOption.label}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" size={18} />
          </div>
          <small className="field-helper">{TYPE_HELPER_TEXT[type]}</small>
        </label>

        <DatePicker label="Date" onChange={setDate} required value={date} />

        <TextField icon={<FileText size={18} />} label="Note" onChange={(event) => setNote(event.target.value)} placeholder="Grocery Store" value={note} />

        <Button type="submit">{submitLabel}</Button>
        </form>
      </GlassCard>
    </section>
  );
}
