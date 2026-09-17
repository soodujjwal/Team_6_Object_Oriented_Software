import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  DollarSign,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  ScanLine,
  Tag,
  Trash2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { createTransaction, createTransactions, type TransactionPayload } from "../api/transactions";
import { createRecurringTransaction, getRecurringTransactions } from "../api/recurringTransactions";
import type { Account, Transaction, TransactionType } from "../api/types";
import { getCategoriesForType, getDefaultCategory } from "../domain/transactionCategories";
import {
  buildSubscriptionSuggestions,
  inferReceiptFromFileName,
  suggestMerchantCategory,
  type SubscriptionSuggestion,
} from "../domain/merchantIntelligence";
import { extractBankStatement, extractReceipt } from "../services/receiptExtraction";
import { DatePicker, Button, GlassCard, GlassSelect, TextField } from "./ui";

type ImportMode = "receipt" | "bank" | null;
type ImportSource = "receipt" | "csv" | "pdf";
type ReceiptItemDraft = { name: string; quantity: string; price: string };
type ImportRow = TransactionPayload & { id: string; selected: boolean; duplicate: boolean; description: string };
type ImportHistoryEntry = { label: string; count: number; importedAt: string; account: string };
type SubscriptionPrompt = SubscriptionSuggestion & { id: string; accepted: boolean };

type Props = {
  accounts: Account[];
  existingTransactions: Transaction[];
  onSaved: () => void;
};

const ACCEPTED_IMAGES = "image/jpeg,image/png,image/heic,image/heif";
const IMPORT_HISTORY_KEY = "pfm_import_history";

function isReceiptImage(file: File) {
  const name = file.name.toLowerCase();
  return file.type.startsWith("image/") || [".jpg", ".jpeg", ".png", ".heic", ".heif"].some((extension) => name.endsWith(extension));
}

function money(value: string | number) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); }
  return rows;
}

function guessColumn(headers: string[], names: string[]) {
  return headers.findIndex((header) => names.some((name) => normalizeHeader(header).includes(name)));
}

function likelyDuplicate(row: Pick<ImportRow, "account_id" | "amount" | "transaction_date" | "description">, existing: Transaction[]) {
  return existing.some((transaction) => transaction.account_id === row.account_id && transaction.amount === row.amount && transaction.transaction_date === row.transaction_date && (transaction.note ?? "").toLowerCase().includes(row.description.toLowerCase().slice(0, 24)));
}

