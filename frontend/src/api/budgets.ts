import { apiGet } from "./client";
import type { Budget } from "./types";

export function getBudgets() {
  return apiGet<Budget[]>("/budgets");
}

