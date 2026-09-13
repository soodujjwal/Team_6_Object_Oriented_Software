import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { Transaction, TransactionType } from "./types";

export const TRANSACTIONS_UPDATED_EVENT = "pfm:transactions-updated";

export type TransactionPayload = {
  account_id: number;
  amount: string;
  category: string;
  transaction_type: TransactionType;
  transaction_date: string;
  note?: string;
};

export function getTransactions() {
  return apiGet<Transaction[]>("/transactions");
}

export function createTransaction(payload: TransactionPayload) {
  return apiPost<Transaction>("/transactions", payload).then((transaction) => {
    window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT));
    return transaction;
  });
}

export function updateTransaction(transactionId: number, payload: Partial<TransactionPayload>) {
  return apiPatch<Transaction>(`/transactions/${transactionId}`, payload).then((transaction) => {
    window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT));
    return transaction;
  });
}

export function deleteTransaction(transactionId: number) {
  return apiDelete(`/transactions/${transactionId}`).then(() => {
    window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT));
  });
}
