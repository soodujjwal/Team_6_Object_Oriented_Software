import { apiDelete, apiGet, apiPost } from "./client";

export type PlaidConnection = {
  id: number;
  institution_name: string;
  status: string;
  account_count: number;
  last_synced_at: string | null;
};

export type PlaidStatus = {
  configured: boolean;
  connections: PlaidConnection[];
};

export const getPlaidStatus = () => apiGet<PlaidStatus>("/plaid/status");
export const createPlaidLinkToken = () => apiPost<{ link_token: string }>("/plaid/link-token", {});
export const exchangePlaidToken = (publicToken: string, metadata: unknown) =>
  apiPost("/plaid/exchange", { public_token: publicToken, metadata });
export const syncPlaid = () => apiPost<{ added: number; modified: number; removed: number }>("/plaid/sync", {});
export const refreshPlaid = () => apiPost<{ requested: number }>("/plaid/refresh", {});
export const disconnectPlaid = (connectionId: number) => apiDelete(`/plaid/connections/${connectionId}`);
