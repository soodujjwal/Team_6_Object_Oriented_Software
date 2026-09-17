import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, PiggyBank, Plus, Target, WalletCards } from "lucide-react";
import { createSavingsGoal, deleteSavingsGoal, getSavingsGoals, SAVINGS_GOALS_UPDATED_EVENT, type SavingsGoal } from "../api/savingsGoals";
import { getTransactions, TRANSACTIONS_UPDATED_EVENT } from "../api/transactions";
import type { Transaction } from "../api/types";
import { ProgressBar } from "../components/ProgressBar";
import { TopBar } from "../components/TopBar";
import { Button, DatePicker, GlassCard, Modal, TextField } from "../components/ui";
import { formatCurrency } from "../utils/format";

type GoalDraft = {
  current_amount: string;
  monthly_income: string;
  name: string;
  target_amount: string;
  target_date: string;
};

type MonthPlan = {
  actual: number;
  completed: boolean;
  key: string;
  remainingAfterMonth: number;
  target: number;
};

type GoalPlan = {
  actualSaved: number;
  monthRows: MonthPlan[];
  monthlyTarget: number;
  monthsRemaining: number;
  progressPercent: number;
  projectedCompletion: string;
  remaining: number;
  totalSaved: number;
};

const COMPLETED_KEY = "pfm_savings_goal_completed_months";
const SAVINGS_CATEGORIES = new Set(["Savings Contribution", "Emergency Fund", "Investments", "Retirement"]);

const emptyDraft: GoalDraft = {
  current_amount: "0.00",
  monthly_income: "",
  name: "",
  target_amount: "",
  target_date: new Date(new Date().getFullYear(), new Date().getMonth() + 6, 1).toISOString().slice(0, 10),
};

