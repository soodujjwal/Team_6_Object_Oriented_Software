import { apiGet } from "./client";

export type SavingsGoal = {
  id: number;
  name: string;
  target_amount: string;
  current_amount: string;
  target_date: string | null;
  remaining_amount: string | null;
  progress_percent: string | null;
};

export function getSavingsGoals() {
  return apiGet<SavingsGoal[]>("/savings-goals");
}

