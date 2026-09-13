import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

export type SavingsGoal = {
  id: number;
  name: string;
  target_amount: string;
  current_amount: string;
  target_date: string | null;
  remaining_amount: string | null;
  progress_percent: string | null;
  daily_savings_amount: string | null;
};

export type SavingsGoalPayload = {
  name: string;
  target_amount: string;
  current_amount: string;
  target_date: string | null;
};

export function getSavingsGoals() {
  return apiGet<SavingsGoal[]>("/savings-goals");
}

export function createSavingsGoal(payload: SavingsGoalPayload) {
  return apiPost<SavingsGoal>("/savings-goals", payload);
}

export function updateSavingsGoal(goalId: number, payload: Partial<SavingsGoalPayload>) {
  return apiPatch<SavingsGoal>(`/savings-goals/${goalId}`, payload);
}

export function deleteSavingsGoal(goalId: number) {
  return apiDelete(`/savings-goals/${goalId}`);
}
