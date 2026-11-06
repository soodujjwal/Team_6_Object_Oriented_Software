import { apiGet, apiPatch } from "./client";
export type TrackingMode = "manual" | "plaid";
export type TrackingState = { mode: TrackingMode | "mixed" | null; manual_accounts: number; connected_accounts: number; can_switch: boolean };
export const TRACKING_MODE_UPDATED = "pfm:tracking-mode-updated";
export const getTrackingMode = () => apiGet<TrackingState>("/accounts/tracking-mode");
export async function chooseTrackingMode(mode: TrackingMode) {
  const state = await apiPatch<TrackingState>("/accounts/tracking-mode", { mode });
  window.dispatchEvent(new Event(TRACKING_MODE_UPDATED));
  return state;
}
