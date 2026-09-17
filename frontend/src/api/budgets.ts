import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { Budget } from "./types";

export const BUDGETS_UPDATED_EVENT = "pfm:budgets-updated";

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
  return apiPost<Budget>("/budgets", payload).then((budget) => {
    window.dispatchEvent(new Event(BUDGETS_UPDATED_EVENT));
    return budget;
  });
}

export function updateBudget(budgetId: number, payload: Partial<BudgetPayload>) {
  return apiPatch<Budget>(`/budgets/${budgetId}`, payload).then((budget) => {
    window.dispatchEvent(new Event(BUDGETS_UPDATED_EVENT));
    return budget;
  });
}

export function deleteBudget(budgetId: number) {
  return apiDelete(`/budgets/${budgetId}`).then(() => {
    window.dispatchEvent(new Event(BUDGETS_UPDATED_EVENT));
  });
}
