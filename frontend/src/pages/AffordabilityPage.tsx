import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CreditCard,
  DollarSign,
  Info,
  KeyRound,
  ShieldCheck,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { getAccounts } from "../api/accounts";
import { getBudgets } from "../api/budgets";
import { getRecurringTransactions } from "../api/recurringTransactions";
import { getSavingsGoals } from "../api/savingsGoals";
import { TRANSACTIONS_UPDATED_EVENT, getTransactions } from "../api/transactions";
import type { Account, Budget, Transaction } from "../api/types";
import type { SavingsGoal } from "../api/savingsGoals";
import type { RecurringTransaction } from "../api/recurringTransactions";
import { TopBar } from "../components/TopBar";
import { GlassCard, GlassSelect, TextField } from "../components/ui";
import {
  buildFinancialSnapshot,
  calculateLoan,
  formatMoney,
  getCashStatus,
  getMonthlyPaymentStatus,
  safetyBuffer,
  type FinancialSnapshot,
} from "../domain/purchaseAnalysis";

type PaymentMethod = "cash" | "finance" | "lease";
type AssessmentStatus = "comfortable" | "tight" | "not-recommended" | "unknown";

const STATUS_LABEL: Record<AssessmentStatus, string> = {
  comfortable: "Comfortable",
  tight: "Tight",
  "not-recommended": "Not Recommended",
  unknown: "Not enough information",
};

const PAYMENT_METHODS: { id: PaymentMethod; label: string; description: string; icon: typeof Wallet }[] = [
  { id: "cash", label: "Cash", description: "Buy outright", icon: Wallet },
  { id: "finance", label: "Finance", description: "Pay monthly", icon: CreditCard },
  { id: "lease", label: "Lease", description: "Pay monthly, temporary ownership", icon: KeyRound },
];

function numeric(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amountInput(value: string, setter: (value: string) => void, label: string, icon: ReactNode, step = "0.01") {
  return (
    <TextField
      icon={icon}
      label={label}
      min="0"
      onChange={(event) => setter(event.target.value)}
      required
      step={step}
      type="number"
      value={value}
    />
  );
}

function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`purchase-summary-line${strong ? " strong" : ""}`}><dt>{label}</dt><dd>{value}</dd></div>;
}

function StatusPill({ status }: { status: AssessmentStatus }) {
  return <span className={`purchase-status ${status}`}>{status === "comfortable" ? <Check size={14} /> : status === "unknown" ? <Info size={14} /> : <AlertTriangle size={14} />}{STATUS_LABEL[status]}</span>;
}