export function SavingsGoalsPage() {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [completedMonths, setCompletedMonths] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(COMPLETED_KEY) ?? "{}") as Record<string, boolean>; } catch { return {}; }
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<GoalDraft>(emptyDraft);
  const [deleteGoal, setDeleteGoal] = useState<SavingsGoal | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
    window.addEventListener(TRANSACTIONS_UPDATED_EVENT, loadData);
    window.addEventListener(SAVINGS_GOALS_UPDATED_EVENT, loadData);
    return () => {
      window.removeEventListener(TRANSACTIONS_UPDATED_EVENT, loadData);
      window.removeEventListener(SAVINGS_GOALS_UPDATED_EVENT, loadData);
    };
  }, []);

  const plans = useMemo(() => new Map(goals.map((goal) => [goal.id, buildGoalPlan(goal, transactions, completedMonths)])), [completedMonths, goals, transactions]);

  function loadData() {
    Promise.all([getSavingsGoals(), getTransactions()])
      .then(([goalData, transactionData]) => {
        setGoals(goalData);
        setTransactions(transactionData);
        setError("");
      })
      .catch(() => setError("Start the backend server to load savings goals."));
  }

  function setCompleted(goalId: number, monthKey: string, checked: boolean) {
    const key = `${goalId}:${monthKey}`;
    setCompletedMonths((current) => {
      const next = { ...current, [key]: checked };
      localStorage.setItem(COMPLETED_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function handleCreateGoal(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim() || Number(draft.target_amount) <= 0 || !draft.target_date) {
      setError("Enter a goal name, target amount, and deadline.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createSavingsGoal({
        current_amount: Number(draft.current_amount || 0).toFixed(2),
        monthly_income: Number(draft.monthly_income || 0).toFixed(2),
        name: draft.name.trim(),
        target_amount: Number(draft.target_amount).toFixed(2),
        target_date: draft.target_date,
      });
      setDraft(emptyDraft);
      setModalOpen(false);
      await loadData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "The savings goal could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGoal() {
    if (!deleteGoal) return;
    setSaving(true);
    setError("");
    try {
      await deleteSavingsGoal(deleteGoal.id);
      setDeleteGoal(null);
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The savings goal could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page savings-goals-page">
      <TopBar title="Savings Goals" />
      {error && <p className="notice">{error}</p>}

      <div className="savings-page-heading">
        <div>
          <h2>Smart Savings Goals</h2>
          <p>Track monthly targets, real contributions, and carryover automatically.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus aria-hidden="true" size={18} /> Add Goal
        </Button>
      </div>

      <div className="savings-goal-list">
        {goals.length ? goals.map((goal) => {
          const plan = plans.get(goal.id) ?? buildGoalPlan(goal, transactions, completedMonths);
          return (
            <GlassCard className="smart-goal-card" key={goal.id}>
              <div className="smart-goal-header">
                <div className="smart-goal-title">
                  <span className="smart-goal-icon"><Target aria-hidden="true" size={20} /></span>
                  <div>
                    <h2>{goal.name}</h2>
                    <p>Deadline: {goal.target_date ? formatMonthDayYear(goal.target_date) : "No deadline"}</p>
                  </div>
                </div>
                <div className="smart-goal-progress">
                  <strong>{Math.round(plan.progressPercent)}%</strong>
                  <span>Progress</span>
                </div>
              </div>

              <ProgressBar value={plan.progressPercent} />

              <div className="smart-goal-summary">
                <SummaryTile label="Total saved" tone="positive" value={formatCurrency(plan.totalSaved)} />
                <SummaryTile label="Remaining" tone={plan.remaining > 0 ? "negative" : "positive"} value={formatCurrency(plan.remaining)} />
                <SummaryTile label="Monthly target" value={formatCurrency(plan.monthlyTarget)} />
                <SummaryTile label="Months remaining" value={`${plan.monthsRemaining}`} />
                <SummaryTile label="Monthly income" value={formatCurrency(goal.monthly_income)} />
                <SummaryTile label="Projected completion" value={plan.projectedCompletion} />
              </div>

              <div className="monthly-savings-plan">
                <div className="monthly-savings-heading">
                  <h3>Monthly Plan</h3>
                  <span>Under-saving carries forward. Extra savings lowers the next target.</span>
                </div>
                <div className="monthly-savings-table">
                  <div className="monthly-savings-row header">
                    <span>Month</span>
                    <span>Target</span>
                    <span>Actual</span>
                    <span>Completed</span>
                    <span>Remaining</span>
                  </div>
                  {plan.monthRows.map((row) => (
                    <div className="monthly-savings-row" key={row.key}>
                      <strong>{formatMonth(row.key)}</strong>
                      <span>{formatCurrency(row.target)}</span>
                      <span>{formatCurrency(row.actual)}</span>
                      <label>
                        <input
                          checked={row.completed}
                          onChange={(event) => setCompleted(goal.id, row.key, event.target.checked)}
                          type="checkbox"
                        />
                        <span>{row.completed ? "Done" : "Open"}</span>
                      </label>
                      <span>{formatCurrency(row.remainingAfterMonth)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="smart-goal-actions">
                <Button onClick={() => setDeleteGoal(goal)} variant="danger">
                  Delete Goal
                </Button>
              </div>
            </GlassCard>
          );
        }) : (
          <GlassCard className="budget-empty-state">
            <span className="budget-empty-icon"><PiggyBank aria-hidden="true" size={22} /></span>
            <h3>No savings goals yet</h3>
            <p>Create a goal to see monthly targets, carryover, and projected completion.</p>
            <Button onClick={() => setModalOpen(true)}>
              <Plus aria-hidden="true" size={18} /> Add Goal
            </Button>
          </GlassCard>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => !saving && setModalOpen(false)} title="Create Savings Goal">
        <form className="savings-goal-form" onSubmit={handleCreateGoal}>
          <TextField icon={<Target aria-hidden="true" size={18} />} label="Goal name" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Emergency Fund" required value={draft.name} />
          <TextField icon={<span>$</span>} label="Target amount" min="0" onChange={(event) => setDraft((current) => ({ ...current, target_amount: event.target.value }))} placeholder="5000.00" required step="0.01" type="number" value={draft.target_amount} />
          <TextField icon={<WalletCards aria-hidden="true" size={18} />} label="Current amount saved" min="0" onChange={(event) => setDraft((current) => ({ ...current, current_amount: event.target.value }))} placeholder="0.00" required step="0.01" type="number" value={draft.current_amount} />
          <DatePicker label="Deadline" onChange={(date) => setDraft((current) => ({ ...current, target_date: date }))} value={draft.target_date} />
          <TextField icon={<span>$</span>} label="Monthly income" min="0" onChange={(event) => setDraft((current) => ({ ...current, monthly_income: event.target.value }))} placeholder="4000.00" required step="0.01" type="number" value={draft.monthly_income} />
          <p className="budget-data-footnote"><CalendarDays size={15} /> Monthly target is calculated as target remaining divided by months remaining. Recorded savings transactions update actual saved automatically.</p>
          <div className="budget-modal-actions">
            <Button disabled={saving} onClick={() => setModalOpen(false)} type="button" variant="secondary">Cancel</Button>
            <Button disabled={saving} type="submit">{saving ? "Creating..." : "Create Goal"}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(deleteGoal)} onClose={() => !saving && setDeleteGoal(null)} title="Delete Goal">
        {deleteGoal && (
          <div className="budget-delete-confirm">
            <p>Delete <strong>{deleteGoal.name}</strong>? This removes the goal and its saved plan settings. Your transactions will not be deleted.</p>
            <div className="budget-modal-actions">
              <Button disabled={saving} onClick={() => setDeleteGoal(null)} variant="secondary">Cancel</Button>
              <Button disabled={saving} onClick={() => void handleDeleteGoal()} variant="danger">
                {saving ? "Deleting..." : "Delete Goal"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

function SummaryTile({ label, tone, value }: { label: string; tone?: "positive" | "negative"; value: string }) {
  return (
    <GlassCard className={`smart-goal-summary-tile ${tone ?? ""}`.trim()} variant="subtle">
      <span>{label}</span>
      <strong>{value}</strong>
    </GlassCard>
  );
}

function buildGoalPlan(goal: SavingsGoal, transactions: Transaction[], completedMonths: Record<string, boolean>): GoalPlan {
  const today = new Date();
  const deadline = goal.target_date ? parseLocalDate(goal.target_date) : new Date(today.getFullYear(), today.getMonth(), 1);
  const monthKeys = getMonthKeys(today, deadline);
  const matchingTransactions = transactions.filter((transaction) => isSavingsContribution(transaction, goal));
  const actualSaved = matchingTransactions.reduce((total, transaction) => total + Number(transaction.amount), 0);
  const totalSaved = Number(goal.current_amount) + actualSaved;
  const remaining = Math.max(Number(goal.target_amount) - totalSaved, 0);
  const monthsRemaining = Math.max(monthKeys.length, 1);
  const monthlyTarget = remaining / monthsRemaining;
  const actualByMonth = new Map<string, number>();
  matchingTransactions.forEach((transaction) => {
    const key = transaction.transaction_date.slice(0, 7);
    actualByMonth.set(key, (actualByMonth.get(key) ?? 0) + Number(transaction.amount));
  });

  let carryover = 0;
  let runningRemaining = remaining;
  const monthRows = monthKeys.map((key) => {
    const target = Math.max(monthlyTarget + carryover, 0);
    const actual = actualByMonth.get(key) ?? 0;
    runningRemaining = Math.max(runningRemaining - actual, 0);
    carryover = target - actual;
    return {
      actual,
      completed: Boolean(completedMonths[`${goal.id}:${key}`]) || actual >= target && target > 0,
      key,
      remainingAfterMonth: runningRemaining,
      target,
    };
  });

  const progressPercent = Number(goal.target_amount) > 0 ? Math.min(totalSaved / Number(goal.target_amount) * 100, 100) : 100;
  const averageActual = getAverageMonthlySavings(actualByMonth);
  const projectedMonthly = Math.max(averageActual, monthlyTarget);
  const projectedCompletion = remaining <= 0 ? "Completed" : projectedMonthly > 0 ? formatMonth(addMonths(today, Math.ceil(remaining / projectedMonthly) - 1)) : "Not enough data";

  return {
    actualSaved,
    monthRows,
    monthlyTarget,
    monthsRemaining,
    progressPercent,
    projectedCompletion,
    remaining,
    totalSaved,
  };
}

function isSavingsContribution(transaction: Transaction, goal: SavingsGoal) {
  if (transaction.transaction_type !== "expense") return false;
  const note = (transaction.note ?? "").toLowerCase();
  const goalName = goal.name.toLowerCase();
  if (note.includes(goalName)) return true;
  return SAVINGS_CATEGORIES.has(transaction.category);
}

function getMonthKeys(start: Date, end: Date) {
  const first = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  const keys: string[] = [];
  const cursor = new Date(first);
  while (cursor <= last) {
    keys.push(cursor.toISOString().slice(0, 7));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys.length ? keys : [first.toISOString().slice(0, 7)];
}

function getAverageMonthlySavings(actualByMonth: Map<string, number>) {
  const positiveMonths = [...actualByMonth.values()].filter((amount) => amount > 0);
  return positiveMonths.length ? positiveMonths.reduce((sum, amount) => sum + amount, 0) / positiveMonths.length : 0;
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day || 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + Math.max(months, 0), 1).toISOString().slice(0, 7);
}

function formatMonth(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function formatMonthDayYear(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parseLocalDate(value));
}
