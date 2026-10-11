import type { TransactionType } from "../api/types";
import type { Transaction } from "../api/types";
import { getCategoriesForType, getDefaultCategory } from "./transactionCategories";
import { detectSubscription } from "./subscriptionInsights";

export { detectSubscription } from "./subscriptionInsights";

export type MerchantSuggestion = {
  merchant: string;
  category: string;
  confidence: "high" | "medium" | "low";
};

export type SubscriptionSuggestion = {
  merchant: string;
  name: string;
  category: string;
  amount: string;
  account_id: number;
  next_due_date: string;
  confidence: "high" | "medium" | "low";
  reason: string;
};

const MERCHANT_RULES: { keywords: string[]; merchant: string; category: string }[] = [
  { keywords: ["kroger"], merchant: "Kroger", category: "Groceries" },
  { keywords: ["walmart", "wal-mart"], merchant: "Walmart", category: "Groceries" },
  { keywords: ["whole foods", "aldi", "heb", "trader joe"], merchant: "Grocery Store", category: "Groceries" },
  { keywords: ["mcdonald", "chipotle", "chick-fil-a", "restaurant", "burger", "pizza"], merchant: "Restaurant", category: "Food & Dining" },
  { keywords: ["starbucks", "dunkin"], merchant: "Coffee Shop", category: "Food & Dining" },
  { keywords: ["shell", "chevron", "exxon", "valero", "gas"], merchant: "Gas Station", category: "Transportation" },
  { keywords: ["uber", "lyft"], merchant: "Rideshare", category: "Transportation" },
  { keywords: ["amazon"], merchant: "Amazon", category: "Shopping" },
  { keywords: ["target"], merchant: "Target", category: "Shopping" },
  { keywords: ["rent", "mortgage"], merchant: "Housing Payment", category: "Housing" },
  { keywords: ["payroll", "salary", "direct deposit"], merchant: "Payroll", category: "Salary" },
  { keywords: ["refund"], merchant: "Refund", category: "Refund" },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.+\s/-]/g, " ").replace(/\s+/g, " ").trim();
}

function validCategory(type: TransactionType, category: string) {
  return getCategoriesForType(type).some((item) => item.label === category);
}

export function suggestMerchantCategory(description: string, type: TransactionType): MerchantSuggestion {
  const value = normalize(description);
  const rule = MERCHANT_RULES.find((item) => item.keywords.some((keyword) => value.includes(keyword)));
  if (rule && validCategory(type, rule.category)) {
    return { merchant: rule.merchant, category: rule.category, confidence: "high" };
  }
  return { merchant: cleanMerchantName(description), category: getDefaultCategory(type), confidence: value ? "low" : "medium" };
}

export function cleanMerchantName(description: string) {
  const cleaned = description
    .replace(/\b(pos|debit|credit|card|purchase|payment|online|mobile|withdrawal|deposit)\b/gi, " ")
    .replace(/\b\d{2,}\b/g, " ")
    .replace(/[*#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Imported transaction";
}

export function inferReceiptFromFileName(fileName: string) {
  const name = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  const date = name.match(/\b(20\d{2})[.\s-]?(0?[1-9]|1[0-2])[.\s-]?(0?[1-9]|[12]\d|3[01])\b/);
  const amount = name.match(/\b(?:total|amount)?\s*\$?(\d{1,5}(?:[.,]\d{2}))\b/i);
  const suggestion = suggestMerchantCategory(name, "expense");
  return {
    merchant: suggestion.merchant !== "Imported transaction" ? suggestion.merchant : "",
    category: suggestion.category,
    date: date ? `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}` : "",
    total: amount ? amount[1].replace(",", ".") : "",
  };
}

export function buildSubscriptionSuggestions(
  rows: { account_id: number; amount: string; category: string; description: string; transaction_date: string; transaction_type: TransactionType }[],
  existingNames: string[] = [],
  existingTransactions: Transaction[] = [],
): SubscriptionSuggestion[] {
  const existing = new Set(existingNames.map((name) => normalize(name)));
  const suggestions = new Map<string, SubscriptionSuggestion>();
  for (const row of rows) {
    if (row.transaction_type !== "expense") continue;
    const match = detectSubscription(row.description);
    const merchant = match?.name ?? cleanMerchantName(row.description);
    if (existing.has(normalize(merchant))) continue;
    const matchingHistory = existingTransactions.filter((transaction) => (
      transaction.transaction_type === "expense"
      && transaction.account_id === row.account_id
      && Math.abs(Number(transaction.amount) - Number(row.amount)) < 0.01
      && normalize(transaction.note ?? "").includes(normalize(merchant).slice(0, 16))
    ));
    const matchingImportRows = rows.filter((candidate) => (
      candidate.transaction_type === "expense"
      && candidate.account_id === row.account_id
      && Math.abs(Number(candidate.amount) - Number(row.amount)) < 0.01
      && normalize(cleanMerchantName(candidate.description)) === normalize(merchant)
    ));
    if (!match && matchingHistory.length + matchingImportRows.length < 2) continue;
    const key = `${merchant}-${row.account_id}-${Number(row.amount).toFixed(2)}`;
    if (suggestions.has(key)) continue;
    suggestions.set(key, {
      account_id: row.account_id,
      amount: Number(row.amount).toFixed(2),
      category: validCategory("expense", row.category) ? row.category : match?.category ?? "Subscriptions",
      confidence: match ? "high" : "medium",
      merchant,
      name: merchant,
      next_due_date: nextMonthlyDate(row.transaction_date),
      reason: match
        ? `Detected ${merchant} from the imported transaction description.`
        : `Detected repeated ${merchant} payments with the same amount.`,
    });
  }
  return [...suggestions.values()];
}

function nextMonthlyDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}
