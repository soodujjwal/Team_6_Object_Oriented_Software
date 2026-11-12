import type { Account, Transaction } from "../api/types";

const CSV_HEADERS = [
  "Date",
  "Type",
  "Amount",
  "Category",
  "Merchant / Note",
  "Account",
  "Bank",
  "Source",
  "Financial Purpose",
  "Personal Amount",
  "Reporting Amount",
];

export function createTransactionCsv(transactions: Transaction[], accounts: Account[]): string {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const rows = transactions.map((transaction) => {
    const account = accountById.get(transaction.account_id);
    return [
      transaction.transaction_date,
      transaction.transaction_type,
      transaction.amount,
      transaction.category,
      transaction.receipt_metadata?.merchant || transaction.note || transaction.category,
      account?.name ?? "Unknown account",
      account?.bank_name ?? "",
      transaction.receipt_metadata?.source ?? "manual",
      transaction.financial_kind ?? "standard",
      transaction.personal_amount ?? "",
      transaction.reporting_amount ?? "",
    ];
  });

  return [CSV_HEADERS, ...rows]
    .map((row) => row.map(toCsvCell).join(","))
    .join("\r\n");
}

export function transactionExportFilename(monthFilter: string, today = new Date()): string {
  const scope = /^\d{4}-\d{2}$/.test(monthFilter) ? monthFilter : "all";
  const generated = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
  return `finance-builder-transactions-${scope}-${generated}.csv`;
}

function toCsvCell(value: string | number): string {
  let text = String(value);
  if ((/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) && !/^-?\d+(\.\d+)?$/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}
