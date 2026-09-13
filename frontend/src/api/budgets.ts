import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { Budget } from "./types";

export type BudgetPayload = {
  category: string;
  monthly_limit: string;
  month: number;
  year: number;
};

export function getBudgets() {
  return apiGet<Budget[]>("/budgets");
}

export function createBudget(payload: BudgetPayload) {
  return apiPost<Budget>("/budgets", payload);
}

export function updateBudget(budgetId: number, payload: Partial<BudgetPayload>) {
  return apiPatch<Budget>(`/budgets/${budgetId}`, payload);
}

export function deleteBudget(budgetId: number) {
  return apiDelete(`/budgets/${budgetId}`);
}
