import { useEffect, useState } from "react";
import { getBudgets } from "../api/budgets";
import type { Budget } from "../api/types";
import { ProgressBar } from "../components/ProgressBar";
import { TopBar } from "../components/TopBar";
import { GlassCard } from "../components/ui";
import { formatCurrency } from "../utils/format";

export function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getBudgets().then(setBudgets).catch(() => setError("Start the backend server to load budgets."));
  }, []);

  return (
    <section className="page">
      <TopBar title="Budgets" />
      {error && <p className="notice">{error}</p>}
      <div className="section-stack">
        {budgets.length > 0 ? (
          budgets.map((budget) => (
            <GlassCard className="progress-row" key={budget.id}>
              <div>
                <h2>{budget.category}</h2>
                <span>
                  {formatCurrency(budget.used_amount)} / {formatCurrency(budget.monthly_limit)}
                </span>
              </div>
              <ProgressBar value={Number(budget.usage_percent ?? 0)} />
              <b>{Math.round(Number(budget.usage_percent ?? 0))}%</b>
            </GlassCard>
          ))
        ) : (
          <p className="empty-state">No budgets yet.</p>
        )}
      </div>
    </section>
  );
}
