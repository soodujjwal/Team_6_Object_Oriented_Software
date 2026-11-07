import { apiDelete, apiGet, apiPost, apiPut } from "./client";
import { TRANSACTIONS_UPDATED_EVENT } from "./transactions";
import type { BillDraft, calculateBill } from "../domain/splitBill";

export type Friend = { id: number; name: string };
export type FriendGroup = { id: string; name: string; friend_ids: number[] };
export const getFriendGroups = () => apiGet<FriendGroup[]>("/split-bills/groups");
export const saveFriendGroup = (name: string, friendIds: number[]) => apiPost<FriendGroup>("/split-bills/groups", { name, friend_ids: friendIds });
export type SplitBill = { id: number; data: BillDraft; calculation: ReturnType<typeof calculateBill>;
  repayments?: Record<string, { received: string; remaining: string; paid: boolean; needs_review: boolean }> };
export type RepaymentOptions = { accounts: { id: number; name: string }[];
  transactions: { id: number; note: string | null; amount: string; transaction_date: string }[] };
export const deleteSplitBill = (id: number) => apiDelete(`/split-bills/${id}`);
export const getRepaymentOptions = (id: number, personId: string) => apiGet<RepaymentOptions>(`/split-bills/${id}/repayment-options/${encodeURIComponent(personId)}`);
export const markSplitPaid = (id: number, personId: string, payload: { account_id?: number; transaction_id?: number; request_id: string }) =>
  apiPost<SplitBill>(`/split-bills/${id}/mark-paid/${encodeURIComponent(personId)}`, payload).then((bill) => {
    window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT));
    return bill;
  });
export const getSplitBills = () => apiGet<SplitBill[]>("/split-bills");
export const getFriends = () => apiGet<Friend[]>("/split-bills/friends");
export const addFriend = (name: string) => apiPost<Friend>("/split-bills/friends", { name });
export const saveSplitBill = (data: BillDraft, id?: number) => id
  ? apiPut<SplitBill>(`/split-bills/${id}`, data)
  : apiPost<SplitBill>("/split-bills", data);