export function TransactionImportPanel({ accounts, existingTransactions, onSaved }: Props) {
  const [mode, setMode] = useState<ImportMode>(null);
  const [source, setSource] = useState<ImportSource>("receipt");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [receiptState, setReceiptState] = useState<"idle" | "processing" | "review">("idle");
  const [merchant, setMerchant] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptTotal, setReceiptTotal] = useState("");
  const [receiptTax, setReceiptTax] = useState("");
  const [receiptItems, setReceiptItems] = useState<ReceiptItemDraft[]>([]);
  const [receiptAccount, setReceiptAccount] = useState("");
  const [receiptCategory, setReceiptCategory] = useState("Groceries");
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState({ date: -1, description: -1, amount: -1, debit: -1, credit: -1, type: -1, category: -1 });
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importAccount, setImportAccount] = useState("");
  const [subscriptionPrompts, setSubscriptionPrompts] = useState<SubscriptionPrompt[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [history, setHistory] = useState<ImportHistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(IMPORT_HISTORY_KEY) ?? "[]") as ImportHistoryEntry[]; } catch { return []; }
  });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const selectedRows = importRows.filter((row) => row.selected);
  const duplicateCount = importRows.filter((row) => row.duplicate).length;
  const hasAccounts = accounts.length > 0;
  const defaultAccount = importAccount || receiptAccount || String(accounts[0]?.id ?? "");
  const categoriesForReceipt = getCategoriesForType("expense");

  const csvMappingComplete = mapping.date >= 0 && mapping.description >= 0 && (mapping.amount >= 0 || mapping.debit >= 0 || mapping.credit >= 0);
  const receiptPreviewLabel = useMemo(() => file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : "", [file]);

  function resetImport() {
    setMode(null); setFile(null); setPreviewUrl(""); setReceiptState("idle"); setCsvRows([]); setCsvHeaders([]); setImportRows([]); setSubscriptionPrompts([]); setMessage("");
  }

  function openFile(nextFile: File, nextSource: ImportSource) {
    setSource(nextSource); setFile(nextFile); setMessage("");
    if (nextSource === "pdf") {
      setMode("bank"); setImportRows([]);
      void extractBankStatement(nextFile).then((result) => {
        if (result.transactions?.length) {
          const rows = result.transactions.map((transaction, index) => normalizeImportedTransaction({
            accountId: Number(defaultAccount),
            amount: transaction.amount,
            date: transaction.date,
            description: transaction.description,
            index,
            type: transaction.type,
          }));
          setImportRows(rows);
          void updateSubscriptionPrompts(rows);
          setMessage(result.message);
        } else {
          setMessage(`${result.message} Connect the private statement-parser service before review/import.`);
        }
      });
      return;
    }
    if (nextSource === "csv") {
      const reader = new FileReader();
      reader.onload = () => { const rows = parseCsv(String(reader.result ?? "")); setCsvHeaders(rows[0] ?? []); setCsvRows(rows.slice(1)); const headers = rows[0] ?? []; setMapping({ date: guessColumn(headers, ["date", "posted"]), description: guessColumn(headers, ["description", "merchant", "memo", "payee"]), amount: guessColumn(headers, ["amount"]), debit: guessColumn(headers, ["debit", "withdrawal"]), credit: guessColumn(headers, ["credit", "deposit"]), type: guessColumn(headers, ["type", "transactiontype"]), category: guessColumn(headers, ["category"]) }); setMode("bank"); };
      reader.readAsText(nextFile); return;
    }
    if (nextFile.type.startsWith("image/")) setPreviewUrl(URL.createObjectURL(nextFile));
    setMode("receipt"); setReceiptState("processing");
    const filenameSuggestion = inferReceiptFromFileName(nextFile.name);
    setMerchant(filenameSuggestion.merchant);
    if (filenameSuggestion.date) setReceiptDate(filenameSuggestion.date);
    if (filenameSuggestion.total) setReceiptTotal(filenameSuggestion.total);
    setReceiptCategory(filenameSuggestion.category);
    setReceiptAccount(String(accounts[0]?.id ?? ""));
    void extractReceipt(nextFile).then((result) => {
      const extractedMerchant = result.merchant?.trim() || filenameSuggestion.merchant;
      if (extractedMerchant) {
        setMerchant(extractedMerchant);
        setReceiptCategory(suggestMerchantCategory(extractedMerchant, "expense").category);
      }
      if (result.date) setReceiptDate(result.date);
      if (result.total) setReceiptTotal(result.total);
      if (result.tax) setReceiptTax(result.tax);
      if (result.items?.length) setReceiptItems(result.items.map((item) => ({ name: item.name, quantity: String(item.quantity), price: item.price })));
      if (result.paymentAccountHint) {
        const account = accounts.find((item) => `${item.name} ${item.bank_name}`.toLowerCase().includes(result.paymentAccountHint!.toLowerCase()));
        if (account) setReceiptAccount(String(account.id));
      }
      setMessage(result.status === "extracted" ? `${result.message} Please review before saving.` : result.message);
      setReceiptState("review");
    });
  }

  function openReceiptFile(nextFile: File) {
    if (!isReceiptImage(nextFile)) {
      setMessage("Upload Receipt accepts JPG, PNG, or HEIC images. Use Import Bank CSV or Import Bank Statement PDF for bank files.");
      return;
    }
    openFile(nextFile, "receipt");
  }

  function makeRows() {
    const rows = csvRows.map((row, index) => {
      const value = (column: number) => column >= 0 ? row[column] ?? "" : "";
      const rawAmount = value(mapping.amount).replace(/[$,()]/g, "");
      const debit = value(mapping.debit).replace(/[$,(),]/g, "");
      const credit = value(mapping.credit).replace(/[$,(),]/g, "");
      const isDebit = debit !== "" || (rawAmount !== "" && Number(rawAmount) < 0);
      const amount = money(Math.abs(Number(isDebit ? debit || rawAmount : credit || rawAmount)));
      const description = value(mapping.description) || "Imported transaction";
      const transactionType: TransactionType = mapping.type >= 0
        ? /income|credit|deposit|salary/i.test(value(mapping.type)) ? "income" : "expense"
        : isDebit ? "expense" : "income";
      const parsedDate = new Date(value(mapping.date));
      const date = value(mapping.date).match(/^\d{4}-\d{2}-\d{2}$/)?.[0]
        ?? (Number.isNaN(parsedDate.getTime()) ? new Date().toISOString().slice(0, 10) : parsedDate.toISOString().slice(0, 10));
      const accountId = Number(defaultAccount);
      const suggested = suggestMerchantCategory(description, transactionType);
      const draft: ImportRow = {
        id: `row-${index}`,
        account_id: accountId,
        amount,
        category: value(mapping.category) || suggested.category,
        transaction_type: transactionType,
        transaction_date: date,
        note: suggested.merchant || description,
        description,
        selected: true,
        duplicate: likelyDuplicate({ account_id: accountId, amount, transaction_date: date, description }, existingTransactions),
      };
      return draft;
    }).filter((row) => row.account_id && row.amount !== "NaN");
    setImportRows(rows); setMessage("");
    void updateSubscriptionPrompts(rows);
  }

  async function saveReceipt() {
    if (!hasAccounts || !receiptTotal || !receiptDate || !receiptAccount) { setMessage("Choose an account and enter the extracted total before saving."); return; }
    setBusy(true); setMessage("");
    try { await createTransaction({ account_id: Number(receiptAccount), amount: money(receiptTotal), category: receiptCategory, transaction_type: "expense", transaction_date: receiptDate, note: merchant || "Receipt transaction", receipt_items: receiptItems.filter((item) => item.name.trim()).map((item) => ({ name: item.name.trim(), quantity: Number(item.quantity) || 1, price: money(item.price) })), receipt_metadata: { merchant: merchant || undefined, tax: receiptTax ? money(receiptTax) : undefined, source: "receipt", original_filename: file?.name } }); recordHistory("Receipt", 1); setMessage("Receipt transaction saved."); onSaved(); resetImport(); }
    catch { setMessage("The receipt could not be saved. Check the backend and try again."); }
    finally { setBusy(false); }
  }

  async function saveImport() {
    const rows = selectedRows.filter((row) => !row.duplicate);
    if (!rows.length) { setMessage("Select at least one non-duplicate transaction to import."); return; }
    setBusy(true); setMessage("");
    try {
      await createTransactions(rows.map(({ id: _id, selected: _selected, duplicate: _duplicate, description: _description, ...payload }) => payload));
      const acceptedSubscriptions = subscriptionPrompts.filter((prompt) => prompt.accepted);
      await Promise.all(acceptedSubscriptions.map((prompt) => createRecurringTransaction({
        account_id: prompt.account_id,
        amount: prompt.amount,
        auto_pay_status: true,
        category: prompt.category,
        frequency: "monthly",
        name: prompt.name,
        next_due_date: prompt.next_due_date,
        note: `Imported subscription reminder for ${prompt.merchant}`,
        reminder_settings: [7, 3, 1, 0, -1],
        transaction_type: "expense",
      })));
      recordHistory(source === "csv" ? "Bank CSV" : "Bank statement", rows.length);
      setMessage(`${rows.length} transaction${rows.length === 1 ? "" : "s"} imported${acceptedSubscriptions.length ? ` and ${acceptedSubscriptions.length} reminder${acceptedSubscriptions.length === 1 ? "" : "s"} created` : ""}.`);
      onSaved(); resetImport();
    }
    catch { setMessage("The import could not be saved. Check the backend and try again."); }
    finally { setBusy(false); }
  }

  function recordHistory(label: string, count: number) {
    try { const current = JSON.parse(localStorage.getItem(IMPORT_HISTORY_KEY) ?? "[]") as ImportHistoryEntry[]; const next = [{ label, count, importedAt: new Date().toISOString(), account: accounts.find((account) => String(account.id) === defaultAccount)?.name ?? "" }, ...current].slice(0, 20); localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(next)); setHistory(next); } catch { /* Import success does not depend on local history. */ }
  }

  function updateRow(id: string, update: Partial<ImportRow>) { setImportRows((rows) => rows.map((row) => row.id === id ? { ...row, ...update } : row)); }

  function normalizeImportedTransaction(input: { accountId: number; amount: string; date: string; description: string; index: number; type?: TransactionType }): ImportRow {
    const amountNumber = Number(String(input.amount).replace(/[$,()]/g, ""));
    const transactionType: TransactionType = input.type ?? (amountNumber < 0 ? "expense" : "income");
    const amount = money(Math.abs(amountNumber));
    const parsedDate = new Date(input.date);
    const date = input.date.match(/^\d{4}-\d{2}-\d{2}$/)?.[0]
      ?? (Number.isNaN(parsedDate.getTime()) ? new Date().toISOString().slice(0, 10) : parsedDate.toISOString().slice(0, 10));
    const suggested = suggestMerchantCategory(input.description, transactionType);
    return {
      account_id: input.accountId,
      amount,
      category: suggested.category,
      description: input.description,
      duplicate: likelyDuplicate({ account_id: input.accountId, amount, transaction_date: date, description: input.description }, existingTransactions),
      id: `statement-${input.index}`,
      note: suggested.merchant || input.description,
      selected: true,
      transaction_date: date,
      transaction_type: transactionType,
    };
  }

  async function updateSubscriptionPrompts(rows: ImportRow[]) {
    try {
      const recurring = await getRecurringTransactions();
      const suggestions = buildSubscriptionSuggestions(rows, recurring.map((item) => item.name), existingTransactions);
      setSubscriptionPrompts(suggestions.map((item, index) => ({ ...item, id: `${item.name}-${index}`, accepted: false })));
    } catch {
      const suggestions = buildSubscriptionSuggestions(rows, [], existingTransactions);
      setSubscriptionPrompts(suggestions.map((item, index) => ({ ...item, id: `${item.name}-${index}`, accepted: false })));
    }
  }

  return (
    <GlassCard className="import-panel">
      <div className="import-heading"><span className="import-icon"><ScanLine size={20} /></span><div><h2>Scan or import transactions</h2><p>Use a receipt, bank CSV, or statement document. Nothing is saved until you confirm it.</p></div></div>
      {!mode && <>
        <div className="receipt-actions">
          <button className="receipt-action" onClick={() => imageInputRef.current?.click()} type="button"><Camera size={20} /><span><strong>Take Photo</strong><small>Use your camera on supported mobile browsers</small></span></button>
          <button
            className={`receipt-action${dragActive ? " active" : ""}`}
            onClick={() => uploadInputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const dropped = event.dataTransfer.files[0];
              if (dropped) openReceiptFile(dropped);
            }}
            type="button"
          >
            <Upload size={20} />
            <span><strong>Upload Receipt</strong><small>Choose or drop a JPG, PNG, or HEIC receipt</small></span>
          </button>
        </div>
        <div className="import-secondary-actions">
          <button
            aria-label="Import Bank CSV"
            className="bank-import-button"
            onClick={() => csvInputRef.current?.click()}
            type="button"
          >
            <FileSpreadsheet aria-hidden="true" size={17} /> Import Bank CSV
          </button>
          <button
            aria-label="Import Bank PDF"
            className="bank-import-button"
            onClick={() => pdfInputRef.current?.click()}
            type="button"
          >
            <FileText aria-hidden="true" size={17} /> Import Bank PDF
          </button>
        </div>
        <input accept={ACCEPTED_IMAGES} capture="environment" hidden onChange={(event) => event.target.files?.[0] && openReceiptFile(event.target.files[0])} ref={imageInputRef} type="file" />
        <input accept={ACCEPTED_IMAGES} hidden onChange={(event) => event.target.files?.[0] && openReceiptFile(event.target.files[0])} ref={uploadInputRef} type="file" />
        <input accept=".csv,text/csv" hidden onChange={(event) => event.target.files?.[0] && openFile(event.target.files[0], "csv")} ref={csvInputRef} type="file" />
        <input accept=".pdf,application/pdf" hidden onChange={(event) => event.target.files?.[0] && openFile(event.target.files[0], "pdf")} ref={pdfInputRef} type="file" />
        <div className="import-history"><div className="import-subheading"><h3>Import History</h3><small>Stored only in this browser</small></div>{history.length ? history.slice(0, 3).map((entry, index) => <div className="import-history-row" key={`${entry.importedAt}-${index}`}><span><strong>{entry.label}</strong><small>{entry.account || "Account not recorded"}</small></span><span><strong>{entry.count} transaction{entry.count === 1 ? "" : "s"}</strong><small>{new Date(entry.importedAt).toLocaleDateString()}</small></span></div>) : <p className="import-muted">No confirmed imports yet.</p>}</div>
      </>}

      {mode === "receipt" && <>
        <div className="import-toolbar"><strong>{receiptState === "processing" ? "Extracting transaction details..." : "Review Transaction"}</strong><button aria-label="Close receipt review" onClick={resetImport} type="button"><X size={18} /></button></div>
        {receiptState === "processing" ? <div className="import-processing"><LoaderCircle className="spin" size={26} /><p>Receipt staged for OCR. No transaction has been saved.</p><small>OCR provider integration is not configured yet. Review and enter the fields below.</small></div> : <div className="receipt-review">
          <div className="receipt-preview">{previewUrl ? <img alt="Receipt preview" src={previewUrl} /> : <ImageIcon size={28} />}<small>{receiptPreviewLabel}</small></div>
          <div className="receipt-review-form">
            <TextField label="Merchant" onChange={(event) => setMerchant(event.target.value)} placeholder="Enter merchant if not extracted" value={merchant} />
            <DatePicker label="Date" onChange={setReceiptDate} required value={receiptDate} />
            <TextField icon={<DollarSign size={18} />} label="Total" min="0" onChange={(event) => setReceiptTotal(event.target.value)} placeholder="0.00" required step="0.01" type="number" value={receiptTotal} />
            <TextField label="Tax (optional)" min="0" onChange={(event) => setReceiptTax(event.target.value)} placeholder="0.00" step="0.01" type="number" value={receiptTax} />
            <GlassSelect icon={<Wallet size={18} />} label="Account" onChange={setReceiptAccount} options={accounts.map((account) => ({ value: String(account.id), label: `${account.name} · ${account.bank_name}` }))} placeholder="Choose account" value={receiptAccount} />
            <GlassSelect icon={<Tag size={18} />} label="Category" onChange={setReceiptCategory} options={categoriesForReceipt.map(({ label }) => ({ value: label, label }))} value={receiptCategory} />
          </div>
          <div className="receipt-items"><div className="import-subheading"><h3>Items</h3><button onClick={() => setReceiptItems((items) => [...items, { name: "", quantity: "1", price: "" }])} type="button">+ Add item</button></div>{receiptItems.length ? receiptItems.map((item, index) => <div className="receipt-item-row" key={`${index}-${item.name}`}><input aria-label="Item name" onChange={(event) => setReceiptItems((items) => items.map((entry, entryIndex) => entryIndex === index ? { ...entry, name: event.target.value } : entry))} placeholder="Item" value={item.name} /><input aria-label="Quantity" min="1" onChange={(event) => setReceiptItems((items) => items.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantity: event.target.value } : entry))} type="number" value={item.quantity} /><input aria-label="Price" min="0" onChange={(event) => setReceiptItems((items) => items.map((entry, entryIndex) => entryIndex === index ? { ...entry, price: event.target.value } : entry))} placeholder="$0.00" step="0.01" type="number" value={item.price} /><button aria-label="Remove item" onClick={() => setReceiptItems((items) => items.filter((_, entryIndex) => entryIndex !== index))} type="button"><Trash2 size={16} /></button></div>) : <p className="import-muted">No item details were extracted. Add them if you want to preserve receipt-level detail.</p>}</div>
          <div className="import-review-actions"><Button onClick={() => { setReceiptState("idle"); setMessage("Receipt fields are editable below; choose Review Transaction again when ready."); }} variant="secondary">Edit</Button><Button disabled={busy} onClick={() => void saveReceipt()}>{busy ? "Saving..." : "Save Transaction"}</Button></div>
        </div>}
      </>}

      {mode === "bank" && (source === "csv" || importRows.length > 0) && <>
        <div className="import-toolbar"><strong>{importRows.length ? "Import Review" : "Map CSV columns"}</strong><button aria-label="Close import review" onClick={resetImport} type="button"><X size={18} /></button></div>
        {source === "csv" && !csvMappingComplete && <p className="import-muted">Map Date, Description, and Amount or Debit/Credit before continuing.</p>}
        {source === "csv" && !importRows.length && <div className="csv-mapping">{(["date", "description", "amount", "debit", "credit", "type", "category"] as const).map((field) => <GlassSelect className="csv-map-select" key={field} label={`${field[0].toUpperCase() + field.slice(1)} ${(["date", "description"].includes(field) ? "*" : "")}`} onChange={(nextValue) => setMapping((current) => ({ ...current, [field]: Number(nextValue) }))} options={[
          { value: "-1", label: "Not mapped" },
          ...csvHeaders.map((header, index) => ({ value: String(index), label: header })),
        ]} value={String(mapping[field])} />)}</div>}
        {source === "csv" && csvMappingComplete && !importRows.length && <Button onClick={makeRows}><Check size={17} /> Continue to review</Button>}
        {importRows.length > 0 && <>
          <div className="import-review-summary">
            <strong>{importRows.length} transactions detected</strong>
            {duplicateCount > 0 && <span className="duplicate-warning">{duplicateCount} possible duplicate{duplicateCount === 1 ? "" : "s"} found</span>}
            <div className="import-account-select">
              <GlassSelect
                className="import-account-glass-select"
                label="Account"
                onChange={(nextValue) => { setImportAccount(nextValue); setImportRows([]); setSubscriptionPrompts([]); }}
                options={accounts.map((account) => ({ value: String(account.id), label: `${account.name} · ${account.bank_name}` }))}
                placeholder="Choose account"
                value={importAccount || String(accounts[0]?.id ?? "")}
              />
            </div>
          </div>
          <div className="import-table-wrap">
            <table className="import-table">
              <thead>
                <tr><th>Select</th><th>Date</th><th>Description</th><th>Amount</th><th>Type</th><th>Category</th><th /></tr>
              </thead>
              <tbody>
                {importRows.map((row) => <tr className={row.duplicate ? "possible-duplicate" : ""} key={row.id}>
                  <td><input aria-label={`Select ${row.description}`} checked={row.selected} onChange={(event) => updateRow(row.id, { selected: event.target.checked })} type="checkbox" /></td>
                  <td><DatePicker compact hideLabel label="Transaction date" onChange={(date) => updateRow(row.id, { transaction_date: date })} value={row.transaction_date} /></td>
                  <td><input aria-label="Transaction description" onChange={(event) => {
                    const suggested = suggestMerchantCategory(event.target.value, row.transaction_type);
                    updateRow(row.id, { description: event.target.value, note: suggested.merchant || event.target.value, category: suggested.category });
                  }} value={row.description} /></td>
                  <td><input aria-label="Transaction amount" min="0" onChange={(event) => updateRow(row.id, { amount: money(event.target.value) })} step="0.01" type="number" value={row.amount} /></td>
                  <td><GlassSelect ariaLabel={`Type for ${row.description}`} className="import-table-glass-select" compact onChange={(nextValue) => {
                    const nextType = nextValue as TransactionType;
                    const suggested = suggestMerchantCategory(row.description, nextType);
                    updateRow(row.id, { transaction_type: nextType, category: suggested.category || getDefaultCategory(nextType) });
                  }} options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }]} value={row.transaction_type} /></td>
                  <td><GlassSelect ariaLabel={`Category for ${row.description}`} className="import-table-glass-select" compact onChange={(nextValue) => updateRow(row.id, { category: nextValue })} options={getCategoriesForType(row.transaction_type).map(({ label }) => ({ value: label, label }))} value={row.category} /></td>
                  <td>{row.duplicate && <span title="Likely duplicate"><AlertIcon size={16} /></span>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          {subscriptionPrompts.length > 0 && (
            <div className="subscription-import-prompts">
              <div>
                <strong>We found a recurring subscription. Would you like to add it as a reminder?</strong>
                <p>Review each suggestion before importing. Nothing is added unless you choose it.</p>
              </div>
              {subscriptionPrompts.map((prompt) => (
                <label className="subscription-import-prompt" key={prompt.id}>
                  <input
                    checked={prompt.accepted}
                    onChange={(event) => setSubscriptionPrompts((items) => items.map((item) => item.id === prompt.id ? { ...item, accepted: event.target.checked } : item))}
                    type="checkbox"
                  />
                  <span>
                    <strong>{prompt.name}</strong>
                    <small>{prompt.amount} monthly · {prompt.category} · due around {prompt.next_due_date}</small>
                    <small>{prompt.reason}</small>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="import-review-actions">
            <Button onClick={() => setImportRows((rows) => rows.map((row) => ({ ...row, selected: !row.duplicate })))} variant="secondary">Select non-duplicates</Button>
            <Button disabled={busy} onClick={() => void saveImport()}>{busy ? "Importing..." : `Import ${selectedRows.filter((row) => !row.duplicate).length} Transactions`}</Button>
          </div>
        </>}
      </>}

      {mode === "bank" && source === "pdf" && !importRows.length && <div className="pdf-import-state"><FileText size={28} /><strong>Statement staged for parser review</strong><p>{file?.name}</p><small>PDF extraction is not configured in this project yet. No transactions were created. Connect the private statement-parser service here before enabling extraction.</small><Button onClick={resetImport} variant="secondary">Choose another file</Button></div>}

      {message && <p className="import-message" role="status">{message}</p>}
    </GlassCard>
  );
}

function AlertIcon({ size = 16 }: { size?: number }) { return <AlertTriangle size={size} />; }
