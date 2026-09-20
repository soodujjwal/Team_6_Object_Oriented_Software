export type Transaction = {
  amount: string; category: string; transaction_type: "income" | "expense";
  transaction_date: string; note: string;
};
export type Demo = {
  name: string; starting_balance: string; current_balance: string;
  upcoming_required: string; savings_remaining: string; spendable: string;
  transactions: Transaction[];
};
export type Result = {
  purchase_amount: string; current_available: string; upcoming_required: string;
  savings_remaining: string; projected_remaining: string; can_afford: boolean; message: string;
};

export async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.detail === "string" ? error.detail : "Check the fields and try again.");
  }
  return response.json();
}

export const dollars = (value: string) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
}).format(Number(value));

export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
