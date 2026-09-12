import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { Account } from "./types";

export type AccountPayload = {
  bank_name: string;
  name: string;
  starting_balance: string;
};

export function getAccounts() {
  return apiGet<Account[]>("/accounts");
}

export function createAccount(payload: AccountPayload) {
  return apiPost<Account>("/accounts", payload);
}

export function updateAccount(accountId: number, payload: Partial<AccountPayload>) {
  return apiPatch<Account>(`/accounts/${accountId}`, payload);
}

export function deleteAccount(accountId: number) {
  return apiDelete(`/accounts/${accountId}`);
}
