import { apiGet } from "./client";

export type MonthlyReport = {
  month: number;
  year: number;
  total_income: string;
  total_expenses: string;
  net_cash_flow: string;
  category_expenses: Record<string, string>;
};

export function getMonthlyReport(month: number, year: number) {
  return apiGet<MonthlyReport>(`/reports/monthly?month=${month}&year=${year}`);
}

