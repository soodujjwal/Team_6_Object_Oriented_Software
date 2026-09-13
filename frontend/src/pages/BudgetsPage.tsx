import { useCallback, useEffect, useState } from "react";
import { ChevronDown, DollarSign } from "lucide-react";
import {
  createBudget,
  deleteBudget,
  getBudgets,
  updateBudget,
  type BudgetPayload,
} from "../api/budgets";
import type { Budget } from "../api/types";
import { ProgressBar } from "../components/ProgressBar";
import { TopBar } from "../components/TopBar";
import { Button, GlassCard, TextField } from "../components/ui";
import { getCategoriesForType } from "../domain/transactionCategories";
import { formatCurrency } from "../utils/format";

const now = new Date();
const defaultBudget: BudgetPayload = {
  category: getCategoriesForType("expense")[0].label,
  monthly_limit: "",
  month: now.getMonth() + 1,
  year: now.getFullYear(),
};

export function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [form, setForm] = useState<BudgetPayload>(defaultBudget);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const loadBudgets = useCallback(async () => {
    setLoading(true);
    try {
      setBudgets(await getBudgets());
      setStatus("");
    } catch {
      setStatus("Could not load budgets. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBudgets();
  }, [loadBudgets]);

  function resetForm() {
    setForm({ ...defaultBudget });
    setEditingId(null);
    setShowForm(false);
  }

  function beginEdit(budget: Budget) {
    setForm({
      category: budget.category,
      monthly_limit: budget.monthly_limit,
      month: budget.month,
      year: budget.year,
    });
    setEditingId(budget.id);
    setShowForm(true);
    setStatus("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (editingId === null) await createBudget(form);
      else await updateBudget(editingId, form);
      resetForm();
      await loadBudgets();
    } catch {
      setStatus("Could not save the budget. Check the entered values.");
    }
  }

  async function handleDelete(budget: Budget) {
    if (!window.confirm(`Delete the ${budget.category} budget?`)) return;
    try {
      await deleteBudget(budget.id);
      await loadBudgets();
    } catch {
      setStatus("Could not delete the budget.");
    }
  }

  return (
    <section className="page">
      <TopBar title="Budgets" />
      {status && <p className="notice">{status}</p>}

      <div className="section-heading">
        <div>
          <h2>Monthly Budgets</h2>
          <p className="section-label">Set spending limits by category and month.</p>
        </div>
        <Button variant="secondary" onClick={() => showForm ? resetForm() : setShowForm(true)}>
          {showForm ? "Cancel" : "Add Budget"}
        </Button>
      </div>

      {showForm && (
        <GlassCard>
          <h2>{editingId === null ? "Create Budget" : "Edit Budget"}</h2>
          <form className="form-stack management-form" onSubmit={handleSubmit}>
            <label className="ui-field">
              <span>Category</span>
              <div className="ui-field-control">
                <span />
                <select onChange={(event) => setForm({ ...form, category: event.target.value })} value={form.category}>
                  {getCategoriesForType("expense").map((category) => (
                    <option key={category.id} value={category.label}>{category.label}</option>
                  ))}
                </select>
                <ChevronDown size={18} />
              </div>
            </label>
            <TextField
              icon={<DollarSign size={18} />}
              label="Monthly Limit"
              min="0"
              onChange={(event) => setForm({ ...form, monthly_limit: event.target.value })}
              required
              step="0.01"
              type="number"
              value={form.monthly_limit}
            />
            <div className="filter-grid">
              <label className="ui-field">
                <span>Month</span>
                <div className="ui-field-control">
                  <span />
                  <select onChange={(event) => setForm({ ...form, month: Number(event.target.value) })} value={form.month}>
                    {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                  </select>
                  <ChevronDown size={18} />
                </div>
              </label>
              <TextField
                label="Year"
                max="2100"
                min="2000"
                onChange={(event) => setForm({ ...form, year: Number(event.target.value) })}
                required
                type="number"
                value={form.year}
              />
            </div>
            <Button type="submit">{editingId === null ? "Create Budget" : "Save Changes"}</Button>
          </form>
        </GlassCard>
      )}

      <div className="section-stack">
        {loading ? (
          <p className="empty-state">Loading budgets...</p>
        ) : budgets.length > 0 ? (
          budgets.map((budget) => {
            const usage = Number(budget.usage_percent ?? 0);
            const remaining = Number(budget.remaining_amount ?? 0);
            return (
              <GlassCard className="progress-row management-card" key={budget.id}>
                <div className="management-summary">
                  <span>{MONTHS[budget.month - 1]} {budget.year}</span>
                  <h2>{budget.category}</h2>
                  <span>{formatCurrency(budget.used_amount)} spent of {formatCurrency(budget.monthly_limit)}</span>
                  <small className={remaining < 0 ? "negative" : "positive"}>
                    {remaining < 0
                      ? `${formatCurrency(Math.abs(remaining))} over budget`
                      : `${formatCurrency(remaining)} remaining`}
                  </small>
                </div>
                <ProgressBar value={Math.max(0, Math.min(usage, 100))} />
                <b>{Math.round(usage)}%</b>
                <div className="row-actions">
                  <Button variant="secondary" onClick={() => beginEdit(budget)}>Edit</Button>
                  <Button variant="danger" onClick={() => void handleDelete(budget)}>Delete</Button>
                </div>
              </GlassCard>
            );
          })
        ) : (
          <p className="empty-state">No budgets yet. Add a category limit to get started.</p>
        )}
      </div>
    </section>
  );
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
