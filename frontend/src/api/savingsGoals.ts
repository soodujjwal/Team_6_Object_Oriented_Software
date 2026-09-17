import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

export const SAVINGS_GOALS_UPDATED_EVENT = "pfm:savings-goals-updated";

export type SavingsGoal = {
  id: number;
  name: string;
  target_amount: string;
  current_amount: string;
  target_date: string | null;
  monthly_income: string;
  remaining_amount: string | null;
  progress_percent: string | null;
};

export type SavingsGoalPayload = {
  name: string;
  target_amount: string;
  current_amount: string;
  target_date: string | null;
  monthly_income: string;
};

export function getSavingsGoals() {
  return apiGet<SavingsGoal[]>("/savings-goals");
}

export function createSavingsGoal(payload: SavingsGoalPayload) {
  return apiPost<SavingsGoal>("/savings-goals", payload).then((goal) => {
    window.dispatchEvent(new Event(SAVINGS_GOALS_UPDATED_EVENT));
    return goal;
  });
}

export function updateSavingsGoal(goalId: number, payload: Partial<SavingsGoalPayload>) {
  return apiPatch<SavingsGoal>(`/savings-goals/${goalId}`, payload).then((goal) => {
    window.dispatchEvent(new Event(SAVINGS_GOALS_UPDATED_EVENT));
    return goal;
  });
}

export function deleteSavingsGoal(goalId: number) {
  return apiDelete(`/savings-goals/${goalId}`).then(() => {
    window.dispatchEvent(new Event(SAVINGS_GOALS_UPDATED_EVENT));
  });
}
