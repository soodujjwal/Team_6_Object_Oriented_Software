import { useEffect, useState } from "react";
import { getSavingsGoals, type SavingsGoal } from "../api/savingsGoals";
import { ProgressBar } from "../components/ProgressBar";
import { TopBar } from "../components/TopBar";
import { Button, GlassCard } from "../components/ui";
import { formatCurrency } from "../utils/format";

export function SavingsGoalsPage() {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getSavingsGoals().then(setGoals).catch(() => setError("Start the backend server to load goals."));
  }, []);

  return (
    <section className="page">
      <TopBar title="Savings Goals" />
      {error && <p className="notice">{error}</p>}
      <div className="section-stack">
        {goals.length > 0 ? (
          goals.map((goal) => (
            <GlassCard className="progress-row" key={goal.id}>
              <div>
                <h2>{goal.name}</h2>
                <span>
                  {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
                </span>
              </div>
              <ProgressBar value={Number(goal.progress_percent ?? 0)} />
              <b>{Math.round(Number(goal.progress_percent ?? 0))}%</b>
            </GlassCard>
          ))
        ) : (
          <p className="empty-state">No savings goals yet.</p>
        )}
      </div>
      <Button variant="secondary">Add Goal</Button>
    </section>
  );
}
