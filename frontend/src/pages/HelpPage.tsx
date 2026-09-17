import { useMemo, useState } from "react";
import {
  Bell,
  CircleHelp,
  FileClock,
  Gauge,
  Home,
  Landmark,
  PiggyBank,
  ReceiptText,
  ScanLine,
  Settings,
  Target,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { Page } from "../App";
import { TopBar } from "../components/TopBar";
import { Button, GlassCard } from "../components/ui";

type HelpSection = {
  actions: string[];
  affects: string;
  examples: string[];
  howItWorks: string;
  icon: LucideIcon;
  id: string;
  page?: Page;
  steps: string[];
  title: string;
  useWhen: string;
  whatFor: string;
};

type HelpPageProps = {
  onNavigate: (page: Page) => void;
};

const HELP_SECTIONS: HelpSection[] = [
  {
    actions: ["Scan receipt reads an image for review.", "Save split saves the editable bill.", "Record bill as paid deducts the bank charge once.", "Payment received records or reverses a friend's repayment."],
    affects: "Bank payments appear as expenses. Repayments credit the original paying account as Refund income. Cash tips are included in shares but excluded from the bank charge.",
    examples: ["Assign a $15 burger to you, $6 fries to a friend, and a $20 pizza to both.", "Override a $20.80 share with $25 received to track a $4.20 overpayment."],
    howItWorks: "Shared items are divided equally among their selected people. Tax and tip follow each person's subtotal, with leftover cents allocated so the shares add up exactly.",
    icon: ReceiptText,
    id: "split-bill",
    page: "split",
    steps: ["Open Split Bill from the menu.", "Enter or scan a receipt and add friends.", "Assign every item and verify the receipt total including tip.", "Choose the bank account and whether the tip was paid by bank or cash.", "Save the split, then record payment.", "Use repayment checkboxes and actual amounts as friends pay you back."],
    title: "Split Bill",
    useWhen: "Use this when you cover a restaurant or shopping bill for a group.",
    whatFor: "Calculates each person's share and tracks the money you paid and received back.",
  },
  {
    actions: ["Get Started starts first-time setup.", "Skip Setup lets you enter the app and add records later.", "Continue saves each completed setup step."],
    affects: "Setup creates real accounts, income, budgets, goals, and bills. Those records immediately feed Home, Budgets, Goals, Reports, and Notifications.",
    examples: ["Create Chase Checking with $1,200.", "Add monthly income of $3,500.", "Create an Emergency Fund goal."],
    howItWorks: "The onboarding flow writes to the same account, transaction, budget, savings goal, and recurring bill data used everywhere else.",
    icon: CircleHelp,
    id: "getting-started",
    page: "dashboard",
    steps: ["Create or log in to your profile.", "Complete setup or skip it.", "Add at least one account.", "Record income and expenses as they happen."],
    title: "Getting Started",
    useWhen: "Use this when you are new or want to understand the fastest path to a useful dashboard.",
    whatFor: "Helps you set up the app so every page has real financial data to work with.",
  },
  {
    actions: ["Add opens the Add Transaction page.", "View in Budgets opens budget details.", "View in Savings Goals opens goal planning.", "Manage in Upcoming Bills opens recurring reminders."],
    affects: "Home is a summary only. It changes automatically when accounts, transactions, budgets, goals, or recurring bills change.",
    examples: ["After importing a salary and two expenses, Home updates income, spent, balance, recent transactions, budget progress, and alerts."],
    howItWorks: "Home reads centralized account, transaction, budget, recurring bill, and savings goal data. It does not store separate totals.",
    icon: Home,
    id: "dashboard",
    page: "dashboard",
    steps: ["Review available balance.", "Check income and spending.", "Scan recent transactions.", "Open the section that needs attention."],
    title: "Dashboard",
    useWhen: "Use it for a quick daily financial overview.",
    whatFor: "Shows your most important financial status at a glance.",
  },
  {
    actions: ["+ Add Account opens account creation in Settings.", "View selects an account and shows detail.", "Manage Accounts jumps to account settings."],
    affects: "Account balances change when income or expense transactions are saved, edited, deleted, or imported.",
    examples: ["A $40 grocery expense lowers checking by $40.", "A $2,400 salary import raises the selected account by $2,400."],
    howItWorks: "Current balance is calculated from starting balance plus income minus expenses.",
    icon: WalletCards,
    id: "accounts",
    page: "accounts",
    steps: ["Open Accounts from the 3-line menu.", "Review Total Balance, Available Cash, and Credit Debt.", "Select an account with View.", "Add or manage accounts in Settings."],
    title: "Accounts",
    useWhen: "Use it when you want a full account-management area instead of the quick Home summary.",
    whatFor: "Tracks bank, savings, credit, and cash account balances.",
  },
  {
    actions: ["Search filters by merchant, category, or account.", "Type filters All, Income, or Expenses.", "Source filters Receipt, Bank CSV, Bank PDF, or Manual.", "Click a transaction to edit it.", "Save Changes updates the original transaction."],
    affects: "Editing a transaction recalculates account balances, budgets, reports, dashboard, and savings goal actuals.",
    examples: ["Change a Walmart transaction from Shopping to Groceries so the grocery budget updates correctly."],
    howItWorks: "Transactions are the central source of truth for spending, income, balances, budgets, reports, and goal contributions.",
    icon: ReceiptText,
    id: "transactions",
    page: "transactions",
    steps: ["Open Transactions from the 3-line menu.", "Use filters to find a record.", "Click the row.", "Edit amount, category, date, type, or account.", "Save changes."],
    title: "Transactions",
    useWhen: "Use it to review, correct, or audit your transaction history.",
    whatFor: "Provides a chronological history grouped by month.",
  },
  {
    actions: ["Create Budget opens the budget modal.", "Category chooses what to limit.", "Amount sets planned spending.", "Edit changes a budget.", "Delete removes a budget.", "Spending Plan targets adjust 50/30/20 percentages."],
    affects: "Actual spending comes from transactions and imports. Budgets do not create spending; they measure it.",
    examples: ["A $50 Grocery transaction increases actual Grocery spending and reduces remaining Grocery budget."],
    howItWorks: "Budget equals planned amount. Transaction data equals actual spending. Progress and alerts update from real transactions.",
    icon: Landmark,
    id: "budgets",
    page: "budgets",
    steps: ["Choose the month.", "Create category budgets.", "Compare budgeted vs actual spending.", "Review alerts and projections."],
    title: "Budgets",
    useWhen: "Use it to plan monthly spending and catch overspending early.",
    whatFor: "Shows planned spending, actual spending, remaining budget, and 50/30/20 guidance.",
  },
  {
    actions: ["Add Goal opens goal creation.", "Completed checkbox marks a monthly goal row.", "Delete Goal removes the goal after confirmation."],
    affects: "Savings transactions update actual saved and can change progress, monthly carryover, and projected completion.",
    examples: ["If your monthly target is $200 and you save $150, next month carries $50 forward.", "If you save $250, next month can require $50 less."],
    howItWorks: "The app calculates target remaining divided by months remaining and compares it to recorded savings contributions.",
    icon: Target,
    id: "savings-goals",
    page: "goals",
    steps: ["Create a goal with target, current saved, deadline, and income.", "Review the monthly plan.", "Record savings transactions.", "Check progress and projected completion."],
    title: "Savings Goals",
    useWhen: "Use it when saving for an emergency fund, trip, car, laptop, or any planned purchase.",
    whatFor: "Turns a goal into a monthly savings plan with carryover.",
  },
  {
    actions: ["Cash analyzes paying now.", "Finance calculates amortized loan payments.", "Lease calculates known lease costs.", "Payment method cards reveal relevant fields."],
    affects: "The analyzer reads your accounts, income, spending, budgets, recurring bills, and goals to judge comfort.",
    examples: ["A $1,000 purchase may be affordable but tight if it drops savings below your known buffer."],
    howItWorks: "It compares upfront cost, monthly payment, total cost, savings impact, and monthly cash flow.",
    icon: Gauge,
    id: "afford",
    page: "afford",
    steps: ["Enter item name and price.", "Choose Cash, Finance, or Lease.", "Fill only the fields shown.", "Read the Purchase Analysis recommendation."],
    title: "Can I Afford It?",
    useWhen: "Use it before a major purchase.",
    whatFor: "Helps decide whether to buy, finance, lease, or wait.",
  },
  {
    actions: ["Add recurring bill opens the bill modal.", "Auto-pay records whether it pays automatically.", "Reminder settings choose notification timing.", "Edit and delete manage existing reminders."],
    affects: "Recurring bills feed Dashboard upcoming bills, bell notifications, budget pressure, and affordability calculations.",
    examples: ["Netflix imported from CSV can become a monthly reminder if you accept the prompt."],
    howItWorks: "A recurring record is not marked paid just because time passes. Imported or saved matching transactions mark the cycle paid.",
    icon: FileClock,
    id: "recurring",
    page: "recurring",
    steps: ["Add name, amount, frequency, due date, account, category, auto-pay, and reminders.", "Watch Dashboard and bell notifications.", "Import bank transactions to match payments."],
    title: "Recurring Transactions",
    useWhen: "Use it for subscriptions, rent, utilities, debt payments, and recurring income.",
    whatFor: "Tracks bills and subscriptions so you do not miss upcoming payments.",
  },
  {
    actions: ["Month navigation changes the reporting month.", "Income vs Expenses donut shows net cash flow.", "Hover or tap chart segments for details."],
    affects: "Reports update whenever transactions change or imports are confirmed.",
    examples: ["Importing September bank CSV changes September income, expenses, and net cash flow."],
    howItWorks: "Reports summarize transactions for the selected month only.",
    icon: TrendingUp,
    id: "reports",
    page: "reports",
    steps: ["Choose the reporting month.", "Review income, expenses, and net cash flow.", "Use the donut and cards to understand trends."],
    title: "Reports",
    useWhen: "Use it to review monthly performance.",
    whatFor: "Shows monthly income, expenses, net cash flow, and spending patterns.",
  },
  {
    actions: ["Bell opens notifications.", "Mark as read clears one notification.", "Mark all as read clears all current notifications."],
    affects: "Notifications are generated from budgets, recurring bills, subscription reminders, and financial insights.",
    examples: ["Food & Dining reaches 85% of budget.", "Spotify is due tomorrow."],
    howItWorks: "The shared bell reads app data and shows alerts without navigating away from the current page.",
    icon: Bell,
    id: "notifications",
    steps: ["Click the bell in the top bar.", "Read budget and bill alerts.", "Mark notifications as read."],
    title: "Notifications",
    useWhen: "Use it when you want to see what needs attention now.",
    whatFor: "Surfaces budget alerts, upcoming bills, savings milestones, spending insights, and sync warnings.",
  },
  {
    actions: ["Take Photo opens mobile camera when supported.", "Upload Receipt accepts image upload or drag-and-drop.", "Import Bank CSV opens CSV mapping and review.", "Import Bank PDF stages a PDF for parser integration.", "Save Transaction/Import saves only after review."],
    affects: "Confirmed imports create transactions. Those transactions update accounts, budgets, dashboard, reports, goals, and subscription detection.",
    examples: ["Kroger receipt suggests Groceries.", "Netflix CSV row can suggest a recurring subscription reminder."],
    howItWorks: "Receipts and statements enter review first. Categories and accounts remain editable. The app never silently creates reminders; you confirm them.",
    icon: ScanLine,
    id: "receipt-import",
    page: "add",
    steps: ["Open Add.", "Choose Take Photo, Upload Receipt, Import Bank CSV, or Import Bank PDF.", "Review extracted or mapped data.", "Confirm save/import."],
    title: "Receipt & Bank Import",
    useWhen: "Use it to avoid manually entering many transactions.",
    whatFor: "Imports receipts, CSV bank files, and statement documents into transaction data.",
  },
  {
    actions: ["Edit Profile changes name, email, occupation, and password.", "Create Account adds a financial account.", "Theme toggle switches Light/Dark.", "Logout signs out.", "Delete Account permanently removes the user login."],
    affects: "Financial accounts created here appear in Accounts, Add Transaction, imports, budgets, reports, and affordability calculations.",
    examples: ["Add Chase Checking here, then select it when importing bank CSV."],
    howItWorks: "Settings manages profile, theme, financial accounts, and account-level actions.",
    icon: Settings,
    id: "settings",
    page: "settings",
    steps: ["Open Settings.", "Edit profile or theme.", "Create or manage financial accounts.", "Use Danger Zone only when you really want deletion."],
    title: "Settings",
    useWhen: "Use it to manage your profile, app appearance, and financial accounts.",
    whatFor: "Controls your user profile and account setup.",
  },
];

export function HelpPage({ onNavigate }: HelpPageProps) {
  const [activeId, setActiveId] = useState(HELP_SECTIONS[0].id);
  const activeSection = useMemo(() => HELP_SECTIONS.find((section) => section.id === activeId) ?? HELP_SECTIONS[0], [activeId]);
  const ActiveIcon = activeSection.icon;

  return (
    <section className="page help-page">
      <TopBar title="Help" />

      <GlassCard className="help-hero" variant="elevated">
        <div>
          <span className="help-eyebrow">Interactive User Guide</span>
          <h1>Learn how Personal Finance Manager works</h1>
          <p>Choose a section to see what each feature does, which buttons matter, when to use it, and how your data flows through the app.</p>
        </div>
      </GlassCard>

      <div className="help-layout">
        <GlassCard className="help-section-nav">
          {HELP_SECTIONS.map((section) => {
            const Icon = section.icon;
            const selected = section.id === activeId;
            return (
              <button aria-current={selected ? "true" : undefined} className={selected ? "selected" : ""} key={section.id} onClick={() => setActiveId(section.id)} type="button">
                <Icon aria-hidden="true" size={18} />
                <span>{section.title}</span>
              </button>
            );
          })}
        </GlassCard>

        <GlassCard className="help-guide-card" variant="elevated">
          <header className="help-guide-header">
            <div className="help-guide-title">
              <span><ActiveIcon aria-hidden="true" size={22} /></span>
              <div>
                <h2>{activeSection.title}</h2>
                <p>{activeSection.whatFor}</p>
              </div>
            </div>
            {activeSection.page && (
              <Button onClick={() => onNavigate(activeSection.page!)}>
                Try it
              </Button>
            )}
          </header>

          <HelpBlock title="How To Use It" items={activeSection.steps} ordered />
          <HelpBlock title="Important Buttons & Actions" items={activeSection.actions} />

          <div className="help-detail-grid">
            <GlassCard variant="subtle">
              <h3>How it works</h3>
              <p>{activeSection.howItWorks}</p>
            </GlassCard>
            <GlassCard variant="subtle">
              <h3>When to use it</h3>
              <p>{activeSection.useWhen}</p>
            </GlassCard>
            <GlassCard variant="subtle">
              <h3>How it affects the app</h3>
              <p>{activeSection.affects}</p>
            </GlassCard>
          </div>

          <HelpBlock title="Examples" items={activeSection.examples} />
        </GlassCard>
      </div>

      <GlassCard className="help-data-flow" variant="elevated">
        <div>
          <h2>How Your Data Flows</h2>
          <p>Transactions are the main source of truth. When you add, edit, delete, scan, or import transactions, the rest of the app recalculates from that shared data.</p>
        </div>
        <div className="help-flow-steps">
          {[
            ["1", "Add or import data", "Manual entry, receipt scan, CSV import, and PDF statement import all lead to review before saving."],
            ["2", "Save transactions", "Confirmed transactions store amount, type, category, date, account, note, source, and receipt details when available."],
            ["3", "Balances update", "Income increases the selected account. Expenses reduce it. Account pages and Home read the recalculated balance."],
            ["4", "Budgets and reports update", "Budget actuals, monthly reports, charts, and net cash flow all recalculate from saved transactions."],
            ["5", "Goals and subscriptions react", "Savings contributions update goal progress. Recurring merchants can become reminders only after you confirm."],
          ].map(([step, title, copy]) => (
            <div className="help-flow-step" key={step}>
              <span>{step}</span>
              <strong>{title}</strong>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </section>
  );
}

function HelpBlock({ items, ordered = false, title }: { items: string[]; ordered?: boolean; title: string }) {
  const List = ordered ? "ol" : "ul";
  return (
    <section className="help-block">
      <h3>{title}</h3>
      <List>
        {items.map((item) => <li key={item}>{item}</li>)}
      </List>
    </section>
  );
}
