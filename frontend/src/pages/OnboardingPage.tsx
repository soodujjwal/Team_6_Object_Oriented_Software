import { useEffect, useMemo, useState, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction } from "react";
import { ArrowLeft, ArrowRight, BadgeDollarSign, CalendarClock, CheckCircle2, Landmark, PiggyBank, Sparkles, Target, WalletCards } from "lucide-react";
import { createAccount, getAccounts } from "../api/accounts";
import { createBudget, getBudgets } from "../api/budgets";
import { createRecurringTransaction, getRecurringTransactions, type RecurringTransactionPayload } from "../api/recurringTransactions";
import { createSavingsGoal, getSavingsGoals } from "../api/savingsGoals";
import { createTransaction, getTransactions } from "../api/transactions";
import type { User } from "../api/auth";
import type { Account } from "../api/types";
import { BankSelector } from "../components/BankSelector";
import { Button, DatePicker, GlassCard, GlassSelect, TextField } from "../components/ui";
import { getCategoriesForType } from "../domain/transactionCategories";
import { formatCurrency } from "../utils/format";

type OnboardingPageProps = {
  onComplete: (destination?: SetupDestination) => void;
  user: User;
};

type SetupDestination = "dashboard" | "accounts" | "goals" | "recurring";
type BudgetMode = "template" | "custom";
type BillDraft = {
  name: string;
  amount: string;
  frequency: "weekly" | "monthly";
  next_due_date: string;
  account_id: string;
  category: string;
  auto_pay_status: boolean;
  reminder_settings: number[];
};
type Draft = {
  goals: string[];
  bankName: string;
  accountName: string;
  startingBalance: string;
  incomeAmount: string;
  incomeSource: string;
  incomeFrequency: string;
  budgetMode: BudgetMode;
  targets: { needs: number; wants: number; savingsDebt: number };
  savingsName: string;
  savingsTarget: string;
  savingsDate: string;
  savingsStart: string;
  bills: BillDraft[];
};

