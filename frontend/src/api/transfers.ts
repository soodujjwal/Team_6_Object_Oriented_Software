import { apiPost } from "./client";
import { TRANSACTIONS_UPDATED_EVENT } from "./transactions";

export type Transfer = {
  id: number;
  from_account_id: number;
  to_account_id: number;
  amount: string;
  note: string | null;
  transfer_date: string;
  transaction_type: "transfer";
};

export async function moveFunds(payload: {
  from_account_id: number;
  to_account_id: number;
  amount: string;
  note?: string;
}) {
  const transfer = await apiPost<Transfer>("/transfers", payload);
  window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT));
  return transfer;
}
