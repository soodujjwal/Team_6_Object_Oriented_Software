import { apiDelete, apiGet, apiPost, apiPut } from "./client";
import type { Transaction } from "./types";
import { TRANSACTIONS_UPDATED_EVENT } from "./transactions";
import type { BillDraft, calculateBill } from "../domain/splitBill";

export type Friend = { id: number; name: string };
export type Repayment = { id: string; amount: string; transaction_id: number; payment_date: string | null; needs_review?: boolean };
export type SplitBill = { id: number; data: BillDraft; paid: boolean; payment_transaction_id?: number; needs_review?: boolean; repayments: Record<string, { amount: string; transaction_id: number; payments?: Repayment[] }>; calculation: ReturnType<typeof calculateBill> };
export const getSplitBills = () => apiGet<SplitBill[]>("/split-bills");
export const getFriends = () => apiGet<Friend[]>("/split-bills/friends");
export const addFriend = (name: string) => apiPost<Friend>("/split-bills/friends", { name });
const refresh = (bill: SplitBill) => { window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT)); return bill; };
export const saveSplitBill = (data: BillDraft, id?: number) => (id
  ? apiPut<SplitBill>(`/split-bills/${id}`, data)
  : apiPost<SplitBill>("/split-bills", data)).then(refresh);
export const paySplitBill = (id: number, transactionId?: number) => apiPost<SplitBill>(`/split-bills/${id}/pay`, { transaction_id: transactionId }).then(refresh);
export const unlinkBillPayment = (id: number) => apiDelete(`/split-bills/${id}/payment`).then(() => { window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT)); });
export const getBillCandidates = (id: number, person?: string) => apiGet<Transaction[]>(`/split-bills/${id}/candidates${person ? `?person_id=${encodeURIComponent(person)}` : ""}`);
export const addRepayment = (id: number, person: string, payload: { amount?: string; transaction_id?: number; account_id?: number; payment_date: string; request_id: string }) =>
  apiPost<SplitBill>(`/split-bills/${id}/repayments/${encodeURIComponent(person)}`, payload).then(refresh);
export const removeRepayment = (id: number, person: string, paymentId: string) =>
  apiDelete(`/split-bills/${id}/repayments/${encodeURIComponent(person)}/${encodeURIComponent(paymentId)}`).then(() => { window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT)); });
export const recordRepayment = (id: number, person: string, received: boolean, amount?: string) =>
  apiPut<SplitBill>(`/split-bills/${id}/repayments/${encodeURIComponent(person)}`, { received, ...(amount ? { amount } : {}) }).then(refresh);
