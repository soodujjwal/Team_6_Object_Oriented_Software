import { useCallback, useEffect, useMemo, useState } from "react";
import { getMonthlyReport, type MonthlyReport } from "../api/reports";
import { TRANSACTIONS_UPDATED_EVENT } from "../api/transactions";
import { IncomeExpenseDonut } from "../components/IncomeExpenseDonut";
import { TopBar } from "../components/TopBar";
import { GlassCard } from "../components/ui";
import { formatCurrency } from "../utils/format";

export function ReportsPage() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const monthlyReport = await getMonthlyReport(month, year);
      setReport(monthlyReport);
      setError("");
    } catch {
      setReport(null);
      setError("Start the backend server to load reports.");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void loadReport();
    window.addEventListener(TRANSACTIONS_UPDATED_EVENT, loadReport);
    window.addEventListener("focus", loadReport);
    return () => {
      window.removeEventListener(TRANSACTIONS_UPDATED_EVENT, loadReport);
      window.removeEventListener("focus", loadReport);
    };
  }, [loadReport]);

  const totals = useMemo(() => {
    const incomeCents = Math.round(Number(report?.total_income ?? 0) * 100);
    const expenseCents = Math.round(Number(report?.total_expenses ?? 0) * 100);
    const income = incomeCents / 100;
    const expenses = expenseCents / 100;
    return {
      income,
      expenses,
      netCashFlow: (incomeCents - expenseCents) / 100,
    };
  }, [report]);

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));

  return (
    <section className="page">
      <TopBar title="Monthly Report" />
      {error && <p className="notice">{error}</p>}
      <h2 className="month-title">{monthLabel}</h2>
      {report && (
        <>
          <GlassCard className="report-card">
            <h2>Income vs Expenses</h2>
            <IncomeExpenseDonut
              expenses={totals.expenses}
              income={totals.income}
              netCashFlow={totals.netCashFlow}
            />
          </GlassCard>
          <GlassCard className="report-card" variant="elevated">
            <h2>Net Cash Flow</h2>
            <strong>{formatCurrency(totals.netCashFlow)}</strong>
          </GlassCard>
        </>
      )}
      {loading && !report && <p className="empty-state">Loading monthly report...</p>}
    </section>
  );
}
