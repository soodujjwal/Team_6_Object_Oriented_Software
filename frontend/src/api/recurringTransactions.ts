import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

export const RECURRING_TRANSACTIONS_UPDATED_EVENT = "pfm:recurring-transactions-updated";

export type RecurringTransaction = {
  id: number;
  name: string;
  account_id: number;
  amount: string;
  category: string;
  transaction_type: "income" | "expense";
  frequency: "weekly" | "monthly";
  next_due_date: string;
  note: string | null;
  auto_pay_status: boolean;
  reminder_settings: number[] | null;
  last_paid_date: string | null;
  last_matched_transaction_id: number | null;
};

export type RecurringTransactionPayload = {
  name: string;
  account_id: number;
  amount: string;
  category: string;
  transaction_type: "income" | "expense";
  frequency: "weekly" | "monthly";
  next_due_date: string;
  note?: string | null;
  auto_pay_status: boolean;
  reminder_settings: number[];
};

export function getRecurringTransactions() {
  return apiGet<RecurringTransaction[]>("/recurring-transactions");
}

export function createRecurringTransaction(payload: RecurringTransactionPayload) {
  return apiPost<RecurringTransaction>("/recurring-transactions", payload).then((item) => {
    window.dispatchEvent(new Event(RECURRING_TRANSACTIONS_UPDATED_EVENT));
    return item;
  });
}

export function updateRecurringTransaction(id: number, payload: Partial<RecurringTransactionPayload>) {
  return apiPatch<RecurringTransaction>(`/recurring-transactions/${id}`, payload).then((item) => {
    window.dispatchEvent(new Event(RECURRING_TRANSACTIONS_UPDATED_EVENT));
    return item;
  });
}

export function deleteRecurringTransaction(id: number) {
  return apiDelete(`/recurring-transactions/${id}`).then(() => {
    window.dispatchEvent(new Event(RECURRING_TRANSACTIONS_UPDATED_EVENT));
  });
}
