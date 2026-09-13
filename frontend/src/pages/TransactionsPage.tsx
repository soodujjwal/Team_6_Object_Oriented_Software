import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { getAccounts } from "../api/accounts";
import {
  deleteTransaction,
  getTransactions,
  updateTransaction,
  type TransactionPayload,
} from "../api/transactions";
import type { Account, Transaction, TransactionType } from "../api/types";
import { TopBar } from "../components/TopBar";
import { Button, GlassCard, TextField } from "../components/ui";
import { getCategoriesForType, getDefaultCategory } from "../domain/transactionCategories";
import { formatCurrency, formatDate } from "../utils/format";

type TransactionDraft = TransactionPayload;

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TransactionDraft | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [transactionData, accountData] = await Promise.all([
        getTransactions(),
        getAccounts(),
      ]);
      setTransactions(transactionData);
      setAccounts(accountData);
      setStatus("");
    } catch {
      setStatus("Could not load transactions. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const categories = useMemo(
    () => Array.from(new Set(transactions.map((transaction) => transaction.category))).sort(),
    [transactions],
  );

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return transactions
      .filter((transaction) => typeFilter === "all" || transaction.transaction_type === typeFilter)
      .filter((transaction) => categoryFilter === "all" || transaction.category === categoryFilter)
      .filter((transaction) => {
        if (!normalizedQuery) return true;
        return [transaction.note, transaction.category, accountName(accounts, transaction.account_id)]
          .some((value) => value?.toLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => {
        const dateOrder = right.transaction_date.localeCompare(left.transaction_date);
        return dateOrder || right.id - left.id;
      });
  }, [accounts, categoryFilter, query, transactions, typeFilter]);

  function beginEdit(transaction: Transaction) {
    setEditingId(transaction.id);
    setDraft({
      account_id: transaction.account_id,
      amount: transaction.amount,
      category: transaction.category,
      transaction_type: transaction.transaction_type,
      transaction_date: transaction.transaction_date,
      note: transaction.note ?? "",
    });
    setStatus("");
  }

  function changeDraftType(nextType: TransactionType) {
    if (!draft) return;
    const options = getCategoriesForType(nextType).map((category) => category.label);
    setDraft({
      ...draft,
      transaction_type: nextType,
      category: options.includes(draft.category) ? draft.category : getDefaultCategory(nextType),
    });
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (editingId === null || draft === null) return;
    try {
      await updateTransaction(editingId, draft);
      setEditingId(null);
      setDraft(null);
      await loadData();
    } catch {
      setStatus("Could not update the transaction. Check the entered values.");
    }
  }

  async function handleDelete(transaction: Transaction) {
    const label = transaction.note || transaction.category;
    if (!window.confirm(`Delete ${label}?`)) return;
    try {
      await deleteTransaction(transaction.id);
      await loadData();
    } catch {
      setStatus("Could not delete the transaction.");
    }
  }

  return (
    <section className="page">
      <TopBar title="Transactions" />
      {status && <p className="notice">{status}</p>}

      <GlassCard className="filter-panel">
        <TextField
          icon={<Search size={18} />}
          label="Search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes, categories, or accounts"
          type="search"
          value={query}
        />
        <div className="filter-grid">
          <SelectField
            label="Type"
            onChange={setTypeFilter}
            options={[
              { label: "All types", value: "all" },
              { label: "Income", value: "income" },
              { label: "Expense", value: "expense" },
            ]}
            value={typeFilter}
          />
          <SelectField
            label="Category"
            onChange={setCategoryFilter}
            options={[
              { label: "All categories", value: "all" },
              ...categories.map((category) => ({ label: category, value: category })),
            ]}
            value={categoryFilter}
          />
        </div>
      </GlassCard>

      <p className="section-label">
        {filteredTransactions.length} of {transactions.length} transaction{transactions.length === 1 ? "" : "s"}
      </p>

      <div className="section-stack">
        {loading ? (
          <p className="empty-state">Loading transactions...</p>
        ) : filteredTransactions.length > 0 ? (
          filteredTransactions.map((transaction) => (
            <GlassCard className="transaction-record" key={transaction.id}>
              {editingId === transaction.id && draft ? (
                <form className="form-stack" onSubmit={saveEdit}>
                  <div className="filter-grid">
                    <SelectField
                      label="Account"
                      onChange={(value) => setDraft({ ...draft, account_id: Number(value) })}
                      options={accounts.map((account) => ({ label: account.name, value: String(account.id) }))}
                      value={String(draft.account_id)}
                    />
                    <SelectField
                      label="Type"
                      onChange={(value) => changeDraftType(value as TransactionType)}
                      options={[
                        { label: "Income", value: "income" },
                        { label: "Expense", value: "expense" },
                      ]}
                      value={draft.transaction_type}
                    />
                  </div>
                  <div className="filter-grid">
                    <TextField
                      label="Amount"
                      min="0"
                      onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                      required
                      step="0.01"
                      type="number"
                      value={draft.amount}
                    />
                    <SelectField
                      label="Category"
                      onChange={(value) => setDraft({ ...draft, category: value })}
                      options={getCategoriesForType(draft.transaction_type).map((category) => ({
                        label: category.label,
                        value: category.label,
                      }))}
                      value={draft.category}
                    />
                  </div>
                  <div className="filter-grid">
                    <TextField
                      label="Date"
                      onChange={(event) => setDraft({ ...draft, transaction_date: event.target.value })}
                      required
                      type="date"
                      value={draft.transaction_date}
                    />
                    <TextField
                      label="Note"
                      onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                      value={draft.note ?? ""}
                    />
                  </div>
                  <div className="row-actions">
                    <Button type="submit">Save Changes</Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                        setDraft(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="transaction-record-main">
                    <div>
                      <span>{transaction.category}</span>
                      <strong>{transaction.note || transaction.category}</strong>
                      <small>
                        {accountName(accounts, transaction.account_id)} · {formatDate(transaction.transaction_date)}
                      </small>
                    </div>
                    <b className={transaction.transaction_type === "income" ? "positive" : "negative"}>
                      {transaction.transaction_type === "income" ? "+" : "-"}{formatCurrency(transaction.amount)}
                    </b>
                  </div>
                  <div className="row-actions">
                    <Button variant="secondary" onClick={() => beginEdit(transaction)}>Edit</Button>
                    <Button variant="danger" onClick={() => void handleDelete(transaction)}>Delete</Button>
                  </div>
                </>
              )}
            </GlassCard>
          ))
        ) : (
          <p className="empty-state">
            {transactions.length ? "No transactions match these filters." : "No transactions yet."}
          </p>
        )}
      </div>
    </section>
  );
}

type SelectOption = { label: string; value: string };

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: any) => void;
  options: SelectOption[];
  value: string;
}) {
  return (
    <label className="ui-field">
      <span>{label}</span>
      <div className="ui-field-control">
        <span />
        <select onChange={(event) => onChange(event.target.value)} value={value}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <ChevronDown size={18} />
      </div>
    </label>
  );
}

function accountName(accounts: Account[], accountId: number) {
  return accounts.find((account) => account.id === accountId)?.name ?? `Account ${accountId}`;
}
