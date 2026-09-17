import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, FileText, Search, Tag, Wallet } from "lucide-react";
import { getAccounts } from "../api/accounts";
import { getTransactions, TRANSACTIONS_UPDATED_EVENT, updateTransaction } from "../api/transactions";
import type { Account, Transaction, TransactionType } from "../api/types";
import { TopBar } from "../components/TopBar";
import { Button, CategorySelect, DatePicker, GlassCard, GlassSelect, Modal, TextField } from "../components/ui";
import { getDefaultCategory } from "../domain/transactionCategories";
import { formatCurrency, formatDate } from "../utils/format";

type SourceFilter = "all" | "receipt" | "csv" | "pdf" | "manual";
type TypeFilter = "all" | TransactionType;

type EditDraft = {
  account_id: string;
  amount: string;
  category: string;
  note: string;
  transaction_date: string;
  transaction_type: TransactionType;
};

const SOURCE_OPTIONS: { label: string; value: SourceFilter }[] = [
  { label: "All Sources", value: "all" },
  { label: "Receipt", value: "receipt" },
  { label: "Bank CSV", value: "csv" },
  { label: "Bank PDF", value: "pdf" },
  { label: "Manual", value: "manual" },
];

export function TransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
    window.addEventListener(TRANSACTIONS_UPDATED_EVENT, loadData);
    return () => window.removeEventListener(TRANSACTIONS_UPDATED_EVENT, loadData);
  }, []);

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const monthOptions = useMemo(() => {
    const months = new Map<string, string>();
    transactions.forEach((transaction) => {
      const key = transaction.transaction_date.slice(0, 7);
      months.set(key, formatMonthLabel(key));
    });
    return [
      { value: "all", label: "All Months" },
      ...[...months.entries()]
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...transactions]
      .sort((left, right) => right.transaction_date.localeCompare(left.transaction_date) || right.id - left.id)
      .filter((transaction) => {
        const source = getTransactionSource(transaction);
        const merchant = getTransactionMerchant(transaction).toLowerCase();
        const account = accountById.get(transaction.account_id);
        const haystack = `${merchant} ${transaction.category} ${transaction.note ?? ""} ${account?.name ?? ""} ${account?.bank_name ?? ""}`.toLowerCase();
        return (
          (!normalizedQuery || haystack.includes(normalizedQuery))
          && (typeFilter === "all" || transaction.transaction_type === typeFilter)
          && (sourceFilter === "all" || source === sourceFilter)
          && (monthFilter === "all" || transaction.transaction_date.startsWith(monthFilter))
        );
      });
  }, [accountById, monthFilter, query, sourceFilter, transactions, typeFilter]);

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    filteredTransactions.forEach((transaction) => {
      const key = transaction.transaction_date.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), transaction]);
    });
    return [...groups.entries()].sort(([left], [right]) => right.localeCompare(left));
  }, [filteredTransactions]);

  function loadData() {
    Promise.all([getAccounts(), getTransactions()])
      .then(([accountData, transactionData]) => {
        setAccounts(accountData);
        setTransactions(transactionData);
        setStatus("");
      })
      .catch(() => setStatus("Start the backend server to view transactions."));
  }

  function openEditor(transaction: Transaction) {
    setEditing(transaction);
    setDraft({
      account_id: String(transaction.account_id),
      amount: transaction.amount,
      category: transaction.category,
      note: getTransactionMerchant(transaction),
      transaction_date: transaction.transaction_date,
      transaction_type: transaction.transaction_type,
    });
    setStatus("");
  }

  function updateDraft(update: Partial<EditDraft>) {
    setDraft((current) => current ? { ...current, ...update } : current);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || !draft) return;
    setSaving(true);
    setStatus("");
    try {
      await updateTransaction(editing.id, {
        account_id: Number(draft.account_id),
        amount: draft.amount,
        category: draft.category,
        note: draft.note,
        transaction_date: draft.transaction_date,
        transaction_type: draft.transaction_type,
        receipt_items: editing.receipt_items ?? undefined,
        receipt_metadata: editing.receipt_metadata ?? undefined,
      });
      setEditing(null);
      setDraft(null);
      await loadData();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The transaction could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page transactions-page">
      <TopBar title="Transactions" />

      {status && <p className="notice">{status}</p>}

      <GlassCard className="transactions-toolbar">
        <TextField
          icon={<Search aria-hidden="true" size={18} />}
          label="Search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search merchant, category, account"
          value={query}
        />
        <GlassSelect
          label="Type"
          onChange={(value) => setTypeFilter(value as TypeFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "income", label: "Income" },
            { value: "expense", label: "Expenses" },
          ]}
          value={typeFilter}
        />
        <GlassSelect
          label="Source"
          onChange={(value) => setSourceFilter(value as SourceFilter)}
          options={SOURCE_OPTIONS}
          value={sourceFilter}
        />
        <GlassSelect
          icon={<CalendarDays aria-hidden="true" size={18} />}
          label="Month"
          onChange={setMonthFilter}
          options={monthOptions}
          value={monthFilter}
        />
      </GlassCard>

      <div className="transaction-history">
        {groupedTransactions.length ? groupedTransactions.map(([month, monthTransactions]) => (
          <section className="transaction-month-group" key={month}>
            <div className="transaction-month-heading">
              <h2>{formatMonthLabel(month)}</h2>
              <span>{monthTransactions.length} transaction{monthTransactions.length === 1 ? "" : "s"}</span>
            </div>
            <div className="transaction-history-list">
              {monthTransactions.map((transaction) => (
                <button className="transaction-history-item" key={transaction.id} onClick={() => openEditor(transaction)} type="button">
                  <span className="transaction-source-badge">{getSourceLabel(getTransactionSource(transaction))}</span>
                  <span className="transaction-history-main">
                    <strong>{getTransactionMerchant(transaction)}</strong>
                    <small>{transaction.category} · {formatDate(transaction.transaction_date)}</small>
                    <small>{accountById.get(transaction.account_id)?.name ?? "Account"} · {accountById.get(transaction.account_id)?.bank_name ?? "Manual account"}</small>
                  </span>
                  <span className={transaction.transaction_type === "income" ? "positive transaction-history-amount" : "negative transaction-history-amount"}>
                    {transaction.transaction_type === "income" ? "+" : "-"}{formatCurrency(transaction.amount)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )) : (
          <GlassCard className="budget-empty-state">
            <span className="budget-empty-icon"><FileText aria-hidden="true" size={22} /></span>
            <h3>No transactions found</h3>
            <p>Try adjusting your filters or add/import a transaction.</p>
          </GlassCard>
        )}
      </div>

      <Modal isOpen={Boolean(editing && draft)} onClose={() => { if (!saving) { setEditing(null); setDraft(null); } }} title="Transaction Details">
        {editing && draft && (
          <form className="transaction-editor" onSubmit={saveEdit}>
            <TextField icon={<FileText aria-hidden="true" size={18} />} label="Merchant / Name" onChange={(event) => updateDraft({ note: event.target.value })} required value={draft.note} />
            <TextField label="Amount" min="0" onChange={(event) => updateDraft({ amount: event.target.value })} required step="0.01" type="number" value={draft.amount} />
            <GlassSelect
              label="Type"
              onChange={(value) => {
                const nextType = value as TransactionType;
                updateDraft({ transaction_type: nextType, category: getDefaultCategory(nextType) });
              }}
              options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }]}
              value={draft.transaction_type}
            />
            <CategorySelect onChange={(category) => updateDraft({ category })} type={draft.transaction_type} value={draft.category} />
            <DatePicker label="Date" onChange={(date) => updateDraft({ transaction_date: date })} value={draft.transaction_date} />
            <GlassSelect
              icon={<Wallet aria-hidden="true" size={18} />}
              label="Account"
              onChange={(accountId) => updateDraft({ account_id: accountId })}
              options={accounts.map((account) => ({ value: String(account.id), label: `${account.name} · ${account.bank_name}` }))}
              value={draft.account_id}
            />
            <div className="transaction-editor-source">
              <Tag aria-hidden="true" size={16} />
              <span>Source: {getSourceLabel(getTransactionSource(editing))}</span>
            </div>
            <div className="budget-modal-actions">
              <Button disabled={saving} onClick={() => { setEditing(null); setDraft(null); }} type="button" variant="secondary">Cancel</Button>
              <Button disabled={saving} type="submit">{saving ? "Saving..." : "Save Changes"}</Button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}

function getTransactionMerchant(transaction: Transaction) {
  return transaction.receipt_metadata?.merchant || transaction.note || transaction.category;
}

function getTransactionSource(transaction: Transaction): Exclude<SourceFilter, "all"> {
  return transaction.receipt_metadata?.source ?? "manual";
}

function getSourceLabel(source: Exclude<SourceFilter, "all">) {
  if (source === "csv") return "Bank CSV";
  if (source === "pdf") return "Bank PDF";
  if (source === "receipt") return "Receipt";
  return "Manual";
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}