const STEPS = ["Welcome", "Goals", "Account", "Income", "Budget", "Savings", "Bills", "Summary"];
const GOALS = [
  "Grow my savings",
  "Reduce my spending",
  "Stay on top of my finances",
  "Pay off debt",
  "Save for a specific goal",
  "Something else",
];
const INCOME_FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "weekly", label: "Weekly" },
  { value: "other", label: "Other" },
];
const BUDGET_CATEGORIES = {
  needs: "Housing",
  wants: "Food & Dining",
  savingsDebt: "Savings Contribution",
};
const REMINDERS = [
  { value: 7, label: "7 days" },
  { value: 3, label: "3 days" },
  { value: 1, label: "1 day" },
  { value: 0, label: "Due today" },
  { value: -1, label: "Overdue" },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function defaultBill(accountId = ""): BillDraft {
  return {
    name: "",
    amount: "",
    frequency: "monthly",
    next_due_date: today(),
    account_id: accountId,
    category: "Subscriptions",
    auto_pay_status: true,
    reminder_settings: [7, 3, 1, 0, -1],
  };
}

function defaultDraft(): Draft {
  return {
    goals: [],
    bankName: "",
    accountName: "",
    startingBalance: "",
    incomeAmount: "",
    incomeSource: "Salary",
    incomeFrequency: "monthly",
    budgetMode: "template",
    targets: { needs: 50, wants: 30, savingsDebt: 20 },
    savingsName: "Emergency Fund",
    savingsTarget: "",
    savingsDate: "",
    savingsStart: "0.00",
    bills: [],
  };
}

function keyFor(user: User) {
  return `pfm_onboarding_${user.email}`;
}

function stepKeyFor(user: User) {
  return `pfm_onboarding_step_${user.email}`;
}

function completionKey(user: User) {
  return `pfm_onboarding_complete_${user.email}`;
}

function clampStep(nextStep: number) {
  return Math.max(0, Math.min(STEPS.length - 1, nextStep));
}

function readStoredDraft(user: User): Draft {
  try {
    const stored = JSON.parse(localStorage.getItem(keyFor(user)) ?? "{}") as Partial<Draft>;
    return {
      ...defaultDraft(),
      ...stored,
      goals: Array.isArray(stored.goals) ? stored.goals : [],
      targets: { ...defaultDraft().targets, ...stored.targets },
      bills: Array.isArray(stored.bills) ? stored.bills : [],
    };
  } catch {
    return defaultDraft();
  }
}

function readStoredStep(user: User) {
  try {
    const stored = Number(localStorage.getItem(stepKeyFor(user)) ?? 0);
    return Number.isFinite(stored) ? clampStep(stored) : 0;
  } catch {
    return 0;
  }
}

export function hasCompletedOnboarding(user: User) {
  try {
    return localStorage.getItem(completionKey(user)) === "true";
  } catch {
    return false;
  }
}

export function markOnboardingComplete(user: User) {
  try {
    localStorage.setItem(completionKey(user), "true");
  } catch {
    // The dashboard is still available if browser storage is unavailable.
  }
}

export function OnboardingPage({ onComplete, user }: OnboardingPageProps) {
  const [step, setStep] = useState(() => readStoredStep(user));
  const [draft, setDraft] = useState<Draft>(() => readStoredDraft(user));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(keyFor(user), JSON.stringify(draft));
    } catch {
      // Back/refresh preservation is best-effort; backend saves remain authoritative.
    }
  }, [draft, user]);

  useEffect(() => {
    try {
      localStorage.setItem(stepKeyFor(user), String(step));
    } catch {
      // Step restore is best-effort; the setup can still be completed this session.
    }
  }, [step, user]);

  useEffect(() => {
    getAccounts().then((items) => {
      setAccounts(items);
      setSelectedAccountId(String(items[0]?.id ?? ""));
      if (!draft.accountName && items[0]) {
        setDraft((current) => ({ ...current, bankName: items[0].bank_name, accountName: items[0].name, startingBalance: items[0].starting_balance }));
      }
    }).catch(() => setStatus("Start the backend server to save setup data."));
  }, []);

  const income = Number(draft.incomeAmount) || 0;
  const monthlyBudget = useMemo(() => ({
    needs: income * draft.targets.needs / 100,
    wants: income * draft.targets.wants / 100,
    savingsDebt: income * draft.targets.savingsDebt / 100,
  }), [draft.targets, income]);
  const shouldHighlightSavings = draft.goals.some((goal) => /savings|specific goal/i.test(goal));
  const canContinue = step !== 1 || draft.goals.length > 0;

  function goToStep(nextStep: number) {
    setStatus("");
    setStep(clampStep(nextStep));
  }

  function goBack() {
    goToStep(step - 1);
  }

  function complete(skip = false, destination: SetupDestination = "dashboard") {
    markOnboardingComplete(user);
    try {
      localStorage.removeItem(keyFor(user));
      localStorage.removeItem(stepKeyFor(user));
      localStorage.setItem(`pfm_financial_goals_${user.email}`, JSON.stringify(draft.goals));
    } catch {
      // Financial records are saved through the backend; preference storage is non-critical.
    }
    if (skip) setStatus("Setup skipped. You can add your details later.");
    onComplete(destination);
  }

  async function continueStep() {
    if (!canContinue) {
      setStatus("Choose at least one goal to continue.");
      return;
    }

    if (step === 0 || step === 1) {
      goToStep(step + 1);
      return;
    }

    setSaving(true);
    setStatus("");
    try {
      if (step === 2) await saveAccount();
      if (step === 3) await saveIncome();
      if (step === 4) await saveBudgets();
      if (step === 5) await saveSavingsGoal();
      if (step === 6) await saveBills();
      goToStep(step + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Setup could not be saved. Check your entries and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAccount() {
    if (!draft.bankName && !draft.accountName && !draft.startingBalance) return;
    if (!draft.bankName || !draft.accountName || Number(draft.startingBalance) < 0) throw new Error("Choose a bank, account name, and valid starting balance.");
    const existing = await getAccounts();
    const match = existing.find((account) => account.bank_name === draft.bankName && account.name.toLowerCase() === draft.accountName.toLowerCase());
    if (match) {
      setAccounts(existing);
      setSelectedAccountId(String(match.id));
      return;
    }
    const created = await createAccount({ bank_name: draft.bankName, name: draft.accountName, starting_balance: Number(draft.startingBalance || 0).toFixed(2) });
    setAccounts([...existing, created]);
    setSelectedAccountId(String(created.id));
  }

  async function saveIncome() {
    if (!draft.incomeAmount) return;
    const accountId = Number(selectedAccountId || accounts[0]?.id);
    if (!accountId) throw new Error("Add an account before saving income.");
    if (Number(draft.incomeAmount) <= 0) throw new Error("Enter income greater than $0.");
    const transactions = await getTransactions();
    const existing = transactions.find((transaction) => transaction.transaction_type === "income" && transaction.note === "Onboarding monthly income");
    if (existing) return;
    await createTransaction({
      account_id: accountId,
      amount: Number(draft.incomeAmount).toFixed(2),
      category: draft.incomeSource || "Salary",
      transaction_type: "income",
      transaction_date: today(),
      note: "Onboarding monthly income",
    });
  }

  async function saveBudgets() {
    if (income <= 0) return;
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const existing = await getBudgets();
    const payloads = [
      { category: BUDGET_CATEGORIES.needs, monthly_limit: monthlyBudget.needs.toFixed(2), month, year },
      { category: BUDGET_CATEGORIES.wants, monthly_limit: monthlyBudget.wants.toFixed(2), month, year },
      { category: BUDGET_CATEGORIES.savingsDebt, monthly_limit: monthlyBudget.savingsDebt.toFixed(2), month, year },
    ].filter((item) => Number(item.monthly_limit) > 0);
    for (const payload of payloads) {
      const duplicate = existing.some((budget) => budget.category === payload.category && budget.month === month && budget.year === year);
      if (!duplicate) await createBudget(payload);
    }
  }

  async function saveSavingsGoal() {
    if (!draft.savingsTarget && !draft.savingsName.trim()) return;
    if (!draft.savingsTarget) return;
    if (!draft.savingsName.trim() || Number(draft.savingsTarget) <= 0) throw new Error("Enter a goal name and target amount greater than $0.");
    const existing = await getSavingsGoals();
    if (existing.some((goal) => goal.name.toLowerCase() === draft.savingsName.toLowerCase())) return;
    await createSavingsGoal({
      name: draft.savingsName.trim(),
      target_amount: Number(draft.savingsTarget).toFixed(2),
      current_amount: Number(draft.savingsStart || 0).toFixed(2),
      target_date: draft.savingsDate || null,
      monthly_income: Number(draft.incomeAmount || 0).toFixed(2),
    });
  }

  async function saveBills() {
    const accountId = selectedAccountId || String(accounts[0]?.id ?? "");
    const validBills = draft.bills.filter((bill) => bill.name.trim() && Number(bill.amount) > 0);
    if (!validBills.length) return;
    if (!accountId) throw new Error("Add an account before saving recurring bills.");
    const existing = await getRecurringTransactions();
    for (const bill of validBills) {
      const payload: RecurringTransactionPayload = {
        name: bill.name.trim(),
        account_id: Number(bill.account_id || accountId),
        amount: Number(bill.amount).toFixed(2),
        category: bill.category,
        transaction_type: "expense",
        frequency: bill.frequency,
        next_due_date: bill.next_due_date,
        note: bill.name.trim(),
        auto_pay_status: bill.auto_pay_status,
        reminder_settings: bill.reminder_settings,
      };
      const duplicate = existing.some((item) => item.name.toLowerCase() === payload.name.toLowerCase() && item.account_id === payload.account_id && item.amount === payload.amount);
      if (!duplicate) await createRecurringTransaction(payload);
    }
  }

  function skipSetup() {
    complete(true);
  }

  function openSetupDestination(destination: SetupDestination) {
    complete(false, destination);
  }

  function skipSavings() {
    goToStep(6);
  }

  function skipBills() {
    goToStep(7);
  }

  function finish() {
    complete();
  }

  return (
    <main className="onboarding-shell">
      <GlassCard className="onboarding-card" variant="elevated">
        <header className="onboarding-header">
          <span className="onboarding-mark"><PiggyBank size={26} /></span>
          <div>
            <p>{Math.min(step + 1, STEPS.length)} of {STEPS.length}</p>
            <h1>{STEPS[step]}</h1>
          </div>
          <button className="onboarding-skip" onClick={skipSetup} type="button">Skip Setup</button>
        </header>
        <div className="onboarding-progress" aria-hidden="true"><span style={{ width: `${(step + 1) / STEPS.length * 100}%` }} /></div>

        {step === 0 && <WelcomeStep onOpenDestination={openSetupDestination} />}
        {step === 1 && <GoalsStep draft={draft} setDraft={setDraft} />}
        {step === 2 && <AccountStep draft={draft} setDraft={setDraft} />}
        {step === 3 && <IncomeStep draft={draft} setDraft={setDraft} />}
        {step === 4 && <BudgetStep draft={draft} income={income} monthlyBudget={monthlyBudget} setDraft={setDraft} />}
        {step === 5 && <SavingsStep draft={draft} prominent={shouldHighlightSavings} setDraft={setDraft} />}
        {step === 6 && <BillsStep accounts={accounts} draft={draft} selectedAccountId={selectedAccountId} setDraft={setDraft} />}
        {step === 7 && <SummaryStep draft={draft} monthlyBudget={monthlyBudget} />}

        {status && <p className="notice" role="alert">{status}</p>}
        <footer className="onboarding-actions">
          <Button disabled={step === 0 || saving} onClick={goBack} variant="secondary"><ArrowLeft size={16} /> Back</Button>
          {step === 5 && <Button disabled={saving} onClick={skipSavings} variant="ghost">Skip savings</Button>}
          {step === 6 && <Button disabled={saving} onClick={skipBills} variant="ghost">Skip bills</Button>}
          {step === STEPS.length - 1 ? (
            <Button disabled={saving} onClick={finish}>Go to Dashboard <ArrowRight size={16} /></Button>
          ) : (
            <Button disabled={saving || !canContinue} onClick={() => void continueStep()}>{saving ? "Saving..." : step === 0 ? "Get Started" : "Continue"} <ArrowRight size={16} /></Button>
          )}
        </footer>
      </GlassCard>
    </main>
  );
}

function WelcomeStep({ onOpenDestination }: { onOpenDestination: (destination: SetupDestination) => void }) {
  return <section className="onboarding-step"><h2>Welcome to Personal Finance!</h2><p>Setup helps personalize your dashboard so you can track money, goals, budgets, and bills from day one.</p><div className="onboarding-benefits"><SetupCard icon={<WalletCards size={18} />} label="Track balances" onActivate={() => onOpenDestination("accounts")} /><SetupCard icon={<Target size={18} />} label="Plan goals" onActivate={() => onOpenDestination("goals")} /><SetupCard icon={<CalendarClock size={18} />} label="Remember bills" onActivate={() => onOpenDestination("recurring")} /></div></section>;
}

function SetupCard({ icon, label, onActivate }: { icon: ReactNode; label: string; onActivate: () => void }) {
  function handleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  }

  return <span onClick={onActivate} onKeyDown={handleKeyDown} role="button" tabIndex={0}>{icon} {label}</span>;
}

function GoalsStep({ draft, setDraft }: { draft: Draft; setDraft: Dispatch<SetStateAction<Draft>> }) {
  return <section className="onboarding-step"><h2>What are your financial goals?</h2><p>Select every goal that applies. This helps the setup emphasize the right steps.</p><div className="goal-card-grid">{GOALS.map((goal) => { const selected = draft.goals.includes(goal); return <button className={`goal-choice ${selected ? "selected" : ""}`} key={goal} onClick={() => setDraft((current) => ({ ...current, goals: selected ? current.goals.filter((item) => item !== goal) : [...current.goals, goal] }))} type="button"><Sparkles size={18} /> {goal}</button>; })}</div></section>;
}

function AccountStep({ draft, setDraft }: { draft: Draft; setDraft: Dispatch<SetStateAction<Draft>> }) {
  return <section className="onboarding-step"><h2>Connect your account</h2><p>Bank connection is not configured yet, so add an account manually now. You can still choose your institution for organization.</p><div className="onboarding-form-grid"><BankSelector onChange={(bankName) => setDraft((current) => ({ ...current, bankName }))} value={draft.bankName} /><TextField icon={<Landmark size={18} />} label="Account Name" onChange={(event) => setDraft((current) => ({ ...current, accountName: event.target.value }))} placeholder="Checking" value={draft.accountName} /><TextField icon={<span>$</span>} label="Starting Balance" min="0" onChange={(event) => setDraft((current) => ({ ...current, startingBalance: event.target.value }))} placeholder="0.00" step="0.01" type="number" value={draft.startingBalance} /></div><p className="caption-text">Add Account Manually is fully functional. Real bank-linking can be connected later.</p></section>;
}

function IncomeStep({ draft, setDraft }: { draft: Draft; setDraft: Dispatch<SetStateAction<Draft>> }) {
  return <section className="onboarding-step"><h2>What is your monthly income?</h2><p>This creates a real income transaction for the current month.</p><div className="onboarding-form-grid"><TextField icon={<span>$</span>} label="Income amount" min="0" onChange={(event) => setDraft((current) => ({ ...current, incomeAmount: event.target.value }))} placeholder="4000.00" step="0.01" type="number" value={draft.incomeAmount} /><TextField icon={<BadgeDollarSign size={18} />} label="Income source" onChange={(event) => setDraft((current) => ({ ...current, incomeSource: event.target.value }))} placeholder="Salary" value={draft.incomeSource} /><GlassSelect label="Frequency" onChange={(value) => setDraft((current) => ({ ...current, incomeFrequency: value }))} options={INCOME_FREQUENCIES} value={draft.incomeFrequency} /></div></section>;
}

function BudgetStep({ draft, income, monthlyBudget, setDraft }: { draft: Draft; income: number; monthlyBudget: Record<"needs" | "wants" | "savingsDebt", number>; setDraft: Dispatch<SetStateAction<Draft>> }) {
  return <section className="onboarding-step"><h2>Set up your monthly budget</h2><p>Use 50/30/20 as a starting guideline or customize the targets. Suggested amounts use your entered monthly income.</p><div className="segmented-control"><button className={draft.budgetMode === "template" ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, budgetMode: "template", targets: { needs: 50, wants: 30, savingsDebt: 20 } }))} type="button">50/30/20</button><button className={draft.budgetMode === "custom" ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, budgetMode: "custom" }))} type="button">Custom</button></div><div className="budget-preview-grid">{(["needs", "wants", "savingsDebt"] as const).map((group) => <GlassCard className="budget-preview-card" key={group} variant="subtle"><span>{group === "savingsDebt" ? "Savings & Debt" : group[0].toUpperCase() + group.slice(1)}</span><strong>{draft.targets[group]}%</strong><small>{income > 0 ? formatCurrency(monthlyBudget[group]) : "Add income for amount"}</small>{draft.budgetMode === "custom" && <input aria-label={`${group} target`} max="100" min="0" onChange={(event) => setDraft((current) => ({ ...current, targets: { ...current.targets, [group]: Number(event.target.value) } }))} type="number" value={draft.targets[group]} />}</GlassCard>)}</div></section>;
}

