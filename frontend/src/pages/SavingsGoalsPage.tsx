import { useCallback, useEffect, useState } from "react";
import { DollarSign, Target } from "lucide-react";
import {
  createSavingsGoal,
  deleteSavingsGoal,
  getSavingsGoals,
  updateSavingsGoal,
  type SavingsGoal,
  type SavingsGoalPayload,
} from "../api/savingsGoals";
import { ProgressBar } from "../components/ProgressBar";
import { TopBar } from "../components/TopBar";
import { Button, GlassCard, TextField } from "../components/ui";
import { formatCurrency, formatDate } from "../utils/format";

const emptyGoal: SavingsGoalPayload = {
  name: "",
  target_amount: "",
  current_amount: "0",
  target_date: null,
};

export function SavingsGoalsPage() {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [form, setForm] = useState<SavingsGoalPayload>(emptyGoal);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    try {
      setGoals(await getSavingsGoals());
      setStatus("");
    } catch {
      setStatus("Could not load savings goals. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  function resetForm() {
    setForm({ ...emptyGoal });
    setEditingId(null);
    setShowForm(false);
  }

  function beginEdit(goal: SavingsGoal) {
    setForm({
      name: goal.name,
      target_amount: goal.target_amount,
      current_amount: goal.current_amount,
      target_date: goal.target_date,
    });
    setEditingId(goal.id);
    setShowForm(true);
    setStatus("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (editingId === null) await createSavingsGoal(form);
      else await updateSavingsGoal(editingId, form);
      resetForm();
      await loadGoals();
    } catch {
      setStatus("Could not save the goal. Check the entered values.");
    }
  }

  async function handleDelete(goal: SavingsGoal) {
    if (!window.confirm(`Delete the ${goal.name} savings goal?`)) return;
    try {
      await deleteSavingsGoal(goal.id);
      await loadGoals();
    } catch {
      setStatus("Could not delete the savings goal.");
    }
  }

  return (
    <section className="page">
      <TopBar title="Savings Goals" />
      {status && <p className="notice">{status}</p>}

      <div className="section-heading">
        <div>
          <h2>Your Goals</h2>
          <p className="section-label">Track progress and calculate how much to save each day.</p>
        </div>
        <Button variant="secondary" onClick={() => showForm ? resetForm() : setShowForm(true)}>
          {showForm ? "Cancel" : "Add Goal"}
        </Button>
      </div>

      {showForm && (
        <GlassCard>
          <h2>{editingId === null ? "Create Savings Goal" : "Edit Savings Goal"}</h2>
          <form className="form-stack management-form" onSubmit={handleSubmit}>
            <TextField
              icon={<Target size={18} />}
              label="Goal Name"
              maxLength={100}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Emergency fund"
              required
              value={form.name}
            />
            <div className="filter-grid">
              <TextField
                icon={<DollarSign size={18} />}
                label="Target Amount"
                min="0"
                onChange={(event) => setForm({ ...form, target_amount: event.target.value })}
                required
                step="0.01"
                type="number"
                value={form.target_amount}
              />
              <TextField
                icon={<DollarSign size={18} />}
                label="Already Saved"
                min="0"
                onChange={(event) => setForm({ ...form, current_amount: event.target.value })}
                required
                step="0.01"
                type="number"
                value={form.current_amount}
              />
            </div>
            <TextField
              label="Target Date (optional)"
              min={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setForm({ ...form, target_date: event.target.value || null })}
              type="date"
              value={form.target_date ?? ""}
            />
            <Button type="submit">{editingId === null ? "Create Goal" : "Save Changes"}</Button>
          </form>
        </GlassCard>
      )}

      <div className="section-stack">
        {loading ? (
          <p className="empty-state">Loading savings goals...</p>
        ) : goals.length > 0 ? (
          goals.map((goal) => (
            <GlassCard className="progress-row management-card" key={goal.id}>
              <div className="management-summary">
                <span>{goal.target_date ? `Target: ${formatDate(goal.target_date)}` : "No target date"}</span>
                <h2>{goal.name}</h2>
                <span>{formatCurrency(goal.current_amount)} saved of {formatCurrency(goal.target_amount)}</span>
                <small>{formatCurrency(goal.remaining_amount)} remaining</small>
              </div>
              <ProgressBar value={Number(goal.progress_percent ?? 0)} />
              <b>{Math.round(Number(goal.progress_percent ?? 0))}%</b>
              <DailySavingsMessage goal={goal} />
              <div className="row-actions">
                <Button variant="secondary" onClick={() => beginEdit(goal)}>Edit</Button>
                <Button variant="danger" onClick={() => void handleDelete(goal)}>Delete</Button>
              </div>
            </GlassCard>
          ))
        ) : (
          <p className="empty-state">No savings goals yet. Add one to start tracking progress.</p>
        )}
      </div>
    </section>
  );
}

function DailySavingsMessage({ goal }: { goal: SavingsGoal }) {
  if (Number(goal.remaining_amount ?? 0) === 0) {
    return <p className="goal-guidance positive">Goal reached!</p>;
  }
  if (!goal.target_date) {
    return <p className="goal-guidance">Add a target date to calculate a daily savings amount.</p>;
  }
  if (goal.daily_savings_amount === null) {
    return <p className="goal-guidance negative">The target date has passed. Choose a new date.</p>;
  }
  return (
    <p className="goal-guidance">
      Save <strong>{formatCurrency(goal.daily_savings_amount)}</strong> per day to reach this goal on time.
    </p>
  );
}
