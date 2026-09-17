import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Pencil, Plus, RotateCcw, Target, Trash2 } from "lucide-react";
import { createBudget, deleteBudget, getBudgets, updateBudget, BUDGETS_UPDATED_EVENT } from "../api/budgets";
import { TRANSACTIONS_UPDATED_EVENT, getTransactions } from "../api/transactions";
import { getRecurringTransactions, type RecurringTransaction } from "../api/recurringTransactions";
import { getSavingsGoals, type SavingsGoal } from "../api/savingsGoals";
import type { Budget, Transaction } from "../api/types";
import { ProgressBar } from "../components/ProgressBar";
import { TopBar } from "../components/TopBar";
import { Button, GlassCard, GlassSelect, IconButton, Modal, TextField } from "../components/ui";
import { getCategoriesForType } from "../domain/transactionCategories";
import {
  calculateBudgetMonth,
  DEFAULT_BUDGET_TARGETS,
  getBudgetGroup,
  getBudgetHealthLabel,
  getBudgetAlertMessage,
  loadBudgetPreferences,
  saveBudgetPreferences,
  type BudgetGroup,
  type BudgetTargets,
  type CategoryGroups,
} from "../domain/budgeting";
import { formatCurrency } from "../utils/format";

type BudgetModalState = { kind: "create" } | { kind: "edit"; budget: Budget } | { kind: "delete"; budget: Budget } | null;
type BudgetDraft = { category: string; amount: string; group: BudgetGroup };

const GROUP_OPTIONS = [
  { value: "needs", label: "Needs" },
  { value: "wants", label: "Wants" },
  { value: "savingsDebt", label: "Savings & Debt" },
];
const GROUP_LABEL: Record<BudgetGroup, string> = { needs: "Needs", wants: "Wants", savingsDebt: "Savings & Debt" };
const HEALTH_CLASS = { "on-track": "on-track", watch: "watch", almost: "almost", over: "over" } as const;

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthFromKey(value: string) {
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

function getMonthOptions() {
  const now = new Date();
  return Array.from({ length: 37 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 24 + index, 1);
    return { value: monthKey(date.getFullYear(), date.getMonth() + 1), label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date) };
  });
}

