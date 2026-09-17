import { apiGet, apiPost, apiPut } from "./client";
import { TRANSACTIONS_UPDATED_EVENT } from "./transactions";
import type { BillDraft, calculateBill } from "../domain/splitBill";

export type Friend = { id: number; name: string };
export type SplitBill = { id: number; data: BillDraft; paid: boolean; repayments: Record<string, { amount: string; transaction_id: number }>; calculation: ReturnType<typeof calculateBill> };
export const getSplitBills = () => apiGet<SplitBill[]>("/split-bills");
export const getFriends = () => apiGet<Friend[]>("/split-bills/friends");
export const addFriend = (name: string) => apiPost<Friend>("/split-bills/friends", { name });
const refresh = (bill: SplitBill) => { window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT)); return bill; };
export const saveSplitBill = (data: BillDraft, id?: number) => (id
  ? apiPut<SplitBill>(`/split-bills/${id}`, data)
  : apiPost<SplitBill>("/split-bills", data)).then(refresh);
export const paySplitBill = (id: number) => apiPost<SplitBill>(`/split-bills/${id}/pay`, {}).then(refresh);
export const recordRepayment = (id: number, person: string, received: boolean, amount?: string) =>
  apiPut<SplitBill>(`/split-bills/${id}/repayments/${encodeURIComponent(person)}`, { received, ...(amount ? { amount } : {}) }).then(refresh);