export function AffordabilityPage() {
  const [itemName, setItemName] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [dataWarnings, setDataWarnings] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [downPayment, setDownPayment] = useState("0");
  const [tradeIn, setTradeIn] = useState("0");
  const [apr, setApr] = useState("");
  const [loanTerm, setLoanTerm] = useState("");
  const [leaseDue, setLeaseDue] = useState("0");
  const [leasePayment, setLeasePayment] = useState("");
  const [leaseTerm, setLeaseTerm] = useState("");
  const [mileage, setMileage] = useState("");
  const [buyout, setBuyout] = useState("");

  useEffect(() => {
    let active = true;
    async function loadFinancialData() {
      setDataLoading(true);
      const [accountResult, transactionResult, budgetResult, goalResult, recurringResult] = await Promise.allSettled([
        getAccounts(),
        getTransactions(),
        getBudgets(),
        getSavingsGoals(),
        getRecurringTransactions(),
      ]);
      if (!active) return;
      const warnings: string[] = [];
      if (accountResult.status === "fulfilled") setAccounts(accountResult.value);
      else { setAccounts(null); warnings.push("Accounts could not be loaded."); }
      if (transactionResult.status === "fulfilled") setTransactions(transactionResult.value);
      else { setTransactions([]); warnings.push("Transaction history could not be loaded."); }
      if (budgetResult.status === "fulfilled") setBudgets(budgetResult.value);
      else { setBudgets([]); warnings.push("Budgets could not be loaded."); }
      if (goalResult.status === "fulfilled") setGoals(goalResult.value);
      else { setGoals([]); warnings.push("Savings goals could not be loaded."); }
      if (recurringResult.status === "fulfilled") setRecurring(recurringResult.value);
      else { setRecurring([]); warnings.push("Recurring payments could not be loaded."); }
      setDataWarnings(warnings);
      setSnapshotReady(true);
      setDataLoading(false);
    }
    void loadFinancialData();
    window.addEventListener(TRANSACTIONS_UPDATED_EVENT, loadFinancialData);
    return () => {
      active = false;
      window.removeEventListener(TRANSACTIONS_UPDATED_EVENT, loadFinancialData);
    };
  }, []);

  const snapshot: FinancialSnapshot | null = useMemo(() => snapshotReady
    ? buildFinancialSnapshot(accounts, transactions, budgets, goals, recurring)
    : null, [accounts, transactions, budgets, goals, recurring, snapshotReady]);

  const price = numeric(priceInput);
  const down = numeric(downPayment);
  const trade = numeric(tradeIn);
  const principal = price - down - trade;
  const loanMonths = Number(loanTerm);
  const loanApr = Number(apr);
  const financeInputsValid = price > 0 && down >= 0 && trade >= 0 && down + trade <= price && loanTerm !== "" && loanMonths > 0 && apr !== "" && loanApr >= 0;
  const loan = financeInputsValid
    ? principal === 0
      ? { monthlyPayment: 0, totalPayments: 0, totalInterest: 0 }
      : calculateLoan(principal, loanApr, loanMonths)
    : null;
  const financeTotalCost = loan ? down + trade + loan.totalPayments : null;
  const leaseMonths = Number(leaseTerm);
  const leaseMonthly = numeric(leasePayment);
  const leaseUpfront = numeric(leaseDue);
  const leaseComplete = price > 0 && leaseUpfront >= 0 && leasePayment !== "" && leaseMonthly >= 0 && leaseTerm !== "" && leaseMonths > 0 && (mileage === "" || numeric(mileage) >= 0) && (buyout === "" || numeric(buyout) >= 0);
  const totalLeasePayments = leaseComplete ? leaseMonthly * leaseMonths : null;
  const leaseTotalCost = totalLeasePayments === null ? null : leaseUpfront + totalLeasePayments;
  const leaseCostToOwn = leaseTotalCost !== null && buyout !== "" ? leaseTotalCost + numeric(buyout) : null;
  const cashStatus = price > 0 && snapshot ? getCashStatus(price, snapshot) : "unknown";

  const selectedStatus: AssessmentStatus = !snapshot || !price
    ? "unknown"
    : method === "cash"
      ? cashStatus
      : method === "finance"
        ? loan && down + trade <= price ? getMonthlyPaymentStatus(down, loan.monthlyPayment, snapshot) : "unknown"
        : leaseComplete ? getMonthlyPaymentStatus(leaseUpfront, leaseMonthly, snapshot) : "unknown";

  const buffer = snapshot ? safetyBuffer(snapshot) : null;
  const financeStatus = loan && snapshot ? getMonthlyPaymentStatus(down, loan.monthlyPayment, snapshot) : "unknown";
  const leaseStatus = leaseComplete && snapshot ? getMonthlyPaymentStatus(leaseUpfront, leaseMonthly, snapshot) : "unknown";
  const recommendedStatus: AssessmentStatus = cashStatus === "comfortable"
    ? "comfortable"
    : financeStatus === "comfortable" || leaseStatus === "comfortable"
      ? "comfortable"
      : cashStatus === "tight" || financeStatus === "tight" || leaseStatus === "tight"
        ? "tight"
        : selectedStatus;

  let recommendationTitle = "Not enough information";
  let recommendationText = "Add accounts and recent income and expense transactions to assess comfort. The payment calculations remain available without that history.";
  if (snapshot && price > 0 && method) {
    if (cashStatus === "comfortable") {
      recommendationTitle = "Comfortable Purchase";
      recommendationText = `Paying${itemName ? ` for ${itemName}` : ""} with cash is the lowest modeled total cost and still leaves available balances above a buffer based on known outflows and dated goal commitments. Financing adds interest, while lease costs exclude unentered fees and do not include ownership.`;
    } else if (financeStatus === "comfortable") {
      recommendationTitle = "Consider Financing";
      recommendationText = "Buying with cash would reduce savings below the known-outflow buffer. This financing option preserves that buffer and fits within estimated monthly surplus after dated savings-goal pacing; it costs more overall than cash.";
    } else if (leaseStatus === "comfortable") {
      recommendationTitle = "Lease Payment Fits, With Trade-offs";
      recommendationText = "The lease payment fits the available monthly picture and the upfront cost preserves the known buffer. Lease cost is not ownership cost; taxes, fees, mileage charges, and end-of-lease costs may increase it. Compare a complete finance quote before choosing.";
    } else if (recommendedStatus === "tight") {
      recommendationTitle = "Consider Waiting";
      recommendationText = selectedStatus === "tight" && method === "cash"
        ? "The purchase is within your available savings, but it would bring savings below the buffer implied by your known monthly outflows."
        : "At least one modeled option is technically within reach, but it would leave limited room against your current savings buffer, monthly budget headroom, or dated savings-goal pace.";
    } else if (selectedStatus === "not-recommended") {
      recommendationTitle = "Not Comfortable Yet";
      recommendationText = method === "cash"
        ? "This purchase exceeds available account balances and would require money not currently reflected in your accounts."
        : "The upfront cost exceeds available balances or the monthly payment is higher than the observed monthly surplus.";
    }
  }

  const hasPrice = price > 0;
  const savingsAfterCash = snapshot?.currentSavings === null || snapshot?.currentSavings === undefined
    ? null
    : snapshot.currentSavings - price;

  return (
    <section className="page purchase-page">
      <TopBar title="Can I Afford It?" />
      <header className="purchase-intro">
        <p>See whether a purchase fits comfortably into your finances.</p>
      </header>

      <GlassCard className="purchase-card">
        <div className="purchase-section-heading">
          <span className="purchase-step">01</span>
          <div><h2>Purchase information</h2><p>Start with the item and its price.</p></div>
        </div>
        <div className="purchase-input-grid">
          <TextField icon={<ShoppingBag size={18} />} label="Item / Purchase" onChange={(event) => setItemName(event.target.value)} placeholder="e.g. Laptop" value={itemName} />
          {amountInput(priceInput, setPriceInput, "Purchase Price", <DollarSign size={18} />)}
        </div>
      </GlassCard>

      {hasPrice && (
        <section className="purchase-method-section" aria-labelledby="payment-method-heading">
          <div className="purchase-section-heading">
            <span className="purchase-step">02</span>
            <div><h2 id="payment-method-heading">How would you pay?</h2><p>Choose an option to see its impact.</p></div>
          </div>
          <div className="purchase-methods" role="group" aria-label="Payment method">
            {PAYMENT_METHODS.map(({ id, label, description, icon: Icon }) => (
              <button
                aria-pressed={method === id}
                className={`purchase-method${method === id ? " selected" : ""}`}
                key={id}
                onClick={() => setMethod(id)}
                type="button"
              >
                <span className="purchase-method-icon"><Icon size={20} /></span>
                <span><strong>{label}</strong><small>{description}</small></span>
                {method === id && <Check aria-hidden="true" className="purchase-method-check" size={17} />}
              </button>
            ))}
          </div>
        </section>
      )}

      {method === "cash" && hasPrice && snapshot && (
        <GlassCard className="purchase-card purchase-analysis-card" variant="elevated">
          <div className="purchase-section-heading">
            <span className="purchase-step">03</span>
            <div><h2>Cash purchase analysis</h2><p>Your listed account balances and known outflows.</p></div>
          </div>
          <dl className="purchase-summary">
            <SummaryLine label="Available balances across accounts" value={snapshot.currentSavings === null ? "Not enough information" : formatMoney(snapshot.currentSavings)} />
            <SummaryLine label="Purchase price" value={formatMoney(price)} />
            <SummaryLine label="Balance after purchase" value={formatMoney(savingsAfterCash)} strong />
            <SummaryLine label="Estimated monthly expenses" value={snapshot.monthlyExpenses === null ? "Not enough information" : formatMoney(snapshot.monthlyExpenses)} />
            <SummaryLine label="Monthly recurring commitments" value={snapshot.monthlyRecurringExpenses === null ? "Not enough information" : formatMoney(snapshot.monthlyRecurringExpenses)} />
            <SummaryLine label="Safety buffer from known outflows and dated goals" value={formatMoney(buffer)} />
            <SummaryLine label="Above / below safety buffer" value={savingsAfterCash === null || buffer === null ? "Not enough information" : formatMoney(savingsAfterCash - buffer)} />
            <SummaryLine label="Recurring expenses due in next 30 days" value={snapshot.upcomingRecurringExpenses === null ? "Not enough information" : formatMoney(snapshot.upcomingRecurringExpenses)} />
          </dl>
          <div className="purchase-result-row"><StatusPill status={cashStatus} /><span>{cashStatus === "comfortable" ? "This leaves at least one month of known outflows, plus any dated goal pacing, in available balances." : cashStatus === "tight" ? "The purchase uses balances set aside by your current outflow pattern." : cashStatus === "not-recommended" ? "The purchase is higher than the balances currently listed." : "Add recent transactions or recurring payments to estimate a safety buffer."}</span></div>
          {snapshot.transactionMonths > 0 && <p className="purchase-footnote">Monthly estimates use logged transactions in the last three calendar months with activity ({snapshot.transactionMonths} active {snapshot.transactionMonths === 1 ? "month" : "months"}). Scheduled recurring income and outflows are compared with, not added to, logged averages to avoid double-counting.</p>}
          {snapshot.activeGoalCount > 0 && <p className="purchase-context"><ShieldCheck size={16} /> You have {snapshot.activeGoalCount} savings {snapshot.activeGoalCount === 1 ? "goal" : "goals"} with {formatMoney(snapshot.goalRemaining)} remaining{snapshot.monthlyGoalPacing > 0 ? ` and ${formatMoney(snapshot.monthlyGoalPacing)} per month implied by dated goals` : ""}. Dated goal pacing is included in payment surplus; goals without a target date are context, not assumed monthly obligations.</p>}
        </GlassCard>
      )}

      {method === "finance" && hasPrice && (
        <GlassCard className="purchase-card" variant="elevated">
          <div className="purchase-section-heading">
            <span className="purchase-step">03</span>
            <div><h2>Finance details</h2><p>See the full cost of borrowing, not just the monthly payment.</p></div>
          </div>
          <div className="purchase-input-grid">
            {amountInput(downPayment, setDownPayment, "Down Payment", <DollarSign size={18} />)}
            {amountInput(tradeIn, setTradeIn, "Trade-In / Credit", <CreditCard size={18} />)}
            <TextField icon={<DollarSign size={18} />} label="APR (%)" min="0" onChange={(event) => setApr(event.target.value)} placeholder="6.9" required step="0.01" type="number" value={apr} />
            <GlassSelect icon={<CalendarClock size={18} />} label="Loan Term" onChange={setLoanTerm} options={[12, 24, 36, 48, 60, 72, 84].map((months) => ({ value: String(months), label: `${months} months` }))} placeholder="Choose term" value={loanTerm} />
          </div>
          {(down < 0 || trade < 0 || down + trade > price) && <p className="purchase-error">Down payment and trade-in credit must be non-negative and cannot exceed the purchase price.</p>}
          {loan && principal >= 0 && (
            <div className="purchase-calculation">
              <dl className="purchase-summary">
                <SummaryLine label="Amount financed" value={formatMoney(principal)} />
                <SummaryLine label="Monthly payment" value={formatMoney(loan.monthlyPayment)} strong />
                <SummaryLine label="Total payments" value={formatMoney(loan.totalPayments)} />
                <SummaryLine label="Down payment" value={formatMoney(down)} />
                <SummaryLine label="Trade-in / credit" value={formatMoney(trade)} />
                <SummaryLine label="Total interest" value={formatMoney(loan.totalInterest)} />
                <SummaryLine label="Total cost" value={formatMoney(financeTotalCost)} strong />
              </dl>
              <div className="purchase-result-row"><StatusPill status={financeStatus} /><span>{snapshot?.monthlySurplus === null || snapshot?.monthlySurplus === undefined ? "Add recent income and expense transactions to assess payment comfort." : `Estimated monthly surplus after known expenses and dated goal pacing: ${formatMoney(snapshot.monthlySurplus)} before this payment.`}{snapshot?.budgetHeadroom !== null && snapshot?.budgetHeadroom !== undefined && loan.monthlyPayment > snapshot.budgetHeadroom ? ` The payment is above your current budget headroom of ${formatMoney(snapshot.budgetHeadroom)}.` : ""}</span></div>
            </div>
          )}
          {!loan && <p className="purchase-footnote">Enter a valid down payment, trade-in credit, APR, and loan term to calculate payments. A 0% APR is supported.</p>}
        </GlassCard>
      )}

      {method === "lease" && hasPrice && (
        <GlassCard className="purchase-card" variant="elevated">
          <div className="purchase-section-heading">
            <span className="purchase-step">03</span>
            <div><h2>Lease details</h2><p>Lease cost and ownership cost are different.</p></div>
          </div>
          <div className="purchase-input-grid">
            {amountInput(leaseDue, setLeaseDue, "Due at Signing / Down Payment", <DollarSign size={18} />)}
            {amountInput(leasePayment, setLeasePayment, "Monthly Payment", <CreditCard size={18} />)}
            <GlassSelect icon={<CalendarClock size={18} />} label="Lease Term" onChange={setLeaseTerm} options={[24, 36, 39, 48].map((months) => ({ value: String(months), label: `${months} months` }))} placeholder="Choose term" value={leaseTerm} />
            <TextField icon={<ShoppingBag size={18} />} label="Annual Mileage" min="0" onChange={(event) => setMileage(event.target.value)} placeholder="e.g. 12,000" step="1000" type="number" value={mileage} />
            <TextField icon={<DollarSign size={18} />} label="Optional Buyout / Residual" min="0" onChange={(event) => setBuyout(event.target.value)} placeholder="Leave blank if unknown" step="0.01" type="number" value={buyout} />
          </div>
          {(leaseUpfront < 0 || leaseMonthly < 0 || (mileage !== "" && numeric(mileage) < 0) || (buyout !== "" && numeric(buyout) < 0)) && <p className="purchase-error">Lease amounts and mileage must be zero or greater.</p>}
          {leaseComplete && (
            <div className="purchase-calculation">
              <dl className="purchase-summary">
                <SummaryLine label="Due at signing" value={formatMoney(leaseUpfront)} />
                <SummaryLine label="Monthly payment" value={formatMoney(leaseMonthly)} />
                <SummaryLine label="Total lease payments" value={formatMoney(totalLeasePayments)} />
                <SummaryLine label="Total known lease cost" value={formatMoney(leaseTotalCost)} strong />
                {buyout !== "" && <SummaryLine label="Total cost to own after buyout" value={formatMoney(leaseCostToOwn)} strong />}
                {mileage !== "" && <SummaryLine label="Annual mileage allowance" value={`${Number(mileage).toLocaleString("en-US")} mi`} />}
              </dl>
              <p className="purchase-footnote">Known lease cost excludes taxes, fees, mileage charges, and end-of-lease charges not entered here. A buyout is only included when you provide one.</p>
              <div className="purchase-result-row"><StatusPill status={leaseStatus} /><span>{snapshot?.monthlySurplus === null || snapshot?.monthlySurplus === undefined ? "Add recent income and expense transactions to assess payment comfort." : `Estimated monthly surplus after known expenses and dated goal pacing: ${formatMoney(snapshot.monthlySurplus)} before this payment.`}{snapshot?.budgetHeadroom !== null && snapshot?.budgetHeadroom !== undefined && leaseMonthly > snapshot.budgetHeadroom ? ` The payment is above your current budget headroom of ${formatMoney(snapshot.budgetHeadroom)}.` : ""}</span></div>
            </div>
          )}
        </GlassCard>
      )}

      {method && hasPrice && (
        <GlassCard className="purchase-card purchase-options-card">
          <div className="purchase-section-heading">
            <span className="purchase-step">04</span>
            <div><h2>Purchase options</h2><p>Compare upfront cash, monthly impact, total cost, and ownership.</p></div>
          </div>
          <div className="purchase-options">
            <OptionCard title="Cash" upfront={formatMoney(price)} monthly={formatMoney(0)} total={formatMoney(price)} savings={savingsAfterCash === null ? "Not enough information" : formatMoney(savingsAfterCash)} budgetImpact="One-time savings impact; no monthly payment" ownership="Yes" status={cashStatus} />
            <OptionCard title="Finance" upfront={formatMoney(down)} monthly={loan ? formatMoney(loan.monthlyPayment) : "Enter loan terms"} total={financeTotalCost === null ? "Enter loan terms" : formatMoney(financeTotalCost)} savings={snapshot?.currentSavings === null || snapshot?.currentSavings === undefined ? "Not enough information" : formatMoney(snapshot.currentSavings - down)} budgetImpact={budgetImpact(loan?.monthlyPayment ?? null, snapshot?.budgetHeadroom ?? null)} ownership="Yes, after repayment" status={loan ? financeStatus : "unknown"} />
            <OptionCard title="Lease" upfront={formatMoney(leaseUpfront)} monthly={leaseComplete ? formatMoney(leaseMonthly) : "Enter lease terms"} total={leaseTotalCost === null ? "Enter lease terms" : `${formatMoney(leaseTotalCost)} known lease cost`} savings={snapshot?.currentSavings === null || snapshot?.currentSavings === undefined ? "Not enough information" : formatMoney(snapshot.currentSavings - leaseUpfront)} budgetImpact={budgetImpact(leaseComplete ? leaseMonthly : null, snapshot?.budgetHeadroom ?? null)} ownership="No, unless bought out" status={leaseComplete ? leaseStatus : "unknown"} />
          </div>
        </GlassCard>
      )}

      {method && hasPrice && (
        <GlassCard className={`purchase-recommendation ${recommendedStatus}`} variant="elevated">
          <div className="purchase-recommendation-heading"><span className="purchase-recommendation-icon">{recommendedStatus === "comfortable" ? <ShieldCheck size={22} /> : recommendedStatus === "unknown" ? <Info size={22} /> : <AlertTriangle size={22} />}</span><div><span>Purchase Analysis</span><h2>{recommendationTitle}</h2></div><StatusPill status={recommendedStatus} /></div>
          <p>{recommendationText}</p>
          {snapshot && <div className="purchase-recommendation-context">
            <span>{snapshot.monthlyIncome === null ? "Income: Not enough information" : `Estimated monthly income: ${formatMoney(snapshot.monthlyIncome)}`}</span>
            <span>{snapshot.monthlyObligations === null ? "Known monthly outflows: Not enough information" : `Known monthly outflows: ${formatMoney(snapshot.monthlyObligations)}`}</span>
            <span>{snapshot.budgetHeadroom === null ? "Budget headroom: no current budgets" : `Current budget headroom: ${formatMoney(snapshot.budgetHeadroom)}`}</span>
            <span>{snapshot.upcomingRecurringExpenses === null ? "Upcoming recurring payments: not available" : `Recurring payments due in 30 days: ${formatMoney(snapshot.upcomingRecurringExpenses)}`}</span>
          </div>}
        </GlassCard>
      )}

      {(dataLoading || dataWarnings.length > 0) && (
        <p className="purchase-data-notice" role="status">
          {dataLoading ? "Loading your financial information…" : <><Info size={16} /> {dataWarnings.join(" ")} Comfort analysis may be incomplete; no missing values are estimated.</>}
        </p>
      )}
    </section>
  );
}

function OptionCard({ title, upfront, monthly, total, savings, budgetImpact, ownership, status }: {
  title: string;
  upfront: string;
  monthly: string;
  total: string;
  savings: string;
  budgetImpact: string;
  ownership: string;
  status: AssessmentStatus;
}) {
  return (
    <article className="purchase-option">
      <header><h3>{title}</h3><StatusPill status={status} /></header>
      <dl>
        <SummaryLine label="Upfront cost" value={upfront} />
        <SummaryLine label="Monthly payment" value={monthly} />
        <SummaryLine label="Total known cost" value={total} />
        <SummaryLine label="Balance after upfront" value={savings} />
        <SummaryLine label="Monthly budget impact" value={budgetImpact} />
        <SummaryLine label="Ownership" value={ownership} />
      </dl>
    </article>
  );
}

function budgetImpact(payment: number | null, headroom: number | null) {
  if (payment === null) return headroom === null ? "Enter terms; no current budget data" : `Current headroom: ${formatMoney(headroom)}`;
  if (headroom === null) return `${formatMoney(payment)} / month; no current budget data`;
  return `${formatMoney(payment)} / month vs ${formatMoney(headroom)} headroom`;
}