function formatMonth(month: number, year: number) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function SummaryCard({ label, value, hint, tone = "" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <GlassCard className={`budget-summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </GlassCard>
  );
}

export function BudgetsPage() {
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(monthKey(today.getFullYear(), today.getMonth() + 1));
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [optionalDataNote, setOptionalDataNote] = useState("");
  const [modal, setModal] = useState<BudgetModalState>(null);
  const [draft, setDraft] = useState<BudgetDraft>({ category: "Food & Dining", amount: "", group: "wants" });
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);
  const [targets, setTargets] = useState<BudgetTargets>(() => loadBudgetPreferences().targets);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroups>(() => loadBudgetPreferences().categoryGroups);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [targetDraft, setTargetDraft] = useState<BudgetTargets>(() => loadBudgetPreferences().targets);
  const [targetError, setTargetError] = useState("");

  const loadData = useCallback(async () => {
    const [budgetResult, transactionResult, recurringResult, goalsResult] = await Promise.allSettled([
      getBudgets(), getTransactions(), getRecurringTransactions(), getSavingsGoals(),
    ]);
    const coreErrors: string[] = [];
    if (budgetResult.status === "fulfilled") setBudgets(budgetResult.value);
    else coreErrors.push("Budgets could not be loaded.");
    if (transactionResult.status === "fulfilled") setTransactions(transactionResult.value);
    else coreErrors.push("Transactions could not be loaded.");
    if (recurringResult.status === "fulfilled") setRecurring(recurringResult.value);
    if (goalsResult.status === "fulfilled") setGoals(goalsResult.value);
    setOptionalDataNote(
      recurringResult.status === "rejected" || goalsResult.status === "rejected"
        ? "Recurring payments or savings goals are unavailable. Budget totals still use saved budgets and transactions."
        : "",
    );
    setError(coreErrors.length ? `${coreErrors.join(" ")} Check the backend connection.` : "");
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
    window.addEventListener(TRANSACTIONS_UPDATED_EVENT, loadData);
    window.addEventListener(BUDGETS_UPDATED_EVENT, loadData);
    window.addEventListener("focus", loadData);
    return () => {
      window.removeEventListener(TRANSACTIONS_UPDATED_EVENT, loadData);
      window.removeEventListener(BUDGETS_UPDATED_EVENT, loadData);
      window.removeEventListener("focus", loadData);
    };
  }, [loadData]);

  const { month, year } = monthFromKey(selectedMonth);
  const monthBudgets = useMemo(
    () => budgets.filter((budget) => budget.month === month && budget.year === year),
    [budgets, month, year],
  );
  const calculation = useMemo(
    () => calculateBudgetMonth(transactions, budgets, recurring, categoryGroups, month, year, targets),
    [transactions, budgets, recurring, categoryGroups, month, year, targets],
  );
  const categories = useMemo(() => {
    const names = new Set([
      ...getCategoriesForType("expense").map((category) => category.label),
      ...transactions.filter((transaction) => transaction.transaction_type === "expense").map((transaction) => transaction.category),
      ...budgets.map((budget) => budget.category),
    ]);
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [transactions, budgets]);
  const availableBudgetCategories = categories.filter((category) =>
    category === draft.category || !monthBudgets.some((budget) =>
      budget.category.toLocaleLowerCase() === category.toLocaleLowerCase()
      && (modal?.kind !== "edit" || budget.id !== modal.budget.id),
    ),
  );

  const insights = useMemo(() => {
    if (calculation.income <= 0) return ["Add income to see your spending plan and income-based percentages for this month."];
    const result: string[] = [];
    const needsCategories = Object.entries(calculation.categorySpent)
      .filter(([category]) => getBudgetGroup(category, categoryGroups) === "needs")
      .sort((left, right) => right[1] - left[1]);
    if (calculation.groupPercentages.needs > targets.needs) {
      const largest = needsCategories[0];
      result.push(`Needs are ${calculation.groupPercentages.needs.toFixed(1)}% of take-home income, above the ${targets.needs}% guideline${largest ? `; ${largest[0]} is the largest recorded needs category` : ""}.`);
    } else {
      result.push(`Needs are ${calculation.groupPercentages.needs.toFixed(1)}% of take-home income, within the ${targets.needs}% guideline.`);
    }
    result.push(calculation.groupPercentages.wants < targets.wants
      ? `You're spending less on wants (${calculation.groupPercentages.wants.toFixed(1)}%) than the ${targets.wants}% guideline.`
      : `Wants are ${calculation.groupPercentages.wants.toFixed(1)}% of take-home income, compared with the ${targets.wants}% guideline.`);
    result.push(calculation.groupPercentages.savingsDebt >= targets.savingsDebt
      ? `Recorded savings and debt transactions are ${calculation.groupPercentages.savingsDebt.toFixed(1)}%, at or above the ${targets.savingsDebt}% guideline.`
      : `Recorded savings and debt transactions are ${calculation.groupPercentages.savingsDebt.toFixed(1)}%, below the ${targets.savingsDebt}% guideline.`);
    return result;
  }, [calculation, categoryGroups, targets]);

  const monthOptions = useMemo(getMonthOptions, []);
  const selectedIndex = monthOptions.findIndex((option) => option.value === selectedMonth);
  const currentDate = new Date();
  const selectedIsCurrent = month === currentDate.getMonth() + 1 && year === currentDate.getFullYear();
  const alerts = calculation.categoryBudgets
    .map((budget) => ({ ...budget, message: getBudgetAlertMessage(budget.category, budget.percent) }))
    .filter((budget): budget is (typeof calculation.categoryBudgets)[number] & { message: string } => Boolean(budget.message));

  const closeModal = useCallback(() => {
    if (!saving) setModal(null);
  }, [saving]);

  function moveMonth(delta: number) {
    const next = monthOptions[Math.min(monthOptions.length - 1, Math.max(0, selectedIndex + delta))];
    if (next) setSelectedMonth(next.value);
  }

  function openCreate() {
    const firstCategory = getCategoriesForType("expense")[0]?.label ?? "Other";
    setDraft({ category: firstCategory, amount: "", group: getBudgetGroup(firstCategory, categoryGroups) });
    setModalError("");
    setModal({ kind: "create" });
  }

  function openEdit(budget: Budget) {
    setDraft({ category: budget.category, amount: budget.monthly_limit, group: getBudgetGroup(budget.category, categoryGroups) });
    setModalError("");
    setModal({ kind: "edit", budget });
  }

  async function saveBudget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(draft.amount);
    if (!draft.category || !Number.isFinite(amount) || amount <= 0) {
      setModalError("Choose a category and enter a monthly limit greater than $0.");
      return;
    }
    setSaving(true);
    setModalError("");
    const payload = { category: draft.category, monthly_limit: amount.toFixed(2), month, year };
    try {
      if (modal?.kind === "edit") await updateBudget(modal.budget.id, payload);
      else await createBudget(payload);
      const nextGroups = { ...categoryGroups, [draft.category]: draft.group };
      setCategoryGroups(nextGroups);
      saveBudgetPreferences(targets, nextGroups);
      setModal(null);
      await loadData();
    } catch (saveError) {
      setModalError(saveError instanceof Error ? saveError.message : "The budget could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (modal?.kind !== "delete") return;
    setSaving(true);
    setModalError("");
    try {
      await deleteBudget(modal.budget.id);
      setModal(null);
      await loadData();
    } catch (deleteError) {
      setModalError(deleteError instanceof Error ? deleteError.message : "The budget could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  function saveTargets(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sum = targetDraft.needs + targetDraft.wants + targetDraft.savingsDebt;
    if (Object.values(targetDraft).some((value) => !Number.isFinite(value) || value < 0 || value > 100) || Math.abs(sum - 100) > 0.01) {
      setTargetError("Use percentages from 0 to 100 that add up to 100%.");
      return;
    }
    setTargets(targetDraft);
    saveBudgetPreferences(targetDraft, categoryGroups);
    setTargetError("");
    setTargetsOpen(false);
  }

  function updateCategoryGroup(category: string, group: BudgetGroup) {
    const next = { ...categoryGroups, [category]: group };
    setCategoryGroups(next);
    saveBudgetPreferences(targets, next);
  }

  return (
    <section className="page budget-page">
      <TopBar title="Budget" />
      {error && <p className="notice" role="alert">{error}</p>}

      <div className="budget-page-heading">
        <div>
          <h2>Monthly plan</h2>
          <p>Understand what came in, what went out, and what remains.</p>
        </div>
        <div className="budget-month-control">
          <IconButton aria-label="Previous month" disabled={selectedIndex <= 0} onClick={() => moveMonth(-1)}><ChevronLeft size={19} /></IconButton>
          <GlassSelect ariaLabel="Reporting month" className="budget-month-select" icon={<CalendarDays size={18} />} onChange={setSelectedMonth} options={monthOptions} value={selectedMonth} />
          <IconButton aria-label="Next month" disabled={selectedIndex >= monthOptions.length - 1} onClick={() => moveMonth(1)}><ChevronRight size={19} /></IconButton>
          <Button onClick={openCreate}><Plus size={17} /> Create Budget</Button>
        </div>
      </div>

      <section className="budget-summary-grid" aria-label={`${formatMonth(month, year)} budget overview`}>
        <SummaryCard label="Take-home income" value={loading ? "Loading" : formatCurrency(calculation.income)} hint="Recorded income this month" tone="income" />
        <SummaryCard label="Budgeted" value={formatCurrency(calculation.budgeted)} hint={`${monthBudgets.length} category limit${monthBudgets.length === 1 ? "" : "s"}`} />
        <SummaryCard label="Spent" value={formatCurrency(calculation.spent)} hint="Recorded expenses this month" tone="expense" />
        <SummaryCard label="Remaining" value={calculation.budgeted > 0 ? formatCurrency(calculation.remaining) : "—"} hint={calculation.budgeted > 0 ? "Budgeted minus all spending" : "Create a limit to track remaining"} tone={calculation.remaining < 0 ? "negative" : ""} />
        <SummaryCard label="Savings / net" value={formatCurrency(calculation.netCashFlow)} hint="Income minus recorded expenses" tone={calculation.netCashFlow < 0 ? "negative" : "income"} />
      </section>

      <GlassCard className="budget-overview-card">
        <div className="budget-section-heading">
          <div><h2>Overall budget progress</h2><p>{formatCurrency(calculation.spent)} spent of {formatCurrency(calculation.budgeted)} planned</p></div>
          <strong>{calculation.budgeted > 0 ? `${Math.round(calculation.spent / calculation.budgeted * 100)}%` : "No limits yet"}</strong>
        </div>
        <ProgressBar label="Overall budget used" value={calculation.progress} />
        {calculation.budgeted > 0 && calculation.spent > calculation.budgeted && <p className="budget-overrun-copy">Spending is {formatCurrency(calculation.spent - calculation.budgeted)} above the total planned budget.</p>}
      </GlassCard>

      <GlassCard className="budget-comparison-card">
        <div className="budget-section-heading">
          <div>
            <h2>Budgeted vs Actual Spending</h2>
            <p>Planned category limits compared with real expense transactions for {formatMonth(month, year)}.</p>
          </div>
        </div>
        {calculation.plannedVsActualByCategory.length ? (
          <div className="budget-comparison-chart" aria-label="Budgeted versus actual spending by category">
            {calculation.plannedVsActualByCategory.map((row) => {
              const scale = Math.max(row.planned, row.actual, 1);
              return (
                <div className={`budget-comparison-row${row.unbudgeted ? " unbudgeted" : ""}`} key={row.category}>
                  <div className="budget-comparison-label">
                    <strong>{row.category}</strong>
                    <span>{row.unbudgeted ? "No planned budget" : `${formatCurrency(row.remaining)} ${row.remaining < 0 ? "over" : "remaining"}`}</span>
                  </div>
                  <div className="budget-comparison-bars">
                    <div className="budget-comparison-bar planned">
                      <span style={{ width: `${Math.max(3, row.planned / scale * 100)}%` }} />
                    </div>
                    <div className="budget-comparison-bar actual">
                      <span style={{ width: `${Math.max(row.actual > 0 ? 3 : 0, row.actual / scale * 100)}%` }} />
                    </div>
                  </div>
                  <div className="budget-comparison-values">
                    <span><i className="planned-dot" /> Budgeted {formatCurrency(row.planned)}</span>
                    <span><i className="actual-dot" /> Actual {formatCurrency(row.actual)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">Create a category budget or add expense transactions to compare planned and actual spending.</p>
        )}
      </GlassCard>

      <GlassCard className="spending-plan-card" variant="elevated">
        <div className="budget-section-heading spending-plan-heading">
          <div><h2>Spending Plan</h2><p>50/30/20 is a flexible guideline, not a rule. Adjust targets and category groups to fit your priorities.</p></div>
          <Button onClick={() => { setTargetDraft(targets); setTargetError(""); setTargetsOpen((open) => !open); }} variant="secondary">{targetsOpen ? "Close settings" : "Customize"}</Button>
        </div>
        {targetsOpen && <form className="budget-target-editor" onSubmit={saveTargets}>
          <div className="budget-target-inputs">
            <TextField label="Needs target (%)" min="0" max="100" onChange={(event) => setTargetDraft((current) => ({ ...current, needs: Number(event.target.value) }))} step="1" type="number" value={targetDraft.needs} />
            <TextField label="Wants target (%)" min="0" max="100" onChange={(event) => setTargetDraft((current) => ({ ...current, wants: Number(event.target.value) }))} step="1" type="number" value={targetDraft.wants} />
            <TextField label="Savings & Debt target (%)" min="0" max="100" onChange={(event) => setTargetDraft((current) => ({ ...current, savingsDebt: Number(event.target.value) }))} step="1" type="number" value={targetDraft.savingsDebt} />
          </div>
          {targetError && <p className="budget-form-error" role="alert">{targetError}</p>}
          <div className="budget-modal-actions"><Button onClick={() => setTargetDraft(DEFAULT_BUDGET_TARGETS)} variant="secondary"><RotateCcw size={16} /> Reset guideline</Button><Button type="submit">Save targets</Button></div>
        </form>}
        <div className="budget-plan-rows">
          {([
            ["needs", "Needs", "Essential and recurring costs"],
            ["wants", "Wants", "Discretionary spending"],
            ["savingsDebt", "Savings & Debt", "Recorded contributions and debt payments"],
          ] as [BudgetGroup, string, string][]).map(([group, label, description]) => (
            <div className="budget-plan-row" key={group}>
              <div className="budget-plan-label"><strong>{label}</strong><small>{description}</small></div>
              <ProgressBar label={`${label} progress toward spending plan target`} value={calculation.groupProgress[group]} />
              <div className="budget-plan-values"><strong>{calculation.groupPercentages[group].toFixed(1)}%</strong><small>Target {targets[group]}%</small><small>{formatCurrency(calculation.groupAmounts[group])}</small></div>
            </div>
          ))}
        </div>
        <p className="budget-data-footnote">Group totals include only recorded expense transactions. Goal balances are not counted as monthly contributions; use a Savings & Debt category for contributions you record.</p>
        {goals.length > 0 && <p className="budget-data-footnote"><Target size={15} /> {goals.length} savings goal{goals.length === 1 ? "" : "s"} available. Goal balances are shown separately and aren't treated as monthly cash flow.</p>}
        <details className="budget-category-settings">
          <summary>Review category groups</summary>
          <p>Defaults are suggestions. Dining, personal care, education, and debt payments can vary by household; change any group below.</p>
          <div className="budget-category-group-list">
            {categories.map((category) => (
              <div className="budget-category-group-row" key={category}>
                <span>{category}</span>
                <GlassSelect ariaLabel={`Budget group for ${category}`} className="budget-group-select" onChange={(value) => updateCategoryGroup(category, value as BudgetGroup)} options={GROUP_OPTIONS} value={getBudgetGroup(category, categoryGroups)} />
              </div>
            ))}
          </div>
        </details>
      </GlassCard>

      <section className="budget-section-stack">
        <div className="section-heading"><div><h2>Smart insights</h2><p className="caption-text">Based on transactions recorded for {formatMonth(month, year)}.</p></div></div>
        <div className="budget-insight-list">
          {insights.map((insight) => <GlassCard className="budget-insight" key={insight}><CircleCheck size={18} /><p>{insight}</p></GlassCard>)}
        </div>
      </section>

      <GlassCard className="projection-card">
        <div className="budget-section-heading">
          <div><h2>Projected Spending</h2><p>Estimate from month-to-date spending pace and scheduled expenses.</p></div>
          <span className="budget-estimate-label">Estimate</span>
        </div>
        {calculation.projection.amount === null ? (
          <p className="budget-projection-note">{selectedIsCurrent ? "A projection needs at least four days of spending history this month." : "Month-end projections are shown for the current month only."}</p>
        ) : (
          <div className="budget-projection-values">
            <div><span>Current spending</span><strong>{formatCurrency(calculation.spent)}</strong></div>
            <div><span>Projected month-end</span><strong>{formatCurrency(calculation.projection.amount)}</strong></div>
            <div><span>Total budget</span><strong>{calculation.budgeted > 0 ? formatCurrency(calculation.budgeted) : "No limits set"}</strong></div>
            {calculation.projection.futureRecurring > 0 && <p>Includes {formatCurrency(calculation.projection.futureRecurring)} in known recurring expenses due after today.</p>}
            {calculation.budgeted > 0 && <p className={calculation.projection.amount > calculation.budgeted ? "negative" : "positive"}>{calculation.projection.amount > calculation.budgeted ? `Projected to exceed budget by ${formatCurrency(calculation.projection.amount - calculation.budgeted)}.` : `Projected to finish ${formatCurrency(calculation.budgeted - calculation.projection.amount)} below budget.`}</p>}
          </div>
        )}
      </GlassCard>

      <section className="budget-section-stack">
        <div className="section-heading"><div><h2>Category Budgets</h2><p className="caption-text">{formatMonth(month, year)} · budgeted compared with actual expense transactions</p></div><Button onClick={openCreate} variant="secondary"><Plus size={16} /> Add category</Button></div>
        {alerts.length > 0 && <div className="budget-alert-list" aria-label="Budget alerts">{alerts.map((alert) => <div className={`budget-alert ${HEALTH_CLASS[alert.health]}`} key={alert.id}><AlertTriangle size={17} /><span>{alert.message}</span><strong>{Math.round(alert.percent)}%</strong></div>)}</div>}
        {loading ? <p className="empty-state" role="status">Loading your budgets...</p> : calculation.categoryBudgets.length ? (
          <div className="category-budget-grid">
            {calculation.categoryBudgets.map((budget) => (
              <GlassCard className="category-budget-card" key={budget.id}>
                <div className="category-budget-heading"><div><h3>{budget.category}</h3><span>{GROUP_LABEL[getBudgetGroup(budget.category, categoryGroups)]}</span></div><span className={`budget-health ${HEALTH_CLASS[budget.health]}`}>{getBudgetHealthLabel(budget.health)}</span></div>
                <div className="category-budget-amounts"><span><strong>{formatCurrency(budget.actual)}</strong> spent</span><span>of {formatCurrency(budget.monthly_limit)}</span></div>
                <ProgressBar label={`${budget.category} budget used`} target={100} value={budget.progress} />
                <div className="category-budget-footer"><span>{formatCurrency(budget.remaining)} {budget.remaining < 0 ? "over" : "remaining"}</span><strong>{budget.percent.toFixed(0)}%</strong></div>
                <div className="category-budget-actions">
                  <Button onClick={() => openEdit(budget)} variant="secondary"><Pencil size={15} /> Edit</Button>
                  <IconButton aria-label={`Delete ${budget.category} budget`} onClick={() => { setModalError(""); setModal({ kind: "delete", budget }); }}><Trash2 size={17} /></IconButton>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <GlassCard className="budget-empty-state"><span className="budget-empty-icon"><Target size={22} /></span><h3>No category budgets for {formatMonth(month, year)}</h3><p>Create a monthly category limit to track spending, remaining amounts, and budget health here.</p><Button onClick={openCreate}><Plus size={17} /> Create your first budget</Button></GlassCard>
        )}
      </section>

      {optionalDataNote && <p className="caption-text" role="status">{optionalDataNote}</p>}

      <Modal isOpen={modal !== null} onClose={closeModal} title={modal?.kind === "delete" ? "Delete budget?" : modal?.kind === "edit" ? "Edit category budget" : "Create category budget"}>
        {modal?.kind === "delete" ? (
          <div className="budget-delete-confirm"><p>Remove the {modal.budget.category} limit for {formatMonth(modal.budget.month, modal.budget.year)}? Existing transactions will not be changed.</p>{modalError && <p className="budget-form-error" role="alert">{modalError}</p>}<div className="budget-modal-actions"><Button disabled={saving} onClick={() => setModal(null)} variant="secondary">Cancel</Button><Button disabled={saving} onClick={() => void confirmDelete()} variant="danger">{saving ? "Deleting..." : "Delete budget"}</Button></div></div>
        ) : modal && (
          <form className="budget-editor-form" onSubmit={(event) => void saveBudget(event)}>
            <GlassSelect icon={<Target size={18} />} label="Category" onChange={(category) => setDraft((current) => ({ ...current, category, group: getBudgetGroup(category, categoryGroups) }))} options={[...new Set([...availableBudgetCategories, draft.category])].map((category) => ({ value: category, label: category }))} value={draft.category} />
            <TextField autoFocus icon={<span>$</span>} label="Monthly spending limit" min="0.01" onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" required step="0.01" type="number" value={draft.amount} />
            <GlassSelect label="Spending plan group" onChange={(value) => setDraft((current) => ({ ...current, group: value as BudgetGroup }))} options={GROUP_OPTIONS} value={draft.group} />
            <p className="budget-period-note">Budget period: <strong>{formatMonth(month, year)}</strong></p>
            {modalError && <p className="budget-form-error" role="alert">{modalError}</p>}
            <div className="budget-modal-actions"><Button disabled={saving} onClick={() => setModal(null)} variant="secondary">Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving..." : modal.kind === "edit" ? "Save changes" : "Create budget"}</Button></div>
          </form>
        )}
      </Modal>
    </section>
  );
}
