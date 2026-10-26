import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { Transaction, TransactionType } from "./types";

export const TRANSACTIONS_UPDATED_EVENT = "pfm:transactions-updated";

export type TransactionPayload = {
  financial_kind?: "standard" | "reimbursement" | "transfer";
  account_id: number;
  amount: string;
  category: string;
  transaction_type: TransactionType;
  transaction_date: string;
  note?: string;
  receipt_items?: { name: string; quantity: number; price: string }[];
  receipt_metadata?: { merchant?: string; subtotal?: string; tax?: string; tip?: string; currency?: string; source?: "receipt" | "csv" | "pdf" | "plaid"; original_filename?: string };
};

export function getTransactions() {
  return apiGet<Transaction[]>("/transactions");
}

export type TransactionMatch = { manual_id: number; bank_transaction_id: number; amount: string; manual_note: string | null; bank_note: string | null; date: string; reason: string };
export const getTransactionMatches = () => apiGet<TransactionMatch[]>("/transactions/matches");
export const confirmTransactionMatch = (manualId: number, bankId: number) =>
  apiPost<Transaction>(`/transactions/${manualId}/match`, { bank_transaction_id: bankId }).then((transaction) => {
    window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT));
    return transaction;
  });

export function createTransactions(payload: TransactionPayload[]) {
  return apiPost<Transaction[]>("/transactions/bulk", { transactions: payload }).then((transactions) => {
    window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT));
    return transactions;
  });
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
