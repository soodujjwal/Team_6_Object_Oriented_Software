import type { Transaction } from "../api/types";

export type SubscriptionRule = {
  keywords: string[];
  name: string;
  category: string;
};

export type DetectedSubscription = {
  account_id: number;
  amount: number;
  confidence: "high" | "medium";
  last_charge_date: string;
  name: string;
};

export type SubscriptionSummary = {
  monthlyTotal: number;
  subscriptions: DetectedSubscription[];
};

export const SUBSCRIPTION_RULES: SubscriptionRule[] = [
  { keywords: ["netflix"], name: "Netflix", category: "Subscriptions" },
  { keywords: ["spotify"], name: "Spotify", category: "Subscriptions" },
  { keywords: ["adobe"], name: "Adobe", category: "Subscriptions" },
  { keywords: ["hulu"], name: "Hulu", category: "Subscriptions" },
  { keywords: ["disney"], name: "Disney+", category: "Subscriptions" },
  { keywords: ["apple.com/bill", "icloud"], name: "Apple", category: "Subscriptions" },
  { keywords: ["youtube premium", "google youtube"], name: "YouTube Premium", category: "Subscriptions" },
  { keywords: ["microsoft", "xbox"], name: "Microsoft", category: "Subscriptions" },
  { keywords: ["prime video", "amazon prime"], name: "Amazon Prime", category: "Subscriptions" },
  { keywords: ["gym", "fitness", "planet fitness"], name: "Fitness Membership", category: "Subscriptions" },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.+\s/-]/g, " ").replace(/\s+/g, " ").trim();
}

function merchantName(description: string) {
  const cleaned = description
    .replace(/\b(pos|debit|credit|card|purchase|payment|online|mobile|withdrawal|deposit)\b/gi, " ")
    .replace(/\b\d{2,}\b/g, " ")
    .replace(/[*#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Imported transaction";
}

export function detectSubscription(description: string) {
  const value = normalize(description);
  return SUBSCRIPTION_RULES.find((item) => item.keywords.some((keyword) => value.includes(keyword)));
}

export function summarizeBankSubscriptions(transactions: Transaction[]): SubscriptionSummary {
  const bankExpenses = transactions.filter((transaction) => (
    transaction.transaction_type === "expense"
    && transaction.receipt_metadata?.source === "plaid"
    && Number(transaction.amount) > 0
  ));
  const groups = new Map<string, { displayName: string; known: boolean; transactions: Transaction[] }>();

  for (const transaction of bankExpenses) {
    const description = transaction.note ?? "";
    const rule = detectSubscription(description);
    const displayName = rule?.name ?? merchantName(description);
    const key = `${transaction.account_id}:${normalize(displayName)}`;
    const group = groups.get(key) ?? { displayName, known: Boolean(rule), transactions: [] };
    group.known ||= Boolean(rule);
    group.transactions.push(transaction);
    groups.set(key, group);
  }

  const subscriptions: DetectedSubscription[] = [];
  for (const group of groups.values()) {
    const charges = [...group.transactions].sort((left, right) => left.transaction_date.localeCompare(right.transaction_date));
    if (!group.known && !looksMonthly(charges)) continue;
    const latest = charges.at(-1)!;
    subscriptions.push({
      account_id: latest.account_id,
      amount: Number(latest.amount),
      confidence: group.known ? "high" : "medium",
      last_charge_date: latest.transaction_date,
      name: group.displayName,
    });
  }

  subscriptions.sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name));
  return {
    monthlyTotal: Math.round(subscriptions.reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
    subscriptions,
  };
}

function looksMonthly(charges: Transaction[]) {
  if (charges.length < 2) return false;
  const amounts = charges.map((item) => Number(item.amount));
  const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  const stableAmount = amounts.every((amount) => Math.abs(amount - average) <= Math.max(1, average * 0.05));
  if (!stableAmount) return false;
  return charges.slice(1).some((charge, index) => {
    const previous = new Date(`${charges[index].transaction_date.slice(0, 10)}T00:00:00`);
    const current = new Date(`${charge.transaction_date.slice(0, 10)}T00:00:00`);
    const days = Math.round((current.getTime() - previous.getTime()) / 86_400_000);
    return days >= 21 && days <= 40;
  });
}