function SavingsStep({ draft, prominent, setDraft }: { draft: Draft; prominent: boolean; setDraft: Dispatch<SetStateAction<Draft>> }) {
  return <section className="onboarding-step"><h2>Create a savings goal</h2><p>{prominent ? "Because savings is one of your goals, add a target now or skip it for later." : "Optional. Add a goal if you already know what you are saving for."}</p><div className="onboarding-form-grid"><TextField icon={<Target size={18} />} label="Goal name" onChange={(event) => setDraft((current) => ({ ...current, savingsName: event.target.value }))} placeholder="Emergency Fund" value={draft.savingsName} /><TextField icon={<span>$</span>} label="Target amount" min="0" onChange={(event) => setDraft((current) => ({ ...current, savingsTarget: event.target.value }))} placeholder="1000.00" step="0.01" type="number" value={draft.savingsTarget} /><DatePicker label="Target date" onChange={(value) => setDraft((current) => ({ ...current, savingsDate: value }))} value={draft.savingsDate} /><TextField icon={<span>$</span>} label="Starting amount" min="0" onChange={(event) => setDraft((current) => ({ ...current, savingsStart: event.target.value }))} placeholder="0.00" step="0.01" type="number" value={draft.savingsStart} /></div></section>;
}

function BillsStep({ accounts, draft, selectedAccountId, setDraft }: { accounts: Account[]; draft: Draft; selectedAccountId: string; setDraft: Dispatch<SetStateAction<Draft>> }) {
  const accountOptions = accounts.map((account) => ({ value: String(account.id), label: `${account.name} · ${account.bank_name}` }));
  const categoryOptions = getCategoriesForType("expense").map((category) => ({ value: category.label, label: category.label }));
  function updateBill(index: number, update: Partial<BillDraft>) {
    setDraft((current) => ({ ...current, bills: current.bills.map((bill, billIndex) => billIndex === index ? { ...bill, ...update } : bill) }));
  }
  return <section className="onboarding-step"><h2>Add recurring bills</h2><p>Optional. Saved bills feed upcoming bill reminders, notifications, and finance projections.</p><div className="bill-draft-list">{draft.bills.map((bill, index) => <GlassCard className="onboarding-bill-card" key={index} variant="subtle"><TextField label="Name" onChange={(event) => updateBill(index, { name: event.target.value })} placeholder="Netflix" value={bill.name} /><TextField icon={<span>$</span>} label="Amount" min="0" onChange={(event) => updateBill(index, { amount: event.target.value })} step="0.01" type="number" value={bill.amount} /><GlassSelect label="Frequency" onChange={(value) => updateBill(index, { frequency: value as BillDraft["frequency"] })} options={[{ value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" }]} value={bill.frequency} /><DatePicker label="Due / renewal date" onChange={(value) => updateBill(index, { next_due_date: value })} value={bill.next_due_date} /><GlassSelect label="Payment account" onChange={(value) => updateBill(index, { account_id: value })} options={accountOptions} placeholder="Choose account" value={bill.account_id || selectedAccountId} /><GlassSelect label="Category" onChange={(value) => updateBill(index, { category: value })} options={categoryOptions} value={bill.category} /><label className="bill-toggle"><input checked={bill.auto_pay_status} onChange={(event) => updateBill(index, { auto_pay_status: event.target.checked })} type="checkbox" /> Auto-pay</label><div className="reminder-grid">{REMINDERS.map((reminder) => <label key={reminder.value}><input checked={bill.reminder_settings.includes(reminder.value)} onChange={() => updateBill(index, { reminder_settings: bill.reminder_settings.includes(reminder.value) ? bill.reminder_settings.filter((item) => item !== reminder.value) : [...bill.reminder_settings, reminder.value] })} type="checkbox" /> {reminder.label}</label>)}</div><Button onClick={() => setDraft((current) => ({ ...current, bills: current.bills.filter((_, billIndex) => billIndex !== index) }))} variant="ghost">Remove</Button></GlassCard>)}</div><Button onClick={() => setDraft((current) => ({ ...current, bills: [...current.bills, defaultBill(selectedAccountId || String(accounts[0]?.id ?? ""))] }))} variant="secondary">Add recurring bill</Button></section>;
}

function SummaryStep({ draft, monthlyBudget }: { draft: Draft; monthlyBudget: Record<"needs" | "wants" | "savingsDebt", number> }) {
  return <section className="onboarding-step"><h2>You’re all set!</h2><p>Your dashboard will use the real records saved during setup.</p><div className="setup-summary-grid"><SummaryItem label="Selected goals" value={draft.goals.length ? draft.goals.join(", ") : "Skipped"} /><SummaryItem label="Account" value={draft.accountName ? `${draft.accountName} · ${draft.bankName}` : "Not added"} /><SummaryItem label="Monthly income" value={draft.incomeAmount ? formatCurrency(draft.incomeAmount) : "Not added"} /><SummaryItem label="Budget" value={Number(draft.incomeAmount) > 0 ? `${formatCurrency(monthlyBudget.needs)} needs · ${formatCurrency(monthlyBudget.wants)} wants · ${formatCurrency(monthlyBudget.savingsDebt)} savings/debt` : "Not added"} /><SummaryItem label="Savings goal" value={draft.savingsTarget ? `${draft.savingsName}: ${formatCurrency(draft.savingsTarget)}` : "Skipped"} /><SummaryItem label="Recurring bills" value={draft.bills.filter((bill) => bill.name && bill.amount).length ? `${draft.bills.filter((bill) => bill.name && bill.amount).length} bill(s)` : "Skipped"} /></div></section>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <GlassCard className="setup-summary-item" variant="subtle"><CheckCircle2 size={18} /><span>{label}</span><strong>{value}</strong></GlassCard>;
}
